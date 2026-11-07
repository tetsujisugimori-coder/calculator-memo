import { describe, expect, it } from 'vitest';
import { reconcileEvidence, createReadOnlyReconciler, type Capture, type Request } from '../e2e/fixtures/storage-reconciliation';
import { hashRaw, HASH_ALGORITHM } from '../e2e/fixtures/storage-migration';
import { inspectSnapshot, type Snapshot, type Token } from '../e2e/fixtures/storage-idb';
export const raw = (text: string) => ` \n{"version":1,"history":[],"notes":[],"settings":{"theme":"light","activePanel":"history"},"unknown":"${text}","n":9007199254740993123}\t`;
export const A = raw('A'), B = raw('B'), C = raw('C');
export const t0: Token = { structure: 1, incarnation: 'synthetic', generation: 0, latestOperation: 'genesis' };
export const scope = { source: 'stage3b5-test-source', destination: 'stage3b4-test-dest' };
export const present = <T>(value: T) => ({ kind: 'present' as const, value });
export function genesis(value = A): Snapshot {
  return { head: { ...t0, protocol: 1, legacyRaw: A }, current: value, control: { protocol: 1, state: 'CLEAR' }, 'receipt:genesis': { protocol: 1, token: t0, previous: null, raw: value } };
}
export function updated(value = B): Snapshot {
  const t1 = { ...t0, generation: 1, latestOperation: 'm' };
  return { ...genesis(), head: { ...t1, protocol: 1, legacyRaw: A }, current: value,
    'receipt:m': { protocol: 1, token: t1, previous: 'genesis', raw: value },
    'copy:1': { protocol: 1, source: t0, operationId: 'm', raw: A },
    'intent:m': { protocol: 1, operationId: 'm', expected: t0, expectedRaw: A, candidateRaw: value, phase: 'READBACK_MATCH' } };
}
export const capture = (target = genesis(), journal: Snapshot = {}): Capture => ({ source: present(A), target: present(target), journal: present(journal) });
const request = (c = capture()): Request => ({ scope, capture: c });
const codes = (r: Awaited<ReturnType<typeof reconcileEvidence>>) => r.findings.map(f => f.code);
const attempt = { protocol: 1, state: 'VALIDATING', migrationId: 'm', ...scope };
const rescueAttempt = { protocol: 1, state: 'PENDING', rescueId: 'r', ...scope };

describe('Stage 3B-6 observed consistency is not recovery authority', () => {
  it('retains raw, UTF16 hash, generation and immutable input, never a winner', async () => {
    const input = request(), before = structuredClone(input);
    const r = await reconcileEvidence(input);
    expect(r.state).toBe('CONSISTENT'); expect(r.executionAllowed).toBe(false); expect(r.HOLD).toBe(true);
    expect(r.authority).toBe('NOT_ESTABLISHED'); expect(r.candidates).toHaveLength(2);
    expect(r.candidates[0]).toMatchObject({ raw: A, length: A.length, hash: await hashRaw(A), token: null });
    expect(r.candidates[1].token).toEqual(t0); expect(input).toEqual(before);
  });
  it('freezes supplied evidence before asynchronous work', async () => {
    const input = request(), pending = reconcileEvidence(input); input.capture.source = present(B);
    expect((await pending).candidates[0].raw).toBe(A);
  });
  it.each(['restore', 'merge', 'migration', 'retry'])('blocks %s while preserving unknown facts', async operation => {
    const input = request(); input.capture.target = { kind: 'unavailable', reason: 'QuotaExceededError' }; input.requestedOperation = operation;
    const r = await reconcileEvidence(input); expect(r.state).toBe('UNKNOWN');
    expect(r.findings.map(f => f.state)).toEqual(expect.arrayContaining(['BLOCKED', 'UNKNOWN'])); expect(r.executionAllowed).toBe(false);
  });
  it.each(['source', 'target', 'journal'] as const)('absence of %s cannot be consistent', async key => {
    const input = request(); input.capture[key] = { kind: 'absent' };
    expect((await reconcileEvidence(input)).state).toBe('INCOMPLETE');
  });
  it('whole store disappearance keeps previous evidence and missing reasons', async () => {
    const r = await reconcileEvidence({ scope, capture: { source: { kind: 'absent' }, target: { kind: 'absent' }, journal: { kind: 'absent' } }, previous: capture() });
    expect(r.state).toBe('INCOMPLETE'); expect(r.previousEvidence).toEqual(capture());
    expect(codes(r).filter(x => x === 'previously-observed-store-disappeared')).toHaveLength(3);
  });
  it('read changed and closed stale requests cannot report success', async () => {
    expect((await reconcileEvidence({ ...request(), captureChanged: true })).state).toBe('UNKNOWN');
    const reconciler = createReadOnlyReconciler({ scope, getItem: () => A }); reconciler.close();
    await expect(reconciler.diagnose()).rejects.toThrow('closed');
  });
});

