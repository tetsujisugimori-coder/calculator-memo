// Runs exactly one historical GUI context in one independent CI job.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { scenarios, scenarioPort } from './scenario-config.mjs';
import { validateScenarioCoverage } from './ci-contract.mjs';

process.chdir(fileURLToPath(new URL('../', import.meta.url)));
const started = performance.now();
const id = process.env.E2E_SCENARIO;
const expectedSha = process.env.EXPECTED_SHA;
const outcome = { id, expectedSha, run: process.env.GITHUB_RUN_ID || 'local', attempt: process.env.GITHUB_RUN_ATTEMPT || '1', startedAt: new Date().toISOString(), status: 'failed' };
await mkdir('gui-evidence', { recursive: true });
try {
  const index = scenarios.findIndex(scenario => scenario.id === id);
  assert.ok(index >= 0, 'Exactly one known E2E_SCENARIO is required');
  assert.match(expectedSha || '', /^[a-f0-9]{40}$/, 'Exact 40-character head SHA is required');
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  assert.equal(sha, expectedSha, 'Checkout must equal the PR head');
  const branch = process.env.PR_BRANCH || execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8' }).trim();
  const servedIdentity = { sha, branch, run: outcome.run, attempt: outcome.attempt };
  await writeFile('dist-pages/__gui_provenance.json', JSON.stringify(servedIdentity) + '\n');
  const directory = 'gui-evidence/' + id;
  await mkdir(directory, { recursive: true });
  const log = createWriteStream(directory + '/worker.log');
  let logError;
  log.on('error', error => { logError = String(error); });
  const child = spawn(process.execPath, ['e2e/scenario.mjs'], {
    env: { ...process.env, CI: 'true', EXPECTED_SHA: sha, E2E_SCENARIO: id, GUI_EVIDENCE_DIR: directory, GUI_PORT: String(scenarioPort(index)) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child.stdout.pipe(log, { end: false });
  child.stderr.pipe(log, { end: false });
  const result = await new Promise(resolve => {
    child.once('error', error => resolve({ error: String(error), code: null, signal: null }));
    child.once('close', (code, signal) => resolve({ code, signal }));
  });
  await new Promise(resolve => {
    if (log.destroyed) resolve();
    else { log.once('error', resolve); log.end(resolve); }
  });
  Object.assign(outcome, { child: result, logError: logError || null, sha });
  assert.equal(result.code, 0, 'Scenario child must exit successfully');
  assert.equal(result.signal, null, 'Scenario must not terminate by signal');
  assert.equal(logError, undefined, 'Worker log must be preserved without IO failure');
  const record = JSON.parse(await readFile(directory + '/provenance.json', 'utf8'));
  assert.equal(record.run, outcome.run, 'Run ID must match');
  assert.equal(record.attempt, outcome.attempt, 'Run attempt must match');
  assert.deepEqual(record.servedIdentity, servedIdentity, 'Built preview identity must match');
  assert.equal(validateScenarioCoverage(record, sha), id, 'Scenario must match matrix identity');
  const pngCount = (await readdir(directory)).filter(name => name.endsWith('.png')).length;
  assert.ok(pngCount > 0, 'Screenshots must be retained');
  Object.assign(outcome, { status: 'passed', checks: record.checks.length, geometry: record.screenshotCheckpoints.length, pngCount });
  console.log(JSON.stringify({ scenario: id, status: 'passed', checks: outcome.checks, geometry: outcome.geometry, pngCount }));
} catch (error) {
  outcome.error = { message: String(error.message || error), stack: String(error.stack || error) };
  process.exitCode = 1;
  console.error(error);
} finally {
  outcome.finishedAt = new Date().toISOString();
  outcome.durationMs = performance.now() - started;
  await writeFile('gui-evidence/single-ci-outcomes.json', JSON.stringify(outcome, null, 2) + '\n');
}
