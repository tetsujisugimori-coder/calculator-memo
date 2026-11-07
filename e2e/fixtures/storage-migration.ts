// Synthetic-only migration experiment. No product writer or authority imports.
import { createIsolatedAdapter, inspectSnapshot, sameToken, tokenOf, validRaw, validToken, type Options as AdapterOptions, type Snapshot, type Token } from './storage-idb';

export type MigrationState = 'NOT_STARTED' | 'VALIDATING' | 'READY' | 'MIGRATING' | 'VERIFIED' | 'CONFLICT' | 'BLOCKED' | 'UNKNOWN' | 'FAILED';
export type BaseEvidence = { sourceRaw: string; targetRaw: string; targetToken: Token };
export type Classification = 'ABSENT' | 'SAME' | 'ONLY_OLD' | 'ONLY_IDB' | 'UNCHANGED' | 'SOURCE_ONLY_CHANGE' | 'TARGET_ONLY_CHANGE' | 'BOTH_CHANGED' | 'UNKNOWN';
export type Source = { key: string; getItem: (key: string) => string | null };
export type MigrationRequest = { migrationId: string; expectedSourceRaw: string; expectedTargetToken: Token; expectedTargetRaw: string };
export type MigrationOptions = { source: Source; targetName: string; factory?: IDBFactory; adapterOptions?: AdapterOptions; fault?: (point: string) => void | Promise<void> };
export type Outcome = { state: MigrationState; reason: string; executionAllowed: false; phases: MigrationState[] };
export type Branch = { branchId: string; origin: 'OLD_LOCAL_STORAGE' | 'ISOLATED_IDB'; raw: string; hash: string; hashAlgorithm: 'SHA-256/UTF-16LE-code-units'; schemaValid: boolean; ids: string[]; generation: Token | null; receipt: string | null; parent: string | null };
const id = (x: unknown): x is string => typeof x === 'string' && /^[A-Za-z0-9_-]{1,120}$/.test(x);
const obj = (x: unknown): x is Record<string, unknown> => x !== null && typeof x === 'object' && !Array.isArray(x);
const err = (e: unknown) => e instanceof Error ? e.message : String(e);
const MAX_RAW = 2_097_152, MAX_RECORDS = 32, MAX_UNITS = 8_388_608;
export const HASH_ALGORITHM = 'SHA-256/UTF-16LE-code-units' as const;
/** Explicit little-endian UTF-16 code units, no BOM, normalization or surrogate replacement. */
export async function hashRaw(raw: string): Promise<string> {
  const bytes = new Uint8Array(raw.length * 2);
  for (let i = 0; i < raw.length; i++) { const c = raw.charCodeAt(i); bytes[i * 2] = c & 255; bytes[i * 2 + 1] = c >>> 8; }
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), x => x.toString(16).padStart(2, '0')).join('');
}
function verifiedBase(s: Snapshot, b?: BaseEvidence): boolean {
  if (!b || inspectSnapshot(s) || !validToken(b.targetToken)) return false;
  const h = s.head as Token & { legacyRaw: string }, r = s['receipt:' + b.targetToken.latestOperation];
  return obj(r) && sameToken(r.token, b.targetToken) && r.raw === b.targetRaw && b.sourceRaw === h.legacyRaw && b.targetToken.incarnation === h.incarnation && b.targetToken.generation <= h.generation;
}
/** Raw equality is an observation, never causal authority. Base must match retained receipt and frozen legacy evidence. */
export function classifyBranches(sourceRaw: string | null | undefined, target: Snapshot | null | undefined, base?: BaseEvidence): Classification {
  if (sourceRaw === undefined || target === undefined || sourceRaw !== null && !validRaw(sourceRaw) || target !== null && inspectSnapshot(target)) return 'UNKNOWN';
  if (sourceRaw === null && target === null) return 'ABSENT';
  if (target === null) return 'ONLY_OLD';
  if (sourceRaw === null) return 'ONLY_IDB';
  if (sourceRaw === target.current) return 'SAME';
  if (!verifiedBase(target, base)) return 'UNKNOWN';
  const oldChanged = sourceRaw !== base!.sourceRaw;
  const newChanged = target.current !== base!.targetRaw || !sameToken(target.head, base!.targetToken);
  return oldChanged ? newChanged ? 'BOTH_CHANGED' : 'SOURCE_ONLY_CHANGE' : newChanged ? 'TARGET_ONLY_CHANGE' : 'UNCHANGED';
}
export function isEmptyDestination(raw: unknown): boolean {
  if (!validRaw(raw)) return false;
  const v = JSON.parse(raw);
  return Object.keys(v).sort().join(',') === 'history,notes,settings,version' && v.version === 1 && v.history.length === 0 && v.notes.length === 0 && Object.keys(v.settings).sort().join(',') === 'activePanel,theme' && v.settings.theme === 'light' && v.settings.activePanel === 'history';
}
export function details(raw: unknown) {
  if (!validRaw(raw)) return { valid: false, ids: [] as string[], counts: {} as Record<string, number> };
  const parsed = JSON.parse(raw), ids: string[] = [], counts: Record<string, number> = {};
  const collections: [string, string, unknown[]][] = [
    ['history', 'history', parsed.history], ['notes', 'notes', parsed.notes],
    ['formulas', 'formulaLibrary.entries', parsed.formulaLibrary?.entries ?? []],
    ['reports', 'formulaReports.entries', parsed.formulaReports?.entries ?? []],
    ['executions', 'formulaExecutions', parsed.formulaExecutions ?? []],
  ];
  for (const [countName, path, entries] of collections) {
    counts[countName] = entries.length;
    for (const item of entries) if (obj(item)) {
      if (countName === 'executions' && typeof item.formulaId === 'string') ids.push(path + ':formulaId:' + item.formulaId);
      else if (typeof item.id === 'string') ids.push(path + ':' + item.id);
    }
  }
  return { valid: true, ids, counts };
}
/** Validates saved evidence without upgrading it to migration or restore authority. */
export function journalRequiresHold(records: Snapshot): boolean {
  return Object.keys(records).some(key => key.startsWith('attempt:') || key.startsWith('rescue-attempt:') || key.startsWith('diagnostic:'));
}
export async function inspectJournalRecords(records: Snapshot, expectedScope?: { source: string; destination: string }): Promise<string | null> {
  try {
    let scope = expectedScope;
    for (const [key, value] of Object.entries(records)) {
      if (!key.startsWith('attempt:') && !key.startsWith('rescue-attempt:') && !key.startsWith('rescue:') && !(obj(value) && ('source' in value || 'destination' in value))) continue;
      if (!obj(value) || typeof value.source !== 'string' || !value.source.startsWith('stage3b5-test-') || !id(value.source.slice(14)) || typeof value.destination !== 'string' || !value.destination.startsWith('stage3b4-test-') || !id(value.destination.slice(14))) return 'invalid-journal-namespace';
      if (scope && (scope.source !== value.source || scope.destination !== value.destination)) return 'journal-scope-mismatch';
      scope = { source: value.source, destination: value.destination };
    }
    for (const [key, value] of Object.entries(records)) {
      if (!obj(value) || value.protocol !== 1) return 'invalid-journal-record';
      if (key.startsWith('attempt:')) {
        if (!id(value.migrationId) || value.migrationId === 'genesis' || key !== 'attempt:' + value.migrationId || value.state !== 'VALIDATING' || typeof value.source !== 'string' || typeof value.destination !== 'string') return 'invalid-migration-attempt';
      } else if (key.startsWith('receipt:')) {
        if (!id(value.migrationId) || key !== 'receipt:' + value.migrationId || value.state !== 'VERIFIED' || !records['attempt:' + value.migrationId] || !validRaw(value.sourceRaw) || !isEmptyDestination(value.targetBeforeRaw) || !validToken(value.before) || !validToken(value.after) || value.before.generation !== 0 || value.before.latestOperation !== 'genesis' || value.after.generation !== 1 || value.before.incarnation !== value.after.incarnation || value.after.latestOperation !== value.migrationId || value.hashAlgorithm !== HASH_ALGORITHM || value.hash !== await hashRaw(value.sourceRaw)) return 'invalid-migration-receipt';
      } else if (key.startsWith('diagnostic:')) {
        if (value.state !== 'UNKNOWN' || typeof value.reason !== 'string') return 'invalid-journal-diagnostic';
      } else if (key.startsWith('rescue-attempt:')) {
        if (!id(value.rescueId) || key !== 'rescue-attempt:' + value.rescueId || value.state !== 'PENDING') return 'invalid-rescue-attempt';
      } else if (key.startsWith('rescue:')) {
        if (!id(value.rescueId) || key !== 'rescue:' + value.rescueId || !records['rescue-attempt:' + value.rescueId] || value.executionAllowed !== false || !Array.isArray(value.branches) || value.branches.length < 1 || value.branches.length > 2) return 'invalid-rescue-record';
        const origins = new Set<string>();
        for (const b of value.branches) {
          if (!obj(b) || !['OLD_LOCAL_STORAGE', 'ISOLATED_IDB'].includes(String(b.origin)) || origins.has(String(b.origin)) || typeof b.raw !== 'string' || b.raw.length > MAX_RAW || b.hashAlgorithm !== HASH_ALGORITHM || b.hash !== await hashRaw(b.raw) || b.schemaValid !== validRaw(b.raw) || JSON.stringify(b.ids) !== JSON.stringify(details(b.raw).ids)) return 'invalid-rescue-branch';
          origins.add(String(b.origin));
          if (b.branchId !== value.rescueId + (b.origin === 'OLD_LOCAL_STORAGE' ? '-old' : '-idb')) return 'invalid-branch-id';
          if (b.origin === 'OLD_LOCAL_STORAGE') {
            if (b.generation !== null || b.receipt !== null || b.parent !== null) return 'inferred-source-causality';
          } else {
            if (!obj(value.targetEvidence) || value.targetEvidence.current !== b.raw) return 'missing-target-evidence';
            if (b.generation !== null) {
              if (inspectSnapshot(value.targetEvidence) || !sameToken(b.generation, value.targetEvidence.head) || !validToken(b.generation) || b.receipt !== b.generation.latestOperation) return 'invalid-branch-generation';
              if (b.parent !== null) {
                const parent = value.targetEvidence['receipt:' + b.parent];
                if (!obj(parent) || !validToken(parent.token) || parent.token.generation >= b.generation.generation) return 'invalid-branch-parent';
              }
            } else if (b.receipt !== null || b.parent !== null) return 'unverified-branch-causality';
          }
        }
      } else return 'unknown-journal-record';
    }
    return null;
  } catch { return 'journal-validation-unavailable'; }
}
// A distinct companion database: never adds unrecognized records to Stage 3B-4's store.
function journal(name: string, factory: IDBFactory, scope: { source: string; destination: string }) {
  async function open(create: boolean): Promise<IDBDatabase | null> {
    return new Promise((resolve, reject) => {
      let absent = false;
      const r = factory.open(name, 1);
      r.onupgradeneeded = () => { if (!create) { absent = true; r.transaction!.abort(); } else r.result.createObjectStore('evidence'); };
      r.onerror = () => absent ? resolve(null) : reject(r.error);
      r.onblocked = () => reject(Error('journal-open-blocked'));
      r.onsuccess = () => {
        if (r.result.objectStoreNames.length !== 1 || !r.result.objectStoreNames.contains('evidence')) { r.result.close(); reject(Error('unknown-journal-structure')); } else resolve(r.result);
      };
    });
  }
  async function run(add?: { key: string; value: unknown; guard?: (s: Snapshot) => void }): Promise<Snapshot> {
    const db = await open(!!add); if (!db) return {};
    try { return await new Promise<Snapshot>((resolve, reject) => {
      const tx = db.transaction('evidence', add ? 'readwrite' : 'readonly'), store = tx.objectStore('evidence'), s: Snapshot = Object.create(null);
      let failure: unknown;
      tx.onabort = () => reject(failure ?? tx.error ?? Error('journal-transaction-aborted'));
      tx.oncomplete = () => resolve(s);
      const r = store.openCursor();
      r.onsuccess = () => { try {
        const c = r.result;
        if (c) { if (typeof c.key !== 'string' || !obj(c.value) || c.value.protocol !== 1) throw Error('corrupt-journal'); s[c.key] = c.value; c.continue(); return; }
        if (Object.keys(s).length > MAX_RECORDS || JSON.stringify(s).length > MAX_UNITS) throw Error('journal-capacity-or-corruption');
        if (add) {
          add.guard?.(s);
          if (Object.hasOwn(s, add.key)) throw Error('evidence-id-collision');
          if (Object.keys(s).length >= MAX_RECORDS || JSON.stringify(s).length + JSON.stringify(add.value).length > MAX_UNITS) throw Error('journal-capacity');
          store.add(add.value, add.key); s[add.key] = add.value;
        }
      } catch (e) { failure = e; tx.abort(); } };
    }); } finally { db.close(); }
  }
  const read = async () => { const s = await run(); const reason = await inspectJournalRecords(s, scope); if (reason) throw Error(reason); return s; };
  return { read, append: async (key: string, value: unknown, guard?: (s: Snapshot) => void) => {
    const prior = await read();
    const reason = await inspectJournalRecords({ ...prior, [key]: value }, scope); if (reason) throw Error(reason);
    await run({ key, value, guard: s => { if (JSON.stringify(s) !== JSON.stringify(prior)) throw Error('journal-changed-during-validation'); guard?.(s); } });
    const observed = await read(); if (JSON.stringify(observed[key]) !== JSON.stringify(value)) throw Error('journal-readback-mismatch');
  } };
}

