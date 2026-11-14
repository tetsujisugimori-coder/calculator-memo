import assert from 'node:assert/strict';
export const CASES=['normal','reload','lost-ack','abort','readback-mismatch','stale-writer','missing-receipt','quota-injected','eviction-injected','interrupted'];
const expect={normal:'VERIFIED',reload:'VERIFIED','lost-ack':'UNKNOWN',abort:'UNKNOWN','readback-mismatch':'UNKNOWN','stale-writer':'REJECTED','missing-receipt':'UNKNOWN','quota-injected':'UNKNOWN','eviction-injected':'VERIFIED',interrupted:'REJECTED'};
export function auditRow(r,identity){
 for(const k of ['sha','tree','run','attempt'])assert.equal(r[k],identity[k],`identity:${k}`);
 assert.match(r.sha,/^[a-f0-9]{40}$/); assert.match(r.tree,/^[a-f0-9]{40}$/);
 assert.ok(CASES.includes(r.case),'case');assert.equal(r.mode,'cloud-synthetic');assert.equal(r.physicalAcceptance,'NOT_TESTED');assert.equal(r.durability,'UNKNOWN');
 assert.equal(r.executionAllowed,false);assert.equal(r.writeAllowed,false);assert.equal(r.authority,'NOT_ESTABLISHED');assert.deepEqual(r.errors,[]);
 assert.match(r.namespace,/^stage3b11-test-[a-f0-9-]{36}$/);assert.ok(r.trial&&r.device&&r.browserVersion);
 assert.equal(r.result.status,expect[r.case],'observation-result');assert.equal(r.evidence,'COMPLETE');assert.equal(r.cleanup,true);
 const boots=new Map();for(const e of r.events){assert.equal(e.namespace,r.namespace,'namespace');assert.equal(e.sequence,(boots.get(e.boot)||0)+1,'sequence');boots.set(e.boot,e.sequence);assert.equal(e.executionAllowed,false);}
 const own=r.events.filter(e=>e.txId===r.result.txId);assert.ok(own.length,'native-operation');
 assert.ok(own.some(e=>e.kind==='update-request'&&JSON.stringify(e.request)===JSON.stringify(r.request)),'request-binding');
 assert.ok(own.some(e=>e.kind==='update-result'&&JSON.stringify(e.result)===JSON.stringify(r.result)),'result-binding');
 const kinds=own.map(e=>e.kind),complete=kinds.includes('tx-complete'),abort=kinds.includes('tx-abort');
 assert.equal(r.observations.transactionComplete,complete);assert.equal(r.observations.abort,abort);assert.equal(r.observations.readback,!!r.after);
 if(['normal','reload','lost-ack','readback-mismatch','eviction-injected'].includes(r.case)){
  assert.ok(complete&&!abort,'commit-chain');let prior=-1;for(const k of ['tx-start','tx-read','compare-success','write-request','write-request-success','tx-complete']){const i=kinds.indexOf(k);assert.ok(i>prior,`ordered:${k}`);prior=i;}
  const receipt=r.after.receipts[r.request.explicitOperationId];assert.ok(receipt,'receipt');assert.equal(receipt.raw,r.request.candidateRaw,'receipt-raw');assert.equal(r.after.current,r.request.candidateRaw,'current');assert.equal(receipt.token.generation,r.request.generation+1,'generation');assert.equal(receipt.operationId,r.request.explicitOperationId,'operation');
 }
 if(r.case==='abort'||r.case==='quota-injected')assert.ok(abort&&!complete,'native-abort');
 if(r.case==='quota-injected')assert.match(r.result.reason,/QuotaExceededError/,'quota-reason');
 if(r.case==='missing-receipt')assert.ok(r.diagnosis.integrityError,'integrity-reason');
 if(r.case==='stale-writer'){assert.equal(r.after.current,'OTHER');assert.equal(r.result.reason,'compare-mismatch');}
 if(r.case==='interrupted'){assert.ok(r.transitions.includes('close-session-before-update'));assert.match(r.result.reason,/session-or-runtime-hold/);}
 if(r.result.status==='UNKNOWN'){assert.equal(r.retry.status,'REJECTED','no-replay');assert.equal(r.diagnosis.status,'UNKNOWN');assert.equal(r.diagnosis.retryAllowed,false);}
 if(r.case==='reload')assert.equal(r.reopened.current,r.after.current,'reload-readback');
 if(r.case==='eviction-injected'){assert.equal(r.eviction.exists,false,'synthetic-deletion');assert.equal(r.eviction.kind,'synthetic-owned-db-deletion');}
 return true;
}
export function auditSuite(s){assert.equal(s.rows.length,20,'complete-matrix');assert.equal(new Set(s.rows.map(r=>r.trial)).size,20,'unique-trials');for(const engine of ['chromium','webkit'])for(const name of CASES){const rows=s.rows.filter(r=>r.engine===engine&&r.case===name);assert.equal(rows.length,1,'case-matrix');auditRow(rows[0],s);}return true;}
