import { describe, expect, it } from 'vitest';
import { StorageSafetyCoordinator, LEDGER_KEY, STORAGE_KEY, RECOVERY_KEYS, transition, type Phase, type RecordEntry } from './storage-safety/coordinator';
import { FaultStore, isLedgerPhase, memoryExclusive } from './storage-safety/adapter';
import { setup, base, history } from './helpers/selective-safety-fixture';
import { preserveRestoreSource, restoreRaw } from '../lib/restore-storage';

function fixture(hook: (phase: Phase) => void | Promise<void> = () => {}, store = new FaultStore(), lock = memoryExclusive()) {
  const f = setup(), candidate = f.candidate(), original = f.context.currentRaw!;
  store.values.set(STORAGE_KEY, original);
  store.values.set('unrelated', 'retained');
  const context = { ...f.context, selectedKeys: [...f.context.selectedKeys] };
  const c = new StorageSafetyCoordinator(store, lock, hook);
  const read = () => ({ ...context, currentRaw: store.getItem(STORAGE_KEY) });
  return { store, original, candidate, context, c, read, run: () => c.selection('op-1', candidate, read) };
}
const writes = (s: FaultStore) => s.trace.filter(a => a.key === STORAGE_KEY && a.op === 'set' && a.at === 'before');
const copyRecord = (raw: string) => JSON.stringify({ format: 'calculator-memo-recovery', version: 1, sourceKey: STORAGE_KEY, createdAt: '2026-11-05T00:00:00Z', raw, utf16CodeUnits: raw.length });

describe('Stage 3B-1 model: no inferred or terminal success', () => {
  const seed: RecordEntry = { id: 'model', kind: 'selection', phase: 'NEW', history: ['NEW'], original: '{}', candidate: '{}', attempted: false, executionAllowed: false };
  it('rejects skipping preservation, readback and terminal transitions', () => {
    expect(() => transition(seed, 'OBSERVED_MATCH')).toThrow();
    expect(() => transition(seed, 'WRITING')).toThrow();
    for (const phase of ['REFUSED','UNKNOWN'] as const) {
      const terminal = transition(seed, phase, 'first');
      expect(() => transition(terminal, 'CHECKING')).toThrow();
      expect(() => transition(terminal, 'OBSERVED_MATCH')).toThrow();
      expect(terminal.firstFailure).toEqual({ phase: 'NEW', reason: 'first' });
    }
  });
  it('cannot classify an attempted write as pre-write refusal', () => {
    expect(() => transition({ ...seed, phase: 'WRITING', attempted: true }, 'REFUSED', 'later')).toThrow();
  });
});

