// Isolated acceptance implementation. No production imports of this module are permitted.
import { validateRestoreRaw } from '../../lib/restore-validation';

export type Token = { structure: 1; incarnation: string; generation: number; latestOperation: string };
type Head = Token & { protocol: 1; legacyRaw: string };
type Receipt = { protocol: 1; token: Token; previous: string | null; raw: string };
type Intent = { protocol: 1; operationId: string; expected: Token; expectedRaw: string; candidateRaw: string; phase: 'PENDING' | 'COMMIT_RECORDED' | 'READBACK_MATCH' | 'UNKNOWN'; firstFailure?: string };
export type Snapshot = Record<string, unknown>;
export type SaveRequest = { protocol: 1; expected: Token; expectedRaw: string; candidateRaw: string; operationId: string; legacyRaw: string };
export type Options = { factory?: IDBFactory; fault?: (point: string) => void; afterComplete?: () => void | Promise<void>; readback?: (snapshot: Snapshot) => Snapshot };
type Result = { status: string; reason: string; phases: string[]; token?: Token };
const STORE = 'records';
const PREFIX = 'stage3b4-test-';
const MAX_RAW = 2_097_152, MAX_COPIES = 8, MAX_COPY_UNITS = 4_194_304, MAX_HISTORY = 256;
const object = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const id = (x: unknown): x is string => typeof x === 'string' && /^[A-Za-z0-9_-]{1,160}$/.test(x);
export function validRaw(raw: unknown): raw is string {
  return typeof raw === 'string' && raw.length <= MAX_RAW && validateRestoreRaw(raw).ok;
}
export const tokenOf = (h: Token): Token => ({ structure: h.structure, incarnation: h.incarnation, generation: h.generation, latestOperation: h.latestOperation });
export function validToken(t: unknown): t is Token {
  return object(t) && t.structure === 1 && id(t.incarnation) && Number.isSafeInteger(t.generation) && Number(t.generation) >= 0 && id(t.latestOperation);
}
export function sameToken(a: unknown, b: unknown): boolean {
  return validToken(a) && validToken(b) && a.structure === b.structure && a.incarnation === b.incarnation && a.generation === b.generation && a.latestOperation === b.latestOperation;
}
/** Pure integrity inspection; never grants write permission or changes persisted evidence. */
export function inspectSnapshot(s: Snapshot): string | null {
  const head = s.head;
  if (!object(head) || head.protocol !== 1 || !validRaw(head.legacyRaw) || !validToken(head) || !validRaw(s.current)) return 'invalid-head-or-current';
  const receipts = Object.entries(s).filter(([k]) => k.startsWith('receipt:'));
  if (receipts.length !== head.generation + 1 || receipts.length > MAX_HISTORY) return 'missing-or-extra-receipt';
  const ordered = receipts.map(([key, value]) => ({ key, value })).sort((a, b) => Number((a.value as Receipt)?.token?.generation) - Number((b.value as Receipt)?.token?.generation));
  let previous: Receipt | undefined;
  for (let n = 0; n < ordered.length; n++) {
    const { key, value: r } = ordered[n];
    if (!object(r) || r.protocol !== 1 || !validToken(r.token) || !validRaw(r.raw) || key !== 'receipt:' + r.token.latestOperation || r.token.generation !== n || r.token.incarnation !== head.incarnation || r.previous !== (previous?.token.latestOperation ?? null)) return 'invalid-receipt-chain';
    if (n > 0) {
      const copy = s['copy:' + n];
      if (!object(copy) || copy.protocol !== 1 || copy.raw !== previous?.raw || !sameToken(copy.source, previous?.token) || copy.operationId !== r.token.latestOperation) return 'invalid-recovery-copy';
    }
    previous = r as Receipt;
  }
  if (!sameToken(previous?.token, head) || previous?.raw !== s.current) return 'current-receipt-mismatch';
  const copies = Object.entries(s).filter(([k]) => k.startsWith('copy:'));
  if (copies.length !== head.generation || copies.length > MAX_COPIES || copies.reduce((n, [, v]) => n + JSON.stringify(v).length, 0) > MAX_COPY_UNITS) return 'copy-capacity-or-count';
  if (!object(s.control) || s.control.protocol !== 1 || !['CLEAR', 'HOLD'].includes(String(s.control.state))) return 'invalid-control';
  for (const [k, v] of Object.entries(s)) {
    if (['head', 'current', 'control'].includes(k) || k.startsWith('receipt:') || k.startsWith('copy:')) continue;
    if (k.startsWith('intent:')) {
      if (!object(v) || v.protocol !== 1 || !id(v.operationId) || k !== 'intent:' + v.operationId || !validToken(v.expected) || !validRaw(v.expectedRaw) || !validRaw(v.candidateRaw) || !['PENDING', 'COMMIT_RECORDED', 'READBACK_MATCH', 'UNKNOWN'].includes(String(v.phase))) return 'invalid-intent';
      if (v.firstFailure !== undefined && (v.phase !== 'UNKNOWN' || typeof v.firstFailure !== 'string')) return 'contradictory-intent-failure';
      const before = s['receipt:' + v.expected.latestOperation];
      if (!object(before) || !sameToken(before.token, v.expected) || before.raw !== v.expectedRaw) return 'intent-base-mismatch';
      const after = s['receipt:' + v.operationId];
      if (v.phase === 'READBACK_MATCH' || v.phase === 'COMMIT_RECORDED') {
        if (!object(after) || !validToken(after.token) || after.token.generation !== v.expected.generation + 1 || after.previous !== v.expected.latestOperation || after.raw !== v.candidateRaw) return 'intent-receipt-mismatch';
      }
    } else if (k.startsWith('diagnostic:')) {
      if (!object(v) || v.protocol !== 1 || v.status !== 'UNKNOWN' || typeof v.firstFailure !== 'string') return 'invalid-diagnostic';
    } else return 'unknown-record';
  }
  for (const { value: r } of ordered.slice(1)) {
    const receipt = r as Receipt, intent = s['intent:' + receipt.token.latestOperation];
    if (!object(intent) || intent.candidateRaw !== receipt.raw || !validToken(intent.expected) || intent.expected.latestOperation !== receipt.previous || intent.expected.generation + 1 !== receipt.token.generation) return 'receipt-intent-missing';
  }
  return null;
}
function unresolved(s: Snapshot, observed: Set<string>): boolean {
  return (s.control as { state?: string })?.state !== 'CLEAR' || Object.entries(s).some(([k, v]) => k.startsWith('diagnostic:') || k.startsWith('intent:') && ((v as Intent).phase !== 'READBACK_MATCH' || !observed.has((v as Intent).operationId)));
}
function readInTransaction(tx: IDBTransaction, next: (snapshot: Snapshot) => void, fail: (e: unknown) => void) {
  const s: Snapshot = Object.create(null);
  const request = tx.objectStore(STORE).openCursor();
  request.onsuccess = () => {
    try { const c = request.result; if (c) { if (typeof c.key !== 'string') throw Error('invalid-record-key'); s[c.key] = c.value; c.continue(); } else next(s); }
    catch (e) { fail(e); }
  };
}
function transaction<T>(db: IDBDatabase, mode: IDBTransactionMode, body: (tx: IDBTransaction, s: Snapshot, set: (value: T) => void) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    let tx: IDBTransaction, result: T, failure: unknown;
    try { tx = db.transaction(STORE, mode); } catch (e) { reject(e); return; }
    const fail = (e: unknown) => { failure = e; try { tx.abort(); } catch { reject(e); } };
    tx.onabort = () => reject(failure ?? tx.error ?? Error('transaction-aborted'));
    tx.onerror = () => { /* Default request failure aborts the whole transaction. */ };
    tx.oncomplete = () => resolve(result);
    readInTransaction(tx, s => { try { body(tx, s, x => { result = x; }); } catch (e) { fail(e); } }, fail);
  });
}
const message = (e: unknown) => e instanceof Error ? `${e.name}:${e.message}` : String(e);
export function createIsolatedAdapter(name: string, options: Options = {}) {
  if (!name.startsWith(PREFIX) || !id(name.slice(PREFIX.length))) throw Error('synthetic-namespace-required');
  const factory = options.factory ?? globalThis.indexedDB;
  let database: IDBDatabase | undefined, authorized = false, volatileHold = false;
  // Historical readback is not proof that the outside coordinator completed.
  // A new instance starts HOLD when any previous intent exists. No recovery-unlock API.
  const observed = new Set<string>();
  const fault = (point: string) => options.fault?.(point);
  async function open(create = false): Promise<IDBDatabase> {
    if (database) return database;
    if (!factory) throw Error('indexeddb-unavailable');
    return new Promise((resolve, reject) => {
      let rejected = false;
      const request = create ? factory.open(name, 1) : factory.open(name);
      request.onupgradeneeded = () => {
        if (!create) { request.transaction?.abort(); return; }
        request.result.createObjectStore(STORE);
      };
      request.onblocked = () => { rejected = true; reject(Error('blocked-upgrade')); };
      request.onerror = () => reject(request.error ?? Error('database-open-failed'));
      request.onsuccess = () => {
        const db = request.result;
        if (rejected) { db.close(); return; }
        if (db.version !== 1 || !db.objectStoreNames.contains(STORE) || db.objectStoreNames.length !== 1) { db.close(); reject(Error('unknown-database-structure')); return; }
        database = db;
        db.onversionchange = () => { authorized = false; volatileHold = true; db.close(); database = undefined; };
        db.onclose = () => { authorized = false; volatileHold = true; database = undefined; };
        resolve(db);
      };
    });
  }
  const read = async () => transaction<Snapshot>(await open(), 'readonly', (_tx, s, set) => set(s));
  const put = (tx: IDBTransaction, key: string, value: unknown, point: string) => { fault(point); return tx.objectStore(STORE).put(value, key); };
  const result = (status: string, reason: string, phases: string[] = [], token?: Token): Result => ({ status, reason, phases, ...(token ? { token } : {}) });
  return {
    async initialize(raw: string, incarnation: string, legacyRaw = raw): Promise<Result> {
      if (!validRaw(raw) || !validRaw(legacyRaw) || !id(incarnation)) return result('INVALID', 'invalid-genesis');
      try {
        const db = await open(true);
        return await transaction<Result>(db, 'readwrite', (tx, s, set) => {
          if (Object.keys(s).length) { set(result('BLOCKED', 'existing-store-never-reset')); return; }
          const head: Head = { protocol: 1, structure: 1, incarnation, generation: 0, latestOperation: 'genesis', legacyRaw };
          tx.objectStore(STORE).add(head, 'head'); tx.objectStore(STORE).add(raw, 'current');
          tx.objectStore(STORE).add({ protocol: 1, token: tokenOf(head), previous: null, raw } satisfies Receipt, 'receipt:genesis');
          tx.objectStore(STORE).add({ protocol: 1, state: 'CLEAR' }, 'control');
          set(result('CREATED', 'synthetic-genesis-only', [], tokenOf(head)));
        });
      } catch (e) { return result('UNAVAILABLE', message(e)); }
    },
    async inspect(legacyRaw: string) {
      try {
        const snapshot = await read(), reason = inspectSnapshot(snapshot);
        const head = snapshot.head as Head;
        return { state: reason ? 'UNKNOWN' : unresolved(snapshot, observed) || legacyRaw !== head.legacyRaw ? 'HOLD' : 'READ_ONLY',
          reason: reason ?? (unresolved(snapshot, observed) ? 'unresolved-intent-or-hold' : legacyRaw !== head.legacyRaw ? 'legacy-divergence' : 'consistent-observation-only'),
          token: reason ? undefined : tokenOf(head), raw: snapshot.current, legacyRaw: head?.legacyRaw, snapshot, writeAllowed: false, executionAllowed: false };
      } catch (e) { return { state: 'UNKNOWN', reason: message(e), writeAllowed: false, executionAllowed: false }; }
    },
    async authorize(expected: { token: Token; raw: string; legacyRaw: string }): Promise<Result> {
      authorized = false;
      if (volatileHold) return result('BLOCKED', 'runtime-hold');
      try {
        const s = await read(), reason = inspectSnapshot(s);
        if (reason || unresolved(s, observed)) return result('BLOCKED', reason ?? 'unresolved-intent-or-hold');
        if (!sameToken(expected.token, s.head) || expected.raw !== s.current || expected.legacyRaw !== (s.head as Head).legacyRaw) return result('CONFLICT', 'explicit-confirmation-stale');
        authorized = true; return result('AUTHORIZED', 'explicit-synthetic-session-only');
      } catch (e) { return result('UNAVAILABLE', message(e)); }
    },
    async save(input: SaveRequest): Promise<Result> {
      const phases = ['PREVALIDATION'];
      // Detach input before the first await; caller mutation cannot change operation semantics.
      let request: SaveRequest;
      try { request = structuredClone(input); } catch (e) { return result('INVALID', message(e), phases); }
      if (request.protocol !== 1 || !validToken(request.expected) || !validRaw(request.expectedRaw) || !validRaw(request.candidateRaw) || !id(request.operationId) || request.operationId === 'genesis' || !validRaw(request.legacyRaw)) return result('INVALID', 'invalid-request-or-protocol', phases);
      if (!authorized || volatileHold) return result('BLOCKED', 'explicit-confirmation-or-hold', phases);
      const locks = globalThis.navigator?.locks;
      if (!locks) return result('UNAVAILABLE', 'coordinator-lock-unavailable', phases);
      let intentPersisted = false;
      let active = true;
      const stopUnknown = async (e: unknown): Promise<Result> => {
        active = false;
        authorized = false; volatileHold = true;
        const firstFailure = message(e); phases.push('UNKNOWN', 'HOLD', 'EXPLICIT_RECONCILIATION_REQUIRED');
        if (intentPersisted) {
          try { await transaction<void>(await open(), 'readwrite', (tx, s) => {
            const i = s['intent:' + request.operationId];
            if (!object(i)) throw Error('intent-missing-during-diagnostic');
            const prior = s['diagnostic:' + request.operationId];
            const original = object(prior) && typeof prior.firstFailure === 'string' ? prior.firstFailure : firstFailure;
            put(tx, 'diagnostic:' + request.operationId, { protocol: 1, status: 'UNKNOWN', firstFailure: original }, 'diagnostic-put');
            tx.objectStore(STORE).put({ ...i, phase: 'UNKNOWN', firstFailure: i.firstFailure ?? original }, 'intent:' + request.operationId);
            tx.objectStore(STORE).put({ protocol: 1, state: 'HOLD' }, 'control');
          }); phases.push('DIAGNOSTIC_DURABLE'); } catch { phases.push('DIAGNOSTIC_UNAVAILABLE'); }
        }
        return result(intentPersisted ? 'UNKNOWN' : 'UNAVAILABLE', firstFailure, phases);
      };
      try { const outcome = await locks.request(name + ':coordinator', async () => {
        try {
          if (!active || !authorized || volatileHold) return result('BLOCKED', 'runtime-hold', phases);
          const db = await open();
          const prepared = await transaction<Result>(db, 'readwrite', (tx, s, set) => {
            if (!active || !authorized || volatileHold) throw Error('coordinator-no-longer-active');
            const reason = inspectSnapshot(s);
            if (reason || (s.control as { state?: string })?.state !== 'CLEAR') { set(result('BLOCKED', reason ?? 'persistent-hold', phases)); return; }
            const h = s.head as Head;
            if (!sameToken(h, request.expected) || s.current !== request.expectedRaw || h.legacyRaw !== request.legacyRaw) { set(result('CONFLICT', 'expected-state-mismatch', phases)); return; }
            if (unresolved(s, observed)) { set(result('BLOCKED', 'unresolved-intent-or-hold', phases)); return; }
            if (s['receipt:' + request.operationId] || s['intent:' + request.operationId]) { set(result('INVALID', 'operation-id-reused', phases)); return; }
            if (h.generation === Number.MAX_SAFE_INTEGER || h.generation >= MAX_COPIES || h.generation + 1 >= MAX_HISTORY) { set(result('BLOCKED', 'generation-or-capacity-limit', phases)); return; }
            const copy = { protocol: 1, source: tokenOf(h), operationId: request.operationId, raw: s.current };
            const units = Object.entries(s).filter(([k]) => k.startsWith('copy:')).reduce((n, [, v]) => n + JSON.stringify(v).length, 0) + JSON.stringify(copy).length;
            if (units > MAX_COPY_UNITS) { set(result('BLOCKED', 'recovery-capacity', phases)); return; }
            put(tx, 'intent:' + request.operationId, { protocol: 1, operationId: request.operationId, expected: request.expected, expectedRaw: request.expectedRaw, candidateRaw: request.candidateRaw, phase: 'PENDING' } satisfies Intent, 'intent-put');
            set(result('PREPARED', 'intent-transaction-complete', phases));
          });
          if (prepared.status !== 'PREPARED') return prepared;
          intentPersisted = true; phases.push('INTENT_DURABLE', 'TRANSACTION_RUNNING');
          if (!active || !authorized || volatileHold) throw Error('coordinator-no-longer-active');
          const committed = await transaction<Result>(db, 'readwrite', (tx, s, set) => {
            if (!active || !authorized || volatileHold) throw Error('coordinator-no-longer-active');
            const reason = inspectSnapshot(s), h = s.head as Head;
            if (reason || (s.control as { state: string }).state !== 'CLEAR') throw Error(reason ?? 'persistent-hold');
            if (Object.entries(s).some(([k, v]) => k.startsWith('intent:') && k !== 'intent:' + request.operationId && (v as Intent).phase !== 'READBACK_MATCH')) throw Error('other-unresolved-intent');
            if (!sameToken(h, request.expected) || s.current !== request.expectedRaw || h.legacyRaw !== request.legacyRaw) throw Error('transaction-expected-state-mismatch');
            const pending = s['intent:' + request.operationId] as Intent;
            if (pending?.phase !== 'PENDING' || pending.candidateRaw !== request.candidateRaw || s['receipt:' + request.operationId]) throw Error('intent-or-operation-mismatch');
            const token: Token = { ...tokenOf(h), generation: h.generation + 1, latestOperation: request.operationId };
            put(tx, 'current', request.candidateRaw, 'current-put');
            put(tx, 'head', { ...h, ...token }, 'head-put');
            put(tx, 'copy:' + token.generation, { protocol: 1, source: tokenOf(h), operationId: request.operationId, raw: s.current }, 'copy-put');
            put(tx, 'receipt:' + request.operationId, { protocol: 1, token, previous: h.latestOperation, raw: request.candidateRaw } satisfies Receipt, 'receipt-put');
            const last = put(tx, 'intent:' + request.operationId, { ...pending, phase: 'COMMIT_RECORDED' }, 'intent-commit-put');
            last.onsuccess = () => { try { fault('request-success'); } catch { tx.abort(); } };
            set(result('COMMITTED_OBSERVED', 'transaction-complete', phases, token));
          });
          phases.push('COMMIT_OBSERVED'); fault('complete'); await options.afterComplete?.();
          let s = await read(); if (options.readback) s = options.readback(s);
          if (inspectSnapshot(s) || !sameToken(s.head, committed.token) || s.current !== request.candidateRaw || (s['intent:' + request.operationId] as Intent)?.phase !== 'COMMIT_RECORDED' || (s.control as { state: string }).state !== 'CLEAR') throw Error('post-commit-readback-mismatch');
          phases.push('READBACK_MATCH');
          await transaction<void>(db, 'readwrite', (tx, current) => {
            if (!active || !authorized || volatileHold) throw Error('coordinator-no-longer-active');
            if (inspectSnapshot(current) || !sameToken(current.head, committed.token) || current.current !== request.candidateRaw || (current.control as { state: string }).state !== 'CLEAR') throw Error('ack-state-changed');
            const i = current['intent:' + request.operationId] as Intent;
            if (i.phase !== 'COMMIT_RECORDED' || i.firstFailure) throw Error('ack-intent-changed');
            put(tx, 'intent:' + request.operationId, { ...i, phase: 'READBACK_MATCH' }, 'ack-put');
          });
          return result('VERIFIED', 'commit-and-readback-observed-not-media-durability', phases, committed.token);
        } catch (e) { return stopUnknown(e); }
      });
        if (outcome.status === 'VERIFIED' && active && authorized && !volatileHold) { observed.add(request.operationId); phases.push('SESSION_RESULT_OBSERVED'); }
        active = false;
        return outcome;
      } catch (e) { return stopUnknown(e); }
    },
    close() { authorized = false; observed.clear(); database?.close(); database = undefined; },
  };
}
