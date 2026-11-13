import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CASES,EXPECTATIONS,REQUIRED_CALLS,validateAtomicCase,validateAtomicEvidence} from './storage-atomic-evidence.mjs';
function positive(){
 const namespace='stage3b11-test-11111111-1111-1111-1111-111111111111',r={explicitOperationId:'op-a'},rb={explicitOperationId:'op-b'};
 const verified={status:'VERIFIED',txId:'A'},rejected={status:'REJECTED',txId:'B'};
 const final={head:{generation:1},current:'B',receipts:{genesis:{},'op-a':{}},copies:{1:{}}};
 const row={name:'A-same-token',engine:'chromium',status:'PASS',errors:[],browserVersion:'test-only-not-browser',namespace,sentinelName:'sentinel',executionAllowed:false,writeAllowed:false,authority:'NOT_ESTABLISHED',classification:'VERIFIED-isolated-contract',results:[verified,rejected],final,events:[],journal:[],raw:{file:'chromium-A-same-token-raw.json',sha256:'a'.repeat(64)},trace:{file:'chromium-A-same-token.zip',sha256:'b'.repeat(64)},cleanup:{deleted:true,contextClosed:true,before:['sentinel'],after:['sentinel'],sentinelBefore:'outside-synthetic-namespace',sentinelAfter:'outside-synthetic-namespace',localBefore:{},localAfter:{}}};
 const seq={A:0,B:0,C:0};const emit=(p,kind,data={})=>row.events.push({namespace,pageId:p,pageOrdinal:'ABC'.indexOf(p)+1,boot:p,session:p,sequence:++seq[p],monotonic:seq[p],kind,...data});
 for(const [p,req,res]of [['A',r,verified],['B',rb,rejected]]){const d={txId:p,operationId:req.explicitOperationId};emit(p,'update-request',{...d,request:req});if(p==='A'){for(const kind of ['compare-success','write-request','tx-complete','readback-match'])emit(p,kind,d);}emit(p,'update-result',{...d,result:res});}
 emit('C','tx-read',{head:final.head,current:'B',receiptCount:2});
 for(const [label,method,pageId,args,result,role]of [['init','initialize','A',[],{}],['request-a','request','A',[],r],['request-b','request','B',[],rb],['update-a','update','A',[r,{}],verified,'update'],['update-b','update','B',[rb,{}],rejected,'update'],['final','snapshot','C',[],final]])row.journal.push({ordinal:row.journal.length+1,label,method,pageId,args,result,role,started:row.journal.length,finished:row.journal.length+1});
 return row;
}
const renumber=x=>{const seen={};for(const e of x.events)e.sequence=seen[e.boot]=(seen[e.boot]||0)+1;};
test('complete synthetic oracle control accepted (not a browser result)',()=>assert.equal(validateAtomicCase(positive()),true));
test('all fixed cases have independently defined expectations',()=>{assert.equal(CASES.length,26);assert.equal(new Set(CASES).size,26);assert.deepEqual(Object.keys(EXPECTATIONS).sort(),[...CASES].sort());assert.deepEqual(Object.keys(REQUIRED_CALLS).sort(),[...CASES].sort());});
const mutations={
 'missing transaction complete':x=>{x.events=x.events.filter(e=>e.kind!=='tx-complete');renumber(x);},
 'success before complete':x=>{const n=x.events.findIndex(e=>e.kind==='update-result');const [e]=x.events.splice(n,1);x.events.splice(1,0,e);renumber(x);},
 'comparison outside transaction':x=>{x.events.find(e=>e.kind==='compare-success').txId='outside';},
 'raw operation omission':x=>{x.events=x.events.filter(e=>e.pageId!=='B');renumber(x);},
 'raw request tamper':x=>{x.events.find(e=>e.kind==='update-request').request={explicitOperationId:'other'};},
 'native result tamper':x=>{x.events.find(e=>e.kind==='update-result').result={status:'UNKNOWN'};},
 'missing readback':x=>{x.events=x.events.filter(e=>e.kind!=='readback-match');renumber(x);},
 'duplicated event':x=>{x.events.splice(1,0,structuredClone(x.events[0]));},
 'clock rollback':x=>{x.events[1].monotonic=-1;},
 'wrong namespace':x=>{x.events[0].namespace='other';},
 'missing case host call':x=>{x.journal.splice(1,1);x.journal.forEach((j,i)=>j.ordinal=i+1);},
 'another trial trace':x=>{x.trace.file='chromium-B-after-observation.zip';},
 'native final differs':x=>{x.events.at(-1).current='old';},
 'receipt count mismatch':x=>{x.events.at(-1).receiptCount=1;},
 'cleanup failed':x=>{x.cleanup.deleted=false;},
 'outside sentinel changed':x=>{x.cleanup.sentinelAfter='bad';},
 'write authority elevated':x=>{x.writeAllowed=true;},
 'masked page error':x=>{x.errors.push('page-crash');},
};
for(const [name,mutate]of Object.entries(mutations))test(`reject ${name}`,()=>{const x=positive();mutate(x);assert.throws(()=>validateAtomicCase(x));});
for(const status of ['running','FAIL','BLOCKED',undefined])test(`top level ${status} is never accepted`,()=>assert.throws(()=>validateAtomicEvidence({kind:'real-browser-atomic',status})));
test('another HEAD is rejected independent of valid single row',()=>{const x={kind:'real-browser-atomic',status:'PASS',dirty:false,mutant:'none',sha:'a'.repeat(40),tree:'b'.repeat(40),bundleHash:'c'.repeat(64),run:'1',attempt:'1',rows:[{...positive(),sha:'d'.repeat(40)}]};assert.throws(()=>validateAtomicEvidence(x));});