describe('real adapter writes and preserved bytes', () => {
  it('preserves exact source, single primary write, records all transitions, remains product-disabled', async () => {
    const f = fixture(); const r = await f.run();
    expect(r.phase).toBe('OBSERVED_MATCH'); expect(r.assurance).toBe('COOPERATIVE_OBSERVATION_ONLY');
    expect(r.executionAllowed).toBe(false); expect(writes(f.store)).toHaveLength(1);
    expect(f.store.getItem(STORAGE_KEY)).toBe(f.candidate.raw);
    expect(r.record!.copy!.raw).toBe(f.original);
    expect(f.store.getItem(r.record!.copy!.key)).toBe(r.record!.copy!.serialized);
    expect(r.record!.history).toEqual(['NEW','CHECKING','PRESERVING','PRESERVED','PREPARING','WRITING','READING','OBSERVED_MATCH']);
    expect(f.store.getItem('unrelated')).toBe('retained');
    expect(f.c.inspect()[0].phase).toBe('OBSERVED_MATCH');
    expect((await f.run()).phase).toBe('REFUSED'); expect(writes(f.store)).toHaveLength(1);
  });
  it('reuses only strictly read-back matching copies without modifying any occupied slot', async () => {
    const f = fixture(); const saved = copyRecord(f.original); f.store.values.set(RECOVERY_KEYS[3], saved);
    expect((await f.run()).phase).toBe('OBSERVED_MATCH');
    expect(f.store.getItem(RECOVERY_KEYS[3])).toBe(saved);
    expect(f.store.trace.some(a => RECOVERY_KEYS.includes(a.key) && a.op === 'set')).toBe(false);
  });
  it.each(['generation','backup','selection','unsaved','reference','current','version','candidate'])( 'refuses changed %s before preservation', async fault => {
    const f = fixture();
    if (fault === 'generation') f.context.generation++;
    if (fault === 'backup') f.context.backupText += ' ';
    if (fault === 'selection') f.context.selectedKeys = [];
    if (fault === 'unsaved') f.context.unsaved = true;
    if (fault === 'reference') f.context.blockedReason = 'unknown reference';
    if (fault === 'current') f.store.values.set(STORAGE_KEY, JSON.stringify({ ...base, history: [history('changed')] }));
    if (fault === 'version') f.context.planRuleVersion++;
    if (fault === 'candidate') f.candidate.raw += ' ';
    expect((await f.run()).phase).toBe('REFUSED'); expect(writes(f.store)).toHaveLength(0);
    expect(f.store.trace.some(a => a.op === 'set' && RECOVERY_KEYS.includes(a.key))).toBe(false);
  });
  it.each(['full','capacity','corrupt'])('refuses preservation %s and retains old copies', async mode => {
    const f = fixture();
    if (mode === 'full') RECOVERY_KEYS.forEach((k,i) => f.store.values.set(k, copyRecord(`old-${i}`)));
    if (mode === 'capacity') {
      // Derive from serialized record sizes: occupied total is below 4Mi,
      // adding the actual next record crosses it (not an assumed raw size).
      const overhead = copyRecord('').length;
      const n = Math.floor((4*1024*1024 - 100) / 4) - overhead;
      for (let i=0;i<4;i++) f.store.values.set(RECOVERY_KEYS[i], copyRecord('x'.repeat(n-1) + i));
      expect(RECOVERY_KEYS.reduce((n,k)=>n+(f.store.values.get(k)?.length??0),0)).toBeLessThan(4*1024*1024);
    }
    if (mode === 'corrupt') f.store.values.set(RECOVERY_KEYS[0], 'broken');
    const before = RECOVERY_KEYS.map(k => f.store.values.get(k));
    expect((await f.run()).phase).toBe('REFUSED'); expect(writes(f.store)).toHaveLength(0);
    expect(RECOVERY_KEYS.map(k => f.store.values.get(k))).toEqual(before);
  });
  it.each(['quota','throw-after','drop','mismatch','read-exception'])('preservation %s cannot reach primary write', async mode => {
    const f = fixture();
    const fault = f.store.inject(a => a.key === RECOVERY_KEYS[0] && a.op === 'set' && a.at === (mode === 'quota' ? 'before' : 'after'), (s,a) => {
      if (mode === 'quota') throw new DOMException('full', 'QuotaExceededError');
      if (mode === 'throw-after') throw Error('preserve wrote then threw');
      if (mode === 'drop') s.values.delete(a.key);
      if (mode === 'mismatch') s.values.set(a.key, 'different');
      if (mode === 'read-exception') s.inject(x => x.op === 'get' && x.key === a.key, () => { throw Error('copy read failed'); });
    });
    expect((await f.run()).phase).toBe('REFUSED'); expect(fault.fired).toBe(1); expect(writes(f.store)).toHaveLength(0);
    expect(f.store.getItem(STORAGE_KEY)).toBe(f.original);
  });
  it.each(['before','after','mismatch','read-error'])('primary %s failure is UNKNOWN, never rollback/retry', async mode => {
    const f = fixture();
    const fault = f.store.inject(a => a.key === STORAGE_KEY && a.op === 'set' && a.at === (mode === 'before' ? 'before' : 'after'), s => {
      if (mode === 'before' || mode === 'after') throw Error(`primary ${mode}`);
      if (mode === 'mismatch') s.values.set(STORAGE_KEY, 'other writer');
      if (mode === 'read-error') s.inject(a => a.op === 'get' && a.key === STORAGE_KEY, () => { throw Error('primary read failed'); });
    });
    const result = await f.run();
    expect(result.phase).toBe('UNKNOWN'); expect(fault.fired).toBe(1); expect(result.record!.attempted).toBe(true);
    expect(writes(f.store)).toHaveLength(1);
    expect((await f.run()).phase).toBe('REFUSED');
    expect((await f.c.ordinary('new-id', f.original, f.original)).phase).toBe('REFUSED');
    expect(writes(f.store)).toHaveLength(1);
  });
  it('ledger write failure refuses before current IO; no assumed durable intent', async () => {
    const f=fixture(); const fault=f.store.inject(a=>a.key===LEDGER_KEY && a.op==='set',()=>{throw Error('journal quota');});
    expect((await f.run()).phase).toBe('REFUSED'); expect(fault.fired).toBe(1); expect(writes(f.store)).toHaveLength(0);
  });
  it('result journal failure after matching bytes remains UNKNOWN', async () => {
    const f=fixture(); const fault=f.store.inject(isLedgerPhase('OBSERVED_MATCH'),()=>{throw Error('result journal failed');});
    expect((await f.run()).phase).toBe('UNKNOWN'); expect(fault.fired).toBe(1);
    expect(f.store.getItem(STORAGE_KEY)).toBe(f.candidate.raw); expect(writes(f.store)).toHaveLength(1);
  });
});

