import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
const workflow = await readFile(new URL('../.github/workflows/selective-restore-plan.yml', import.meta.url), 'utf8');
test('plan acceptance has independent bounded exact-HEAD job with no deployment capability', () => {
  assert.match(workflow, /contents: read/); assert.match(workflow, /timeout-minutes: 15/);
  assert.match(workflow, /ref: \$\{\{ github.event.pull_request.head.sha \}\}/);
  assert.match(workflow, /persist-credentials: false/); assert.match(workflow, /300s node e2e\/run-selective-restore-plan-gui.mjs/);
  assert.match(workflow, /if-no-files-found: error/); assert.doesNotMatch(workflow, /needs:|continue-on-error|pull_request_target|secrets\.|deploy-pages|workflow_dispatch/);
});
test('plan runner verifies served SHA and all eight native mobile cases, storage invariants and error propagation', async () => {
  const runner = await readFile(new URL('./run-selective-restore-plan-gui.mjs', import.meta.url), 'utf8');
  const spec = await readFile(new URL('./selective-restore-plan-mobile.mjs', import.meta.url), 'utf8');
  assert.match(runner, /assert.deepEqual\(await response.json\(\), provenance\)/); assert.match(runner, /code === 0 && !signal && !stopping/);
  assert.match(spec, /assert.equal\(cases.length, 8\)/); assert.match(spec, /cases.every\(c => c.status === 'passed'\)/);
  assert.match(spec, /assert.deepEqual\(await stored\(\), original\)/); assert.match(spec, /assert.deepEqual\(await page.evaluate\(\(\) => window.__planWrites\), \[\]\)/);
  assert.match(spec, /assert.deepEqual\(errors, \[\]\)/); assert.match(spec, /observedTouchStarts >= result.touches/);
  assert.match(spec, /await runReferenceReviewRegression\(browser, \{ base, engine: name, width, theme \}\)/);
  const regression = await readFile(new URL('./selective-restore-plan-review-mobile.mjs', import.meta.url), 'utf8');
  assert.match(regression, /app setItem\/removeItem\/clear zero/); assert.match(regression, /backup file bytes unchanged/);
  assert.match(regression, /await checkParent\(false, false\)/); assert.match(regression, /await checkParent\(true, true\)/);
  assert.match(regression, /parent diagnostic display never duplicates canonical references/);
  assert.doesNotMatch(regression, /force:\s*true|test\.skip/);
  assert.match(spec, /\['chromium', chromium\], \['webkit', webkit\]/); assert.match(spec, /\[375, 390\]/); assert.match(spec, /\['light', 'dark'\]/);
  assert.doesNotMatch(spec, /force:\s*true|test\.skip/);
});
