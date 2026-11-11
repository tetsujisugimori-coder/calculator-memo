// A successful control campaign means each intentionally broken run is RED.
// Mutant summaries retain FAIL and are never folded into normal browser PASS rows.
import assert from 'node:assert/strict';
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {spawnSync,execFileSync} from 'node:child_process';
import {validateMultitabEvidence,verifyArtifactFiles} from './storage-multitab-evidence.mjs';
const sha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const candidates=(await readdir('gui-evidence')).filter(n=>n.startsWith(`multitab-${sha.slice(0,12)}-none-`));
const summaries=await Promise.all(candidates.map(async n=>({path:`gui-evidence/${n}/summary.json`,data:JSON.parse(await readFile(`gui-evidence/${n}/summary.json`,'utf8'))})));
const source=summaries.filter(x=>x.data.status==='PASS').sort((a,b)=>b.data.startedAt.localeCompare(a.data.startedAt))[0];
assert.ok(source,'complete-normal-run-required');validateMultitabEvidence(source.data);await verifyArtifactFiles(source.data,source.path.replace('/summary.json',''));
const output={sha,normalEvidence:source.path,status:'running',evidenceMutations:[],browserMutants:[]};
function renumber(row){const counts=new Map(),refs=new Map();for(const e of row.events){const old=e.sequence;e.sequence=(counts.get(e.boot)||0)+1;counts.set(e.boot,e.sequence);refs.set(`${e.boot}:${old}`,e.sequence);}for(const c of row.checks)c.evidenceSequence=refs.get(`${c.boot}:${c.evidenceSequence}`);}
const mutations={
 'missing-case':x=>x.rows.pop(),
 'received-change-hidden-by-checking':x=>{const r=x.rows.find(r=>r.name==='delayed-duplicate-reordered');Object.assign(r.events.find(e=>e.kind==='receive'&&e.pageId==='A').decision,{status:'VALID',checking:true,reusable:false});},
 'checking-without-validation':x=>{Object.assign(x.rows[0].events.find(e=>e.kind==='generate-finish').decision,{checking:true,reusable:false});},
 'trace-aliased-from-another-case':x=>{x.rows[1].trace=structuredClone(x.rows[0].trace);},
 'causative-write-dropped-renumbered':x=>{const r=x.rows.find(r=>r.name==='stale-evidence');r.events=r.events.filter(e=>!(e.pageId==='B'&&['write-lock-acquired','write-committed'].includes(e.kind)));renumber(r);},
 'writer-lock-dropped-renumbered':x=>{const r=x.rows.find(r=>r.name==='stale-evidence');r.events=r.events.filter(e=>!(e.pageId==='B'&&e.kind==='write-lock-acquired'));renumber(r);},
 'native-read-revision-forged':x=>{const r=x.rows.find(r=>r.name==='stale-evidence');r.events.find(e=>e.kind==='read-captured').revision='forged';},
 'whole-generations-dropped-renumbered':x=>{const r=x.rows[0];r.events=r.events.filter(e=>!/^generate-(start|finish)$/.test(e.kind));renumber(r);},
 'all-reviews-dropped-renumbered':x=>{const r=x.rows.find(r=>r.name==='unknown-read');r.events=r.events.filter(e=>!/^review-(start|finish)$/.test(e.kind));renumber(r);},
 'unearned-new-id-revival':x=>{const r=x.rows.find(r=>r.name==='delayed-duplicate-reordered'),i=r.events.findIndex(e=>e.kind==='receive'&&e.pageId==='A');const e=structuredClone(r.events[i]);e.kind='snapshot';e.sequence+=0.5;e.monotonic+=0.01;Object.assign(e.decision,{id:2,status:'VALID',reusable:true});r.events.splice(i+1,0,e);renumber(r);},
 'decision-id-rollback':x=>{Object.assign(x.rows[0].events.find(e=>e.kind==='send').decision,{id:0,status:'STALE',reusable:false});},
 'review-native-reads-missing':x=>{const r=x.rows.find(r=>r.name==='stale-evidence'),s=r.events.find(e=>e.kind==='review-start');r.events=r.events.filter(e=>!(e.boot===s.boot&&e.sequence>s.sequence&&e.kind==='read-captured'));renumber(r);},
 'checkpoint-outcome-not-raw':x=>{const r=x.rows.find(r=>r.name==='late-older-response');r.events.find(e=>e.kind==='review-finish').allowed=true;},
 'duplicate-case':x=>{x.rows[1]=structuredClone(x.rows[0]);},
 'page-failure':x=>x.rows[0].errors.push('synthetic page failure'),
 'missing-raw-row':x=>x.rows[0].events.splice(3,1),
 'absent-real-communication':x=>{x.rows[0].events=x.rows[0].events.filter(e=>e.kind!=='receive');for(const boot of new Set(x.rows[0].events.map(e=>e.boot))){let i=0;for(const e of x.rows[0].events.filter(e=>e.boot===boot))e.sequence=++i;}},
 'stale-accepted':x=>{const c=x.rows.find(r=>r.name==='stale-evidence').checks[0];c.allowed=true;c.view.status='VALID';c.view.reusable=true;},
 'cleanup-missing':x=>{delete x.rows[0].cleanup.deleted;},
 'outside-namespace-modified':x=>{x.rows[0].cleanup.sentinelAfter='changed';},
 'write-authority-granted':x=>{x.rows[0].events[0].decision.writeAllowed=true;},
 'wrong-head':x=>{x.sha='missing';},
 'no-browser-version':x=>{delete x.rows[0].browserVersion;},
 'unfinished-run':x=>{x.status='running';},
};
for(const [name,mutate] of Object.entries(mutations)){const x=structuredClone(source.data);mutate(x);assert.throws(()=>validateMultitabEvidence(x),name);output.evidenceMutations.push({name,result:'RED'});}
try{
 for(const [mutant,failedCase] of [['accept-stale','stale-evidence'],['disable-communication','broadcast-three-tabs']]){
  const r=spawnSync(process.execPath,['e2e/run-storage-multitab.mjs'],{env:{...process.env,MULTITAB_MUTANT:mutant,EXPECTED_SHA:sha},encoding:'utf8',timeout:120000,maxBuffer:10*1024*1024});
  assert.equal(r.error,undefined);assert.equal(r.status,1,`${mutant} must exit RED (1)`);
  const lines=r.stderr.split('\n').filter(l=>l.startsWith('{'));const location=JSON.parse(lines.at(-1));
  const raw=JSON.parse(await readFile(`${location.out}/summary.json`,'utf8'));assert.equal(raw.status,'FAIL');assert.equal(raw.mutant,mutant);assert.equal(raw.rows.at(-1).name,failedCase);assert.equal(raw.rows.at(-1).status,'FAIL');
  const failed=raw.rows.at(-1);assert.deepEqual(failed.errors,[],'environment-page-failure-is-not-mutant-detection');
  if(mutant==='accept-stale'){assert.match(raw.error,/use-stale-denied/);assert.ok(failed.events.some(e=>e.kind==='mutant-cached-read'));assert.ok(failed.events.some(e=>e.kind==='review-finish'&&e.allowed===true));}
  else{assert.match(raw.error,/^Error: Timeout: missing-real-message:/);assert.ok(failed.events.some(e=>e.kind==='send'));assert.equal(failed.events.filter(e=>e.kind==='receive').length,0);}
  output.browserMutants.push({mutant,result:'RED',exitCode:r.status,evidence:`${location.out}/summary.json`,failedCase,error:raw.error});
 }
 output.status='PASS-controls-only';
}finally{await writeFile(source.path.replace('summary.json','negative-controls.json'),JSON.stringify(output,null,2)+'\n');}
console.log(JSON.stringify(output,null,2));
