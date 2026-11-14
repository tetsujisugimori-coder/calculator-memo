import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readdir,readFile,writeFile} from 'node:fs/promises';
import {validateAtomicEvidence,verifyAtomicFiles} from './storage-atomic-evidence.mjs';
import { narrowMainAtomicScope, validateAtomicMutantFailure } from './atomic-negative-control-inputs.mjs';
const roots=(await readdir('gui-evidence')).filter(n=>n.startsWith('atomic-'));let normal,dir;
for(const n of roots){try{const x=JSON.parse(await readFile(`gui-evidence/${n}/summary.json`));if(x.sha===process.env.EXPECTED_SHA&&x.status==='PASS'&&x.mutant==='none'){normal=x;dir=`gui-evidence/${n}`;}}catch{/* non-summary directories are not acceptance */}}
assert.ok(normal,'complete-same-head-normal-evidence-required');validateAtomicEvidence(normal);await verifyAtomicFiles(normal,dir);
const report={kind:'atomic-negative-controls',sha:normal.sha,tree:normal.tree,normalDirectory:dir,status:'running',evidenceMutations:[],browserMutants:[],limits:['No-generation/no-operation omissions are independently masked by full receipt/token binding in complete controller; pure matcher mutant tests are separate from browser controls.','Not product acceptance, physical Safari or media durability.']};
const renumber=x=>{const seq={};for(const e of x.events)e.sequence=seq[e.boot]=(seq[e.boot]||0)+1;};
const mutations={
 missingRaw:x=>{x.rows[0].events=[];},
 duplicateRaw:x=>{x.rows[0].events.splice(1,0,structuredClone(x.rows[0].events[0]));},
 reorderRaw:x=>{[x.rows[0].events[0],x.rows[0].events[1]]=[x.rows[0].events[1],x.rows[0].events[0]];},
 foreignHead:x=>{x.rows[0].sha='f'.repeat(40);},
 missingCase:x=>{x.rows.pop();},
 foreignTrace:x=>{x.rows[0].trace.file=x.rows[1].trace.file;},
 missingWriter:x=>{const r=x.rows.find(r=>r.name==='B-after-observation');r.events=r.events.filter(e=>!e.kind.startsWith('writer-'));renumber(r);},
 missingTxRead:x=>{const r=x.rows.find(r=>r.name==='A-same-token');r.events=r.events.filter(e=>e.kind!=='tx-read');renumber(r);},
 wrongScope:narrowMainAtomicScope,
 successBeforeComplete:x=>{const r=x.rows.find(r=>r.name==='A-same-token'),idx=r.events.findIndex(e=>e.kind==='update-result'&&e.result.status==='VERIFIED'),[e]=r.events.splice(idx,1);r.events.unshift(e);renumber(r);},
 finalMismatch:x=>{const r=x.rows[0];r.final.current='forged';},
 cleanupFailure:x=>{x.rows[0].cleanup.deleted=false;},
};
const targets=[['compare-outside','B-after-observation','scenario-outcome'],['accept-stale','B-after-observation','scenario-outcome'],['missing-store','A-same-token','scenario-outcome'],['abort-success','E-abort','verified-native-chain:tx-complete'],['early-success','A-same-token','verified-native-chain:readback'],['ignore-receipt','S-readback-mismatch','scenario-outcome'],['old-session','I-late-response','scenario-outcome'],['no-incarnation','K-incarnation-reset','scenario-outcome']];
try{
 for(const [name,mutate] of Object.entries(mutations)){const x=structuredClone(normal);mutate(x);let error;try{validateAtomicEvidence(x);}catch(e){error=String(e);}report.evidenceMutations.push({name,expected:'REJECT',actual:error?'REJECT':'ACCEPT',error});assert.ok(error,`undetected-evidence:${name}`);}
 for(const engine of ['chromium','webkit'])for(const [mutant,caseName,reason] of targets){
  const p=spawnSync(process.execPath,['e2e/run-storage-atomic.mjs'],{env:{...process.env,ATOMIC_MUTANT:mutant,ATOMIC_CASE:caseName,ATOMIC_ENGINE:engine},encoding:'utf8',timeout:60000,maxBuffer:2*1024*1024});
  const lines=(p.stderr+'\n'+p.stdout).split('\n');let output;for(const l of lines)try{const o=JSON.parse(l);if(o.out)output=o;}catch{/* preserve original text below */}
  const item={engine,mutant,caseName,exitCode:p.status,signal:p.signal,error:String(p.error||''),stdout:p.stdout,stderr:p.stderr,expected:'semantic-RED',actual:'NOT_DETECTED',out:output?.out};report.browserMutants.push(item);
  try {
  assert.equal(p.status,1,`mutant-exit:${engine}:${mutant}`);assert.equal(p.signal,null);assert.ok(output?.out,'mutant-summary-missing');const x=JSON.parse(await readFile(`${output.out}/summary.json`));assert.equal(x.sha,normal.sha);assert.equal(x.tree,normal.tree);assert.equal(x.run,normal.run);assert.equal(x.attempt,normal.attempt);assert.equal(x.dirty,false);assert.equal(x.bundleHash,normal.bundleHash);assert.equal(x.mutant,mutant);await verifyAtomicFiles(x,output.out);assert.equal(x.rows.length,1);const r=x.rows[0];for(const key of ['sha','tree','run','attempt'])assert.equal(r[key],normal[key]);assert.equal(r.name,caseName);assert.equal(r.engine,engine);assert.equal(r.cleanup.contextClosed,true,'environment-error-is-not-semantic-RED');assert.equal(r.cleanup.deleted,true);assert.ok(r.events.some(e=>e.kind==='update-request'));assert.equal(x.status,'FAIL');item.independentError=validateAtomicMutantFailure(r,x.error,mutant,reason);item.actual='DETECTED-semantic-RED';
  } catch(error) { item.failure=String(error); }
  await writeFile(`${dir}/negative-controls.json`,JSON.stringify(report,null,2)+'\n');
 }
 assert.equal(report.browserMutants.length,16);assert.ok(report.browserMutants.every(item=>item.actual==='DETECTED-semantic-RED'),'every-browser-mutant-must-be-semantic-RED');
 report.status='PASS-controls-only';
}catch(e){report.status='FAIL';report.error=String(e);process.exitCode=1;}finally{await writeFile(`${dir}/negative-controls.json`,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({out:dir,status:report.status,evidence:report.evidenceMutations.length,browser:report.browserMutants.length}));}
