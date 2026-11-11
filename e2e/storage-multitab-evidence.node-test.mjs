import {test} from 'node:test';
import assert from 'node:assert/strict';
import {CASES,EXPECTED_CHECKS,validateCase,validateMultitabEvidence} from './storage-multitab-evidence.mjs';
test('every required browser case has nonempty independent expected checkpoints',()=>{
 assert.equal(CASES.length,15);assert.equal(new Set(CASES).size,15);assert.deepEqual(Object.keys(EXPECTED_CHECKS).sort(),[...CASES].sort());
 for(const expected of Object.values(EXPECTED_CHECKS))assert.ok(Object.keys(expected).length);
});
for(const status of ['running','FAIL',undefined])test(`unfinished top-level ${status} is not success`,()=>assert.throws(()=>validateMultitabEvidence({kind:'real-browser-multitab',status})));
test('empty evidence cannot claim success',()=>assert.throws(()=>validateMultitabEvidence({kind:'real-browser-multitab',status:'PASS',mutant:'none',dirty:false,sha:'a'.repeat(40),tree:'b'.repeat(40),bundleHash:'c'.repeat(64),origin:'http://127.0.0.1:4000',rows:[]})));
test('synthetic PASS without raw rows is rejected',()=>assert.throws(()=>validateCase({name:CASES[0],status:'PASS',errors:[],pagesCreated:3,namespace:'stage3b10-test-ab',events:[]})));
test('page error cannot be masked by PASS',()=>assert.throws(()=>validateCase({name:CASES[0],status:'PASS',errors:['page-crash']})));
