// Stage 3B-6: synthetic, read-only evidence reconciliation. Never imported by production.
import { details, hashRaw, inspectJournalRecords, HASH_ALGORITHM, type Branch } from './storage-migration';
import { inspectSnapshot, sameToken, tokenOf, validRaw, validToken, type Snapshot, type Token } from './storage-idb';

export type ReadEvidence<T> = { kind: 'present'; value: T } | { kind: 'absent' } | { kind: 'unavailable'; reason: string };
export type Capture = { source: ReadEvidence<string>; target: ReadEvidence<Snapshot>; journal: ReadEvidence<Snapshot> };
export type Scope = { source: string; destination: string };
export type State = 'CONSISTENT' | 'CONFLICT' | 'INCOMPLETE' | 'CORRUPTED' | 'UNKNOWN' | 'BLOCKED';
export type Finding = { state: Exclude<State, 'CONSISTENT'>; code: string; evidence: string[] };
export type Candidate = { evidence: string; raw: string; length: number; hash: string; hashAlgorithm: typeof HASH_ALGORITHM; ids: string[]; schemaValid: boolean; token: Token | null; receipt: string | null; rationale: string; executionAllowed: false };
export type Request = { scope: Scope; capture: Capture; previous?: Capture; requestedOperation?: string; captureChanged?: boolean };
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const validScope = (s: Scope) => !!s && /^stage3b5-test-[A-Za-z0-9_-]{1,120}$/.test(s.source) && /^stage3b4-test-[A-Za-z0-9_-]{1,120}$/.test(s.destination);
const snapshot = (r: ReadEvidence<Snapshot>) => r.kind === 'present' && object(r.value) ? r.value : null;
const priorities: State[] = ['CORRUPTED', 'CONFLICT', 'INCOMPLETE', 'UNKNOWN', 'BLOCKED'];

