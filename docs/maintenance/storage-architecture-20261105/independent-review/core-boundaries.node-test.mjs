import { test } from 'node:test';
import assert from 'node:assert/strict';
import { genesis, tokenOf, transition, commit, reconcile, HOLD } from '../../../../tests/storage-architecture/poc.mjs';
const request = operation => ({ operation, raw: operation, kind: 'ordinary', writer: 'arbitrary-protocol-label', instance: 'review-tab' });
function driver(root) {
  let read, candidate;
  const tx = { objectStore: () => ({ get: () => read = { result: root }, put: next => candidate = next }) };
  return { db: { transaction: () => tx }, read: () => read.onsuccess(), abort: () => tx.onabort(), complete: () => tx.oncomplete(), candidate: () => candidate };
}
test('retained core limit: UNKNOWN abort does not install a runtime HOLD controller', async () => {
  const s = genesis('boundary-incarnation', 'genesis'), expected = tokenOf(s), first = driver(s);
  const pending = commit(first.db, expected, request('uncertain'));
  first.read(); first.abort(); assert.equal((await pending).status, 'UNKNOWN');
  const next = driver(s), direct = commit(next.db, expected, request('later-new-id'));
  next.read(); next.complete();
  assert.equal((await direct).status, 'COMMITTED_OBSERVED');
  assert.equal(HOLD, true); // Declared boundary flag, not an installed mutation gate.
  assert.equal(next.candidate().history.some(h => h.operation === 'uncertain'), false);
});
test('retained core limit: post-complete failure is outside the persisted transaction receipt', () => {
  const s = genesis('boundary-incarnation', 'genesis');
  const next = transition(s, tokenOf(s), request('committed')).next;
  const unknown = { status: 'UNKNOWN', originalFailure: 'after-complete' };
  assert.equal(unknown.status, 'UNKNOWN'); assert.equal(reconcile(next, 'committed').acknowledgement, 'UNKNOWN');
  assert.equal(JSON.stringify(next).includes('after-complete'), false);
});
test('retained core limit: writer label is not a protocol-capability permission gate', () => {
  const s = genesis('boundary-incarnation', 'genesis');
  assert.equal(transition(s, tokenOf(s), request('arbitrary-writer')).status, 'PREPARED');
});
