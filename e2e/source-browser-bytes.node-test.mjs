import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {mkdtemp,writeFile,readFile,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {captureBrowserSource,verifyBrowserProof} from './source-browser-bytes.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
test('browser receipt binds actual response, built output and external execution identity',async()=>{
 const root=await mkdtemp(join(tmpdir(),'browser-source-')),env={...process.env};
 try{
  process.env.SOURCE_PROOF_DIR=root;process.env.EXPECTED_SHA='a'.repeat(40);process.env.GITHUB_RUN_ID='fixture';process.env.GITHUB_RUN_ATTEMPT='1';
  const before=new Date().toISOString(),bytes=Buffer.from('export const answer=42;'),context=new EventEmitter();
  const drain=captureBrowserSource(context,{origin:'http://127.0.0.1:4173',bundleHash:hash(bytes)});
  context.emit('response',{request:()=>({resourceType:()=> 'script'}),status:()=>200,url:()=> 'http://127.0.0.1:4173/fixture.mjs',body:async()=>bytes});await drain();
  const binding={head:'a'.repeat(40),run:'fixture',attempt:'1',before,after:new Date().toISOString()},outputs=[{fileName:'fixture.mjs',size:bytes.length,sha256:hash(bytes)}];
  assert.equal((await verifyBrowserProof(root,binding,outputs)).status,'PASS');
  await assert.rejects(()=>verifyBrowserProof(root,{...binding,expectedConditions:['missing-case']},outputs),/browser-missing-condition/);
  await assert.rejects(()=>verifyBrowserProof(root,{...binding,head:'b'.repeat(40)},outputs),/browser-binding:head/);
  await assert.rejects(()=>verifyBrowserProof(root,binding,[{...outputs[0],sha256:'0'.repeat(64)}]),/browser-build-output/);
  const file=(await readdir(`${root}/browser`)).find(x=>x.endsWith('.json')),original=await readFile(`${root}/browser/${file}`);
  await writeFile(`${root}/browser/copy.json`,original);await assert.rejects(()=>verifyBrowserProof(root,binding,outputs),/duplicate-browser-receipt/);
 }finally{for(const k of ['SOURCE_PROOF_DIR','EXPECTED_SHA','GITHUB_RUN_ID','GITHUB_RUN_ATTEMPT']){if(env[k]===undefined)delete process.env[k];else process.env[k]=env[k];}}
});
test('browser one-byte delivered-source fault fails before a PASS receipt',async()=>{
 const old=process.env.SOURCE_PROOF_DIR;process.env.SOURCE_PROOF_DIR=await mkdtemp(join(tmpdir(),'browser-source-fault-'));
 try{const c=new EventEmitter(),drain=captureBrowserSource(c,{origin:'http://127.0.0.1:4173',bundleHash:hash(Buffer.from('a'))});c.emit('response',{request:()=>({resourceType:()=> 'script'}),status:()=>200,url:()=> 'http://127.0.0.1:4173/fixture.mjs',body:async()=>Buffer.from('b')});await assert.rejects(drain,/source-browser-bytes/);}finally{if(old===undefined)delete process.env.SOURCE_PROOF_DIR;else process.env.SOURCE_PROOF_DIR=old;}
});
test('physical inline HTML is captured and must match the Git source receipt',async()=>{
 const env={...process.env},root=await mkdtemp(join(tmpdir(),'browser-html-'));
 try{
  process.env.SOURCE_PROOF_DIR=root;process.env.EXPECTED_SHA='a'.repeat(40);process.env.GITHUB_RUN_ID='fixture';process.env.GITHUB_RUN_ATTEMPT='1';
  const path='e2e/physical/manual.html',html=await readFile(path),js=Buffer.from('export const answer=42;'),before=new Date().toISOString(),c=new EventEmitter();
  const drain=captureBrowserSource(c,{origin:'http://127.0.0.1:4173',bundleHash:hash(js),documentPath:path});
  for(const [type,url,bytes]of [['document','/',html],['script','/fixture.mjs',js]])c.emit('response',{request:()=>({resourceType:()=>type}),status:()=>200,url:()=> 'http://127.0.0.1:4173'+url,body:async()=>bytes});
  await drain();const binding={head:'a'.repeat(40),run:'fixture',attempt:'1',before,after:new Date().toISOString(),sources:[{path,size:html.length,sha256:hash(html)}]},outputs=[{fileName:'fixture.js',type:'chunk',size:js.length,sha256:hash(js)}];
  assert.equal((await verifyBrowserProof(root,binding,outputs)).responses,2);
  await assert.rejects(()=>verifyBrowserProof(root,{...binding,sources:[{...binding.sources[0],sha256:'0'.repeat(64)}]},outputs),/browser-git-document/);
 }finally{for(const k of ['SOURCE_PROOF_DIR','EXPECTED_SHA','GITHUB_RUN_ID','GITHUB_RUN_ATTEMPT']){if(env[k]===undefined)delete process.env[k];else process.env[k]=env[k];}}
});
test('existing seven route-fulfilled writer documents bind exact helper literals, not dist files',async()=>{
 const env={...process.env},root=await mkdtemp(join(tmpdir(),'browser-route-doc-'));
 try{
  process.env.SOURCE_PROOF_DIR=root;process.env.EXPECTED_SHA='a'.repeat(40);process.env.GITHUB_RUN_ID='fixture';process.env.GITHUB_RUN_ATTEMPT='1';
  const {mkdir}=await import('node:fs/promises');await mkdir(`${root}/bytes`);await mkdir(`${root}/dist`);
  const js=Buffer.from('export const answer=42;');await writeFile(`${root}/dist/main.js`,js);
  const c=new EventEmitter(),before=new Date().toISOString(),sources=[];
  const drain=captureBrowserSource(c,{origin:'http://127.0.0.1:4173',directory:`${root}/dist`});
  const emit=(type,path,bytes)=>c.emit('response',{request:()=>({resourceType:()=>type}),status:()=>200,url:()=> 'http://127.0.0.1:4173/calculator-memo/'+path,body:async()=>bytes});
  for(const name of ['audit-storage','audit-fixed-record','audit-record-comparison','audit-comparison-insertion','audit-roundtrip-navigation','audit-body-item-navigation','audit-comparison-navigation']){
   const path=`e2e/${name}.mjs`,code=await readFile(path),text=code.toString(),file=text.match(/route\('\*\*\/([^']+\.html)'/)[1],body=text.match(/route\('[^\n]+body: '([^']+)'/)[1];
   sources.push({path,sha256:hash(code),size:code.length});await writeFile(`${root}/bytes/${hash(code)}.txt`,code);emit('document',file,Buffer.from(body));
  }
  emit('script','main.js',js);await drain();
  const binding={head:'a'.repeat(40),run:'fixture',attempt:'1',before,after:new Date().toISOString(),sources},outputs=[{fileName:'main.js',size:js.length,sha256:hash(js)}];
  assert.equal((await verifyBrowserProof(root,binding,outputs)).responses,8);
  await assert.rejects(()=>verifyBrowserProof(root,{...binding,sources:[]},outputs),/browser-synthetic-git/);
  const fault=new EventEmitter(),badDrain=captureBrowserSource(fault,{origin:'http://127.0.0.1:4173',directory:`${root}/dist`});
  fault.emit('response',{request:()=>({resourceType:()=> 'document'}),status:()=>200,url:()=> 'http://127.0.0.1:4173/calculator-memo/__audit_storage_writer.html',body:async()=>Buffer.from('<!doctype html><script>changed()</script>')});
  await assert.rejects(badDrain,/source-browser-bytes/);
 }finally{for(const k of ['SOURCE_PROOF_DIR','EXPECTED_SHA','GITHUB_RUN_ID','GITHUB_RUN_ATTEMPT']){if(env[k]===undefined)delete process.env[k];else process.env[k]=env[k];}}
});
test('atomic constant document is captured and rejects an injected inline script',async()=>{
 const env={...process.env},root=await mkdtemp(join(tmpdir(),'browser-atomic-html-'));
 try{
  process.env.SOURCE_PROOF_DIR=root;process.env.EXPECTED_SHA='a'.repeat(40);process.env.GITHUB_RUN_ID='fixture';process.env.GITHUB_RUN_ATTEMPT='1';
  const {mkdir}=await import('node:fs/promises');await mkdir(`${root}/bytes`);
  const path='e2e/run-storage-atomic.mjs',code=await readFile(path),html=Buffer.from(code.toString().match(/'(<\!doctype html><title>Stage 3B-11 isolated HOLD<[^']+)'/)[1]),js=Buffer.from('export const answer=42;');await writeFile(`${root}/bytes/${hash(code)}.txt`,code);
  const c=new EventEmitter(),before=new Date().toISOString(),drain=captureBrowserSource(c,{origin:'http://127.0.0.1:4173',bundleHash:hash(js)});
  const emit=(context,type,url,body)=>context.emit('response',{request:()=>({resourceType:()=>type}),status:()=>200,url:()=> 'http://127.0.0.1:4173'+url,body:async()=>body});
  emit(c,'document','/',html);emit(c,'script','/fixture.mjs',js);await drain();
  const binding={head:'a'.repeat(40),run:'fixture',attempt:'1',before,after:new Date().toISOString(),sources:[{path,size:code.length,sha256:hash(code)}]},outputs=[{fileName:'fixture.js',type:'chunk',size:js.length,sha256:hash(js)}];
  assert.equal((await verifyBrowserProof(root,binding,outputs)).responses,2);
  const bad=new EventEmitter(),reject=captureBrowserSource(bad,{origin:'http://127.0.0.1:4173',bundleHash:hash(js)});emit(bad,'document','/',Buffer.concat([html,Buffer.from('<script>unexpected()</script>')]));await assert.rejects(reject,/source-browser-bytes/);
 }finally{for(const k of ['SOURCE_PROOF_DIR','EXPECTED_SHA','GITHUB_RUN_ID','GITHUB_RUN_ATTEMPT']){if(env[k]===undefined)delete process.env[k];else process.env[k]=env[k];}}
});
