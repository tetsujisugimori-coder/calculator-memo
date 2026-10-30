import { chromium, webkit } from 'playwright';
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
const base=process.env.RESTORE_TEST_URL || 'http://127.0.0.1:4183/calculator-memo/';
const key='calculation-memo:data', prefix='calculation-memo:restore-recovery:v1:';
const cases=[];
await mkdir('gui-evidence',{recursive:true});
const record={expectedSha:process.env.EXPECTED_SHA||null,run:process.env.GITHUB_RUN_ID||'local',attempt:process.env.GITHUB_RUN_ATTEMPT||'local',expectedCases:8,status:'running',cases};
const save=()=>writeFile('gui-evidence/restore-results.json',JSON.stringify(record,null,2)+'\n');
const date='2026-10-30T00:00:00.000Z';
function fixture(theme){return {version:1,history:[{id:'h-new',expression:'1+2',displayExpression:'1 + 2',result:3,resultText:'3',createdAt:date}],notes:[{id:'n-new',type:'plain-calculation',title:'復元した数学メモ',content:'日本語😀\n引用と原文',createdAt:date,updatedAt:date}],settings:{theme,activePanel:'history'},formulaLibrary:{version:1,entries:[{id:'f-new',title:'復元した登録式',expression:'x+1',createdAt:date,updatedAt:date}],selectedId:'f-new'},formulaExecutions:[{formulaId:'f-new',expression:'x+1',inputs:{x:'2'}}],formulaReports:{version:1,entries:[{id:'r-new',formulaId:'f-new',title:'復元したレポート',body:'独自の本文',createdAt:date,updatedAt:date,confirmedExpression:null}]}};}
function backup(raw){return JSON.stringify({format:'calculator-memo-backup',formatVersion:1,acquiredAt:date,createdAt:date,acquisition:'captured',appStorageVersion:1,entries:[{key,raw,utf16CodeUnits:raw.length,validation:'ok',counts:{history:1,notes:1,formulas:1,reports:1,executions:1}}]});}
async function layout(page,dialog,phase){
 const geometry=await page.evaluate(()=>({viewport:document.documentElement.clientWidth,page:Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)}));assert.ok(geometry.page<=geometry.viewport,`${phase}: page overflow`);
 const overflow=await dialog.locator('.modal-content').evaluate(c=>[c,...c.querySelectorAll('p,table,button,label')].filter(e=>e.scrollWidth>e.clientWidth+1).map(e=>({tag:e.tagName,text:e.textContent,scroll:e.scrollWidth,client:e.clientWidth})));assert.deepEqual(overflow,[],`${phase}: modal overflow`);
 for(const label of ['現在データを保全する','復元を実行する']){const control=dialog.getByRole('button',{name:label,exact:true});await control.scrollIntoViewIfNeeded();const box=await control.boundingBox();assert.ok(box&&box.width>=44&&box.height>=44&&box.x>=0&&box.x+box.width<=geometry.viewport,`${phase}: ${label}`);assert.equal(await control.evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}),true,`${phase}: reachable ${label}`);}
 return geometry;
}
await save();
try{
for(const [engineName,engine] of [['chromium',chromium],['webkit',webkit]]){
 const browser=await engine.launch({headless:true});
 try{for(const width of [375,390])for(const theme of ['light','dark']){
  const current={engine:engineName,width,theme,font:'200%',status:'running',startedAt:new Date().toISOString(),touches:0,verified:[]};cases.push(current);await save();
  const context=await browser.newContext({viewport:{width,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2,acceptDownloads:true});let page;
  try{
   page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(String(e)));
   const tap=async locator=>{await locator.scrollIntoViewIfNeeded();await locator.tap();current.touches++;};
   const source=JSON.stringify({version:1,history:[],notes:[],settings:{theme,activePanel:'history'},privateOriginal:'保全対象\n😀'});
   const target=JSON.stringify(fixture(theme),null,2).replace(/\n}$/,',\n "futureNumber":900719925474099312345\n}');
   const filename='calculator-memo-backup-20261030-074200-'+ '長いファイル名'.repeat(12)+'.json';
   await page.goto(base);await page.evaluate(({key,source})=>localStorage.setItem(key,source),{key,source});await page.reload();
   await page.waitForFunction(theme=>document.documentElement.dataset.theme===theme,theme);
   const provenance=await page.evaluate(async()=> (await fetch('./__restore_provenance.json')).json());assert.equal(provenance.sha,process.env.EXPECTED_SHA);current.provenance=provenance;
   const original=()=>page.evaluate(key=>localStorage.getItem(key),key);
   await page.evaluate(()=>document.documentElement.style.fontSize='200%');
   await tap(page.getByRole('button',{name:'JSONから復元',exact:true}));
   let dialog=page.getByRole('dialog',{name:'JSONバックアップから復元',exact:true});
   const upload=async text=>{await dialog.getByLabel('復元JSONファイル').setInputFiles({name:filename,mimeType:'application/json',buffer:Buffer.from(text)});};
   await upload('{');await dialog.getByRole('alert').waitFor();assert.equal(await original(),source);current.verified.push('invalid JSON leaves source');
   await upload(backup(target));await dialog.getByRole('region',{name:'復元プレビュー'}).waitFor();assert.equal(await original(),source);assert.match(await dialog.innerText(),/異なります/);
   current.before=await layout(page,dialog,'preview');assert.equal(await dialog.getByRole('button',{name:'復元を実行する',exact:true}).isDisabled(),true);current.verified.push('preview comparison no writes; approval blocked');
   await page.evaluate(prefix=>{const original=Storage.prototype.setItem;window.__restoreOriginalSet=original;Storage.prototype.setItem=function(k,v){if(k.startsWith(prefix))throw new DOMException('full','QuotaExceededError');return original.call(this,k,v);};},prefix);
   await tap(dialog.getByRole('button',{name:'現在データを保全する',exact:true}));await dialog.getByRole('alert').filter({hasText:'保全できない'}).waitFor();assert.equal(await original(),source);assert.equal(await dialog.getByRole('button',{name:'復元を実行する',exact:true}).isDisabled(),true);await page.evaluate(()=>{Storage.prototype.setItem=window.__restoreOriginalSet;delete window.__restoreOriginalSet;});current.verified.push('recovery quota refusal');
   await upload(backup(target));await dialog.getByText('ファイルを検証しました。',{exact:false}).waitFor();
   const other=await context.newPage();await other.goto(base);const changed=source+' ';await other.evaluate(({key,changed})=>localStorage.setItem(key,changed),{key,changed});await dialog.getByRole('alert').filter({hasText:'別タブ'}).waitFor();assert.equal(await original(),changed);assert.equal(await dialog.getByRole('button',{name:'復元を実行する',exact:true}).isDisabled(),true);await other.close();current.verified.push('other tab invalidates preview');
   await page.reload();await page.waitForFunction(theme=>document.documentElement.dataset.theme===theme,theme);await page.evaluate(()=>document.documentElement.style.fontSize='200%');await tap(page.getByRole('button',{name:'JSONから復元',exact:true}));dialog=page.getByRole('dialog',{name:'JSONバックアップから復元',exact:true});
   await upload(backup(target));await dialog.getByText('ファイルを検証しました。',{exact:false}).waitFor();await tap(dialog.getByRole('button',{name:'現在データを保全する',exact:true}));await dialog.getByText('独立コピー読戻し確認済み',{exact:false}).waitFor();
   const copies=await page.evaluate(prefix=>Object.keys(localStorage).filter(k=>k.startsWith(prefix)).map(k=>JSON.parse(localStorage.getItem(k))),prefix);assert.ok(copies.some(c=>c.raw===changed),'independent recovery source retained');assert.equal(await original(),changed);
   await tap(dialog.getByRole('checkbox'));await dialog.getByRole('button',{name:'復元を実行する',exact:true}).focus();await page.keyboard.press('Enter');assert.equal(await original(),changed);current.verified.push('independent source preservation and Enter guard');
   await tap(dialog.getByRole('button',{name:'復元を実行する',exact:true}));await dialog.getByRole('status').filter({hasText:'保存原文の書込みと読戻し一致'}).waitFor();assert.equal(await original(),target);assert.equal(await dialog.getByRole('button',{name:'復元を実行する',exact:true}).isDisabled(),true);current.after=await layout(page,dialog,'restored');await dialog.getByRole('status').scrollIntoViewIfNeeded();await page.screenshot({path:`gui-evidence/restore-${engineName}-${width}-${theme}.png`});
   await tap(dialog.getByRole('button',{name:'閉じる',exact:true}).last());await page.getByText('復元した数学メモ',{exact:true}).waitFor({state:'attached'});assert.equal(await original(),target);current.verified.push('raw readback and UI update no repeat');
   await tap(page.getByRole('button',{name:'データのバックアップ',exact:true}));const exportDialog=page.getByRole('dialog',{name:'データのバックアップ',exact:true});await exportDialog.getByText('現行ローダーで受入可能',{exact:false}).waitFor();const [download]=await Promise.all([page.waitForEvent('download'),tap(exportDialog.getByRole('button',{name:'JSONを書き出す',exact:true}))]);const exported=JSON.parse(await readFile(await download.path(),'utf8'));assert.equal(exported.entries[0].raw,target);assert.equal(await original(),target);current.verified.push('restore then export exact raw');
   await page.reload();await page.getByText('復元した数学メモ',{exact:true}).waitFor({state:'attached'});assert.equal(await original(),target);assert.deepEqual(errors,[]);current.verified.push('reload source unchanged; no page errors');Object.assign(current,{status:'passed',finishedAt:new Date().toISOString()});await save();
  }catch(error){Object.assign(current,{status:'failed',error:String(error),finishedAt:new Date().toISOString()});if(page)await page.screenshot({path:`gui-evidence/restore-${engineName}-${width}-${theme}-failure.png`}).catch(()=>{});await save();throw error;}finally{await context.close();}
 }}finally{await browser.close();}
}
assert.equal(cases.length,8);assert.ok(cases.every(c=>c.status==='passed'));record.status='passed';
}catch(error){record.status='failed';record.error=String(error);throw error;}finally{record.finishedAt=new Date().toISOString();await save();}
console.log(JSON.stringify(record,null,2));
