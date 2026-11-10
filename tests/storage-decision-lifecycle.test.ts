import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { canonical, createDecisionLifecycle, describeDecision, type Observation } from '../e2e/fixtures/storage-decision-lifecycle';
const fixture = (): Observation => ({
  request: { scope: { source: 'stage3b5-test-lifecycle', destination: 'stage3b4-test-lifecycle' },
    capture: { source: { kind: 'present', value: '{"version":1,"history":[],"notes":[],"settings":{"theme":"light","activePanel":"history"}}' }, target: { kind: 'absent' }, journal: { kind: 'absent' } } },
  revision: 'r1', generation: 0, authority: { status: 'NOT_ESTABLISHED', revision: 'a1' },
  backups: [{ id: 'backup1', revision: 'b1', raw: 'synthetic backup' }], selection: { ids: [], policy: 'all-evidence' },
});
const mutations: [string, (x: Observation) => void][] = [
  ['source', x => { x.request.capture.source = { kind: 'present', value: 'changed synthetic' }; }],
  ['backup', x => { x.backups[0].raw = 'changed'; }],
  ['backup-delete', x => { x.backups = []; }],
  ['backup-absence', x => { x.backups[0].raw = null; }],
  ['generation', x => { x.generation++; }],
  ['revision', x => { x.revision = 'r2'; }],
  ['authority', x => { x.authority.revision = 'a2'; }],
  ['selection', x => { x.selection.ids = ['item1']; }],
  ['policy', x => { x.selection.policy = 'other'; }],
  ['receipt', x => { x.request.previous = structuredClone(x.request.capture); }],
];
describe('Stage 3B evidence freshness, synthetic only', () => {
  it('starts UNKNOWN; generates bound report and gates review, never execution', async () => {
    const s = createDecisionLifecycle(async () => fixture());
    expect(s.view().status).toBe('UNKNOWN');
    const v = await s.generate();
    expect(v.status).toBe('VALID');
    expect(v.sheet?.diagnosticState).toBe('INCOMPLETE'); // freshness is not diagnostic PASS
    expect(await s.useForReview(v.id)).toMatchObject({ allowed: true, view: { HOLD: true, writeAllowed: false, executionAllowed: false } });
    expect(v.sheet).toMatchObject({ authority: 'NOT_ESTABLISHED', selectedCandidate: null });
    expect(JSON.stringify(v)).not.toContain('synthetic backup');
  });
  it.each(mutations)('invalidates %s without events at use time', async (_, mutate) => {
    const x = fixture(), s = createDecisionLifecycle(async () => x), v = await s.generate();
    mutate(x);
    const result = await s.useForReview(v.id);
    expect(result.allowed).toBe(false); expect(result.view.status).toBe('STALE'); expect(result.view.changed.length).toBeGreaterThan(0);
    expect(describeDecision(result.view).reusable).toBe(false);
  });
  it('read failure is sticky UNKNOWN even after recovery, explicit generation makes a new id', async () => {
    let fail = false; const s = createDecisionLifecycle(async () => { if (fail) throw Error('secret raw data'); return fixture(); });
    const before = await s.generate(); fail = true;
    expect((await s.useForReview(before.id)).view.status).toBe('UNKNOWN'); fail = false;
    expect((await s.useForReview(before.id)).allowed).toBe(false);
    const after = await s.generate(); expect(after.id).not.toBe(before.id); expect(after.status).toBe('VALID');
    expect((await s.useForReview(before.id)).allowed).toBe(false);
    expect(JSON.stringify(after)).not.toContain('secret raw data');
  });
  it.each(['relevant', 'unknown'] as const)('notification %s immediately disables cached use', async kind => {
    const s = createDecisionLifecycle(async () => fixture()), v = await s.generate();
    expect(s.notifyChange(kind).reusable).toBe(false);
    expect((await s.useForReview(v.id)).allowed).toBe(false);
  });
  it('proven unrelated hint and unrepresented unrelated state do not invalidate', async () => {
    const s = createDecisionLifecycle(async () => fixture()), v = await s.generate();
    s.notifyChange('unrelated-proven'); expect((await s.useForReview(v.id)).allowed).toBe(true);
  });
  it('observed ABA stays STALE; unobserved ABA is explicitly undetectable', async () => {
    const x = fixture(), s = createDecisionLifecycle(async () => x), a = await s.generate();
    x.revision = 'b'; s.notifyChange('relevant'); x.revision = 'r1';
    expect((await s.useForReview(a.id)).view.status).toBe('STALE');
    const b = await s.generate(); x.revision = 'b'; x.revision = 'r1';
    expect((await s.useForReview(b.id)).allowed).toBe(true); // limitation, not full history proof
  });
  it('reload cannot import a valid sheet; view mutations cannot modify private state', async () => {
    const s = createDecisionLifecycle(async () => fixture()), v = await s.generate(); v.status = 'STALE';
    expect(s.view().status).toBe('VALID'); expect(createDecisionLifecycle(async () => fixture()).view().status).toBe('UNKNOWN');
    s.close(); expect((await s.generate()).reusable).toBe(false); expect((await s.useForReview(1)).allowed).toBe(false);
  });
  it('same JSON logical object order has same fingerprint; independent UTF16 hash oracle', async () => {
    const a = fixture(), b = JSON.parse(JSON.stringify(a, Object.keys(a).reverse()));
    // Reorder all top-level keys without dropping nested keys.
    Object.assign(b, a);
    const x = await createDecisionLifecycle(async () => a).generate(), y = await createDecisionLifecycle(async () => b).generate();
    expect(x.fingerprint).toBe(y.fingerprint);
    const parts = Object.fromEntries(Object.keys(a).map(k => [k, createHash('sha256').update(Buffer.from(canonical(a[k as keyof Observation]), 'utf16le')).digest('hex')]));
    expect(x.fingerprint).toBe(createHash('sha256').update(Buffer.from(canonical(parts), 'utf16le')).digest('hex'));
  });
  it.each([undefined, NaN, Infinity, new Date(), () => 1, BigInt(2), [,,], { a: undefined }])('rejects non-JSON canonical value %s', v => expect(() => canonical(v)).toThrow());
  it('rejects accessor and deeply nested payload without executing accessors', () => {
    let calls = 0; expect(() => canonical({ get x() { calls++; return 1; } })).toThrow(); expect(calls).toBe(0);
    let x: unknown = {}; for (let i=0;i<42;i++) x = { x }; expect(() => canonical(x)).toThrow();
  });
  it.each(['production', 'missing-generation', 'unknown-authority', 'duplicate-backup', 'duplicate-selection', 'unavailable', 'capture-changed'])('fails closed for %s', async kind => {
    const x = fixture();
    if (kind === 'production') x.request.scope.source = 'calculation-memo:data';
    if (kind === 'missing-generation') delete (x as Partial<Observation>).generation;
    if (kind === 'unknown-authority') x.authority.status = 'ESTABLISHED' as never;
    if (kind === 'duplicate-backup') x.backups.push(x.backups[0]);
    if (kind === 'duplicate-selection') x.selection.ids = ['x','x'];
    if (kind === 'unavailable') x.request.capture.source = { kind: 'unavailable', reason: 'secret' };
    if (kind === 'capture-changed') x.request.captureChanged = true;
    expect((await createDecisionLifecycle(async () => x).generate()).status).toBe('UNKNOWN');
  });
  it('two read disagreement fails generation closed', async () => {
    let n=0; const s=createDecisionLifecycle(async()=>({...fixture(), revision:String(++n)}));
    expect((await s.generate()).status).toBe('UNKNOWN');
  });
  it('notification while async read is pending cannot be overwritten by late response', async () => {
    let release!: (x: Observation)=>void; let wait=false;
    const s=createDecisionLifecycle(()=>wait ? new Promise(r=>{ release=r; }) : Promise.resolve(fixture()));
    await s.generate(); wait=true; const p=s.revalidate();
    expect(s.view().reusable).toBe(false); s.notifyChange('relevant'); wait=false; release(fixture());
    await p; expect(s.view().status).toBe('STALE');
  });
  it('overlapping generation cannot authorize an obsolete id', async () => {
    let release!: (x:Observation)=>void; let first=true;
    const s=createDecisionLifecycle(()=>first ? (first=false,new Promise(r=>{release=r;})) : Promise.resolve(fixture()));
    const p=s.generate(); const latest=await s.generate(); release(fixture()); await p;
    expect(s.view().id).toBe(latest.id); expect((await s.useForReview(latest.id-1)).allowed).toBe(false);
  });
  it('strict counterexample detects a cached-valid mutant; same input safe implementation rejects', async () => {
    const x=fixture(), s=createDecisionLifecycle(async()=>x), v=await s.generate(); x.generation++;
    const oracle=(r:{allowed:boolean})=>{ if(r.allowed) throw Error('stale-used'); };
    expect(()=>oracle({allowed:true})).toThrow('stale-used'); oracle(await s.useForReview(v.id));
  });
});

