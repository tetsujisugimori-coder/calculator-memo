import { validateCases, validateRows } from './row-contract.mjs';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { build } from 'vite';
import { chromium, webkit } from '../../../../e2e/node_modules/playwright/index.mjs';
if (process.env.GITHUB_ACTIONS === 'true') assert.equal(process.env.WEBKIT_EXECUTABLE_PATH || '', '', 'CI must use pinned default launcher');
const webkitOverride = process.env.WEBKIT_EXECUTABLE_PATH || null;
const sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
assert.equal(sha, process.env.EXPECTED_SHA || sha, 'expected HEAD');
const hash = x => createHash('sha256').update(x).digest('hex');
const source = 'e2e/fixtures/storage-reconciliation.ts';
const out = `gui-evidence/independent-reconciliation-${sha.slice(0,12)}-${randomUUID()}`;
await mkdir(out, { recursive: true });
const evidence = { sha, dirty: !!execFileSync('git', ['status','--porcelain'],{encoding:'utf8'}).trim(), sourceSha256: hash(await readFile(source)), started: new Date().toISOString(), kind:'independent synthetic native controls', rows: [], notTested:['physical Safari', 'real quota exhaustion', 'physical media persistence', 'production storage', 'unobserved ABA'] };
assert.equal(evidence.dirty, false, 'commit source before independent native run');
const built = await build({ configFile:false,logLevel:'error',build:{write:false,minify:false,lib:{entry:'e2e/fixtures/storage-reconciliation-browser.ts',formats:['es']},rolldownOptions:{output:{codeSplitting:false}}} });
const fixtureModule = (Array.isArray(built) ? built : [built]).flatMap(x => x.output).find(x => x.type === 'chunk').code;
evidence.moduleSha256 = hash(fixtureModule);
await writeFile(`${out}/fixture.mjs.txt`, fixtureModule);
const server = createServer((req,res) => {
  res.setHeader('Cache-Control','no-store');
  if (req.url === '/fixture.mjs') {res.setHeader('Content-Type','text/javascript');res.end(fixtureModule);}
  else {res.setHeader('Content-Type','text/html');res.end('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><style>body{font:15px sans-serif;margin:12px}pre{white-space:pre-wrap;overflow-wrap:anywhere}</style><h1>Independent Stage3B-6</h1><p>Synthetic only · HOLD · executionAllowed=false</p><button>Run independent controls</button><pre id="results"></pre><script type="module">window.api=await import("/fixture.mjs");</script>');}
});
server.listen(0,'127.0.0.1'); await once(server,'listening');
const origin = `http://127.0.0.1:${server.address().port}`;
// Bounded negative control: one synthetic browser, one context, never a production profile.
const startupProbe = process.env.STAGE3B7A_STARTUP_PROBE === '1';
try {
for(const [engine,type] of (startupProbe ? [['chromium',chromium]] : [['chromium',chromium],['webkit',webkit]])) {
  const browser = await type.launch({headless:true,...(engine === 'webkit' && webkitOverride ? { executablePath: webkitOverride } : {})});
  try {for(const width of (startupProbe ? [375] : [375,390,765,1280])) {
    // Record an incomplete row before opening a context. A load failure must never
    // disappear from the evidence as a missing browser condition.
    const errors=[], row={engine,width,browserVersion:browser.version(),launcher:engine==='webkit' && webkitOverride ? webkitOverride : 'pinned default',status:'running',stage:'context',errors,cases:[]};
    evidence.rows.push(row);
    let context;
    try {
    context = await browser.newContext({viewport:{width,height:1100},hasTouch:width<400,isMobile:width<400,serviceWorkers:'block'});
    row.stage='new-page';
    await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
    const page=await context.newPage();page.on('pageerror',e=>errors.push(String(e)));
    row.stage='initial-load';
    if (startupProbe) throw new Error('STAGE3B7A_SYNTHETIC_INITIAL_LOAD_FAILURE');
    await page.goto(origin);await page.waitForFunction(()=>!!window.api);
    row.stage='native-controls';
    const result=await page.evaluate(async id=>{
      const api=window.api, scope={source:'stage3b5-test-independent-'+id,destination:'stage3b4-test-independent-'+id};
      const raw=JSON.stringify({version:1,history:[],notes:[],settings:{theme:'light',activePanel:'history'},independent:'native-\uD800'});
      const token={structure:1,incarnation:'independent',generation:0,latestOperation:'genesis'};
      const seed={current:raw,head:{...token,protocol:1,legacyRaw:raw},control:{protocol:1,state:'CLEAR'},'receipt:genesis':{protocol:1,token,previous:null,raw}};
      const write=(name,storeName,values)=>new Promise((resolve,reject)=>{const r=indexedDB.open(name,1);r.onupgradeneeded=()=>r.result.createObjectStore(storeName);r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,tx=db.transaction(storeName,'readwrite'),s=tx.objectStore(storeName);s.clear();for(const[k,v]of Object.entries(values))s.put(v,k);tx.oncomplete=()=>{db.close();resolve();};tx.onabort=()=>{db.close();reject(tx.error);};};});
      localStorage.setItem(scope.source,raw);await write(scope.destination,'records',seed);await write(scope.destination+'-migration','evidence',{});
      const snapshot=async()=>({source:localStorage.getItem(scope.source),target:await api.readSyntheticStore(scope.destination,'records'),journal:await api.readSyntheticStore(scope.destination+'-migration','evidence')});
      const cases=[];
      async function diagnose(name,prepare,options={}) {
        await write(scope.destination,'records',seed);await write(scope.destination+'-migration','evidence',{});
        if(prepare)await prepare();
        const before=JSON.stringify(await snapshot()), restorers=[],modes=[];let mutations=0;
        for(const[proto,keys]of [[Storage.prototype,['setItem','removeItem','clear']],[IDBObjectStore.prototype,['add','put','delete','clear']],[IDBDatabase.prototype,['createObjectStore','deleteObjectStore']],[IDBFactory.prototype,['deleteDatabase']]])for(const k of keys){const old=proto[k];proto[k]=function(...args){mutations++;return old.apply(this,args);};restorers.push(()=>proto[k]=old);}
        const oldTx=IDBDatabase.prototype.transaction;IDBDatabase.prototype.transaction=function(...args){modes.push(args[1]??'readonly');return oldTx.apply(this,args);};restorers.push(()=>IDBDatabase.prototype.transaction=oldTx);
        let report=null,error=null;
        try{let reads=0;const reader=api.createReadOnlyReconciler({scope,getItem:()=>options.change && reads++ ? raw+' ':localStorage.getItem(scope.source),...(options.factory?{factory:options.factory}:{})});const pending=reader.diagnose(options.previous);if(options.close)reader.close();report=await pending;reader.close();}catch(e){error=String(e);}finally{restorers.forEach(f=>f());}
        const after=JSON.stringify(await snapshot());
        let pass=before===after&&mutations===0&&modes.every(m=>m==='readonly');
        if(options.close)pass&&=error?.includes('invalidated');
        else {pass&&=!!report&&report.executionAllowed===false&&report.writeAllowed===false&&report.HOLD===true;if(options.expect)pass&&=report?.state===options.expect;if(options.code)pass&&=report?.findings.some(f=>f.code===options.code);if(options.states)pass&&=options.states.every(s=>report?.findings.some(f=>f.state===s));}
        cases.push({name,status:pass?'GREEN':'RED',before,after,mutations,modes,report,error});
      }
      await diagnose('independent native genesis',null,{expect:'CONSISTENT'});
      const previous=cases[0].report.evidence;
      await diagnose('R1 synchronous open failure',null,{factory:{databases:async()=>[{name:scope.destination,version:1},{name:scope.destination+'-migration',version:1}],open(){throw new DOMException('Synthetic denied read','SecurityError');}},expect:'UNKNOWN'});
      await diagnose('R2 malformed retained checkpoint',null,{previous:{...previous,target:{kind:'present',value:null}},expect:'CORRUPTED'});
      await diagnose('R3 missing receipt plus persistent UNKNOWN',async()=>{const s=structuredClone(seed);delete s['receipt:genesis'];s.control.state='HOLD';s['diagnostic:x']={protocol:1,status:'UNKNOWN',firstFailure:'independent simulated failure'};await write(scope.destination,'records',s);},{expect:'INCOMPLETE',states:['UNKNOWN','INCOMPLETE','BLOCKED']});
      await diagnose('R3 corrupt journal plus valid capture gap',()=>write(scope.destination+'-migration','evidence',{'rescue-attempt:r':{protocol:1,state:'PENDING',rescueId:'r',...scope},'diagnostic:bad':{protocol:99,state:'UNKNOWN',reason:'broken'}}),{expect:'CORRUPTED',code:'rescue-capture-gap-no-durable-raw'});
      await diagnose('observed change remains UNKNOWN',null,{change:true,expect:'UNKNOWN'});
      await diagnose('close invalidates pending callback',null,{close:true});
      const missing=scope.destination+'-absent', beforeDbs=(await indexedDB.databases()).map(x=>x.name).sort(),missingResult=await api.readSyntheticStore(missing,'records'),afterDbs=(await indexedDB.databases()).map(x=>x.name).sort();
      cases.push({name:'absent read creates no database',status:missingResult.kind==='absent'&&JSON.stringify(beforeDbs)===JSON.stringify(afterDbs)?'GREEN':'RED',missingResult,beforeDbs,afterDbs});
      window.controls={scope,cases};document.querySelector('button').onclick=()=>{document.querySelector('#results').textContent=JSON.stringify(cases.map(c=>({name:c.name,status:c.status,state:c.report?.state??null,error:c.error,mutations:c.mutations})),null,2);};
      return {scope,cases};
    },randomUUID());
    await page.locator('button')[width<400?'tap':'click']();
    const png=`${engine}-${width}.png`;await page.screenshot({path:`${out}/${png}`,fullPage:true});
    for(const c of result.cases){for(const candidate of c.report?.candidates??[]){assert.equal(candidate.hash,hash(Buffer.from(candidate.raw,'utf16le')));assert.equal(candidate.raw.length,candidate.length);}}
    Object.assign(row,{png,pngSha256:hash(await readFile(`${out}/${png}`)),...result,status:errors.length===0 && validateCases(result.cases)?'passed':'failed',stage:'complete'});
    }catch(error){row.status='failed';row.error=String(error?.stack??error);}
    finally{try{await context?.close();}catch(error){row.status='failed';row.closeError=String(error?.stack??error);}}
  }}finally{await browser.close();}
}
}finally{server.closeAllConnections();await new Promise(r=>server.close(r));evidence.finished=new Date().toISOString();evidence.sourceUnchanged=evidence.sourceSha256===hash(await readFile(source));await writeFile(`${out}/summary.json`,JSON.stringify(evidence,null,2)+'\n');}
const contractErrors=validateRows(evidence.rows);
const summary={contractErrors,out,sha:evidence.sha,sourceSha256:evidence.sourceSha256,moduleSha256:evidence.moduleSha256,sourceUnchanged:evidence.sourceUnchanged,conditions:evidence.rows.length,cases:evidence.rows.reduce((n,r)=>n+r.cases.length,0),red:evidence.rows.flatMap(r=>r.cases.filter(c=>c.status==='RED').map(c=>`${r.engine}:${r.width}:${c.name}`)),errors:evidence.rows.flatMap(r=>r.errors),failures:evidence.rows.filter(r=>r.status!=='passed').map(r=>({engine:r.engine,width:r.width,stage:r.stage,error:r.error??r.closeError??null,errors:r.errors})),pngs:evidence.rows.filter(r=>r.png).map(r=>({png:r.png,sha256:r.pngSha256}))};
console.log(JSON.stringify(summary,null,2));if(process.env.OUTPUT)await writeFile(process.env.OUTPUT,JSON.stringify(summary,null,2)+'\n');process.exitCode=contractErrors.length||summary.red.length||summary.errors.length||summary.failures.length||summary.conditions!==8||!summary.sourceUnchanged?1:0;
