// Pure negative controls use the exact assertion functions called by scenario.mjs.
// They do not claim browser execution; final acceptance still needs six raw artifacts.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';
const source = await readFile(new URL('./scenario.mjs', import.meta.url), 'utf8');
function acceptance(name) {
  const text = source.match(new RegExp(`function ${name}\\([^\\n]*\\) \\{[\\s\\S]*?\\n\\}`))?.[0];
  assert.ok(text, `${name} must remain the live scenario assertion`);
  return vm.runInNewContext(`(${text})`, { assert });
}
const assertHeld = acceptance('assertUnknownReportSave');
const expected = { raw: ' { "saved": true } ', title: 'Title', body: '# Exact\n\nBody', remarks: '境😀', linkLabels: ['memo-id / record-id'] };
const held = () => ({ ...structuredClone(expected), attempts: 1, confirmationDisabled: true, ordinarySaveDisabled: true });
test('UNKNOWN observation accepts intact draft/raw and exactly one original attempt', () => assertHeld(held(), expected));
for (const [name, change] of [
  ['no injected attempt', value => { value.attempts = 0; }],
  ['automatic retry even if silently dropped', value => { value.attempts = 2; }],
  ['changed raw', value => { value.raw += ' '; }],
  ['lost title', value => { value.title = ''; }],
  ['lost body', value => { value.body = ''; }],
  ['truncated remarks', value => { value.remarks = '境'; }],
  ['lost evidence link', value => { value.linkLabels = []; }],
  ['confirmation retry enabled', value => { value.confirmationDisabled = false; }],
  ['ordinary save bypass enabled', value => { value.ordinarySaveDisabled = false; }],
]) test(`UNKNOWN rejects: ${name}`, () => { const value = held(); change(value); assert.throws(() => assertHeld(value, expected)); });
const assertLayout = acceptance('assertCalculatorScrollLayout');
const before = { calculatorTop: 200 };
const flow = () => ({ width: 800, scrollY: 250, position: 'static', calculatorTop: -50, calculatorBottom: 650, notesTop: 680, gap: -150 });
const hit = () => ({ hit: true, enabled: true, inViewport: true });
test('721/800px accept natural flow, non-overlap and reachable notes without weakening desktop sticky', () => {
  for (const width of [721, 800]) assertLayout(before, { ...flow(), width }, hit());
  assertLayout(before, { ...flow(), width: 1365, position: 'sticky', gap: 28 }, null);
});
for (const [name, change] of [
  ['old two-column sticky overlap', value => { value.position = 'sticky'; }],
  ['no real scroll', value => { value.scrollY = 0; }],
  ['calculator document drift', value => { value.calculatorTop = 100; }],
  ['notes under calculator', value => { value.notesTop = 600; }],
]) test(`natural flow rejects: ${name}`, () => { const value = flow(); change(value); assert.throws(() => assertLayout(before, value, hit())); });
for (const field of ['hit', 'enabled', 'inViewport']) test(`notes probe rejects: ${field}=false`, () => assert.throws(() => assertLayout(before, flow(), { ...hit(), [field]: false })));
test('desktop still rejects wrong sticky gap or non-sticky positioning', () => {
  assert.throws(() => assertLayout(before, { ...flow(), width: 1365, position: 'sticky', gap: 30 }, null));
  assert.throws(() => assertLayout(before, { ...flow(), width: 1365, gap: 28 }, null));
});
test('reload reconstruction uses seven recorded UI activations and retains original pending-lock checks', () => {
  const recovery = source.split('const recoveryTouchStart =')[1].split('const locks = navigator.locks;')[0];
  assert.equal((recovery.match(/await activate\(/g) || []).length, 6);
  assert.equal((recovery.match(/await openLibrary\(\)/g) || []).length, 1);
  assert.match(recovery, /assertUnknownReportSave\(unknownBefore, expectedUnknown\)/);
  assert.match(recovery, /assertUnknownReportSave\(unknownAfter, expectedUnknown\)/);
  assert.match(recovery, /observationMs = 1600/);
  assert.match(recovery, /await page\.waitForTimeout\(observationMs\)/);
  assert.match(recovery, /attemptsBefore: unknownBefore\.attempts, attemptsAfter: unknownAfter\.attempts/);
  assert.match(recovery, /window\.__allowRemarksWrite\(\)/);
  assert.match(recovery, /await page\.reload\(\)/);
  assert.doesNotMatch(recovery, /localStorage\.(setItem|clear|removeItem)/);
  assert.match(source, /保存結果を確認しています。まだ保存済みではありません。/);
  assert.match(source, /window\.__releaseRemarksSave\(\)/);
});

test('the formal prerequisite job runs these negative controls before browser matrix acceptance', async () => {
  const workflow = await readFile(new URL('../.github/workflows/verify-pr-gui.yml', import.meta.url), 'utf8');
  const checks = workflow.split('\n  checks:\n')[1]?.split('\n  formal_scenario:\n')[0];
  assert.ok(checks, 'The existing formal checks prerequisite must remain present');
  assert.match(checks, /run: node e2e\/run-stage\.mjs ci-contract node --test e2e\/ci-contract\.node-test\.mjs e2e\/formal-storage-recovery\.node-test\.mjs/);
});