/** Freezes caller input before async hashing. Evidence consistency never grants authority. */
export async function reconcileEvidence(input: Request) {
  const request: Request = structuredClone(input);
  const findings: Finding[] = [], candidates: Candidate[] = [], knownCausality: string[] = [], unknownCausality: string[] = [];
  const usedEvidence: string[] = [], missingEvidence: string[] = [];
  const add = (state: Finding['state'], code: string, ...evidence: string[]) => findings.push({ state, code, evidence });
  if (!validScope(request.scope)) throw Error('synthetic-namespace-required');
  const { capture, previous } = request;
  for (const key of ['source', 'target', 'journal'] as const) {
    const r = capture[key];
    if (!r || !['present', 'absent', 'unavailable'].includes(r.kind)) { add('CORRUPTED', 'invalid-read-envelope', key); continue; }
    if (r.kind === 'unavailable') { add('UNKNOWN', 'read-unavailable:' + r.reason, key); missingEvidence.push(key); }
    else if (r.kind === 'absent') { add('INCOMPLETE', 'evidence-absent', key); missingEvidence.push(key); }
    else usedEvidence.push(key);
  }
  if (request.captureChanged) add('UNKNOWN', 'changed-during-read-no-atomic-cross-store-snapshot');
  if (request.requestedOperation) add('BLOCKED', 'stage3b-hold-forbids-operation:' + request.requestedOperation);
  const target = capture.target && snapshot(capture.target), journal = capture.journal && snapshot(capture.journal);
  let targetReason: string | null = null, journalReason: string | null = null;
  if (capture.target?.kind === 'present') {
    try { targetReason = target ? inspectSnapshot(target) : 'invalid-snapshot'; } catch { targetReason = 'invalid-snapshot'; }
    if (targetReason) add(targetReason === 'missing-or-extra-receipt' || targetReason === 'receipt-intent-missing' ? 'INCOMPLETE' : 'CORRUPTED', targetReason, 'target');
  }
  if (capture.journal?.kind === 'present') {
    journalReason = journal ? await inspectJournalRecords(journal, request.scope) : 'invalid-journal';
    if (journalReason) add('CORRUPTED', journalReason, 'journal');
  }
  async function candidate(evidence: string, raw: unknown, token: Token | null = null, receipt: string | null = null) {
    if (typeof raw !== 'string' || raw.length > 2_097_152) { add('CORRUPTED', 'invalid-or-oversized-raw', evidence); return; }
    const schemaValid = validRaw(raw);
    if (!schemaValid) add('CORRUPTED', 'raw-schema-invalid', evidence);
    candidates.push({ evidence, raw, length: raw.length, hash: await hashRaw(raw), hashAlgorithm: HASH_ALGORITHM, ids: details(raw).ids,
      schemaValid, token, receipt, rationale: schemaValid ? 'Readable preserved document for human comparison only; not an authority or selected winner.' : 'Damaged raw evidence only; not an executable recovery candidate.', executionAllowed: false });
  }
  if (capture.source?.kind === 'present') await candidate('source', capture.source.value);
  if (target) {
    const head = !targetReason && validToken(target.head) ? tokenOf(target.head) : null;
    await candidate('target.current', target.current, head, head?.latestOperation ?? null);
    if (object(target.control) && target.control.protocol === 1 && target.control.state === 'HOLD') add('BLOCKED', 'persistent-target-hold', 'target.control');
    if (!targetReason) {
      for (const [key, value] of Object.entries(target)) {
        if (key.startsWith('receipt:') && object(value) && validToken(value.token)) knownCausality.push(`${key}: ${String(value.previous)} -> ${value.token.latestOperation} at incarnation=${value.token.incarnation}, generation=${value.token.generation}`);
        if (key.startsWith('intent:') && object(value)) {
          // Even READBACK_MATCH is not evidence of outer coordinator completion.
          add('UNKNOWN', 'historical-intent-not-completion:' + String(value.phase), 'target.' + key);
          if (value.phase === 'PENDING' || value.phase === 'UNKNOWN') missingEvidence.push('completion:' + key);
        }
        if (key.startsWith('diagnostic:')) add('UNKNOWN', 'retained-target-unknown', 'target.' + key);
      }
      if (capture.source?.kind === 'present' && object(target.head) && capture.source.value !== target.head.legacyRaw) {
        add('CONFLICT', 'old-source-diverged-from-frozen-legacy', 'source', 'target.head.legacyRaw');
        unknownCausality.push('Old-source edit order and ancestry are not established by timestamps or equal content.');
      }
    }
  }
  if (journal && !journalReason) {
    for (const [key, value] of Object.entries(journal)) {
      if (!object(value)) continue;
      if (key.startsWith('diagnostic:')) add('UNKNOWN', 'retained-journal-unknown:' + String(value.reason), 'journal.' + key);
      if (key.startsWith('attempt:')) {
        if (!journal['receipt:' + value.migrationId]) { add('INCOMPLETE', 'migration-receipt-missing', 'journal.' + key); missingEvidence.push('journal.receipt:' + value.migrationId); }
        add('UNKNOWN', 'historical-migration-attempt-not-completion', 'journal.' + key);
      }
      if (key.startsWith('receipt:') && target && !targetReason) {
        const before = value.before as Token, after = value.after as Token;
        const retainedBefore = target['receipt:' + before.latestOperation], retainedAfter = target['receipt:' + after.latestOperation];
        if (!object(retainedBefore) || !object(retainedAfter) || !sameToken(retainedBefore.token, before) || !sameToken(retainedAfter.token, after) || retainedBefore.raw !== value.targetBeforeRaw || retainedAfter.raw !== value.sourceRaw || !object(target.head) || target.head.legacyRaw !== value.sourceRaw) add('CONFLICT', 'journal-target-receipt-disagreement', 'journal.' + key, 'target');
        else knownCausality.push('journal.' + key + ': exact before/after receipts retained in target; outer completion remains unknown.');
      }
      if (key.startsWith('rescue-attempt:')) {
        add('UNKNOWN', 'historical-rescue-attempt-not-completion', 'journal.' + key);
        if (!journal['rescue:' + value.rescueId]) {
          add('INCOMPLETE', 'rescue-capture-gap-no-durable-raw', 'journal.' + key);
          missingEvidence.push('uncaptured-source-value:' + value.rescueId);
          unknownCausality.push('Values overwritten before durable branch capture cannot be reconstructed from attempt metadata.');
        }
      }
      if (key.startsWith('rescue:')) for (const b of value.branches as Branch[]) {
        await candidate('journal.' + key + '.' + b.branchId, b.raw, b.generation, b.receipt);
        if (b.parent !== null) knownCausality.push(`${b.branchId}: retained target ancestor ${b.parent}; not source ancestry.`);
        else unknownCausality.push(b.branchId + ': parent not proved; preserve as a separate branch.');
      }
    }
  }
  if (previous) {
    // Checkpoints are separately retained observations, not a new storage authority/format.
    if (previous.source.kind === 'present' && !validRaw(previous.source.value)) add('CORRUPTED', 'invalid-previous-source', 'previous.source');
    if (previous.source.kind === 'present' && capture.source.kind === 'present' && previous.source.value !== capture.source.value) add('CONFLICT', 'source-changed-since-checkpoint', 'previous.source', 'source');
    const p = snapshot(previous.target);
    let pReason: string | null = null;
    try { pReason = p ? inspectSnapshot(p) : null; } catch { pReason = 'invalid-previous-snapshot'; }
    if (previous.target.kind === 'unavailable' || previous.journal.kind === 'unavailable' || previous.source.kind === 'unavailable') add('UNKNOWN', 'previous-observation-unavailable');
    if (pReason) add('CORRUPTED', 'invalid-previous-evidence:' + pReason, 'previous.target');
    if (p && !pReason && target && !targetReason && validToken(p.head) && validToken(target.head)) {
      if (p.head.incarnation !== target.head.incarnation) add('CONFLICT', 'incarnation-changed-not-inferred-authority', 'previous.target.head', 'target.head');
      else if (p.head.generation > target.head.generation) add('CONFLICT', 'generation-rollback-observed', 'previous.target.head', 'target.head');
      else if (p.head.generation === target.head.generation && (!sameToken(p.head, target.head) || !same(p, target))) add('CONFLICT', 'same-generation-evidence-conflict', 'previous.target', 'target');
      else if (p.head.generation < target.head.generation) {
        const retained = target['receipt:' + p.head.latestOperation];
        if (!object(retained) || !sameToken(retained.token, p.head) || retained.raw !== p.current) add('CONFLICT', 'checkpoint-not-retained-in-chain', 'previous.target', 'target');
        else knownCausality.push(p.current === target.current ? 'Same content, later generation: retained ABA history; not the same save.' : 'Checkpoint predecessor retained by exact receipt.');
      }
    }
    for (const key of ['source', 'target', 'journal'] as const) if (previous[key].kind === 'present' && capture[key]?.kind === 'absent') add('INCOMPLETE', 'previously-observed-store-disappeared', key);
    const pj = snapshot(previous.journal);
    if (pj) {
      const reason = await inspectJournalRecords(pj, request.scope);
      if (reason) add('CORRUPTED', 'invalid-previous-journal:' + reason, 'previous.journal');
      else if (journal && !journalReason) for (const [key, value] of Object.entries(pj)) {
        if (!Object.hasOwn(journal, key)) add('INCOMPLETE', 'append-only-journal-record-lost', 'journal.' + key);
        else if (!same(value, journal[key])) add('CONFLICT', 'append-only-journal-record-changed', 'journal.' + key);
      }
    }
  }
  unknownCausality.push('No cross-store atomicity or proof of unseen writes/rollback/ABA between observations. Hash equality proves content only, never authority.');
  const state = priorities.find(s => findings.some(f => f.state === s)) ?? 'CONSISTENT';
  return { state, findings, candidates, usedEvidence, missingEvidence: [...new Set(missingEvidence)], knownCausality, unknownCausality,
    subject: request.scope, evidence: capture, previousEvidence: previous ?? null,
    consistencyScope: 'Only supplied, bounded observations and retained causal records; not completion, durability, completeness of all history, or recovery permission.',
    authority: 'NOT_ESTABLISHED' as const, HOLD: true, executionAllowed: false as const, writeAllowed: false as const,
    prohibitedOperations: ['production migration', 'rescue execution', 'restore', 'merge', 'delete', 'overwrite', 'authority switch', 'automatic retry'],
    humanChecks: ['Preserve every branch and the exact raw evidence outside the affected store.', 'Check missing receipt, incarnation, and predecessor records without guessing.', 'Keep capture gaps and historical UNKNOWN; obtain independent evidence before any separately authorized recovery design.'],
  };
}

