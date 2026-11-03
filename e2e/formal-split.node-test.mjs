// Finite positive and negative controls for the six-job formal coverage gate.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { scenarios } from './scenario-config.mjs';
import { collectFormalGui } from './aggregate-formal-gui.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const sha = 'a'.repeat(40);
const run = 'synthetic-42', attempt = '1';
const options = { sha, run, attempt, checksResult: 'success', matrixResult: 'success' };
const counts = [188, 187, 188, 188, 188, 189];
const geometry = [100, 98, 98, 98, 98, 100];
function artifactFolder(folder, scenario) { return join(folder, 'formal-gui-' + sha + '-' + attempt + '-' + scenario.id); }
function recordFor(scenario, i) {
  return {
    status: 'passed', sha, expectedSha: sha, run, attempt, branch: 'test-branch',
    servedIdentity: { sha, run, attempt, branch: 'test-branch' },
    scenarios: [{ ...scenario, status: 'passed', ...(scenario.hasTouch ? { touchActivations: 1337 } : {}) }],
    errors: [],
    checks: Array.from({ length: counts[i] }, (_, n) => scenario.id + ': synthetic ' + n),
    screenshotCheckpoints: Array.from({ length: geometry[i] }, (_, n) => ({ name: scenario.id + '-geometry-' + n, horizontalFit: 'passed' })),
  };
}
async function fixture() {
  const folder = await mkdtemp(join(tmpdir(), 'formal-gui-six-'));
  for (const [index, scenario] of scenarios.entries()) {
    const base = artifactFolder(folder, scenario);
    const worker = join(base, scenario.id);
    await mkdir(worker, { recursive: true });
    await writeFile(join(worker, 'provenance.json'), JSON.stringify(recordFor(scenario, index)));
    await writeFile(join(base, 'single-ci-outcomes.json'), JSON.stringify({ id: scenario.id, sha, run, attempt, status: 'passed', child: { code: 0, signal: null }, pngCount: 22 }));
    for (let n = 0; n < 22; n++) await writeFile(join(worker, 'synthetic-' + n + '.png'), 'synthetic fixture');
  }
  return folder;
}
async function withFixture(action) {
  const folder = await fixture();
  try { await action(folder); } finally { await rm(folder, { recursive: true, force: true }); }
}
async function alterJson(file, change) {
  const obj = JSON.parse(await readFile(file, 'utf8'));
  change(obj);
  await writeFile(file, JSON.stringify(obj));
}
test('the matrix is exactly the six immutable scenario IDs, with no fail-fast or legacy main-suite run', async () => {
  const workflow = await readFile(join(root, '.github/workflows/verify-pr-gui.yml'), 'utf8');
  const formal = workflow.split('\n  formal_scenario:\n')[1]?.split('\n  formal_aggregate:\n')[0];
  assert.ok(formal, 'Formal independent job block exists');
  const listing = formal.match(/\n      matrix:\n        scenario:\n((?:          - [^\n]+\n)+)/)?.[1];
  assert.ok(listing, 'Literal job matrix is auditable');
  const names = listing.trim().split('\n').map(line => line.trim().replace(/^- /, ''));
  assert.deepEqual(names, scenarios.map(scenario => scenario.id));
  assert.match(formal, /fail-fast: false/);
  assert.match(formal, /timeout-minutes: 30/);
  assert.match(formal, /id: gui\n        run: node e2e\/run-stage\.mjs gui /);
  assert.doesNotMatch(formal, /e2e\/smoke\.mjs/);
  assert.match(workflow, /needs: \[checks, formal_scenario\]/);
  assert.match(workflow, /if: always\(\)/);
  assert.match(workflow, /merge-multiple: false/);
  assert.ok(!workflow.split('\n  checks:\n')[1].split('\n  formal_scenario:\n')[0].includes('e2e/smoke.mjs'), 'Former 3-worker suite is not on the mandatory branch gate');
});
test('six distinct successful jobs preserve all 1128 checks, 592 geometry checkpoints and 132 PNG files', async () => {
  await withFixture(async folder => {
    const result = await collectFormalGui(folder, options);
    assert.deepEqual(result.coverage, { contexts: 6, checks: 1128, horizontalCheckpoints: 592 });
    assert.equal(result.pngs, 132);
    assert.equal(result.status, 'passed');
  });
});
const cases = [
  ['missing sixth artifact', async folder => rm(artifactFolder(folder, scenarios[5]), { recursive: true, force: true }), /Exactly six separate artifacts/],
  ['unexpected seventh artifact', async folder => mkdir(join(folder, 'unexpected'), { recursive: true }), /Exactly six separate artifacts/],
  ['foreign single-job SHA', async folder => alterJson(join(artifactFolder(folder, scenarios[0]), 'single-ci-outcomes.json'), x => { x.sha = 'b'.repeat(40); }), /Single-worker head/],
  ['mixed run attempts', async folder => alterJson(join(artifactFolder(folder, scenarios[1]), 'single-ci-outcomes.json'), x => { x.attempt = '2'; }), /Single-worker attempt/],
  ['failed scenario is not a success', async folder => alterJson(join(artifactFolder(folder, scenarios[2]), 'single-ci-outcomes.json'), x => { x.status = 'failed'; }), /Single-worker status/],
  ['swapped scenario inside correct artifact folder', async folder => alterJson(join(artifactFolder(folder, scenarios[3]), scenarios[3].id, 'provenance.json'), x => { x.scenarios[0].id = scenarios[0].id; }), /Artifact directory cannot impersonate/],
  ['missing acceptance check', async folder => alterJson(join(artifactFolder(folder, scenarios[4]), scenarios[4].id, 'provenance.json'), x => { x.checks.pop(); }), /Missing or extra GUI acceptance checks/],
  ['missing image evidence', async folder => unlink(join(artifactFolder(folder, scenarios[5]), scenarios[5].id, 'synthetic-0.png')), /PNG inventory must match/],
];
for (const [description, mutate, error] of cases) {
  test('reject: ' + description, async () => withFixture(async folder => {
    await mutate(folder);
    await assert.rejects(collectFormalGui(folder, options), error);
  }));
}
test('a failed prerequisite job fails even when all six artifacts look complete', async () => {
  await withFixture(async folder => {
    await assert.rejects(collectFormalGui(folder, { ...options, checksResult: 'failure' }), /Checks\/build job/);
    await assert.rejects(collectFormalGui(folder, { ...options, matrixResult: 'cancelled' }), /scenario jobs failed or were cancelled/);
  });
});
