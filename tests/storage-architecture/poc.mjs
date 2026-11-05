// Stage 3B-2 ONLY. No application imports and no production storage names.
export const executionAllowed = false;
export const HOLD = true;
export const tokenOf = s => ({ incarnation: s.incarnation, generation: s.generation, operation: s.operation });
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const stamp = t => t && typeof t.incarnation === 'string' && t.incarnation.length > 0
  && Number.isSafeInteger(t.generation) && t.generation >= 0 && typeof t.operation === 'string' && t.operation.length > 0;
export function genesis(incarnation, operation, raw = 'A') {
  return { structure: 2, incarnation, generation: 0, operation, raw,
    history: [{ generation: 0, operation, previous: null, raw, writer: 'bootstrap', instance: 'bootstrap', kind: 'bootstrap' }], copies: [] };
}
// Full chain inspection is intentional in this bounded PoC; not a production size policy.
export function inspect(s) {
  try {
    if (!s || s.structure !== 2 || !stamp(s) || typeof s.raw !== 'string'
      || !Array.isArray(s.history) || !Array.isArray(s.copies)
      || s.history.length !== s.generation + 1 || s.copies.length !== s.generation) return 'UNKNOWN';
    const ids = new Set();
    for (let g = 0; g <= s.generation; g++) {
      const op = s.history[g];
      if (op.generation !== g || typeof op.operation !== 'string' || !op.operation || ids.has(op.operation)
        || typeof op.raw !== 'string' || typeof op.writer !== 'string' || !op.writer
        || typeof op.instance !== 'string' || !op.instance
        || op.previous !== (g ? s.history[g - 1].operation : null)
        || (g === 0 ? op.kind !== 'bootstrap' : !['ordinary', 'restore', 'recovery'].includes(op.kind))) return 'UNKNOWN';
      ids.add(op.operation);
      if (g) {
        const c = s.copies[g - 1], before = s.history[g - 1];
        if (!equal(c, { incarnation: s.incarnation, generation: g - 1, operation: before.operation, raw: before.raw })) return 'UNKNOWN';
      }
    }
    const last = s.history[s.generation];
    return last.operation === s.operation && last.raw === s.raw ? 'CONSISTENT' : 'UNKNOWN';
  } catch { return 'UNKNOWN'; }
}
export function transition(s, expected, request) {
  if (inspect(s) !== 'CONSISTENT') return { status: 'UNKNOWN' };
  if (!stamp(expected) || !equal(tokenOf(s), expected)) return { status: 'REFUSED', reason: 'stale-token' };
  if (!request || typeof request.raw !== 'string' || !request.operation || typeof request.operation !== 'string'
    || !request.writer || typeof request.writer !== 'string' || !request.instance || typeof request.instance !== 'string'
    || !['ordinary', 'restore', 'recovery'].includes(request.kind)
    || s.history.some(o => o.operation === request.operation) || s.generation === Number.MAX_SAFE_INTEGER)
    return { status: 'REFUSED', reason: 'invalid-or-reused-operation' };
  const next = structuredClone(s);
  next.copies.push({ ...tokenOf(s), raw: s.raw });
  next.generation++;
  next.operation = request.operation; next.raw = request.raw;
  next.history.push({ generation: next.generation, operation: request.operation, previous: s.operation,
    raw: request.raw, writer: request.writer, instance: request.instance, kind: request.kind });
  return { status: 'PREPARED', next };
}
export function reconcile(s, operation) {
  if (inspect(s) !== 'CONSISTENT') return { status: 'UNKNOWN' };
  const receipt = s.history.find(o => o.operation === operation);
  // A later valid commit need not be mistaken for absence of the old operation.
  return receipt ? { status: 'COMMIT_RECORD_OBSERVED', generation: receipt.generation,
    acknowledgement: 'UNKNOWN', durability: 'NOT_PROVEN' } : { status: 'UNKNOWN' };
}
export function openDatabase(name) {
  if (!name.startsWith('stage3b2-test-')) throw Error('test namespace required');
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(name, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('vault');
    r.onerror = () => reject(r.error);
    r.onblocked = () => reject(Error('blocked database upgrade'));
    r.onsuccess = () => { r.result.onversionchange = () => r.result.close(); resolve(r.result); };
  });
}
export function readVault(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('vault', 'readonly'), r = tx.objectStore('vault').get('root');
    tx.oncomplete = () => resolve(r.result);
    tx.onabort = () => reject(tx.error || Error('read aborted'));
  });
}
// Explicit bootstrap is restricted to synthetic databases. Never infer empty=new.
export function bootstrap(db, s, approved) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('vault', 'readwrite'), st = tx.objectStore('vault'), r = st.get('root');
    let status = 'REFUSED';
    r.onsuccess = () => { if (approved === true && r.result === undefined && inspect(s) === 'CONSISTENT') { st.add(s, 'root'); status = 'CREATED'; } };
    tx.oncomplete = () => resolve(status);
    tx.onabort = () => reject(tx.error || Error('bootstrap aborted'));
  });
}
export function commit(db, expected, request, fault = '') {
  return new Promise(resolve => {
    let status = 'UNKNOWN', reason;
    const tx = db.transaction('vault', 'readwrite'), st = tx.objectStore('vault'), r = st.get('root');
    r.onsuccess = () => {
      const result = transition(r.result, expected, request);
      status = result.status; reason = result.reason;
      if (result.status === 'PREPARED') {
        st.put(result.next, 'root');
        if (fault === 'abort-after-put') tx.abort();
      }
    };
    tx.oncomplete = () => resolve({ status: status === 'PREPARED' ? 'COMMITTED_OBSERVED' : status, reason });
    // Request success alone must never be treated as transaction success.
    tx.onabort = () => resolve({ status: 'UNKNOWN', reason: 'transaction-aborted' });
  });
}
