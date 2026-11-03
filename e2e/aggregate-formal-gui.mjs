// Fail-closed aggregation of six separately uploaded *formal* GUI job artifacts.
// This is a new execution mode; it never retroactively completes a previous fixed-B run.
import assert from 'node:assert/strict';
import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scenarios } from './scenario-config.mjs';
import { validateCoverage } from './ci-contract.mjs';

export async function collectFormalGui(root, { sha, run, attempt, checksResult = 'success', matrixResult = 'success' }) {
  assert.match(sha || '', /^[0-9a-f]{40}$/, 'Expected exact PR head');
  assert.ok(run, 'GitHub run ID required');
  assert.ok(attempt, 'GitHub attempt required');
  assert.equal(checksResult, 'success', 'Checks/build job did not succeed');
  assert.equal(matrixResult, 'success', 'One or more formal scenario jobs failed or were cancelled');
  const prefix = 'formal-gui-' + sha + '-' + attempt + '-';
  const entries = await readdir(root, { withFileTypes: true });
  const directories = entries.filter(entry => entry.isDirectory()).map(entry => entry.name);
  const expected = scenarios.map(item => prefix + item.id);
  assert.equal(directories.length, scenarios.length, 'Exactly six separate artifacts are required');
  assert.deepEqual([...directories].sort(), [...expected].sort(), 'Missing, stale or unexpected scenario artifact');
  const records = [];
  const workers = [];
  let pngs = 0;
  for (const scenario of scenarios) {
    const folder = path.join(root, prefix + scenario.id);
    const single = JSON.parse(await readFile(path.join(folder, 'single-ci-outcomes.json'), 'utf8'));
    assert.equal(single.id, scenario.id, 'Single-worker identity');
    assert.equal(single.sha, sha, 'Single-worker head');
    assert.equal(single.run, run, 'Single-worker run');
    assert.equal(String(single.attempt), String(attempt), 'Single-worker attempt');
    assert.equal(single.status, 'passed', 'Single-worker status');
    assert.equal(single.child?.code, 0, 'Single-worker exit');
    assert.equal(single.child?.signal, null, 'Single-worker signal');
    const record = JSON.parse(await readFile(path.join(folder, scenario.id, 'provenance.json'), 'utf8'));
    assert.equal(record.run, run, 'Recorded run');
    assert.equal(String(record.attempt), String(attempt), 'Recorded attempt');
    assert.equal(record.scenarios?.[0]?.id, scenario.id, 'Artifact directory cannot impersonate a different scenario');
    assert.equal(record.servedIdentity?.run, run, 'Served run');
    assert.equal(String(record.servedIdentity?.attempt), String(attempt), 'Served attempt');
    assert.equal(record.servedIdentity?.branch, record.branch, 'Served branch');
    const imageFiles = (await readdir(path.join(folder, scenario.id))).filter(file => file.endsWith('.png'));
    assert.equal(single.pngCount, imageFiles.length, 'PNG inventory must match the uploaded files');
    pngs += imageFiles.length;
    records.push(record);
    workers.push({ id: scenario.id, status: record.status, checks: record.checks?.length, geometry: record.screenshotCheckpoints?.length, png: imageFiles.length, durationMs: single.durationMs });
  }
  const coverage = validateCoverage(records, sha);
  assert.deepEqual(coverage, { contexts: 6, checks: 1128, horizontalCheckpoints: 592 }, 'Original assertions/geometry cannot be reduced');
  assert.equal(pngs, 132, 'Full original screenshot artifact count must be retained');
  return { status: 'passed', mode: 'six-independent-jobs', sha, run, attempt: String(attempt), coverage, pngs, workers };
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const root = process.argv[2] || 'formal-evidence';
  const options = { sha: process.env.EXPECTED_SHA, run: process.env.GITHUB_RUN_ID, attempt: process.env.GITHUB_RUN_ATTEMPT, checksResult: process.env.CHECKS_JOB_RESULT, matrixResult: process.env.MATRIX_JOB_RESULT };
  await mkdir('gui-aggregate', { recursive: true });
  let result;
  try {
    result = await collectFormalGui(root, options);
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    result = { status: 'failed', mode: 'six-independent-jobs', sha: options.sha, run: options.run, attempt: options.attempt, error: { message: String(error.message || error), stack: String(error.stack || error) } };
    process.exitCode = 1;
    console.error(error);
  } finally {
    await writeFile('gui-aggregate/result.json', JSON.stringify(result, null, 2) + '\n');
    if (process.env.GITHUB_STEP_SUMMARY) {
      const summary = '## Formal GUI: six independent jobs\n\n' +
        'Result: **' + result.status + '**\n\n' +
        'SHA: `' + (result.sha || 'unknown') + '`\n\n' +
        'Completed: ' + (result.coverage?.contexts ?? 'UNKNOWN') + '/6; checks ' + (result.coverage?.checks ?? 'UNKNOWN') +
        '/1128; geometry ' + (result.coverage?.horizontalCheckpoints ?? 'UNKNOWN') +
        '/592; PNG ' + (result.pngs ?? 'UNKNOWN') + '/132.\n\n' +
        'Historical fixed-B 5/6 evidence is not modified. Failure, cancellation and missing artifacts remain unverified.\n';
      await writeFile(process.env.GITHUB_STEP_SUMMARY, summary, { flag: 'a' });
    }
  }
}
