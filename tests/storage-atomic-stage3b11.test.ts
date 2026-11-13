import { describe, expect, it } from 'vitest';
import { fingerprint, hasUnresolved, HOLD, inspectAtomic, matchesAtomic, validRequest, type AtomicRequest, type AtomicSnapshot } from '../e2e/fixtures/storage-atomic';
const namespace='stage3b11-test-12345678-1234-1234-1234-123456789abc';
function fixture() {
 const token={structure:1 as const,incarnation:'inc-1',generation:0,latestOperation:'genesis'};
 const r:AtomicRequest={namespace,target:'current',expectedToken:token,incarnation:'inc-1',generation:0,explicitOperationId:'op-1',fingerprint:fingerprint('A'),expectedRaw:'A',candidateRaw:'B',candidateFingerprint:fingerprint('B'),decisionId:'decision-1',session:'session-1',boot:'boot-1',pageId:'A'};
 const s:AtomicSnapshot={current:'A',head:{...token,namespace,target:'current',fingerprint:fingerprint('A')},receipts:{genesis:{operationId:'genesis',token,raw:'A',fingerprint:fingerprint('A'),previous:null}},copies:{},attempts:{},hold:false,boot:'boot-1',session:'session-1'};
 return {r,s};
}
describe('Stage 3B-11 pure contracts (NOT native browser acceptance)',()=>{
 it('matches a well formed exact synthetic target without granting authority',()=>{const {r,s}=fixture();expect(validRequest(r)).toBe(true);expect(inspectAtomic(s)).toBe(null);expect(matchesAtomic(s,r)).toBe(true);expect(HOLD).toEqual({executionAllowed:false,writeAllowed:false,authority:'NOT_ESTABLISHED',stage:'HOLD'});});
 for(const [name,change] of [
  ['namespace',(r:AtomicRequest)=>{r.namespace='production';}],['target',(r:AtomicRequest)=>{(r as unknown as {target:string}).target='other';}],['missing generation',(r:AtomicRequest)=>{delete (r as Partial<AtomicRequest>).generation;}],['generation alias',(r:AtomicRequest)=>{r.generation=1;}],['incarnation alias',(r:AtomicRequest)=>{r.incarnation='other';}],['raw',(r:AtomicRequest)=>{r.expectedRaw='changed';}],['candidate',(r:AtomicRequest)=>{r.candidateRaw='changed';}],['reused genesis ID',(r:AtomicRequest)=>{r.explicitOperationId='genesis';}],['extra field',(r:AtomicRequest)=>{Object.assign(r,{writeAllowed:true});}],['missing decision',(r:AtomicRequest)=>{r.decisionId='';}],['oversized raw',(r:AtomicRequest)=>{r.candidateRaw='A'.repeat(65537);r.candidateFingerprint=fingerprint(r.candidateRaw);}],
 ] as const) it(`rejects request ${name}`,()=>{const {r}=fixture();change(r);expect(validRequest(r)).toBe(false);});
 for(const key of ['generation','incarnation','latestOperation','namespace','target','fingerprint'] as const) it(`rejects changed ${key} at comparison`,()=>{const {r,s}=fixture();Object.assign(s.head,{[key]:key==='generation'?1:'changed'});expect(matchesAtomic(s,r)).toBe(false);});
 it('exact raw catches changed payload even with unchanged digest field',()=>{const {r,s}=fixture();s.current='B';expect(matchesAtomic(s,r)).toBe(false);});
 for(const [name,change] of [
  ['missing receipt',(s:AtomicSnapshot)=>{s.receipts={};}],['receipt raw',(s:AtomicSnapshot)=>{s.receipts.genesis.raw='X';}],['receipt operation',(s:AtomicSnapshot)=>{s.receipts.genesis.operationId='X';}],['receipt prior',(s:AtomicSnapshot)=>{s.receipts.genesis.previous='X';}],['current raw',(s:AtomicSnapshot)=>{s.current='X';}],['overflow',(s:AtomicSnapshot)=>{s.head.generation=Number.MAX_SAFE_INTEGER;}],['extra copy',(s:AtomicSnapshot)=>{s.copies['1']={};}],['bad attempt',(s:AtomicSnapshot)=>{s.attempts['op']={} as never;}],
 ] as const) it(`rejects snapshot ${name}`,()=>{const {s}=fixture();change(s);expect(inspectAtomic(s)).not.toBe(null);});
 it('requires COMMITTED attempt to have its receipt; missing evidence is not success',()=>{const {r,s}=fixture();s.attempts[r.explicitOperationId]={request:r,status:'COMMITTED',boot:r.boot};expect(inspectAtomic(s)).toBe('attempt-receipt-mismatch');});
 it('preserves UNKNOWN attempt without pretending absence of commit',()=>{const {r,s}=fixture();s.attempts[r.explicitOperationId]={request:r,status:'UNKNOWN',boot:r.boot};expect(inspectAtomic(s)).toBe(null);});
 for(const [key,mutant] of [['generation','no-generation'],['incarnation','no-incarnation'],['latestOperation','no-operation']] as const)it(`pure comparison negative control ${mutant}`,()=>{const {r,s}=fixture();Object.assign(s.head,{[key]:key==='generation'?1:'changed'});expect(matchesAtomic(s,r)).toBe(false);expect(matchesAtomic(s,r,mutant)).toBe(true);});
 it('does not claim unobserved ABA can be distinguished from identical evidence',()=>{const {r,s}=fixture();const restored=structuredClone(s);expect(matchesAtomic(restored,r)).toBe(true);});
 for(const status of ['PENDING','COMMITTED','UNKNOWN']) it(`cross-page unresolved ${status} rejects another operation reservation`,()=>{const {r,s}=fixture();s.attempts[r.explicitOperationId]={request:r,status,boot:r.boot};expect(hasUnresolved(s)).toBe(true);expect(hasUnresolved(s,'other-op')).toBe(true);expect(hasUnresolved(s,r.explicitOperationId)).toBe(false);});
 for(const status of ['VERIFIED','REJECTED']) it(`terminal ${status} does not manufacture unresolved state`,()=>{const {r,s}=fixture();s.attempts[r.explicitOperationId]={request:r,status,boot:r.boot};expect(hasUnresolved(s)).toBe(false);});

});
