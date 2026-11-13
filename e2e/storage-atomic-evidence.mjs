import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,lstat,readdir} from 'node:fs/promises';
export const CASES=['A-same-token','B-after-observation','C-before-transaction','D-queued-writer','E-abort','F-close-transaction','G-lost-ack','H-notifications','H-missing-notification','I-old-session','I-late-response','J-generation-aba','J-unobserved-aba','K-rollback','K-incarnation-reset','L-lock-failure','L-waiting-close','M-noncooperative','N-reload','O-media-mismatch','P-target-mismatch','Q-missing-generation','Q-overflow','Q-bad-receipt','R-unknown-reuse','R-cross-page-unknown','S-exception','S-readback-mismatch'];
export const EXPECTATIONS={
 'A-same-token':{results:['VERIFIED','REJECTED'],generation:1},
 'B-after-observation':{results:['REJECTED'],generation:1},
 'C-before-transaction':{results:['REJECTED'],generation:1},
 'D-queued-writer':{results:['UNKNOWN'],generation:2},
 'E-abort':{results:['UNKNOWN'],generation:0},
 'F-close-transaction':{results:[],generation:null,classification:'UNKNOWN'},
 'G-lost-ack':{results:['UNKNOWN'],generation:1},
 'H-notifications':{results:['REJECTED'],generation:1},
 'H-missing-notification':{results:['REJECTED'],generation:1},
 'R-cross-page-unknown':{results:['UNKNOWN','REJECTED'],generation:0},
 'I-late-response':{results:['UNKNOWN'],generation:1},
 'K-incarnation-reset':{results:['REJECTED'],generation:0},
 'I-old-session':{results:['REJECTED'],generation:0},
 'J-generation-aba':{results:['REJECTED'],generation:2},
 'J-unobserved-aba':{results:['VERIFIED'],generation:1,classification:'UNKNOWN-unobserved-ABA'},
 'K-rollback':{results:['UNKNOWN'],generation:0},
 'L-lock-failure':{results:[],generation:0,classification:'UNKNOWN'},
 'L-waiting-close':{results:[],generation:0,classification:'UNKNOWN'},
 'M-noncooperative':{results:['REJECTED'],generation:1},
 'N-reload':{results:['REJECTED'],generation:0},
 'O-media-mismatch':{results:['UNKNOWN'],generation:0},
 'P-target-mismatch':{results:['REJECTED'],generation:0},
 'Q-missing-generation':{results:['UNKNOWN'],generation:null,corruptGeneration:true},
 'Q-overflow':{results:['UNKNOWN'],generation:Number.MAX_SAFE_INTEGER},
 'Q-bad-receipt':{results:['UNKNOWN'],generation:0},
 'R-unknown-reuse':{results:['UNKNOWN','REJECTED'],generation:1},
 'S-exception':{results:['UNKNOWN'],generation:0},
 'S-readback-mismatch':{results:['UNKNOWN'],generation:1},
};
export const REQUIRED_CALLS={
 'A-same-token':['init','request-a','request-b','update-a','update-b','final'],
 'B-after-observation':['init','request-a','writer','update-a','final'],
 'C-before-transaction':['init','request-a','writer','update-a','final'],
 'D-queued-writer':['init','request-a','update-a','writer','final'],
 'E-abort':['init','request-a','update-a','final'],
 'F-close-transaction':['init','request-a','update-a','final'],
 'G-lost-ack':['init','request-a','update-a','final'],
 'H-notifications':['init','request-a','writer','send-new','send-old','send-duplicate','update-a','final'],
 'H-missing-notification':['init','request-a','writer','update-a','final'],
 'R-cross-page-unknown':['init','request-a','request-b','update-a','update-b','final'],
 'I-late-response':['init','request-a','update-a','close-session','final'],
 'K-incarnation-reset':['init','request-a','corrupt','update-a','final'],
 'I-old-session':['init','request-a','close-session','update-a','final'],
 'J-generation-aba':['init','request-a','writer-b','writer-a','update-a','final'],
 'J-unobserved-aba':['init','request-a','writer-b','writer-a','update-a','final'],
 'K-rollback':['init','writer','request-a','corrupt','update-a','final'],
 'L-lock-failure':['init','final'],
 'L-waiting-close':['init','final'],
 'M-noncooperative':['init','request-a','writer','update-a','final'],
 'N-reload':['init','request-a','update-a','final'],
 'O-media-mismatch':['init','request-a','preflight','final'],
 'P-target-mismatch':['init','request-a','update-a','final'],
 'Q-missing-generation':['init','request-a','corrupt','update-a','final'],
 'Q-overflow':['init','request-a','corrupt','update-a','final'],
 'Q-bad-receipt':['init','request-a','corrupt','update-a','final'],
 'R-unknown-reuse':['init','request-a','update-a','reuse-a','final'],
 'S-exception':['init','request-a','update-a','final'],
 'S-readback-mismatch':['init','request-a','update-a','final'],
};
const hash=b=>createHash('sha256').update(b).digest('hex');
function validateStoredChain(s,namespace){
 const head=s.head;assert.ok(head&&Number.isSafeInteger(head.generation)&&head.generation>=0&&head.generation<=64,'stored-generation');assert.equal(head.namespace,namespace);assert.equal(head.target,'current');assert.equal(head.structure,1);assert.equal(head.fingerprint,`${s.current.length}:${s.current}`,'stored-current-fingerprint');
 const receipts=Object.values(s.receipts).sort((a,b)=>a.token.generation-b.token.generation);assert.equal(receipts.length,head.generation+1,'stored-receipt-count');assert.equal(Object.keys(s.copies).length,head.generation,'stored-copy-count');let previous;
 for(let i=0;i<receipts.length;i++){const r=receipts[i];assert.equal(r.token.generation,i);assert.equal(r.token.structure,1);assert.equal(r.token.incarnation,head.incarnation);assert.equal(r.operationId,r.token.latestOperation);assert.deepEqual(s.receipts[r.operationId],r);assert.equal(r.fingerprint,`${r.raw.length}:${r.raw}`,'stored-receipt-fingerprint');assert.equal(r.previous,previous?.operationId??null,'stored-receipt-chain');if(i){const c=s.copies[String(i)];assert.ok(c);assert.equal(c.raw,previous.raw,'stored-copy-original');assert.deepEqual(c.token,previous.token);assert.equal(c.operationId,r.operationId);}previous=r;}
 assert.equal(previous.raw,s.current,'stored-receipt-current');assert.deepEqual(previous.token,{structure:head.structure,incarnation:head.incarnation,generation:head.generation,latestOperation:head.latestOperation},'stored-head-token');
 for(const [op,a]of Object.entries(s.attempts)){assert.equal(a.request.explicitOperationId,op);assert.equal(a.request.namespace,namespace);assert.equal(a.boot,a.request.boot);assert.ok(['PENDING','COMMITTED','VERIFIED','REJECTED','UNKNOWN'].includes(a.status));if(a.status==='VERIFIED'||a.status==='COMMITTED'){const r=s.receipts[op];assert.ok(r);assert.equal(r.raw,a.request.candidateRaw,'stored-attempt-receipt');assert.equal(r.previous,a.request.expectedToken.latestOperation);}}
}
export function validateAtomicCase(row){
 assert.ok(CASES.includes(row.name),'known-case');assert.equal(row.status,'PASS');assert.deepEqual(row.errors,[]);assert.match(row.namespace,/^stage3b11-test-[a-f0-9-]{36}$/);
 assert.ok(['chromium','webkit'].includes(row.engine));assert.ok(row.browserVersion);assert.equal(row.executionAllowed,false);assert.equal(row.writeAllowed,false);assert.equal(row.authority,'NOT_ESTABLISHED');
 assert.deepEqual(row.journal.map(j=>j.label),REQUIRED_CALLS[row.name],'required-host-operation-history');
 for(let i=0;i<row.journal.length;i++){const j=row.journal[i];assert.equal(j.ordinal,i+1);assert.ok(j.finished>=j.started&&Number.isFinite(j.started));assert.ok(j.pageId&&j.method);if(j.error){assert.equal(row.name,'F-close-transaction');assert.equal(j.label,'update-a');assert.match(j.error,/closed|destroyed|Target/i);}}
 assert.ok(row.events.length>0,'native-events-required');const boots=new Map(),transactions=new Map();
 for(const e of row.events){
  assert.equal(e.namespace,row.namespace,'event-namespace');assert.ok(['A','B','C'].includes(e.pageId));assert.ok(Number.isSafeInteger(e.pageOrdinal)&&e.pageOrdinal>0);assert.ok(e.boot&&e.session);const old=boots.get(e.boot);assert.equal(e.sequence,(old?.sequence||0)+1,'raw-sequence');if(old){assert.equal(e.pageId,old.pageId);assert.equal(e.pageOrdinal,old.pageOrdinal);assert.ok(e.monotonic>=old.monotonic,'raw-clock');}assert.ok(Number.isFinite(e.monotonic));boots.set(e.boot,e);
  if(e.txId){const key=`${e.boot}:${e.txId}`;if(!transactions.has(key))transactions.set(key,[]);transactions.get(key).push(e);}
 }
 // Every actual update invocation must have a native request event; whole-operation
 // omission remains detectable even if an attacker consistently renumbers rows.
 for(const j of row.journal.filter(j=>j.method==='update')){
  const id=j.args[0].explicitOperationId;const request=row.events.filter(e=>e.kind==='update-request'&&e.operationId===id&&e.pageId===j.pageId);assert.ok(request.length,'missing-native-update-request');assert.ok(request.some(e=>JSON.stringify(e.request)===JSON.stringify(j.args[0])),'request-byte-binding');if(j.result){assert.ok(row.events.some(e=>e.kind==='update-result'&&e.operationId===id&&e.pageId===j.pageId&&JSON.stringify(e.result)===JSON.stringify(j.result)),'native-result-binding');}
 }
 // A complete verified main transaction needs native reads and the full scoped
 // write/complete/readback chain, not just a self-reported status and counter.
 const successful=row.journal.filter(j=>j.method==='update'&&j.result?.status==='VERIFIED');
 for(const j of successful){
  const req=j.args[0],own=row.events.filter(e=>e.operationId===req.explicitOperationId&&e.pageId===j.pageId&&e.txId===j.result.txId);
  const kinds=['tx-start','tx-read','compare-success','write-request','write-request-success','tx-complete','readback','readback-match','update-result'];let before=-1;const found={};
  for(const kind of kinds){const at=own.findIndex(e=>e.kind===kind);assert.ok(at>before,`verified-native-chain:${kind}`);before=at;found[kind]=own[at];}
  assert.equal(found['tx-start'].mode,'readwrite');assert.deepEqual([...found['tx-start'].scope].sort(),['attempts','copies','receipts','state'],'complete-store-scope');
  assert.deepEqual(found['compare-success'].head,found['tx-read'].head,'comparison-native-read');
  assert.equal(found['tx-read'].current,req.expectedRaw,'comparison-original-bytes');
  assert.equal(found['tx-read'].head.generation,req.generation,'comparison-generation');assert.equal(found['tx-read'].head.incarnation,req.incarnation,'comparison-incarnation');
  assert.equal(found['write-request'].raw,req.candidateRaw,'write-request-original');assert.equal(found['write-request'].token.generation,req.generation+1,'write-next-generation');assert.equal(found['write-request'].token.latestOperation,req.explicitOperationId,'write-operation-id');
  const readback=found.readback.snapshot,receipt=readback.receipts[req.explicitOperationId];assert.equal(readback.current,req.candidateRaw,'readback-current');assert.ok(receipt,'readback-receipt-required');assert.equal(receipt.raw,req.candidateRaw,'readback-receipt-original');assert.equal(receipt.previous,req.expectedToken.latestOperation,'readback-receipt-predecessor');assert.deepEqual(receipt.token,found['write-request'].token,'readback-token');assert.equal(readback.copies[String(req.generation+1)].raw,req.expectedRaw,'readback-preserved-original');
  assert.ok(!own.some(e=>e.kind==='tx-abort'),'aborted-not-verified');
 }
 const writers=row.journal.filter(j=>j.method==='writer');const writerStarts=row.events.filter(e=>e.kind==='writer-start');assert.equal(writerStarts.length,writers.length,'missing-competitor-raw');assert.equal(row.events.filter(e=>e.kind==='writer-complete').length,writers.length,'missing-competitor-complete');
 for(let i=0;i<writers.length;i++){const j=writers[i],start=writerStarts[i];assert.equal(start.pageId,j.pageId);assert.equal(start.raw,j.args[0]);const own=row.events.filter(e=>e.txId===start.txId&&e.boot===start.boot);let before=-1;const found={};for(const kind of ['writer-start','tx-start','tx-read','writer-read','writer-request','tx-complete','writer-complete']){const at=own.findIndex(e=>e.kind===kind);assert.ok(at>before,`competitor-native-chain:${kind}`);before=at;found[kind]=own[at];}assert.deepEqual([...found['tx-start'].scope].sort(),['attempts','copies','receipts','state']);assert.equal(found['tx-start'].mode,'readwrite');assert.deepEqual(found['writer-read'].head,found['tx-read'].head);assert.equal(found['writer-read'].raw,found['tx-read'].current);assert.equal(found['writer-request'].raw,j.args[0]);}
 const expected=EXPECTATIONS[row.name];assert.deepEqual(row.results.map(r=>r.status).sort(),[...expected.results].sort(),'scenario-outcome');assert.deepEqual(row.results,row.journal.filter(j=>['update','reuse','diagnostic'].includes(j.role)&&j.result).map(j=>j.result),'response-journal-binding');
 const final=row.journal.at(-1);assert.equal(final.method,'snapshot');assert.deepEqual(row.final,final.result,'independent-final-readback');if(expected.corruptGeneration)assert.equal(row.final.head.generation,null,'missing-generation');if(expected.generation!==null)assert.equal(row.final.head?.generation,expected.generation,'final-generation');
 assert.equal(row.classification,expected.classification||'VERIFIED-isolated-contract');if(!['K-rollback','Q-missing-generation','Q-overflow','Q-bad-receipt'].includes(row.name))validateStoredChain(row.final,row.namespace);const nativeFinal=row.events.filter(e=>e.kind==='tx-read'&&e.pageId===final.pageId).at(-1);assert.ok(nativeFinal,'final-native-read-required');assert.deepEqual(nativeFinal.head,row.final.head,'final-native-head');assert.equal(nativeFinal.current,row.final.current,'final-native-current');assert.equal(nativeFinal.receiptCount,Object.keys(row.final.receipts).length,'final-native-receipts');
 if(row.name==='A-same-token'){assert.equal(row.final.current,'B');assert.equal(Object.keys(row.final.receipts).length,2);assert.equal(Object.keys(row.final.copies).length,1);}
 if(['E-abort','I-old-session','N-reload','P-target-mismatch','S-exception'].includes(row.name)){assert.equal(row.final.current,'A');assert.equal(Object.keys(row.final.receipts).length,1);assert.equal(Object.keys(row.final.copies).length,0);}
 if(row.name==='F-close-transaction'){assert.ok([0,1].includes(row.final.head.generation));assert.equal(row.transitions.includes('close-active-page'),true);assert.ok(row.events.some(e=>e.kind==='compare-success'));}
 if(['L-lock-failure','L-waiting-close','M-noncooperative'].includes(row.name)){assert.equal(row.lock.held,true);assert.equal(row.lock.released,true);if(row.name==='L-lock-failure')assert.equal(row.lock.unavailable,true);if(row.name==='L-waiting-close')assert.equal(row.lock.waiterClosed,true);}
 if(row.name==='D-queued-writer'){const cmp=row.events.findIndex(e=>e.kind==='compare-success'),queued=row.events.findIndex(e=>e.kind==='writer-start'),done=row.events.findIndex(e=>e.kind==='tx-complete'&&e.txId===row.events[cmp]?.txId),writerDone=row.events.findIndex(e=>e.kind==='writer-complete');assert.ok(cmp>=0&&queued>cmp&&done>queued&&writerDone>done,'native-writer-serialization');}
 if(row.name==='H-notifications'){assert.equal(row.notifications.received,3);assert.equal(row.notifications.deliberatelyMissing,false);assert.equal(row.events.filter(e=>e.kind==='notification-sent').length,3);assert.equal(row.events.filter(e=>e.kind==='notification-received'&&e.pageId==='A').length,3);}
 if(row.name==='H-missing-notification'){assert.equal(row.events.filter(e=>e.kind==='notification-sent'||e.kind==='notification-received').length,0);assert.equal(row.notifications.deliberatelyMissing,true);}
 if(row.name==='N-reload')assert.equal(row.transitions.includes('reload'),true);
 if(row.name==='R-unknown-reuse')assert.equal(row.events.filter(e=>e.kind==='tx-start'&&e.operationId==='op-a'&&!e.txId.endsWith('-reserve')).length,1,'unknown-must-not-retry');
 if(row.name==='I-late-response'){assert.ok(row.events.some(e=>e.kind==='session-invalidated'));assert.equal(row.final.hold,true);}
 if(row.name==='O-media-mismatch'){assert.equal(row.mediaMismatch,true);assert.equal(row.media.before,'A');assert.equal(row.media.after,'changed-legacy');assert.equal(row.media.idb,'A');assert.notEqual(row.media.after,row.media.idb);assert.equal(row.events.filter(e=>e.kind==='update-request').length,0);}
 assert.equal(row.cleanup.deleted,true);assert.equal(row.cleanup.contextClosed,true);assert.deepEqual(row.cleanup.before,[row.sentinelName]);assert.deepEqual(row.cleanup.after,[row.sentinelName]);assert.deepEqual(row.cleanup.localBefore,row.cleanup.localAfter);assert.equal(row.cleanup.sentinelBefore,'outside-synthetic-namespace');assert.equal(row.cleanup.sentinelAfter,row.cleanup.sentinelBefore);
 for(const k of ['raw','trace']){assert.equal(row[k].file,`${row.engine}-${row.name}${k==='raw'?'-raw.json':'.zip'}`);assert.match(row[k].sha256,/^[a-f0-9]{64}$/);}
 return true;
}
export function validateAtomicEvidence(x){assert.equal(x.kind,'real-browser-atomic');assert.equal(x.status,'PASS');assert.equal(x.dirty,false);assert.equal(x.mutant,'none');for(const k of ['sha','tree'])assert.match(x[k],/^[a-f0-9]{40}$/);assert.match(x.bundleHash,/^[a-f0-9]{64}$/);assert.ok(x.run&&x.attempt);assert.deepEqual(x.rows.map(r=>`${r.engine}/${r.name}`).sort(),['chromium','webkit'].flatMap(e=>CASES.map(c=>`${e}/${c}`)).sort(),'exact-browser-case-set');for(const r of x.rows){assert.equal(r.sha,x.sha);assert.equal(r.tree,x.tree);assert.equal(r.run,x.run);assert.equal(r.attempt,x.attempt);validateAtomicCase(r);}return true;}
export async function verifyAtomicFiles(x,dir){const required=['summary.json','fixture.mjs.txt',...x.rows.flatMap(r=>[r.raw.file,r.trace.file])];assert.equal(new Set(required).size,required.length);assert.deepEqual((await readdir(dir)).filter(n=>n!=='negative-controls.json').sort(),required.sort(),'artifact-inventory');for(const n of required){const s=await lstat(`${dir}/${n}`);assert.ok(s.isFile()&&!s.isSymbolicLink());}assert.equal(hash(await readFile(`${dir}/fixture.mjs.txt`)),x.bundleHash);for(const r of x.rows)for(const k of ['raw','trace']){const b=await readFile(`${dir}/${r[k].file}`);assert.equal(hash(b),r[k].sha256,'artifact-hash');if(k==='raw')assert.deepEqual(JSON.parse(b),{events:r.events,journal:r.journal},'raw-and-summary');}return true;}
