import {it,expect} from 'vitest';
import {RACE_CASES,runRace,createRecoverySession,syntheticObservation} from '../e2e/fixtures/storage-recovery-races';
it.each(RACE_CASES)('%s preserves the integration safety contract',async name=>{const r=await runRace(name);expect(r.status).toBe('PASS');expect(r.events.length).toBeGreaterThan(3);expect(r.reads.length).toBeGreaterThan(1);expect(r.events.map(x=>x.sequence)).toEqual(r.events.map((_,i)=>i+1));});
it('returned data cannot mutate session',async()=>{const s=createRecoverySession(async()=>syntheticObservation());await s.generate();const v=s.snapshot();v.view.status='STALE';v.events.length=0;expect(s.snapshot().view.status).toBe('VALID');expect(s.snapshot().events.length).toBeGreaterThan(0);});
it('unrelated proven event does not revoke consistent material',async()=>{const s=createRecoverySession(async()=>syntheticObservation());await s.generate();s.change('unrelated-proven');await s.review();expect(s.snapshot().view.reusable).toBe(true);});
it.each(['A-B-new-material','old-generation-late'] as const)('%s rejects an old request without revoking the current material',async name=>{
 const r=await runRace(name),e=r.events.find(e=>e.phase==='immediate-rejection'&&e.operation?.rejectionReason==='old-id');
 expect(e).toBeDefined();expect(e!.requestAllowed).toBe(false);expect(e!.reusable).toBe(true);expect(e!.checking).toBe(false);expect(e!.operation!.requestedDecisionId).not.toBe(e!.decisionId);
 expect(r.events.filter(e=>e.phase==='checking').every(e=>e.checking&&!e.reusable&&e.requestAllowed===null)).toBe(true);
});
it('a pending review explicitly records checking without current or requested reuse authority',async()=>{
 const r=await runRace('invalidation-before-completion'),e=r.events.find(e=>e.sequence===5);
 expect(e).toMatchObject({operationId:2,decisionId:1,phase:'checking',status:'VALID',checking:true,reusable:false,requestAllowed:null,operation:{kind:'review',requestedDecisionId:1,mode:'validation',rejectionReason:null}});
});
