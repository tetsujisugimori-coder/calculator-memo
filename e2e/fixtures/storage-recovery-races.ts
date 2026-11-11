// Synthetic integration harness. Not imported by product code; no storage/writer API.
import { createDecisionLifecycle, type Observation } from './storage-decision-lifecycle';
type Operation = {
  kind: 'generate'|'review'; requestedDecisionId: number|null;
  mode: 'validation'|'immediate-rejection';
  rejectionReason: 'old-id'|'busy'|'not-valid'|'closed'|null;
};
export type Event = {
  sequence:number; operationId:number; phase:string; decisionId:number;
  stateId:string|null; generation:number|null; status:string; reusable:boolean;
  checking:boolean; reasons:string[]; outcome:string; operation:Operation|null;
  requestAllowed:boolean|null; writeAllowed:false; executionAllowed:false;
};
export function createRecoverySession(read:()=>Promise<Observation>) {
  let sequence=0, operation=0, epoch=0, closed=false;
  const events:Event[]=[];
  const lifecycle=createDecisionLifecycle(read);
  let visible=lifecycle.view();
  const record=(id:number,phase:string,outcome:string,op:Operation|null=null,requestAllowed:boolean|null=null)=>events.push({sequence:++sequence,operationId:id,phase,decisionId:visible.id,stateId:visible.fingerprint,generation:null,status:visible.status,reusable:visible.reusable,checking:visible.checking,reasons:[...visible.reasons],outcome,operation:op?{...op}:null,requestAllowed,writeAllowed:false,executionAllowed:false});
  const snapshot=()=>structuredClone({eventSchemaVersion:2,view:visible,events});
  async function run(kind:'generate'|'review',expectedId=visible.id) {
    const id=++operation,ticket=++epoch;
    visible=lifecycle.view();
    const rejectionReason=closed?'closed':kind==='review'?(expectedId!==visible.id?'old-id':visible.checking?'busy':visible.status!=='VALID'?'not-valid':null):null;
    const op:Operation={kind,requestedDecisionId:kind==='review'?expectedId:null,mode:rejectionReason?'immediate-rejection':'validation',rejectionReason};
    record(id,'start',kind,op);
    if(rejectionReason){
      // Do not describe a rejected request as a pending validation. Current material
      // may still be reusable: rejecting an old ID grants that request no authority.
      record(id,'immediate-rejection','request-rejected',op,false);
      // Still exercise the underlying lifecycle rejection rather than replacing
      // its decision with the observer's classification.
      const result=kind==='review'?await lifecycle.useForReview(expectedId):await lifecycle.generate();
      visible=lifecycle.view();
      const allowed='allowed' in result?result.allowed:false;
      record(id,'finish',closed?'closed-rejected':allowed?'review-allowed':'review-rejected',op,allowed);
      return snapshot();
    }
    const pending=kind==='generate'?lifecycle.generate():lifecycle.useForReview(expectedId);
    visible=lifecycle.view();record(id,'checking','no-authority-while-checking',op);
    try {
      const result=await pending;
      if(ticket!==epoch || closed){record(id,'finish','obsolete-response-discarded',op,kind==='review'?false:null);return snapshot();}
      visible=lifecycle.view();
      const allowed=kind==='review'&&'allowed' in result?result.allowed:null;
      record(id,'finish',kind==='review'?(allowed?'review-allowed':'review-rejected'):'new-material',op,allowed);
    } catch {
      if(ticket!==epoch || closed){record(id,'finish','obsolete-response-discarded',op,kind==='review'?false:null);return snapshot();}
      lifecycle.notifyChange('unknown'); visible=lifecycle.view();record(id,'finish','exception-unknown',op,kind==='review'?false:null);
    }
    return snapshot();
  }
  return {snapshot,generate:()=>run('generate'),review:(id=visible.id)=>run('review',id),
    change(kind:'relevant'|'unknown'|'unrelated-proven') { const id=++operation;if(kind!=='unrelated-proven')epoch++;visible=lifecycle.notifyChange(kind);record(id,'notification',kind);return snapshot(); },
    cancel(){epoch++;const id=++operation;visible=lifecycle.notifyChange('unknown');record(id,'cancel','explicit-cancel');return snapshot();},
    close(){epoch++;closed=true;const id=++operation;visible=lifecycle.close();record(id,'close','session-ended');return snapshot();}
  };
}
export function syntheticObservation():Observation {
 return {request:{scope:{source:'stage3b5-test-races',destination:'stage3b4-test-races'},capture:{source:{kind:'present',value:'{"version":1,"history":[],"notes":[],"settings":{"theme":"light","activePanel":"history"}}'},target:{kind:'absent'},journal:{kind:'absent'}}},revision:'A',generation:1,authority:{status:'NOT_ESTABLISHED',revision:'a1'},backups:[{id:'synthetic-backup',revision:'b1',raw:'SYNTHETIC_PRIVATE_SENTINEL'}],selection:{ids:[],policy:'all'}};
}
export const RACE_CASES=['A-B-new-material','old-generation-late','invalidation-before-completion','change-during-regeneration','same-material-overlap','simulated-tabs','cancel-late','unknown-late','read-failure','validation-exception','incomplete-material','generation-mismatch','close-late','reload-unknown'] as const;
type Name=typeof RACE_CASES[number];
const check=(ok:unknown,label:string)=>{if(!ok)throw Error(label);};
export async function runRace(name:Name) {
 let x=syntheticObservation(),fail=false,invalid=false,exception=false,delay=false;
 let release!:(x:Observation)=>void;
 const reads:{sequence:number;stateId:string;generation:number;result:string}[]=[];
 const read=async()=>{const value=structuredClone(x);reads.push({sequence:reads.length+1,stateId:value.revision,generation:value.generation,result:fail?'failure':invalid?'invalid':'captured'});if(fail)throw Error('SYNTHETIC_PRIVATE_SENTINEL');if(invalid)delete (value as Partial<Observation>).generation;if(exception)Object.defineProperty(value,'generation',{get(){throw Error('synthetic-validator-exception');},enumerable:true});if(delay){delay=false;return new Promise<Observation>(r=>{release=r;});}return value;};
 const s=createRecoverySession(read);await s.generate();const old=s.snapshot().view.id;check(s.snapshot().view.reusable,'initial-valid');
 if(name==='A-B-new-material'){x={...x,revision:'B',generation:2};await s.review();check(s.snapshot().view.status==='STALE','A-stale');await s.generate();check(s.snapshot().view.id!==old&&s.snapshot().view.reusable,'new-B');await s.review(old);check(s.snapshot().events.at(-1)?.outcome==='review-rejected','old-A-rejected');}
 else if(name==='simulated-tabs'){const t=createRecoverySession(read);await t.generate();x={...x,revision:'B',generation:2};s.change('relevant');t.change('relevant');await Promise.all([s.review(),t.review()]);check(!t.snapshot().view.reusable,'tab-B-stale');}
 else if(name==='read-failure'||name==='validation-exception'||name==='incomplete-material'){fail=name==='read-failure';invalid=name==='incomplete-material';exception=name==='validation-exception';await s.review();fail=false;invalid=false;exception=false;await s.review();check(s.snapshot().view.status==='UNKNOWN','failure-sticky');}
 else if(name==='generation-mismatch'){x.generation++;await s.review();check(s.snapshot().view.status==='STALE','generation-stale');}
 else if(name==='reload-unknown'){s.close();const fresh=createRecoverySession(read);check(fresh.snapshot().view.status==='UNKNOWN','restart-unknown');await fresh.review(old);check(!fresh.snapshot().view.reusable,'restart-no-import');}
 else {
   delay=true;const p=name==='old-generation-late'||name==='change-during-regeneration'?s.generate():s.review();
   check(!s.snapshot().view.reusable,'pending-gate');
   if(name==='old-generation-late'){x={...x,revision:'B',generation:2};await s.generate();}
   else if(name==='same-material-overlap'){await s.review();check(!s.snapshot().view.reusable,'concurrent-rejected');s.change('relevant');}
   else if(name==='cancel-late')s.cancel();
   else if(name==='unknown-late')s.change('unknown');
   else if(name==='close-late')s.close();
   else {x={...x,revision:'B',generation:2};s.change('relevant');}
   release(syntheticObservation());await p;
   if(name==='old-generation-late'){await s.review();check(s.snapshot().view.reusable,'latest-B-valid');await s.review(old);check(s.snapshot().events.at(-1)?.outcome==='review-rejected','obsolete-ID');}
   else {check(!s.snapshot().view.reusable,'late-cannot-revive');await s.review();check(!s.snapshot().view.reusable,'retry-cannot-revive');}
 }
 const result=s.snapshot();check(result.view.HOLD&&!result.view.writeAllowed&&!result.view.executionAllowed,'hold');check(!JSON.stringify(result).includes('SYNTHETIC_PRIVATE_SENTINEL'),'no-raw-log');
 return {name,status:'PASS' as const,...result,reads,simulated:true};
}
