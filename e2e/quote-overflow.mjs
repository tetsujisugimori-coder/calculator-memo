import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium,webkit,expect} from '@playwright/test';
import {spawn,execFileSync} from 'node:child_process';
const [repoArg='.',label='quote-overflow']=process.argv.slice(2);
const option=(name,fallback)=>process.argv.find(x=>x.startsWith('--'+name+'='))?.split('=')[1]||fallback;
const engine=option('engine','chromium'),width=Number(option('width','390')),hasTouch=process.argv.includes('--touch'),themes=option('theme','both')==='both'?['light','dark']:[option('theme','light')];
assert.ok(['chromium','webkit'].includes(engine));assert.ok([375,390].includes(width));assert.ok(themes.every(t=>['light','dark'].includes(t)));
const repo=path.resolve(repoArg);
const fixture=JSON.parse(await fs.readFile(new URL('./fixtures/quote-overflow-ci-41192402203.json',import.meta.url),'utf8'));
const out=path.resolve(process.env.GUI_EVIDENCE_DIR||'gui-evidence/quote-'+label);await fs.mkdir(out,{recursive:true});
const result={label,sha:execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim(),node:process.version,os:process.platform,source:fixture.source,observations:[],startedAt:new Date().toISOString(),errors:[]};
Object.assign(result,{engine,width,hasTouch,themes,run:process.env.GITHUB_RUN_ID||'local',attempt:process.env.GITHUB_RUN_ATTEMPT||'1',playwright:JSON.parse(await fs.readFile(new URL('./node_modules/@playwright/test/package.json',import.meta.url),'utf8')).version,runner:{image:process.env.ImageOS,version:process.env.ImageVersion}});
const port=4196, origin='http://127.0.0.1:'+port;
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--config','vite.pages.config.ts','--host','127.0.0.1','--port',String(port),'--strictPort'],{cwd:repo,stdio:['ignore','pipe','pipe']});
let serverLog='';let serverReady=false;server.stdout.on('data',b=>{serverLog+=b;if(serverLog.includes(origin+'/calculator-memo/'))serverReady=true;});server.stderr.on('data',b=>serverLog+=b);
let browser,context,page;
try{
  await expect.poll(async()=>{if(server.exitCode!==null)throw Error(serverLog);if(!serverReady)return 0;try{return (await fetch(origin+'/calculator-memo/')).status}catch{return 0}},{timeout:30000}).toBe(200);
  browser=await ({chromium,webkit})[engine].launch();result.browser=browser.version();
  context=await browser.newContext({viewport:{width,height:hasTouch?(width===375?667:844):1000},isMobile:hasTouch,hasTouch,deviceScaleFactor:hasTouch?(width===375?2:3):1,locale:'ja-JP',timezoneId:'Asia/Tokyo',colorScheme:'light',serviceWorkers:'block'});
  await context.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  await context.addInitScript(()=>{
    const NativeDate=Date, nativeUUID=crypto.randomUUID.bind(crypto);
    window.__quoteTouches=0;document.addEventListener('touchstart',()=>window.__quoteTouches++,{passive:true});
    window.__diagnosticNow='2026-10-31T10:35:24.268Z';window.__diagnosticUUID=null;window.__diagnosticCalls=[];
    window.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[window.__diagnosticNow]));}static now(){return new NativeDate(window.__diagnosticNow).getTime();}};
    crypto.randomUUID=()=>{if(!window.__diagnosticUUID)return nativeUUID();const id=window.__diagnosticUUID;window.__diagnosticUUID=null;window.__diagnosticCalls.push(id);return id;};
  });
  page=await context.newPage();
  const activate=async locator=>{if(hasTouch){const n=await page.evaluate(()=>window.__quoteTouches);await locator.tap();await expect.poll(()=>page.evaluate(()=>window.__quoteTouches)).toBeGreaterThan(n);}else await locator.click();};page.setDefaultTimeout(10000);page.on('pageerror',e=>result.errors.push(String(e)));
  await context.tracing.start({snapshots:true,sources:true,screenshots:false});
  result.tree=execFileSync('git',['rev-parse','HEAD^{tree}'],{cwd:repo,encoding:'utf8'}).trim();
  result.dirty=Boolean(execFileSync('git',['status','--porcelain','--untracked-files=no'],{cwd:repo,encoding:'utf8'}).trim());
  if(process.env.EXPECTED_SHA)assert.equal(result.sha,process.env.EXPECTED_SHA);if(process.env.CI)assert.ok(!result.dirty,'CI checkout must be clean');
  const assets=[];for(const name of (await fs.readdir(path.join(repo,'dist-pages/assets'))).sort()){if(/\.(js|css)$/.test(name))assets.push({name,sha256:createHash('sha256').update(await fs.readFile(path.join(repo,'dist-pages/assets',name))).digest('hex')});}
  result.servedIdentity={sha:result.sha,tree:result.tree,dirty:result.dirty,assetsDigest:createHash('sha256').update(JSON.stringify(assets)).digest('hex')};result.assets=assets;
  await fs.writeFile(path.join(repo,'dist-pages/__quote_provenance.json'),JSON.stringify(result.servedIdentity));
  await page.goto(origin+'/calculator-memo/?expr=sqrt(81)%2Babs(-7)%2B2%5E3%2Bpi-pi%2Be-e');
  assert.deepEqual(await page.evaluate(async()=>{const r=await fetch('./__quote_provenance.json',{cache:'no-store'});if(!r.ok)throw Error('Missing quote provenance');return r.json()}),result.servedIdentity);
  await page.evaluate(data=>localStorage.setItem('calculation-memo:data',JSON.stringify(data)),fixture.seed);await page.reload({waitUntil:'domcontentloaded'});
  const library=page.getByRole('dialog',{name:'登録式ライブラリ',exact:true});
  const report=page.getByRole('dialog',{name:'登録式の関連レポート',exact:true});
  const picker=page.getByRole('dialog',{name:'計算根拠を引用',exact:true});
  const editor=report.getByLabel('レポート本文（Markdown）',{exact:true});
  const measure=async stage=>{
    const data=await page.evaluate(()=>{
      const rect=e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}};
      const hiddenDetails=e=>{for(let d=e.parentElement?.closest('details:not([open])');d;d=d.parentElement?.closest('details:not([open])')){const summary=d.querySelector(':scope > summary');if(!summary?.contains(e))return true;}return false;};
      const visible=e=>!hiddenDetails(e)&&e.checkVisibility({checkOpacity:true,checkVisibilityCSS:true});
      const describe=e=>{const s=getComputedStyle(e);return {tag:e.tagName,class:e.className,id:e.id,text:['P','SUMMARY','BUTTON','H4','DT','DD'].includes(e.tagName)?e.textContent:null,visible:visible(e),closedDetails:hiddenDetails(e),rect:rect(e),parent: e.parentElement?{tag:e.parentElement.tagName,class:e.parentElement.className,rect:rect(e.parentElement)}:null,client:e.clientWidth,scroll:e.scrollWidth,style:Object.fromEntries(['display','fontFamily','fontSize','lineHeight','paddingLeft','paddingRight','marginLeft','marginRight','borderLeftWidth','borderRightWidth','minWidth','maxWidth','whiteSpace','overflowWrap','wordBreak','lineBreak','overflowX','gridTemplateColumns'].map(k=>[k,s[k]]))};};
      return {viewport:innerWidth,dpr:devicePixelRatio,theme:document.documentElement.dataset.theme,fontSize:getComputedStyle(document.documentElement).fontSize,modal:[...document.querySelectorAll('.modal-content')].map(e=>({container:describe(e),children:[...e.querySelectorAll('*')].filter(c=>c.closest('.modal-content')===e).map(describe).filter(c=>c.scroll>c.client+1||c.rect.right>e.getBoundingClientRect().right+1||c.text?.startsWith('引用ID：')||['quote-tools','formula-report'].includes(c.class))}))};
    });
    assert.equal(data.viewport,width,'Configured CSS viewport must be retained');
    assert.equal(data.dpr,hasTouch?(width===375?2:3):1,'Configured DPR must be retained');
    if(stage.startsWith('preview-')||stage.startsWith('reinsert-200-'))assert.equal(data.fontSize,'32px','CSS200% checkpoint must use a 32px root font');
    result.observations.push({stage,...data});return data;
  };
  await activate(page.getByRole('button',{name:'登録式ライブラリ',exact:true}));
  await activate(library.getByRole('button',{name:'関連レポートを閲覧・編集',exact:true}));
  await activate(report.getByRole('button',{name:'Markdownを編集',exact:true}));
  const original=fixture.seed.formulaReports.entries.find(x=>x.id==='quote-report').body;
  await expect(editor).toHaveValue(original);
  const rawBefore=await page.evaluate(()=>JSON.stringify(Object.fromEntries(Object.entries(localStorage))));
  await page.evaluate(()=>{window.__quoteWrites={set:0,remove:0,clear:0};for(const [name,key] of [['setItem','set'],['removeItem','remove'],['clear','clear']]){const native=Storage.prototype[name];Storage.prototype[name]=function(...args){if(this===localStorage)window.__quoteWrites[key]++;return native.apply(this,args);};}});
  await activate(report.getByRole('button',{name:'計算根拠を引用',exact:true}));await activate(picker.getByRole('button',{name:'引用選択を取り消す',exact:true}));
  await measure('before-insert');
  for(let i=0;i<2;i++){
    await editor.evaluate(e=>{e.focus();e.setSelectionRange(3,13)});
    await activate(report.getByRole('button',{name:'計算根拠を引用',exact:true}));
    await picker.getByLabel('引用する保存済み計算記録',{exact:true}).selectOption(JSON.stringify(['quote-memo','quote-record-'+'r'.repeat(100)]));
    await picker.getByLabel('引用するブロック',{exact:true}).selectOption('quote-result');
    const body=fixture.quotedBodies[i],uuid=body.match(/引用ID：([^\n]+)/)[1],date=body.match(/引用日時：([^\n]+)/)[1];
    await page.evaluate(({uuid,date})=>{window.__diagnosticUUID=uuid;window.__diagnosticNow=date},{uuid,date});
    await activate(picker.getByRole('button',{name:'引用の挿入前プレビュー',exact:true}));
    for(const theme of themes){await page.evaluate(t=>{document.documentElement.dataset.theme=t;document.documentElement.style.fontSize='200%'},theme);await measure('preview-'+i+'-'+theme);}
    await page.evaluate(()=>document.documentElement.style.fontSize='');
    await activate(picker.getByRole('button',{name:'この引用を本文へ挿入',exact:true}));await expect(editor).toHaveValue(body);
    await measure('insert-'+i);
    if(i===0){await activate(report.getByRole('button',{name:'直前の引用を取り消す',exact:true}));await expect(editor).toHaveValue(original);await measure('undo');}
  }
  for(const theme of themes){
    await page.evaluate(t=>{document.documentElement.dataset.theme=t;document.documentElement.style.fontSize='200%'},theme);
    await measure('reinsert-200-'+theme);await page.screenshot({path:path.join(out,theme+'.png'),fullPage:true});
  }
  result.rawUnchanged=rawBefore===await page.evaluate(()=>JSON.stringify(Object.fromEntries(Object.entries(localStorage))));assert.ok(result.rawUnchanged);result.appStorageCalls=await page.evaluate(()=>window.__quoteWrites);assert.deepEqual(result.appStorageCalls,{set:0,remove:0,clear:0});
  if(process.argv.includes('--causal'))result.causal=await page.evaluate(negativeControl=>{
    const p=[...document.querySelectorAll('.quote-tools li > p')].find(e=>e.textContent.startsWith('引用ID：5122c088'));
    const productStyle=p.getAttribute('style');if(negativeControl)p.style.lineBreak='auto';
    const area=p.closest('.modal-content');const original=p.getAttribute('style');
    const restore=(element,style)=>{if(style===null)element.removeAttribute('style');else element.setAttribute('style',style);};
    const width=()=>({scroll:area.scrollWidth,client:area.clientWidth,pScroll:p.scrollWidth,pClient:p.clientWidth});
    const range=document.createRange(),box=p.getBoundingClientRect(),chars=[];
    const walker=document.createTreeWalker(p,NodeFilter.SHOW_TEXT);let text;
    while(text=walker.nextNode())for(let i=0;i<text.length;i++){range.setStart(text,i);range.setEnd(text,i+1);const r=range.getBoundingClientRect();chars.push({char:text.textContent[i],index:i,left:r.left,right:r.right,top:r.top,bottom:r.bottom,beyondParagraph:r.right-box.right});}
    const baseline=width();
    const hidden=[...area.querySelectorAll('details:not([open]) > :not(summary)')];
    const old=hidden.map(e=>e.getAttribute('style'));hidden.forEach(e=>e.style.display='none');const withoutClosedDetails=width();hidden.forEach((e,i)=>restore(e,old[i]));
    p.style.display='none';const withoutIdentityParagraph=width();restore(p,original);
    p.style.lineBreak='anywhere';const withLineBreakAnywhere=width();restore(p,original);
    const restored=width();restore(p,productStyle);
    return {text:p.textContent,paragraphRect:{left:box.left,right:box.right,width:box.width},chars,baseline,withoutClosedDetails,withoutIdentityParagraph,withLineBreakAnywhere,restored};
  },process.argv.includes('--negative-control'));
  if(process.argv.includes('--negative-control'))assert.ok(result.causal.baseline.scroll>result.causal.baseline.client+1,'Restoring the old line breaking must expose the frozen-fixture overflow');
  result.uuidCalls=await page.evaluate(()=>window.__diagnosticCalls);assert.equal(result.uuidCalls.length,2);
  if(process.argv.includes('--expect-overflow'))for(const x of result.observations.filter(x=>x.stage.startsWith('reinsert-200-'))){const c=x.modal.at(-1).container;assert.equal(c.scroll,391);assert.equal(c.client,388);}
  if(process.argv.includes('--expect-fit'))for(const x of result.observations){for(const m of x.modal)assert.ok(m.container.scroll<=m.container.client+1,`Horizontal overflow at ${x.stage}: ${m.container.scroll}/${m.container.client}`);}
  assert.deepEqual(result.errors,[]);result.status='completed';
}catch(e){result.status='failed';result.failure=String(e.stack||e);console.error(e);process.exitCode=1;}
finally{
  if(context)await context.tracing.stop({path:path.join(out,'trace.zip')});if(browser)await browser.close();server.kill();
  await fs.writeFile(path.join(out,'result.json'),JSON.stringify(result,null,2)+'\n');await fs.writeFile(path.join(out,'server.log'),serverLog);
  console.log(JSON.stringify({label,status:result.status,sha:result.sha,measurements:result.observations.map(x=>({stage:x.stage,widths:x.modal.map(m=>[m.container.scroll,m.container.client])}))}));
}
