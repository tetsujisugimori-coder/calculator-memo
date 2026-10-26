// Diagnostic only: real app/synthetic fixture, not a substitute for formal six-condition CI.
// Run from repository root. No product state is persisted outside the fresh browser context.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
const repo=process.env.CALCULATOR_REPO || process.cwd();
const { webkit, expect }=await import(pathToFileURL(repo+'/e2e/node_modules/@playwright/test/index.mjs'));
const { assertHistoricalSourceText, expectedHistoricalBlocks }=await import(pathToFileURL(repo+'/e2e/source-evidence-contract.mjs'));
const source=await readFile(repo+'/e2e/scenario.mjs','utf8');
const body=source.slice(source.indexOf('async function exerciseFormulaQuotes('),source.indexOf('async function exerciseFormulaStatusFilters('));
const scenario={id:'webkit-mobile-'+(process.env.WIDTH||390)+'px',width:Number(process.env.WIDTH||390),height:process.env.WIDTH==='375'?667:844,deviceScaleFactor:process.env.WIDTH==='375'?2:3};
const out=process.env.OUT||'/tmp/pr93-quote-timing.json', port=Number(process.env.PORT||4396),base=`http://127.0.0.1:${port}/calculator-memo/`;
const report={diagnosticOnly:true,exportDiagnosticSuccessTrace:process.env.DIAGNOSTIC_EXPORT_TRACE==='1',buildDirectory:process.env.DIAGNOSTIC_DIST||repo+'/dist-pages',sourceSha:execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim(),scenario,variant:process.env.VARIANT||'baseline',startedAt:new Date().toISOString(),events:[],checks:[],resources:[],errors:[],apiTimings:[]};
const save=()=>writeFile(out,JSON.stringify(report,null,2));
const server=spawn(process.execPath,[repo+'/node_modules/vite/bin/vite.js','preview','--config','vite.pages.config.ts','--host','127.0.0.1','--port',String(port),'--strictPort',...(process.env.DIAGNOSTIC_DIST?['--outDir',process.env.DIAGNOSTIC_DIST]:[])],{cwd:repo,stdio:'ignore'});
let browser,context,page;
const sample=()=>{try{report.resources.push({atMs:performance.now(),processes:execFileSync('ps',['-eo','pid,ppid,pcpu,rss,comm'],{encoding:'utf8'}),cgroup:execFileSync('cat',['/proc/self/cgroup'],{encoding:'utf8'})});}catch(error){report.resources.push({error:String(error)});}};
try{
for(let n=0;;n++){try{if((await fetch(base)).ok)break;}catch{}if(n===100)throw Error('preview timeout');await new Promise(r=>setTimeout(r,100));}
browser=await webkit.launch({headless:true,...(process.env.WEBKIT_EXECUTABLE ? { executablePath: process.env.WEBKIT_EXECUTABLE } : {})});report.browser=browser.version();context=await browser.newContext({viewport:{width:scenario.width,height:scenario.height},isMobile:true,hasTouch:true,deviceScaleFactor:scenario.deviceScaleFactor,locale:'ja-JP',timezoneId:'Asia/Tokyo',colorScheme:'light',serviceWorkers:'block'});
await context.addInitScript(variant=>{window.__inputTiming=[];for(const name of ['touchstart','touchend','click','input','change'])document.addEventListener(name,event=>{const record={name,atMs:performance.now(),tag:event.target?.tagName};window.__inputTiming.push(record);requestAnimationFrame(()=>{record.animationFrameMs=performance.now();});},{capture:true,passive:true});window.__guiTouchStarts=0;document.addEventListener('touchstart',()=>window.__guiTouchStarts++,{passive:true});if(variant==='no-blur')document.addEventListener('DOMContentLoaded',()=>{const style=document.createElement('style');style.textContent='.modal-backdrop { backdrop-filter:none !important }';document.head.append(style);});},report.variant);
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
const currentScenario=scenario;const stage=async name=>{report.stage=name;};const passed=async name=>{report.checks.push(name);await save();};
// Explicit bindings reuse the trusted checked-out private scenario without duplicating its assertions.
const bindings={assert,page,context,base,expect,activate,assertHorizontalFit,storage,currentScenario,stage,passed,readFile,assertHistoricalSourceText,expectedHistoricalBlocks};
const fn=new Function(...Object.keys(bindings),'return ('+body+');')(...Object.values(bindings));sample();const start=performance.now();await fn(scenario.id);report.durationMs=performance.now()-start;report.status='passed';sample();
}catch(error){report.status='failed';report.failure=String(error.stack||error);}
finally{if(context&&report.variant!=='no-trace')await context.tracing.stop((report.status==='failed'||report.exportDiagnosticSuccessTrace)?{path:out+'.trace.zip'}:{}).catch(error=>{report.traceError=String(error);report.status='failed';});await context?.close();await browser?.close();sample();server.kill('SIGTERM');report.finishedAt=new Date().toISOString();await save();}
console.log(report.status,report.durationMs,report.failure||'');

if (report.status !== 'passed') process.exitCode = 1;
