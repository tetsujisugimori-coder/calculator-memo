import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
const workflow=await readFile(new URL('../.github/workflows/verify-pr-gui.yml',import.meta.url),'utf8');
const recovery=workflow.split('\n  recovery:\n')[1];
test('recovery acceptance is independent, exact HEAD, bounded, and failure propagating',()=>{
 assert.ok(recovery);assert.doesNotMatch(recovery,/needs:|continue-on-error|if:.*success/);
 assert.match(recovery,/timeout-minutes: 15/);assert.match(recovery,/persist-credentials: false/);
 assert.match(recovery,/ref: \$\{\{ github.event.pull_request.head.sha \}\}/);
 assert.match(recovery,/300s node e2e\/run-recovery-gui.mjs/);assert.match(recovery,/name: pr-recovery-/);assert.match(recovery,/if-no-files-found: error/);
});
test('all preceding formal, backup and restore acceptance remain independent',()=>{
 const formal=workflow.split('\n  backup:\n')[0];assert.match(formal,/timeout-minutes: 30/);assert.match(formal,/node e2e\/smoke.mjs/);assert.doesNotMatch(formal,/run-recovery-gui/);
 for(const name of ['backup','restore'])assert.match(workflow,new RegExp(`300s node e2e/run-${name}-gui.mjs`));
 assert.doesNotMatch(workflow,/paths-ignore:|\[skip ci\]/);
});
test('runner verifies served provenance and enforces complete eight-case acceptance',async()=>{
 const runner=await readFile(new URL('./run-recovery-gui.mjs',import.meta.url),'utf8');const spec=await readFile(new URL('./recovery-mobile.mjs',import.meta.url),'utf8');
 assert.match(runner,/assert.deepEqual\(await response.json\(\), provenance\)/);assert.match(runner,/code === 0 && !signal && !stopping/);
 assert.match(spec,/assert.equal\(cases.length,8\)/);assert.match(spec,/cases.every\(c=>c.status==='passed'\)/);
});
