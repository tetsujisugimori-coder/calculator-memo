// Standalone independent counterexamples; synthetic manifests are not browser evidence.
import assert from 'node:assert/strict';
import { validateMigrationEvidence, MIGRATION_CASES } from '../../../../e2e/storage-migration-evidence.mjs';
const fixture = () => ({kind:'isolated-migration-not-formal-gui',status:'passed',executionAllowed:false,HOLD:true,provenance:{sha:'a'.repeat(40),tree:'b'.repeat(40),sourceSha256:'c'.repeat(64),moduleSha256:'d'.repeat(64),dirty:false},matrix:['chromium','webkit'].flatMap(engine=>[375,390,765,1280].map(width=>({engine,width,status:'passed',browserVersion:'synthetic',errors:[],cases:MIGRATION_CASES.map(name=>({name,status:'passed',kind:'synthetic-validator-only',startedAt:'2026-11-06T00:00:00Z',finishedAt:'2026-11-06T00:00:01Z',observation:{}}))})))});
assert.deepEqual(validateMigrationEvidence(fixture()),[]);
const controls={failedSummary:s=>s.status='failed',nullObservation:s=>s.matrix[0].cases[0].observation=null,dirtySource:s=>s.provenance.dirty=true,invalidTime:s=>s.matrix[0].cases[0].startedAt='not-a-date',reversedTime:s=>s.matrix[0].cases[0].startedAt='2026-11-07T00:00:00Z',failedCase:s=>s.matrix[0].cases[0].status='failed'};
for(const [name,change] of Object.entries(controls)){const s=fixture();change(s);const rejected=validateMigrationEvidence(s);assert.ok(rejected.length,`${name} escaped validation`);console.log(JSON.stringify({name,rejected}));}
console.log('PASS: one positive control and six independent negative controls; no native browser claim');
