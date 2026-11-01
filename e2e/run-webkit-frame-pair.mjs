// Two bounded diagnostic observations, never formal acceptance or a performance fix.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { runChild } from './diagnostic-supervisor.mjs';

export function validateFrameCase(result, provenance, operations, sha, observed) {
  assert.equal(result.status, 'diagnostic-passed');
  assert.equal(result.sha, sha);
  assert.equal(result.scenario, 'webkit-mobile-390px');
  assert.equal(result.checks, 15);
  assert.equal(result.geometry, 6);
  assert.equal(result.observation.tapFrames, observed);
  assert.equal(result.observation.executablePath, null, 'Fixed CI uses the installed Playwright browser');
  assert.ok(Object.keys(result.diagnosticSources).length >= 3);
  assert.ok(Object.values(result.diagnosticSourcesUnchangedAtEnd).every(value => value === true));
  assert.equal(Object.keys(result.diagnosticSourcesUnchangedAtEnd).length, Object.keys(result.diagnosticSources).length);
  assert.equal(provenance.status, 'passed');
  assert.equal(provenance.sha, sha);
  assert.deepEqual(provenance.errors, []);
  const frames = operations.filter(record => record.event === 'tap-frames');
  const errors = operations.filter(record => record.event === 'tap-frame-observer-error');
  assert.deepEqual(errors, [], 'Missing observer evidence cannot pass the pair');
  if (observed) {
    assert.equal(frames.length, 71, 'Focused flow includes 70 comparison taps and one provenance tap');
    assert.ok(frames.every(item => !item.record.missing && !item.record.truncated && item.record.samples.length > 0));
    for (const phase of ['begin', 'end']) assert.equal(operations.filter(item => item.event === 'tap-frame-observer-cost' && item.phase === phase).length, 71);
  } else assert.equal(frames.length, 0);
  return { frames: frames.length, geometry: result.geometry, checks: result.checks };
}

export function frameCaseBudget(totalRemainingMs, deadlineValue, nowMs) {
  const deadline = deadlineValue === undefined ? Infinity : Number(deadlineValue);
  assert.ok(deadlineValue === undefined || (Number.isFinite(deadline) && deadline > 0), 'WK_PAIR_DEADLINE_MS must be epoch milliseconds');
  const remainingMs = Math.min(totalRemainingMs, deadline - nowMs);
  return { remainingMs, canStart: remainingMs >= 190000, requiredMs: 190000 };
}
export function validateFixtureRaw(bytes, raw) {
  const text = bytes.toString('utf8');
  assert.equal(text.endsWith('\n') ? text.slice(0, -1) : text, raw, 'Fixture file without its one record newline must equal captured raw exactly');
  return JSON.parse(text);
}

