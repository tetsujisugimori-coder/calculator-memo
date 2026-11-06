import { describe, expect, it } from 'vitest';
import { createIsolatedAdapter, inspectSnapshot, sameToken, validRaw, validToken, type Snapshot } from '../../e2e/fixtures/storage-idb';
const raw = ' \n{"version":1,"history":[],"notes":[],"settings":{"theme":"light","activePanel":"history"},"future":9007199254740993001}\t';
const token = { structure: 1 as const, incarnation: 'synthetic-incarnation', generation: 0, latestOperation: 'genesis' };
const genesis = (): Snapshot => ({ head: { ...token, protocol: 1, legacyRaw: raw }, current: raw,
  control: { protocol: 1, state: 'CLEAR' }, 'receipt:genesis': { protocol: 1, token: { ...token }, previous: null, raw } });
describe('isolated IndexedDB contracts', () => {
  it('strictly validates v1 without normalizing unknown bytes', () => {
    expect(validRaw(raw)).toBe(true); expect(inspectSnapshot(genesis())).toBe(null);
  });
  for (const value of [null, '', '{}', '{"version":2}', '{"version":1,"version":1}', raw.replace('"history":[]', '"history":[{}]'), raw.replace('"notes":[]', '"notes":[{}]'), ' '.repeat(2_097_153)]) {
    it('rejects malformed, unknown, lossy or oversized raw ' + String(value).slice(0, 30), () => expect(validRaw(value)).toBe(false));
  }
  for (const [key, value] of [['structure', 2], ['incarnation', ''], ['generation', -1], ['generation', 0.1], ['generation', Number.MAX_SAFE_INTEGER + 1], ['generation', NaN], ['latestOperation', 'bad id']]) {
    it('rejects invalid persistent token ' + key + String(value), () => expect(validToken({ ...token, [key]: value })).toBe(false));
  }
  it('compares all four ABA-relevant token fields', () => {
    expect(sameToken(token, { ...token })).toBe(true);
    for (const changed of [{ structure: 2 }, { incarnation: 'old' }, { generation: 1 }, { latestOperation: 'later' }]) expect(sameToken(token, { ...token, ...changed })).toBe(false);
  });
  it('checks whole-chain generation rather than raw equality', () => {
    const s = genesis(); (s.head as typeof token).generation = Number.MAX_SAFE_INTEGER;
    expect(inspectSnapshot(s)).toBe('missing-or-extra-receipt');
  });
  for (const field of ['head', 'current', 'control', 'receipt:genesis']) it('fails closed on missing ' + field, () => {
    const s = genesis(); delete s[field]; expect(inspectSnapshot(s)).not.toBe(null);
  });
  it('does not accept unexplained extra persisted records', () => {
    const s = genesis(); s.unknown = { status: 'SUCCESS' }; expect(inspectSnapshot(s)).toBe('unknown-record');
  });
  it('cannot instantiate a production or traversal namespace', () => {
    for (const name of ['calculation-memo', 'stage3b4-test-', 'stage3b4-test-../prod', 'stage3b4-test-a/b']) expect(() => createIsolatedAdapter(name)).toThrow('synthetic-namespace-required');
  });
  it('readonly open failure gives UNKNOWN and no write permission', async () => {
    const calls: string[] = [];
    const factory = { open(name: string) { calls.push(name); throw new DOMException('isolated denial', 'SecurityError'); } } as unknown as IDBFactory;
    const adapter = createIsolatedAdapter('stage3b4-test-denial', { factory });
    const r = await adapter.inspect(raw);
    expect(r.state).toBe('UNKNOWN'); expect(r.writeAllowed).toBe(false); expect(r.executionAllowed).toBe(false);
    expect(calls).toEqual(['stage3b4-test-denial']);
    expect((await adapter.save({ protocol: 1, expected: token, expectedRaw: raw, candidateRaw: raw, operationId: 'never-write', legacyRaw: raw })).status).toBe('BLOCKED');
    expect(calls).toHaveLength(1);
  });
});
