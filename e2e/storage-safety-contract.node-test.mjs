import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { EXPECTED_STORAGE_CASES, validateStorageResults } from './storage-safety-contract.mjs';
import { scenarios } from './scenario-config.mjs';
import { validateCoverage } from './ci-contract.mjs';
function fixture(){return ['chromium','webkit'].map(engine=>({engine,status:'PASS',version:engine==='chromium'?'141.0.7390.37':'26.0',pageerrors:[],cases:Object.entries(EXPECTED_STORAGE_CASES).map(([name,phase])=>({name,phase,...(name==='cross-page-web-lock-and-storage-event'?{events:1}:{}),...(name==='actual-page-close-after-intent'?{next:'REFUSED',originalStillPresent:true}:{}),...(name==='actual-web-lock-steal-fences-suspended-writer'?{primaryCalls:0,originalStillPresent:true}:{}),...(name.startsWith('release-restart-')?{next:'REFUSED',primaryCalls:1,markerFired:1,failureRetained:name!=='release-restart-marker-before',failureEvidence:name==='release-restart-marker-before'?'UNAVAILABLE':'RECORDED'}:{}),...(name==='normal-acknowledgement-restart-hold'?{next:'REFUSED',candidateStillPresent:true}:{})}))}));}
test('all two-engine exact cases accepted',()=>assert.deepEqual(validateStorageResults(fixture()),[]));
for(const fault of ['missing-engine','duplicate-engine','missing-case','duplicate-case','phase','pageerror','version','no-events','restart-success','failed','exception','late-primary','release-promoted','diagnostic-not-fired','invented-first-failure','normal-restart-unlocked'])test(`reject ${fault}`,()=>{
  const r=fixture();
  if(fault==='missing-engine')r.pop();
  if(fault==='duplicate-engine')r[1]=structuredClone(r[0]);
  if(fault==='missing-case')r[0].cases.pop();
  if(fault==='duplicate-case')r[0].cases[1]=structuredClone(r[0].cases[0]);
  if(fault==='phase')r[0].cases[1].phase='OBSERVED_MATCH';
  if(fault==='pageerror')r[0].pageerrors.push('error');
  if(fault==='version')r[0].version='other';
  if(fault==='no-events')r[0].cases.find(c=>c.events).events=0;
  if(fault==='restart-success')r[0].cases.find(c=>c.next).next='OBSERVED_MATCH';
  if(fault==='failed')r[0].status='FAILED';
  if(fault==='exception')r[0].error='late browser close exception';
  if(fault==='late-primary')r[0].cases.find(c=>c.name==='actual-web-lock-steal-fences-suspended-writer').primaryCalls=1;
  if(fault==='release-promoted')r[0].cases.find(c=>c.name==='release-restart-recorded').next='OBSERVED_MATCH';
  if(fault==='diagnostic-not-fired')r[0].cases.find(c=>c.name==='release-restart-marker-before').markerFired=0;
  if(fault==='invented-first-failure')r[0].cases.find(c=>c.name==='release-restart-marker-before').failureRetained=true;
  if(fault==='normal-restart-unlocked')r[0].cases.find(c=>c.name==='normal-acknowledgement-restart-hold').next='OBSERVED_MATCH';
  assert.ok(validateStorageResults(r).length>0);
});
test('test-only implementation is absent from product import paths',()=>{
  for(const dir of ['app','components','lib']){
    for(const path of readdirSync(dir,{recursive:true}).filter(p=>/\.(ts|tsx|js|mjs)$/.test(p))) {
      assert.doesNotMatch(readFileSync(`${dir}/${path}`,'utf8'),/from\s+['"][^'"]*(?:tests\/storage-safety|storage-safety\/coordinator)/);
    }
  }
});
test('isolated workflow fails normally and retains evidence without changing formal GUI counts',()=>{
  const text=readFileSync('.github/workflows/storage-safety.yml','utf8');
  assert.match(text,/ref: \$\{\{ github.event.pull_request.head.sha \}\}/);
  assert.match(text,/node e2e\/run-stage.mjs storage-safety-browser timeout/);
  assert.match(text,/if: always\(\)/);
  assert.doesNotMatch(text,/continue-on-error|\|\| true|retry|skip/);
  assert.equal(scenarios.length,6);
  assert.equal(typeof validateCoverage,'function');
  const formal=readFileSync('e2e/aggregate-formal-gui.mjs','utf8');
  assert.match(formal,/1128/);assert.match(formal,/592/);assert.match(formal,/132/);
});
