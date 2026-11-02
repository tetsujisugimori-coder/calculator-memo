// Raw subjects intentionally fail. The parent oracle verifies exit codes and evidence.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {writeFileSync,mkdirSync} from 'node:fs';
import {createR1Probe} from './pr117-r1-probe.mjs';
import {createJournal,requireArtifacts} from './pr117-diagnostic-core.mjs';
const [name,out]=process.argv.slice(2);assert.ok(name&&out);mkdirSync(out,{recursive:false});
if(name==='incomplete'){
  const journal=createJournal(out+'/operations.jsonl',{condition:'synthetic-incomplete'});
  await journal.run({kind:'browser-or-harness-operation',operation:'completed-control',waitingFor:'resolved'},async()=>42);
  journal.start({kind:'check-or-wait',operation:'synthetic-never-completes',waitingFor:'external termination'});
  console.log('READY_TO_KILL');await new Promise(()=>{});
}else if(name==='write-failure'){
  let count=0;const journal=createJournal(out+'/unused.jsonl',{}, {write:line=>{if(++count>1)throw Error('injected mid-output EIO');writeFileSync(out+'/partial.jsonl',line,{flag:'a'});}});
  try{await journal.run({kind:'check-or-wait',operation:'original-operation'},async()=>{throw Error('ORIGINAL_FAILURE');});}catch(error){assert.equal(error.message,'ORIGINAL_FAILURE');}
  writeFileSync(out+'/result.json',JSON.stringify(journal.summary()));journal.assertHealthy();
}else if(name==='missing-artifact'){
  writeFileSync(out+'/inventory.json',JSON.stringify({actual:['one.json'],required:['one.json','missing.png']}));requireArtifacts(['one.json'],['one.json','missing.png']);
}else{
  const browser=await chromium.launch();let probe,originalError,page;
  const result={name,pageerrors:[],writes:[],classifications:[]};
  try{
    const context=await browser.newContext();page=await context.newPage();page.on('pageerror',e=>result.pageerrors.push(String(e)));
    await page.setContent('<article data-preview-key="synthetic"><button aria-pressed="false">choose</button></article><button id="other">other</button>');
    await page.evaluate(()=>{window.__writes=[];for(const method of ['setItem','removeItem','clear']){const fn=Storage.prototype[method];Storage.prototype[method]=function(...args){window.__writes.push(method);return fn.apply(this,args);};}document.querySelector('article button').addEventListener('click',e=>{if(!window.__noState)e.currentTarget.setAttribute('aria-pressed',e.currentTarget.getAttribute('aria-pressed')==='true'?'false':'true');});});
    probe=createR1Probe(page,{condition:name},out+'/r1.jsonl');await probe.install(page.locator('article'));
    await page.locator('article button').focus();await probe.beforeSpace(1,'true');
    if(['no-click','prevent-default','timeout'].includes(name))await page.evaluate(()=>document.querySelector('article button').addEventListener('keydown',e=>e.preventDefault()));
    if(name==='no-state')await page.evaluate(()=>{window.__noState=true;});
    if(name==='replace')await page.evaluate(()=>document.querySelector('article button').addEventListener('click',e=>{const next=e.currentTarget.cloneNode(true);next.setAttribute('aria-pressed','true');e.currentTarget.replaceWith(next);}));
    if(name==='focus')await page.locator('#other').focus();
    if(name==='observer-error')await page.evaluate(()=>{window.__pr117R1.snapshot=()=>{throw Error('injected observer error');};});
    await page.keyboard.press('Space');await probe.afterSpace(1);
    if(name==='timeout')await page.getByRole('button',{name:'never-existing-control'}).waitFor({timeout:60});
    if(name!=='normal')throw Error('SYNTHETIC_SUBJECT_FAILURE');
  }catch(error){originalError=error;result.originalError=String(error);}
  finally{
    if(probe){await probe.finalize(originalError);result.classifications=probe.operations;result.diagnosticErrors=probe.journal.errors;}
    if(page){result.final=await page.evaluate(()=>({writes:window.__writes,snapshot:(()=>{try{return window.__pr117R1?.snapshot();}catch{return null;}})()})).catch(()=>null);}
    writeFileSync(out+'/result.json',JSON.stringify(result,null,2));await browser.close();
  }
  if(originalError)throw originalError;
  probe.journal.assertHealthy();assert.equal(result.classifications[0]?.category,'SUCCESS');assert.deepEqual(result.final.writes,[]);assert.deepEqual(result.pageerrors,[]);
}
