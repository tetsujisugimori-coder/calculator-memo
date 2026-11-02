// Synthetic child only. An emergency stop is evidence of failure, never success.
import {spawn} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {analyzeProgress} from './pr117-diagnostic-core.mjs';

export function assertIntentionalSigkill(proof) {
  assert.equal(proof.spawnError,null,'child must start successfully');
  assert.equal(proof.ready?.pid,proof.pid,'ready must identify the child');
  assert.equal(proof.ready?.evidenceVerified,true,'ready must follow persisted incomplete operation');
  assert.equal(proof.request?.signal,'SIGKILL','explicit intended signal');
  assert.equal(proof.request?.attempted,true,'intended request must be attempted');
  assert.equal(proof.request?.accepted,true,'intended request must be accepted');
  assert.equal(proof.emergency.used,false,'emergency cleanup cannot satisfy the experiment');
  assert.equal(proof.result.code,null,'natural/nonzero exit is not SIGKILL evidence');
  assert.equal(proof.result.signal,'SIGKILL','actual close must report SIGKILL');
  assert.equal(proof.closed,true,'child must be reaped');
}

export async function runIncompleteSubject(directory,{subject='e2e/pr117-fault-subject.mjs',deadlineMs=5000}={}) {
  const proof={platform:process.platform,node:process.version,pid:null,spawnError:null,ready:null,request:null,emergency:{used:false},closed:false,result:null};
  const stdout=[],stderr=[];
  const child=spawn(process.execPath,[subject,'incomplete',directory],{stdio:['ignore','pipe','pipe','ipc']});proof.pid=child.pid??null;
  child.stdout.on('data',chunk=>stdout.push(Buffer.from(chunk)));child.stderr.on('data',chunk=>stderr.push(Buffer.from(chunk)));
  child.on('error',error=>{proof.spawnError=String(error);});
  child.on('message',message=>{
    if(message?.kind!=='ready-to-kill'||proof.ready)return;
    proof.ready={pid:message.pid,operationId:message.operationId,receivedAt:new Date().toISOString(),evidenceVerified:false};
    try {
      const state=analyzeProgress(readFileSync(directory+'/operations.jsonl','utf8'));
      assert.equal(message.pid,child.pid);assert.equal(state.incomplete.length,1);
      assert.equal(state.lastStarted.id,message.operationId);assert.equal(state.lastStarted.operation,'synthetic-never-completes');
      assert.equal(state.lastCompleted.operation,'completed-control');
      proof.ready.evidenceVerified=true;proof.ready.journal=state;
      proof.request={signal:'SIGKILL',attempted:true,accepted:false,requestedAt:new Date().toISOString()};
      proof.request.accepted=child.kill('SIGKILL');
    } catch(error) {proof.ready.error=String(error);}
  });
  const closed=new Promise(resolve=>child.once('close',(code,signal)=>{proof.closed=true;proof.closedAt=new Date().toISOString();proof.result={code,signal};resolve();}));
  const emergency=setTimeout(()=>{
    if(proof.closed)return;
    proof.emergency={used:true,signal:'SIGKILL',reason:'synthetic parent deadline',requestedAt:new Date().toISOString(),accepted:false};
    try{process.kill(child.pid,'SIGKILL');proof.emergency.accepted=true;}catch(error){proof.emergency.error=String(error);}
  },deadlineMs);
  let hardLimit;
  try {
    await Promise.race([closed,new Promise((_,reject)=>{hardLimit=setTimeout(()=>reject(Error('child cleanup did not complete within finite bound')),deadlineMs+3000);})]);
  } finally {
    clearTimeout(emergency);clearTimeout(hardLimit);
    if(!proof.closed){try{process.kill(child.pid,'SIGKILL');}catch(error){proof.cleanupError=String(error);}if(child.connected)child.disconnect();}
    mkdirSync(directory,{recursive:true});
    writeFileSync(directory+'/termination.json',JSON.stringify(proof,null,2),{flag:'wx'});
    writeFileSync(directory+'/stdout.log',Buffer.concat(stdout),{flag:'wx'});writeFileSync(directory+'/stderr.log',Buffer.concat(stderr),{flag:'wx'});
  }
  return {proof,result:proof.result,stdout:Buffer.concat(stdout).toString('utf8'),stderr:Buffer.concat(stderr).toString('utf8')};
}
