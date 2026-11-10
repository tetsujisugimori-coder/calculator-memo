import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {build} from 'vite';
import {chromium,webkit} from './node_modules/playwright/index.mjs';
import {scenarios} from './scenario-config.mjs';
import {validateRaceEvidence,CASES} from './storage-recovery-races-evidence.mjs';
import {pendingControls} from './recovery-races-pending-controls.mjs';
const git=(...x)=>execFileSync('git',x,{encoding:'utf8'}).trim(),hash=x=>createHash('sha256').update(x).digest('hex');
const sha=git('rev-parse','HEAD'),out=`gui-evidence/recovery-races-${sha.slice(0,12)}-${randomUUID()}`;await mkdir(out,{recursive:true});
const result={kind:'synthetic-recovery-races',sha,tree:git('rev-parse','HEAD^{tree}'),dirty:!!git('status','--porcelain'),status:'running',run:process.env.GITHUB_RUN_ID||'local',attempt:process.env.GITHUB_RUN_ATTEMPT||'local',startedAt:new Date().toISOString(),node:process.version,platform:process.platform,rows:[]};
const save=()=>writeFile(`${out}/summary.json`,JSON.stringify(result,null,2));let server,browser,context;
try{
 assert.equal(sha,process.env.EXPECTED_SHA||sha);assert.equal(result.dirty,false);
 const built=await build({configFile:false,logLevel:'error',build:{write:false,minify:false,lib:{entry:'e2e/fixtures/storage-recovery-races.ts',formats:['es']},rolldownOptions:{output:{codeSplitting:false}}}});
 const chunks=(Array.isArray(built)?built:[built]).flatMap(x=>x.output).filter(x=>x.type==='chunk');assert.equal(chunks.length,1);const code=chunks[0].code;result.bundleHash=hash(code);await writeFile(`${out}/fixture.mjs.txt`,code);
 server=createServer((req,res)=>{res.setHeader('Cache-Control','no-store');if(req.url==='/fixture.mjs'){res.setHeader('Content-Type','text/javascript');res.end(code);}else{res.setHeader('Content-Type','text/html');res.end(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Synthetic races HOLD</title><style>body{font:16px sans-serif;margin:12px}button,select{min-height:44px;max-width:100%}pre{white-space:pre-wrap;overflow-wrap:anywhere}</style><h1>合成・隔離競合検証</h1><p>HOLD / 復元・書込み不可。模擬タブ・制御された遅延。実媒体・連続運用の安全保証ではない。</p><select id="case" aria-label="試験条件"></select><button id="run">選択条件を明示検証</button><pre id="result" aria-live="polite">未実施</pre><script type="module">import{RACE_CASES,runRace}from'/fixture.mjs';window.writes=0;for(const k of ['setItem','removeItem','clear'])Storage.prototype[k]=()=>{window.writes++;throw Error('storage forbidden')};indexedDB.open=()=>{window.writes++;throw Error('IDB forbidden')};for(const name of RACE_CASES){const o=document.createElement('option');o.value=o.textContent=name;document.querySelector('#case').append(o)}document.querySelector('#run').onclick=async()=>{window.result=null;document.querySelector('#result').textContent='検証中';try{window.result=await runRace(document.querySelector('#case').value);document.querySelector('#result').textContent=JSON.stringify(window.result,null,2)}catch(e){window.result={status:'FAIL',error:String(e)};document.querySelector('#result').textContent=JSON.stringify(window.result)}};window.ready=true;</script>`);}});server.listen(0,'127.0.0.1');await once(server,'listening');const origin=`http://127.0.0.1:${server.address().port}`;
 for(const s of scenarios){
  const row={id:s.id,engine:s.engine,width:s.width,height:s.height,dpr:s.deviceScaleFactor,status:'running',cases:[],errors:[]};result.rows.push(row);await save();
  if(process.env.GITHUB_ACTIONS==='true')assert.equal(process.env.WEBKIT_EXECUTABLE_PATH||'','');
  browser=await({chromium,webkit}[s.engine]).launch({headless:true,...(s.engine==='webkit'&&process.env.WEBKIT_EXECUTABLE_PATH?{executablePath:process.env.WEBKIT_EXECUTABLE_PATH}:{})});row.browserVersion=browser.version();
  context=await browser.newContext({viewport:{width:s.width,height:s.height},deviceScaleFactor:s.deviceScaleFactor,isMobile:s.isMobile,hasTouch:s.hasTouch,serviceWorkers:'block'});await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());await context.tracing.start({screenshots:true,snapshots:true,sources:true});const page=await context.newPage();page.on('pageerror',e=>row.errors.push(String(e)));await page.goto(origin);await page.waitForFunction(()=>window.ready);
  row.actual=await page.evaluate(()=>({width:innerWidth,height:innerHeight,dpr:devicePixelRatio}));
  for(const name of CASES){await page.selectOption('#case',name);if(s.hasTouch)await page.locator('#run').tap();else await page.locator('#run').click();await page.waitForFunction(()=>window.result);const r=await page.evaluate(()=>window.result);assert.equal(r.status,'PASS');row.cases.push(r);assert.equal(await page.evaluate(()=>window.writes),0);await save();}
  await page.locator('#run').focus();await page.keyboard.press('Enter');await page.waitForFunction(()=>window.result);assert.equal(await page.evaluate(()=>window.result.status),'PASS');row.writes=await page.evaluate(()=>window.writes);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);const file=`${s.id}.png`;await page.screenshot({path:`${out}/${file}`,fullPage:true});row.png={file,sha256:hash(await readFile(`${out}/${file}`))};const trace=`${s.id}.zip`;await context.tracing.stop({path:`${out}/${trace}`});row.trace={file:trace,sha256:hash(await readFile(`${out}/${trace}`))};row.status='PASS';await context.close();context=null;await browser.close();browser=null;await save();
 }
 result.status='PASS';result.finishedAt=new Date().toISOString();validateRaceEvidence(result);await writeFile(`${out}/pending-controls.json`,JSON.stringify(pendingControls(result),null,2));await save();console.log(JSON.stringify({out,status:'PASS',rows:result.rows.length,cases:result.rows.reduce((n,r)=>n+r.cases.length,0)}));
}catch(e){result.status='FAIL';result.error=String(e);await save();if(context)await context.tracing.stop({path:`${out}/failure.zip`}).catch(()=>{});throw e;}finally{await context?.close();await browser?.close();server?.close();}