/** Opening an absent database aborts its upgrade; no store/record is created. */
export async function readSyntheticStore(name: string, storeName: 'records' | 'evidence', factory: IDBFactory = indexedDB): Promise<ReadEvidence<Snapshot>> {
  if (!/^stage3b4-test-[A-Za-z0-9_-]{1,160}$/.test(name)) throw Error('synthetic-namespace-required');
  return new Promise(resolve => {
    let absent = false, rejected = false;
    const req = factory.open(name);
    req.onupgradeneeded = () => { absent = true; req.transaction?.abort(); };
    req.onblocked = () => { rejected = true; resolve({ kind: 'unavailable', reason: 'read-open-blocked' }); };
    req.onerror = () => resolve(absent ? { kind: 'absent' } : { kind: 'unavailable', reason: String(req.error) });
    req.onsuccess = () => {
      const db = req.result;
      if (rejected) { db.close(); return; }
      if (db.version !== 1 || db.objectStoreNames.length !== 1 || !db.objectStoreNames.contains(storeName)) { db.close(); resolve({ kind: 'unavailable', reason: 'unexpected-store-schema' }); return; }
      try {
        const tx = db.transaction(storeName, 'readonly'), result: Snapshot = Object.create(null);
        const cursor = tx.objectStore(storeName).openCursor();
        cursor.onsuccess = () => { const c = cursor.result; if (c) { if (typeof c.key !== 'string') { tx.abort(); return; } result[c.key] = c.value; c.continue(); } };
        tx.oncomplete = () => { db.close(); resolve({ kind: 'present', value: result }); };
        tx.onabort = () => { db.close(); resolve({ kind: 'unavailable', reason: 'read-transaction-aborted' }); };
      } catch (e) { db.close(); resolve({ kind: 'unavailable', reason: String(e) }); }
    };
  });
}