export function createMigrationEngine(options: MigrationOptions) {
  // Detach configuration and bind only the designated getter. No source writer is accepted or used.
  const key = options.source.key, get = options.source.getItem.bind(options.source), name = options.targetName;
  if (!key.startsWith('stage3b5-test-') || !id(key.slice(14)) || !name.startsWith('stage3b4-test-') || !id(name.slice(14))) throw Error('synthetic-namespace-required');
  const adapter = createIsolatedAdapter(name, { ...options.adapterOptions, factory: options.factory ?? options.adapterOptions?.factory });
  const factory = options.factory ?? options.adapterOptions?.factory ?? globalThis.indexedDB;
  const log = journal(name + '-migration', factory, { source: key, destination: name });
  const fault = options.fault;
  let state: MigrationState = 'NOT_STARTED', closed = false, busy = false, epoch = 0, terminal = false;
  const phases: MigrationState[] = ['NOT_STARTED'];
  const move = (next: MigrationState) => { state = next; phases.push(next); };
  const outcome = (next: MigrationState, reason: string): Outcome => { move(next); if (['UNKNOWN', 'BLOCKED', 'FAILED', 'CONFLICT'].includes(next)) { terminal = true; epoch++; adapter.close(); } return { state, reason, executionAllowed: false, phases: [...phases] }; };
  async function source(): Promise<string | null> {
    await fault?.('source-before-read'); const raw = get(key); await fault?.('source-after-read');
    if (raw !== null && (typeof raw !== 'string' || raw.length > MAX_RAW)) throw Error('source-raw-unreadable-or-oversized');
    if (get(key) !== raw) throw Error('source-changed-during-read'); return raw;
  }
  async function observe(base?: BaseEvidence) {
    const raw = await source(), target = await adapter.inspect(raw ?? ''), snapshot = target.snapshot;
    let knownAbsent = false;
    if (!snapshot && factory?.databases) knownAbsent = !(await factory.databases()).some(db => db.name === name);
    return { raw, target, snapshot, classification: classifyBranches(raw, knownAbsent ? null : snapshot, base) };
  }
  const fence = (session: number) => { if (closed || terminal || session !== epoch) throw Error('session-fenced'); };
  async function durableFailure(migrationId: string, reason: string) {
    try { await log.append('diagnostic:' + migrationId, { protocol: 1, state: 'UNKNOWN', reason }); } catch { /* The earlier durable attempt still fences all future instances. */ }
  }
  return {
    async preview(base?: BaseEvidence) {
      const frozenBase = base ? structuredClone(base) : undefined;
      try {
        const o = await observe(frozenBase), old = details(o.raw), current = details(o.snapshot?.current);
        const evidence = await log.read();
        const reasons = [o.target.reason];
        if (Object.keys(evidence).some(k => !k.startsWith('rescue:'))) reasons.push('durable-migration-hold');
        if (o.classification === 'UNKNOWN') reasons.push('missing-or-corrupt-causal-evidence');
        const collisionIds = old.ids.filter(x => current.ids.includes(x));
        return { state, source: key, destination: name, sourceRaw: o.raw, targetRaw: o.snapshot?.current, classification: o.classification,
          sourceDetails: old, targetDetails: current, targetGeneration: o.target.token ?? null, sourceGeneration: null,
          exactRawEquality: o.raw !== null && o.raw === o.snapshot?.current, candidateCount: old.ids.length, wholeDocumentCandidateCount: old.valid ? 1 : 0, branchCount: Number(typeof o.raw === 'string') + Number(typeof o.snapshot?.current === 'string'), collisionIds,
          reasons, rawPreservation: 'exact UTF-16 code units; no normalization', plannedChanges: ['replace isolated current with exact source raw', 'retain prior target copy, receipt and intent'],
          protectedTargets: ['source', 'production localStorage', 'production IndexedDB', 'selective restore'],
          verification: { schema: old.valid && current.valid, targetIntegrity: !!o.snapshot && inspectSnapshot(o.snapshot) === null, causality: !!o.snapshot && verifiedBase(o.snapshot, frozenBase) },
          writeAllowed: false, executionAllowed: false as const };
      } catch (e) { return { state: 'UNKNOWN' as const, reason: err(e), source: key, destination: name, writeAllowed: false, executionAllowed: false as const }; }
    },
    async migrate(input: MigrationRequest): Promise<Outcome> {
      let request: MigrationRequest;
      try { request = structuredClone(input); } catch (e) { return outcome('BLOCKED', err(e)); }
      if (busy || closed || terminal) return outcome('BLOCKED', 'busy-closed-or-terminal-hold');
      busy = true; const session = epoch; let attempted = false;
      const migrationId = request?.migrationId;
      try {
        if (!obj(request) || !id(migrationId) || migrationId === 'genesis') return outcome('BLOCKED', 'invalid-migration-id');
        const locks = globalThis.navigator?.locks;
        if (!locks) return outcome('BLOCKED', 'coordinator-lock-unavailable');
        const result = await locks.request(name + ':migration', async () => {
          try {
            fence(session);
            const prior = await log.read(); fence(session);
            if (Object.keys(prior).some(k => !k.startsWith('rescue:'))) return outcome('BLOCKED', 'durable-attempt-never-auto-replayed');
            // Durable write-ahead fence before source validation or any primary write.
            await log.append('attempt:' + migrationId, { protocol: 1, state: 'VALIDATING', migrationId, source: key, destination: name }, s => {
              fence(session); if (Object.keys(s).some(k => !k.startsWith('rescue:'))) throw Error('concurrent-attempt');
            }); attempted = true; fence(session); move('VALIDATING');
            if (!validRaw(request.expectedSourceRaw) || !validRaw(request.expectedTargetRaw) || !validToken(request.expectedTargetToken)) return outcome('BLOCKED', 'invalid-raw-schema-id-or-generation');
            const o = await observe(); fence(session);
            if (!o.snapshot) return outcome('BLOCKED', 'target-unavailable-or-not-initialized');
            if (inspectSnapshot(o.snapshot)) return outcome('UNKNOWN', 'authority-or-integrity-unknown');
            if (o.raw !== request.expectedSourceRaw || o.snapshot?.current !== request.expectedTargetRaw || !sameToken(o.target.token, request.expectedTargetToken)) return outcome('CONFLICT', 'frozen-source-or-target-mismatch');
            if (o.target.state !== 'READ_ONLY' || !o.snapshot || inspectSnapshot(o.snapshot)) return outcome('UNKNOWN', 'authority-or-integrity-unknown');
            if (o.snapshot.current === o.raw) return outcome('BLOCKED', 'equal-raw-no-migration-required');
            if (request.expectedTargetToken.generation !== 0 || !isEmptyDestination(o.snapshot.current)) return outcome('CONFLICT', 'nonempty-or-nongenesis-target-preserve-branches');
            move('READY');
            const authority = await adapter.authorize({ token: request.expectedTargetToken, raw: request.expectedTargetRaw, legacyRaw: request.expectedSourceRaw }); fence(session);
            if (authority.status !== 'AUTHORIZED') return outcome('BLOCKED', authority.reason);
            await fault?.('source-precommit'); await fault?.('before-save'); fence(session);
            if (get(key) !== request.expectedSourceRaw) return outcome('CONFLICT', 'source-changed-before-save');
            move('MIGRATING');
            const saved = await adapter.save({ protocol: 1, expected: request.expectedTargetToken, expectedRaw: request.expectedTargetRaw, candidateRaw: request.expectedSourceRaw, operationId: migrationId, legacyRaw: request.expectedSourceRaw });
            fence(session); await fault?.('after-save'); fence(session);
            if (saved.status !== 'VERIFIED') {
              if (saved.status === 'CONFLICT') return outcome('CONFLICT', saved.reason);
              throw Error(saved.reason);
            }
            await fault?.('source-postcommit');
            if (get(key) !== request.expectedSourceRaw) throw Error('late-old-writer-after-commit');
            await fault?.('readback');
            const checked = await adapter.inspect(request.expectedSourceRaw); fence(session);
            if (checked.state !== 'READ_ONLY' || checked.raw !== request.expectedSourceRaw || !sameToken(checked.token, saved.token)) throw Error('migration-readback-mismatch');
            await log.append('receipt:' + migrationId, { protocol: 1, state: 'VERIFIED', migrationId, sourceRaw: request.expectedSourceRaw, targetBeforeRaw: request.expectedTargetRaw, before: request.expectedTargetToken, after: saved.token, hash: await hashRaw(request.expectedSourceRaw), hashAlgorithm: HASH_ALGORITHM }, () => fence(session));
            fence(session);
            const finalTarget = await adapter.inspect(request.expectedSourceRaw); fence(session);
            if (finalTarget.state !== 'READ_ONLY' || !sameToken(finalTarget.token, saved.token) || finalTarget.raw !== request.expectedSourceRaw) throw Error('new-idb-writer-before-result');
            if (get(key) !== request.expectedSourceRaw) throw Error('late-old-writer-before-result');
            return outcome('VERIFIED', 'observed-idb-commit-and-source-recheck-not-cross-backend-atomicity');
          } catch (e) { if (attempted) await durableFailure(migrationId, err(e)); return outcome('UNKNOWN', err(e)); }
        });
        if (result.state === 'VERIFIED') fence(session);
        return result;
      } catch (e) { if (attempted) await durableFailure(migrationId, err(e)); return outcome('UNKNOWN', err(e)); }
      finally { busy = false; }
    },
    async preserveBranches(input: { rescueId: string; base?: BaseEvidence }) {
      let request: { rescueId: string; base?: BaseEvidence };
      try { request = structuredClone(input); } catch (e) { return outcome('BLOCKED', err(e)); }
      if (!obj(request) || !id(request.rescueId) || closed || busy || state === 'UNKNOWN' || state === 'BLOCKED' || state === 'FAILED') return { state: 'BLOCKED', reason: 'invalid-id-busy-or-closed', executionAllowed: false };
      busy = true; const session = epoch; let rescueAttempted = false;
      try {
        const prior = await log.read();
        if (closed || session !== epoch) throw Error('rescue-session-fenced');
        if (prior['rescue:' + request.rescueId]) return outcome('BLOCKED', 'rescue-id-already-preserved');
        if (Object.keys(prior).some(k => k.startsWith('diagnostic:') || k.startsWith('rescue-attempt:') || k.startsWith('attempt:') && state !== 'CONFLICT' && state !== 'VERIFIED')) return outcome('BLOCKED', 'durable-uncertainty-hold');
        await log.append('rescue-attempt:' + request.rescueId, { protocol: 1, state: 'PENDING', rescueId: request.rescueId, source: key, destination: name }, s => {
          if (closed || session !== epoch || Object.keys(s).some(k => k.startsWith('rescue-attempt:'))) throw Error('rescue-session-or-concurrent-hold');
        });
        rescueAttempted = true;
        if (closed || session !== epoch) throw Error('rescue-session-fenced');
        const o = await observe(request.base), branches: Branch[] = [];
        const intact = !!o.snapshot && inspectSnapshot(o.snapshot) === null;
        const parent = intact && verifiedBase(o.snapshot!, request.base) ? request.base!.targetToken.latestOperation : null;
        for (const [origin, raw] of [['OLD_LOCAL_STORAGE', o.raw], ['ISOLATED_IDB', o.snapshot?.current]] as const) {
          if (typeof raw !== 'string') continue;
          if (raw.length > MAX_RAW) throw Error('rescue-raw-capacity');
          const targetBranch = origin === 'ISOLATED_IDB' && intact;
          branches.push({ branchId: request.rescueId + (origin === 'OLD_LOCAL_STORAGE' ? '-old' : '-idb'), origin, raw, hash: await hashRaw(raw), hashAlgorithm: HASH_ALGORITHM, schemaValid: validRaw(raw), ids: details(raw).ids,
            generation: targetBranch ? tokenOf(o.snapshot!.head as Token) : null, receipt: targetBranch ? (o.snapshot!.head as Token).latestOperation : null, parent: targetBranch && request.base && (o.snapshot!.head as Token).generation > request.base.targetToken.generation ? parent : null });
        }
        if (!branches.length) throw Error('no-readable-branches');
        const value = { protocol: 1, rescueId: request.rescueId, source: key, destination: name, classification: o.classification, branches, targetEvidence: o.snapshot ?? null, executionAllowed: false };
        await fault?.('rescue-before-commit');
        if (closed || session !== epoch) throw Error('rescue-session-fenced');
        const current = await adapter.inspect(o.raw ?? '');
        if (get(key) !== o.raw || JSON.stringify(current.snapshot) !== JSON.stringify(o.snapshot)) throw Error('rescue-source-or-target-changed');
        await log.append('rescue:' + request.rescueId, value, () => { if (closed || session !== epoch) throw Error('rescue-session-fenced'); });
        await fault?.('rescue-after-commit');
        const after = await adapter.inspect(o.raw ?? '');
        if (closed || session !== epoch || get(key) !== o.raw || JSON.stringify(after.snapshot) !== JSON.stringify(o.snapshot)) throw Error('rescue-race-after-append-evidence-retained');
        return { state: 'VERIFIED', reason: 'independent-branches-preserved-no-restore-authority', branches, executionAllowed: false };
      } catch (e) { if (rescueAttempted) await durableFailure('rescue-' + request.rescueId, err(e)); return outcome('UNKNOWN', err(e)); }
      finally { busy = false; }
    },
    inspectJournal: () => log.read(),
    async journalObservation() {
      try { const records = await log.read(); const hold = journalRequiresHold(records); return { state: hold ? 'UNKNOWN' : 'READ_ONLY', reason: hold ? 'historical-attempt-requires-reconciliation' : 'validated-evidence-only', records, executionAllowed: false }; }
      catch (e) { return { state: 'UNKNOWN', reason: err(e), executionAllowed: false }; }
    },
    close() { closed = true; epoch++; adapter.close(); },
  };
}
