// One finite set of focused controls. These never certify formal six-context coverage.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runChild } from './diagnostic-supervisor.mjs';

const output = resolve(process.env.GUI_EVIDENCE_DIR || 'gui-evidence/webkit-controls');
await mkdir(output, { recursive: true });
const caseIds = ['A2-pr-webkit390', 'B-pr-webkit375', 'C-pr-chromium390', 'D-main-webkit390'];
let summary;
try {
const source = resolve(process.env.WK_A_DIRECTORY);
const baseline = '94e657b311740a1ae5803fe008c969a598c43969', main = '2549c8c15d9a5e4cea052eabc0020ad03104b49a';
const first = JSON.parse(await readFile(join(source, 'diagnostic.json'), 'utf8'));
assert.equal(first.sha, baseline); assert.equal(first.scenario, 'webkit-mobile-390px'); assert.equal(first.mode, 'full-prefix');
assert.equal(first.diagnosticSha, 'af47b42a80e5f31171d565d4a8502a6eb0732145');
assert.equal(first.run, '41250143451'); assert.equal(first.attempt, '1');
assert.equal(first.status, 'diagnostic-passed');
const fixturePath = join(source, 'comparison-fixture.json');
const fixture = JSON.parse(await readFile(fixturePath, 'utf8'));
const screen = JSON.parse(await readFile(join(source, 'comparison-start-screen.json'), 'utf8'));
assert.deepEqual(JSON.parse(screen.localStorageRaw['calculation-memo:data']), fixture, 'A captured raw must match the parsed fixture');
const fixtureSha256 = createHash('sha256').update(JSON.stringify(fixture)).digest('hex');
const codeRoot = fileURLToPath(new URL('../', import.meta.url));
summary = { diagnosticOnly: true, formalAcceptance: false, status: 'running', startedAt: new Date().toISOString(),
  codeSha: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: codeRoot, encoding: 'utf8' }).trim(),
  run: process.env.GITHUB_RUN_ID || 'local', attempt: process.env.GITHUB_RUN_ATTEMPT || '1', sourceA: { run: first.run, attempt: first.attempt, diagnosticSha: first.diagnosticSha, appSha: first.sha, status: first.status, artifact: process.env.WK_A_ARTIFACT, fixtureSha256 },
  difference: 'A full-prefix versus fresh focused contexts is an explicit condition difference. All focused controls use the same A storage fixture; the original target reloads after injection. React state/prefix effects are not proven equivalent.', cases: [] };
const save = () => writeFile(join(output, 'controls.json'), JSON.stringify(summary, null, 2) + '\n');
await save();
for (const [id, app, sha, scenario] of [
  ['A2-pr-webkit390', process.env.WK_BASELINE_ROOT, baseline, 'webkit-mobile-390px'],
  ['B-pr-webkit375', process.env.WK_BASELINE_ROOT, baseline, 'webkit-mobile-375px'],
  ['C-pr-chromium390', process.env.WK_BASELINE_ROOT, baseline, 'chromium-mobile-390px'],
  ['D-main-webkit390', process.env.WK_MAIN_ROOT, main, 'webkit-mobile-390px'],
]) {
  const directory = join(output, id); await mkdir(directory, { recursive: true });
  const item = { id, appSha: sha, scenario, status: 'running', startedAt: new Date().toISOString(), fixtureSha256 };
  summary.cases.push(item); await save();
  try {
    assert.equal(execFileSync('git', ['rev-parse', 'HEAD:e2e/scenario.mjs'], { cwd: app, encoding: 'utf8' }).trim(), first.sourceBlob);
    item.child = await runChild({ command: process.execPath, args: [join(codeRoot, 'e2e/run-webkit-diagnostic.mjs')],
      env: { ...process.env, WK_APP_ROOT: app, EXPECTED_SHA: sha, PR_BRANCH: id.startsWith('D-') ? 'main' : 'feat/selective-restore-preview', WK_FIXTURE: fixturePath, WK_FOCUSED: '1', E2E_SCENARIO: scenario, GUI_EVIDENCE_DIR: directory },
      log: join(directory, 'supervisor.log'), timeoutMs: 180000, graceMs: 20000 });
    const result = JSON.parse(await readFile(join(directory, 'diagnostic.json'), 'utf8'));
    assert.ok(item.child.ok, 'Bounded focused worker must exit successfully');
    assert.equal(result.status, 'diagnostic-passed'); assert.equal(result.sha, sha); assert.equal(result.checks, 15); assert.equal(result.geometry, 6);
    assert.deepEqual(JSON.parse(await readFile(join(directory, 'comparison-fixture.json'), 'utf8')), fixture);
    Object.assign(item, { status: 'diagnostic-passed', checks: result.checks, geometry: result.geometry, durationMs: item.child.durationMs });
  } catch (error) { item.status = 'diagnostic-failed'; item.error = String(error.stack || error); }
  item.finishedAt = new Date().toISOString(); await save();
}
summary.status = summary.cases.length === 4 && summary.cases.every(c => c.status === 'diagnostic-passed') ? 'diagnostic-passed' : 'diagnostic-failed';
summary.finishedAt = new Date().toISOString(); await save();
if (summary.status !== 'diagnostic-passed') process.exitCode = 1;
} catch (error) {
  const failure = summary || { diagnosticOnly: true, formalAcceptance: false, cases: [] };
  Object.assign(failure, { status: 'diagnostic-failed', failure: String(error.stack || error), recordedAt: new Date().toISOString() });
  for (const id of caseIds) if (!failure.cases.some(c => c.id === id)) failure.cases.push({ id, status: 'NOT_TESTED', reason: 'Required evidence/setup or remaining execution was unavailable; no inferred fixture used.' });
  await writeFile(join(output, 'controls.json'), JSON.stringify(failure, null, 2) + '\n');
  console.error(error); process.exitCode = 1;
}
