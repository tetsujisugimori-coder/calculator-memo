// Independent native counterexamples. Blank loopback and synthetic data only.
import assert from 'node:assert/strict';
import { build } from 'vite';
import { chromium, webkit } from '../../../../e2e/node_modules/playwright/index.mjs';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
const root = 'docs/maintenance/storage-migration-stage3b5/independent';
const out = `gui-evidence/storage-migration-independent-${randomUUID()}`;
const git = (...a) => execFileSync('git', a, { encoding: 'utf8' }).trim();
const hash = value => createHash('sha256').update(value).digest('hex');
const oldSource = await readFile(`${root}/feedd810-storage-migration.ts.txt`, 'utf8');
const currentSource = await readFile('e2e/fixtures/storage-migration.ts', 'utf8');
const evidence = { kind: 'independent-synthetic-migration', sha: git('rev-parse','HEAD'), tree: git('rev-parse','HEAD^{tree}'), dirty: !!git('status','--porcelain'), oldSha: 'feedd810ee47f19476f56a8c83524b2cb9eebb9e', oldSourceSha256: hash(oldSource), currentSourceSha256: hash(currentSource), executionAllowed: false, results: [] };
await mkdir(out,{recursive:true});
const modules = {};
for (const [label, source] of [['old',oldSource],['current',currentSource]]) {
  const id = '\0independent-entry.ts';
  const output = await build({configFile:false,logLevel:'error',plugins:[{name:'independent-snapshot',resolveId(s){if(s==='independent-entry'||s.endsWith('/independent-entry'))return id;},load(s){if(s===id)return source.replace("from './storage-idb'",`from ${JSON.stringify(resolve('e2e/fixtures/storage-idb.ts'))}`)+`\nexport {createIsolatedAdapter} from ${JSON.stringify(resolve('e2e/fixtures/storage-idb.ts'))};`;}}],build:{write:false,minify:false,lib:{entry:'independent-entry',formats:['es']},rolldownOptions:{output:{codeSplitting:false}}}});
  const chunks=(Array.isArray(output)?output:[output]).flatMap(x=>x.output).filter(x=>x.type==='chunk');assert.equal(chunks.length,1);modules[label]=chunks[0].code;
}
// Exact frozen source identity is checked against a separately recorded digest.
const manifest=JSON.parse(await readFile(`${root}/red-source.json`,'utf8'));
assert.equal(evidence.oldSourceSha256,manifest.sourceSha256);
assert.equal(hash(await readFile('e2e/fixtures/storage-idb.ts')),manifest.adapterSourceSha256,'old/current comparison requires unchanged Stage 3B-4 adapter');
evidence.moduleHashes=Object.fromEntries(Object.entries(modules).map(([k,v])=>[k,hash(v)]));
if(process.env.EXPECTED_SHA)assert.equal(evidence.sha,process.env.EXPECTED_SHA);
if(process.env.GITHUB_ACTIONS==='true')assert.equal(evidence.dirty,false);
if(process.argv.includes('--build-only')){console.log(JSON.stringify({status:'BUNDLE_ONLY_NO_BROWSER_EXECUTED',...evidence},null,2));process.exit(0);}
const server=createServer((req,res)=>{res.setHeader('Cache-Control','no-store');const label=req.url==='/old.mjs'?'old':req.url==='/current.mjs'?'current':null;if(label){res.setHeader('Content-Type','text/javascript');res.end(modules[label]);}else{res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Independent synthetic migration review</title>');}});
server.listen(0,'127.0.0.1');await once(server,'listening');const origin=`http://127.0.0.1:${server.address().port}`;
const assertHold = r => {assert.equal(r.first.state,'UNKNOWN');assert.equal(r.observation.state,'UNKNOWN');assert.equal(r.retry.state,'BLOCKED');assert.equal(r.journal['rescue:second'],undefined);assert.deepEqual(r.before,r.after);};
// This is assertion calibration, not a native-browser result.
assert.throws(()=>assertHold({first:{state:'UNKNOWN'},observation:{state:'READ_ONLY'},retry:{state:'VERIFIED'},journal:{},before:{},after:{}}));
evidence.assertionNegativeControl='detected-lost-hold';
let failed=false;
try {
 for(const [engine,type] of [['chromium',chromium],['webkit',webkit]]) {
  let browser;
  try {
   browser=await type.launch({headless:true});
   for(const [label,scenario] of [['old','diagnostic-loss'],['current','diagnostic-loss'],['current','diagnostic-present'],['current','completed-restart'],['current','queued-close'],['current','request-mutation'],['current','outer-result-loss']]) {
    const record={engine,browserVersion:browser.version(),label,scenario,status:'running'};evidence.results.push(record);
    const context=await browser.newContext({serviceWorkers:'block'});context.setDefaultTimeout(10000);
    await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
    try {
     const page=await context.newPage();await page.goto(origin);await page.evaluate(async label=>{window.api=await import('/'+label+'.mjs');},label);
     const result=await page.evaluate(async scenario=>{
      const E='{"version":1,"history":[],"notes":[],"settings":{"theme":"light","activePanel":"history"}}';
      const A=' \n'+E.slice(0,-1)+',"independent":900719925474099312345}\t',B=A+'\n';
      const name='stage3b4-test-independent-'+crypto.randomUUID(),key='stage3b5-test-independent-'+crypto.randomUUID();
      localStorage.setItem(key,A);const adapter=window.api.createIsolatedAdapter(name);await adapter.initialize(E,'independent-inc',A);const initial=await adapter.inspect(A);adapter.close();
      const read=database=>new Promise((resolve,reject)=>{const r=indexedDB.open(database);r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,tx=db.transaction(db.objectStoreNames[0],'readonly'),store=tx.objectStore(db.objectStoreNames[0]),s={};const c=store.openCursor();c.onsuccess=()=>{if(c.result){s[c.result.key]=c.result.value;c.result.continue();}};tx.oncomplete=()=>{db.close();resolve(s);};tx.onabort=()=>{db.close();reject(tx.error);};};});
      const source={key,getItem:k=>localStorage.getItem(k)},before=await read(name);
      let fault,request;
      if(['diagnostic-loss','diagnostic-present'].includes(scenario))fault=point=>{if(point==='rescue-after-commit'){localStorage.setItem(key,B);throw Error('independent-postappend-loss');}};
      if(scenario==='request-mutation')fault=point=>{if(point==='source-before-read'){request.expectedSourceRaw=B;request.expectedTargetToken.generation=999;request.migrationId='mutated';}};
      let engine=window.api.createMigrationEngine({source,targetName:name,fault});
      if(['diagnostic-loss','diagnostic-present','completed-restart'].includes(scenario)) {
       const nativeAdd=IDBObjectStore.prototype.add;let first;
       try {if(scenario==='diagnostic-loss')IDBObjectStore.prototype.add=function(value,k){if(this.name==='evidence'&&String(k).startsWith('diagnostic:'))throw Error('independent-diagnostic-denied');return nativeAdd.call(this,value,k);};first=await engine.preserveBranches({rescueId:'first'});}finally{IDBObjectStore.prototype.add=nativeAdd;}
       engine.close();engine=window.api.createMigrationEngine({source,targetName:name});const observation=await engine.journalObservation();const retry=await engine.preserveBranches({rescueId:'second'}),journal=await read(name+'-migration'),after=await read(name);engine.close();return{first,observation,retry,journal,before,after,source:localStorage.getItem(key),A,B};
      }
      request={migrationId:'original',expectedSourceRaw:A,expectedTargetRaw:E,expectedTargetToken:structuredClone(initial.token)};
      let result;
      if(scenario==='queued-close') {
       let release,entered;const held=new Promise(r=>release=r),started=new Promise(r=>entered=r);const blocker=navigator.locks.request(name+':migration',async()=>{entered();await held;});await started;const pending=engine.migrate(request);const queue=await navigator.locks.query();if(!queue.pending.some(x=>x.name===name+':migration')){release();await blocker;throw Error('independent-request-not-queued');}engine.close();release();await blocker;result=await pending;
      }else if(scenario==='outer-result-loss') {
       const native=navigator.locks.request.bind(navigator.locks);navigator.locks.request=async(...args)=>{const result=await native(...args);if(args[0]===name+':migration')throw Error('independent-outer-result-loss');return result;};try{result=await engine.migrate(request);}finally{navigator.locks.request=native;}
      }else result=await engine.migrate(request);
      const after=await read(name);engine.close();const fresh=window.api.createMigrationEngine({source,targetName:name}),observation=await fresh.journalObservation(),retry=await fresh.migrate({...request,migrationId:'retry',expectedSourceRaw:A,expectedTargetToken:initial.token});fresh.close();return{result,observation,retry,before,after,A,source:localStorage.getItem(key)};
     },scenario);
     record.observation=result;
     if(scenario==='diagnostic-loss'&&label==='old') {
      assert.equal(result.first.state,'UNKNOWN');assert.equal(result.observation.state,'READ_ONLY');assert.equal(result.retry.state,'VERIFIED');assert.ok(result.journal['rescue:second']);assert.deepEqual(result.before,result.after);
      assert.throws(()=>assertHold(result));record.status='EXPECTED_RED';
     }else if(['diagnostic-loss','diagnostic-present'].includes(scenario)) {assertHold(result);assert.equal(result.source,result.B);record.status='PASS';}
     else if(scenario==='completed-restart'){assert.equal(result.first.state,'VERIFIED');assert.equal(result.observation.state,'UNKNOWN');assert.equal(result.retry.state,'BLOCKED');assert.deepEqual(result.before,result.after);record.status='PASS';}
     else if(scenario==='queued-close'){assert.notEqual(result.result.state,'VERIFIED');assert.deepEqual(result.before,result.after);assert.equal(result.source,result.A);record.status='PASS';}
     else if(scenario==='request-mutation'){assert.equal(result.result.state,'VERIFIED');assert.equal(result.after.current,result.A);assert.equal(result.after.head.latestOperation,'original');assert.equal(result.after['receipt:mutated'],undefined);assert.equal(result.retry.state,'BLOCKED');assert.equal(result.source,result.A);record.status='PASS';}
     else {assert.equal(result.result.state,'UNKNOWN');assert.equal(result.after.current,result.A);assert.equal(result.after.head.generation,1);assert.equal(result.observation.state,'UNKNOWN');assert.equal(result.retry.state,'BLOCKED');record.status='PASS';}
    }catch(e){failed=true;record.status='FAIL';record.error=e.stack||String(e);}finally{await context.close();}
   }
  }catch(e){failed=true;evidence.results.push({engine,status:'ENVIRONMENT_FAILURE',error:e.stack||String(e)});}finally{await browser?.close();}
 }
 if(evidence.results.length!==14)failed=true;
 for(const engine of ['chromium','webkit']){const rows=evidence.results.filter(r=>r.engine===engine);if(rows.length!==7||rows.filter(r=>r.status==='EXPECTED_RED').length!==1||rows.filter(r=>r.status==='PASS').length!==6)failed=true;}
 assert.equal(hash(await readFile('e2e/fixtures/storage-migration.ts')),evidence.currentSourceSha256,'current source changed during review');
}finally{server.closeAllConnections();await new Promise(r=>server.close(r));evidence.status=failed?'FAIL':'PASS';evidence.finishedAt=new Date().toISOString();await writeFile(out+'/summary.json',JSON.stringify(evidence,null,2)+'\n');}
console.log(JSON.stringify({out,status:evidence.status,cases:evidence.results.map(({engine,label,scenario,status,error})=>({engine,label,scenario,status,error}))},null,2));
if(failed)process.exitCode=1;
