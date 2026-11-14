import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {auditRow} from '../../../../e2e/physical/audit.mjs';
// Usage: node probe.mjs <original-evidence-directory> <new-review-output-directory>
const [dir,out]=process.argv.slice(2);if(!dir||!out||process.argv.length!==4)throw Error('usage: probe.mjs input-dir new-output-dir');
const suite=JSON.parse(readFileSync(`${dir}/summary.json`));
mkdirSync(out,{recursive:false}); // Exclusive output; never overwrite a prior review.
// Derived review-only binding, measured from old run's saved bundle; not an execution-time response capture.
if(process.env.REVIEW_DERIVED_BINDING==='1'){const hash=createHash('sha256').update(readFileSync(`${dir}/served-fixture.mjs`)).digest('hex');if(hash!==suite.bundleSHA256)throw Error('old-bundle-mismatch');for(const r of suite.rows)r.servedSHA256=hash;}
const renumber=r=>{const n=new Map();for(const e of r.events){e.sequence=(n.get(e.boot)||0)+1;n.set(e.boot,e.sequence);}};
const probes={
 'abort-loses-native-start-read-write':r=>{r.events=r.events.filter(e=>e.txId!==r.result.txId||['update-request','update-result','tx-abort'].includes(e.kind));renumber(r);},
 'no-native-replay-evidence':r=>{const original=r.result.txId;r.events=r.events.filter(e=>!(e.kind==='update-request'&&e.txId!==original)&&!(e.kind==='update-result'&&e.txId!==original));renumber(r);},
 'wrong-transaction-scope':r=>{for(const e of r.events)if(e.txId===r.result.txId&&e.kind==='tx-start')e.scope=['state'];},
 'native-readback-differs-from-after':r=>{for(const e of r.events)if(e.txId===r.result.txId&&e.kind==='readback')e.snapshot.current='CORRUPT';},
 'arbitrary-lost-ack-reason':r=>{r.result.reason='unrelated synthetic failure';for(const e of r.events)if(e.kind==='update-result'&&e.txId===r.result.txId){e.result.reason=r.result.reason;e.reason=r.result.reason;}},
 'verified-without-native-readback':r=>{r.events=r.events.filter(e=>!(e.txId===r.result.txId&&['readback','readback-match'].includes(e.kind)));renumber(r);},
 'missing-receipt-kept':r=>{r.after.receipts.genesis=r.before.receipts.genesis;},
};
const results=[];
for(const engine of [...new Set(suite.rows.map(r=>r.engine))])for(const [name,mutate]of Object.entries(probes)){
 const targetCase=name.startsWith('abort')?'abort':name==='missing-receipt-kept'?'missing-receipt':name.includes('replay')||name.includes('lost-ack')?'lost-ack':'normal';
 const source=suite.rows.find(r=>r.engine===engine&&r.case===targetCase);if(!source)throw Error(`missing-normal:${engine}:${targetCase}`);
 const normal=structuredClone(source);auditRow(normal,suite);const mutant=structuredClone(source);mutate(mutant);
 let error;try{auditRow(mutant,suite);}catch(e){error=String(e);}
 results.push({engine,name,normal:'ACCEPTED',mutant:error?'REJECTED':'FALSE_ACCEPT',error});
 writeFileSync(`${out}/${engine}-${name}.json`,JSON.stringify(mutant,null,2),{flag:'wx'});
}
writeFileSync(`${out}/results.json`,JSON.stringify({derivedBinding:process.env.REVIEW_DERIVED_BINDING==='1'?'POST_CREATED_FROM_SAVED_BUNDLE':'NONE',results},null,2),{flag:'wx'});
console.log(JSON.stringify(results,null,2));if(results.some(r=>r.mutant==='FALSE_ACCEPT'))process.exitCode=1;
