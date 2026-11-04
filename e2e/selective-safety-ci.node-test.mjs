import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
const read=path=>readFile(new URL(path,import.meta.url),'utf8');
test('Stage3A exact HEAD independent bounded job preserves formal CI and no deploy capability',async()=>{
 const w=await read('../.github/workflows/selective-safety.yml');assert.match(w,/contents: read/);assert.match(w,/timeout-minutes: 15/);assert.match(w,/ref: \$\{\{ github.event.pull_request.head.sha \}\}/);assert.match(w,/persist-credentials: false/);assert.match(w,/300s node e2e\/run-selective-safety-gui.mjs/);assert.match(w,/if-no-files-found: error/);assert.doesNotMatch(w,/continue-on-error|pull_request_target|secrets\.|deploy-pages|needs:/);
});
test('exclusive evidence dir, served provenance, signal/failure propagation and eight genuine cases',async()=>{
 const runner=await read('./run-selective-safety-gui.mjs'),spec=await read('./selective-safety-mobile.mjs');
 assert.match(runner,/await mkdir\(out\)/);assert.match(runner,/randomUUID\(\)/);assert.match(runner,/assert.deepEqual\(await r.json\(\),provenance\)/);assert.match(runner,/code===0&&!signal&&!stopping\?0:1/);
 assert.match(spec,/assert.equal\(record.cases.length,8\)/);assert.match(spec,/record.cases.every\(c=>c.status==='passed'\)/);assert.match(spec,/process.exitCode=1/);assert.match(spec,/assert.deepEqual\(await stored\(\),original\)/);assert.match(spec,/window.__stage3aWrites\),\[\]/);assert.match(spec,/v.after===2\*v.before/);assert.match(spec,/\['chromium',chromium\],\['webkit',webkit\]/);assert.match(spec,/\[375,390\]/);assert.match(spec,/\['light','dark'\]/);assert.doesNotMatch(spec,/force:\s*true|test.skip/);
});
test('product safety modules have no mutation adapter import or storage write capability',async()=>{
 for(const path of ['../lib/selective-restore-safety.ts','../lib/json-source-edit.ts','../components/RestoreSafetyPanel.tsx']){const s=await read(path);assert.doesNotMatch(s,/\.setItem\(|\.removeItem\(|\.clear\(|preserveRestoreSource\(|restoreRaw\(|from ['"].*(?:simulator|tests\/)/);assert.doesNotMatch(s,/executionAllowed:\s*true/);}
 const ui=await read('../components/SelectionPreviewModal.tsx');assert.doesNotMatch(ui,/\.setItem\(|\.removeItem\(|\.clear\(|restoreRaw\(|preserveRestoreSource\(/);
});
