import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { validateAtomicCase } from './storage-atomic-evidence.mjs';
import { narrowMainAtomicScope, validateAtomicMutantFailure } from './atomic-negative-control-inputs.mjs';
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

const abortBytes = readFileSync(new URL('../docs/maintenance/storage-atomic-stage3b11/independent/reaccept/abort-success-diagnostic.json', import.meta.url));
const abortDiagnostic = JSON.parse(abortBytes);
test('fixed second Linux abort-success preserves native rejection and old reason mismatch', () => {
  assert.equal(createHash('sha256').update(abortBytes).digest('hex'), 'ac7cb63b25ba6c8f2b8c1f0f86e178a52806edc54d0488dcdef52ced38450634');
  assert.equal(abortDiagnostic.sha, '0f98d652fbeaa26515a6b5678c6af97f45662f65');
  assert.equal(abortDiagnostic.rows.length, 1);
  assert.doesNotMatch(abortDiagnostic.error, /compare-write-complete-result-order|scenario-outcome/);
  assert.match(validateAtomicMutantFailure(abortDiagnostic.rows[0], abortDiagnostic.error, 'abort-success',
    'verified-native-chain:tx-complete'), /verified-native-chain:tx-complete/);
});
test('a FAIL label on normal content cannot stand in for a semantic mutant rejection', () => {
  const normal = structuredClone(row); normal.status = 'FAIL';
  assert.throws(() => validateAtomicMutantFailure(normal, 'verified-native-chain:tx-complete', 'abort-success',
    'verified-native-chain:tx-complete'), /mutant-content-must-be-rejected/);
});
test('abort mutant requires its native abort even when missing complete still rejects', () => {
  const altered = structuredClone(abortDiagnostic.rows[0]);
  altered.events = altered.events.filter(e => e.kind !== 'tx-abort');
  const sequence = {}; for (const e of altered.events) e.sequence = sequence[e.boot] = (sequence[e.boot] || 0) + 1;
  assert.throws(() => validateAtomicMutantFailure(altered, abortDiagnostic.error, 'abort-success',
    'verified-native-chain:tx-complete'));
});
test('unrelated startup error never counts as the fixed abort semantic RED', () => {
  assert.throws(() => validateAtomicMutantFailure(abortDiagnostic.rows[0], 'ENOENT: browser setup failed',
    'abort-success', 'verified-native-chain:tx-complete'), /original-semantic-failure-reason/);
});
