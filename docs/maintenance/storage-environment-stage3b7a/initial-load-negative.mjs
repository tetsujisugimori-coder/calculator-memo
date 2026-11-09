// Bounded, synthetic-only negative control for the Stage 3B-6 independent runner.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const command = 'docs/maintenance/storage-reconciliation-stage3b6/independent/browser-controls.mjs';
const child = spawnSync(process.execPath, [command], {
  encoding: 'utf8', timeout: 150_000, maxBuffer: 8 * 1024 * 1024,
  env: { ...process.env, STAGE3B7A_STARTUP_PROBE: '1' },
});
assert.ifError(child.error);
assert.equal(child.signal, null, 'injection child must terminate normally with nonzero exit code');
assert.equal(child.status, 1, 'known synthetic startup error must exit nonzero');
const summary = JSON.parse(child.stdout);
assert.equal(summary.conditions, 1, 'failure row must survive');
assert.equal(summary.cases, 0, 'no native controls were run before initial load');
assert.equal(summary.failures.length, 1, 'one failure must not disappear');
assert.deepEqual(summary.failures[0].engine, 'chromium');
assert.equal(summary.failures[0].width, 375);
assert.equal(summary.failures[0].stage, 'initial-load');
assert.match(summary.failures[0].error, /STAGE3B7A_SYNTHETIC_INITIAL_LOAD_FAILURE/);
assert.equal(summary.pngs.length, 0, 'do not invent unavailable screenshots');
assert.equal(summary.sourceUnchanged, true);
const raw = JSON.parse(readFileSync(join(summary.out, 'summary.json'), 'utf8'));
assert.equal(raw.rows.length, 1);
assert.equal(raw.rows[0].status, 'failed');
assert.equal(raw.rows[0].stage, 'initial-load');
assert.match(raw.rows[0].error, /STAGE3B7A_SYNTHETIC_INITIAL_LOAD_FAILURE/);
writeFileSync(join(summary.out, 'startup-probe-child-stdout.log'), child.stdout);
writeFileSync(join(summary.out, 'startup-probe-child-stderr.log'), child.stderr);
console.log(JSON.stringify({ kind: 'stage3b7a-startup-negative-control', status: 'passed', childExitCode: child.status, evidence: join(summary.out, 'summary.json'), stage: 'initial-load', conditions: summary.conditions, failedRows: summary.failures.length }, null, 2));
