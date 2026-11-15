// Capture completed loopback response bodies without changing browser input or timing limits.
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {resolve,sep} from 'node:path';
const hash=b=>createHash('sha256').update(b).digest('hex');
export async function verifyBrowserProof(root,binding,outputs){
 const names=(await readdir(`${root}/browser`)).filter(p=>p.endsWith('.json'));
 assert.ok(names.length,'browser-source-receipts-required');const ids=new Set(),conditions=new Set();let scripts=0;
 for(const name of names){
  const e=JSON.parse(await readFile(`${root}/browser/${name}`));assert.ok(!ids.has(e.id),'duplicate-browser-receipt');ids.add(e.id);
  for(const k of ['head','run','attempt'])assert.equal(e[k],binding[k],`browser-binding:${k}`);
  assert.ok(Date.parse(e.capturedAt)>=Date.parse(binding.before)&&Date.parse(e.capturedAt)<=Date.parse(binding.after),'browser-capture-time');
  const bytes=await readFile(`${root}/browser/bytes/${e.sha256}.txt`);assert.equal(bytes.length,e.size,'browser-byte-size');assert.equal(hash(bytes),e.sha256,'browser-byte-hash');assert.equal(e.expectedSHA256,e.sha256,'browser-declared-hash');
  if(e.sourceFile){assert.equal(e.type,'document','browser-direct-source-kind');assert.equal(e.sourceFile,'e2e/physical/manual.html','browser-direct-source-path');assert.ok(binding.sources?.some(s=>s.path===e.sourceFile&&s.sha256===e.sha256&&s.size===e.size),'browser-git-document');}
  else assert.ok(outputs.some(o=>(o.fileName===e.buildFile||(e.buildFile==='fixture.mjs'&&o.type==='chunk'))&&o.sha256===e.sha256&&o.size===e.size),'browser-build-output');
  assert.equal(e.status,200,'browser-status');if(e.type==='script'){scripts++;conditions.add(e.condition);}
 }
 for(const condition of binding.expectedConditions||[])assert.ok(conditions.has(condition),'browser-missing-condition:'+condition);
 assert.ok(scripts,'browser-script-required');return {status:'PASS',responses:names.length,scripts};
}
export function captureBrowserSource(context,{origin,directory,bundleHash,documentPath,condition='unspecified'}){
 const root=process.env.SOURCE_PROOF_DIR;
 if(!root)return async()=>{};
 const pending=[];let scripts=0;
 context.on('response',response=>{
  const type=response.request().resourceType();
  if(!['script','stylesheet','document'].includes(type)||response.status()!==200)return;
  const task=(async()=>{
   const url=new URL(response.url());assert.equal(url.origin,origin,'source-browser-origin');
   const bytes=await response.body(),sha256=hash(bytes);
   let expectedSHA256,buildFile,sourceFile;
   if(bundleHash&&url.pathname==='/fixture.mjs'){expectedSHA256=bundleHash;buildFile='fixture.mjs';}
   else if(documentPath&&type==='document'){expectedSHA256=hash(await readFile(documentPath));sourceFile=documentPath;}
   else if(directory){
    const suffix=decodeURIComponent(url.pathname).replace(/^\/calculator-memo\/?/,'').replace(/^\//,'')||'index.html';
    const base=resolve(directory),file=resolve(base,suffix);assert.ok(file.startsWith(base+sep),'source-browser-path');
    const original=await readFile(file);expectedSHA256=hash(original);buildFile=suffix;
   }else if(type==='document')return; // Atomic constant HTML has no executable inline script; fixture is checked.
   else throw Error('source-browser-unmapped');
   assert.equal(sha256,expectedSHA256,'source-browser-bytes');
   const id=randomUUID();await mkdir(`${root}/browser/bytes`,{recursive:true});
   await writeFile(`${root}/browser/bytes/${sha256}.txt`,bytes);
   await writeFile(`${root}/browser/${id}.json`,JSON.stringify({id,condition,path:url.pathname,type,status:200,buildFile,sourceFile,size:bytes.length,sha256,expectedSHA256,head:process.env.EXPECTED_SHA,run:process.env.GITHUB_RUN_ID||'local',attempt:process.env.GITHUB_RUN_ATTEMPT||'local',capturedAt:new Date().toISOString()}));
   if(type==='script')scripts++;
  })();
  // Record settled outcomes immediately, and reject at the existing end-of-context boundary.
  pending.push(task.then(()=>({ok:true}),error=>({error:String(error.stack||error)})));
 });
 return async()=>{const results=await Promise.all(pending);for(const r of results)assert.ok(r.ok,r.error);assert.ok(results.length,'browser-source-response-required');assert.ok(scripts,'browser-context-script-required');};
}
