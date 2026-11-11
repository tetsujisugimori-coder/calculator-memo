import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {build} from 'vite';
import {chromium,webkit} from './node_modules/playwright/index.mjs';
import {CASES,EXPECTED_CHECKS,validateMultitabEvidence,verifyArtifactFiles} from './storage-multitab-evidence.mjs';
const git=(...x)=>execFileSync('git',x,{encoding:'utf8'}).trim();
const sha=git('rev-parse','HEAD'),mutant=process.env.MULTITAB_MUTANT||'none';
assert.ok(['none','accept-stale','disable-communication'].includes(mutant));
const out=`gui-evidence/multitab-${sha.slice(0,12)}-${mutant}-${randomUUID()}`;await mkdir(out,{recursive:true});
const result={kind:'real-browser-multitab',sha,tree:git('rev-parse','HEAD^{tree}'),dirty:!!git('status','--porcelain'),mutant,status:'running',node:process.version,startedAt:new Date().toISOString(),run:process.env.GITHUB_RUN_ID||'local',attempt:process.env.GITHUB_RUN_ATTEMPT||'local',rows:[]};
const save=()=>writeFile(`${out}/summary.json`,JSON.stringify(result,null,2)+'\n');let server,browser,context;
const deadline=async fn=>{let t;try{return await Promise.race([fn(),new Promise((_,r)=>{t=setTimeout(()=>r(Error('case-deadline')),20000);})]);}finally{clearTimeout(t);}};
async function sentinel(page,name,mode){return page.evaluate(async({name,mode})=>{
 const db=await new Promise((resolve,reject)=>{const r=indexedDB.open(name,1);r.onupgradeneeded=()=>{if(mode!=='create'){r.transaction.abort();reject(Error('sentinel-missing'));}else r.result.createObjectStore('sentinel');};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
 try{return await new Promise((resolve,reject)=>{const tx=db.transaction('sentinel',mode==='create'?'readwrite':'readonly'),s=tx.objectStore('sentinel');const r=mode==='create'?s.put('outside-synthetic-namespace','value'):s.get('value');tx.oncomplete=()=>resolve(mode==='create'?'outside-synthetic-namespace':r.result);tx.onerror=()=>reject(tx.error);});}finally{db.close();}
},{name,mode});}
try{
 assert.equal(sha,process.env.EXPECTED_SHA||sha);assert.equal(result.dirty,false,'commit-before-browser-evidence');
 const built=await build({configFile:false,logLevel:'error',build:{write:false,minify:false,lib:{entry:'e2e/fixtures/storage-multitab.ts',formats:['es']},rolldownOptions:{output:{codeSplitting:false}}}});
 const chunks=(Array.isArray(built)?built:[built]).flatMap(x=>x.output).filter(x=>x.type==='chunk');assert.equal(chunks.length,1);const code=chunks[0].code;result.bundleHash=createHash('sha256').update(code).digest('hex');await writeFile(`${out}/fixture.mjs.txt`,code);
 server=createServer((req,res)=>{res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type',req.url==='/fixture.mjs'?'text/javascript':'text/html');res.end(req.url==='/fixture.mjs'?code:'<!doctype html><title>Stage 3B-10 synthetic HOLD</title><p>Isolated synthetic multi-tab research. HOLD.</p>');});server.listen(0,'127.0.0.1');await once(server,'listening');result.origin=`http://127.0.0.1:${server.address().port}`;
 for(const engine of ['chromium','webkit']){
  if(process.env.GITHUB_ACTIONS==='true')assert.equal(process.env.WEBKIT_EXECUTABLE_PATH||'','');
  browser=await({chromium,webkit}[engine]).launch({headless:true,...(engine==='webkit'&&process.env.WEBKIT_EXECUTABLE_PATH?{executablePath:process.env.WEBKIT_EXECUTABLE_PATH}:{})});
  for(const name of CASES){
   const row={engine,name,browserVersion:browser.version(),namespace:`stage3b10-test-${randomUUID()}`,sentinelName:`outside-multitab-sentinel-${randomUUID()}`,status:'running',pagesCreated:0,events:[],checks:[],errors:[],transitions:[],terminatedBoots:[],cleanup:{}};result.rows.push(row);await save();
   context=await browser.newContext({serviceWorkers:'block'});await context.route('**/*',r=>new URL(r.request().url()).origin===result.origin?r.continue():r.abort());await context.tracing.start({screenshots:false,snapshots:true,sources:true});
   const identities=new Map();
   await context.exposeBinding('recordMultitab',(source,event)=>{const identity=identities.get(source.page);assert.ok(identity,'registered-real-page-required');assert.equal(source.frame,source.page.mainFrame());assert.equal(event.pageId,identity.pageId);identity.boot??=event.boot;assert.equal(event.boot,identity.boot);row.events.push({...event,pageOrdinal:identity.ordinal});});
   const call=(page,method,...args)=>page.evaluate(async({method,args})=>window.multitab[method](...args),{method,args});
   async function install(page,pageId){identities.get(page).boot=null;await page.goto(result.origin);await page.evaluate(async config=>{const {startMultitab}=await import('/fixture.mjs');window.multitab=startMultitab(config,event=>window.recordMultitab(event));await window.multitab.flush();},{namespace:row.namespace,pageId,caseName:name,mutant});}
   async function newPage(pageId){const p=await context.newPage();row.pagesCreated++;identities.set(p,{ordinal:row.pagesCreated,pageId,boot:null});p.on('pageerror',e=>row.errors.push(String(e)));p.on('crash',()=>row.errors.push('page-crash'));await install(p,pageId);return p;}
   let a=await newPage('A');const b=await newPage('B'),c=await newPage('C');
   const snap=page=>call(page,'snapshot');
   async function check(label,page,response){const state=await snap(page);row.checks.push({label,boot:state.boot,evidenceSequence:state.evidenceSequence,view:state.view,...(response?{allowed:response.allowed}:{})});assert.equal(state.view.status,EXPECTED_CHECKS[name][label],label);if(label.includes('denied'))assert.equal(response?.allowed,false,label);if(label==='pending-no-authority')assert.equal(state.view.reusable,false);}
   const waitEvent=(kind,pageId)=>a.waitForFunction(()=>true).then(async()=>{const until=Date.now()+4000;while(!row.events.some(e=>e.kind===kind&&e.pageId===pageId)){if(Date.now()>until)throw Error(`missing-event:${kind}:${pageId}`);await new Promise(r=>setTimeout(r,10));}});
   const receive=async(page,id,count=1)=>{const until=Date.now()+4000;while((await snap(page)).received.filter(m=>m.id===id).length<count){if(Date.now()>until)throw Error(`Timeout: missing-real-message:${id}`);await new Promise(r=>setTimeout(r,10));}};
   try{await deadline(async()=>{
    row.cleanup.sentinelBefore=await sentinel(a,row.sentinelName,'create');await a.evaluate(()=>localStorage.setItem('outside-multitab-sentinel','unchanged'));row.cleanup.localBefore=await a.evaluate(()=>({local:Object.fromEntries(Object.entries(localStorage).sort()),session:Object.fromEntries(Object.entries(sessionStorage).sort())}));row.cleanup.before=await a.evaluate(async()=>(await indexedDB.databases()).map(d=>d.name).sort());
    await call(a,'write','A',1);await Promise.all([a,b,c].map(p=>call(p,'generate')));for(const p of [a,b,c]){const initial=await snap(p);assert.equal(initial.view.status,'VALID');assert.equal(initial.view.reusable,true);assert.equal(initial.generation,1);}const old=(await snap(a)).view.id;
    if(name==='broadcast-three-tabs'){
     await call(a,'write','B',2);const id=await call(a,'send');await Promise.all([receive(b,id),receive(c,id)]);await check('B-after-A',b);await check('C-after-A',c);await call(b,'write','C',3);const back=await call(b,'send');await Promise.all([receive(a,back),receive(c,back)]);await check('A-after-B',a);for(const p of [a,b,c])assert.deepEqual(await call(p,'observe'),{revision:'C',generation:3});
    }else if(name==='delayed-duplicate-reordered'){
     await call(b,'write','B',2);const older=await call(b,'prepareMessage');await call(b,'write','C',3);const newer=await call(b,'send');await Promise.all([receive(a,newer),receive(c,newer)]);
     // Release the held generation-2 hint only after generation 3 was received.
     await call(b,'send','change',older);await call(b,'send','change',older);await Promise.all([receive(a,older,2),receive(c,older,2)]);await check('old-message-cannot-revive',a);
    }else if(['stale-evidence','check-then-use','generation-aba','noncooperative-writer'].includes(name)){
     if(name==='check-then-use'){const first=await call(a,'review');assert.equal(first.allowed,true);await check('initial-check',a);}
     if(name==='noncooperative-writer'){await call(b,'holdLock');await waitEvent('lock-held','B');await call(c,'write','B',2,false);await call(b,'releaseLock');await waitEvent('lock-released','B');}else await call(b,'write','B',2);if(name==='generation-aba')await call(b,'write','A',3);
     const r=await call(a,'review',old);await check({'stale-evidence':'use-stale-denied','check-then-use':'use-time-denied','generation-aba':'aba-denied','noncooperative-writer':'unannounced-write-denied'}[name],a,r);
    }else if(name==='reload'||name==='close-reconnect'){
     if(name==='reload'){await a.reload();row.transitions.push('reload');await install(a,'A');}else{await call(a,'closeSession');await a.close();row.transitions.push('page-close');a=await newPage('A');}
     await check(name==='reload'?'reload-unknown':'new-tab-unknown',a);const r=await call(a,'review',old);await check(name==='reload'?'reload-old-denied':'new-tab-old-denied',a,r);
    }else if(name==='disconnect-missed'){
     await call(a,'disconnect');await check('disconnected-unknown',a);await call(a,'generate');await call(b,'write','B',2);const id=await call(b,'send');await receive(c,id);const r=await call(a,'review',old+1);await check('missed-change-denied',a,r);await call(a,'reconnect');await check('reconnected-still-invalid',a);
    }else if(name==='close-during-async'||name==='page-close-during-async'){
     await call(a,'beginPaused','review');await waitEvent('read-paused','A');await check('pending-no-authority',a);
     if(name==='close-during-async'){await call(a,'closeSession');const r=await call(a,'resume');await check('closed-late-denied',a,r);}else{const terminated=await snap(a);await a.close();assert.equal(a.isClosed(),true);row.terminatedBoots.push(terminated.boot);row.transitions.push('page-close');a=await newPage('A');await check('replacement-unknown',a);}
    }else if(name==='communication-failure'){
     await call(a,'disconnect');await call(a,'generate');await call(a,'send');await check('communication-unknown',a);
    }else if(name==='unknown-read'){
     await call(a,'fail',true);const r=await call(a,'review');await check('failed-read-denied',a,r);await call(a,'fail',false);await call(a,'review');await check('failure-sticky',a);
    }else if(name==='lock-failure'){
     await call(b,'holdLock');await waitEvent('lock-held','B');const r=await call(a,'review');await check('contended-read-denied',a,r);await call(b,'releaseLock');await waitEvent('lock-released','B');
    }else if(name==='late-older-response'){
     await call(a,'beginPaused','review');await waitEvent('read-paused','A');await call(b,'write','B',2);await call(a,'generate');
     // Pending work keeps reuse disabled until the older response settles.
     const r=await call(a,'resume');await check('new-generation-valid',a);await check('older-result-denied',a,r);assert.equal((await snap(a)).generation,2);
    }
    for(const p of [a,b,c])await call(p,'flush');assert.deepEqual(row.errors,[]);
    for(const p of [a,b,c])await call(p,'closeSession');
    row.cleanup.deleted=await a.evaluate(name=>new Promise((resolve,reject)=>{const r=indexedDB.deleteDatabase(name);r.onsuccess=()=>resolve(true);r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('cleanup-blocked'));}),row.namespace);
    row.cleanup.after=await a.evaluate(async()=>(await indexedDB.databases()).map(d=>d.name).sort());row.cleanup.sentinelAfter=await sentinel(a,row.sentinelName,'read');row.cleanup.localAfter=await a.evaluate(()=>({local:Object.fromEntries(Object.entries(localStorage).sort()),session:Object.fromEntries(Object.entries(sessionStorage).sort())}));
    row.trace={file:`${engine}-${name}.zip`};await context.tracing.stop({path:`${out}/${row.trace.file}`});row.trace.sha256=createHash('sha256').update(await readFile(`${out}/${row.trace.file}`)).digest('hex');await context.close();context=null;row.cleanup.contextClosed=true;row.status='PASS';
   });}catch(e){row.status='FAIL';row.error=String(e);if(context)await context.tracing.stop({path:`${out}/${engine}-${name}-failure.zip`}).catch(()=>{});throw e;}finally{const raw=JSON.stringify(row.events,null,2)+'\n';row.raw={file:`${engine}-${name}-raw.json`,sha256:createHash('sha256').update(raw).digest('hex')};await writeFile(`${out}/${row.raw.file}`,raw);await save();}
  }
  await browser.close();browser=null;
 }
 result.status='PASS';validateMultitabEvidence(result);await verifyArtifactFiles(result,out);result.finishedAt=new Date().toISOString();await save();console.log(JSON.stringify({out,status:result.status,rows:result.rows.length}));
}catch(e){result.status='FAIL';result.error=String(e);await save();console.error(JSON.stringify({out,status:'FAIL',error:String(e)}));process.exitCode=1;}finally{await context?.close();await browser?.close();server?.close();}
