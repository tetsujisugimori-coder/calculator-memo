import { test } from 'node:test';
import assert from 'node:assert/strict';
import { genesis, tokenOf, inspect, transition, reconcile, commit, bootstrap, openDatabase } from '../../../../tests/storage-architecture/poc.mjs';
import { validateArchitectureEvidence, CASES } from '../../../../e2e/storage-architecture-contract.mjs';

const request = (id, raw = id) => ({ operation: id, raw, kind: 'ordinary', writer: 'independent-v2', instance: 'reviewer-tab' });
const first = () => genesis('reviewer-incarnation', 'zero', 'original');
const advanced = () => { const s = first(); return transition(s, tokenOf(s), request('one', 'candidate')).next; };

test('independent: deleting every mandatory root field prevents mutation', () => {
  for (const field of ['structure', 'incarnation', 'generation', 'operation', 'raw', 'history', 'copies']) {
    const s = advanced(), expected = tokenOf(s); delete s[field];
    assert.equal(inspect(s), 'UNKNOWN', field);
    assert.equal(transition(s, expected, request('two')).status, 'UNKNOWN', field);
  }
});
test('independent: deleting every receipt/copy field prevents mutation', () => {
  for (const index of [0, 1]) for (const field of ['generation', 'operation', 'previous', 'raw', 'writer', 'instance', 'kind']) {
    const s = advanced(), expected = tokenOf(s); delete s.history[index][field];
    assert.equal(inspect(s), 'UNKNOWN', `${index}/${field}`);
    assert.equal(transition(s, expected, request('two')).status, 'UNKNOWN');
  }
  for (const field of ['incarnation', 'generation', 'operation', 'raw']) {
    const s = advanced(), expected = tokenOf(s); delete s.copies[0][field];
    assert.equal(inspect(s), 'UNKNOWN', field);
    assert.equal(transition(s, expected, request('two')).status, 'UNKNOWN');
  }
});
test('independent: every three-writer order accepts only one original token', () => {
  for (const order of [['a', 'b', 'c'], ['a', 'c', 'b'], ['b', 'a', 'c'], ['b', 'c', 'a'], ['c', 'a', 'b'], ['c', 'b', 'a']]) {
    let s = first(); const token = tokenOf(s), results = [];
    for (const id of order) { const r = transition(s, token, request(id)); results.push(r.status); if (r.next) s = r.next; }
    assert.deepEqual(results, ['PREPARED', 'REFUSED', 'REFUSED']); assert.equal(s.generation, 1);
  }
});
test('independent: repeated identical raw still consumes generation, old recovery refused', () => {
  let s = first(); const old = tokenOf(s);
  for (const id of ['one', 'two', 'three']) s = transition(s, tokenOf(s), request(id, 'original')).next;
  assert.equal(s.generation, 3); assert.equal(s.raw, 'original');
  assert.equal(transition(s, old, { ...request('recover'), kind: 'recovery' }).status, 'REFUSED');
});
test('independent: receipt presence does not manufacture acknowledgement/durability', () => {
  const s = advanced(), result = reconcile(s, 'one');
  assert.deepEqual(result, { status: 'COMMIT_RECORD_OBSERVED', generation: 1, acknowledgement: 'UNKNOWN', durability: 'NOT_PROVEN' });
  assert.equal(reconcile(s, 'never-created').status, 'UNKNOWN');
  assert.equal(reconcile(undefined, 'one').status, 'UNKNOWN');
});
test('independent: coherent old snapshot rollback remains a retained limitation', () => {
  const old = first(), now = advanced();
  assert.equal(inspect(now), 'CONSISTENT'); assert.equal(inspect(old), 'CONSISTENT');
  assert.equal(reconcile(old, 'one').status, 'UNKNOWN');
});

// Deliberately small manually driven adapter. Tests API event order, not native IDB scheduling.
function controlledDatabase(root) {
  let get, put;
  const tx = { objectStore: () => ({
    get: () => { get = { result: structuredClone(root) }; return get; },
    put: value => { put = structuredClone(value); return {}; },
    add: value => { put = structuredClone(value); return {}; },
  }), abort: () => queueMicrotask(() => tx.onabort()) };
  return { db: { transaction: () => tx }, tx,
    readSuccess: () => get.onsuccess(), candidate: () => put,
    complete: () => tx.oncomplete(), abort: () => tx.onabort() };
}
test('independent: put preparation alone cannot resolve commit before complete', async () => {
  const s = first(), driver = controlledDatabase(s); let settled = false;
  const pending = commit(driver.db, tokenOf(s), request('one')).then(r => { settled = true; return r; });
  driver.readSuccess(); await Promise.resolve(); assert.equal(settled, false);
  assert.equal(driver.candidate().generation, 1); driver.complete();
  assert.equal((await pending).status, 'COMMITTED_OBSERVED');
});
test('independent: request success followed by transaction abort is UNKNOWN', async () => {
  const s = first(), driver = controlledDatabase(s);
  const pending = commit(driver.db, tokenOf(s), request('one'));
  driver.readSuccess(); driver.abort(); assert.deepEqual(await pending, { status: 'UNKNOWN', reason: 'transaction-aborted' });
  assert.equal(s.generation, 0);
});
test('independent: explicit abort after put and lost root do not silently create authority', async () => {
  const s = first(), driver = controlledDatabase(s);
  const pending = commit(driver.db, tokenOf(s), request('one'), 'abort-after-put');
  driver.readSuccess(); assert.equal((await pending).status, 'UNKNOWN');
  const missing = controlledDatabase(undefined);
  const result = commit(missing.db, tokenOf(s), request('one')); missing.readSuccess(); missing.complete();
  assert.equal((await result).status, 'UNKNOWN'); assert.equal(missing.candidate(), undefined);
});
test('independent: bootstrap requires approval and empty destination', async () => {
  for (const [root, approval] of [[undefined, false], [first(), true]]) {
    const driver = controlledDatabase(root), pending = bootstrap(driver.db, first(), approval);
    driver.readSuccess(); driver.complete(); assert.equal(await pending, 'REFUSED'); assert.equal(driver.candidate(), undefined);
  }
  assert.throws(() => openDatabase('real-product-data'), /test namespace/);
});
test('independent: generation token property order causes conservative refusal only', () => {
  const s = first(), expected = { operation: s.operation, generation: s.generation, incarnation: s.incarnation };
  assert.equal(transition(s, expected, request('one')).status, 'REFUSED');
});

const fakeEvidence = () => ({ provenance: { sha: 'review-head', tree: 'review-tree', sourceSha256: 'review-hash' }, executionAllowed: false, HOLD: true,
  results: ['chromium', 'webkit'].map(engine => ({ engine, version: 'test', status: 'PASS', pageerrors: [], cases: CASES.map(name => ({ name, status: 'PASS', observation: {} })) })) });
test('independent negative oracle: same-generation two commits must not validate', () => {
  const e = fakeEvidence();
  e.results[0].cases.find(c => c.name === 'same-generation-two-tabs').observation = {
    outcomes: [{ status: 'COMMITTED_OBSERVED' }, { status: 'COMMITTED_OBSERVED' }], generation: 1,
  };
  assert.ok(validateArchitectureEvidence(e, 'review-head').length > 0, 'contradictory native observation accepted as PASS');
});