describe('fault evidence and causal history', () => {
  it.each(['before receipt', 'after primary write response lost', 'quota'])('missing migration receipt after %s remains incomplete plus unknown', async reason => {
    const r = await reconcileEvidence(request(capture(updated(), { 'attempt:m': attempt, 'diagnostic:m': { protocol: 1, state: 'UNKNOWN', reason } })));
    expect(r.state).toBe('INCOMPLETE'); expect(codes(r)).toContain('migration-receipt-missing');
    expect(r.findings.some(f => f.state === 'UNKNOWN')).toBe(true);
  });
  it('receipt exists but source-before differs from target receipt: conflict, not repaired', async () => {
    const empty = JSON.stringify({ version: 1, history: [], notes: [], settings: { theme: 'light', activePanel: 'history' } });
    const journal = { 'attempt:m': attempt, 'receipt:m': { protocol: 1, migrationId: 'm', state: 'VERIFIED', sourceRaw: B, targetBeforeRaw: empty, before: t0, after: { ...t0, generation: 1, latestOperation: 'm' }, hashAlgorithm: HASH_ALGORITHM, hash: await hashRaw(B) } };
    const r = await reconcileEvidence(request(capture(updated(), journal)));
    expect(codes(r)).toContain('journal-target-receipt-disagreement'); expect(r.state).toBe('CONFLICT');
  });
  it('retains UNKNOWN after restart and readable receipts', async () => {
    const c = capture(updated(), { 'diagnostic:m': { protocol: 1, state: 'UNKNOWN', reason: 'lost response' } });
    const first = await reconcileEvidence(request(c)), next = await reconcileEvidence({ scope, capture: structuredClone(c), previous: c });
    expect(first.state).toBe('UNKNOWN'); expect(next.state).toBe('UNKNOWN'); expect(next.findings).toEqual(first.findings);
  });
  it('snapshot HOLD never hides a missing receipt or source uncertainty', async () => {
    const s = updated(); s.control = { protocol: 1, state: 'HOLD' }; delete s['receipt:m'];
    const c = capture(s); c.source = { kind: 'unavailable', reason: 'denied' };
    const r = await reconcileEvidence({ scope, capture: c, requestedOperation: 'restore' });
    expect(r.findings.map(f => f.state)).toEqual(expect.arrayContaining(['INCOMPLETE', 'UNKNOWN', 'BLOCKED']));
  });
  it('valid snapshot with pending interrupted intent preserves ambiguity', async () => {
    const s = genesis(); s['intent:m'] = { protocol: 1, operationId: 'm', expected: t0, expectedRaw: A, candidateRaw: B, phase: 'PENDING' };
    expect(inspectSnapshot(s)).toBe(null);
    expect(codes(await reconcileEvidence(request(capture(s))))).toContain('historical-intent-not-completion:PENDING');
  });
  it('rollback is detected from separate retained checkpoint, not time', async () => {
    const r = await reconcileEvidence({ scope, capture: capture(), previous: capture(updated()) });
    expect(r.state).toBe('CONFLICT'); expect(codes(r)).toContain('generation-rollback-observed');
  });
  it('ABA equal raw keeps generation and does not infer same save', async () => {
    const r = await reconcileEvidence({ scope, capture: capture(updated(A)), previous: capture() });
    expect(r.knownCausality.some(s => s.includes('ABA'))).toBe(true); expect(r.state).toBe('UNKNOWN');
  });
  it('late old source edit remains a separate candidate without authority', async () => {
    const c = capture(updated()); c.source = present(C);
    const r = await reconcileEvidence({ scope, capture: c }); expect(r.state).toBe('CONFLICT');
    expect(r.candidates.map(c => c.raw)).toEqual([C, B]); expect(r.candidates[0].token).toBe(null);
  });
  it('lost append-only evidence is incomplete despite valid current', async () => {
    const previous = capture(genesis(), { 'diagnostic:d': { protocol: 1, state: 'UNKNOWN', reason: 'quota' } });
    const r = await reconcileEvidence({ scope, capture: capture(), previous });
    expect(codes(r)).toContain('append-only-journal-record-lost'); expect(r.state).toBe('INCOMPLETE');
  });
  it('captured B lost before commit cannot be reconstructed from attempt', async () => {
    const c = capture(genesis(), { 'rescue-attempt:r': rescueAttempt, 'diagnostic:r': { protocol: 1, state: 'UNKNOWN', reason: 'rescue-source-or-target-changed' } }); c.source = present(C);
    const r = await reconcileEvidence(request(c)); expect(codes(r)).toContain('rescue-capture-gap-no-durable-raw');
    expect(r.candidates.some(x => x.raw === B)).toBe(false); expect(r.missingEvidence).toContain('uncaptured-source-value:r');
  });
  it('all separate recorded branches retained with verified raw hashes and unknown parents', async () => {
    const branches = await Promise.all([['OLD_LOCAL_STORAGE', A, 'old'], ['ISOLATED_IDB', B, 'idb']].map(async ([origin, raw, suffix]) => ({ branchId: 'r-' + suffix, origin, raw, hash: await hashRaw(raw), hashAlgorithm: HASH_ALGORITHM, schemaValid: true, ids: [], generation: origin === 'ISOLATED_IDB' ? { ...t0, generation: 1, latestOperation: 'm' } : null, receipt: origin === 'ISOLATED_IDB' ? 'm' : null, parent: null })));
    const journal = { 'rescue-attempt:r': rescueAttempt, 'rescue:r': { protocol: 1, rescueId: 'r', ...scope, branches, targetEvidence: updated(), executionAllowed: false } };
    const r = await reconcileEvidence(request(capture(updated(), journal))); expect(r.candidates).toHaveLength(4);
    expect(r.candidates.filter(x => x.evidence.startsWith('journal')).map(x => x.raw)).toEqual([A, B]);
    branches[0].hash = '0'.repeat(64);
    const broken = await reconcileEvidence(request(capture(updated(), journal))); expect(broken.state).toBe('CORRUPTED'); expect(broken.candidates).toHaveLength(2);
  });
  it.each([
    (s: Snapshot) => { s.current = '{broken'; },
    (s: Snapshot) => { s.current = B; },
    (s: Snapshot) => { (s.head as Token).incarnation = 'other'; },
    (s: Snapshot) => { (s['receipt:genesis'] as { raw: string }).raw = B; },
  ])('corruption never reports consistency %#', async mutate => {
    const s = genesis(); mutate(s); expect((await reconcileEvidence(request(capture(s)))).state).toBe('CORRUPTED');
  });
  it('rejects production scope before touching storage', async () => {
    let read = 0;
    expect(() => createReadOnlyReconciler({ scope: { ...scope, source: 'calculation-memo:data' }, getItem() { read++; return A; } })).toThrow('synthetic');
    expect(read).toBe(0);
  });
});
