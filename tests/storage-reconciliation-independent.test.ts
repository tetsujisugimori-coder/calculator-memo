import { describe, it, expect } from 'vitest';
import { createReadOnlyReconciler, reconcileEvidence, type Capture } from '../e2e/fixtures/storage-reconciliation';
import type { Snapshot } from '../e2e/fixtures/storage-idb';

const raw = JSON.stringify({ version: 1, history: [], notes: [], settings: { theme: 'light', activePanel: 'history' }, independent: 'untouched-\uD800' });
const scope = { source: 'stage3b5-test-independent', destination: 'stage3b4-test-independent' };
const token = { structure: 1, incarnation: 'independent', generation: 0, latestOperation: 'genesis' };
const present = <T>(value: T) => ({ kind: 'present' as const, value });
function capture(): Capture {
  return { source: present(raw), journal: present({}), target: present({ current: raw, head: { ...token, protocol: 1, legacyRaw: raw }, control: { protocol: 1, state: 'CLEAR' }, 'receipt:genesis': { protocol: 1, token, previous: null, raw } }) };
}
const values = (c: Capture, key: 'target' | 'journal') => (c[key] as { kind: 'present'; value: Snapshot }).value;

describe('independent Stage 3B-6 counterexamples', () => {
  it('positive: identical independent genesis remains bounded consistency only', async () => {
    const result = await reconcileEvidence({ scope, capture: capture() });
    expect(result.state).toBe('CONSISTENT');
    expect(result).toMatchObject({ HOLD: true, executionAllowed: false, writeAllowed: false, authority: 'NOT_ESTABLISHED' });
    expect(result.candidates).toHaveLength(2);
    expect(result.candidates[0]).toMatchObject({ raw, token: null, receipt: null });
  });
  it('R1: synchronous IndexedDB SecurityError must be reported UNKNOWN, not lose the report', async () => {
    let opens = 0;
    const factory = { databases: async () => [{ name: scope.destination, version: 1 }, { name: scope.destination + '-migration', version: 1 }], open() { opens++; throw new DOMException('Synthetic denied storage', 'SecurityError'); } } as unknown as IDBFactory;
    const reader = createReadOnlyReconciler({ scope, getItem: () => raw, factory });
    const result = await reader.diagnose();
    expect(result.state).toBe('UNKNOWN');
    expect(opens).toBe(4);
    expect(result.missingEvidence).toEqual(expect.arrayContaining(['target', 'journal']));
  });
  it.each(['target', 'journal'] as const)('R2: corrupt retained %s capture cannot be silently ignored as CONSISTENT', async key => {
    const previous = capture();
    previous[key] = present(null) as unknown as Capture[typeof key];
    const result = await reconcileEvidence({ scope, capture: capture(), previous });
    expect(result.state).not.toBe('CONSISTENT');
    expect(result.findings.some(f => f.state === 'CORRUPTED')).toBe(true);
  });
  it('R3: a missing receipt must not hide an explicit retained target UNKNOWN', async () => {
    const c = capture(), target = values(c, 'target');
    target['diagnostic:denied'] = { protocol: 1, status: 'UNKNOWN', firstFailure: 'Synthetic quota failure' };
    target.control = { protocol: 1, state: 'HOLD' };
    delete target['receipt:genesis'];
    const result = await reconcileEvidence({ scope, capture: c });
    expect(result.findings.map(f => f.state)).toEqual(expect.arrayContaining(['INCOMPLETE', 'UNKNOWN', 'BLOCKED']));
  });
  it('R3: unrelated corrupt journal record must not hide pending rescue capture gap', async () => {
    const c = capture(), journal = values(c, 'journal');
    journal['rescue-attempt:independent'] = { protocol: 1, state: 'PENDING', rescueId: 'independent', ...scope };
    journal['diagnostic:bad'] = { protocol: 17, state: 'UNKNOWN', reason: 'broken version' };
    const result = await reconcileEvidence({ scope, capture: c });
    expect(result.state).toBe('CORRUPTED');
    expect(result.findings.map(f => f.code)).toContain('rescue-capture-gap-no-durable-raw');
    expect(result.missingEvidence).toContain('uncaptured-source-value:independent');
  });
});

// A valid prior append-only record is independently actionable even when a different current record is damaged.
describe('independent mixed checkpoint evidence', () => {
  it('R3 extension: unrelated current journal corruption cannot hide a known prior record loss', async () => {
    const previous = capture(), current = capture();
    values(previous, 'journal')['diagnostic:retained'] = { protocol: 1, state: 'UNKNOWN', reason: 'previous retained observation' };
    values(current, 'journal')['diagnostic:broken'] = { protocol: 99, state: 'UNKNOWN', reason: 'unrelated corrupt record' };
    const result = await reconcileEvidence({ scope, capture: current, previous });
    expect(result.state).toBe('CORRUPTED');
    expect(result.findings.map(f => f.code)).toContain('append-only-journal-record-lost');
  });
});

describe('R6 absent database read is not a create request', () => {
  it('uses the database inventory and never opens absent names', async () => {
    let opens = 0;
    const factory = { databases: async () => [], open() { opens++; throw Error('must not open absent database'); } } as unknown as IDBFactory;
    const result = await createReadOnlyReconciler({ scope, getItem: () => raw, factory }).diagnose();
    expect(result.state).toBe('INCOMPLETE');
    expect(opens).toBe(0);
  });
  it('missing inventory API stays UNKNOWN and never probes with open', async () => {
    let opens = 0;
    const factory = { open() { opens++; throw Error('must not probe absent database'); } } as unknown as IDBFactory;
    const result = await createReadOnlyReconciler({ scope, getItem: () => raw, factory }).diagnose();
    expect(result.state).toBe('UNKNOWN');
    expect(opens).toBe(0);
  });
});
