import assert from 'node:assert/strict';
import { validateAtomicCase } from './storage-atomic-evidence.mjs';
// Mutate the VERIFIED main transaction, identified by the host result and native
// page/boot/operation binding. The earlier reservation shares operationId.
export function narrowMainAtomicScope(evidence) {
  const row = evidence.rows.find(r => r.name === 'A-same-token');
  assert.ok(row, 'scope-control-normal-case-required');
  const call = row.journal.find(j => j.label === 'update-a');
  assert.equal(call.result.status, 'VERIFIED');
  const request = call.args[0];
  const matches = row.events.filter(e => e.kind === 'tx-start' && e.txId === call.result.txId
    && e.pageId === call.pageId && e.boot === request.boot && e.operationId === request.explicitOperationId);
  assert.equal(matches.length, 1, 'scope-control-main-transaction-required');
  assert.equal(matches[0].mode, 'readwrite');
  assert.deepEqual([...matches[0].scope].sort(), ['attempts', 'copies', 'receipts', 'state']);
  matches[0].scope = ['state'];
}

// The runner marks a rejected diagnostic row FAIL after the semantic assertion.
// Restore only that envelope in a clone to independently reproduce the actual
// content rejection, rather than accepting the FAIL label as a negative control.
export function validateAtomicMutantFailure(row, originalError, mutant, reason) {
  assert.equal(row.status, 'FAIL');
  const diagnostic = structuredClone(row); diagnostic.status = 'PASS';
  let error;
  try { validateAtomicCase(diagnostic); } catch (caught) { error = String(caught); }
  assert.ok(error, 'mutant-content-must-be-rejected');
  assert.match(originalError, new RegExp(reason), 'original-semantic-failure-reason');
  assert.match(error, new RegExp(reason), 'independent-semantic-failure-reason');
  if (mutant === 'abort-success' || mutant === 'early-success') {
    const call = row.journal.find(j => j.label === 'update-a');
    assert.equal(call.result.status, 'VERIFIED');
    const own = row.events.filter(e => e.txId === call.result.txId && e.boot === call.args[0].boot && e.pageId === call.pageId);
    assert.equal(own.filter(e => e.kind === 'update-result' && e.result.status === 'VERIFIED').length, 1);
    if (mutant === 'abort-success') {
      assert.equal(own.filter(e => e.kind === 'tx-abort').length, 1);
      assert.equal(own.filter(e => e.kind === 'tx-complete').length, 0);
    } else {
      assert.equal(own.filter(e => e.kind === 'premature-result').length, 1);
      assert.equal(own.filter(e => e.kind === 'readback').length, 0);
    }
  }
  return error;
}
