import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {auditSuite} from './physical/audit.mjs';

// Saved CI evidence replay, not a fresh browser or physical-device execution.
const directory='docs/maintenance/storage-physical-stage3b12/independent/p2-regression/';
const bytes=gunzipSync(readFileSync(directory+'original-summary.json.gz'));
assert.equal(createHash('sha256').update(bytes).digest('hex'),'81da784a8eb95ed787bce902d547fe0379005b46d41ee7c4c30ff1967cf42bba');
const original=JSON.parse(bytes);
const historical=JSON.parse(readFileSync(directory+'extra-results.json','utf8'));
const mutations=[];
const renumber=row=>{const counters=new Map();for(const event of row.events){event.sequence=(counters.get(event.boot)||0)+1;counters.set(event.boot,event.sequence);}};
for(const caseName of ['abort','quota-injected'])for(const key of ['current','head','receipts','copies']){
 mutations.push({name:caseName+'-'+key,caseName,reason:'abort-preserved:'+key,mutate:row=>{row.after[key]=key==='current'?'BAD':{BAD:true};}});
}
for(const key of ['pageId','boot','session','operationId']){
 mutations.push({name:'main-'+key,caseName:'normal',reason:'main-'+(key==='pageId'?'page':key==='operationId'?'operation':key)+'-binding',mutate:row=>{
  row.events.find(event=>event.txId===row.result.txId&&event.kind==='tx-read')[key]='foreign';renumber(row);
 }});
 mutations.push({name:'retry-'+key,caseName:'abort',reason:'retry-binding:'+(key==='operationId'?'operation':key),mutate:row=>{
  row.events.find(event=>event.txId===row.retry.txId)[key]='foreign';renumber(row);
 }});
}
for(const kind of ['tx-complete','readback-match','update-result']){
 mutations.push({name:'duplicate-'+kind,caseName:'normal',reason:'main-event-cardinality-order',mutate:row=>{
  const index=row.events.findIndex(event=>event.txId===row.result.txId&&event.kind===kind);
  row.events.splice(index,0,structuredClone(row.events[index]));renumber(row);
 }});
}
mutations.push({name:'reload-invented-boot',caseName:'reload',reason:'reload-native-read',mutate:row=>{row.reopened.boot='invented-boot';}});
mutations.push({name:'reload-native-count',caseName:'reload',reason:'reload-native-receipts',mutate:row=>{
 row.events.find(event=>event.boot===row.reopened.boot&&event.kind==='tx-read').receiptCount=999;
}});
mutations.push({name:'reload-readonly',caseName:'reload',reason:'reload-readonly',mutate:row=>{
 row.events.find(event=>event.boot===row.reopened.boot&&event.kind==='tx-start').mode='readwrite';
}});
mutations.push({name:'retry-duplicate',caseName:'abort',reason:'retry-cardinality-order',mutate:row=>{
 const index=row.events.findIndex(event=>event.txId===row.retry.txId&&event.kind==='update-request');
 row.events.splice(index,0,structuredClone(row.events[index]));renumber(row);
}});

// Bind the replay matrix and semantic failure labels to the retained reviewer receipt.
assert.equal(mutations.length,23);
assert.equal(historical.normal20,'ACCEPTED');
assert.equal(historical.results.length,46);
assert.deepEqual(historical.results.map(result=>[result.engine,result.name,result.reason.split('\n')[0]]),
 ['chromium','webkit'].flatMap(engine=>mutations.map(mutation=>[engine,mutation.name,'AssertionError [ERR_ASSERTION]: '+mutation.reason])));
test('P2 extra replay: original saved 20 native observations accepted',()=>assert.equal(auditSuite(original),true));
for(const engine of ['chromium','webkit'])for(const mutation of mutations){
 test('P2 extra replay '+engine+': '+mutation.name,()=>{
  const copy=structuredClone(original);
  mutation.mutate(copy.rows.find(row=>row.engine===engine&&row.case===mutation.caseName));
  assert.throws(()=>auditSuite(copy),error=>error instanceof assert.AssertionError&&error.message.split('\n')[0]===mutation.reason);
 });
}
