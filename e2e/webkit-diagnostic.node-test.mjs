import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';
import { diagnosticSource } from './webkit-diagnostic-source.mjs';

const original = readFileSync(new URL('./scenario.mjs', import.meta.url), 'utf8').replaceAll('\r\n', '\n');
function calls(source, predicate) {
  const tree = ts.createSourceFile('scenario.mjs', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS), found = [];
  const printer = ts.createPrinter({ removeComments: true });
  function visit(node) {
    if (ts.isCallExpression(node) && predicate(node.expression.getText(tree))) {
      found.push({ name: node.expression.getText(tree), args: node.arguments.map(a => printer.printNode(ts.EmitHint.Expression, a, tree)) });
    }
    ts.forEachChild(node, visit);
  }
  visit(tree); return found;
}
test('full and focused derived workers parse, including nested await arguments', () => {
  for (const focused of [false, true]) {
    const derived = diagnosticSource(original, 'file:///diagnostic-observer.mjs', focused);
    assert.ok(derived.locations.length > 500);
    const parsed = spawnSync(process.execPath, ['--input-type=module', '--check'], { input: derived.code, encoding: 'utf8' });
    assert.equal(parsed.status, 0, parsed.stderr);
  }
});
test('serialized browser and polling callbacks remain identical', () => {
  const derived = diagnosticSource(original, 'file:///diagnostic-observer.mjs', false);
  const tokens = text => {
    const scanner = ts.createScanner(ts.ScriptTarget.Latest, true, ts.LanguageVariant.Standard, text), result = [];
    for (let kind = scanner.scan(); kind !== ts.SyntaxKind.EndOfFileToken; kind = scanner.scan()) result.push([kind, scanner.getTokenText()]);
    return JSON.stringify(result);
  };
  const callbacks = source => calls(source, name => /\.(evaluate|evaluateHandle|addInitScript|route|poll|on)$/.test(name))
    .flatMap(call => call.args.filter(arg => arg.includes('=>') || arg.startsWith('function'))).map(tokens).sort();
  assert.deepEqual(callbacks(derived.code), callbacks(original));
});
test('full diagnostic retains all assertion calls and explicit timeout values', () => {
  const derived = diagnosticSource(original, 'file:///diagnostic-observer.mjs', false);
  assert.deepEqual(calls(derived.code, n => n.startsWith('assert.')).map(x => x.name).sort(), calls(original, n => n.startsWith('assert.')).map(x => x.name).sort());
  for (const setting of ['page.setDefaultTimeout(10000)', 'timeout: 30000']) assert.ok(derived.code.includes(setting));
  assert.ok(derived.code.includes('validateScenarioCoverage(metadata, metadata.expectedSha, false)'));
});
test('source drift fails instead of silently applying a diagnostic to another body', () => {
  assert.throws(() => diagnosticSource(original.replace('let activeScenarioRecord;', 'let changed;'), 'file:///observer.mjs', false), /Unambiguous/);
});

