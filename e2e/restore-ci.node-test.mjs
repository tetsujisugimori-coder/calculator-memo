import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
const workflow = await readFile(new URL('../.github/workflows/verify-pr-gui.yml', import.meta.url), 'utf8');
const restore = workflow.split('\n  restore:\n')[1];
test('restore has independent failure-propagating job and exact HEAD evidence', () => {
  assert.ok(restore); assert.doesNotMatch(restore,/needs:|continue-on-error|if:.*success/);
  assert.match(restore,/timeout-minutes: 15/); assert.match(restore,/persist-credentials: false/);
  assert.match(restore,/ref: \$\{\{ github.event.pull_request.head.sha \}\}/);
  assert.match(restore,/300s node e2e\/run-restore-gui.mjs/);
  assert.match(restore,/name: pr-restore-/); assert.match(restore,/if-no-files-found: error/);
});
test('restore does not replace formal or backup contracts',()=>{
  const formal=workflow.split('\n  backup:\n')[0];
  assert.match(formal,/timeout-minutes: 30/); assert.match(formal,/node e2e\/smoke.mjs/);
  assert.doesNotMatch(formal,/run-restore-gui/);
  assert.match(workflow,/300s node e2e\/run-backup-gui.mjs/);
  assert.doesNotMatch(workflow,/paths-ignore:|\[skip ci\]/);
});
