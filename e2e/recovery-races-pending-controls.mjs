import assert from 'node:assert/strict';
import {validateRaceEvidence} from './storage-recovery-races-evidence.mjs';
/** Mutations only affect deep copies; the supplied normal evidence remains unchanged. */
export function pendingControls(original) {
  const before=JSON.stringify(original);validateRaceEvidence(original);
  const rows=[];
  for(const row of original.rows){
    const copy=structuredClone(original),mutated=copy.rows.find(r=>r.id===row.id);
    const event=mutated.cases.find(c=>c.name==='invalidation-before-completion').events.find(e=>e.sequence===5&&e.operationId===2&&e.decisionId===1);
    assert.equal(event.phase,'checking');assert.equal(event.checking,true);assert.equal(event.reusable,false);assert.equal(event.status,'VALID');
    event.reusable=true;
    assert.throws(()=>validateRaceEvidence(copy),/inflight-validation-authority|checking-reusable/,'must reject semantically, not merely schema');
    const overlapCopy=structuredClone(original);
    const overlap=overlapCopy.rows.find(r=>r.id===row.id).cases.find(c=>c.name==='old-generation-late').events.find(e=>e.sequence===8);
    assert.equal(overlap.phase,'finish');assert.equal(overlap.checking,true);assert.equal(overlap.reusable,false);
    overlap.checking=false;overlap.reusable=true;
    assert.throws(()=>validateRaceEvidence(overlapCopy),/inflight-validation-checking/);
    const notificationCopy=structuredClone(original);
    const notification=notificationCopy.rows.find(r=>r.id===row.id).cases.find(c=>c.name==='invalidation-before-completion').events.find(e=>e.phase==='notification');
    notification.status='VALID';notification.reusable=true;
    assert.throws(()=>validateRaceEvidence(notificationCopy));
    const missing=structuredClone(original);
    delete missing.rows.find(r=>r.id===row.id).cases[2].events[4].operation;
    assert.throws(()=>validateRaceEvidence(missing),/operation-evidence-required/);
    const contradiction=structuredClone(original);
    contradiction.rows.find(r=>r.id===row.id).cases.find(c=>c.name==='A-B-new-material').events.at(-1).requestAllowed=true;
    assert.throws(()=>validateRaceEvidence(contradiction));
    const positive=row.cases.filter(c=>['A-B-new-material','old-generation-late'].includes(c.name)).map(c=>{
      const e=c.events.find(e=>e.phase==='immediate-rejection'&&e.operation.rejectionReason==='old-id');
      assert.ok(e);assert.equal(e.reusable,true);assert.equal(e.checking,false);assert.equal(e.requestAllowed,false);assert.notEqual(e.operation.requestedDecisionId,e.decisionId);
      return {case:c.name,requestedDecisionId:e.operation.requestedDecisionId,currentDecisionId:e.decisionId,currentReusable:e.reusable,requestAllowed:e.requestAllowed};
    });
    assert.equal(positive.length,2);
    rows.push({environment:row.id,normalAccepted:true,pendingReusableMutation:'SEMANTICALLY_REJECTED',overlappingOperationMutation:'SEMANTICALLY_REJECTED',priorNotificationMutation:'REJECTED',missingOperationEvidence:'REJECTED',contradictoryRequestResult:'REJECTED',immediateRejectionPositives:positive});
  }
  assert.equal(JSON.stringify(original),before,'original-evidence-mutated');
  return {head:original.sha,eventSchemaVersion:2,originalPreserved:true,normalRows:rows.length,semanticRejections:rows.length,rows};
}
