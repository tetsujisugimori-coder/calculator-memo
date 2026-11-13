// Stage 3B-11 synthetic-only research. NEVER import from a production writer.
// Token grammar follows Stage 3B-4; this multi-store experiment does not replace it.
import { validToken, tokenOf, type Token } from './storage-idb';
export const STORES = ['state', 'receipts', 'copies', 'attempts'] as const;
export const HOLD = { executionAllowed: false, writeAllowed: false, authority: 'NOT_ESTABLISHED', stage: 'HOLD' } as const;
export const MUTANTS = ['none', 'compare-outside', 'no-generation', 'no-incarnation', 'no-operation', 'missing-store', 'accept-stale', 'abort-success', 'early-success', 'old-session', 'ignore-receipt'] as const;
export type Mutant = typeof MUTANTS[number];
type Dict = Record<string, unknown>;
type Head = Token & { namespace: string; target: string; fingerprint: string };
type Receipt = { operationId: string; token: Token; raw: string; fingerprint: string; previous: string | null };
type Attempt = { request: AtomicRequest; status: string; boot: string };
export type AtomicRequest = {
  namespace: string; target: 'current'; expectedToken: Token; incarnation: string; generation: number;
  explicitOperationId: string; fingerprint: string; expectedRaw: string; candidateRaw: string;
  candidateFingerprint: string; decisionId: string; session: string; boot: string; pageId: string;
};
export type AtomicSnapshot = { current: string; head: Head; receipts: Record<string, Receipt>; copies: Dict; attempts: Record<string, Attempt>; hold: boolean; boot: string; session: string };
type Event = Dict & { kind: string; pageId: string; boot: string; session: string; sequence: number; wall: string; mono: number };
type Fault = { abort?: boolean; throwAfterCompare?: boolean; loseAck?: boolean; readbackMismatch?: boolean; queueRequests?: number };
const id = (x: unknown): x is string => typeof x === 'string' && /^[A-Za-z0-9_-]{1,160}$/.test(x);
const object = (x: unknown): x is Dict => !!x && typeof x === 'object' && !Array.isArray(x);
// Length-prefixed exact UTF-16 serialization, not cryptographic authenticity. Raw is also compared.
export const fingerprint = (raw: string) => `${raw.length}:${raw}`;
const rawValid = (x: unknown): x is string => typeof x === 'string' && x.length <= 65536;
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
export function validRequest(r: unknown): r is AtomicRequest {
  if (!object(r)) return false;
  const keys = ['namespace','target','expectedToken','incarnation','generation','explicitOperationId','fingerprint','expectedRaw','candidateRaw','candidateFingerprint','decisionId','session','boot','pageId'];
  return Object.keys(r).length === keys.length && keys.every(k => Object.hasOwn(r,k)) && typeof r.namespace === 'string' && /^stage3b11-test-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(r.namespace) && r.target === 'current' && validToken(r.expectedToken) && r.incarnation === r.expectedToken.incarnation && r.generation === r.expectedToken.generation && id(r.explicitOperationId) && r.explicitOperationId !== 'genesis' && rawValid(r.expectedRaw) && rawValid(r.candidateRaw) && r.fingerprint === fingerprint(r.expectedRaw) && r.candidateFingerprint === fingerprint(r.candidateRaw) && ['decisionId','session','boot','pageId'].every(k=>id(r[k]));
}
export function inspectAtomic(s: AtomicSnapshot): string | null {
  if (!s || !object(s.head) || !validToken(s.head) || !rawValid(s.current) || s.head.fingerprint !== fingerprint(s.current) || s.head.target !== 'current') return 'invalid-head-current';
  if (s.head.generation > 64) return 'capacity-or-generation-overflow';
  const receipts = Object.values(s.receipts).sort((a,b)=>a.token?.generation-b.token?.generation);
  if (receipts.length !== s.head.generation+1 || Object.keys(s.copies).length !== s.head.generation) return 'receipt-copy-count';
  let prior: Receipt | undefined;
  for(let n=0;n<receipts.length;n++) {
    const r=receipts[n];
    if(!r || !validToken(r.token) || r.token.generation!==n || r.token.incarnation!==s.head.incarnation || r.operationId!==r.token.latestOperation || !eq(s.receipts[r.operationId],r) || !rawValid(r.raw) || r.fingerprint!==fingerprint(r.raw) || r.previous!==(prior?.operationId??null)) return 'receipt-chain';
    if(n>0) {const c=s.copies[String(n)];if(!object(c)||c.raw!==prior?.raw||!eq(c.token,prior?.token)||c.operationId!==r.operationId)return 'copy-chain';}
    prior=r;
  }
  if(!eq(prior?.token,tokenOf(s.head)) || prior?.raw!==s.current) return 'receipt-current-mismatch';
  for(const [key,a] of Object.entries(s.attempts)) {
    if(!a||!validRequest(a.request)||key!==a.request.explicitOperationId||a.boot!==a.request.boot||a.request.namespace!==s.head.namespace||!['PENDING','COMMITTED','VERIFIED','REJECTED','UNKNOWN'].includes(a.status)) return 'invalid-attempt';
    if(['COMMITTED','VERIFIED'].includes(a.status)) {const r=s.receipts[key];if(!r||r.raw!==a.request.candidateRaw||r.previous!==a.request.expectedToken.latestOperation||r.token.generation!==a.request.generation+1||r.token.incarnation!==a.request.incarnation)return 'attempt-receipt-mismatch';}
  }
  return null;
}
export function hasUnresolved(s: AtomicSnapshot, except?: string): boolean {
  return Object.entries(s.attempts).some(([key,a])=>key!==except&&['PENDING','COMMITTED','UNKNOWN'].includes(a.status));
}
export function matchesAtomic(s: AtomicSnapshot,r: AtomicRequest,mutant: Mutant='none'): boolean {
  if(mutant==='accept-stale') return true;
  return s.head.namespace===r.namespace && s.head.target===r.target && s.current===r.expectedRaw && s.head.fingerprint===r.fingerprint && s.head.structure===r.expectedToken.structure && (mutant==='no-generation'||s.head.generation===r.generation) && (mutant==='no-incarnation'||s.head.incarnation===r.incarnation) && (mutant==='no-operation'||s.head.latestOperation===r.expectedToken.latestOperation);
}
export function startAtomic(config: {namespace: string;pageId: string;mutant?: Mutant}, emit: (event: Event)=>unknown = ()=>{}) {
  const {namespace,pageId}=config,mutant=config.mutant??'none';
  if(!/^stage3b11-test-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(namespace)||!id(pageId)||!MUTANTS.includes(mutant)) throw Error('synthetic-namespace-or-config-required');
  const boot=crypto.randomUUID();let session=crypto.randomUUID(),sequence=0,db:IDBDatabase|undefined,closed=false,sticky=false;
  const txOperations=new Map<string,string>();
  const requests=new Map<string,AtomicRequest>(),prechecks=new Map<string,AtomicSnapshot>(),pending:Promise<unknown>[]=[],messages:unknown[]=[];
  const event=(kind:string,data:Dict={})=>{const names:Record<string,string>={'transaction-start':'tx-start','transaction-read':'tx-read','transaction-complete':'tx-complete','transaction-abort':'tx-abort','operation-start':'update-request','operation-result':'update-result','write-requested':'write-request'};const e={operationId:typeof data.txId==='string'?txOperations.get(data.txId):undefined,...data,...HOLD,namespace,kind:names[kind]??kind,pageId,boot,session,sequence:++sequence,wall:new Date().toISOString(),mono:performance.now(),monotonic:performance.now()};pending.push(Promise.resolve(emit(e)));};
  const channel=new BroadcastChannel(namespace);channel.onmessage=e=>{messages.push(e.data);event('notification-received',{message:e.data});};
  const result=(status:string,reason:string,txId?:string)=>{const value={...HOLD,status,reason,txId};if(txId)event('operation-result',{txId,result:value,status,reason});return value;};
  async function open(create=false) {
    if(closed)throw Error('session-closed');if(db)return db;
    return new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open(namespace,1);r.onupgradeneeded=()=>{if(!create){r.transaction?.abort();return;}for(const name of STORES)r.result.createObjectStore(name);};r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('open-blocked'));r.onsuccess=()=>{if(closed){r.result.close();reject(Error('session-closed'));return;}db=r.result;if(db.objectStoreNames.length!==STORES.length||STORES.some(k=>!db!.objectStoreNames.contains(k))){db.close();db=undefined;reject(Error('store-scope-mismatch'));return;}db.onversionchange=()=>{sticky=true;db?.close();db=undefined;};resolve(db);};});
  }
  function collect(tx:IDBTransaction,done:(s:AtomicSnapshot)=>void,fail:(e:unknown)=>void) {
    const values:Record<string,Dict>={state:Object.create(null),receipts:Object.create(null),copies:Object.create(null),attempts:Object.create(null)};let left=STORES.length;
    for(const name of STORES) {try {const r=tx.objectStore(name).openCursor();r.onsuccess=()=>{try{const c=r.result;if(c){values[name][String(c.key)]=c.value;c.continue();}else if(--left===0)done({current:values.state.current as string,head:values.state.head as Head,receipts:values.receipts as Record<string,Receipt>,copies:values.copies,attempts:values.attempts as Record<string,Attempt>,hold:sticky||Object.values(values.attempts).some(a=>object(a)&&['PENDING','UNKNOWN','COMMITTED'].includes(String(a.status))),boot,session});}catch(e){fail(e);}};}catch(e){fail(e);}}
  }
  function transaction<T>(database:IDBDatabase,mode:IDBTransactionMode,txId:string,body:(tx:IDBTransaction,s:AtomicSnapshot,set:(x:T)=>void)=>void,scope:readonly string[]=STORES,early=false):Promise<T> {
    return new Promise((resolve,reject)=>{let tx:IDBTransaction,answer:T,failure:unknown;try{tx=database.transaction([...scope],mode);}catch(e){reject(e);return;}
      event('transaction-start',{txId,mode,scope:[...scope]});
      const fail=(e:unknown)=>{failure=e;try{tx.abort();}catch{reject(e);}};
      tx.onabort=()=>{event('transaction-abort',{txId,error:String(failure??tx.error)});reject(failure??tx.error??Error('aborted'));};
      tx.onerror=()=>{};tx.oncomplete=()=>{event('transaction-complete',{txId,mode});resolve(answer);};
      collect(tx,s=>{event('transaction-read',{txId,mode,head:s.head,current:s.current,receiptCount:Object.keys(s.receipts).length});try{body(tx,s,x=>{answer=x;if(early){event('premature-result',{txId});resolve(x);}});}catch(e){fail(e);}},fail);
    });
  }
  async function snapshot() {return transaction<AtomicSnapshot>(await open(),'readonly',crypto.randomUUID(),(_tx,s,set)=>set(s));}
  async function mark(operationId:string,status:string) {await transaction<void>(await open(),'readwrite',crypto.randomUUID(),(tx,s)=>{const a=s.attempts[operationId];if(a)tx.objectStore('attempts').put({...a,status},operationId);});}
  return {
    async initialize(raw='A',incarnation='inc-1') {if(!rawValid(raw)||!id(incarnation))throw Error('invalid-genesis');const database=await open(true);await transaction<void>(database,'readwrite',crypto.randomUUID(),(tx,s)=>{if(s.head||s.current!==undefined||Object.keys(s.receipts).length||Object.keys(s.copies).length||Object.keys(s.attempts).length)throw Error('existing-genesis-protected');const token:Token={structure:1,incarnation,generation:0,latestOperation:'genesis'};tx.objectStore('state').add({...token,namespace,target:'current',fingerprint:fingerprint(raw)},'head');tx.objectStore('state').add(raw,'current');tx.objectStore('receipts').add({operationId:'genesis',token,raw,fingerprint:fingerprint(raw),previous:null},'genesis');});event('initialized');return snapshot();},
    snapshot,
    async diagnose(operationId:string) {const s=await snapshot();return {...HOLD,status:'UNKNOWN',retryAllowed:false,operationId,attempt:s.attempts[operationId]??null,receipt:s.receipts[operationId]??null,integrityError:inspectAtomic(s),observedAt:new Date().toISOString()};},
    async request(operationId:string,candidateRaw='B'):Promise<AtomicRequest> {
      if(sticky||closed)throw Error('runtime-hold');const s=await snapshot(),error=inspectAtomic(s);if(error||s.hold)throw Error(error??'unresolved-prior-operation');
      const r:AtomicRequest={namespace,target:'current',expectedToken:tokenOf(s.head),incarnation:s.head.incarnation,generation:s.head.generation,explicitOperationId:operationId,fingerprint:fingerprint(s.current),expectedRaw:s.current,candidateRaw,candidateFingerprint:fingerprint(candidateRaw),decisionId:crypto.randomUUID(),session,boot,pageId};
      if(!validRequest(r))throw Error('invalid-request');requests.set(r.decisionId,structuredClone(r));prechecks.set(r.decisionId,structuredClone(s));event('decision-created',{operationId,decisionId:r.decisionId,expectedToken:r.expectedToken,fingerprint:r.fingerprint});return r;
    },
    async update(input:AtomicRequest,fault:Fault={}) {
      let r:AtomicRequest;try{r=structuredClone(input);}catch{return result('REJECTED','invalid-request');}
      const txId=crypto.randomUUID();txOperations.set(txId,r?.explicitOperationId);txOperations.set(`${txId}-reserve`,r?.explicitOperationId);event('operation-start',{txId,operationId:r?.explicitOperationId,request:r});
      if(!validRequest(r)||r.namespace!==namespace||r.pageId!==pageId||!eq(requests.get(r.decisionId),r))return result('REJECTED','request-binding',txId);
      if(sticky||closed||(mutant!=='old-session'&&(r.boot!==boot||r.session!==session)))return result('REJECTED','session-or-runtime-hold',txId);
      if((fault.queueRequests??0)<0||(fault.queueRequests??0)>100000||!Number.isInteger(fault.queueRequests??0))return result('REJECTED','invalid-queue-count',txId);
      let prepared=false;
      try {
        const database=await open();
        const reserved=await transaction<string>(database,'readwrite',`${txId}-reserve`,(tx,s,set)=>{if(s.attempts[r.explicitOperationId]||s.receipts[r.explicitOperationId]){set('operation-id-consumed');return;}if(hasUnresolved(s)){set('unresolved-reservation');return;}tx.objectStore('attempts').add({request:r,status:'PENDING',boot},r.explicitOperationId);set('READY');});
        if(reserved!=='READY')return result('REJECTED',reserved,txId);prepared=true;
        const committed=await transaction<boolean>(database,'readwrite',txId,(tx,s,set)=>{
          const error=mutant==='ignore-receipt'?null:inspectAtomic(s);if(error)throw Error(error);
          if(mutant!=='old-session'&&(r.session!==session||closed))throw Error('old-session');
          if(hasUnresolved(s,r.explicitOperationId))throw Error('other-unresolved-operation');
          const attempt=s.attempts[r.explicitOperationId];if(!attempt||attempt.status!=='PENDING'||!eq(attempt.request,r))throw Error('attempt-binding');
          const comparison=mutant==='compare-outside'?prechecks.get(r.decisionId)!:s;
          if(!matchesAtomic(comparison,r,mutant)){tx.objectStore('attempts').put({...attempt,status:'REJECTED'},r.explicitOperationId);event('compare-rejected',{txId,operationId:r.explicitOperationId});set(false);return;}
          if(s.head.generation>=64||s.head.generation===Number.MAX_SAFE_INTEGER)throw Error('capacity-or-generation-overflow');
          event('compare-success',{txId,operationId:r.explicitOperationId,head:s.head});
          if(fault.throwAfterCompare)throw Error('injected-after-compare');
          const perform=()=>{
            const token:Token={...tokenOf(s.head),generation:s.head.generation+1,latestOperation:r.explicitOperationId};
            tx.objectStore('copies').add({raw:s.current,token:tokenOf(s.head),operationId:r.explicitOperationId},String(token.generation));
            tx.objectStore('state').put(r.candidateRaw,'current');tx.objectStore('state').put({...s.head,...token,fingerprint:r.candidateFingerprint},'head');
            tx.objectStore('receipts').add({operationId:r.explicitOperationId,token,raw:r.candidateRaw,fingerprint:r.candidateFingerprint,previous:s.head.latestOperation},r.explicitOperationId);
            const last=tx.objectStore('attempts').put({...attempt,status:'COMMITTED'},r.explicitOperationId);
            event('write-requested',{txId,operationId:r.explicitOperationId,token,raw:r.candidateRaw});last.onsuccess=()=>{event('write-request-success',{txId,operationId:r.explicitOperationId});if(fault.abort)tx.abort();};set(true);
          };
          let left=fault.queueRequests??0;const pump=()=>{if(left-->0){const q=tx.objectStore('state').get('head');q.onsuccess=pump;}else perform();};pump();
        },mutant==='missing-store'?['state','receipts','attempts']:STORES,mutant==='early-success');
        if(!committed)return result('REJECTED','compare-mismatch',txId);
        if(mutant==='early-success')return result('VERIFIED','incorrect-before-complete',txId);
        if(fault.loseAck)throw Error('ack-lost-after-complete');
        const after=await snapshot();event('readback',{txId,operationId:r.explicitOperationId,snapshot:after});
        if(mutant!=='ignore-receipt'&&(fault.readbackMismatch||inspectAtomic(after)||after.current!==r.candidateRaw||after.receipts[r.explicitOperationId]?.raw!==r.candidateRaw||after.head.latestOperation!==r.explicitOperationId))throw Error('readback-mismatch');
        if(mutant!=='old-session'&&(closed||r.session!==session))throw Error('old-session-response');
        event('readback-match',{txId,operationId:r.explicitOperationId});await mark(r.explicitOperationId,'VERIFIED');return result('VERIFIED','complete-and-readback-not-media-durability',txId);
      }catch(e){sticky=true;if(prepared)try{await mark(r.explicitOperationId,'UNKNOWN');}catch{/* Original failure is retained; no retry. */}if(mutant==='abort-success')return result('VERIFIED','incorrect-abort-success',txId);return result('UNKNOWN',String(e),txId);}
    },
    async writer(raw:string,options:{cooperative?:boolean;increment?:boolean;operationId?:string}={}) {
      if(!rawValid(raw))throw Error('invalid-writer-raw');const txId=crypto.randomUUID(),operationId=options.operationId??crypto.randomUUID();
      txOperations.set(txId,operationId);event('writer-start',{txId,operationId,raw,increment:options.increment!==false});
      const work=async()=>transaction<void>(await open(),'readwrite',txId,(tx,s)=>{event('writer-read',{txId,operationId,head:s.head,raw:s.current});
        if(options.increment===false){tx.objectStore('state').put(raw,'current');tx.objectStore('state').put({...s.head,fingerprint:fingerprint(raw)},'head');tx.objectStore('receipts').put({...s.receipts[s.head.latestOperation],raw,fingerprint:fingerprint(raw)},s.head.latestOperation);}
        else {const token:Token={...tokenOf(s.head),generation:s.head.generation+1,latestOperation:operationId};tx.objectStore('copies').add({raw:s.current,token:tokenOf(s.head),operationId},String(token.generation));tx.objectStore('state').put(raw,'current');tx.objectStore('state').put({...s.head,...token,fingerprint:fingerprint(raw)},'head');tx.objectStore('receipts').add({operationId,token,raw,fingerprint:fingerprint(raw),previous:s.head.latestOperation},operationId);}
        event('writer-request',{txId,operationId,raw,increment:options.increment!==false});});
      if(options.cooperative)await navigator.locks.request(namespace,work);else await work();event('writer-complete',{txId,operationId});
    },
    async rawWrite(patch:{current?:string;head?:Partial<Head>;receipt?:{key:string;value:unknown};deleteReceipt?:string}) {const txId=crypto.randomUUID();await transaction<void>(await open(),'readwrite',txId,(tx,s)=>{if(Object.hasOwn(patch,'current'))tx.objectStore('state').put(patch.current,'current');if(patch.head)tx.objectStore('state').put({...s.head,...patch.head},'head');if(patch.receipt)tx.objectStore('receipts').put(patch.receipt.value,patch.receipt.key);if(patch.deleteReceipt)tx.objectStore('receipts').delete(patch.deleteReceipt);event('corrupt-writer-request',{txId,patch});});event('corrupt-writer-complete',{txId});},
    send(message:unknown) {channel.postMessage(message);event('notification-sent',{message});},received:()=>structuredClone(messages),
    disconnect(){channel.close();event('channel-closed');},
    closeSession(){session=crypto.randomUUID();sticky=true;event('session-invalidated');},
    close(){closed=true;session=crypto.randomUUID();sticky=true;channel.close();db?.close();db=undefined;event('closed');},
    async flush(){await Promise.all(pending);},
  };
}
