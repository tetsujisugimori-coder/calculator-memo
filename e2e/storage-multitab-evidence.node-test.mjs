import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CASES,EXPECTED_CHECKS,validateCase,validateMultitabEvidence} from './storage-multitab-evidence.mjs';
test('every required browser case has nonempty independent expected checkpoints',()=>{
 assert.equal(CASES.length,15);assert.equal(new Set(CASES).size,15);assert.deepEqual(Object.keys(EXPECTED_CHECKS).sort(),[...CASES].sort());
 for(const expected of Object.values(EXPECTED_CHECKS))assert.ok(Object.keys(expected).length);
});
for(const status of ['running','FAIL',undefined])test(`unfinished top-level ${status} is not success`,()=>assert.throws(()=>validateMultitabEvidence({kind:'real-browser-multitab',status})));
test('empty evidence cannot claim success',()=>assert.throws(()=>validateMultitabEvidence({kind:'real-browser-multitab',status:'PASS',mutant:'none',dirty:false,sha:'a'.repeat(40),tree:'b'.repeat(40),bundleHash:'c'.repeat(64),origin:'http://127.0.0.1:4000',rows:[]})));
test('synthetic PASS without raw rows is rejected',()=>assert.throws(()=>validateCase({name:CASES[0],status:'PASS',errors:[],pagesCreated:3,namespace:'stage3b10-test-ab',events:[]})));
test('page error cannot be masked by PASS',()=>assert.throws(()=>validateCase({name:CASES[0],status:'PASS',errors:['page-crash']})));

// Synthetic oracle controls, not claimed browser observations. Keep a complete
// positive history so structurally consistent omissions/forgeries are tested.
function broadcastControl(){
 const row={name:'broadcast-three-tabs',status:'PASS',errors:[],pagesCreated:3,namespace:'stage3b10-test-ab',sentinelName:'sentinel',events:[],checks:[],terminatedBoots:[],transitions:[],raw:{file:'raw.json',sha256:'a'.repeat(64)},trace:{file:'trace.zip',sha256:'b'.repeat(64)},cleanup:{before:['sentinel'],after:['sentinel'],sentinelBefore:'outside-synthetic-namespace',sentinelAfter:'outside-synthetic-namespace',localBefore:{local:{'outside-multitab-sentinel':'unchanged'},session:{}},localAfter:{local:{'outside-multitab-sentinel':'unchanged'},session:{}},deleted:true,contextClosed:true}};
 const states=Object.fromEntries(['A','B','C'].map((p,i)=>[p,{boot:`${i+1}`.repeat(8)+'-'+`${i+1}`.repeat(4)+'-'+`${i+1}`.repeat(4)+'-'+`${i+1}`.repeat(4)+'-'+`${i+1}`.repeat(12),n:0,generation:null,decision:{id:0,status:'UNKNOWN',reusable:false,checking:false,fingerprint:'c'.repeat(64),HOLD:true,executionAllowed:false,writeAllowed:false,authority:'NOT_ESTABLISHED',reasons:[]}}]));
 const emit=(p,kind,details={})=>{const s=states[p],e={pageId:p,pageOrdinal:['A','B','C'].indexOf(p)+1,boot:s.boot,sequence:++s.n,caseName:row.name,timestamp:1000+row.events.length,monotonic:s.n,generation:s.generation,kind,decision:structuredClone(s.decision),...details};row.events.push(e);return e;};
 for(const p of ['A','B','C']){emit(p,'connected');emit(p,'boot');}
 emit('A','write-lock-acquired');states.A.generation=1;emit('A','write-committed',{revision:'A',cooperative:true});
 for(const p of ['A','B','C']){const s=states[p];emit(p,'generate-start',{operationId:1});s.decision.id=1;s.decision.checking=true;for(let n=0;n<2;n++){emit(p,'read-lock-acquired');s.generation=1;emit(p,'read-captured',{revision:'A'});}Object.assign(s.decision,{status:'VALID',checking:false,reusable:true});emit(p,'generate-finish',{operationId:1});}
 const check=(p,label)=>{const e=emit(p,'snapshot');row.checks.push({label,boot:e.boot,evidenceSequence:e.sequence,view:structuredClone(e.decision)});};
 for(const [p,rev,g,receivers] of [['A','B',2,['B','C']],['B','C',3,['A','C']]]){
  emit(p,'write-lock-acquired');states[p].generation=g;emit(p,'write-committed',{revision:rev,cooperative:true});const id=`message-${p}`;emit(p,'send',{messageId:id,messageKind:'change',messageGeneration:g});
  for(const q of receivers){Object.assign(states[q].decision,{status:'STALE',reusable:false});emit(q,'receive',{messageId:id,messageKind:'change',messageGeneration:g,sender:p,senderBoot:states[p].boot});}
  if(p==='A'){check('B','B-after-A');check('C','C-after-A');}else check('A','A-after-B');
 }
 for(const p of ['A','B','C']){emit(p,'read-lock-acquired');states[p].generation=3;emit(p,'read-captured',{revision:'C'});emit(p,'durable-observed',{revision:'C'});emit(p,'session-closed');}
 return row;
}
function renumber(row){const counts=new Map(),refs=new Map();for(const e of row.events){const old=e.sequence;e.sequence=(counts.get(e.boot)||0)+1;counts.set(e.boot,e.sequence);refs.set(`${e.boot}:${old}`,e.sequence);}for(const c of row.checks)c.evidenceSequence=refs.get(`${c.boot}:${c.evidenceSequence}`);}
test('complete synthetic operation history is a positive oracle control',()=>assert.equal(validateCase(broadcastControl()),true));
test('whole generation operations cannot disappear behind consistent renumbering',()=>{const x=broadcastControl();x.events=x.events.filter(e=>!/^generate-(start|finish)$/.test(e.kind));renumber(x);assert.throws(()=>validateCase(x),/decision-id-without-explicit-generation|required-operation-history/);});
test('even coherent zero decision IDs cannot hide missing generation operations',()=>{const x=broadcastControl();x.events=x.events.filter(e=>!/^generate-(start|finish)$/.test(e.kind));for(const e of x.events){e.decision.id=0;if(e.decision.status==='VALID'){e.decision.status='UNKNOWN';e.decision.reusable=false;}}for(const c of x.checks)c.view.id=0;renumber(x);assert.throws(()=>validateCase(x),/required-operation-history/);});
test('an intermediate new-ID revival without explicit generation is rejected',()=>{const x=broadcastControl(),at=x.events.findIndex(e=>e.kind==='receive'&&e.pageId==='A'),e=structuredClone(x.events[at]);e.kind='snapshot';e.sequence+=0.5;e.monotonic+=0.01;Object.assign(e.decision,{id:2,status:'VALID',reusable:true});x.events.splice(at+1,0,e);renumber(x);assert.throws(()=>validateCase(x),/decision-id-without-explicit-generation/);});
test('decision ID rollback after generation is rejected',()=>{const x=broadcastControl(),e=x.events.find(e=>e.kind==='send');Object.assign(e.decision,{id:0,status:'STALE',reusable:false});assert.throws(()=>validateCase(x),/decision-id-without-explicit-generation/);});
test('native read omission is not disguised by a complete generation start/finish pair',()=>{const x=broadcastControl(),i=x.events.findIndex(e=>e.kind==='read-captured');x.events.splice(i,1);renumber(x);assert.throws(()=>validateCase(x),/generation-requires-two-native-reads/);});
