// Additional backup contracts; not part of the existing 46 formal contracts.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
const workflow = await readFile(new URL('../.github/workflows/verify-pr-gui.yml', import.meta.url), 'utf8');
const backup = workflow.split('\n  backup:\n')[1];
test('backup job has no dependency on the formal job and retains failure propagation', () => {
  assert.ok(backup); assert.doesNotMatch(backup, /needs:|continue-on-error|if:.*success/);
  assert.match(backup, /timeout-minutes: 15/);
  assert.match(backup, /ref: \$\{\{ github.event.pull_request.head.sha \}\}/);
  assert.match(backup, /persist-credentials: false/);
  assert.match(backup, /if: always\(\)[\s\S]*actions\/upload-artifact/);
  assert.match(backup, /if-no-files-found: error/);
  assert.match(backup, /300s node e2e\/run-backup-gui.mjs/);
});
test('formal contract and backup evidence remain separate', () => {
  const formal = workflow.split('\n  backup:\n')[0];
  assert.match(formal, /timeout-minutes: 30/); assert.match(formal, /node e2e\/smoke.mjs/);
  assert.doesNotMatch(formal, /e2e\/backup-mobile.mjs|e2e\/run-backup-gui.mjs/);
  assert.match(formal, /name: pr-gui-/); assert.match(backup, /name: pr-backup-/);
  assert.doesNotMatch(workflow, /paths-ignore:|\[skip ci\]/);
});
