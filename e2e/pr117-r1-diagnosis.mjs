// Produce an independent observational copy; fixed checkout and product stay intact.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const hash=s=>createHash('sha256').update(s).digest('hex');
const source=await readFile('e2e/selection-preview-mobile.mjs','utf8');
assert.equal(hash(source),'88a107ed929fc7d15f57d54e6eb7ca9af8ca61903a89cceffd77ff3382092fcd');
const observe=process.env.DIAG_OBSERVE==='1';
const mode=observe?'observed':'control';
// Control is the exact unedited original file. It retains fail-fast and all guards.
if(!observe){console.log('DIAG_JSON '+JSON.stringify({kind:'source',mode,sha256:hash(source),originalUnchanged:true}));process.exit(0);}
function replaceOnce(text,from,to){assert.equal(text.split(from).length,2,'unique source anchor');return text.replace(from,to);}
let copy=source;
copy=replaceOnce(copy,"const article=dialog.locator('[data-preview-key]').filter({hasText:note.id});",`const article=dialog.locator('[data-preview-key]').filter({hasText:note.id});
    const snapshot=async phase=>{
      const state=await article.evaluateAll(rows=>({rows:rows.length,items:rows.map(row=>{const r=row.getBoundingClientRect();return {connected:row.isConnected,key:row.dataset.previewKey,rect:{x:r.x,y:r.y,width:r.width,height:r.height},buttons:[...row.querySelectorAll('button')].map(b=>({text:b.textContent,name:b.getAttribute('aria-label')||b.textContent,pressed:b.getAttribute('aria-pressed'),active:b===document.activeElement,connected:b.isConnected}))};}),active:document.activeElement?.outerHTML?.slice(0,1500),events:window.__diagEvents||[],mutations:window.__diagMutations||[]}));
      state.aria=await article.ariaSnapshot();console.log('DIAG_JSON '+JSON.stringify({kind:'r1-snapshot',sha:process.env.EXPECTED_SHA,engine:engineName,width,theme,phase,...state}));
    };
    page.on('console',m=>{if(m.type()==='error')console.log('DIAG_JSON '+JSON.stringify({kind:'console-error',engine:engineName,width,theme,text:m.text()}));});
`);
copy=replaceOnce(copy,"await article.getByRole('button',{name:'復元候補に選択',exact:true}).focus();await page.keyboard.press('Space');",`await article.evaluate(row=>{
      window.__diagEvents=[];window.__diagMutations=[];const ids=new WeakMap();let serial=0;const id=e=>{if(!e)return null;if(!ids.has(e))ids.set(e,++serial);return ids.get(e);};
      window.__diagHandlers=[];for(const type of ['keydown','keyup','click','focusin','focusout']){const fn=e=>{if(window.__diagEvents.length<256)window.__diagEvents.push({type,key:e.key,code:e.code,repeat:e.repeat,time:e.timeStamp,target:id(e.target),text:e.target.textContent?.slice(0,80),pressed:e.target.getAttribute?.('aria-pressed'),active:id(document.activeElement),rowConnected:row.isConnected});};document.addEventListener(type,fn,{capture:true,passive:true});window.__diagHandlers.push([type,fn]);}
      window.__diagObserver=new MutationObserver(records=>{for(const m of records){if(window.__diagMutations.length<256)window.__diagMutations.push({type:m.type,attribute:m.attributeName,target:id(m.target),added:[...m.addedNodes].map(id),removed:[...m.removedNodes].map(id),rowConnected:row.isConnected,time:performance.now()});}});window.__diagObserver.observe(row.parentElement,{childList:true,subtree:true,attributes:true,attributeOldValue:true,characterData:true});
    });await snapshot('before-focus');await article.getByRole('button',{name:'復元候補に選択',exact:true}).focus();await snapshot('before-space-1');await page.keyboard.press('Space');await snapshot('after-space-1');`);
copy=replaceOnce(copy,"await page.keyboard.press('Space');current.keyboardEvents=", "await snapshot('before-space-2');await page.keyboard.press('Space');await snapshot('after-space-2');current.keyboardEvents=");
copy=replaceOnce(copy,"if(page)current.keyboardEvents=", "if(page){console.log('DIAG_JSON '+JSON.stringify({kind:'failure-state',engine:engineName,width,theme,errors:await page.evaluate(()=>({events:window.__diagEvents,mutations:window.__diagMutations,active:document.activeElement?.outerHTML,writes:window.__previewWrites,keys:window.__previewKeyEvents,rows:[...document.querySelectorAll('[data-preview-key]')].map(row=>({key:row.dataset.previewKey,buttons:[...row.querySelectorAll('button')].map(b=>({text:b.textContent,pressed:b.getAttribute('aria-pressed')}))}))})).catch(()=>null)}));}if(page)current.keyboardEvents=");
// Continue separate contexts once each to observe every condition; fail final original guards.
copy=replaceOnce(copy,"await save();throw error;}finally{await context.close();}","await save();}finally{if(page)console.log('DIAG_JSON '+JSON.stringify({kind:'case-final',sha:process.env.EXPECTED_SHA,engine:engineName,width,theme,status:current.status,error:current.error,pageerrors:errors,storage:await page.evaluate(()=>({writes:window.__previewWrites,raw:Object.fromEntries(Object.keys(localStorage).map(k=>[k,localStorage.getItem(k)]))})).catch(()=>null)}));await context.close();}");
// errors lives in the try block, so expose via current when created for finally.
copy=copy.replace('const errors=[];page.on', 'const errors=current.errors=[];page.on').replace('pageerrors:errors,storage:', 'pageerrors:current.errors,storage:');
await writeFile('e2e/pr117-observed.generated.mjs',copy,{flag:'wx'});
let runner=await readFile('e2e/run-selection-preview-gui.mjs','utf8');
runner=replaceOnce(runner,"['e2e/selection-preview-mobile.mjs']","['e2e/pr117-observed.generated.mjs']");
await writeFile('e2e/pr117-observed-runner.generated.mjs',runner,{flag:'wx'});
console.log('DIAG_JSON '+JSON.stringify({kind:'source',mode,originalSha256:hash(source),derivedSha256:hash(copy),changes:'passive event/mutation observers, read-only snapshots and context continuation; no product, fixture, assertion, timeout or input changes; observational timing overhead remains possible'}));