export function createReadOnlyReconciler(options: { scope: Scope; getItem: (key: string) => string | null; factory?: IDBFactory }) {
  const scope = structuredClone(options.scope), get = options.getItem, factory = options.factory ?? globalThis.indexedDB;
  if (!validScope(scope)) throw Error('synthetic-namespace-required');
  let closed = false, epoch = 0;
  const source = (): ReadEvidence<string> => { try { const raw = get(scope.source); return raw === null ? { kind: 'absent' } : { kind: 'present', value: raw }; } catch (e) { return { kind: 'unavailable', reason: String(e) }; } };
  const capture = async (): Promise<Capture> => ({ source: source(), target: await readSyntheticStore(scope.destination, 'records', factory), journal: await readSyntheticStore(scope.destination + '-migration', 'evidence', factory) });
  return {
    async diagnose(previous?: Capture, requestedOperation?: string) {
      const token = epoch, frozen = previous ? structuredClone(previous) : undefined;
      if (closed) throw Error('diagnostic-session-closed');
      const first = await capture(), second = await capture();
      const report = await reconcileEvidence({ scope, capture: first, previous: frozen, requestedOperation, captureChanged: !same(first, second) });
      if (closed || token !== epoch) throw Error('diagnostic-session-invalidated');
      return report;
    },
    close() { closed = true; epoch++; },
  };
}
