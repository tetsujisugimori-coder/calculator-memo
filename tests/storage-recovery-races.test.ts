import {it,expect} from 'vitest';
import {RACE_CASES,runRace,createRecoverySession,syntheticObservation} from '../e2e/fixtures/storage-recovery-races';
it.each(RACE_CASES)('%s preserves the integration safety contract',async name=>{const r=await runRace(name);expect(r.status).toBe('PASS');expect(r.events.length).toBeGreaterThan(3);expect(r.reads.length).toBeGreaterThan(1);expect(r.events.map(x=>x.sequence)).toEqual(r.events.map((_,i)=>i+1));});
it('returned data cannot mutate session',async()=>{const s=createRecoverySession(async()=>syntheticObservation());await s.generate();const v=s.snapshot();v.view.status='STALE';v.events.length=0;expect(s.snapshot().view.status).toBe('VALID');expect(s.snapshot().events.length).toBeGreaterThan(0);});
it('unrelated proven event does not revoke consistent material',async()=>{const s=createRecoverySession(async()=>syntheticObservation());await s.generate();s.change('unrelated-proven');await s.review();expect(s.snapshot().view.reusable).toBe(true);});