describe('cooperation and limits are distinct observations', () => {
  it.each(['PRESERVED','WRITING'] as Phase[])('known lock loss during %s fences a delayed writer before any primary IO', async phase => {
    let release!: () => void, lost!: (e: Error) => void, ready!: () => void;
    let background: Promise<unknown> | undefined;
    const held = new Promise<void>(r=>ready=r);
    const f=fixture(async p=>{if(p===phase){ready();await new Promise<void>(r=>release=r);}},new FaultStore(),async work=>{
      background=work();
      return await Promise.race([background,new Promise<never>((_,reject)=>lost=reject)]) as Awaited<ReturnType<typeof work>>;
    });
    const pending=f.run();await held;lost(Error('lock ownership revoked'));
    const result=await pending;
    expect(result.phase).toBe(phase==='WRITING'?'UNKNOWN':'REFUSED');
    release();await background;
    expect(writes(f.store)).toHaveLength(0);
    expect(f.store.getItem(STORAGE_KEY)).toBe(f.original);
    expect((await f.c.ordinary('new',f.original,f.original)).phase).toBe('REFUSED');
  });
  it('ordinary synthetic writer uses preservation, single write and readback after selection completes', async () => {
    const f=fixture(); expect((await f.run()).phase).toBe('OBSERVED_MATCH');
    const r=await f.c.ordinary('ordinary-after',f.candidate.raw!,f.original);
    expect(r.phase).toBe('OBSERVED_MATCH');expect(r.record!.copy!.raw).toBe(f.candidate.raw);
    expect(writes(f.store)).toHaveLength(2);expect(f.store.getItem(STORAGE_KEY)).toBe(f.original);
  });
  it('lock lifecycle rejection after work is UNKNOWN with matching outer/record states and local HOLD', async () => {
    const f=fixture(()=>{},new FaultStore(),async work=>{await work();throw Error('release failed');});
    const r=await f.run();expect(r.phase).toBe('UNKNOWN');expect(r.record!.phase).toBe('UNKNOWN');
    expect(r.record!.firstFailure?.reason).toContain('release failed');
    expect((await f.c.ordinary('next',f.candidate.raw!,f.original)).phase).toBe('REFUSED');
  });
  it('same-tab and shared-lock other-tab ordinary writers cannot run during restore', async () => {
    const s=new FaultStore(), lock=memoryExclusive(); let same: string|undefined, other: string|undefined;
    const f=fixture(async p=>{ if(p==='PRESERVED') {
      same=(await f.c.ordinary('ordinary-same',f.original,f.original)).phase;
      other=(await new StorageSafetyCoordinator(s,lock).ordinary('ordinary-other',f.original,f.original)).phase;
    }},s,lock);
    expect((await f.run()).phase).toBe('OBSERVED_MATCH'); expect([same,other]).toEqual(['REFUSED','REFUSED']); expect(writes(s)).toHaveLength(1);
  });
  it('lock acquisition exception cannot preserve or write', async () => {
    const f=fixture(()=>{},new FaultStore(),async()=>{throw Error('lock acquisition failed');});
    expect((await f.run()).phase).toBe('REFUSED'); expect(f.store.trace.filter(a=>a.op==='set')).toHaveLength(0);
  });
  it.each(['same-tab','other-tab','notified-ABA'])('rejects observed %s changes after preservation', async mode => {
    const f=fixture(p=>{if(p==='PRESERVED') {
      if(mode==='notified-ABA') { f.store.values.set(STORAGE_KEY,'B'); f.store.values.set(STORAGE_KEY,f.original); f.context.epoch++; }
      else f.store.values.set(STORAGE_KEY,`changed-${mode}`);
    }});
    expect((await f.run()).phase).toBe('REFUSED'); expect(writes(f.store)).toHaveLength(0);
  });
  it('detects change after intent before write as UNKNOWN with zero primary invocations', async () => {
    const f=fixture(p=>{if(p==='WRITING')f.store.values.set(STORAGE_KEY,'changed-after-intent');});
    expect((await f.run()).phase).toBe('UNKNOWN'); expect(writes(f.store)).toHaveLength(0);
  });
  it('unnotified ABA is not detectable: matching observation does NOT certify absence of conflict', async () => {
    const f=fixture(p=>{if(p==='PRESERVED'){f.store.values.set(STORAGE_KEY,'B');f.store.values.set(STORAGE_KEY,f.original);}});
    const r=await f.run(); expect(r.phase).toBe('OBSERVED_MATCH'); expect(r.assurance).toBe('COOPERATIVE_OBSERVATION_ONLY'); expect(r.executionAllowed).toBe(false);
  });
  it('noncooperative write inside final read/set gap can be overwritten: explicit guarantee failure counterexample', async () => {
    const f=fixture(); const fault=f.store.inject(a=>a.key===STORAGE_KEY&&a.op==='set'&&a.at==='before',s=>s.values.set(STORAGE_KEY,'uncooperative-new-data'));
    const r=await f.run(); expect(fault.fired).toBe(1); expect(r.phase).toBe('OBSERVED_MATCH');
    expect(f.store.getItem(STORAGE_KEY)).toBe(f.candidate.raw); expect(r.executionAllowed).toBe(false);
  });
  it('later change does not mutate historical readback into future/durability assurance', async () => {
    const f=fixture(); const r=await f.run(); f.store.values.set(STORAGE_KEY,'later');
    expect(r.phase).toBe('OBSERVED_MATCH'); expect(f.store.getItem(STORAGE_KEY)).toBe('later'); expect(r.assurance).not.toBe('SUCCESS');
  });
  it('actual existing full-restore helper misses observed ABA, new coordinator rejects identical notified ABA', async () => {
    const old=fixture(); const p=preserveRestoreSource(old.store,old.original); if(!p.ok)throw Error('fixture');
    old.store.values.set(STORAGE_KEY,'B'); old.store.values.set(STORAGE_KEY,old.original); old.context.epoch++;
    const red=restoreRaw(old.store,old.candidate.raw!,old.original,p.copy,()=>true);
    expect(red.status).toBe('verified'); // Not a product defect: old helper relies on caller invalidation.
    const next=fixture(p=>{if(p==='PRESERVED'){next.store.values.set(STORAGE_KEY,'B');next.store.values.set(STORAGE_KEY,next.original);next.context.epoch++;}});
    expect((await next.run()).phase).toBe('REFUSED'); expect(writes(next.store)).toHaveLength(0);
  });
});

