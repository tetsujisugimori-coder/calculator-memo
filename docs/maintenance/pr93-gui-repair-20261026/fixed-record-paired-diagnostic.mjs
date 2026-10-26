// Diagnostic only: real app/synthetic fixture, not a substitute for formal six-condition CI.
// Run from repository root. No product state is persisted outside the fresh browser context.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { spawn, execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
const repo=process.env.CALCULATOR_REPO || process.cwd();
const { webkit, expect }=await import(pathToFileURL(repo+'/e2e/node_modules/@playwright/test/index.mjs'));
const source=await readFile(repo+'/e2e/audit-record-comparison.mjs','utf8');
const body=source.slice(source.indexOf('export async function'),source.indexOf('  const second = await context.newPage();')).replace('export async function','async function')+`  await open(); await select(); await click('選択した2記録を比較'); await expect(result()).toContainText('変更あり'); return {click,result,comparison};\n}`;
const scenario={id:'webkit-mobile-'+(process.env.WIDTH||390)+'px',width:Number(process.env.WIDTH||390),height:process.env.WIDTH==='375'?667:844,deviceScaleFactor:process.env.WIDTH==='375'?2:3};
const out=process.env.OUT||'/tmp/pr93-quote-timing.json', port=Number(process.env.PORT||4396),base=`http://127.0.0.1:${port}/calculator-memo/`;
const report={diagnosticOnly:true,exportDiagnosticSuccessTrace:process.env.DIAGNOSTIC_EXPORT_TRACE==='1',buildDirectory:process.env.DIAGNOSTIC_DIST||repo+'/dist-pages',sourceSha:execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim(),scenario,variant:process.env.VARIANT||'baseline',diagnosticScriptSha256:createHash('sha256').update(await readFile(new URL(import.meta.url))).digest('hex'),fixtureSourceSha256:createHash('sha256').update(source).digest('hex'),pairedConditions:process.env.PAIRED_CONDITIONS||'baseline,no-blur,baseline,nested-only,baseline,nested-only',roundTrips:process.env.PAIRED_ROUND_TRIPS==='1',startedAt:new Date().toISOString(),events:[],checks:[],resources:[],errors:[],apiTimings:[]};
const save=()=>writeFile(out,JSON.stringify(report,null,2));
const server=spawn(process.execPath,[repo+'/node_modules/vite/bin/vite.js','preview','--config','vite.pages.config.ts','--host','127.0.0.1','--port',String(port),'--strictPort',...(process.env.DIAGNOSTIC_DIST?['--outDir',process.env.DIAGNOSTIC_DIST]:[])],{cwd:repo,stdio:'ignore'});
let browser,context,page;
const sample=()=>{try{report.resources.push({atMs:performance.now(),processes:execFileSync('ps',['-eo','pid,ppid,pcpu,rss,comm'],{encoding:'utf8'}),cgroup:execFileSync('cat',['/proc/self/cgroup'],{encoding:'utf8'}),loadAverage:execFileSync('cat',['/proc/loadavg'],{encoding:'utf8'})});}catch(error){report.resources.push({error:String(error)});}};
try{
for(let n=0;;n++){try{if((await fetch(base)).ok)break;}catch{}if(n===100)throw Error('preview timeout');await new Promise(r=>setTimeout(r,100));}
report.launchStartMs=performance.now();browser=await webkit.launch({headless:true,...(process.env.WEBKIT_EXECUTABLE ? { executablePath: process.env.WEBKIT_EXECUTABLE } : {})});report.launchEndMs=performance.now();report.browser=browser.version();report.contextStartMs=performance.now();context=await browser.newContext({viewport:{width:scenario.width,height:scenario.height},isMobile:true,hasTouch:true,deviceScaleFactor:scenario.deviceScaleFactor,locale:'ja-JP',timezoneId:'Asia/Tokyo',colorScheme:'light',serviceWorkers:'block'});
report.contextEndMs=performance.now();await context.addInitScript(variant=>{window.__inputTiming=[];for(const name of ['touchstart','touchend','click','input','change'])document.addEventListener(name,event=>{const record={name,atMs:performance.now(),tag:event.target?.tagName};window.__inputTiming.push(record);requestAnimationFrame(()=>{record.animationFrameMs=performance.now();});},{capture:true,passive:true});window.__guiTouchStarts=0;document.addEventListener('touchstart',()=>window.__guiTouchStarts++,{passive:true});if(['no-blur','stack-no-blur'].includes(variant))document.addEventListener('DOMContentLoaded',()=>{const style=document.createElement('style');style.textContent=(variant==='stack-no-blur'?'.modal-backdrop:has(.modal-backdrop), .modal-backdrop .modal-backdrop':'.modal-backdrop')+' { backdrop-filter:none !important }';document.head.append(style);});},report.variant);
await context.route('**/*',route=>new URL(route.request().url()).origin===new URL(base).origin?route.continue():route.abort());
if(report.variant!=='no-trace')await context.tracing.start({screenshots:false,snapshots:true,sources:true});
page=await context.newPage();
const wrap=(object,method)=>{const original=object[method];object[method]=async function(...args){const startMs=performance.now();try{return await original.apply(this,args);}finally{report.apiTimings.push({method,startMs,endMs:performance.now()});}};};
for(const method of ['goto','reload','evaluate'])wrap(page,method);
const locatorPrototype=Object.getPrototypeOf(page.locator('body'));
for(const method of ['fill','selectOption','focus','inputValue','evaluate','evaluateAll','waitFor','scrollIntoViewIfNeeded'])wrap(locatorPrototype,method);
page.setDefaultTimeout(10000);page.on('pageerror',error=>report.errors.push(String(error)));await page.goto(base);await expect.poll(()=>page.evaluate(()=>localStorage.getItem('calculation-memo:data'))).not.toBeNull();
const activate=async locator=>{const start=performance.now(),entry={startMs:start,locator:String(locator)};report.events.push(entry);const before=await page.evaluate(()=>window.__guiTouchStarts);entry.beforeMs=performance.now();await locator.tap();entry.tapEndMs=performance.now();await expect.poll(()=>page.evaluate(()=>window.__guiTouchStarts)).toBeGreaterThan(before);entry.endMs=performance.now();entry.durationMs=entry.endMs-start;entry.dom=await page.evaluate(()=>({browserEvents:window.__inputTiming.splice(0),elements:document.querySelectorAll('*').length,modals:document.querySelectorAll('.modal').length,backdrops:[...document.querySelectorAll('.modal-backdrop')].map(x=>getComputedStyle(x).backdropFilter)}));if(report.events.length%10===0){sample();await save();}console.log(report.events.length,Math.round(entry.durationMs),entry.dom.modals,entry.locator.slice(-80));};
const assertHorizontalFit=async()=>{const d=await page.evaluate(()=>({viewport:innerWidth,document:document.documentElement.scrollWidth,body:document.body.scrollWidth}));assert.equal(d.viewport,scenario.width);assert.ok(d.document<=d.viewport+1&&d.body<=d.viewport+1,JSON.stringify(d));for(const modal of await page.getByRole('dialog').all()){if(!await modal.isVisible())continue;const bounds=await modal.boundingBox();assert.ok(bounds&&bounds.x>=-1&&bounds.x+bounds.width<=scenario.width+1);for(const area of await modal.locator('.modal-content').all()){const size=await area.evaluate(x=>({scroll:x.scrollWidth,client:x.clientWidth}));assert.ok(size.scroll<=size.client+1,JSON.stringify(size));}}};
const storage=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('calculation-memo:data')));
const passed=async name=>{report.checks.push(name);await save();};
// The existing fixture function takes its app/browser dependencies explicitly.
const fn=new Function('assert','return ('+body+');')(assert);sample();const start=performance.now();const refs=await fn({page,context,base,expect,passed,prefix:scenario.id,assertHorizontalFit,activate});
report.paired=[];const baselineRaw=await storage();
for(const condition of report.pairedConditions.split(',')){
  assert.ok(['baseline','no-blur','nested-only','underlay-only','stack-no-blur'].includes(condition));
  report.condition=condition;
  await page.evaluate(condition=>{document.getElementById('diagnostic-blur-control')?.remove();if(condition!=='baseline'){const style=document.createElement('style');style.id='diagnostic-blur-control';style.textContent=(condition==='nested-only'?'.modal-backdrop .modal-backdrop':condition==='underlay-only'?'.modal-backdrop:has(.modal-backdrop)':condition==='stack-no-blur'?'.modal-backdrop:has(.modal-backdrop), .modal-backdrop .modal-backdrop':'.modal-backdrop')+' { backdrop-filter:none !important }';document.head.append(style);}},condition);
  const controls=await page.evaluate(()=>[...document.querySelectorAll('.modal-backdrop')].map(x=>({filter:getComputedStyle(x).backdropFilter,hasNested:!!x.querySelector('.modal-backdrop'),nested:!!x.parentElement.closest('.modal-backdrop')})));
  (report.controls ||= []).push({condition,controls});
  for(const control of controls){const removed=condition==='no-blur'||(condition==='nested-only'&&control.nested)||(condition==='underlay-only'&&control.hasNested)||(condition==='stack-no-blur'&&(control.hasNested||control.nested));assert.equal(control.filter,removed?'none':'blur(3px)');}
  for(let repeat=0;repeat<3;repeat++){
    const startMs=performance.now(),firstEvent=report.events.length;
    for(let direction=0;direction<(report.roundTrips?2:1);direction++){
    await refs.click('比較元Aと比較先Bを入れ替える');await expect(refs.result()).toHaveCount(0);
    await refs.click('選択した2記録を比較');await expect(refs.result()).toContainText('変更あり');await expect(refs.result()).toContainText('実使用内部値');await expect(refs.result()).toContainText('理由不明');
    }
    assert.deepEqual(await storage(),baselineRaw);
    report.paired.push({condition,repeat,startMs,endMs:performance.now(),firstEvent,lastEvent:report.events.length-1});await save();
  }
}
report.durationMs=performance.now()-start;report.status='passed';sample();
}catch(error){report.status='failed';report.failure=String(error.stack||error);}
finally{if(context&&report.variant!=='no-trace')await context.tracing.stop((report.status==='failed'||report.exportDiagnosticSuccessTrace)?{path:out+'.trace.zip'}:{}).catch(error=>{report.traceError=String(error);report.status='failed';});await context?.close();await browser?.close();sample();server.kill('SIGTERM');report.finishedAt=new Date().toISOString();await save();}
console.log(report.status,report.durationMs,report.failure||'');

if (report.status !== 'passed') process.exitCode = 1;
