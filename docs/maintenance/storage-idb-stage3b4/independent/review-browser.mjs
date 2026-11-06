// Independent counterexamples, reviewed separately from the implementation and author browser matrix.
// Empty synthetic loopback only. This script never loads the product or user data.
import assert from 'node:assert/strict';
import { build } from 'vite';
import { chromium, webkit } from '../../../../e2e/node_modules/playwright/index.mjs';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';
const target = 'e2e/fixtures/storage-idb.ts';
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const hash = x => createHash('sha256').update(x).digest('hex');
const stamp = process.env.INDEPENDENT_REVIEW_LABEL || 'review-' + randomUUID();
const out = `docs/maintenance/storage-idb-stage3b4/independent/${stamp}`;
await mkdir(out, { recursive: true });
const evidence = { reviewer: 'separate-agent-independent_review', sha: git('rev-parse','HEAD'), tree: git('rev-parse','HEAD^{tree}'), dirty: !!git('status','--porcelain'), sourceSha256: hash(await readFile(target)), results: [] };
const output = await build({ configFile:false, logLevel:'error', build:{ write:false, minify:false, lib:{entry:target, formats:['es']}, rolldownOptions:{output:{codeSplitting:false}} } });
const chunks = (Array.isArray(output)?output:[output]).flatMap(x=>x.output).filter(x=>x.type==='chunk');
assert.equal(chunks.length,1); const fixtureModule = chunks[0].code; evidence.moduleSha256 = hash(fixtureModule);
const server = createServer((req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(req.url==='/fixture.mjs'){res.setHeader('Content-Type','text/javascript');res.end(fixtureModule);}
  else{res.setHeader('Content-Type','text/html');res.end('<!doctype html><script type="module">window.api=await import("/fixture.mjs")</script>');}
});
server.listen(0,'127.0.0.1');await once(server,'listening'); const base=`http://127.0.0.1:${server.address().port}/`;
let failed=false;
try{
  for(const [engine,type] of [['chromium',chromium],['webkit',webkit]]){
    let browser;
    try{
      browser=await type.launch({headless:true,...(engine==='chromium'&&process.env.CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.CHROMIUM_EXECUTABLE_PATH}:{})});const context=await browser.newContext();const page=await context.newPage();
      await context.route('**/*',route=>new URL(route.request().url()).origin===new URL(base).origin?route.continue():route.abort());
      await page.goto(base);await page.waitForFunction(()=>!!window.api);
      const record={engine,version:browser.version(),status:'running',cases:[]};evidence.results.push(record);
      const run=async(name,fn)=>{const item={name,status:'running'};record.cases.push(item);try{item.observation=await fn();item.status='PASS';}catch(e){failed=true;item.status='FAIL';item.error=e.stack||String(e);}};
      await run('outer-lock-result-loss-persists-UNKNOWN-before-new-instance',async()=>{
        const observation=await page.evaluate(async()=>{
          const A=' {"version":1,"history":[],"notes":[],"settings":{"theme":"light","activePanel":"history"},"independent":"A"} ';
          const B=A.replace('"A"','"B"'),C=A.replace('"A"','"C"');
          const name='stage3b4-test-independent-'+crypto.randomUUID(),adapter=window.api.createIsolatedAdapter(name);
          const created=await adapter.initialize(A,'independent-inc',A);const initial=await adapter.inspect(A);
          const confirmation=await adapter.authorize({token:initial.token,raw:A,legacyRaw:A});
          const nativeRequest=navigator.locks.request.bind(navigator.locks);
          navigator.locks.request=async(...args)=>{await nativeRequest(...args);throw Error('independent-lost-lock-result-after-callback');};
          let original;
          try{original=await adapter.save({protocol:1,expected:initial.token,expectedRaw:A,candidateRaw:B,operationId:'lost-result',legacyRaw:A});}finally{navigator.locks.request=nativeRequest;}
          adapter.close();
          const fresh=window.api.createIsolatedAdapter(name),recovery=await fresh.inspect(A);
          const authorize=await fresh.authorize({token:recovery.token,raw:B,legacyRaw:A});
          const next=await fresh.save({protocol:1,expected:recovery.token,expectedRaw:B,candidateRaw:C,operationId:'must-not-save',legacyRaw:A});
          const final=await fresh.inspect(A);fresh.close();
          return {created,confirmation,original,recovery,authorize,next,final};
        });
        await writeFile(`${out}/${engine}-outer-lock-observation.json`,JSON.stringify(observation,null,2)+'\n');
        assert.equal(observation.original.status,'UNKNOWN');
        assert.ok(['HOLD','UNKNOWN'].includes(observation.recovery.state),'new instance must preserve original UNKNOWN');
        assert.equal(observation.authorize.status,'BLOCKED','unresolved original failure must block session authorization');
        assert.equal(observation.next.status,'BLOCKED');assert.equal(observation.final.token.generation,1);
        return observation;
      });
      await run('outer-lock-result-and-diagnostic-loss-preserve-stop-on-restart',async()=>{
        const observation=await page.evaluate(async()=>{
          const A=' {"version":1,"history":[],"notes":[],"settings":{"theme":"light","activePanel":"history"}} ';
          const B=A+'\n',name='stage3b4-test-lost-diagnostics-'+crypto.randomUUID();
          const adapter=window.api.createIsolatedAdapter(name,{fault:point=>{if(point==='diagnostic-put')throw Error('independent-diagnostic-unavailable');}});
          await adapter.initialize(A,'lost-diagnostic-inc',A);const initial=await adapter.inspect(A);
          await adapter.authorize({token:initial.token,raw:A,legacyRaw:A});
          const nativeRequest=navigator.locks.request.bind(navigator.locks);
          navigator.locks.request=async(...args)=>{await nativeRequest(...args);throw Error('independent-lost-result-no-diagnostic');};
          let original;try{original=await adapter.save({protocol:1,expected:initial.token,expectedRaw:A,candidateRaw:B,operationId:'lost-both',legacyRaw:A});}finally{navigator.locks.request=nativeRequest;}
          adapter.close();const fresh=window.api.createIsolatedAdapter(name),recovery=await fresh.inspect(A);
          const authorization=await fresh.authorize({token:recovery.token,raw:B,legacyRaw:A});fresh.close();return {original,recovery,authorization};
        });
        assert.equal(observation.original.status,'UNKNOWN');assert.ok(observation.original.phases.includes('DIAGNOSTIC_UNAVAILABLE'));
        assert.equal(observation.recovery.state,'HOLD');assert.equal(observation.authorization.status,'BLOCKED');
        assert.equal(observation.recovery.snapshot['intent:lost-both'].phase,'READBACK_MATCH');
        assert.equal(observation.recovery.snapshot['diagnostic:lost-both'],undefined);
        return observation;
      });
      await run('preauthorized-other-tab-stale-conflict-fresh-token-HOLD',async()=>{
        const other=await context.newPage();await other.goto(base);await other.waitForFunction(()=>!!window.api);
        const name='stage3b4-test-independent-two-tabs-'+randomUUID();
        const A=' {"version":1,"history":[],"notes":[],"settings":{"theme":"light","activePanel":"history"}} ';
        const B=A+'\n',C=A+'\t';
        await page.evaluate(async({name,A})=>{window.independent=window.api.createIsolatedAdapter(name);await window.independent.initialize(A,'two-page-inc',A);window.initial=await window.independent.inspect(A);window.auth=await window.independent.authorize({token:window.initial.token,raw:A,legacyRaw:A});},{name,A});
        await other.evaluate(async({name,A})=>{window.independent=window.api.createIsolatedAdapter(name);window.initial=await window.independent.inspect(A);window.auth=await window.independent.authorize({token:window.initial.token,raw:A,legacyRaw:A});},{name,A});
        const winner=await page.evaluate(({A,B})=>window.independent.save({protocol:1,expected:window.initial.token,expectedRaw:A,candidateRaw:B,operationId:'native-winner',legacyRaw:A}),{A,B});
        const stale=await other.evaluate(({A,C})=>window.independent.save({protocol:1,expected:window.initial.token,expectedRaw:A,candidateRaw:C,operationId:'stale-retry',legacyRaw:A}),{A,C});
        const fresh=await other.evaluate(async({A,B,C})=>{const current=await window.independent.inspect(A);return window.independent.save({protocol:1,expected:current.token,expectedRaw:B,candidateRaw:C,operationId:'fresh-other-tab',legacyRaw:A});},{A,B,C});
        const own=await page.evaluate(async({A,B,C})=>{const current=await window.independent.inspect(A);return window.independent.save({protocol:1,expected:current.token,expectedRaw:B,candidateRaw:C,operationId:'own-next',legacyRaw:A});},{A,B,C});
        await page.evaluate(()=>window.independent.close());await other.evaluate(()=>window.independent.close());await other.close();
        const observation={winner,stale,fresh,own};assert.equal(winner.status,'VERIFIED');assert.equal(stale.status,'CONFLICT');assert.equal(fresh.status,'BLOCKED');assert.equal(own.status,'VERIFIED');assert.equal(own.token.generation,2);return observation;
      });
      await run('known-lock-rejection-fences-delayed-running-callback',async()=>{
        const observation=await page.evaluate(async()=>{
          const A=' {"version":1,"history":[],"notes":[],"settings":{"theme":"light","activePanel":"history"}} ';
          const B=A+'\n',name='stage3b4-test-delayed-callback-'+crypto.randomUUID();const adapter=window.api.createIsolatedAdapter(name);
          await adapter.initialize(A,'delayed-inc',A);const initial=await adapter.inspect(A);await adapter.authorize({token:initial.token,raw:A,legacyRaw:A});
          const originalRequest=navigator.locks.request.bind(navigator.locks);let continued;
          navigator.locks.request=(_name,callback)=>{continued=callback({name:_name,mode:'exclusive'});return Promise.reject(Error('independent-early-coordinator-rejection'));};
          let original;try{original=await adapter.save({protocol:1,expected:initial.token,expectedRaw:A,candidateRaw:B,operationId:'delayed-op',legacyRaw:A});await continued;}finally{navigator.locks.request=originalRequest;}
          const final=await adapter.inspect(A);adapter.close();return {original,final};
        });
        await writeFile(`${out}/${engine}-delayed-callback-observation.json`,JSON.stringify(observation,null,2)+'\n');
        assert.equal(observation.final.raw,' {"version":1,"history":[],"notes":[],"settings":{"theme":"light","activePanel":"history"}} ');
        assert.equal(observation.final.token.generation,0,'no delayed primary mutation after known coordinator failure');
        assert.equal(observation.final.snapshot['receipt:delayed-op'],undefined);
        return observation;
      });
      await run('close-and-reauthorize-does-not-revive-queued-old-save',async()=>{
        const observation=await page.evaluate(async()=>{
          const A=' {"version":1,"history":[],"notes":[],"settings":{"theme":"light","activePanel":"history"}} ',B=A+'\n';
          const name='stage3b4-test-session-queue-'+crypto.randomUUID(),adapter=window.api.createIsolatedAdapter(name);
          await adapter.initialize(A,'session-queue-inc',A);const initial=await adapter.inspect(A);await adapter.authorize({token:initial.token,raw:A,legacyRaw:A});
          let release,entered;const held=new Promise(resolve=>{release=resolve;}),started=new Promise(resolve=>{entered=resolve;});
          const blocker=navigator.locks.request(name+':coordinator',async()=>{entered();await held;});await started;
          const oldSave=adapter.save({protocol:1,expected:initial.token,expectedRaw:A,candidateRaw:B,operationId:'old-queued',legacyRaw:A});
          const queued=await navigator.locks.query();
          if(!queued.pending.some(x=>x.name===name+':coordinator')){release();await blocker;throw Error('independent fixture never queued the old save');}
          adapter.close();const renewed=await adapter.authorize({token:initial.token,raw:A,legacyRaw:A});release();await blocker;
          const oldOutcome=await oldSave,final=await adapter.inspect(A);adapter.close();return {queued,renewed,oldOutcome,final};
        });
        await writeFile(`${out}/${engine}-session-queue-observation.json`,JSON.stringify(observation,null,2)+'\n');
        assert.equal(observation.renewed.status,'AUTHORIZED','fresh explicit authorization is independent from the revoked request');
        assert.equal(observation.oldOutcome.status,'BLOCKED','revoked queued save must retain its original session');
        assert.equal(observation.final.token.generation,0);assert.equal(observation.final.snapshot['intent:old-queued'],undefined);
        return observation;
      });
      await run('close-during-native-authorize-cannot-authorize-old-session',async()=>{
        const observation=await page.evaluate(async()=>{
          const A=' {"version":1,"history":[],"notes":[],"settings":{"theme":"light","activePanel":"history"}} ',B=A+'\n';
          const name='stage3b4-test-session-authorize-'+crypto.randomUUID(),adapter=window.api.createIsolatedAdapter(name);
          await adapter.initialize(A,'session-authorize-inc',A);const initial=await adapter.inspect(A);
          const nativeTransaction=IDBDatabase.prototype.transaction;let entered,armed=true;const started=new Promise(resolve=>{entered=resolve;});
          IDBDatabase.prototype.transaction=function(...args){const tx=nativeTransaction.apply(this,args);if(armed&&tx.mode==='readonly'){armed=false;entered();}return tx;};
          let authorization;
          try{const pending=adapter.authorize({token:initial.token,raw:A,legacyRaw:A});await started;adapter.close();authorization=await pending;}finally{IDBDatabase.prototype.transaction=nativeTransaction;}
          const oldOutcome=await adapter.save({protocol:1,expected:initial.token,expectedRaw:A,candidateRaw:B,operationId:'after-revoked-authorize',legacyRaw:A});
          const final=await adapter.inspect(A);adapter.close();return {authorization,oldOutcome,final};
        });
        await writeFile(`${out}/${engine}-session-authorize-observation.json`,JSON.stringify(observation,null,2)+'\n');
        assert.notEqual(observation.authorization.status,'AUTHORIZED','authorization crossing close must be revoked');
        assert.equal(observation.oldOutcome.status,'BLOCKED');assert.equal(observation.final.token.generation,0);
        return observation;
      });
      await run('close-after-native-callback-before-coordinator-result-is-UNKNOWN',async()=>{
        const observation=await page.evaluate(async()=>{
          const A=' {"version":1,"history":[],"notes":[],"settings":{"theme":"light","activePanel":"history"}} ',B=A+'\n';
          const name='stage3b4-test-session-postcallback-'+crypto.randomUUID(),adapter=window.api.createIsolatedAdapter(name);
          await adapter.initialize(A,'postcallback-inc',A);const initial=await adapter.inspect(A);await adapter.authorize({token:initial.token,raw:A,legacyRaw:A});
          const nativeRequest=navigator.locks.request.bind(navigator.locks);let callbackOutcome;
          navigator.locks.request=async(...args)=>{const outcome=await nativeRequest(...args);callbackOutcome=outcome;adapter.close();return outcome;};
          let original;try{original=await adapter.save({protocol:1,expected:initial.token,expectedRaw:A,candidateRaw:B,operationId:'close-before-result',legacyRaw:A});}finally{navigator.locks.request=nativeRequest;}
          const fresh=window.api.createIsolatedAdapter(name),recovered=await fresh.inspect(A),authorization=await fresh.authorize({token:recovered.token,raw:B,legacyRaw:A});fresh.close();adapter.close();
          return {callbackOutcome,original,recovered,authorization};
        });
        await writeFile(`${out}/${engine}-session-postcallback-observation.json`,JSON.stringify(observation,null,2)+'\n');
        assert.equal(observation.callbackOutcome.status,'VERIFIED');assert.equal(observation.original.status,'UNKNOWN','revoked session cannot expose a successful coordinator result');
        assert.equal(observation.recovered.token.generation,1);assert.equal(observation.recovered.state,'HOLD');assert.equal(observation.authorization.status,'BLOCKED');
        assert.equal(observation.recovered.snapshot['intent:close-before-result'].phase,'UNKNOWN');
        assert.equal(observation.recovered.snapshot['diagnostic:close-before-result'].status,'UNKNOWN');
        return observation;
      });
      await run('readonly-inspect-does-not-initialize-or-upgrade-absent-database',async()=>{
        const observation=await page.evaluate(async()=>{
          const probe = name => new Promise((resolve,reject)=>{
            const request=indexedDB.open(name);let observation;
            request.onupgradeneeded=event=>{observation={kind:'upgrade',oldVersion:event.oldVersion,newVersion:event.newVersion,stores:Array.from(request.result.objectStoreNames)};request.transaction.abort();};
            request.onsuccess=()=>{const db=request.result;observation={kind:'existing',version:db.version,stores:Array.from(db.objectStoreNames)};db.close();resolve(observation);};
            request.onerror=()=>observation?resolve({...observation,error:request.error?.name}):reject(request.error);
          });
          const name='stage3b4-test-absent-'+crypto.randomUUID();const adapter=window.api.createIsolatedAdapter(name);const result=await adapter.inspect('{}');adapter.close();
          const listed=await indexedDB.databases(),absentProbe=await probe(name);
          const controlName='stage3b4-test-probe-control-'+crypto.randomUUID(),control=window.api.createIsolatedAdapter(controlName);
          const raw='{"version":1,"history":[],"notes":[],"settings":{"theme":"light","activePanel":"history"}}';
          const initialized=await control.initialize(raw,'probe-control-inc',raw);control.close();const existingProbe=await probe(controlName);
          return {name,result,listed,absentProbe,initialized,existingProbe};
        });
        await writeFile(`${out}/${engine}-absent-database-observation.json`,JSON.stringify(observation,null,2)+'\n');
        assert.equal(observation.result.state,'UNKNOWN');
        assert.deepEqual(observation.absentProbe,{kind:'upgrade',oldVersion:0,newVersion:1,stores:[],error:'AbortError'});
        assert.equal(observation.initialized.status,'CREATED');assert.deepEqual(observation.existingProbe,{kind:'existing',version:1,stores:['records']});
        // Enumeration is diagnostic: older pinned WebKit may list an aborted version-0 placeholder.
        // The independent protocol probe above must still distinguish any committed schema.
        return observation;
      });
      assert.equal(record.cases.length,8,'all eight independent browser counterexamples must run');
      assert.equal(new Set(record.cases.map(x=>x.name)).size,8,'independent case identities must be unique');
      record.status=record.cases.every(x=>x.status==='PASS')?'PASS':'FAIL';await context.close();
    }catch(e){failed=true;evidence.results.push({engine,status:'ENVIRONMENT_FAILURE',error:e.stack||String(e)});}finally{await browser?.close();}
  }
}finally{server.close();evidence.status=failed?'FAIL':'PASS';evidence.finishedAt=new Date().toISOString();await writeFile(`${out}/summary.json`,JSON.stringify(evidence,null,2)+'\n');}
console.log(JSON.stringify({out,status:evidence.status,results:evidence.results.map(x=>({engine:x.engine,status:x.status,cases:x.cases?.map(c=>({name:c.name,status:c.status,error:c.error}))}))},null,2));
if(failed)process.exitCode=1;
