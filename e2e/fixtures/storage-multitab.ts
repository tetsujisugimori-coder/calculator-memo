// Stage 3B-10 synthetic browser adapter ONLY. Never import into production.
import { createDecisionLifecycle, type Observation } from './storage-decision-lifecycle';
import { syntheticObservation } from './storage-recovery-races';

type Config = { namespace:string; pageId:string; caseName:string; mutant:string };
type Message = { id:string; sender:string; boot:string; generation:number; kind:string };
export function startMultitab(config:Config, sink:(event:unknown)=>Promise<void>) {
  if (!/^stage3b10-test-[a-f0-9-]+$/.test(config.namespace)) throw Error('synthetic-namespace-required');
  const boot=crypto.randomUUID(), dbName=config.namespace, lockName=dbName+'-lock';
  let sequence=0, operation=0, generation:number|null=null, channel:BroadcastChannel|null=null;
  let failRead=false, cache:Observation|null=null, reviewing=false, pauseNext=false;
  let releaseRead:(()=>void)|null=null, releaseLock:(()=>void)|null=null;
  let pending:Promise<unknown>|null=null, queue=Promise.resolve();
  const messages:Message[]=[], received:Message[]=[];
  const lifecycle=createDecisionLifecycle(read);
  const view=()=>{const v=lifecycle.view();return {id:v.id,status:v.status,reusable:v.reusable,checking:v.checking,fingerprint:v.fingerprint,HOLD:v.HOLD,executionAllowed:v.executionAllowed,writeAllowed:v.writeAllowed,authority:'NOT_ESTABLISHED',reasons:v.reasons};};
  function record(kind:string, detail:Record<string,unknown>={}) {
    const event={caseName:config.caseName,pageId:config.pageId,boot,sequence:++sequence,timestamp:Date.now(),monotonic:performance.now(),kind,generation,decision:view(),...detail};
    queue=queue.then(()=>sink(event));return event;
  }
  async function open() {
    return new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open(dbName,1);r.onupgradeneeded=()=>r.result.createObjectStore('observation');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('open-blocked'));});
  }
  async function transaction(value?:Observation) {
    const db=await open();
    try{return await new Promise<Observation>((resolve,reject)=>{const tx=db.transaction('observation',value?'readwrite':'readonly');const r=value?tx.objectStore('observation').put(value,'current'):tx.objectStore('observation').get('current');tx.oncomplete=()=>resolve(value||r.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('aborted'));});}finally{db.close();}
  }
  async function read():Promise<Observation> {
    if(failRead){record('read-failed');throw Error('synthetic-read-unavailable');}
    if(config.mutant==='accept-stale'&&reviewing&&cache){record('mutant-cached-read');return structuredClone(cache);}
    const x=await navigator.locks.request(lockName,{ifAvailable:true,mode:'shared'},async lock=>{
      if(!lock){record('lock-unavailable');throw Error('lock-unavailable');}
      record('read-lock-acquired');return transaction();
    });
    if(!x)throw Error('missing-observation');generation=x.generation;record('read-captured',{revision:x.revision});
    if(pauseNext){pauseNext=false;record('read-paused');await new Promise<void>(r=>{releaseRead=r;});record('read-resumed');}
    return x;
  }
  function connect(){
    channel?.close();channel=new BroadcastChannel(dbName+'-channel');
    channel.onmessage=e=>{const m=e.data as Message;received.push(m);
      lifecycle.notifyChange(m.kind==='change'?'relevant':'unknown');record('receive',{messageId:m.id,sender:m.sender,senderBoot:m.boot,messageKind:m.kind,messageGeneration:m.generation});};
    channel.onmessageerror=()=>{lifecycle.notifyChange('unknown');record('communication-error');};
    record('connected');
  }
  async function send(kind='change',reuseId?:string){
    const m:Message=reuseId?messages.find(m=>m.id===reuseId)!:{id:`${boot}:${messages.length+1}`,sender:config.pageId,boot,generation:generation??0,kind};
    if(!m)throw Error('message-not-prepared');if(!reuseId)messages.push(m);
    record('send',{messageId:m.id,messageKind:m.kind,messageGeneration:m.generation});
    try{if(config.mutant!=='disable-communication'){if(!channel)throw Error('channel-disconnected');channel.postMessage(m);}}
    catch{lifecycle.notifyChange('unknown');record('communication-error',{messageId:m.id});}
    await queue;return m.id;
  }
  const api={
    async snapshot(){const e=record('snapshot');await queue;return {boot,pageId:config.pageId,generation,view:view(),received,evidenceSequence:e.sequence};},
    async generate(){const operationId=++operation;record('generate-start',{operationId});const v=await lifecycle.generate();cache=await transaction();record('generate-finish',{operationId});await queue;return v;},
    async review(id=lifecycle.view().id){reviewing=true;const operationId=++operation;record('review-start',{operationId,requestedId:id});try{const r=await lifecycle.useForReview(id);record('review-finish',{operationId,requestedId:id,allowed:r.allowed});await queue;return {allowed:r.allowed,view:view()};}finally{reviewing=false;}},
    async write(revision:string,nextGeneration:number,cooperative=true){
      const x=syntheticObservation();x.revision=revision;x.generation=nextGeneration;
      const write=async()=>{await transaction(x);generation=nextGeneration;record('write-committed',{revision,cooperative});};
      if(cooperative)await navigator.locks.request(lockName,async()=>{record('write-lock-acquired');await write();});else await write();await queue;
    },
    async observe(){const x=await read();record('durable-observed',{revision:x.revision});await queue;return {revision:x.revision,generation:x.generation};},
    send,
    async prepareMessage(){const m:Message={id:`${boot}:${messages.length+1}`,sender:config.pageId,boot,generation:generation??0,kind:'change'};messages.push(m);record('message-delayed',{messageId:m.id});await queue;return m.id;},
    async disconnect(){channel?.close();channel=null;lifecycle.notifyChange('unknown');record('disconnected');await queue;},
    async reconnect(){connect();lifecycle.notifyChange('unknown');record('reconnected');await queue;},
    async closeSession(){lifecycle.close();channel?.close();channel=null;record('session-closed');await queue;},
    async fail(value:boolean){failRead=value;record('set-read-failure',{enabled:value});await queue;},
    async beginPaused(kind:'review'|'generate'){pauseNext=true;pending=kind==='review'?api.review():api.generate();},
    async resume(){if(!releaseRead)throw Error('no-paused-read');releaseRead();releaseRead=null;const r=await pending;pending=null;return r;},
    async holdLock(){void navigator.locks.request(lockName,async()=>{record('lock-held');await queue;await new Promise<void>(r=>{releaseLock=r;});record('lock-released');});},
    async releaseLock(){if(!releaseLock)throw Error('lock-not-held');releaseLock();releaseLock=null;await queue;},
    async flush(){await queue;},
  };
  connect();record('boot');return api;
}
