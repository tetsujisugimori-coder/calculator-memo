// Runtime source evidence. Original bytes are content-addressed, never executable artifacts.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync,readdirSync,lstatSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
export const sha256 = b => createHash('sha256').update(b).digest('hex');
export const blobId = b => createHash('sha1').update(Buffer.from(`blob ${b.length}\0`)).update(b).digest('hex');
const git = (...args) => execFileSync('git',args,{maxBuffer:64*1024*1024});
const str = (...args) => git(...args).toString().trim();
export const selected = p => /^(e2e|app|components|lib|public|pages|worker|scripts|tests|db|drizzle|github-pages)\//.test(p) || /^\.github\/workflows\//.test(p) || /^[^/]+\.(json|mjs|ts|js)$/.test(p) || /^docs\/maintenance\/storage-(physical-stage3b12|atomic-stage3b11)\/.*\.(mjs|json|gz|txt)$/.test(p);
export function checkEntries(entries, expected) {
  assert.equal(entries.length,expected.length,'source-set-cardinality');
  assert.equal(new Set(entries.map(x=>x.path)).size,entries.length,'duplicate-source');
  const map=new Map(expected.map(x=>[x.path,x]));
  for(const e of entries){const x=map.get(e.path);assert.ok(x,'unexpected-source');for(const k of ['size','sha256','blob'])assert.equal(e[k],x[k],`git-source-${k}:${e.path}`);}
}
function inventory(head, disk=false) {
  return str('ls-tree','-r','--name-only',head).split('\n').filter(selected).map(path=>{
    if(disk)assert.ok(lstatSync(path).isFile()&&!lstatSync(path).isSymbolicLink(),`regular-source:${path}`);
    const b=disk?readFileSync(path):git('show',`${head}:${path}`);
    return {path,size:b.length,sha256:sha256(b),blob:blobId(b)};
  });
}
function storeBytes(root,b){const h=sha256(b);mkdirSync(`${root}/bytes`,{recursive:true});writeFileSync(`${root}/bytes/${h}.txt`,b);return h;}
export function verifyArchive(root, expectedHead, expectedWorkflow, binding={}) {
  const before=JSON.parse(readFileSync(`${root}/before.json`));
  const after=JSON.parse(readFileSync(`${root}/after.json`));
  assert.equal(before.head,expectedHead,'declared-head');assert.equal(after.head,expectedHead,'post-head');
  assert.equal(before.tree,str('rev-parse',`${expectedHead}^{tree}`),'declared-tree');
  assert.equal(before.prHead,expectedHead,'pr-head');assert.equal(before.checkout,expectedHead,'checkout');
  for(const k of ['tree','prHead','checkout','run','attempt','workflowRef','eventSha'])assert.equal(after[k],before[k],`post-binding:${k}`);
  assert.ok(Number.isFinite(Date.parse(before.capturedAt))&&Date.parse(after.capturedAt)>=Date.parse(before.capturedAt),'capture-time-order');
  assert.equal(before.workflow.sha,binding.workflowSha,'workflow-external-sha');
  assert.equal(before.run,binding.run,'external-run');assert.equal(before.attempt,binding.attempt,'external-attempt');
  assert.equal(before.workflow.path,expectedWorkflow,'workflow-path');
  const wf=git('show',`${before.workflow.sha}:${expectedWorkflow}`);
  assert.equal(before.workflow.sha256,sha256(wf),'workflow-version');
  assert.equal(sha256(git('show',`${expectedHead}:${expectedWorkflow}`)),sha256(wf),'workflow-head-bytes');
  const expected=inventory(expectedHead);checkEntries(before.entries,expected);checkEntries(after.entries,expected);
  for(const e of before.entries){const b=readFileSync(`${root}/bytes/${e.sha256}.txt`);assert.equal(b.length,e.size,'artifact-size');assert.equal(sha256(b),e.sha256,'artifact-sha256');assert.equal(blobId(b),e.blob,'artifact-blob');}
  const events=readdirSync(`${root}/loads`).filter(p=>p.endsWith('.json')).map(p=>JSON.parse(readFileSync(`${root}/loads/${p}`)));
  assert.ok(events.length,'runtime-loads-required');
  assert.equal(new Set(events.map(e=>e.id)).size,events.length,'duplicate-load-record');
  const map=new Map(expected.map(e=>[e.path,e]));
  for(const event of events){
    assert.match(event.id||'',/^[a-f0-9-]{36}$/,'load-id');
    assert.ok(Date.parse(event.capturedAt)>=Date.parse(before.capturedAt)&&Date.parse(event.capturedAt)<=Date.parse(after.capturedAt),'load-capture-time');
    assert.equal(event.run,before.run,'load-run');assert.equal(event.attempt,before.attempt,'load-attempt');
    const b=readFileSync(`${root}/bytes/${event.sha256}.txt`);assert.equal(sha256(b),event.sha256,'load-bytes');assert.equal(b.length,event.size,'load-size');
    if(map.has(event.path))assert.equal(event.sha256,map.get(event.path).sha256,`loaded-source:${event.path}`);
    else assert.ok(event.path.includes('node_modules/'),'untracked-runtime-source');
  }
  assert.ok(binding.requiredLoads?.length,'required-entrypoints');
  for(const path of binding.requiredLoads)assert.ok(events.some(e=>e.path===path&&e.kind!=='preload'),`missing-executed-source:${path}`);
  const allowed=new Set([...before.entries.map(e=>e.sha256),...events.map(e=>e.sha256)]);
  for(const name of readdirSync(`${root}/bytes`))assert.ok(allowed.has(name.replace(/\.txt$/,'')),'extra-source-bytes');
  return {status:'PASS',head:expectedHead,tree:before.tree,files:expected.length,loads:events.length,workflow:before.workflow,limits:['Node ESM load results and CJS compilation captured; native binaries, browser internals and filesystem reads are not loader events.','Git snapshot covers selected first-party source and fixture bytes. Package load bytes are captured but not Git-owned.','No claim of physical durability or tamper-proof CI.']};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const phase=process.argv[2],root=process.env.SOURCE_PROOF_DIR||'gui-evidence/source-proof';mkdirSync(root,{recursive:true});
 const head=str('rev-parse','HEAD'),workflowPath=process.env.SOURCE_WORKFLOW_PATH;
 if(phase==='before'){
  const expected=process.env.EXPECTED_SHA;assert.equal(head,expected,'checkout-head');
  const workflowSha=process.env.GITHUB_WORKFLOW_SHA;assert.match(workflowSha||'',/^[a-f0-9]{40}$/);
  const wf=git('show',`${workflowSha}:${workflowPath}`);assert.deepEqual(wf,git('show',`${head}:${workflowPath}`),'executed-workflow-head');
  const entries=inventory(head,true);checkEntries(entries,inventory(head));for(const e of entries)storeBytes(root,readFileSync(e.path));storeBytes(root,wf);
  mkdirSync(`${root}/loads`,{recursive:true});
  const record={head,tree:str('rev-parse','HEAD^{tree}'),prHead:expected,checkout:head,workflowRef:process.env.GITHUB_WORKFLOW_REF,eventSha:process.env.GITHUB_SHA,workflow:{path:workflowPath,sha:workflowSha,sha256:sha256(wf)},run:process.env.GITHUB_RUN_ID||'local',attempt:process.env.GITHUB_RUN_ATTEMPT||'local',capturedAt:new Date().toISOString(),entries};
  writeFileSync(`${root}/before.json`,JSON.stringify(record,null,2)+'\n');
 }else if(phase==='after'){
  const before=JSON.parse(readFileSync(`${root}/before.json`));
  writeFileSync(`${root}/after.json`,JSON.stringify({...before,head,tree:str('rev-parse','HEAD^{tree}'),capturedAt:new Date().toISOString(),entries:inventory(head,true)},null,2)+'\n');
  const result=verifyArchive(root,process.env.EXPECTED_SHA,workflowPath,{workflowSha:process.env.GITHUB_WORKFLOW_SHA,run:process.env.GITHUB_RUN_ID||'local',attempt:process.env.GITHUB_RUN_ATTEMPT||'local',requiredLoads:JSON.parse(process.env.SOURCE_REQUIRED_LOADS||'[]')});writeFileSync(`${root}/result.json`,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
 }else throw Error('phase-required');
}
