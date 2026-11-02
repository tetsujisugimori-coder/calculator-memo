// Bounded reconstructed counterexamples. Raw oracle outcomes and this outer verdict are distinct.
import {spawn,execFileSync} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync,cpSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {createJournal} from './pr117-diagnostic-core.mjs';
const root=resolve(process.env.PR117_CONTROLS_OUT||('pr117-controls-'+Date.now()));mkdirSync(root,{recursive:false});
const repo=process.cwd(),results=[],hash=b=>createHash('sha256').update(b).digest('hex');
const files=['pr117-diagnosis.node-test.mjs','pr117-fault-subject.mjs','pr117-diagnostic-core.mjs','pr117-r1-probe.mjs'];
function fixture(name,legacy,mutation){
  const directory=join(root,name);mkdirSync(directory+'/e2e',{recursive:true});
  for(const file of [...files,...(legacy?[]:['pr117-process-proof.mjs'])]){
    let source=legacy?execFileSync('git',['show','64891f40f4685674b4171138be4aeacac75387f5:e2e/'+file],{encoding:'utf8'}):readFileSync('e2e/'+file,'utf8');
    if(mutation&&file===(legacy?'pr117-diagnosis.node-test.mjs':'pr117-process-proof.mjs')){
      const count=(source.match(/child\.kill\('SIGKILL'\)/g)||[]).length;assert.equal(count,legacy?2:1,'only intended mutation anchors');
      source=source.replaceAll("child.kill('SIGKILL')",mutation==='false'?'false /* intended kill disabled */':'true /* request falsely acknowledged; not delivered */');
    }
    writeFileSync(directory+'/e2e/'+file,source,{flag:'wx'});
  }
  mkdirSync(directory+'/e2e/node_modules');for(const dependency of ['playwright','playwright-core'])cpSync('e2e/node_modules/'+dependency,directory+'/e2e/node_modules/'+dependency,{recursive:true,errorOnExist:true,force:false});
  return directory;
}
async function run(name,args,cwd,env={}){
  const directory=join(root,name);mkdirSync(directory,{recursive:false});
  const child=spawn(process.execPath,args,{cwd,env:{...process.env,...env},stdio:['ignore','pipe','pipe'],detached:process.platform!=='win32',windowsHide:true});
  const stdout=[],stderr=[];let cleanup=false,launchError;
  child.stdout.on('data',b=>stdout.push(Buffer.from(b)));child.stderr.on('data',b=>stderr.push(Buffer.from(b)));child.on('error',error=>{launchError=String(error);});
  const limit=setTimeout(()=>{cleanup=true;try{if(process.platform==='win32')execFileSync('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});else process.kill(-child.pid,'SIGKILL');}catch(error){launchError=String(error);}},15000);
  const result=await new Promise(resolve=>child.once('close',(code,signal)=>resolve({code,signal})));clearTimeout(limit);
  const record={directory,name,args,cwd,node:process.version,platform:process.platform,result,outerEmergencyCleanup:cleanup,launchError:launchError||null};
  writeFileSync(directory+'/stdout.log',Buffer.concat(stdout));writeFileSync(directory+'/stderr.log',Buffer.concat(stderr));writeFileSync(directory+'/process.json',JSON.stringify(record,null,2));results.push(record);
  assert.equal(cleanup,false,'outer timeout is not a successful control');assert.equal(launchError,undefined);return record;
}
const pattern='--test-name-pattern=^raw fault subject: incomplete$';
const old=fixture('source-legacy',true),oldDisabled=fixture('source-legacy-disabled',true,'false');
const positive=fixture('source-fixed',false),disabled=fixture('source-fixed-disabled',false,'false'),notDelivered=fixture('source-fixed-not-delivered',false,'true');
let r=await run('legacy-standalone',['e2e/pr117-fault-subject.mjs','incomplete',join(root,'legacy-standalone-subject')],old);assert.deepEqual(r.result,{code:13,signal:null});
for(const [name,cwd,expected]of [['legacy-oracle',old,0],['legacy-disabled-oracle',oldDisabled,0],['fixed-oracle',positive,0],['fixed-disabled-oracle',disabled,1],['fixed-not-delivered-oracle',notDelivered,1]]){
  const output=join(root,name+'-evidence');r=await run(name,['--test',pattern,'e2e/pr117-diagnosis.node-test.mjs'],cwd,{PR117_FAULT_OUT:output});assert.equal(r.result.code,expected);
  const actual=JSON.parse(readFileSync(output+'/incomplete/exit.json','utf8'));r.subject=actual;
  if(name==='legacy-disabled-oracle')assert.deepEqual([actual.code,actual.signal],[13,null]);
  if(name.startsWith('fixed')){const proof=JSON.parse(readFileSync(output+'/incomplete/termination.json','utf8'));r.termination=proof;assert.equal(proof.closed,true);
    if(name==='fixed-oracle')assert.deepEqual([actual.code,actual.signal],[null,'SIGKILL']);
    // Windows process.kill emergency termination may report code1/null; it is never SIGKILL acceptance.
    assert.equal(proof.emergency.used,name!=='fixed-oracle');assert.equal(proof.request.accepted,name!=='fixed-disabled-oracle');
    try{process.kill(proof.pid,0);assert.fail('orphan child remains alive');}catch(error){assert.equal(error.code,'ESRCH','child must be absent');}}
  writeFileSync(r.directory+'/checked-outcome.json',JSON.stringify(r,null,2));
}
const inputDirectory=join(root,'utf8-input');mkdirSync(inputDirectory);const input=inputDirectory+'/operations.jsonl';
const journal=createJournal(input,{condition:'utf8-fixture',sha:'synthetic'},{compact:true,mirror:()=>{}});
for(let i=0;i<2;i++){const op=journal.start({kind:'browser-or-harness-operation',source:'synthetic.mjs',line:1,test:'日本語🙂',operation:'activate(選択経路だけ表示🙂)',locatorSummary:'graph: 選択経路だけ表示🙂',waitingFor:'選択の完了🙂'});journal.finish(op,'succeeded');}journal.assertHealthy();
const fixtureHash=hash(readFileSync(input));
for(const legacy of [false,true]){
  const name=legacy?'utf8-legacy-oracle':'utf8-fixed-oracle',output=join(root,name+'-evidence');r=await run(name,['--test','--test-name-pattern=^generated coordinator preserves UTF-8 full fidelity$','e2e/pr117-p2-regression.node-test.mjs'],repo,{PR117_P2_OUT:output,PR117_UTF8_OPERATIONS:input,PR117_MIRROR_LEGACY:legacy?'1':'0'});assert.equal(r.result.code,legacy?1:0);assert.equal(hash(readFileSync(output+'/operations.jsonl')),fixtureHash);
  if(legacy){const failure=JSON.parse(readFileSync(output+'/fidelity-failure.json','utf8'));assert.deepEqual(failure.malformed,[]);assert.equal(failure.records.length,4);assert.ok(failure.records.every(record=>record.operation!=='activate(選択経路だけ表示🙂)'));assert.ok(failure.records.every(record=>record.locatorSummary!=='graph: 選択経路だけ表示🙂'));assert.equal(failure.profile,'selected-interior');}
}
writeFileSync(root+'/summary.json',JSON.stringify({outerVerdict:'PASS: expected bad oracles rejected/legacy loopholes reproduced',node:process.version,platform:process.platform,sharedUtf8FixtureSha256:fixtureHash,results},null,2));
console.log('P2_CONTROLS '+JSON.stringify({outerVerdict:'PASS',cases:results.map(r=>({name:r.name,oracle:r.result,subject:r.subject,emergency:r.termination?.emergency.used})),sharedUtf8FixtureSha256:fixtureHash}));
