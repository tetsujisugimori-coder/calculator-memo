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
