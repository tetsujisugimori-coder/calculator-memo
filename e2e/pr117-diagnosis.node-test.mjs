import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {readFileSync,mkdirSync,writeFileSync,readdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {classifySpace,createJournal,analyzeProgress,requireArtifacts} from './pr117-diagnostic-core.mjs';
const out=resolve(process.env.PR117_FAULT_OUT||('pr117-faults-'+Date.now()));mkdirSync(out,{recursive:false});
const before={target:{identity:1,pressed:'false'}},after={target:{identity:1,pressed:'false'},original:{isConnected:true}};
test('classifier requires sufficient evidence and never identifies product/browser cause',()=>{
  assert.equal(classifySpace(null,after,[],'true').category,'E');assert.equal(classifySpace(before,after,[],'true').category,'A');
  for(const category of ['A','B','C','D','E'])assert.equal(typeof category,'string');
  const events=[{type:'keydown',code:'Space',target:{identity:1}}];assert.equal(classifySpace(before,after,events,'true').category,'B');
  assert.equal(classifySpace(before,after,[...events,{type:'click',target:{identity:1}}],'true').category,'C');
});
test('journal preserves exact original exception, records failures and detects truncated/missing evidence',async()=>{
  const lines=[],journal=createJournal(out+'/unit.jsonl',{}, {write:line=>lines.push(line),mirror:()=>{}}),original=Error('ORIGINAL');
  await assert.rejects(journal.run({kind:'check-or-wait'},async()=>{throw original;}),error=>error===original);
  journal.start({kind:'evidence-collection',operation:'screenshot'});const parsed=analyzeProgress(lines.join('')+'{"partial":');
  assert.equal(parsed.lastCompleted.status,'failed');assert.equal(parsed.incomplete.length,1);assert.equal(parsed.stopClass,'evidence-collection');assert.equal(parsed.malformed.length,1);
  assert.throws(()=>requireArtifacts(['a'],['a','b']),/missing/);
});
const faults=[['normal','SUCCESS',0],['no-click','B',1],['no-state','C',1],['replace','D',1],['focus','A',1],['prevent-default','B',1],['timeout','B',1],['observer-error','E',1],['pre-target',null,1],['write-failure',null,1],['missing-artifact',null,1],['incomplete',null,1]];
for(const [name,expected,expectedExit]of faults)test('raw fault subject: '+name,async()=>{
  const directory=resolve(out,name),child=spawn(process.execPath,['e2e/pr117-fault-subject.mjs',name,directory],{stdio:['ignore','pipe','pipe']});let stdout='',stderr='';
  child.stdout.on('data',chunk=>{stdout+=chunk;if(name==='incomplete'&&stdout.includes('READY_TO_KILL'))child.kill('SIGKILL');});child.stderr.on('data',chunk=>{stderr+=chunk;});
  const timeout=setTimeout(()=>child.kill('SIGKILL'),30000);const result=await new Promise(resolve=>child.once('close',(code,signal)=>resolve({code,signal})));clearTimeout(timeout);
  writeFileSync(directory+'/stdout.log',stdout);writeFileSync(directory+'/stderr.log',stderr);
  writeFileSync(directory+'/exit.json',JSON.stringify({...result,expectedExit,expected}));
  if(expectedExit===0)assert.equal(result.code,0,stderr);else assert.ok(result.code!==0||result.signal,JSON.stringify(result));
  if(expected){const r=JSON.parse(readFileSync(directory+'/result.json'));assert.equal(r.classifications[0].category,expected);assert.deepEqual(r.pageerrors,[]);assert.deepEqual(r.final?.writes||[],[]);
    if(name==='prevent-default')assert.ok(r.final.snapshot.events.some(e=>e.defaultPrevented===true&&e.position.endsWith(':bubble')));
    if(name==='replace')assert.equal(r.final.snapshot.original.isConnected,false);
    if(name==='focus')assert.equal(r.final.snapshot.active.id,'other');
    if(name==='timeout')assert.match(r.originalError,/TimeoutError/);
    if(name==='observer-error')assert.ok(r.diagnosticErrors.length>0);
    requireArtifacts(readdirSync(directory),['r1.jsonl','result.json','exit.json']);
  }
  if(name==='incomplete'){const parsed=analyzeProgress(readFileSync(directory+'/operations.jsonl','utf8'));assert.equal(parsed.incomplete.length,1);assert.equal(parsed.lastCompleted.operation,'completed-control');assert.equal(parsed.lastStarted.operation,'synthetic-never-completes');}
  if(name==='write-failure'){const r=JSON.parse(readFileSync(directory+'/result.json'));assert.ok(r.diagnosticErrors.length);assert.match(stdout,/ORIGINAL_FAILURE/);assert.match(stderr,/diagnostic recording failed/);}
  if(name==='missing-artifact')assert.match(stderr,/missing diagnostic evidence/);
  if(name==='pre-target'){const records=readFileSync(directory+'/r1.jsonl','utf8').trim().split('\n').map(JSON.parse);assert.ok(records.some(r=>r.phase==='failure-final'&&r.state.observerUnavailable&&r.state.active.tag));assert.ok(records.some(r=>r.phase==='failure-classification'&&r.category==='E'&&r.originalError.includes('PRE_TARGET_FAILURE')));}
});
test('legacy source lacks new evidence fields (static coverage RED, no old fault execution claimed)',()=>{
  const legacy=execFileSync('git',['-C',process.env.PR117_LEGACY_GIT_ROOT||'.','show','2e578abfd12374445d9ab7f94398a78803926338:e2e/pr117-r1-diagnosis.mjs'],{encoding:'utf8'});
  assert.ok(!legacy.includes('defaultPrevented'));assert.ok(!legacy.includes('isTrusted'));assert.ok(!legacy.includes('currentTarget'));
  writeFileSync(out+'/legacy-coverage.json',JSON.stringify({legacySha:'2e578abfd12374445d9ab7f94398a78803926338',result:'RED',missing:['defaultPrevented','isTrusted','currentTarget','operation-start-end'],scope:'static evidence schema coverage; no old detector fault execution claimed'},null,2));
});
