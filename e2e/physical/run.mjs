import {captureBrowserSource} from '../source-browser-bytes.mjs';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdir,writeFile,readFile,readdir} from 'node:fs/promises';
import {createHash,randomUUID} from 'node:crypto';
import {chromium,webkit} from '../node_modules/playwright/index.mjs';
import {serve} from './server.mjs';
import {CASES,auditRow,auditSuite} from './audit.mjs';
const git=(...a)=>execFileSync('git',a,{encoding:'utf8'}).trim(),hash=b=>createHash('sha256').update(b).digest('hex');
const s={sha:git('rev-parse','HEAD'),tree:git('rev-parse','HEAD^{tree}'),run:process.env.GITHUB_RUN_ID||'local',attempt:process.env.GITHUB_RUN_ATTEMPT||'local',rows:[]};
assert.equal(s.sha,process.env.EXPECTED_SHA||s.sha);assert.equal(git('status','--porcelain'),'','clean-checkout');
const out=`gui-evidence/physical-${s.sha.slice(0,12)}-${randomUUID()}`;await mkdir(out,{recursive:true});
const save=()=>writeFile(`${out}/summary.json`,JSON.stringify(s,null,2));const sourcePaths=['e2e/physical/run.mjs','e2e/physical/audit.mjs','e2e/physical/server.mjs','e2e/physical/manual.html','e2e/physical/negative.mjs','e2e/physical/files.mjs','e2e/fixtures/storage-atomic.ts','e2e/fixtures/storage-idb.ts','docs/maintenance/storage-physical-stage3b12/PLAN.md'];s.sources={};for(const path of sourcePaths){const bytes=await readFile(path);assert.deepEqual(bytes,execFileSync('git',['show',`${s.sha}:${path}`]),'source-head');s.sources[path]={sha256:hash(bytes),size:bytes.length,blob:git('rev-parse',`${s.sha}:${path}`)};await writeFile(`${out}/${path.replaceAll('/','__')}.txt`,bytes);}const server=await serve();await writeFile(`${out}/served-fixture.mjs`,server.code);s.bundleSHA256=hash(server.code);
let browser,context;
try{for(const engine of ['chromium','webkit']){browser=await({chromium,webkit}[engine]).launch();for(const name of CASES){
 const r={...s,rows:undefined,engine,case:name,trial:randomUUID(),device:`cloud-${engine}`,browserVersion:browser.version(),mode:'cloud-synthetic',physicalAcceptance:'NOT_TESTED',durability:'UNKNOWN',namespace:'stage3b11-test-'+randomUUID(),events:[],errors:[],transitions:[],executionAllowed:false,writeAllowed:false,authority:'NOT_ESTABLISHED',evidence:'INCOMPLETE',cleanup:false};s.rows.push(r);await save();
 context=await browser.newContext({serviceWorkers:'block',recordHar:{path:`${out}/${engine}-${name}.har`,content:'embed',mode:'full'}});const verifyBrowserSource=captureBrowserSource(context,{origin:server.origin,bundleHash:s.bundleSHA256,documentPath:'e2e/physical/manual.html',condition:engine+":"+name});context.setDefaultTimeout(30000);await context.route('**/*',route=>new URL(route.request().url()).origin===server.origin?route.continue():route.abort());await context.tracing.start({screenshots:false,snapshots:true,sources:true});
 await context.exposeBinding('recordPhysical',(_source,e)=>r.events.push(e));
 const delivered=[];context.on('response',response=>{if(response.url()===server.origin+'/fixture.mjs')delivered.push(response.body().then(bytes=>{assert.equal(response.status(),200);assert.equal(hash(bytes),s.bundleSHA256,'served-bundle-bytes');r.servedSHA256=hash(bytes);}));});
 const page=await context.newPage();page.on('pageerror',e=>r.errors.push(String(e)));
 async function install(p,id){await p.goto(server.origin);await p.evaluate(async c=>{const {startAtomic}=await import('/fixture.mjs');window.lab=startAtomic(c,e=>window.recordPhysical(e));},{namespace:r.namespace,pageId:id});}
 const call=(p,method,args=[])=>p.evaluate(async({method,args})=>{const result=await window.lab[method](...args);await window.lab.flush();return result;},{method,args});
 try{
 await install(page,'A');r.before=await call(page,'initialize');r.request=await call(page,'request',['op-test','SYNTHETIC']);
 if(name==='stale-writer'){const other=await context.newPage();await install(other,'B');await call(other,'writer',['OTHER']);await call(other,'close');await other.close();}
 if(name==='missing-receipt')await call(page,'rawWrite',[{deleteReceipt:'genesis'}]);
 if(name==='interrupted'){await call(page,'closeSession');r.transitions.push('close-session-before-update');}
 if(name==='quota-injected')await page.evaluate(()=>{window.originalPut=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){if(this.name==='state'&&args[1]==='current')throw new DOMException('synthetic quota','QuotaExceededError');return window.originalPut.apply(this,args);};});
 r.result=await call(page,'update',[r.request,{'lost-ack':{loseAck:true},abort:{abort:true},'readback-mismatch':{readbackMismatch:true}}[name]||{}]);
 if(name==='quota-injected')await page.evaluate(()=>{IDBObjectStore.prototype.put=window.originalPut;});
 r.after=await call(page,'snapshot');r.diagnosis=await call(page,'diagnose',['op-test']);
 if(r.result.status==='UNKNOWN')r.retry=await call(page,'update',[r.request]);
 if(name==='reload'){await call(page,'close');await page.reload();await install(page,'A2');r.reopened=await call(page,'snapshot');r.transitions.push('reload');}
 const own=r.events.filter(e=>e.txId===r.result.txId);r.observations={request:true,transactionComplete:own.some(e=>e.kind==='tx-complete'),abort:own.some(e=>e.kind==='tx-abort'),readback:true,mediaDurable:'UNKNOWN'};
 await call(page,'close');await page.evaluate(async n=>{await new Promise((yes,no)=>{const req=indexedDB.deleteDatabase(n);req.onsuccess=yes;req.onerror=()=>no(req.error);req.onblocked=()=>no(Error('cleanup-blocked'));});},r.namespace);
 const exists=await page.evaluate(async n=>(await indexedDB.databases()).some(d=>d.name===n),r.namespace);assert.equal(exists,false);r.cleanup=true;
 if(name==='eviction-injected')r.eviction={kind:'synthetic-owned-db-deletion',exists};
 await Promise.all(delivered);await verifyBrowserSource();assert.ok(delivered.length,'served-response-required');r.evidence='COMPLETE';auditRow(r,s);r.audit='PASS';
 }catch(e){r.errors.push(String(e.stack||e));r.audit='FAIL';throw e;}finally{await context.tracing.stop({path:`${out}/${engine}-${name}.zip`});await context.close();context=null;await save();}
 }await browser.close();browser=null;}auditSuite(s);s.audit='PASS';
}catch(e){s.error=String(e.stack||e);process.exitCode=1;}finally{await context?.close();await browser?.close();server.server.close();await save();const manifest={};for(const name of await readdir(out)){const bytes=await readFile(`${out}/${name}`);manifest[name]={size:bytes.length,sha256:hash(bytes)};}await writeFile(`${out}/manifest.json`,JSON.stringify(manifest,null,2));}
console.log(JSON.stringify({out,audit:s.audit,error:s.error,rows:s.rows.length}));
