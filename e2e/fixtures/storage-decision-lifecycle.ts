// Research fixture only. No production storage adapter, write API or recovery operation.
import { reconcileEvidence, type Request } from './storage-reconciliation';
import { buildRecoveryDecisionSheet } from './storage-recovery-decision';

export type Freshness = 'VALID' | 'STALE' | 'UNKNOWN';
export type Observation = {
  request: Request;
  revision: string;
  generation: number;
  authority: { status: 'NOT_ESTABLISHED'; revision: string };
  backups: { id: string; revision: string; raw: string | null }[];
  selection: { ids: string[]; policy: string };
};
type Sheet = ReturnType<typeof buildRecoveryDecisionSheet>;
const groups = ['request', 'revision', 'generation', 'authority', 'backups', 'selection'] as const;
type Group = typeof groups[number];
export type DecisionView = {
  id: number; status: Freshness; reusable: boolean; checking: boolean;
  reasons: string[]; changed: Group[]; fingerprint: string | null;
  sheet: Sheet | null; HOLD: true; executionAllowed: false; writeAllowed: false;
};
const invalid = () => { throw Error('invalid-observation'); };
/** Deterministic, bounded JSON; rejects values JSON.stringify would silently discard/coerce. */
export function canonical(value: unknown, depth = 0): string {
  if (depth > 40) return invalid();
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) {
    if (Object.keys(value).length !== value.length || Object.getOwnPropertySymbols(value).length || Object.getOwnPropertyNames(value).length !== value.length + 1) return invalid();
    const entries: string[] = [];
    for (let i = 0; i < value.length; i++) {
      const d = Object.getOwnPropertyDescriptor(value, String(i));
      if (!d || !('value' in d)) return invalid();
      entries.push(canonical(d.value, depth + 1));
    }
    return '[' + entries.join(',') + ']';
  }
  if (typeof value !== 'object' || !value || Object.getPrototypeOf(value) !== Object.prototype) return invalid();
  if (Object.getOwnPropertySymbols(value).length || Object.getOwnPropertyNames(value).length !== Object.keys(value).length) return invalid();
  return '{' + Object.keys(value).sort().map(k => {
    const d = Object.getOwnPropertyDescriptor(value, k);
    if (!d || !('value' in d)) return invalid();
    return JSON.stringify(k) + ':' + canonical(d.value, depth + 1);
  }).join(',') + '}';
}
async function digest(value: string) {
  // Preserve lone UTF-16 surrogates, unlike TextEncoder's replacement conversion.
  const bytes = new Uint8Array(value.length * 2), dv = new DataView(bytes.buffer);
  for (let i = 0; i < value.length; i++) dv.setUint16(i * 2, value.charCodeAt(i), true);
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(x => x.toString(16).padStart(2, '0')).join('');
}
async function inspect(input: Observation) {
  const serialized = canonical(input);
  if (serialized.length > 8_388_608) return invalid();
  const x: Observation = JSON.parse(serialized);
  if (Object.keys(x).sort().join() !== [...groups].sort().join() ||
      !x.request || !x.revision || typeof x.revision !== 'string' ||
      !Number.isSafeInteger(x.generation) || x.generation < 0 ||
      !x.authority || x.authority.status !== 'NOT_ESTABLISHED' || typeof x.authority.revision !== 'string' || !x.authority.revision ||
      !Array.isArray(x.backups) || !x.selection || !Array.isArray(x.selection.ids) ||
      typeof x.selection.policy !== 'string' || !x.selection.policy ||
      x.selection.ids.some(id => typeof id !== 'string' || !id) || new Set(x.selection.ids).size !== x.selection.ids.length) return invalid();
  if (x.backups.some(b => !b || typeof b.id !== 'string' || !b.id || typeof b.revision !== 'string' || !b.revision || (b.raw !== null && typeof b.raw !== 'string')) ||
      new Set(x.backups.map(b => b.id)).size !== x.backups.length) return invalid();
  // The caller cannot inject a report detached from this capture: recompute it.
  const report = await reconcileEvidence(x.request);
  if (x.request.captureChanged || ['source', 'target', 'journal'].some(k =>
    x.request.capture[k as keyof Request['capture']]?.kind === 'unavailable')) throw Error('unavailable-observation');
  const fingerprints = {} as Record<Group, string>;
  for (const key of groups) fingerprints[key] = await digest(canonical(x[key]));
  return { fingerprints, fingerprint: await digest(canonical(fingerprints)), sheet: buildRecoveryDecisionSheet(report) };
}

