import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateFrameCase } from './run-webkit-frame-pair.mjs';
const sha = 'a'.repeat(40);
function data(observed) {
  return { result: { status: 'diagnostic-passed', sha, scenario: 'webkit-mobile-390px', checks: 15, geometry: 6,
    observation: { tapFrames: observed, executablePath: null }, diagnosticSources: { runner: {}, source: {}, observer: {} },
    diagnosticSourcesUnchangedAtEnd: { runner: true, source: true, observer: true } },
  provenance: { status: 'passed', sha, errors: [] },
  operations: observed ? Array.from({ length: 71 }, () => [
    { event: 'tap-frames', record: { samples: [{ timestamp: 1 }], truncated: false } },
    { event: 'tap-frame-observer-cost', phase: 'begin' }, { event: 'tap-frame-observer-cost', phase: 'end' },
  ]).flat() : [] };
}
test('bounded frame pair accepts only complete unobserved/observed evidence', () => {
  for (const observed of [false, true]) {
    const d = data(observed);
    assert.equal(validateFrameCase(d.result, d.provenance, d.operations, sha, observed).frames, observed ? 71 : 0);
  }
});
test('missing frame, observer error, changed source, wrong SHA and incomplete checks reject', () => {
  for (const mutate of [
    d => d.operations.pop(),
    d => d.operations.push({ event: 'tap-frame-observer-error' }),
    d => { d.operations[0].record.samples = []; },
    d => { d.operations[0].record.truncated = true; },
    d => { d.result.diagnosticSourcesUnchangedAtEnd.observer = false; },
    d => { d.result.diagnosticSourcesUnchangedAtEnd = {}; },
    d => { d.result.sha = 'b'.repeat(40); },
    d => { d.result.checks = 14; },
    d => { d.provenance.errors = ['synthetic error']; },
  ]) {
    const d = data(true); mutate(d);
    assert.throws(() => validateFrameCase(d.result, d.provenance, d.operations, sha, true));
  }
});
test('pair runner uses submitted checkout, finite caps and original PNG retention rather than old baseline app', () => {
  const source = readFileSync(new URL('./run-webkit-frame-pair.mjs', import.meta.url), 'utf8');
  assert.match(source, /totalCapMs: 420000/);
  assert.match(source, /perCaseWorkerCapMs: 150000/);
  assert.match(source, /WK_APP_ROOT: root/);
  assert.match(source, /WK_TAP_FRAMES: observed \? '1' : '0'/);
  assert.match(source, /summary.cases.length === 2/);
  assert.doesNotMatch(source, /WK_BASELINE_ROOT|WK_MAIN_ROOT|force:\s*true|noWaitAfter/);
});

test('deadline reserves complete case and cleanup budget and rejects malformed epoch', async () => {
  const { frameCaseBudget } = await import('./run-webkit-frame-pair.mjs');
  assert.equal(frameCaseBudget(420000, undefined, 1000).canStart, true);
  assert.equal(frameCaseBudget(189999, undefined, 1000).canStart, false);
  assert.equal(frameCaseBudget(420000, '190999', 1000).canStart, false);
  assert.equal(frameCaseBudget(420000, '191000', 1000).canStart, true);
  assert.equal(frameCaseBudget(420000, '900', 1000).canStart, false);
  assert.throws(() => frameCaseBudget(420000, 'not-an-epoch', 1000));
});
test('fixture raw equality cannot be replaced by equal parsed objects', async () => {
  const { validateFixtureRaw } = await import('./run-webkit-frame-pair.mjs');
  assert.deepEqual(validateFixtureRaw(Buffer.from('{"value":1}\n'), '{"value":1}'), { value: 1 });
  assert.throws(() => validateFixtureRaw(Buffer.from('{"value":1}\n'), '{"value":1.0}'));
  assert.throws(() => validateFixtureRaw(Buffer.from('{"value":1}\n'), '{ "value":1}'));
});