it('rejects array accessors and hidden or symbol properties without invoking them', () => {
  let called=false; const a=[1]; Object.defineProperty(a,'0',{get(){called=true;return 1;},enumerable:true});
  expect(()=>canonical(a)).toThrow(); expect(called).toBe(false);
  const b=[1]; Object.defineProperty(b,'secret',{value:2}); expect(()=>canonical(b)).toThrow();
  const c=[1]; Object.defineProperty(c,Symbol('secret'),{value:2}); expect(()=>canonical(c)).toThrow();
  const d={a:1}; Object.defineProperty(d,'secret',{value:2}); expect(()=>canonical(d)).toThrow();
});

it('concurrent review cannot erase an observed ABA from the in-flight review', async () => {
 let reads=0, release!: (x:Observation)=>void, pending!:()=>void;
 const ready=new Promise<void>(r=>{pending=r;});
 const s=createDecisionLifecycle(async()=>{reads++;if(reads===3)return {...fixture(),revision:'B'};if(reads===4){pending();return new Promise<Observation>(r=>{release=r;});}return fixture();});
 const v=await s.generate();const older=s.useForReview(v.id);await ready;
 const newer=await s.useForReview(v.id);release(fixture());await older;
 expect(newer.allowed).toBe(false);expect(s.view().status).toBe('STALE');expect((await s.useForReview(v.id)).allowed).toBe(false);
});