/** In-memory lifetime only. A reload creates UNKNOWN; old ids cannot be imported/revived.
 * Reader must capture every relevant dependency, including backups and selection.
 * Matching snapshots cannot prove unobserved ABA or atomicity across stores. */
export function createDecisionLifecycle(read: () => Promise<Observation>) {
  let nextId = 0, epoch = 0, busy = 0, closed = false;
  let baseline: Awaited<ReturnType<typeof inspect>> | null = null;
  let current: DecisionView = { id: 0, status: 'UNKNOWN', reusable: false, checking: false,
    reasons: ['new-session-generate-required'], changed: [], fingerprint: null, sheet: null,
    HOLD: true, executionAllowed: false, writeAllowed: false };
  const view = (): DecisionView => structuredClone({ ...current, checking: busy > 0,
    reusable: !closed && busy === 0 && current.status === 'VALID' });
  function invalidate(reason: string, status: Freshness = 'UNKNOWN') {
    epoch++;
    current.status = current.status === 'STALE' ? 'STALE' : status;
    current.reusable = false;
    if (!current.reasons.includes(reason)) current.reasons.push(reason);
  }
  async function capture() { return inspect(await read()); }
  async function generate() {
    if (closed) return view();
    const ticket = ++epoch; busy++;
    current = { ...current, id: ++nextId, status: 'UNKNOWN', reusable: false, reasons: ['generating'], changed: [], sheet: null, fingerprint: null };
    baseline = null;
    try {
      // Two complete reads detect a changing capture; not a transactional guarantee.
      const first = await capture(), second = await capture();
      if (ticket !== epoch || closed) return view();
      if (first.fingerprint !== second.fingerprint) { invalidate('changed-during-generation'); return view(); }
      baseline = second;
      current = { ...current, status: 'VALID', reasons: ['matching-observation-only-not-execution-permission'], fingerprint: second.fingerprint, sheet: second.sheet };
    } catch { if (ticket === epoch && !closed) invalidate('read-or-validation-failed'); }
    finally { busy--; }
    return view();
  }
  async function revalidate() {
    if (closed || current.status !== 'VALID' || !baseline) return view();
    const ticket = ++epoch, original = baseline; busy++;
    try {
      const first = await capture(), second = await capture();
      if (ticket !== epoch || closed) return view();
      const changed = groups.filter(k => first.fingerprints[k] !== original.fingerprints[k] || second.fingerprints[k] !== original.fingerprints[k]);
      if (changed.length) { current.changed = changed; invalidate('state-changed', 'STALE'); }
    } catch { if (ticket === epoch && !closed) invalidate('read-or-validation-failed'); }
    finally { busy--; }
    return view();
  }
  return {
    view, generate, revalidate,
    // Event hints never grant VALID. Unknown/malformed hints are conservative.
    notifyChange(subject: 'relevant' | 'unrelated-proven' | 'unknown') {
      if (closed || subject === 'unrelated-proven') return view();
      invalidate(subject === 'relevant' ? 'change-notification' : 'unclassified-notification', subject === 'relevant' ? 'STALE' : 'UNKNOWN');
      return view();
    },
    async useForReview(expectedId: number) {
      if (expectedId !== current.id) return { allowed: false, view: view() };
      await revalidate();
      const result = view();
      return { allowed: expectedId === result.id && result.reusable, view: result };
    },
    close() { closed = true; invalidate('session-closed'); return view(); },
  };
}

export function describeDecision(view: DecisionView) {
  return {
    status: view.status, reusable: view.reusable,
    heading: view.status === 'VALID' ? '現在観測との一致（実行許可ではない）' : view.status === 'STALE' ? '失効：過去の判定は再利用不可' : '判定不能：過去の判定は再利用不可',
    reasons: [...view.reasons], changed: [...view.changed],
    instruction: '必要なら新しい判断資料を明示生成してください。復元・書込みは禁止、Stage 3B HOLD。',
  };
}
