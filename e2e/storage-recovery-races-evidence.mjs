import assert from 'node:assert/strict';
import {scenarios} from './scenario-config.mjs';
export const CASES=['A-B-new-material','old-generation-late','invalidation-before-completion','change-during-regeneration','same-material-overlap','simulated-tabs','cancel-late','unknown-late','read-failure','validation-exception','incomplete-material','generation-mismatch','close-late','reload-unknown'];
const integer=x=>Number.isSafeInteger(x)&&x>=0;
const viewFields=['decisionId','stateId','status','reusable','checking','reasons'];
const select=(e,keys)=>Object.fromEntries(keys.map(k=>[k,e[k]]));
export function validateEvents(c) {
  assert.equal(c.eventSchemaVersion,2,'event-schema-version');
  assert.ok(c.events.length>=4);
  const operations=new Map(),invalidated=new Set();let newestOperation=0;
  for(const [index,e] of c.events.entries()) {
    assert.equal(e.sequence,index+1,'event-sequence');
    assert.ok(integer(e.operationId)&&e.operationId>0,'operation-id');
    assert.ok(integer(e.decisionId),'decision-id');
    assert.equal(e.generation,null,'generation-unobserved');
    assert.ok(e.stateId===null||/^[a-f0-9]{64}$/.test(e.stateId),'fingerprint');
    assert.ok(['VALID','STALE','UNKNOWN'].includes(e.status),'status');
    assert.equal(typeof e.reusable,'boolean');assert.equal(typeof e.checking,'boolean');
    const otherValidationPending=[...operations.entries()].some(([id,h])=>h.stage?.phase==='checking'&&!h.finish&&(id!==e.operationId||e.phase!=='finish'));
    if(otherValidationPending){assert.equal(e.checking,true,'inflight-validation-checking');assert.equal(e.reusable,false,'inflight-validation-authority');}
    assert.ok(Array.isArray(e.reasons)&&e.reasons.length>0&&e.reasons.every(r=>typeof r==='string'&&r.length>0),'reasons-required');
    assert.equal(e.writeAllowed,false);assert.equal(e.executionAllowed,false);
    if(e.phase==='checking')assert.equal(e.reusable,false,'checking-reusable');
    assert.equal(e.reusable,e.status==='VALID'&&!e.checking,'current-material-authority');
    if(e.status==='VALID')assert.notEqual(e.stateId,null,'valid-fingerprint');
    if(invalidated.has(e.decisionId))assert.equal(e.reusable,false,'invalidated-id-reuse');
    if(['notification','cancel','close'].includes(e.phase)) {
      assert.ok(e.operationId>newestOperation);newestOperation=e.operationId;
      assert.equal(e.operation,null);assert.equal(e.requestAllowed,null);
      if(e.phase==='notification')assert.ok(['relevant','unknown','unrelated-proven'].includes(e.outcome));
      if(e.phase==='cancel')assert.equal(e.outcome,'explicit-cancel');
      if(e.phase==='close')assert.equal(e.outcome,'session-ended');
      if(e.outcome!=='unrelated-proven') {
        assert.notEqual(e.status,'VALID','invalidation-status');assert.equal(e.reusable,false);
        if(e.outcome==='relevant')assert.equal(e.status,'STALE');
        invalidated.add(e.decisionId);
      }
      continue;
    }
    const op=e.operation;assert.ok(op&&['generate','review'].includes(op.kind),'operation-evidence-required');
    assert.ok(['validation','immediate-rejection'].includes(op.mode));
    if(op.kind==='review')assert.ok(integer(op.requestedDecisionId),'requested-id-required');
    else assert.equal(op.requestedDecisionId,null);
    if(op.mode==='validation')assert.equal(op.rejectionReason,null);
    else assert.ok(['old-id','busy','not-valid','closed'].includes(op.rejectionReason),'rejection-reason-required');
    if(e.phase==='start') {
      assert.ok(e.operationId>newestOperation&&!operations.has(e.operationId),'unique-operation');newestOperation=e.operationId;
      assert.equal(e.outcome,op.kind);assert.equal(e.requestAllowed,null);
      if(op.mode==='validation'&&op.kind==='review') {
        assert.equal(op.requestedDecisionId,e.decisionId);assert.equal(e.status,'VALID');assert.equal(e.checking,false);
      }
      operations.set(e.operationId,{start:e,stage:null,finish:null});continue;
    }
    const history=operations.get(e.operationId);assert.ok(history&&!history.finish,'operation-start-required');
    assert.deepEqual(op,history.start.operation,'operation-descriptor-changed');
    if(e.phase==='checking') {
      assert.equal(op.mode,'validation');assert.equal(history.stage,null);assert.equal(e.outcome,'no-authority-while-checking');
      assert.equal(e.checking,true,'checking-state');assert.equal(e.requestAllowed,null);
      if(op.kind==='review')assert.equal(e.decisionId,op.requestedDecisionId);
      else assert.ok(e.decisionId>history.start.decisionId,'new-material-id');
      history.stage=e;continue;
    }
    if(e.phase==='immediate-rejection') {
      assert.equal(op.mode,'immediate-rejection');assert.equal(history.stage,null);assert.equal(e.outcome,'request-rejected');assert.equal(e.requestAllowed,false);
      assert.deepEqual(select(e,viewFields),select(history.start,viewFields),'immediate-rejection-changes-current');
      if(op.rejectionReason==='old-id'){assert.equal(op.kind,'review');assert.notEqual(op.requestedDecisionId,e.decisionId);}
      if(op.rejectionReason==='busy'){assert.equal(op.kind,'review');assert.equal(op.requestedDecisionId,e.decisionId);assert.equal(e.checking,true);}
      if(op.rejectionReason==='not-valid'){assert.equal(op.kind,'review');assert.equal(op.requestedDecisionId,e.decisionId);assert.equal(e.checking,false);assert.notEqual(e.status,'VALID');}
      if(op.rejectionReason==='closed')assert.ok(c.events.slice(0,index).some(p=>p.phase==='close'),'closed-evidence-required');
      history.stage=e;continue;
    }
    assert.equal(e.phase,'finish','known-phase');assert.ok(history.stage,'operation-stage-required');
    if(op.mode==='immediate-rejection') {
      assert.equal(history.stage.phase,'immediate-rejection');assert.equal(e.requestAllowed,false);
      assert.equal(e.outcome,op.rejectionReason==='closed'?'closed-rejected':'review-rejected');
      assert.deepEqual(select(e,viewFields),select(history.stage,viewFields),'immediate-result-changed');
    } else {
      assert.equal(history.stage.phase,'checking');
      if(e.outcome==='obsolete-response-discarded') {
        assert.ok(c.events.slice(history.stage.sequence,index).some(p=>p.phase==='start'||p.phase==='cancel'||p.phase==='close'||(p.phase==='notification'&&p.outcome!=='unrelated-proven')),'discard-reason-required');
        assert.equal(e.requestAllowed,op.kind==='review'?false:null);
      } else if(e.outcome==='exception-unknown') {
        assert.notEqual(e.status,'VALID');assert.equal(e.requestAllowed,op.kind==='review'?false:null);
      } else if(op.kind==='generate') {
        assert.equal(e.outcome,'new-material');assert.equal(e.decisionId,history.stage.decisionId);assert.equal(e.requestAllowed,null);
      } else {
        assert.ok(['review-allowed','review-rejected'].includes(e.outcome));
        assert.equal(e.requestAllowed,e.outcome==='review-allowed');
        assert.equal(e.requestAllowed,op.requestedDecisionId===e.decisionId&&e.reusable,'review-result-contradiction');
      }
    }
    history.finish=e;
  }
  for(const history of operations.values())assert.ok(history.stage&&history.finish,'unfinished-operation');
  const last=c.events.at(-1),view=c.view;
  assert.deepEqual(select(last,viewFields),{decisionId:view.id,stateId:view.fingerprint,status:view.status,reusable:view.reusable,checking:view.checking,reasons:view.reasons},'final-view-event-mismatch');
}
export function validateRaceEvidence(x){
  assert.equal(x.kind,'synthetic-recovery-races');assert.equal(x.status,'PASS');assert.equal(x.dirty,false);
  for(const k of ['sha','tree'])assert.match(x[k],/^[a-f0-9]{40}$/);assert.match(x.bundleHash,/^[a-f0-9]{64}$/);
  assert.deepEqual(x.rows.map(r=>r.id).sort(),scenarios.map(s=>s.id).sort());
  for(const r of x.rows){
    const s=scenarios.find(s=>s.id===r.id);assert.equal(r.engine,s.engine);assert.equal(r.width,s.width);assert.deepEqual(r.actual,{width:s.width,height:s.height,dpr:s.deviceScaleFactor});assert.equal(r.status,'PASS');assert.deepEqual(r.errors,[]);assert.equal(r.writes,0);assert.deepEqual(r.cases.map(c=>c.name).sort(),[...CASES].sort());
    for(const k of ['png','trace'])assert.match(r[k].sha256,/^[a-f0-9]{64}$/);
    for(const c of r.cases){
      assert.equal(c.status,'PASS');assert.equal(c.simulated,true);assert.ok(c.reads.length>=2);validateEvents(c);
      assert.equal(c.view.writeAllowed,false);assert.equal(c.view.executionAllowed,false);assert.equal(c.view.HOLD,true);
      const expected=['A-B-new-material','old-generation-late'].includes(c.name)?'VALID':['read-failure','validation-exception','incomplete-material','cancel-late','unknown-late','close-late','reload-unknown'].includes(c.name)?'UNKNOWN':'STALE';assert.equal(c.view.status,expected);assert.equal(c.view.reusable,expected==='VALID');
      if(['A-B-new-material','old-generation-late'].includes(c.name)){
        const rejection=c.events.find(e=>e.phase==='immediate-rejection'&&e.operation?.rejectionReason==='old-id');
        assert.ok(rejection,'old-id-positive-required');assert.equal(rejection.reusable,true);assert.equal(rejection.requestAllowed,false);assert.equal(c.events.at(-1).outcome,'review-rejected');
      }
      if(['old-generation-late','invalidation-before-completion','change-during-regeneration','same-material-overlap','cancel-late','unknown-late','close-late'].includes(c.name))assert.ok(c.events.some(e=>e.outcome==='obsolete-response-discarded'));
    }
  }
  assert.equal(JSON.stringify(x).includes('SYNTHETIC_PRIVATE_SENTINEL'),false);return true;
}