test('tap frame observation is opt-in and preserves tap arguments/assertions/timeouts', () => {
  const ordinary = diagnosticSource(original, 'file:///observer.mjs', false);
  const observed = diagnosticSource(original, 'file:///observer.mjs', false, { tapFrames: true, executablePath: '/tmp/local-wrapper' });
  assert.ok(!ordinary.code.includes('beginTapFrames'));
  assert.ok(observed.code.includes('diag.beginTapFrames(locator)'));
  assert.match(observed.code, /finally\s*\{/);
  assert.ok(observed.code.includes('diag.endTapFrames(page)'));
  assert.deepEqual(calls(observed.code, n => n === 'locator.tap'), calls(original, n => n === 'locator.tap'));
  assert.deepEqual(calls(observed.code, n => n.startsWith('assert.')).map(x => x.name).sort(), calls(original, n => n.startsWith('assert.')).map(x => x.name).sort());
  assert.ok(observed.code.includes('executablePath: "/tmp/local-wrapper"'));
  assert.ok(observed.code.includes('page.setDefaultTimeout(10000)'));
  const parsed = spawnSync(process.execPath, ['--input-type=module', '--check'], { input: observed.code, encoding: 'utf8' });
  assert.equal(parsed.status, 0, parsed.stderr);
});

test('frame observer is bounded, records rect cost separately and never writes storage', () => {
  const observer = readFileSync(new URL('./webkit-diagnostic-observer.mjs', import.meta.url), 'utf8');
  const framePart = observer.slice(observer.indexOf('async beginTapFrames'), observer.indexOf('async awaited'));
  assert.match(framePart, /samples.length >= 1200/);
  assert.match(framePart, /record.started > 10000/);
  assert.match(framePart, /rectMs: end - begin/);
  assert.match(framePart, /cancelAnimationFrame/);
  assert.match(framePart, /removeEventListener/);
  assert.doesNotMatch(framePart, /localStorage|sessionStorage|setItem|removeItem/);
});

test('tap observer evaluation failures report NOT_OBSERVABLE without replacing tap outcome', async () => {
  const { observer } = await import('./webkit-diagnostic-observer.mjs');
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const directory = mkdtempSync(join(tmpdir(), 'wk-observer-contract-'));
  try {
    const diag = observer(directory);
    const inaccessible = { evaluate: async () => { throw new Error('synthetic page unavailable'); } };
    await diag.beginTapFrames(inaccessible);
    const originalFailure = new Error('original tap failure');
    await assert.rejects(async () => { try { throw originalFailure; } finally { await diag.endTapFrames(inaccessible); } }, error => error === originalFailure);
    const records = readFileSync(directory + '/operations.ndjson', 'utf8').trim().split('\n').map(JSON.parse);
    assert.equal(records.filter(x => x.event === 'tap-frame-observer-error' && x.result === 'NOT_OBSERVABLE').length, 2);
    assert.equal(records.filter(x => x.event === 'tap-frame-observer-cost').length, 2);
  } finally { rmSync(directory, { recursive: true }); }
});

test('browser callback sample/lifecycle limits actually cancel RAF and remove listeners', async () => {
  const { observer } = await import('./webkit-diagnostic-observer.mjs');
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const { runInNewContext } = await import('node:vm');
  const directory = mkdtempSync(join(tmpdir(), 'wk-observer-cap-'));
  try {
    for (const mode of ['samples', 'lifecycle']) {
      let clock = 0, serial = 0;
      const callbacks = new Map(), listeners = new Map();
      const sandbox = {
        performance: { now: () => ++clock },
        document: { visibilityState: 'visible', addEventListener: (n, cb) => listeners.set(n, cb), removeEventListener: n => listeners.delete(n) },
        requestAnimationFrame: cb => { callbacks.set(++serial, cb); return serial; },
        cancelAnimationFrame: id => callbacks.delete(id),
        element: { isConnected: true, getBoundingClientRect: () => ({ x: 0, y: 0, width: 44, height: 44 }) },
      };
      const diag = observer(directory);
      await diag.beginTapFrames({ evaluate: callback => runInNewContext(`(${callback})(element)`, sandbox) });
      if (mode === 'samples') {
        for (let i = 0; i < 1201; i++) {
          const [id, callback] = callbacks.entries().next().value;
          callbacks.delete(id); callback(clock);
        }
        assert.equal(sandbox.__wkDiagnosticTapFrames.samples.length, 1200);
      } else {
        for (let i = 0; i < 101; i++) listeners.get('visibilitychange')();
        assert.equal(sandbox.__wkDiagnosticTapFrames.lifecycle.length, 100);
      }
      assert.equal(sandbox.__wkDiagnosticTapFrames.truncated, true);
      assert.equal(callbacks.size, 0);
      assert.equal(listeners.size, 0);
      await diag.endTapFrames({ evaluate: callback => runInNewContext(`(${callback})()`, sandbox) });
      assert.equal(sandbox.__wkDiagnosticTapFrames, undefined);
    }
  } finally { rmSync(directory, { recursive: true }); }
});
