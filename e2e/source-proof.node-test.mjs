// Independent finite fault controls. All mutations start from the same actual load capture.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,cpSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {verifyArchive,sha256,blobId} from './source-proof.mjs';

const repository=resolve(fileURLToPath(new URL('../',import.meta.url)));
const fixture=mkdtempSync(join(tmpdir(),'calculator-source-proof-'));
const workflow='.github/workflows/source-test.yml';
const run=(command,args,options={})=>execFileSync(command,args,{cwd:fixture,encoding:'utf8',stdio:'pipe',...options});
mkdirSync(join(fixture,'e2e'),{recursive:true});mkdirSync(join(fixture,'.github/workflows'),{recursive:true});
writeFileSync(join(fixture,workflow),'name: Source test\non: [pull_request]\njobs: {}\n');
writeFileSync(join(fixture,'e2e/main.mjs'),"import {value} from './dep.mjs'; import {createRequire} from 'node:module'; const require=createRequire(import.meta.url); if(value!==1||require('./dep.cjs')!==1)throw Error('fixture');\n");
writeFileSync(join(fixture,'e2e/dep.mjs'),'export const value=1;\n');
writeFileSync(join(fixture,'e2e/dep.cjs'),'module.exports=1;\n');
for(const p of ['source-proof.mjs','source-load-register.mjs','source-load-hook.mjs','source-load-write.mjs'])cpSync(join(repository,'e2e',p),join(fixture,'e2e',p));
run('git',['init','-q']);run('git',['config','core.autocrlf','false']);run('git',['add','.']);
const commit=message=>run('git',['-c','user.name=Source proof fixture','-c','user.email=source-proof@example.invalid','-c','core.autocrlf=false','commit','-qm',message]);
commit('normal source');const head=run('git',['rev-parse','HEAD']).trim();
writeFileSync(join(fixture,workflow),'name: Different workflow\non: [pull_request]\njobs: {}\n');run('git',['add',workflow]);commit('different workflow');
const other=run('git',['rev-parse','HEAD']).trim();run('git',['checkout','-q',head]);
const root=join(fixture,'original');
const binding={workflowSha:head,run:'independent-fixture',attempt:'1',requiredLoads:['e2e/main.mjs','e2e/dep.mjs','e2e/dep.cjs']};
const env={...process.env,NODE_OPTIONS:'',EXPECTED_SHA:head,GITHUB_WORKFLOW_SHA:head,GITHUB_WORKFLOW_REF:'fixture/repo/'+workflow+'@refs/pull/1/merge',GITHUB_SHA:head,GITHUB_RUN_ID:binding.run,GITHUB_RUN_ATTEMPT:binding.attempt,SOURCE_PROOF_DIR:root,SOURCE_WORKFLOW_PATH:workflow,SOURCE_REQUIRED_LOADS:JSON.stringify(binding.requiredLoads)};
run(process.execPath,['e2e/source-proof.mjs','before'],{env});
run(process.execPath,['--import','./e2e/source-load-register.mjs','e2e/main.mjs'],{env});
run(process.execPath,['e2e/source-proof.mjs','after'],{env});
const json=(dir,name)=>JSON.parse(readFileSync(join(dir,name)));
const put=(dir,name,value)=>writeFileSync(join(dir,name),JSON.stringify(value));
function verify(dir,override={}){const cwd=process.cwd();try{process.chdir(fixture);return verifyArchive(dir,head,workflow,{...binding,...override});}finally{process.chdir(cwd);}}
function clone(name){const dir=join(fixture,name);cpSync(root,dir,{recursive:true});return dir;}
function edit(dir,name,fn){const data=json(dir,name);fn(data);put(dir,name,data);}
function loadMutation(dir,bytes){
 const path=readdirSync(join(dir,'loads')).find(p=>json(dir,'loads/'+p).path==='e2e/dep.mjs');
 const digest=sha256(bytes);writeFileSync(join(dir,'bytes',digest+'.txt'),bytes);
 edit(dir,'loads/'+path,e=>{e.sha256=digest;e.size=bytes.length;});
}
test('source normal control: actual ESM entry and dependency bytes accepted',()=>assert.equal(verify(root).status,'PASS'));
test('source fault 1: one-byte runtime mutation rejected against Git bytes',()=>{
 const dir=clone('one-byte');loadMutation(dir,Buffer.from('export const value=2;\n'));assert.throws(()=>verify(dir),/loaded-source/);assert.equal(verify(root).status,'PASS');
});
test('source fault 2: one source absent from manifest rejected',()=>{
 const dir=clone('missing');edit(dir,'before.json',b=>b.entries.pop());assert.throws(()=>verify(dir),/source-set-cardinality/);
});
test('source fault 3: alternate source version with self-consistent load hash rejected',()=>{
 const dir=clone('alternate');loadMutation(dir,Buffer.from('export const value=100; // different version\n'));assert.throws(()=>verify(dir),/loaded-source/);
});
test('source fault 4: declared HEAD differs from independently expected HEAD',()=>{
 const dir=clone('head');edit(dir,'before.json',b=>{b.head=other;});assert.throws(()=>verify(dir),/declared-head/);
});
test('source fault 5: workflow body from another commit rejected',()=>{
 const dir=clone('workflow');edit(dir,'before.json',b=>{b.workflow.sha=other;b.workflow.sha256=sha256(Buffer.from(run('git',['show',other+':'+workflow])));});assert.throws(()=>verify(dir),/workflow/);
});
test('source fault 6: manifest hash tampering rejected against independent Git',()=>{
 const dir=clone('manifest');edit(dir,'before.json',b=>{b.entries[0].sha256='0'.repeat(64);});assert.throws(()=>verify(dir),/git-source-sha256/);
});
test('source fault 7: duplicate source replacing another source rejected',()=>{
 const dir=clone('duplicate');edit(dir,'before.json',b=>{b.entries[1]=structuredClone(b.entries[0]);});assert.throws(()=>verify(dir),/duplicate-source/);
});
test('source fault 7b: unrelated artifact source bytes rejected',()=>{
 const dir=clone('mixed');writeFileSync(join(dir,'bytes',sha256(Buffer.from('foreign'))+'.txt'),'foreign');assert.throws(()=>verify(dir),/extra-source-bytes/);
});
test('source fault 8: artifact actual bytes differ from declared hash',()=>{
 const dir=clone('artifact');const b=json(dir,'before.json'),entry=b.entries.find(x=>x.path==='e2e/dep.mjs');writeFileSync(join(dir,'bytes',entry.sha256+'.txt'),'export const value=2;\n');assert.throws(()=>verify(dir),/artifact-sha256/);
});
test('source binding: preload-only evidence cannot stand in for entrypoint',()=>{
 const dir=clone('missing-entry');for(const p of readdirSync(join(dir,'loads'))){const e=json(dir,'loads/'+p);if(e.path==='e2e/main.mjs')put(dir,'loads/'+p,{...e,path:'e2e/source-load-register.mjs',sha256:json(dir,'before.json').entries.find(x=>x.path==='e2e/source-load-register.mjs').sha256,size:json(dir,'before.json').entries.find(x=>x.path==='e2e/source-load-register.mjs').size});}
 assert.throws(()=>verify(dir),/missing-executed-source:e2e\/main.mjs/);
});
test('source binding: workflow SHA must match external execution context',()=>assert.throws(()=>verify(root,{workflowSha:other}),/workflow/));
test('source binding: run and attempt must match external context',()=>{
 assert.throws(()=>verify(root,{run:'foreign-run'}),/run/);assert.throws(()=>verify(root,{attempt:'2'}),/attempt/);
});
test('source binding: PR head metadata cannot contradict captured HEAD',()=>{
 const dir=clone('pr-head');edit(dir,'before.json',b=>b.prHead=other);assert.throws(()=>verify(dir),/pr.*head|prHead|checkout/);
});
test('source binding: reversed capture times rejected',()=>{
 const dir=clone('time-reversed');edit(dir,'after.json',b=>b.capturedAt='2000-01-01T00:00:00.000Z');assert.throws(()=>verify(dir),/time|capture/);
});
test('source binding: changed post-execution file rejected',()=>{
 const dir=clone('post-source');edit(dir,'after.json',b=>b.entries.find(x=>x.path==='e2e/dep.mjs').sha256='0'.repeat(64));assert.throws(()=>verify(dir),/git-source-sha256/);
});
test('source binding: post-execution run mixing rejected',()=>{
 const dir=clone('post-run');edit(dir,'after.json',b=>b.run='foreign');assert.throws(()=>verify(dir),/post.*run|run/);
});
test('source binding: load timestamp outside execution window rejected',()=>{
 const dir=clone('load-time');const name=readdirSync(join(dir,'loads'))[0];edit(dir,'loads/'+name,e=>e.capturedAt='2000-01-01T00:00:00.000Z');assert.throws(()=>verify(dir),/load.*time|capture.*window/);
});
test('source binding: duplicate identical load record rejected',()=>{
 const dir=clone('load-duplicate');const name=readdirSync(join(dir,'loads'))[0];cpSync(join(dir,'loads',name),join(dir,'loads','copied-record.json'));assert.throws(()=>verify(dir),/duplicate.*load|duplicate.*event/);
});
test('source normal retained after all mutations',()=>{assert.equal(verify(root).status,'PASS');assert.equal(blobId(Buffer.from('export const value=1;\n')),run('git',['rev-parse',head+':e2e/dep.mjs']).trim());});
