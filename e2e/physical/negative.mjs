import assert from 'node:assert/strict';
import {readdir,readFile,writeFile} from 'node:fs/promises';
import {auditFiles} from './files.mjs';
import {auditSuite} from './audit.mjs';
const dirs=(await readdir('gui-evidence')).filter(x=>x.startsWith('physical-'));assert.equal(dirs.length,1,'one-original-suite');const dir=`gui-evidence/${dirs[0]}`,original=JSON.parse(await readFile(`${dir}/summary.json`));auditSuite(original);await auditFiles(dir);
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
};const rows=[];for(const [name,mutate]of Object.entries(mutations)){const copy=structuredClone(original);mutate(copy);let error;try{auditSuite(copy);}catch(e){error=String(e);}assert.ok(error,`false-accept:${name}`);rows.push({name,status:'REJECTED',reason:error});await writeFile(`${dir}/mutant-${name}.json`,JSON.stringify(copy));}await writeFile(`${dir}/negative-results.json`,JSON.stringify({normal:'ACCEPTED',rows},null,2));console.log(JSON.stringify(rows));
