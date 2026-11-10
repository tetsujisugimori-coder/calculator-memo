import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { build } from 'vite';
import { chromium, webkit } from './node_modules/playwright/index.mjs';
import { scenarios } from './scenario-config.mjs';
import { validateLifecycleEvidence, CASES } from './storage-decision-lifecycle-evidence.mjs';
const git=(...a)=>execFileSync('git',a,{encoding:'utf8'}).trim();
const sha=git('rev-parse','HEAD'),tree=git('rev-parse','HEAD^{tree}'),hash=x=>createHash('sha256').update(x).digest('hex');
const out=`gui-evidence/decision-lifecycle-${sha.slice(0,12)}-${randomUUID()}`; await mkdir(out,{recursive:true});
const result={kind:'synthetic-decision-lifecycle',status:'running',sha,tree,dirty:!!git('status','--porcelain'),run:process.env.GITHUB_RUN_ID||'local',attempt:process.env.GITHUB_RUN_ATTEMPT||'local',startedAt:new Date().toISOString(),node:process.version,platform:process.platform,rows:[],limitations:['unobserved ABA','nontransactional multi-store capture','TOCTOU after review','physical Safari','media durability','production UI not connected']};
const save=()=>writeFile(`${out}/summary.json`,JSON.stringify(result,null,2));
let server,browser,context;
try {
  assert.equal(sha,process.env.EXPECTED_SHA||sha); assert.equal(result.dirty,false);
  if(process.env.GITHUB_ACTIONS==='true') assert.equal(process.env.WEBKIT_EXECUTABLE_PATH||'','');
  result.webkitOverride=process.env.WEBKIT_EXECUTABLE_PATH||null;
  const built=await build({configFile:false,logLevel:'error',build:{write:false,minify:false,lib:{entry:'e2e/fixtures/storage-decision-lifecycle-browser.ts',formats:['es']},rolldownOptions:{output:{codeSplitting:false}}}});
  const chunks=(Array.isArray(built)?built:[built]).flatMap(x=>x.output).filter(x=>x.type==='chunk'); assert.equal(chunks.length,1);
  const code=chunks[0].code; result.bundleHash=hash(code); await writeFile(`${out}/fixture.mjs.txt`,code);
  server=createServer((req,res)=>{res.setHeader('Cache-Control','no-store'); if(req.url==='/fixture.mjs'){res.setHeader('Content-Type','text/javascript');res.end(code);}else {res.setHeader('Content-Type','text/html');res.end('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Synthetic decision evidence</title><style>body{font:16px sans-serif;margin:12px}button{min-height:44px;margin:4px}pre{white-space:pre-wrap;overflow-wrap:anywhere}</style><h1>合成判断資料・HOLD</h1><p>復元・書込み不可。失効後は明示再生成。</p><button id="generate">新しい資料を生成</button><button id="use">閲覧前に照合</button><pre id="report" aria-live="polite"></pre><script type="module">window.api=await import("/fixture.mjs")</script>');}});
  server.listen(0,'127.0.0.1');await once(server,'listening'); const origin=`http://127.0.0.1:${server.address().port}`;
  for(const scenario of scenarios){
    const row={id:scenario.id,engine:scenario.engine,width:scenario.width,height:scenario.height,dpr:scenario.deviceScaleFactor,status:'running',cases:[],errors:[]};result.rows.push(row);await save();
    browser=await({chromium,webkit}[scenario.engine]).launch({headless:true,...(scenario.engine==='webkit'&&process.env.WEBKIT_EXECUTABLE_PATH?{executablePath:process.env.WEBKIT_EXECUTABLE_PATH}:{})});row.browserVersion=browser.version();
    context=await browser.newContext({viewport:{width:scenario.width,height:scenario.height},deviceScaleFactor:scenario.deviceScaleFactor,isMobile:scenario.isMobile,hasTouch:scenario.hasTouch,serviceWorkers:'block'});await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort()); await context.tracing.start({screenshots:true,snapshots:true,sources:true});
    const page=await context.newPage(),other=await context.newPage();page.on('pageerror',e=>row.errors.push(String(e)));await page.goto(origin);await other.goto(origin);await page.waitForFunction(()=>!!window.api);row.actual=await page.evaluate(()=>({width:innerWidth,height:innerHeight,dpr:devicePixelRatio}));assert.deepEqual(row.actual,{width:scenario.width,height:scenario.height,dpr:scenario.deviceScaleFactor});
    const key='stage3b8-test-'+randomUUID();
    const setup=()=>page.evaluate(key=>{
      window.test?.ui.dispose();
      const original=Storage.prototype.setItem;
      const baseline={request:{scope:{source:'stage3b5-test-life',destination:'stage3b4-test-life'},capture:{source:{kind:'present',value:'{"version":1,"history":[],"notes":[],"settings":{"theme":"light","activePanel":"history"}}'},target:{kind:'absent'},journal:{kind:'absent'}}},revision:'r1',generation:0,authority:{status:'NOT_ESTABLISHED',revision:'a1'},backups:[{id:'b',revision:'r1',raw:'synthetic'}],selection:{ids:[],policy:'all'}};
      if(!window.nativeSet){window.nativeSet=original;window.nativeRemove=Storage.prototype.removeItem;window.nativeClear=Storage.prototype.clear;}
      const t={key,baseline,mutations:0,reads:0,idb:0,write:x=>window.nativeSet.call(localStorage,key,JSON.stringify(x))}; window.test=t;
      Storage.prototype.setItem=function(){t.mutations++;throw Error('unexpected-write');};Storage.prototype.removeItem=function(){t.mutations++;throw Error('unexpected-remove');};Storage.prototype.clear=function(){t.mutations++;throw Error('unexpected-clear');};
      indexedDB.open=function(){t.idb++;throw Error('unexpected-idb');};
      t.write(baseline); t.ui=window.api.mountLifecycle(key);
    },key);
    const status=async expected=>{await page.waitForFunction(expected=>JSON.parse(document.querySelector('#report').textContent).status===expected,expected);const v=await page.evaluate(()=>({view:window.test.ui.lifecycle.view(),ui:JSON.parse(document.querySelector('#report').textContent),mutations:window.test.mutations,idb:window.test.idb}));assert.equal(v.view.status,expected);assert.equal(v.ui.status,expected);assert.equal(v.ui.reusable,v.view.reusable);assert.equal(v.mutations,0);assert.equal(v.idb,0);assert.equal(v.view.executionAllowed,false);assert.equal(v.view.writeAllowed,false);return v;};
    const click=async id=>{if(scenario.hasTouch)await page.locator(id).tap();else await page.locator(id).click();};
    const generate=async()=>{await click('#generate');await page.waitForFunction(()=>window.test.ui.lifecycle.view().reusable);await status('VALID');};
    for(const name of CASES){const c={name,status:'running'};row.cases.push(c);await save();await setup();await generate();
      if(name==='unchanged'){await click('#use');await page.waitForFunction(()=>!window.test.ui.lifecycle.view().checking);await status('VALID');}
      else if(name==='other-tab-storage'){await other.evaluate(({key,value})=>localStorage.setItem(key,JSON.stringify(value)),{key,value:{...await page.evaluate(()=>window.test.baseline),revision:'r2'}});await status('STALE');}
      else if(name==='broadcast'){await other.evaluate(key=>{const ch=new BroadcastChannel(key);ch.postMessage({key});setTimeout(()=>ch.close(),0);},key);await status('STALE');}
      else if(name==='unknown-broadcast'){await other.evaluate(key=>{const ch=new BroadcastChannel(key);ch.postMessage({wrong:'unknown'});setTimeout(()=>ch.close(),0);},key);await status('UNKNOWN');}
      else if(name==='unrelated'){await other.evaluate(()=>localStorage.setItem('stage3b8-test-unrelated','other'));await click('#use');await page.waitForFunction(()=>!window.test.ui.lifecycle.view().checking);await status('VALID');}
      else if(name==='read-failure'){await page.evaluate(()=>window.test.ui.setReadFailure(true));await click('#use');await status('UNKNOWN');await page.evaluate(()=>window.test.ui.setReadFailure(false));await click('#use');await status('UNKNOWN');}
      else if(name==='reload'){await page.reload();await page.waitForFunction(()=>!!window.api);await setup();await status('UNKNOWN');}
      else if(name==='observed-aba'){await page.evaluate(()=>{const t=window.test;t.write({...t.baseline,revision:'b'});t.ui.lifecycle.notifyChange('relevant');t.write(t.baseline);t.ui.render();});await click('#use');await status('STALE');}
      else if(name==='unobserved-aba-limit'){await page.evaluate(()=>{const t=window.test;t.write({...t.baseline,revision:'b'});t.write(t.baseline);});await click('#use');await page.waitForFunction(()=>!window.test.ui.lifecycle.view().checking);await status('VALID');c.limitation='unobserved ABA deliberately undetected';}
      else if(name==='visibility-recheck'){await page.evaluate(()=>{const t=window.test;t.write({...t.baseline,revision:'b'});window.dispatchEvent(new PageTransitionEvent('pageshow'));});await status('STALE');c.event='synthetic pageshow dispatch, not OS hide';}
      else if(name==='new-sheet'){await page.evaluate(()=>{window.test.ui.lifecycle.notifyChange('relevant');window.test.ui.render();});await status('STALE');const old=await page.evaluate(()=>window.test.ui.lifecycle.view().id);await generate();assert.equal((await page.evaluate(id=>window.test.ui.lifecycle.useForReview(id),old)).allowed,false);}
      else {await page.evaluate(name=>{const t=window.test,x=structuredClone(t.baseline);if(name==='data')x.request.capture.source.value='changed';if(name==='backup')x.backups[0].raw='changed';if(name==='backup-delete')x.backups=[];if(name==='generation')x.generation++;if(name==='authority')x.authority.revision='a2';if(name==='selection')x.selection.ids=['n'];t.write(x);},name);await click('#use');await status('STALE');}
      c.observed=await page.evaluate(()=>({status:window.test.ui.lifecycle.view().status,reusable:window.test.ui.lifecycle.view().reusable,uiStatus:JSON.parse(document.querySelector('#report').textContent).status,mutations:window.test.mutations,idb:window.test.idb,executionAllowed:window.test.ui.lifecycle.view().executionAllowed,writeAllowed:window.test.ui.lifecycle.view().writeAllowed}));c.status='PASS';c.finishedAt=new Date().toISOString();await save();
    }
    await setup();await generate(); await page.locator('#use').focus();await page.keyboard.press('Enter');await page.waitForFunction(()=>!window.test.ui.lifecycle.view().checking);await status('VALID');
    const png=`${scenario.id}.png`;await page.screenshot({path:`${out}/${png}`,fullPage:true});row.png={file:png,sha256:hash(await readFile(`${out}/${png}`))};assert.equal(row.errors.length,0);row.status='PASS';await context.tracing.stop();await context.close();context=null;await browser.close();browser=null;await save();
  }
  result.status='PASS';result.finishedAt=new Date().toISOString();validateLifecycleEvidence(result);await save();console.log(JSON.stringify({out,status:result.status,rows:result.rows.length,cases:result.rows.reduce((n,r)=>n+r.cases.length,0)}));
}catch(e){result.status='FAIL';result.error=String(e);await save();if(context)await context.tracing.stop({path:`${out}/failure.zip`}).catch(()=>{});throw e;}finally{await context?.close();await browser?.close();server?.close();}
