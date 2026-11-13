import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';
import {validateAtomicCase} from '../../../../e2e/storage-atomic-evidence.mjs';
const original=JSON.parse(await readFile(new URL('./native-a-original.json',import.meta.url)));
const sparse=JSON.parse(await readFile(new URL('./sparse-native-chain-input.json',import.meta.url)));
const oldSource=await readFile(new URL('./auditor-before.mjs.txt',import.meta.url),'utf8');
const old=await import('data:text/javascript;base64,'+Buffer.from(oldSource).toString('base64'));
const renumber=r=>{const seq={};for(const e of r.events)e.sequence=seq[e.boot]=(seq[e.boot]||0)+1;};
const mutations={
 'missing-commit-read':r=>{const tx=r.results.find(x=>x.status==='VERIFIED').txId;r.events=r.events.filter(e=>!(e.kind==='tx-read'&&e.txId===tx));renumber(r);},
 'receipt-payload-mismatch':r=>{for(const receipt of Object.values(r.final.receipts))if(receipt.operationId!=='genesis')receipt.raw='TAMPERED';r.journal.at(-1).result=structuredClone(r.final);},
 'missing-native-scope':r=>{for(const e of r.events)if(e.kind==='tx-start')e.scope=['state'];},
};
test('unchanged original real A row accepted, not whole-campaign acceptance',()=>{assert.equal(old.validateAtomicCase(original),true);assert.equal(validateAtomicCase(original),true);});
test('fixed sparse native-chain counterexample: old false acceptance, new refusal',()=>{assert.equal(old.validateAtomicCase(sparse),true);assert.throws(()=>validateAtomicCase(sparse));});
const red=JSON.parse(await readFile(new URL('./native-mutations-red.json',import.meta.url)));
for(const[name,mutate]of Object.entries(mutations))test(`independent fixed ${name} RED/GREEN`,()=>{const row=structuredClone(original);mutate(row);const hash=createHash('sha256').update(JSON.stringify(row,null,2)+'\n').digest('hex');assert.equal(hash,red.results.find(r=>r.name===name).inputSha256,'counterexample bytes fixed');assert.equal(old.validateAtomicCase(row),true);assert.throws(()=>validateAtomicCase(row));});
