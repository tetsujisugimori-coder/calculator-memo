import { setup } from '../helpers/selective-safety-fixture';
import { StorageSafetyCoordinator, STORAGE_KEY, RECOVERY_KEYS, FAILURE_PREFIX, webExclusive, type Phase, type Store } from './coordinator';
import { isolatedStore } from './adapter';

export function makeBrowserFixture(namespace: string, checkpoint: (p: Phase) => void | Promise<void> = () => {}, wrap: (s: Store) => Store = s => s) {
  const store = wrap(isolatedStore(localStorage, namespace));
  const f = setup(); store.setItem(STORAGE_KEY, f.context.currentRaw!);
  const context = { ...f.context, selectedKeys: [...f.context.selectedKeys] };
  const read = () => ({ ...context, currentRaw: store.getItem(STORAGE_KEY) });
  const c = new StorageSafetyCoordinator(store, webExclusive(navigator.locks), checkpoint);
  return { c, store, context, candidate: f.candidate(), read, original: f.context.currentRaw! };
}

export async function suite(namespace: string) {
  const results: { name: string; phase: string; [key: string]: unknown }[] = [];
  function check(value: unknown, message: string) { if(!value)throw Error(message); }
  async function test(name: string, work: () => Promise<string | { phase: string; [key: string]: unknown }>) {
    const value=await work();results.push(typeof value==='string'?{name,phase:value}:{name,...value});
  }
  await test('normal-preserve-write-readback', async () => {
    const f=makeBrowserFixture(namespace+'normal:'); const r=await f.c.selection('normal',f.candidate,f.read);
    check(r.phase==='OBSERVED_MATCH' && !r.executionAllowed,'normal result');
    check(f.store.getItem(STORAGE_KEY)===f.candidate.raw,'exact candidate');
    check(r.record?.copy?.raw===f.original && f.store.getItem(r.record.copy.key)===r.record.copy.serialized,'exact preservation');
    check(localStorage.getItem(STORAGE_KEY)===null,'product key must remain absent');
    return r.phase;
  });
  for(const at of ['before','after','read','mismatch'] as const) await test('write-fault-'+at,async()=>{
    let armed=true, invoked=0, injected=0;
    const f=makeBrowserFixture(namespace+at+':',()=>{},s=>({
      getItem:k=>{ if(at==='read'&&invoked&&k===STORAGE_KEY){injected++;throw Error('injected read');}return s.getItem(k); },
      setItem:(k,v)=>{
        if(k===STORAGE_KEY&&armed){ // initialization is first call; arm after make
          s.setItem(k,v); return;
        }
        if(k===STORAGE_KEY){invoked++;if(at==='before'){injected++;throw Error('injected before');}}
        s.setItem(k,v);
        if(k===STORAGE_KEY&&at==='after'){injected++;throw Error('injected after');}
        if(k===STORAGE_KEY&&at==='mismatch'){injected++;s.setItem(k,'intervening writer');}
      }
    }));
    armed=false;
    const r=await f.c.selection('fault',f.candidate,f.read);
    check(r.phase==='UNKNOWN'&&invoked===1&&injected>0,'fault must really fire');
    check((await f.c.selection('retry',f.candidate,f.read)).phase==='REFUSED','unknown HOLD');
    return r.phase;
  });
  for(const mode of ['quota','copy-read','copy-mismatch'] as const) await test(mode,async()=>{
    let fire=0, primary=0;
    const f=makeBrowserFixture(namespace+mode+':',()=>{},s=>({
      getItem:k=>{if(mode==='copy-read'&&fire&&RECOVERY_KEYS.includes(k))throw Error('copy read');return s.getItem(k);},
      setItem:(k,v)=>{
        if(k===STORAGE_KEY)primary++;
        if(RECOVERY_KEYS.includes(k)){fire++;if(mode==='quota')throw new DOMException('injected quota','QuotaExceededError');}
        s.setItem(k,v);
        if(RECOVERY_KEYS.includes(k)&&mode==='copy-mismatch')s.setItem(k,'corrupt');
      }
    }));
    primary=0;
    const r=await f.c.selection('fault',f.candidate,f.read);
    check(r.phase==='REFUSED'&&fire===1&&primary===0&&f.store.getItem(STORAGE_KEY)===f.original,'unconfirmed preservation cannot write');return r.phase;
  });
  await test('same-tab-coordinator',async()=>{
    let ordinary='';
    const f=makeBrowserFixture(namespace+'same:',async p=>{if(p==='PRESERVED')ordinary=(await f.c.ordinary('ordinary',f.original,f.original)).phase;});
    const r=await f.c.selection('select',f.candidate,f.read);
    check(r.phase==='OBSERVED_MATCH'&&ordinary==='REFUSED','same tab blocked'); return ordinary;
  });
  await test('notified-ABA',async()=>{
    const f=makeBrowserFixture(namespace+'aba:',p=>{if(p==='PRESERVED'){f.store.setItem(STORAGE_KEY,'B');f.store.setItem(STORAGE_KEY,f.original);f.context.epoch++;}});
    const r=await f.c.selection('aba',f.candidate,f.read);check(r.phase==='REFUSED','notified ABA');return r.phase;
  });
  await test('unnotified-ABA-limit',async()=>{
    const f=makeBrowserFixture(namespace+'silent:',p=>{if(p==='PRESERVED'){f.store.setItem(STORAGE_KEY,'B');f.store.setItem(STORAGE_KEY,f.original);}});
    const r=await f.c.selection('aba',f.candidate,f.read);check(r.phase==='OBSERVED_MATCH'&&r.assurance==='COOPERATIVE_OBSERVATION_ONLY'&&!r.executionAllowed,'ABA limit must not become product success');return r.phase;
  });
  await test('manual-recovery-first-failure-retained',async()=>{
    let fired=false;
    const f=makeBrowserFixture(namespace+'recovery:',p=>{if(p==='READING'&&!fired){fired=true;throw Error('first interruption');}});
    const r=await f.c.selection('first',f.candidate,f.read); check(r.phase==='UNKNOWN','first unknown');
    const before=JSON.stringify(f.c.inspect()[0]);
    const recovered=await f.c.recover('recovery','first',f.store.getItem(STORAGE_KEY),true);
    check(recovered.phase==='OBSERVED_MATCH'&&f.store.getItem(STORAGE_KEY)===f.original,'manual recovery');
    check(JSON.stringify(f.c.inspect().find(r=>r.id==='first'))===before,'first failure must survive');return recovered.phase;
  });
  for (const mode of ['recorded','marker-before','marker-after'] as const) await test('release-restart-'+mode,async()=>{
    let primaryCalls=0,markerFired=0;
    const f=makeBrowserFixture(namespace+mode+':',()=>{},s=>({getItem:k=>s.getItem(k),setItem:(k,v)=>{
      if(k===STORAGE_KEY)primaryCalls++;
      if(k.startsWith(FAILURE_PREFIX)){markerFired++;if(mode==='marker-before')throw Error('diagnostic set before');}
      s.setItem(k,v);
      if(k.startsWith(FAILURE_PREFIX)&&mode==='marker-after')throw Error('diagnostic set after');
    }}));
    primaryCalls=0;
    const c=new StorageSafetyCoordinator(f.store,async work=>{await work();throw Error('browser-release-failure');});
    const returned=await c.ordinary('release',f.original,f.candidate.raw!);
    check(returned.phase==='UNKNOWN'&&returned.record?.firstFailure?.reason.includes('browser-release-failure'),'release UNKNOWN retains first cause');
    const restarted=new StorageSafetyCoordinator(f.store,webExclusive(navigator.locks));
    const inspected=restarted.inspect()[0];
    const next=await restarted.ordinary('after-restart',f.candidate.raw!,f.original);
    check(inspected.phase==='UNKNOWN'&&next.phase==='REFUSED'&&primaryCalls===1&&markerFired===1,'restart HOLD and actual diagnostic injection');
    const failureRetained=!!inspected.firstFailure?.reason.includes('browser-release-failure');
    check(mode==='marker-before'?!failureRetained:failureRetained,'missing diagnostics must not be invented');
    return {phase:inspected.phase,next:next.phase,primaryCalls,markerFired,failureRetained,failureEvidence:inspected.failureEvidence};
  });
  await test('normal-acknowledgement-restart-hold',async()=>{
    const f=makeBrowserFixture(namespace+'normal-restart:');
    const returned=await f.c.selection('normal',f.candidate,f.read);
    check(returned.phase==='OBSERVED_MATCH'&&f.c.inspect()[0].phase==='OBSERVED_MATCH','normal live positive');
    const restarted=new StorageSafetyCoordinator(f.store,webExclusive(navigator.locks));
    const inspected=restarted.inspect()[0];const next=await restarted.ordinary('restart',f.candidate.raw!,f.original);
    check(inspected.phase==='UNKNOWN'&&next.phase==='REFUSED'&&f.store.getItem(STORAGE_KEY)===f.candidate.raw,'normal acknowledgement cannot be inferred after restart');
    return {phase:inspected.phase,next:next.phase,candidateStillPresent:true};
  });
  check(results.length===16,'all browser cases executed');
  return results;
}
export { StorageSafetyCoordinator, LEDGER_KEY, STORAGE_KEY, LOCK_NAME, webExclusive } from './coordinator';
export { isolatedStore } from './adapter';
