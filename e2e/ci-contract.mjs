import assert from 'node:assert/strict';
import { scenarios } from './scenario-config.mjs';
const counts = [129, 128, 129, 129, 129, 130];
const checkpoints = [95, 93, 93, 93, 93, 95];
/** Validate before a successful worker discards its live trace, and again when aggregating. */
export function validateScenarioCoverage(record, expectedSha, requireSuccess = true) {
  assert.match(expectedSha, /^[0-9a-f]{40}$/);
  if (requireSuccess) assert.equal(record.status, 'passed');
  assert.equal(record.sha, expectedSha);
  assert.equal(record.expectedSha, expectedSha);
  assert.equal(record.servedIdentity.sha, expectedSha);
  assert.equal(record.scenarios.length, 1);
    const observed = record.scenarios[0];
    const index = scenarios.findIndex(item => item.id === observed.id);
    assert.ok(index >= 0, "Unknown context");
    for (const [key, value] of Object.entries(scenarios[index])) assert.equal(observed[key], value, 'Context configuration: ' + key);
    if (requireSuccess) assert.equal(observed.status, 'passed');
    assert.deepEqual(record.errors, []);
    assert.equal(record.checks.length, counts[index], 'Missing or extra GUI acceptance checks');
    assert.equal(new Set(record.checks).size, counts[index], 'Duplicate check cannot replace a missing check');
    assert.ok(record.checks.every(check => check.startsWith(observed.id + ': ')));
    assert.equal(record.screenshotCheckpoints.length, checkpoints[index], 'All historical screenshot geometry checkpoints must execute');
    assert.equal(new Set(record.screenshotCheckpoints.map(check => check.name)).size, checkpoints[index], "Duplicate geometry checkpoint");
    assert.ok(record.screenshotCheckpoints.every(check => check.horizontalFit === 'passed'));
    if (observed.hasTouch) assert.equal(observed.touchActivations, 991);
  return observed.id;
}
/** Fail closed: exit codes alone cannot certify complete, correctly identified coverage. */
export function validateCoverage(records, expectedSha) {
  assert.equal(records.length, scenarios.length, 'All six contexts must report');
  const seen = new Set();
  for (const record of records) {
    const id = validateScenarioCoverage(record, expectedSha);
    assert.ok(!seen.has(id), 'Duplicate context'); seen.add(id);
  }
  return { contexts: seen.size, checks: records.reduce((sum, record) => sum + record.checks.length, 0), horizontalCheckpoints: checkpoints.reduce((a,b) => a+b, 0) };
}
