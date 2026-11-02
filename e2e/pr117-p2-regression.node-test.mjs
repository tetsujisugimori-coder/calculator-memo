import test from 'node:test';
import assert from 'node:assert/strict';
import {PassThrough,Writable} from 'node:stream';
import {once} from 'node:events';
import {execFileSync} from 'node:child_process';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import ts from 'typescript';
import {buildObservedCoordinator} from './pr117-r2-diagnosis.mjs';
import {mirrorProgressLines} from './pr117-progress-mirror.mjs';
import {createJournal,decodeProgress} from './pr117-diagnostic-core.mjs';
import {assertIntentionalSigkill} from './pr117-process-proof.mjs';

const out=resolve(process.env.PR117_P2_OUT||('pr117-p2-'+Date.now()));mkdirSync(out,{recursive:false});
const sha=value=>createHash('sha256').update(value).digest('hex');
const original=execFileSync('git',['show','2f95a1d965df47aed76a399ef13729f1b2b412aa:e2e/smoke.mjs'],{encoding:'utf8'});
const generated=buildObservedCoordinator(original);writeFileSync(out+'/actual-coordinator.generated.mjs',generated);
function legacyBlock(){
  const source=execFileSync('git',['show','64891f40f4685674b4171138be4aeacac75387f5:e2e/pr117-r2-diagnosis.mjs'],{encoding:'utf8'});
  const ast=ts.createSourceFile('legacy.mjs',source,ts.ScriptTarget.ESNext,true,ts.ScriptKind.JS);let replacement;
  function visit(node){if(ts.isCallExpression(node)&&ts.isPropertyAccessExpression(node.expression)&&node.expression.name.text==='replace'&&node.arguments[0]?.text==='child.stdout.pipe(log, { end: false });')replacement=Function('return ('+node.arguments[1].getText(ast)+')')();ts.forEachChild(node,visit);}visit(ast);assert.ok(replacement?.includes('chunk.toString()'));return replacement;
}
function actualHarness(legacy=false){
  const start=generated.indexOf('child.stdout.pipe(log, { end: false });'),end=generated.indexOf('child.stderr.pipe(log, { end: false });',start);
  assert.ok(start>0&&end>start);const block=legacy?legacyBlock():generated.slice(start,end);
  const status=generated.match(/worker\.status = result\.code[^;]+;/)?.[0];assert.ok(status);
  const invoke=Function('child','log','__pr117Mirror','console',`let streamError;${block}\nreturn {error:()=>streamError,status:(result,record)=>{const worker={record};${status}return worker.status;}};`);
  return {invoke,block};
}
test('SIGKILL proof rejects natural exit, missing request, startup failure and cleanup',()=>{
  const valid={pid:123,spawnError:null,ready:{pid:123,evidenceVerified:true},request:{signal:'SIGKILL',attempted:true,accepted:true},emergency:{used:false},closed:true,result:{code:null,signal:'SIGKILL'}};
  assert.doesNotThrow(()=>assertIntentionalSigkill(valid));
  const cases=[{result:{code:13,signal:null}},{result:{code:1,signal:null}},{result:{code:0,signal:null}},{ready:null},{request:null},{request:{signal:'SIGKILL',attempted:true,accepted:false}},{emergency:{used:true}},{spawnError:'ENOENT'},{closed:false}];
  for(const patch of cases)assert.throws(()=>assertIntentionalSigkill({...valid,...patch}));
  writeFileSync(out+'/termination-predicate.json',JSON.stringify({accepted:1,rejected:cases.length,node:process.version,platform:process.platform}));
});

const operations=out+'/operations.jsonl',wire=[];
const meta={kind:'browser-or-harness-operation',source:'synthetic.mjs',line:1,test:'日本語🙂',operation:'activate(選択経路だけ表示🙂)',locatorSummary:'graph: 選択経路だけ表示🙂',waitingFor:'選択の完了🙂'};
if(process.env.PR117_UTF8_OPERATIONS){const bytes=readFileSync(process.env.PR117_UTF8_OPERATIONS);writeFileSync(operations,bytes,{flag:'wx'});for(const line of bytes.toString('utf8').trimEnd().split('\n'))wire.push(Buffer.from('DIAG_PROGRESS '+line+'\n'));}
else{const journal=createJournal(operations,{condition:'utf8-fixture',sha:'synthetic'},{compact:true,mirror:line=>wire.push(Buffer.from('DIAG_PROGRESS '+line))});for(let i=0;i<2;i++){const op=journal.start(meta);journal.finish(op,'succeeded');}journal.assertHealthy();}
const operationBytes=readFileSync(operations),expectedRecords=decodeProgress(operationBytes.toString('utf8')).records;
const completeMirror=Buffer.concat(wire).toString('utf8');
const tail=Buffer.from('DIAG_PROGRESS {"unfinished":"日本語🙂');
const input=Buffer.concat([Buffer.from('ordinary worker 日本語🙂\n'),Buffer.concat(wire),tail.subarray(0,tail.length-1)]);