it('overlapping use cannot hide an in-flight read failure', async () => {
 let wait=false, reject!: (e:Error)=>void;
 const s=createDecisionLifecycle(()=>wait?new Promise<Observation>((_,r)=>{reject=r;}):Promise.resolve(fixture()));
 const v=await s.generate();wait=true;const first=s.useForReview(v.id);
 expect((await s.useForReview(v.id)).allowed).toBe(false);
 reject(Error('injected'));await first;wait=false;
 expect(s.view().status).toBe('UNKNOWN');expect((await s.useForReview(v.id)).allowed).toBe(false);
});
it('explicit new ID separates an earlier in-flight changed observation', async () => {
 let reads=0, release!:(x:Observation)=>void, pending!:()=>void;
 const ready=new Promise<void>(r=>{pending=r;});
 const s=createDecisionLifecycle(async()=>{reads++;if(reads===3)return {...fixture(),revision:'B'};if(reads===4){pending();return new Promise<Observation>(r=>{release=r;});}return fixture();});
 const old=await s.generate();const check=s.useForReview(old.id);await ready;
 const next=await s.generate();expect(next.id).not.toBe(old.id);release(fixture());
 expect((await check).allowed).toBe(false);expect(s.view().status).toBe('VALID');
 expect((await s.useForReview(next.id)).allowed).toBe(true);
});
