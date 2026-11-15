import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {auditSuite} from './physical/audit.mjs';
const raw=gunzipSync(readFileSync('docs/maintenance/storage-physical-stage3b12/independent/p2-regression/original-summary.json.gz'));
assert.equal(createHash('sha256').update(raw).digest('hex'),'81da784a8eb95ed787bce902d547fe0379005b46d41ee7c4c30ff1967cf42bba');
const original=JSON.parse(raw);
test('original CI 20 cases: legitimate UNKNOWN attempts/HOLD and reload new boot remain accepted',()=>assert.equal(auditSuite(original),true));
const changes=[
 ['foreign-operation-id','normal',r=>{for(const e of r.events)if(e.txId===r.result.txId)e.operationId='foreign-operation';},/main-operation-binding/],
 ['foreign-page-session','normal',r=>{for(const e of r.events)if(e.txId===r.result.txId){e.pageId='foreign-page';e.session='foreign-session';}},/main-page-binding/],
 ['abort-partial-current','abort',r=>r.after.current='PARTIAL-WRITE',/abort-preserved:current/],
 ['abort-receipts-lost','abort',r=>{r.after.receipts={};r.after.copies={'1':{raw:'CORRUPT'}};},/abort-preserved:receipts/],
 ['quota-partial-current','quota-injected',r=>r.after.current='PARTIAL-WRITE',/abort-preserved:current/],
 ['reload-missing-receipts','reload',r=>{r.reopened.receipts={};r.reopened.head.generation=999;},/reload-persistent:head/],
 ...['abort','quota-injected'].flatMap(c=>['head','copies'].map(k=>[c+'-'+k,c,r=>r.after[k]={corrupt:true},new RegExp('abort-preserved:'+k)])),
 ...['head','receipts','copies','attempts'].map(k=>['reload-'+k,'reload',r=>r.reopened[k]={corrupt:true},new RegExp('reload-persistent:'+k)]),
 ['reload-old-boot','reload',r=>r.reopened.boot=r.after.boot,/reload-new-boot/],
 ['reload-old-session','reload',r=>r.reopened.session=r.after.session,/reload-new-session/],
 ...['pageId','boot','session','operationId'].map(k=>['one-main-'+k,'normal',r=>r.events.find(e=>e.txId===r.result.txId&&e.kind==='tx-read')[k]='foreign',/main-.*binding|sequence/]),
 ...['pageId','boot','session','operationId'].map(k=>['one-retry-'+k,'abort',r=>r.events.find(e=>e.txId===r.retry.txId)[k]='foreign',/retry-binding|sequence/]),
];
const renumber=r=>{const seen=new Map();for(const e of r.events){e.sequence=(seen.get(e.boot)||0)+1;seen.set(e.boot,e.sequence);}};
changes.push(['duplicate-main','normal',r=>{const i=r.events.findIndex(e=>e.txId===r.result.txId&&e.kind==='tx-read');r.events.splice(i,0,structuredClone(r.events[i]));renumber(r);},/main-event-cardinality-order/]);
changes.push(['reorder-main','normal',r=>{const i=r.events.findIndex(e=>e.txId===r.result.txId&&e.kind==='tx-start'),j=r.events.findIndex(e=>e.txId===r.result.txId&&e.kind==='tx-read');[r.events[i],r.events[j]]=[r.events[j],r.events[i]];renumber(r);},/native-chain:tx-read/]);
for(const engine of ['chromium','webkit'])for(const [name,c,mutate,reason] of changes)test(engine+': '+name,()=>{
 const copy=structuredClone(original);mutate(copy.rows.find(r=>r.engine===engine&&r.case===c));
 assert.throws(()=>auditSuite(copy),reason);
});