describe('interruption, restart and explicitly separate recovery', () => {
  it.each(['PRESERVED','WRITING','READING'] as Phase[])('interruption at %s never inferred successful on restart', async phase => {
    const f=fixture(p=>{if(p===phase)throw Error('interruption');}); const r=await f.run();
    expect(r.phase).toBe(phase==='PRESERVED'?'REFUSED':'UNKNOWN');
    const restarted=new StorageSafetyCoordinator(f.store,memoryExclusive());
    expect((await restarted.selection('fresh',f.candidate,f.read)).phase).toBe(phase==='PRESERVED'?'OBSERVED_MATCH':'REFUSED');
  });
  it('a persisted nonterminal intent remains UNKNOWN even when candidate bytes are already present', async () => {
    const f=fixture(); await f.run();
    const data=JSON.parse(f.store.getItem(LEDGER_KEY)!); const r=data.records[0];
    r.phase='READING'; r.history=r.history.slice(0,-1); f.store.values.set(LEDGER_KEY,JSON.stringify(data));
    const restarted=new StorageSafetyCoordinator(f.store,memoryExclusive());
    expect(restarted.inspect()[0].phase).toBe('UNKNOWN');
    expect((await restarted.selection('different',f.candidate,f.read)).phase).toBe('REFUSED'); expect(writes(f.store)).toHaveLength(1);
  });
  it.each(['approval','copy-changed','recovery-write-fails','ok'])('manual recovery %s retains first failure and separate result', async mode => {
    const f=fixture(); f.store.inject(a=>a.key===STORAGE_KEY&&a.op==='set'&&a.at==='after',()=>{throw Error('original-first-failure');});
    const originalResult=await f.run(); expect(originalResult.phase).toBe('UNKNOWN');
    const first=JSON.stringify(f.c.inspect()[0]);
    if(mode==='copy-changed') f.store.values.set(originalResult.record!.copy!.key,'corrupt');
    const fault= mode==='recovery-write-fails' ? f.store.inject(a=>a.key===STORAGE_KEY&&a.op==='set'&&a.at==='before',()=>{throw Error('recovery-failed');}) : undefined;
    const result=await f.c.recover('recovery-1','op-1',f.store.getItem(STORAGE_KEY),mode!=='approval');
    expect(result.phase).toBe(mode==='ok'?'OBSERVED_MATCH':mode==='recovery-write-fails'?'UNKNOWN':'REFUSED');
    if(fault) expect(fault.fired).toBe(1);
    expect(JSON.stringify(f.c.inspect().find(r=>r.id==='op-1'))).toBe(first);
    if(mode==='ok') {
      expect(f.store.getItem(STORAGE_KEY)).toBe(f.original);
      expect(result.record!.kind).toBe('recovery'); expect(result.record!.recoveryOf).toBe('op-1');
      expect((await f.c.ordinary('ordinary',f.original,f.original)).phase).toBe('REFUSED');
    }
  });
  it('corrupt or forged SUCCESS ledger cannot unlock writers', async () => {
    const f=fixture(); f.store.values.set(LEDGER_KEY,JSON.stringify({version:1,records:[{id:'forged',phase:'OBSERVED_MATCH',history:['NEW','OBSERVED_MATCH']}]}));
    expect((await f.run()).phase).toBe('REFUSED'); expect(writes(f.store)).toHaveLength(0);
  });
});
