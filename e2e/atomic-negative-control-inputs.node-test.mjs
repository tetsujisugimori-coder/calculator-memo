import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { validateAtomicCase } from './storage-atomic-evidence.mjs';
import { narrowMainAtomicScope } from './atomic-negative-control-inputs.mjs';
const bytes = readFileSync(new URL('../docs/maintenance/storage-atomic-stage3b11/independent/reaccept/wrong-scope-native-a-row.json', import.meta.url));
const row = JSON.parse(bytes);
test('first Linux normal A raw remains a valid fixed input', () => {
  assert.equal(validateAtomicCase(row), true);
  assert.equal(row.sha, '5141bfd1facd2dab8bd12f76cc33e6076763fd1f');
  assert.equal(createHash('sha256').update(bytes).digest('hex'), '7aa66d14b0b50cdd1c6de666f8c98c8a00c5e28510009f58aee5e0122b21f2d6');
});
test('old first-operation scope injection misses the main transaction (retained failure)', () => {
  const old = structuredClone(row);
  const event = old.events.find(e => e.kind === 'tx-start' && e.operationId === 'op-a');
  const main = old.journal.find(j => j.label === 'update-a').result.txId;
  assert.notEqual(event.txId, main);
  assert.equal(event.txId, `${main}-reserve`);
  event.scope = ['state'];
  assert.equal(validateAtomicCase(old), true);
});
test('same input with narrowed actual main scope rejects for complete-store-scope', () => {
  const evidence = { rows: [structuredClone(row)] };
  narrowMainAtomicScope(evidence);
  const main = evidence.rows[0].journal.find(j => j.label === 'update-a').result.txId;
  const changed = evidence.rows[0].events.filter((e, i) => JSON.stringify(e) !== JSON.stringify(row.events[i]));
  assert.equal(changed.length, 1); assert.equal(changed[0].txId, main);
  assert.throws(() => validateAtomicCase(evidence.rows[0]), /complete-store-scope/);
});
