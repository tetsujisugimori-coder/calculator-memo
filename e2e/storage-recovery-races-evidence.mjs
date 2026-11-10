import assert from 'node:assert/strict';
import {scenarios} from './scenario-config.mjs';
export const CASES=['A-B-new-material','old-generation-late','invalidation-before-completion','change-during-regeneration','same-material-overlap','simulated-tabs','cancel-late','unknown-late','read-failure','validation-exception','incomplete-material','generation-mismatch','close-late','reload-unknown'];
export function validateRaceEvidence(x){
 assert.equal(x.kind,'synthetic-recovery-races');assert.equal(x.status,'PASS');assert.equal(x.dirty,false);for(const k of ['sha','tree'])assert.match(x[k],/^[a-f0-9]{40}$/);assert.match(x.bundleHash,/^[a-f0-9]{64}$/);
 assert.deepEqual(x.rows.map(r=>r.id).sort(),scenarios.map(s=>s.id).sort());
 for(const r of x.rows){const s=scenarios.find(s=>s.id===r.id);assert.equal(r.engine,s.engine);assert.equal(r.width,s.width);assert.deepEqual(r.actual,{width:s.width,height:s.height,dpr:s.deviceScaleFactor});assert.equal(r.status,'PASS');assert.deepEqual(r.errors,[]);assert.equal(r.writes,0);assert.deepEqual(r.cases.map(c=>c.name).sort(),[...CASES].sort());for(const k of ['png','trace'])assert.match(r[k].sha256,/^[a-f0-9]{64}$/);
 for(const c of r.cases){assert.equal(c.status,'PASS');assert.equal(c.simulated,true);assert.ok(c.reads.length>=2);assert.ok(c.events.length>=4);assert.deepEqual(c.events.map(e=>e.sequence),c.events.map((_,i)=>i+1));for(const e of c.events){assert.equal(e.writeAllowed,false);assert.equal(e.executionAllowed,false);assert.equal(Number.isInteger(e.operationId),true);assert.ok(['VALID','STALE','UNKNOWN'].includes(e.status));if(e.reusable)assert.equal(e.status,'VALID');}assert.equal(c.view.writeAllowed,false);assert.equal(c.view.executionAllowed,false);assert.equal(c.view.HOLD,true);
 const expected=['A-B-new-material','old-generation-late'].includes(c.name)?'VALID':['read-failure','validation-exception','incomplete-material','cancel-late','unknown-late','close-late','reload-unknown'].includes(c.name)?'UNKNOWN':'STALE';assert.equal(c.view.status,expected);assert.equal(c.view.reusable,expected==='VALID');
 if(['A-B-new-material','old-generation-late'].includes(c.name))assert.equal(c.events.at(-1).outcome,'review-rejected');
 if(['old-generation-late','invalidation-before-completion','change-during-regeneration','same-material-overlap','cancel-late','unknown-late','close-late'].includes(c.name))assert.ok(c.events.some(e=>e.outcome==='obsolete-response-discarded'));
 } }
 assert.equal(JSON.stringify(x).includes('SYNTHETIC_PRIVATE_SENTINEL'),false);return true;
}
