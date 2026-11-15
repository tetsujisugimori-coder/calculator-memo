// Observe Vite's actual first-party transform input and generated bundle bytes.
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync,readdirSync} from 'node:fs';
import {resolve,relative,isAbsolute} from 'node:path';
const hash=b=>createHash('sha256').update(b).digest('hex');
const blob=b=>createHash('sha1').update(Buffer.from(`blob ${b.length}\0`)).update(b).digest('hex');
const bytesOf=value=>Buffer.isBuffer(value)?value:Buffer.from(value);
const git=(...args)=>execFileSync('git',args,{maxBuffer:64*1024*1024});
const canonical=p=>relative(process.cwd(),resolve(p)).replaceAll('\\','/');
function store(root,bytes){const sha256=hash(bytes);mkdirSync(`${root}/bytes`,{recursive:true});writeFileSync(`${root}/bytes/${sha256}.txt`,bytes);return {size:bytes.length,sha256,blob:blob(bytes)};}
export function sourceBuildProof(label='vite'){
 const root=process.env.SOURCE_PROOF_DIR;
 if(!root)return undefined;
 const before=JSON.parse(readFileSync(`${root}/before.json`));
 const expected=new Map(before.entries.map(e=>[e.path,e]));
 const record={id:randomUUID(),label,head:before.head,tree:before.tree,run:before.run,attempt:before.attempt,startedAt:new Date().toISOString(),status:'INCOMPLETE',inputs:[],derived:[],outputs:[]};
 mkdirSync(`${root}/builds`,{recursive:true});
 const save=()=>writeFileSync(`${root}/builds/${record.id}.json`,JSON.stringify(record,null,2)+'\n');
 const input=(code,id,kind)=>{
  if(!isAbsolute(id)||id.includes('/node_modules/')||id.includes('\\node_modules\\')||id.startsWith('\0'))return;
  const path=canonical(id.split('?')[0]),original=expected.get(path);
  const captured={path,kind,id:randomUUID(),capturedAt:new Date().toISOString(),...store(root,bytesOf(code))};
  captured.expectedSHA256=original?.sha256||null;captured.expectedBlob=original?.blob||null;
  // HTML transform modules and query modules are generated inputs; their original HTML
  // is observed independently through transformIndexHtml, never relabeled as raw bytes.
  if(kind==='vite-derived')record.derived.push({...captured,status:'DERIVED'});
  else record.inputs.push({...captured,status:original&&captured.sha256===original.sha256&&captured.size===original.size&&captured.blob===original.blob?'MATCH':'UNKNOWN'});
  save();
 };
 save();
 return {name:'calculator-runtime-source-proof',enforce:'pre',
  transform(code,id){input(code,id,id.includes('?')||id.split('?')[0].endsWith('.html')?'vite-derived':'vite-input');return null;},
  transformIndexHtml:{order:'pre',handler(html,context){input(html,context.filename,'vite-input-html');return html;}},
  generateBundle:{order:'post',handler(_options,bundle){
   for(const [fileName,item] of Object.entries(bundle)){
    const bytes=bytesOf(item.type==='chunk'?item.code:item.source);
    record.outputs.push({id:randomUUID(),kind:'vite-output',fileName,type:item.type,capturedAt:new Date().toISOString(),...store(root,bytes),modules:item.type==='chunk'?Object.keys(item.modules||{}).filter(id=>isAbsolute(id)&&!id.includes('node_modules')).map(id=>canonical(id.split('?')[0])):[]});
   }
   record.status=record.inputs.some(x=>x.status!=='MATCH')?'UNKNOWN':'CAPTURED';record.finishedAt=new Date().toISOString();save();
  }},
  buildEnd(error){if(error){record.status='FAIL';record.error=String(error);record.finishedAt=new Date().toISOString();save();}},
 };
}
export function verifyBuilds(root,expectedHead,binding={}){
 const before=JSON.parse(readFileSync(`${root}/before.json`));
 const paths=readdirSync(`${root}/builds`).filter(p=>p.endsWith('.json'));
 assert.ok(paths.length,'vite-build-required');
 const hashes=[],outputs=[],inputs=[],ids=new Set();
 const expected=new Map(before.entries.map(e=>[e.path,e]));
 for(const path of paths){
  const record=JSON.parse(readFileSync(`${root}/builds/${path}`));
  assert.equal(record.head,expectedHead,'vite-head');assert.equal(record.tree,before.tree,'vite-tree');
  assert.equal(record.run,binding.run??before.run,'vite-run');assert.equal(record.attempt,binding.attempt??before.attempt,'vite-attempt');
  assert.ok(!ids.has(record.id),'duplicate-vite-build');ids.add(record.id);
  assert.equal(record.status,'CAPTURED','vite-build-status');assert.ok(record.inputs.length&&record.outputs.length,'vite-build-complete');
  assert.ok(Date.parse(record.startedAt)>=Date.parse(before.capturedAt)&&Date.parse(record.finishedAt)>=Date.parse(record.startedAt),'vite-time');
  if(binding.after)assert.ok(Date.parse(record.finishedAt)<=Date.parse(binding.after),'vite-post-capture-time');
  const eventIds=new Set();
  for(const e of [...record.inputs,...record.derived,...record.outputs]){
   assert.ok(!eventIds.has(e.id),'duplicate-vite-record');eventIds.add(e.id);
   assert.ok(Date.parse(e.capturedAt)>=Date.parse(record.startedAt)&&Date.parse(e.capturedAt)<=Date.parse(record.finishedAt),'vite-event-time');
   const b=readFileSync(`${root}/bytes/${e.sha256}.txt`);assert.equal(b.length,e.size,'vite-byte-size');assert.equal(hash(b),e.sha256,'vite-byte-sha256');assert.equal(blob(b),e.blob,'vite-byte-blob');hashes.push(e.sha256);
  }
  for(const e of record.inputs){
   assert.equal(e.status,'MATCH','vite-input-status');const original=expected.get(e.path);assert.ok(original,'vite-untracked-source');
   const actual=git('show',`${expectedHead}:${e.path}`);assert.equal(hash(actual),e.sha256,'vite-input-git');assert.equal(blob(actual),e.blob,'vite-input-blob');
   assert.equal(e.expectedSHA256,original.sha256,'vite-snapshot-hash');assert.equal(e.expectedBlob,original.blob,'vite-snapshot-blob');inputs.push(e);
  }
  for(const e of record.derived)assert.ok(expected.has(e.path),'vite-derived-origin');
  const observed=new Set([...record.inputs,...record.derived].map(e=>e.path));
  for(const e of record.outputs)for(const modulePath of e.modules)assert.ok(observed.has(modulePath),'vite-output-unobserved-module:'+modulePath);
  outputs.push(...record.outputs.map(e=>({...e,build:record.id,label:record.label})));
 }
 for(const path of binding.requiredInputs||[])assert.ok(inputs.some(e=>e.path===path),'missing-vite-input:'+path);
 return {status:'PASS',builds:paths.length,hashes,outputs,inputs};
}
export const verifyBuildProof=(root,binding)=>verifyBuilds(root,binding.head,binding);
