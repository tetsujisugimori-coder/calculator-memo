import assert from 'node:assert/strict';
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
