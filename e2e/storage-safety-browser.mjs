// Dedicated empty origin; no product app, cookies, user profile or production key.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { build } from 'esbuild';
import { chromium, webkit } from './node_modules/playwright/index.mjs';
import { validateStorageResults } from './storage-safety-contract.mjs';
const sha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const tree=execFileSync('git',['rev-parse','HEAD^{tree}'],{encoding:'utf8'}).trim();
const dirty=!!execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim();
assert.equal(sha,process.env.EXPECTED_SHA||sha);
if(process.env.GITHUB_ACTIONS==='true')assert.equal(dirty,false,'exact committed source required');
const out=`gui-evidence/storage-safety-${sha.slice(0,12)}-${new Date().toISOString().replace(/[:.]/g,'-')}-${randomUUID()}`;
await mkdir('gui-evidence',{recursive:true});await mkdir(out);
await build({entryPoints:['tests/storage-safety/browser-fixture.ts'],bundle:true,format:'esm',platform:'browser',outfile:`${out}/fixture.bundle.txt`});
const script=await readFile(`${out}/fixture.bundle.txt`);
const provenance={sha,tree,dirty,node:process.version,platform:process.platform,run:process.env.GITHUB_RUN_ID||'local',attempt:process.env.GITHUB_RUN_ATTEMPT||'local',bundleSha256:createHash('sha256').update(script).digest('hex')};
await writeFile(`${out}/provenance.json`,JSON.stringify(provenance,null,2)+'\n',{flag:'wx'});
const server=createServer((req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(req.url==='/fixture.js'){res.setHeader('Content-Type','text/javascript');res.end(script);}
  else if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Stage3B isolated synthetic storage</title><script type="module">window.api=await import("/fixture.js");</script>');}
  else{res.statusCode=404;res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url=`http://127.0.0.1:${server.address().port}/`;
const results=[];
try {
  const names=process.env.STORAGE_SAFETY_ENGINES?.split(',')||['chromium','webkit'];
  assert.ok(names.length>0&&new Set(names).size===names.length&&names.every(n=>['chromium','webkit'].includes(n)));
  for(const name of names){
    let browser;
    const result={engine:name,status:'FAILED',cases:[]}; results.push(result);
    try{
      browser=await ({chromium,webkit}[name]).launch({headless:true});result.version=browser.version();
      const context=await browser.newContext();
      const page=await context.newPage(), second=await context.newPage();
      const errors=[];page.on('pageerror',e=>errors.push(e.message));second.on('pageerror',e=>errors.push(e.message));
      await Promise.all([page.goto(url),second.goto(url)]);
      await Promise.all([page.waitForFunction(()=>!!window.api),second.waitForFunction(()=>!!window.api)]);
      const namespace='stage3b-test-'+randomUUID()+'-';
      result.cases=await page.evaluate(ns=>window.api.suite(ns),namespace);
      assert.equal(result.cases.length,16);
      // Two actual pages sharing a Web Lock, followed by a real storage event.
      const shared=namespace+'cross:';
      await page.evaluate(ns=>{
        window.held=false;window.release=undefined;window.events=0;
        window.f=window.api.makeBrowserFixture(ns,async phase=>{
          if(phase==='PRESERVED'){window.held=true;await new Promise(r=>window.release=r);}
        });
        window.addEventListener('storage',e=>{if(e.key===ns+window.api.STORAGE_KEY){window.f.context.epoch++;window.events++;}});
        window.pending=window.f.c.selection('cross',window.f.candidate,window.f.read).then(r=>window.outcome=r);
      },shared);
      await page.waitForFunction(()=>window.held&&!!window.release);
      const other=await second.evaluate(async ns=>{
        const s=window.api.isolatedStore(localStorage,ns);
        const c=new window.api.StorageSafetyCoordinator(s,window.api.webExclusive(navigator.locks));
        const r=await c.ordinary('ordinary-other',s.getItem(window.api.STORAGE_KEY),s.getItem(window.api.STORAGE_KEY));
        // This bypasses Web Locks intentionally and really changes localStorage.
        s.setItem(window.api.STORAGE_KEY,'other-page-new-value');
        return r.phase;
      },shared);
      assert.equal(other,'REFUSED');await page.waitForFunction(()=>window.events>0);
      await page.evaluate(()=>window.release());
      const cross=await page.evaluate(async()=>{await window.pending;return {phase:window.outcome.phase,events:window.events};});
      assert.equal(cross.phase,'REFUSED');assert.ok(cross.events>0);
      result.cases.push({name:'cross-page-web-lock-and-storage-event',...cross});
      // A real Web Locks steal rejects the outer request while its async callback
      // is still paused. Once that loss is known, a late resume must do no IO.
      await page.evaluate(ns=>{
        window.held=false;window.resumed=false;window.lostOutcome=undefined;window.primaryCalls=0;
        window.f=window.api.makeBrowserFixture(ns,async phase=>{
          if(phase==='WRITING'){window.held=true;await new Promise(r=>window.release=r);window.resumed=true;}
        },s=>({getItem:k=>s.getItem(k),setItem:(k,v)=>{if(k===window.api.STORAGE_KEY)window.primaryCalls++;s.setItem(k,v);}}));
        window.primaryCalls=0;
        window.pending=window.f.c.selection('stolen',window.f.candidate,window.f.read).then(r=>window.lostOutcome=r);
      },namespace+'stolen:');
      await page.waitForFunction(()=>window.held);
      await second.evaluate(()=>navigator.locks.request(window.api.LOCK_NAME,{steal:true},()=>{}));
      await page.waitForFunction(()=>!!window.lostOutcome);
      const lossPhase=await page.evaluate(()=>window.lostOutcome.phase);assert.equal(lossPhase,'UNKNOWN');
      await page.evaluate(()=>window.release());await page.waitForFunction(()=>window.resumed);
      const fenced=await page.evaluate(()=>({phase:window.lostOutcome.phase,primaryCalls:window.primaryCalls,originalStillPresent:window.f.store.getItem(window.api.STORAGE_KEY)===window.f.original}));
      assert.deepEqual(fenced,{phase:'UNKNOWN',primaryCalls:0,originalStillPresent:true});
      result.cases.push({name:'actual-web-lock-steal-fences-suspended-writer',...fenced});
      // Close the actual producer page while suspended AFTER persisted write
      // intent. No catch/finally or synthetic exception is allowed to finalize it.
      const crash=namespace+'crash:';
      await page.evaluate(ns=>{
        window.f=window.api.makeBrowserFixture(ns,phase=>phase==='WRITING'?new Promise(()=>{}):undefined);
        window.pending=window.f.c.selection('interrupted',window.f.candidate,window.f.read);
      },crash);
      await second.waitForFunction(ns=>{
        const raw=localStorage.getItem(ns+window.api.LEDGER_KEY);
        return raw&&JSON.parse(raw).records[0].phase==='WRITING';
      },crash);
      await page.close();
      const restarted=await second.evaluate(async ns=>{
        const s=window.api.isolatedStore(localStorage,ns);
        const c=new window.api.StorageSafetyCoordinator(s,window.api.webExclusive(navigator.locks));
        const records=c.inspect();
        const next=await c.ordinary('restart',s.getItem(window.api.STORAGE_KEY),s.getItem(window.api.STORAGE_KEY));
        return {phase:records[0].phase,next:next.phase,originalStillPresent:s.getItem(window.api.STORAGE_KEY)===records[0].original};
      },crash);
      assert.deepEqual(restarted,{phase:'UNKNOWN',next:'REFUSED',originalStillPresent:true});
      result.cases.push({name:'actual-page-close-after-intent',...restarted});
      assert.deepEqual(errors,[]);result.pageerrors=errors;result.status='PASS';
      await context.close();
    }catch(e){result.status='FAILED';result.error=String(e.stack||e);process.exitCode=1;}
    finally{await browser?.close();await writeFile(`${out}/${name}.json`,JSON.stringify(result,null,2)+'\n',{flag:'wx'});}
  }
  const errors=validateStorageResults(results,names);
  if(errors.length){console.error(errors);process.exitCode=1;}
}finally{
  await new Promise(resolve=>server.close(resolve));
  await writeFile(`${out}/summary.json`,JSON.stringify({provenance,results,status:process.exitCode?'FAIL':'PASS',scope:'isolated synthetic origin; observation only; executionAllowed=false'},null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({out,results},null,2));
}