async function receive(chunks,{legacy=false,throwSink=false}={}){
  const source=new PassThrough(),raw=[],mirrored=[];let observer;
  const log=new Writable({write(chunk,encoding,callback){raw.push(Buffer.from(chunk));callback();}});
  const {invoke}=actualHarness(legacy);
  const state=invoke({stdout:source},log,(...args)=>{observer=mirrorProgressLines(...args);return observer;},{log:line=>{if(throwSink)throw Error('injected mirror EIO');mirrored.push(line+'\n');}});
  const ended=once(source,'end');for(const chunk of chunks)source.write(chunk);source.end();await ended;
  return {raw:Buffer.concat(raw),mirror:mirrored.join(''),state:observer?.state(),workerStatus:state.status({code:0},{status:'passed'}),streamError:state.error()};
}
test('generated coordinator preserves UTF-8 full fidelity',async()=>{
  assert.equal(expectedRecords.length,4);const packets=operationBytes.toString('utf8').trim().split('\n').map(JSON.parse);assert.equal(packets.filter(p=>p.p==='site').length,1);
  const selected=input.indexOf(Buffer.from('選')),locatorSelected=input.indexOf(Buffer.from('選'),selected+3),emoji=input.indexOf(Buffer.from('🙂'));assert.ok(selected>0&&locatorSelected>selected&&emoji>0);
  const profiles=[{name:'whole',chunks:[input]},{name:'selected-interior',chunks:[input.subarray(0,selected+1),input.subarray(selected+1,locatorSelected+1),input.subarray(locatorSelected+1)]}];
  for(let split=1;split<input.length;split++)profiles.push({name:'split-'+split,chunks:[input.subarray(0,split),input.subarray(split)]});
  profiles.push({name:'bytewise',chunks:[...input].map(byte=>Buffer.from([byte]))});
  for(const width of [2,3,5,17]){const chunks=[];for(let at=0;at<input.length;at+=width)chunks.push(input.subarray(at,at+width));profiles.push({name:'width-'+width,chunks});}
  const summary=[];const legacy=process.env.PR117_MIRROR_LEGACY==='1';
  for(const profile of profiles){const result=await receive(profile.chunks,{legacy}),decoded=decodeProgress(result.mirror.replace(/^DIAG_PROGRESS /gm,''));
    assert.deepEqual(result.raw,input,'raw worker.log bytes');assert.deepEqual(readFileSync(operations),operationBytes,'operations.jsonl bytes');
    const record={profile:profile.name,rawSha256:sha(result.raw),mirrorSha256:sha(result.mirror),malformed:decoded.malformed,records:decoded.records,expectedRecords,expectedMirror:completeMirror,actualMirror:result.mirror};
    if(result.mirror!==completeMirror){writeFileSync(out+'/fidelity-failure.json',JSON.stringify(record,null,2));writeFileSync(out+'/failed-worker.log',result.raw);}
    assert.deepEqual(decoded.malformed,[]);assert.deepEqual(decoded.records,expectedRecords,'all dictionary-referencing records, operations and locators');assert.equal(result.mirror,completeMirror,'full Actions mirror');assert.equal(result.workerStatus,'passed');
    if(profile.name==='whole'||profile.name==='bytewise'||[selected+1,selected+2,emoji+1,emoji+2,emoji+3].some(n=>profile.name==='split-'+n)){writeFileSync(out+'/'+profile.name+'-worker.log',result.raw);writeFileSync(out+'/'+profile.name+'-mirror.log',result.mirror);}
    summary.push({profile:profile.name,rawSha256:record.rawSha256,mirrorSha256:record.mirrorSha256,records:decoded.records.length});
  }
  assert.equal(decodeProgress(operationBytes.toString('utf8')+'{"partial":').malformed.length,1);
  writeFileSync(out+'/fidelity-summary.json',JSON.stringify({profiles:summary.length,inputBytes:input.length,selectedByte:selected,emojiByte:emoji,operationBytes:operationBytes.length,rawSha256:sha(input),operationSha256:sha(operationBytes),allFullTextAndRecordsEqual:true,summary},null,2));
});
test('actual generated mirror IO failure marks worker failed without altering raw pipe',async()=>{
  const result=await receive([input],{throwSink:true});assert.deepEqual(result.raw,input);assert.equal(result.workerStatus,'failed');assert.match(result.streamError,/injected mirror EIO/);assert.ok(result.state.errors.length>0);
  writeFileSync(out+'/mirror-io.json',JSON.stringify({workerStatus:result.workerStatus,streamError:result.streamError,rawSha256:sha(result.raw),partialLine:result.state.partialLine},null,2));
});