export async function runFramePair() {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const output = resolve(process.env.GUI_EVIDENCE_DIR || 'gui-evidence/webkit-frame-pair');
  await mkdir(output, { recursive: true });
  const started = performance.now();
  const summary = { diagnosticOnly: true, formalAcceptance: false, status: 'running', startedAt: new Date().toISOString(),
    run: process.env.GITHUB_RUN_ID || 'local', attempt: process.env.GITHUB_RUN_ATTEMPT || '1', totalCapMs: 420000, perCaseWorkerCapMs: 150000,
    order: ['unobserved', 'observed'], pairDeadlineMs: process.env.WK_PAIR_DEADLINE_MS ?? null, cases: ['unobserved', 'observed'].map(id => ({ id, status: 'NOT_RUN', reason: 'Not started' })),
    limitations: 'Fixed order, one observation per arm. Added evaluate round trips, RAF callbacks and rectangle layout reads affect timing; not evidence of a performance improvement. Fresh focused context differs from full prefix. No product/timeout/assertion changes.' };
  const save = () => writeFile(join(output, 'pair.json'), JSON.stringify(summary, null, 2) + '\n');
  await save();
  try {
    assert.ok(process.env.WK_A_DIRECTORY, 'A artifact directory is required');
    assert.ok(!process.env.WK_LOCAL_EXECUTABLE, 'Fixed environment pair forbids local wrapper override');
    const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
    assert.equal(sha, process.env.EXPECTED_SHA, 'Explicit submitted HEAD required');
    summary.appSha = sha;
    summary.appTree = execFileSync('git', ['rev-parse', 'HEAD^{tree}'], { cwd: root, encoding: 'utf8' }).trim();
    summary.node = process.version;
    summary.workingTree = execFileSync('git', ['status', '--short'], { cwd: root, encoding: 'utf8' }).trim();
    const pairSource = await readFile(fileURLToPath(import.meta.url));
    await writeFile(join(output, 'run-webkit-frame-pair.mjs'), pairSource);
    summary.runnerSha256 = createHash('sha256').update(pairSource).digest('hex');
    const source = resolve(process.env.WK_A_DIRECTORY);
    const first = JSON.parse(await readFile(join(source, 'diagnostic.json'), 'utf8'));
    assert.equal(first.run, '41250143451'); assert.equal(first.attempt, '1');
    assert.equal(first.sha, '94e657b311740a1ae5803fe008c969a598c43969');
    assert.equal(first.scenario, 'webkit-mobile-390px'); assert.equal(first.mode, 'full-prefix');
    assert.equal(first.status, 'diagnostic-passed');
    const fixtureBytes = await readFile(join(source, 'comparison-fixture.json'));
    const screen = JSON.parse(await readFile(join(source, 'comparison-start-screen.json'), 'utf8'));
    const fixture = validateFixtureRaw(fixtureBytes, screen.localStorageRaw['calculation-memo:data']);
    const fixturePath = join(output, 'input-fixture.json'); await writeFile(fixturePath, fixtureBytes);
    summary.sourceA = { run: first.run, attempt: first.attempt, sha: first.sha, artifact: '13060862890', fixtureSha256: createHash('sha256').update(fixtureBytes).digest('hex') };
    await save();
    for (const observed of [false, true]) {
      const id = observed ? 'observed' : 'unobserved', directory = join(output, id);
      const item = summary.cases.find(value => value.id === id);
      try {
        const budget = frameCaseBudget(summary.totalCapMs - (performance.now() - started), process.env.WK_PAIR_DEADLINE_MS, Date.now());
        item.budget = budget;
        if (!budget.canStart) { item.reason = 'Insufficient bounded case + cleanup budget; preserving evidence time'; await save(); continue; }
        const remaining = budget.remainingMs;
        item.status = 'running'; item.startedAt = new Date().toISOString(); delete item.reason; await save();
        await mkdir(directory, { recursive: true });
        item.child = await runChild({ command: process.execPath, args: [join(root, 'e2e/run-webkit-diagnostic.mjs')],
          env: { ...process.env, WK_APP_ROOT: root, WK_FOCUSED: '1', WK_TAP_FRAMES: observed ? '1' : '0', WK_FIXTURE: fixturePath,
            WK_DEADLINE_UTC_MS: String(Date.now() + remaining), EXPECTED_SHA: sha, E2E_SCENARIO: 'webkit-mobile-390px', GUI_PORT: process.env.GUI_PORT || '4396', GUI_EVIDENCE_DIR: directory },
          log: join(directory, 'supervisor.log'), timeoutMs: 170000, graceMs: 10000 });
        assert.ok(item.child.ok, 'Worker failure or incomplete cleanup cannot pass');
        const result = JSON.parse(await readFile(join(directory, 'diagnostic.json'), 'utf8'));
        const provenance = JSON.parse(await readFile(join(directory, 'provenance.json'), 'utf8'));
        const operations = (await readFile(join(directory, 'operations.ndjson'), 'utf8')).trim().split('\n').map(JSON.parse);
        const counts = validateFrameCase(result, provenance, operations, sha, observed);
        assert.deepEqual(JSON.parse(await readFile(join(directory, 'comparison-fixture.json'), 'utf8')), fixture);
        const files = await readdir(directory, { recursive: true });
        item.pngCount = files.filter(name => name.endsWith('.png')).length;
        item.pngPolicy = 'Focused checkpoints use original retention policy; zero PNG is possible and is not formal 132-PNG coverage';
        Object.assign(item, counts, { status: 'diagnostic-passed', durationMs: item.child.durationMs });
      } catch (error) { if (item.status !== 'NOT_RUN') item.status = 'diagnostic-failed'; item.error = String(error.stack || error); }
      item.finishedAt = new Date().toISOString(); await save();
    }
    summary.status = summary.cases.length === 2 && summary.cases.every(item => item.status === 'diagnostic-passed') ? 'diagnostic-passed' : 'diagnostic-failed';
  } catch (error) { summary.status = 'diagnostic-failed'; summary.error = String(error.stack || error); }
  summary.finishedAt = new Date().toISOString(); summary.durationMs = performance.now() - started; await save();
  return summary;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await runFramePair();
  if (result.status !== 'diagnostic-passed') process.exitCode = 1;
}
