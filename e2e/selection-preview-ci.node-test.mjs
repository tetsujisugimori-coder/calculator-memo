import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
const workflow=await readFile(new URL('../.github/workflows/verify-pr-gui.yml',import.meta.url),'utf8');
const preview=workflow.split('\n  selection-preview:\n')[1];
test('selection-preview acceptance is independent, exact HEAD, bounded, and failure propagating',()=>{
 assert.ok(preview);assert.doesNotMatch(preview,/needs:|continue-on-error|if:.*success/);
 assert.match(preview,/timeout-minutes: 15/);assert.match(preview,/persist-credentials: false/);
 assert.match(preview,/ref: \$\{\{ github.event.pull_request.head.sha \}\}/);
 assert.match(preview,/300s node e2e\/run-selection-preview-gui.mjs/);assert.match(preview,/name: pr-selection-preview-/);assert.match(preview,/if-no-files-found: error/);
});
test('all preceding formal, backup and restore acceptance remain independent',()=>{
 const formal=workflow.split('\n  backup:\n')[0];assert.match(formal,/timeout-minutes: 30/);assert.match(formal,/node e2e\/smoke.mjs/);assert.doesNotMatch(formal,/run-selection-preview-gui/);
 for(const name of ['backup','restore'])assert.match(workflow,new RegExp(`300s node e2e/run-${name}-gui.mjs`));
 assert.doesNotMatch(workflow,/paths-ignore:|\[skip ci\]/);
});
test('runner verifies served provenance and enforces complete eight-case acceptance',async()=>{
 const runner=await readFile(new URL('./run-selection-preview-gui.mjs',import.meta.url),'utf8');const spec=await readFile(new URL('./selection-preview-mobile.mjs',import.meta.url),'utf8');
 assert.match(runner,/assert.deepEqual\(await response.json\(\), provenance\)/);assert.match(runner,/code === 0 && !signal && !stopping/);
 assert.match(spec,/assert.equal\(cases.length,8\)/);assert.match(spec,/cases.every\(c=>c.status==='passed'\)/);
});
test('preview browser oracle rejects mutation, incomplete coverage and hidden errors',async()=>{
 const spec=await readFile(new URL('./selection-preview-mobile.mjs',import.meta.url),'utf8');
 assert.match(spec,/\['setItem','removeItem','clear'\]/);
 assert.match(spec,/assert.deepEqual\(await stored\(\),original\)/);
 assert.match(spec,/assert.deepEqual\(await page.evaluate\(\(\)=>window.__previewWrites\),\[\]\)/);
 assert.match(spec,/assert.deepEqual\(errors,\[\]\)/);
 assert.match(spec,/observedTouchStarts>=current.touches/);
 assert.match(spec,/\['chromium',chromium\],\['webkit',webkit\]/);
 assert.match(spec,/\[375,390\]/);assert.match(spec,/\['light','dark'\]/);
 assert.doesNotMatch(spec,/force:\s*true|test\.skip/);
});
