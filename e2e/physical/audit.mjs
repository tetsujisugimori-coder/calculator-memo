import assert from 'node:assert/strict';
export const CASES=['normal','reload','lost-ack','abort','readback-mismatch','stale-writer','missing-receipt','quota-injected','eviction-injected','interrupted'];
const expect={normal:'VERIFIED',reload:'VERIFIED','lost-ack':'UNKNOWN',abort:'UNKNOWN','readback-mismatch':'UNKNOWN','stale-writer':'REJECTED','missing-receipt':'UNKNOWN','quota-injected':'UNKNOWN','eviction-injected':'VERIFIED',interrupted:'REJECTED'};
export function auditRow(r,identity){
 for(const k of ['sha','tree','run','attempt'])assert.equal(r[k],identity[k],`identity:${k}`);
 assert.equal(r.servedSHA256,identity.bundleSHA256,'served-bundle');assert.match(r.servedSHA256,/^[a-f0-9]{64}$/);
 assert.match(r.sha,/^[a-f0-9]{40}$/); assert.match(r.tree,/^[a-f0-9]{40}$/);
 assert.ok(CASES.includes(r.case),'case');assert.equal(r.mode,'cloud-synthetic');assert.equal(r.physicalAcceptance,'NOT_TESTED');assert.equal(r.durability,'UNKNOWN');
 assert.equal(r.executionAllowed,false);assert.equal(r.writeAllowed,false);assert.equal(r.authority,'NOT_ESTABLISHED');assert.deepEqual(r.errors,[]);
 assert.match(r.namespace,/^stage3b11-test-[a-f0-9-]{36}$/);assert.ok(r.trial&&r.browserVersion);assert.equal(r.device,`cloud-${r.engine}`,'device-binding');assert.ok(['chromium','webkit'].includes(r.engine),'engine');
 assert.equal(r.result.status,expect[r.case],'observation-result');assert.equal(r.evidence,'COMPLETE');assert.equal(r.cleanup,true);
 const boots=new Map();for(const e of r.events){assert.equal(e.namespace,r.namespace,'namespace');assert.equal(e.sequence,(boots.get(e.boot)||0)+1,'sequence');boots.set(e.boot,e.sequence);assert.equal(e.executionAllowed,false);}
 const own=r.events.filter(e=>e.txId===r.result.txId);assert.ok(own.length,'native-operation');
 assert.ok(own.some(e=>e.kind==='update-request'&&JSON.stringify(e.request)===JSON.stringify(r.request)),'request-binding');
 assert.ok(own.some(e=>e.kind==='update-result'&&JSON.stringify(e.result)===JSON.stringify(r.result)),'result-binding');
 const ordered=names=>{let prev=-1;for(const name of names){const i=own.findIndex(e=>e.kind===name);assert.ok(i>prev,`native-chain:${name}`);prev=i;}};
 if(r.case!=='interrupted'){
  ordered(['tx-start','tx-read']);const start=own.find(e=>e.kind==='tx-start');assert.equal(start.mode,'readwrite');assert.deepEqual([...start.scope].sort(),['attempts','copies','receipts','state'],'native-scope');
 }
 if(r.case==='abort')ordered(['tx-start','tx-read','compare-success','write-request','write-request-success','tx-abort','update-result']);
 if(r.case==='quota-injected')ordered(['tx-start','tx-read','compare-success','tx-abort','update-result']);
 if(r.case==='lost-ack')assert.equal(r.result.reason,'Error: ack-lost-after-complete','ack-loss-reason');
 if(r.case==='readback-mismatch')assert.equal(r.result.reason,'Error: readback-mismatch','readback-fault-reason');
 if(r.case==='missing-receipt'){assert.equal(r.after.receipts.genesis,undefined,'missing-genesis');assert.equal(r.diagnosis.integrityError,'receipt-copy-count');assert.equal(r.result.reason,'Error: receipt-copy-count');}
 const nativeReadback=own.find(e=>e.kind==='readback');if(r.result.status==='VERIFIED')ordered(['tx-complete','readback','readback-match','update-result']);if(r.case==='readback-mismatch')assert.ok(nativeReadback,'fault-readback-required');if(nativeReadback){assert.equal(nativeReadback.snapshot.current,r.after.current,'native-readback-current');assert.deepEqual(nativeReadback.snapshot.head,r.after.head,'native-readback-head');assert.deepEqual(nativeReadback.snapshot.receipts,r.after.receipts,'native-readback-receipts');}
 if(r.result.status==='UNKNOWN'){
  assert.ok(r.retry.txId&&r.retry.txId!==r.result.txId,'retry-id');const retryEvents=r.events.filter(e=>e.txId===r.retry.txId);
  assert.ok(retryEvents.some(e=>e.kind==='update-request'&&JSON.stringify(e.request)===JSON.stringify(r.request)),'retry-native-request');assert.ok(retryEvents.some(e=>e.kind==='update-result'&&JSON.stringify(e.result)===JSON.stringify(r.retry)),'retry-native-result');assert.ok(!retryEvents.some(e=>e.kind==='write-request'),'retry-no-write');
 }
 const kinds=own.map(e=>e.kind),complete=kinds.includes('tx-complete'),abort=kinds.includes('tx-abort');
 assert.equal(r.observations.transactionComplete,complete);assert.equal(r.observations.abort,abort);assert.equal(r.observations.readback,!!r.after);
 if(['normal','reload','lost-ack','readback-mismatch','eviction-injected'].includes(r.case)){
  assert.ok(complete&&!abort,'commit-chain');let prior=-1;for(const k of ['tx-start','tx-read','compare-success','write-request','write-request-success','tx-complete']){const i=kinds.indexOf(k);assert.ok(i>prior,`ordered:${k}`);prior=i;}
  const receipt=r.after.receipts[r.request.explicitOperationId];assert.ok(receipt,'receipt');assert.equal(receipt.raw,r.request.candidateRaw,'receipt-raw');assert.equal(r.after.current,r.request.candidateRaw,'current');assert.equal(receipt.token.generation,r.request.generation+1,'generation');assert.equal(receipt.operationId,r.request.explicitOperationId,'operation');assert.equal(receipt.token.latestOperation,r.request.explicitOperationId,'receipt-operation');assert.equal(receipt.previous,r.request.expectedToken.latestOperation,'receipt-previous');assert.equal(receipt.token.incarnation,r.request.incarnation,'receipt-incarnation');assert.deepEqual(receipt.token,{structure:r.after.head.structure,incarnation:r.after.head.incarnation,generation:r.after.head.generation,latestOperation:r.after.head.latestOperation},'head-receipt');
 }
 if(r.case==='abort'||r.case==='quota-injected'){
  assert.ok(abort&&!complete,'native-abort');
  // Reservation/UNKNOWN changes attempts and HOLD, not the protected committed state.
  for(const key of ['current','head','receipts','copies'])assert.deepEqual(r.after[key],r.before[key],`abort-preserved:${key}`);
  assert.deepEqual(r.after.attempts,{...r.before.attempts,[r.request.explicitOperationId]:{request:r.request,status:'UNKNOWN',boot:r.request.boot}},'abort-attempt');
  assert.equal(r.after.hold,true,'abort-hold');
 }
 if(r.case==='quota-injected')assert.match(r.result.reason,/QuotaExceededError/,'quota-reason');
 if(r.case==='missing-receipt')assert.ok(r.diagnosis.integrityError,'integrity-reason');
 if(r.case==='stale-writer'){assert.equal(r.after.current,'OTHER');assert.equal(r.result.reason,'compare-mismatch');}
 if(r.case==='interrupted'){assert.ok(r.transitions.includes('close-session-before-update'));assert.match(r.result.reason,/session-or-runtime-hold/);}
 if(r.result.status==='UNKNOWN'){assert.equal(r.retry.status,'REJECTED','no-replay');assert.equal(r.diagnosis.status,'UNKNOWN');assert.equal(r.diagnosis.retryAllowed,false);}
 if(r.case==='reload'){
  assert.equal(r.reopened.current,r.after.current,'reload-readback');
  for(const key of ['head','receipts','copies','attempts'])assert.deepEqual(r.reopened[key],r.after[key],`reload-persistent:${key}`);
  assert.ok(r.reopened.boot&&r.reopened.boot!==r.after.boot,'reload-new-boot');
  assert.ok(r.reopened.session&&r.reopened.session!==r.after.session,'reload-new-session');
  const reads=r.events.filter(e=>e.boot===r.reopened.boot&&e.kind==='tx-read');
  assert.equal(reads.length,1,'reload-native-read');
  const read=reads[0],tx=r.events.filter(e=>e.txId===read.txId);
  assert.deepEqual(tx.map(e=>e.kind),['tx-start','tx-read','tx-complete'],'reload-native-chain');
  for(const e of tx){assert.equal(e.boot,r.reopened.boot,'reload-boot-binding');assert.equal(e.session,r.reopened.session,'reload-session-binding');assert.equal(e.pageId,'A2','reload-page-binding');}
  assert.ok(r.events.indexOf(tx[0])>r.events.indexOf(own.at(-1)),'reload-after-update');
  assert.equal(tx[0].mode,'readonly','reload-readonly');
  assert.deepEqual([...tx[0].scope].sort(),['attempts','copies','receipts','state'],'reload-scope');
  assert.equal(read.current,r.reopened.current,'reload-native-current');assert.deepEqual(read.head,r.reopened.head,'reload-native-head');
  assert.equal(read.receiptCount,Object.keys(r.reopened.receipts).length,'reload-native-receipts');
 }
 if(r.case==='eviction-injected'){assert.equal(r.eviction.exists,false,'synthetic-deletion');assert.equal(r.eviction.kind,'synthetic-owned-db-deletion');}
 if(r.result.status==='UNKNOWN'){
  const retryEvents=r.events.filter(e=>e.txId===r.retry.txId);
  assert.deepEqual(retryEvents.map(e=>e.kind),['update-request','update-result'],'retry-cardinality-order');
  for(const e of retryEvents){for(const key of ['pageId','boot','session'])assert.equal(e[key],r.request[key],`retry-binding:${key}`);assert.equal(e.operationId,r.request.explicitOperationId,'retry-binding:operation');}
  assert.ok(r.events.indexOf(retryEvents[0])>r.events.indexOf(own.at(-1)),'retry-after-result');
 }
 const expectedKinds={
  normal:['update-request','tx-start','tx-read','compare-success','write-request','write-request-success','tx-complete','readback','readback-match','update-result'],
  'lost-ack':['update-request','tx-start','tx-read','compare-success','write-request','write-request-success','tx-complete','update-result'],
  abort:['update-request','tx-start','tx-read','compare-success','write-request','write-request-success','tx-abort','update-result'],
  'readback-mismatch':['update-request','tx-start','tx-read','compare-success','write-request','write-request-success','tx-complete','readback','update-result'],
  'stale-writer':['update-request','tx-start','tx-read','compare-rejected','tx-complete','update-result'],
  'missing-receipt':['update-request','tx-start','tx-read','tx-abort','update-result'],
  'quota-injected':['update-request','tx-start','tx-read','compare-success','tx-abort','update-result'],
  interrupted:['update-request','update-result']
 };
 assert.deepEqual(own.map(e=>e.kind),expectedKinds[r.case]||expectedKinds.normal,'main-event-cardinality-order');
 let session=r.request.session;
 if(r.case==='interrupted'){
  const changes=r.events.filter(e=>e.kind==='session-invalidated');
  assert.equal(changes.length,1,'interrupted-session-evidence');const change=changes[0];
  assert.equal(change.pageId,r.request.pageId,'interrupted-page');assert.equal(change.boot,r.request.boot,'interrupted-boot');
  assert.ok(change.session&&change.session!==session,'interrupted-new-session');
  assert.ok(r.events.indexOf(change)<r.events.indexOf(own[0]),'interrupted-before-request');session=change.session;
 }
 for(const e of own){
  assert.equal(e.operationId,r.request.explicitOperationId,'main-operation-binding');
  assert.equal(e.pageId,r.request.pageId,'main-page-binding');assert.equal(e.boot,r.request.boot,'main-boot-binding');
  assert.equal(e.session,session,'main-session-binding');
 }
 return true;
}
export function auditSuite(s){assert.equal(s.rows.length,20,'complete-matrix');assert.equal(new Set(s.rows.map(r=>r.trial)).size,20,'unique-trials');assert.equal(new Set(s.rows.map(r=>r.namespace)).size,20,'unique-namespaces');for(const engine of ['chromium','webkit'])for(const name of CASES){const rows=s.rows.filter(r=>r.engine===engine&&r.case===name);assert.equal(rows.length,1,'case-matrix');auditRow(rows[0],s);}return true;}
