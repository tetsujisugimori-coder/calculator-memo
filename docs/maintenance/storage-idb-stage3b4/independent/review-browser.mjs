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
      await run('readonly-inspect-does-not-create-absent-database',async()=>{
        const observation=await page.evaluate(async()=>{
          const name='stage3b4-test-absent-'+crypto.randomUUID();const adapter=window.api.createIsolatedAdapter(name);const result=await adapter.inspect('{}');adapter.close();
          return {name,result,listed:await indexedDB.databases()};
        });
        assert.equal(observation.result.state,'UNKNOWN');assert.equal(observation.listed.some(x=>x.name===observation.name),false);return observation;
      });
      record.status=record.cases.every(x=>x.status==='PASS')?'PASS':'FAIL';await context.close();
    }catch(e){failed=true;evidence.results.push({engine,status:'ENVIRONMENT_FAILURE',error:e.stack||String(e)});}finally{await browser?.close();}
  }
}finally{server.close();evidence.status=failed?'FAIL':'PASS';evidence.finishedAt=new Date().toISOString();await writeFile(`${out}/summary.json`,JSON.stringify(evidence,null,2)+'\n');}
console.log(JSON.stringify({out,status:evidence.status,results:evidence.results.map(x=>({engine:x.engine,status:x.status,cases:x.cases?.map(c=>({name:c.name,status:c.status,error:c.error}))}))},null,2));
if(failed)process.exitCode=1;
