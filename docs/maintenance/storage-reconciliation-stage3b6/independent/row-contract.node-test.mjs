import test from 'node:test';
import assert from 'node:assert/strict';
import { REQUIRED_CASES, validateRows } from './row-contract.mjs';
const normal = () => ['chromium','webkit'].flatMap(engine => [375,390,765,1280].map(width => ({engine,width,status:'passed',stage:'complete',errors:[],cases:REQUIRED_CASES.map(name=>({name,status:'GREEN'}))})));
test('normal 64 GREEN, arbitrary order',()=>{const r=normal().reverse();r.forEach(row=>row.cases.reverse());assert.deepEqual(validateRows(r),[]);});
const controls = {
 'early return': r=>r.forEach(row=>row.cases.splice(1)),
 'duplicate case': r=>r[0].cases[7]={...r[0].cases[0]},
 'missing case': r=>r[0].cases.pop(),
 'unknown case': r=>r[0].cases[0].name='unknown',
 'empty cases': r=>r[0].cases=[],
 'duplicate condition': r=>r[7]={...r[0]},
 'missing condition': r=>r.pop(),
 'unknown condition': r=>r[0].engine='unknown',
 'wrong width type': r=>r[0].width='375',
 'RED': r=>r[0].cases[0].status='RED',
 'unknown result': r=>r[0].cases[0].status='UNKNOWN',
 'pageerror': r=>r[0].errors.push('failure'),
 'close failure': r=>r[0].closeError='close failure',
 'context failure': r=>{r[0].status='failed';r[0].stage='context';},
 'load failure': r=>{r[0].status='failed';r[0].stage='initial-load';},
 'incomplete stage': r=>r[0].stage='native-controls',
 'missing cases': r=>delete r[0].cases,
 'null case': r=>r[0].cases[0]=null,
 'null row': r=>r[0]=null,
 'startup probe': r=>{r.splice(1);r[0].cases=[];r[0].status='failed';},
};
for(const [name,mutate] of Object.entries(controls)) test(name,()=>{const rows=normal();mutate(rows);assert.ok(validateRows(rows).length);});
test('empty/non-array rows rejected',()=>{for(const r of [[],null,{}]) assert.ok(validateRows(r).length);});
