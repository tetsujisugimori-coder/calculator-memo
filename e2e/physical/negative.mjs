import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {auditFiles,findOriginalSuite} from './files.mjs';
import {auditSuite} from './audit.mjs';
const dir=await findOriginalSuite(),original=JSON.parse(await readFile(`${dir}/summary.json`));auditSuite(original);await auditFiles(dir);
const mutations={
 'missing-complete':s=>{const r=s.rows[0];r.events=r.events.filter(e=>!(e.txId===r.result.txId&&e.kind==='tx-complete'));},
 'readback-mismatch':s=>s.rows[0].after.current='tampered',
 'missing-receipt':s=>delete s.rows[0].after.receipts['op-test'],
 'tampered-receipt':s=>s.rows[0].after.receipts['op-test'].raw='tampered',
 'old-generation':s=>s.rows[0].after.receipts['op-test'].token.generation=0,
 'false-success':s=>s.rows.find(r=>r.case==='abort').result.status='VERIFIED',
 'missing-case':s=>s.rows.pop(),
 'served-mismatch':s=>s.rows[0].servedSHA256='0'.repeat(64),
 'mixed-device':s=>s.rows[0].device='iphone-real',
 'foreign-head':s=>s.rows[0].sha='0'.repeat(40),
 'mixed-trial':s=>s.rows[0].trial=s.rows[1].trial,
 'foreign-namespace':s=>s.rows[0].events[0].namespace='foreign',
 'physical-overclaim':s=>s.rows[0].physicalAcceptance='PASS',
 'interruption-overclaim':s=>s.rows.find(r=>r.case==='interrupted').result.status='VERIFIED',
};
const renumber=r=>{const seq=new Map();for(const e of r.events){e.sequence=(seq.get(e.boot)||0)+1;seq.set(e.boot,e.sequence);}};
Object.assign(mutations,{
 'native-readback-omitted':s=>{const r=s.rows[0];r.events=r.events.filter(e=>!['readback','readback-match'].includes(e.kind));renumber(r);},
 'abort-chain-omitted':s=>{const r=s.rows.find(r=>r.case==='abort');r.events=r.events.filter(e=>e.txId!==r.result.txId||['update-request','update-result','tx-abort'].includes(e.kind));renumber(r);},
 'replay-chain-omitted':s=>{const r=s.rows.find(r=>r.case==='lost-ack');r.events=r.events.filter(e=>e.txId!==r.retry.txId);renumber(r);},
 'wrong-scope':s=>{const r=s.rows[0];r.events.find(e=>e.txId===r.result.txId&&e.kind==='tx-start').scope=['state'];},
 'native-readback-corrupt':s=>{const r=s.rows[0];r.events.find(e=>e.txId===r.result.txId&&e.kind==='readback').snapshot.current='CORRUPT';},
 'unrelated-ack-failure':s=>{const r=s.rows.find(r=>r.case==='lost-ack');r.result.reason='unrelated';for(const e of r.events)if(e.txId===r.result.txId&&e.kind==='update-result')e.result.reason='unrelated';},
 'receipt-fault-not-injected':s=>{const r=s.rows.find(r=>r.case==='missing-receipt');r.after.receipts.genesis=r.before.receipts.genesis;},
});
const reasons={'missing-complete':/sequence/,'readback-mismatch':/native-readback-current/,'missing-receipt':/native-readback-receipts/,'tampered-receipt':/native-readback-receipts/,'old-generation':/native-readback-receipts/,'false-success':/observation-result/,'missing-case':/complete-matrix/,'served-mismatch':/served-bundle/,'mixed-device':/device-binding/,'foreign-head':/identity:sha/,'mixed-trial':/unique-trials/,'foreign-namespace':/namespace/,'physical-overclaim':/NOT_TESTED/,'interruption-overclaim':/observation-result/,'native-readback-omitted':/native-chain:readback/,'abort-chain-omitted':/native-chain:tx-start/,'replay-chain-omitted':/retry-native-request/,'wrong-scope':/native-scope/,'native-readback-corrupt':/native-readback-current/,'unrelated-ack-failure':/ack-loss-reason/,'receipt-fault-not-injected':/missing-genesis/};
const rows=[];for(const [name,mutate]of Object.entries(mutations)){const copy=structuredClone(original);mutate(copy);let error;try{auditSuite(copy);}catch(e){error=String(e);}assert.ok(error,`false-accept:${name}`);assert.match(error,reasons[name],`wrong-rejection-reason:${name}`);rows.push({name,status:'REJECTED',reason:error});await writeFile(`${dir}/mutant-${name}.json`,JSON.stringify(copy));}await writeFile(`${dir}/negative-results.json`,JSON.stringify({normal:'ACCEPTED',rows},null,2));console.log(JSON.stringify(rows));
