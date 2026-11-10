import assert from 'node:assert/strict';
import { scenarios } from './scenario-config.mjs';
export const CASES=['unchanged','data','backup','backup-delete','generation','authority','selection','other-tab-storage','broadcast','unknown-broadcast','unrelated','read-failure','reload','observed-aba','unobserved-aba-limit','visibility-recheck','new-sheet'];
export function validateLifecycleEvidence(x){
 assert.equal(x.kind,'synthetic-decision-lifecycle');assert.equal(x.status,'PASS');assert.equal(x.dirty,false);assert.match(x.sha,/^[a-f0-9]{40}$/);assert.match(x.tree,/^[a-f0-9]{40}$/);assert.match(x.bundleHash,/^[a-f0-9]{64}$/);
 assert.deepEqual(x.rows.map(r=>r.id).sort(),scenarios.map(r=>r.id).sort());
 for(const row of x.rows){const s=scenarios.find(s=>s.id===row.id);assert.equal(row.engine,s.engine);assert.equal(row.width,s.width);assert.equal(row.height,s.height);assert.equal(row.dpr,s.deviceScaleFactor);assert.deepEqual(row.actual,{width:s.width,height:s.height,dpr:s.deviceScaleFactor});assert.equal(row.status,'PASS');assert.deepEqual(row.errors,[]);assert.deepEqual(row.cases.map(c=>c.name).sort(),[...CASES].sort());for(const c of row.cases){assert.equal(c.status,'PASS');const expected=['unchanged','unrelated','unobserved-aba-limit','new-sheet'].includes(c.name)?'VALID':['unknown-broadcast','read-failure','reload'].includes(c.name)?'UNKNOWN':'STALE';assert.equal(c.observed.status,expected);assert.equal(c.observed.uiStatus,expected);assert.equal(c.observed.reusable,expected==='VALID');assert.equal(c.observed.mutations,0);assert.equal(c.observed.idb,0);assert.equal(c.observed.executionAllowed,false);assert.equal(c.observed.writeAllowed,false);}assert.match(row.png.sha256,/^[a-f0-9]{64}$/);}
 return true;
}
