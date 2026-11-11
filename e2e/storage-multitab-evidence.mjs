import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
export const CASES=['broadcast-three-tabs','delayed-duplicate-reordered','stale-evidence','generation-aba','check-then-use','reload','close-reconnect','disconnect-missed','close-during-async','page-close-during-async','communication-failure','unknown-read','lock-failure','noncooperative-writer','late-older-response'];
export const EXPECTED_CHECKS={
 'broadcast-three-tabs':{'B-after-A':'STALE','C-after-A':'STALE','A-after-B':'STALE'},
 'delayed-duplicate-reordered':{'old-message-cannot-revive':'STALE'},
 'stale-evidence':{'use-stale-denied':'STALE'},
 'generation-aba':{'aba-denied':'STALE'},
 'check-then-use':{'initial-check':'VALID','use-time-denied':'STALE'},
 reload:{'reload-unknown':'UNKNOWN','reload-old-denied':'UNKNOWN'},
 'close-reconnect':{'new-tab-unknown':'UNKNOWN','new-tab-old-denied':'UNKNOWN'},
 'disconnect-missed':{'disconnected-unknown':'UNKNOWN','missed-change-denied':'STALE','reconnected-still-invalid':'STALE'},
 'close-during-async':{'pending-no-authority':'VALID','closed-late-denied':'UNKNOWN'},
 'page-close-during-async':{'pending-no-authority':'VALID','replacement-unknown':'UNKNOWN'},
 'communication-failure':{'communication-unknown':'UNKNOWN'},
 'unknown-read':{'failed-read-denied':'UNKNOWN','failure-sticky':'UNKNOWN'},
 'lock-failure':{'contended-read-denied':'UNKNOWN'},
 'noncooperative-writer':{'unannounced-write-denied':'STALE'},
 'late-older-response':{'new-generation-valid':'VALID','older-result-denied':'VALID'},
};
// Fixed operation contract, transcribed from the scenario actions. A missing whole
// operation pair must not make completeness checking vacuously true.
export const A_OPERATIONS = {
 'broadcast-three-tabs':['generate'], 'delayed-duplicate-reordered':['generate'],
 'stale-evidence':['generate','review'], 'generation-aba':['generate','review'],
 'check-then-use':['generate','review','review'], reload:['generate'],
 'close-reconnect':['generate'], 'disconnect-missed':['generate','generate','review'],
 'close-during-async':['generate','review'], 'page-close-during-async':['generate','review'],
 'communication-failure':['generate','generate'], 'unknown-read':['generate','review','review'],
 'lock-failure':['generate','review'], 'noncooperative-writer':['generate','review'],
 'late-older-response':['generate','review','generate'],
};
function validateOperationHistory(row) {
 const byBoot=new Map(), firstBoot=new Map();
 for(const e of row.events){
  if(!byBoot.has(e.boot)){byBoot.set(e.boot,{pageId:e.pageId,issued:0,starts:[],events:[]});if(!firstBoot.has(e.pageId))firstBoot.set(e.pageId,e.boot);}
  const state=byBoot.get(e.boot);assert.equal(e.pageId,state.pageId,'boot-page-identity');
  assert.equal(e.decision.id,state.issued,'decision-id-without-explicit-generation');
  if(e.kind==='generate-start')state.issued++;
  if(/^(generate|review)-start$/.test(e.kind)){assert.equal(e.operationId,state.starts.length+1,'operation-id-sequence');state.starts.push(e);}
  state.events.push(e);
 }
 const replacement=['reload','close-reconnect','page-close-during-async'].includes(row.name);
 assert.equal(byBoot.size,replacement?4:3,'exact-boot-count');assert.equal(row.pagesCreated,['close-reconnect','page-close-during-async'].includes(row.name)?4:3,'exact-page-count');
 assert.deepEqual([...firstBoot.keys()].sort(),['A','B','C']);
 for(const [boot,state] of byBoot){
  const initial=firstBoot.get(state.pageId)===boot;
  const kinds=initial?(state.pageId==='A'?A_OPERATIONS[row.name]:['generate']):(row.name==='page-close-during-async'?[]:['review']);
  assert.deepEqual(state.starts.map(e=>e.kind.split('-')[0]),kinds,'required-operation-history');
  for(const start of state.starts){
   const finish=state.events.find(e=>e.operationId===start.operationId&&e.kind===start.kind.replace('start','finish'));
   if(!finish){assert.equal(row.name,'page-close-during-async');assert.equal(start.kind,'review-start');continue;}
   const inside=state.events.filter(e=>e.sequence>start.sequence&&e.sequence<finish.sequence);
   if(start.kind==='generate-start'){
    const reads=inside.filter(e=>e.kind==='read-captured'&&e.decision.id===start.decision.id+1);
    assert.equal(reads.length,2,'generation-requires-two-native-reads');
    const generation=row.name==='late-older-response'&&start.operationId>1?2:1;
    assert.ok(reads.every(e=>e.generation===generation),'generation-native-read-identity');
    assert.equal(finish.decision.id,start.decision.id+1);assert.equal(finish.decision.status,'VALID','successful-explicit-generation');
   }else{
    assert.equal(typeof finish.allowed,'boolean');assert.equal(finish.allowed,finish.requestedId===finish.decision.id&&finish.decision.reusable,'review-outcome-authority');
    const reads=inside.filter(e=>e.kind==='read-captured'&&e.decision.id===start.requestedId);
    if(['stale-evidence','generation-aba','check-then-use','disconnect-missed','noncooperative-writer'].includes(row.name)){
     assert.equal(reads.length,2,'review-requires-two-native-reads');
     const generation=row.name==='check-then-use'&&start.operationId===2?1:row.name==='generation-aba'?3:2;
     assert.ok(reads.every(e=>e.generation===generation),'review-native-read-identity');
    }
    if(row.name==='unknown-read'&&start.operationId===2)assert.equal(inside.filter(e=>e.kind==='read-failed').length,1,'review-missing-read-failure');
    if(row.name==='lock-failure')assert.equal(inside.filter(e=>e.kind==='lock-unavailable').length,1,'review-missing-lock-failure');
   }
  }
 }
 for(const c of row.checks){
  const state=byBoot.get(c.boot),before=state.events.filter(e=>e.sequence<c.evidenceSequence);
  if(c.allowed!==undefined||c.label==='initial-check'){
   const finish=before.filter(e=>e.kind==='review-finish').at(-1);assert.ok(finish,'checkpoint-review-result-required');
   assert.equal(finish.allowed,c.label==='initial-check'?true:c.allowed,'checkpoint-review-result-mismatch');
   assert.deepEqual(c.view,finish.decision,'checkpoint-review-view-mismatch');
  }
  if(c.label==='pending-no-authority'){
   const pending=state.starts.filter(e=>e.kind==='review-start'&&e.sequence<c.evidenceSequence&&!before.some(f=>f.kind==='review-finish'&&f.operationId===e.operationId));
   assert.equal(pending.length,1,'pending-review-history-required');
  }
 }
}
function validateCase(row){
 assert.equal(row.status,'PASS');assert.deepEqual(row.errors,[]);assert.equal(row.pagesCreated>=3,true);
 assert.match(row.namespace,/^stage3b10-test-[a-f0-9-]+$/);
 assert.ok(row.events.length>15,'missing-raw-events');
 const boots=new Map(),sends=new Map(),invalidated=new Set(),ordinals=new Set(),operations=new Map();
 for(const e of row.events){
  assert.equal(e.caseName,row.name);assert.ok(['A','B','C'].includes(e.pageId));assert.match(e.boot,/^[a-f0-9-]{36}$/);
  assert.ok(Number.isSafeInteger(e.pageOrdinal)&&e.pageOrdinal>0&&e.pageOrdinal<=row.pagesCreated);ordinals.add(e.pageOrdinal);const previous=boots.get(e.boot);if(previous)assert.equal(e.pageOrdinal,previous.pageOrdinal);assert.equal(e.sequence,(previous?.sequence||0)+1,'page-monotonic-sequence');
  assert.ok(Number.isFinite(e.timestamp)&&Number.isFinite(e.monotonic));if(previous)assert.ok(e.monotonic>=previous.monotonic);
  boots.set(e.boot,e);assert.ok(e.generation===null||(Number.isSafeInteger(e.generation)&&e.generation>=0));
  const v=e.decision;assert.equal(v.HOLD,true);assert.equal(v.executionAllowed,false);assert.equal(v.writeAllowed,false);assert.equal(v.authority,'NOT_ESTABLISHED');
  assert.ok(['VALID','STALE','UNKNOWN'].includes(v.status));assert.equal(v.reusable,v.status==='VALID'&&!v.checking);
  const key=`${e.boot}:${v.id}`;if(invalidated.has(key))assert.equal(v.reusable,false,'invalidated-decision-revived');if(['STALE','UNKNOWN'].includes(v.status)&&!['generate-start','generate-finish','read-captured','read-lock-acquired','read-paused','read-resumed','snapshot','connected','boot'].includes(e.kind))invalidated.add(key);
  if(e.kind==='send'){const old=sends.get(e.messageId);if(old){assert.equal(old.boot,e.boot);assert.equal(old.messageGeneration,e.messageGeneration);assert.equal(old.messageKind,e.messageKind);}else sends.set(e.messageId,e);}
  if(e.kind==='receive'){const s=sends.get(e.messageId);assert.ok(s,'actual-send-required');assert.notEqual(s.boot,e.boot);assert.equal(s.pageId,e.sender);assert.equal(s.boot,e.senderBoot);assert.equal(s.messageGeneration,e.messageGeneration);assert.equal(s.messageKind,e.messageKind);assert.equal(v.reusable,false);}
  if(/^(generate|review)-(start|finish)$/.test(e.kind)){assert.ok(Number.isSafeInteger(e.operationId)&&e.operationId>0);const key=`${e.boot}:${e.operationId}`;if(e.kind.endsWith('start')){assert.ok(!operations.has(key),'unique-operation');operations.set(key,{start:e});}else{const op=operations.get(key);assert.ok(op&&!op.finish,'operation-start-required');assert.equal(e.kind.split('-')[0],op.start.kind.split('-')[0]);assert.equal(e.requestedId,op.start.requestedId);op.finish=e;}}
  if(e.kind==='review-finish'&&e.allowed){assert.equal(v.reusable,true);assert.equal(e.requestedId,v.id);}
 }
 for(const op of operations.values())if(!op.finish){assert.equal(row.name,'page-close-during-async','unfinished-operation');assert.ok(row.terminatedBoots.includes(op.start.boot),'real-page-close-required');assert.equal(op.start.kind,'review-start');}
 validateOperationHistory(row);
 assert.ok(boots.size>=3);assert.equal(ordinals.size,row.pagesCreated);for(const field of ['raw','trace']){assert.ok(row[field]?.file);assert.match(row[field].sha256,/^[a-f0-9]{64}$/);}assert.ok(row.events.some(e=>e.kind==='write-committed'));assert.ok(row.events.some(e=>e.kind==='read-captured'));assert.ok(row.events.some(e=>e.kind==='write-lock-acquired'));assert.ok(row.events.some(e=>e.kind==='read-lock-acquired'));
 const expected=EXPECTED_CHECKS[row.name];assert.ok(expected);assert.deepEqual(row.checks.map(c=>c.label).sort(),Object.keys(expected).sort());
 for(const c of row.checks){const e=row.events.find(e=>e.boot===c.boot&&e.sequence===c.evidenceSequence);assert.ok(e&&e.kind==='snapshot','checkpoint-raw-event-required');assert.deepEqual(c.view,e.decision,'checkpoint-raw-mismatch');assert.equal(c.view.status,expected[c.label],c.label);assert.equal(c.view.executionAllowed,false);assert.equal(c.view.writeAllowed,false);assert.equal(c.view.authority,'NOT_ESTABLISHED');
  if(c.label.includes('denied'))assert.equal(c.allowed,false,c.label);
  if(c.label==='pending-no-authority'){assert.equal(c.view.checking,true);assert.equal(c.view.reusable,false);}else assert.equal(c.view.reusable,c.view.status==='VALID');
 }
 const events=kind=>row.events.filter(e=>e.kind===kind);
 if(row.name==='broadcast-three-tabs'){
  const sent=events('send');assert.equal(sent.length,2);assert.deepEqual(sent.map(e=>e.pageId),['A','B']);assert.deepEqual(sent.map(e=>e.messageGeneration),[2,3]);assert.deepEqual(events('durable-observed').map(e=>[e.pageId,e.revision,e.generation]),[['A','C',3],['B','C',3],['C','C',3]]);
  for(const s of sent)assert.deepEqual(events('receive').filter(r=>r.messageId===s.messageId).map(r=>r.pageId).sort(),['A','B','C'].filter(p=>p!==s.pageId));
 }
 if(row.name==='delayed-duplicate-reordered'){
  const sends=events('send');assert.deepEqual(sends.map(e=>e.messageGeneration),[3,2,2]);assert.equal(sends[1].messageId,sends[2].messageId);
  for(const p of ['A','C'])assert.deepEqual(events('receive').filter(e=>e.pageId===p).map(e=>e.messageId),sends.map(e=>e.messageId));
 }
 if(row.name==='generation-aba')assert.deepEqual(events('write-committed').map(e=>[e.revision,e.generation]),[['A',1],['B',2],['A',3]]);
 if(['stale-evidence','generation-aba','check-then-use','noncooperative-writer','disconnect-missed'].includes(row.name)){
  const end=events('review-finish').at(-1);assert.equal(end.allowed,false);assert.equal(end.decision.status,'STALE');
  assert.ok(events('read-captured').some(e=>e.pageId==='A'&&e.generation>1),'fresh-use-time-read-required');
 }
 if(row.name==='noncooperative-writer'){const held=row.events.findIndex(e=>e.kind==='lock-held'),write=row.events.findIndex(e=>e.kind==='write-committed'&&e.cooperative===false),released=row.events.findIndex(e=>e.kind==='lock-released');assert.ok(held>=0&&write>held&&released>write,'nonparticipant-bypasses-held-lock');assert.equal(row.events[write].pageId,'C');}
 if(['reload','close-reconnect','page-close-during-async'].includes(row.name)){
  assert.equal(events('boot').filter(e=>e.pageId==='A').length,2);assert.ok(row.transitions.includes(row.name==='reload'?'reload':'page-close'));
 }
 if(row.name==='disconnect-missed'){assert.ok(events('disconnected').length);assert.ok(events('reconnected').length);assert.equal(events('receive').filter(e=>e.pageId==='A').length,0);}
 if(row.name==='communication-failure')assert.equal(events('communication-error').length,1);
 if(row.name==='unknown-read')assert.equal(events('read-failed').length,1);
 if(row.name==='lock-failure'){assert.equal(events('lock-held').length,1);assert.equal(events('lock-unavailable').length,1);assert.equal(events('lock-released').length,1);}
 if(['close-during-async','page-close-during-async','late-older-response'].includes(row.name))assert.equal(events('read-paused').length,1);
 if(['close-during-async','late-older-response'].includes(row.name))assert.equal(events('read-resumed').length,1);
 assert.deepEqual(row.cleanup.before,[row.sentinelName]);assert.deepEqual(row.cleanup.after,[row.sentinelName]);assert.equal(row.cleanup.sentinelBefore,'outside-synthetic-namespace');assert.equal(row.cleanup.sentinelAfter,row.cleanup.sentinelBefore);assert.deepEqual(row.cleanup.localBefore,{local:{'outside-multitab-sentinel':'unchanged'},session:{}});assert.deepEqual(row.cleanup.localBefore,row.cleanup.localAfter);assert.equal(row.cleanup.deleted,true);assert.equal(row.cleanup.contextClosed,true);
 return true;
}
export function validateMultitabEvidence(x){
 assert.equal(x.kind,'real-browser-multitab');assert.equal(x.status,'PASS');assert.equal(x.mutant,'none');assert.equal(x.dirty,false);assert.match(x.sha,/^[a-f0-9]{40}$/);assert.match(x.tree,/^[a-f0-9]{40}$/);assert.match(x.bundleHash,/^[a-f0-9]{64}$/);assert.match(x.origin,/^http:\/\/127\.0\.0\.1:\d+$/);
 assert.equal(x.rows.length,2*CASES.length);assert.deepEqual(x.rows.map(r=>`${r.engine}/${r.name}`).sort(),['chromium','webkit'].flatMap(e=>CASES.map(c=>`${e}/${c}`)).sort());
 for(const row of x.rows){assert.ok(row.browserVersion);validateCase(row);}return true;
}
export {validateCase};

export async function verifyArtifactFiles(x,directory){
 const hash=b=>createHash('sha256').update(b).digest('hex');
 assert.equal(hash(await readFile(`${directory}/fixture.mjs.txt`)),x.bundleHash,'bundle-hash');
 for(const row of x.rows){for(const kind of ['raw','trace']){
  assert.match(row[kind].file,/^[a-z0-9-]+\.(json|zip)$/,'local-artifact-name');
  const bytes=await readFile(`${directory}/${row[kind].file}`);assert.equal(hash(bytes),row[kind].sha256,'artifact-hash');
  if(kind==='raw')assert.deepEqual(JSON.parse(bytes),row.events,'raw-summary-mismatch');
 }}return true;
}
