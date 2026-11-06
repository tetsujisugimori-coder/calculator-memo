import { it, expect } from 'vitest';
import { webcrypto } from 'node:crypto';
import { inspectJournalRecords, hashRaw, HASH_ALGORITHM } from '../e2e/fixtures/storage-migration';
Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto });
const E = '{"version":1,"history":[],"notes":[],"settings":{"theme":"light","activePanel":"history"}}';
const A = E + '\n';
const before = { structure: 1, incarnation: 'independent', generation: 0, latestOperation: 'genesis' };
async function migration() {
  return { 'attempt:m': { protocol: 1, migrationId: 'm', state: 'VALIDATING', source: 'stage3b5-test-source', destination: 'stage3b4-test-target' },
    'receipt:m': { protocol: 1, migrationId: 'm', state: 'VERIFIED', sourceRaw: A, targetBeforeRaw: E, before: { ...before }, after: { ...before, generation: 1, latestOperation: 'm' }, hash: await hashRaw(A), hashAlgorithm: HASH_ALGORITHM } };
}
it('independent positive control: internally valid migration journal', async () => expect(await inspectJournalRecords(await migration())).toBeNull());
it('independent negative control: raw hash mismatch must reject', async () => { const s = await migration(); s['receipt:m'].sourceRaw += '\t'; expect(await inspectJournalRecords(s)).not.toBeNull(); });
it('independent counterexample: impossible non-genesis generation-zero receipt must reject', async () => { const s = await migration(); s['receipt:m'].before.latestOperation = 'invented'; expect(await inspectJournalRecords(s)).not.toBeNull(); });
it('independent counterexample: migration evidence for production namespace must reject', async () => { const s = await migration(); s['attempt:m'].source = 'calculation-memo:data'; expect(await inspectJournalRecords(s)).not.toBeNull(); });
