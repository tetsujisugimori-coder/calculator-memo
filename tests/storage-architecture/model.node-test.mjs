import { test } from 'node:test';
import assert from 'node:assert/strict';
import { genesis, inspect, tokenOf, transition, reconcile, executionAllowed, HOLD } from './poc.mjs';
const req = (operation, raw = operation, kind = 'ordinary') => ({ operation, raw, kind, writer: 'v2', instance: 'tab1' });
const fresh = () => genesis('inc1', 'genesis');
test('localStorage equal generation permits lost update after validation (retained counterexample)', () => {
  const s = { generation: 0, raw: 'A' }, a = { ...s }, b = { ...s };
  const bothValidated = a.generation === s.generation && b.generation === s.generation;
  s.raw = 'B'; s.generation = b.generation + 1;
  s.raw = 'C'; s.generation = a.generation + 1;
  assert.equal(bothValidated, true); assert.deepEqual(s, { generation: 1, raw: 'C' });
});
test('uncooperative ABA and missing notifications cannot be detected by raw comparison', () => {
  let raw = 'A'; const expected = raw; raw = 'B'; raw = 'A';
  assert.equal(raw, expected); // observation proves neither absence of changes nor safe CAS
});
test('every split localStorage persistence prefix is an explicit mixed state', () => {
  const orders = [['raw', 'generation', 'receipt'], ['receipt', 'generation', 'raw']];
  for (const order of orders) for (let cut = 1; cut < order.length; cut++) {
    const s = { raw: 'A', generation: 0, receipt: 'g0' }, wanted = { raw: 'B', generation: 1, receipt: 'g1' };
    for (const key of order.slice(0, cut)) s[key] = wanted[key];
    assert.notDeepEqual(s, wanted); assert.notDeepEqual(s, { raw: 'A', generation: 0, receipt: 'g0' });
  }
});
test('serial atomic model rejects second same-token writer and late recovery', () => {
  const s = fresh(), expected = tokenOf(s), a = transition(s, expected, req('a'));
  assert.equal(a.status, 'PREPARED');
  for (const kind of ['ordinary', 'restore', 'recovery']) assert.equal(transition(a.next, expected, req('b', 'B', kind)).status, 'REFUSED');
});
test('generation plus incarnation plus operation rejects cooperative ABA and stale namespace', () => {
  const s = fresh(), t = tokenOf(s);
  const b = transition(s, t, req('b', 'B')).next;
  const a = transition(b, tokenOf(b), req('a', 'A')).next;
  assert.equal(a.raw, s.raw); assert.equal(transition(a, t, req('c')).status, 'REFUSED');
  assert.equal(transition(genesis('inc2', 'genesis'), t, req('c')).status, 'REFUSED');
});
test('missing or corrupt generation/history/copy/structure forces UNKNOWN', () => {
  const s = transition(fresh(), tokenOf(fresh()), req('a')).next;
  const mutations = [v => delete v.generation, v => v.history.pop(), v => v.history[0].raw = 'broken',
    v => v.copies[0].raw = 'different', v => v.operation = 'unknown', v => v.structure = 99,
    v => v.history[1].previous = 'bad', v => v.history[1].writer = '', v => delete v.copies];
  for (const mutate of mutations) { const v = structuredClone(s); mutate(v); assert.equal(inspect(v), 'UNKNOWN'); assert.equal(transition(v, tokenOf(s), req('b')).status, 'UNKNOWN'); }
  assert.equal(inspect(undefined), 'UNKNOWN');
});
test('all evidence deletion is indistinguishable from virgin store (retained limit)', () => {
  assert.equal(inspect(undefined), 'UNKNOWN');
  assert.equal(JSON.stringify(undefined), JSON.stringify(undefined)); // no external anchor can distinguish histories
});
test('restart commit receipt is separate from delivery and disk durability', () => {
  let s = transition(fresh(), tokenOf(fresh()), req('a')).next;
  s = transition(s, tokenOf(s), req('b')).next;
  assert.deepEqual(reconcile(structuredClone(s), 'a'), { status: 'COMMIT_RECORD_OBSERVED', generation: 1, acknowledgement: 'UNKNOWN', durability: 'NOT_PROVEN' });
  assert.equal(reconcile(s, 'missing').status, 'UNKNOWN');
  assert.equal(transition(s, tokenOf(s), req('a')).status, 'REFUSED');
});
test('overflow, stale token, reused ID and absent writer cannot silently restart generation', () => {
  const s = fresh();
  for (const r of [req('genesis'), { ...req('a'), writer: '' }, { ...req('a'), instance: '' }]) assert.equal(transition(s, tokenOf(s), r).status, 'REFUSED');
  assert.equal(transition(s, { ...tokenOf(s), generation: NaN }, req('a')).status, 'REFUSED');
  assert.equal(inspect({ ...s, generation: Number.MAX_SAFE_INTEGER + 1 }), 'UNKNOWN');
});
test('ordinary/restore/recovery use same transition, preserve exact raw and immutable old state', () => {
  for (const kind of ['ordinary', 'restore', 'recovery']) {
    const s = fresh(), before = JSON.stringify(s), next = transition(s, tokenOf(s), req(kind, ' {"n":1e0}\r\n', kind)).next;
    assert.equal(JSON.stringify(s), before); assert.equal(inspect(next), 'CONSISTENT');
    assert.equal(next.copies[0].raw, 'A'); assert.equal(next.raw, ' {"n":1e0}\r\n');
  }
  assert.equal(executionAllowed, false); assert.equal(HOLD, true);
});
