import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { runInNewContext } from 'node:vm';
const source = readFileSync(new URL('./node-timeout-negative-controls.mjs', import.meta.url), 'utf8');
const start = source.indexOf('function assertTimeoutControlLog(');
const end = source.indexOf("const out = 'gui-evidence/node-timeout-controls';", start);
assert.ok(start >= 0 && end > start);
const validate = runInNewContext(`${source.slice(start, end)}; assertTimeoutControlLog`, { assert });
const base = new URL('../docs/maintenance/storage-atomic-stage3b11/independent/node-timeout-parser/', import.meta.url);
const audit = JSON.parse(readFileSync(new URL('runner-parser-green.json', base)));
const inputs = [
  ['original-fixed-false-success', 'runner-mixed-reason-false-success.txt', 'false-success', false],
  ['original-fixed-drop-log', 'runner-mixed-reason-drop-log.txt', 'drop-log', false],
  ...['false-success', 'drop-log'].flatMap(mode => [0, 200].map(delay =>
    [`realistic-mixed-${mode}-${delay}`, `runner-mixed-diagnostics-${mode}-${delay}.txt`, mode, false])),
  ['intended-red-false-success', 'runner-intended-red-false-success.txt', 'false-success', true],
  ['intended-red-drop-log', 'runner-intended-red-drop-log.txt', 'drop-log', true],
  ['normal-green', 'runner-normal-green.txt', 'normal', true],
];
for (const [name, file, mode, accept] of inputs) test(`timeout parser fixed input: ${name}`, () => {
  const input = readFileSync(new URL(file, base));
  const recorded = audit.results.find(r => r.name === name);
  assert.ok(recorded);
  assert.equal(createHash('sha256').update(input).digest('hex'), recorded.inputSha256);
  if (accept) {
    const conditions = validate(input.toString('utf8'), mode);
    assert.equal(conditions.length, 2);
    assert.equal(conditions[0].startupDelayMs, 0);
    assert.equal(conditions[1].startupDelayMs, 200);
    assert.ok(conditions.every(c => c.status === (mode === 'normal' ? 'GREEN' : 'semantic-RED')));
  } else assert.throws(() => validate(input.toString('utf8'), mode), { code: 'ERR_ASSERTION' });
});
