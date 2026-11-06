// Independent reviewer fixtures: expected states are constructed from the operation contract.
import { describe, it, expect } from 'vitest';
import { inspectSnapshot, validRaw, type Snapshot } from '../../e2e/fixtures/storage-idb';
const rawA = ' {"version":1,"history":[],"notes":[],"settings":{"theme":"system","activePanel":"history"},"extra":"A"} ';
const rawB = rawA.replace('"A"', '"B"');
const t0 = { structure: 1, incarnation: 'independent-inc', generation: 0, latestOperation: 'genesis' };
const t1 = { ...t0, generation: 1, latestOperation: 'save-1' };
function committed(): Snapshot {
  return {
    head: { ...t1, protocol: 1, legacyRaw: rawA }, current: rawB,
    control: { protocol: 1, state: 'CLEAR' },
    'receipt:genesis': { protocol: 1, token: t0, previous: null, raw: rawA },
    'receipt:save-1': { protocol: 1, token: t1, previous: 'genesis', raw: rawB },
    'copy:1': { protocol: 1, source: t0, operationId: 'save-1', raw: rawA },
    'intent:save-1': { protocol: 1, operationId: 'save-1', expected: t0, expectedRaw: rawA, candidateRaw: rawB, phase: 'READBACK_MATCH' },
  };
}
describe('independent Stage3B4 integrity counterexamples', () => {
  it('accepts the independently constructed valid chain and exact noncanonical JSON', () => {
    expect(validRaw(rawA)).toBe(true); expect(inspectSnapshot(committed())).toBe(null);
  });
  for (const field of ['current', 'copy:1', 'receipt:save-1', 'intent:save-1']) it(`rejects missing ${field}`, () => {
    const s = committed(); delete s[field]; expect(inspectSnapshot(s)).not.toBe(null);
  });
  it('rejects copied current whose bytes match semantically but not originally', () => {
    const s = committed(); (s['copy:1'] as {raw: string}).raw = rawA.trim(); expect(inspectSnapshot(s)).not.toBe(null);
  });
  for (const field of ['head', 'copy:1', 'receipt:save-1', 'control', 'intent:save-1']) it(`rejects unknown protocol in ${field}`, () => {
    const s = committed(); (s[field] as {protocol: number}).protocol = 2; expect(inspectSnapshot(s)).not.toBe(null);
  });
  it('rejects intent with a failure record relabeled as READBACK_MATCH', () => {
    const s = committed(); (s['intent:save-1'] as Record<string, unknown>).firstFailure = 'Error:lost-ack';
    expect(inspectSnapshot(s)).not.toBe(null);
  });
  it('rejects unknown diagnostic protocol instead of treating it as a known failure record', () => {
    const s = committed(); s['diagnostic:save-1'] = { protocol: 2, status: 'UNKNOWN', firstFailure: 'not-understood' };
    expect(inspectSnapshot(s)).not.toBe(null);
  });
  it('rejects receipt containing old incarnation despite identical raw', () => {
    const s = committed(); (s['receipt:save-1'] as {token: typeof t1}).token = { ...t1, incarnation: 'old-incarnation' };
    expect(inspectSnapshot(s)).not.toBe(null);
  });
});

import { scanWriterSources } from '../../e2e/storage-writer-boundary.mjs';
describe('independent isolated-adapter product import boundary', () => {
  for (const specifier of ['../e2e/fixtures/storage-idb', '@/e2e/fixtures/storage-idb', '/e2e/fixtures/storage-idb.ts']) {
    it(`rejects product import ${specifier}`, () => {
      const failures = scanWriterSources({ 'app/page.tsx': `import { createIsolatedAdapter } from '${specifier}'; export const adapter = createIsolatedAdapter('stage3b4-test-escape');` });
      expect(failures.some(x => x.rule === 'product-imports-excluded-source')).toBe(true);
    });
  }
});

it('rejects eager Vite glob imports of the isolated adapter into a product file', () => {
  const failures = scanWriterSources({ 'app/page.tsx': "export const fixture = import.meta.glob('/e2e/fixtures/storage-idb.ts', { eager: true });" });
  expect(failures.length).toBeGreaterThan(0);
});
