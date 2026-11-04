// Stage 3B-1 TEST-ONLY. Never import from app/components/lib entry points.
import { preserveRestoreSource, readRecoveryCopies, RECOVERY_KEYS, type RecoveryCopy } from '../../lib/restore-storage';
import { STORAGE_KEY } from '../../lib/storage';
import { parseStrictJson, validateRestoreRaw } from '../../lib/restore-validation';
import { revalidateSafety, type SafetyCandidate, type SafetyContext } from '../../lib/selective-restore-safety';

export const LEDGER_KEY = 'stage3b-test:operations:v1';
export const LOCK_NAME = 'stage3b-test:storage-writer:v1';
export type Store = Pick<Storage, 'getItem' | 'setItem'>;
export type Phase = 'NEW' | 'CHECKING' | 'PRESERVING' | 'PRESERVED' | 'PREPARING' | 'WRITING' | 'READING' | 'OBSERVED_MATCH' | 'REFUSED' | 'UNKNOWN';
export type Failure = { phase: Phase; reason: string };
export type RecordEntry = {
  id: string; kind: 'selection' | 'ordinary' | 'recovery'; recoveryOf?: string;
  phase: Phase; history: Phase[]; attempted: boolean; copy?: RecoveryCopy;
  original: string | null; candidate: string; firstFailure?: Failure;
  // This flag describes product permission, not the synthetic experiment.
  executionAllowed: false;
};
export type Result = { phase: Phase; record?: RecordEntry; reason?: string; executionAllowed: false; assurance: 'COOPERATIVE_OBSERVATION_ONLY' | 'UNKNOWN' };
export type ExclusiveLock = <T>(work: () => Promise<T>) => Promise<T>;
export type Checkpoint = (phase: Phase) => void | Promise<void>;
const terminal = (p: Phase) => ['REFUSED', 'UNKNOWN', 'OBSERVED_MATCH'].includes(p);
const path: Phase[] = ['NEW', 'CHECKING', 'PRESERVING', 'PRESERVED', 'PREPARING', 'WRITING', 'READING', 'OBSERVED_MATCH'];
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

/** Pure transition guard, also used to validate persisted histories on restart. */
export function transition(record: RecordEntry, next: Phase, reason?: string): RecordEntry {
  if (terminal(record.phase)) throw Error('terminal operation cannot advance or retry');
  if (next === 'REFUSED' && record.attempted) throw Error('attempted write must remain UNKNOWN');
  if (next === 'UNKNOWN' && !reason) throw Error('UNKNOWN requires a reason');
  if (next === 'REFUSED' && !reason) throw Error('refusal requires a reason');
  if (!['REFUSED', 'UNKNOWN'].includes(next) && path[path.indexOf(record.phase) + 1] !== next) throw Error('illegal transition');
  if (next === 'WRITING' && !record.copy) throw Error('preservation must be verified before intent');
  if (next === 'OBSERVED_MATCH' && (!record.attempted || !record.copy || record.firstFailure)) throw Error('cannot infer success');
  return { ...record, phase: next, history: [...record.history, next], attempted: record.attempted || next === 'WRITING',
    ...((next === 'REFUSED' || next === 'UNKNOWN') && !record.firstFailure ? { firstFailure: { phase: record.phase, reason: reason! } } : {}) };
}

function readLedger(store: Store): RecordEntry[] {
  const raw = store.getItem(LEDGER_KEY);
  if (raw === null) return [];
  const data = parseStrictJson(raw) as { version: number; records: RecordEntry[] };
  if (!data || data.version !== 1 || !Array.isArray(data.records)) throw Error('ledger unreadable');
  const ids = new Set<string>();
  for (const r of data.records) {
    if (!r || typeof r.id !== 'string' || !r.id || ids.has(r.id) || !['selection','ordinary','recovery'].includes(r.kind)
      || r.executionAllowed !== false || !(r.original === null || typeof r.original === 'string') || typeof r.candidate !== 'string'
      || !Array.isArray(r.history) || r.history[0] !== 'NEW' || r.history.at(-1) !== r.phase) throw Error('invalid ledger record');
    ids.add(r.id);
    let replay: RecordEntry = { ...r, phase: 'NEW', history: ['NEW'], attempted: false, firstFailure: undefined };
    for (const phase of r.history.slice(1)) replay = transition(replay, phase, r.firstFailure?.reason);
    if (replay.attempted !== r.attempted || JSON.stringify(replay.firstFailure) !== JSON.stringify(r.firstFailure)) throw Error('ledger history contradiction');
  }
  return data.records;
}

/** Web Locks serialize only clients using this SAME name and storage bucket.
 * ifAvailable refuses contention instead of silently waiting/retrying stale input. */
export function webExclusive(locks: LockManager): ExclusiveLock {
  return async work => await locks.request(LOCK_NAME, { mode: 'exclusive', ifAvailable: true }, lock => {
    if (!lock) throw Error('lock unavailable');
    return work();
  });
}

export class StorageSafetyCoordinator {
  private busy = false;
  private poisoned = false; // journal failure in this process: no automatic continuation
  constructor(private readonly store: Store, private readonly exclusive: ExclusiveLock, private readonly checkpoint: Checkpoint = () => {}) {}

  inspect(): RecordEntry[] {
    // Nonterminal persisted intent is UNKNOWN even if current bytes equal candidate.
    return readLedger(this.store).map(r => terminal(r.phase) ? clone(r) : {
      ...clone(r), phase: 'UNKNOWN', firstFailure: r.firstFailure ?? { phase: r.phase, reason: 'interrupted; no result inference on restart' },
    });
  }

  async selection(id: string, candidate: SafetyCandidate, read: () => SafetyContext): Promise<Result> {
    // Snapshot caller-owned objects before the asynchronous lock acquisition.
    const frozen = clone(candidate);
    return this.run(id, 'selection', frozen.context.currentRaw, frozen.raw ?? '', (afterWrite = false) => {
      if (revalidateSafety(frozen, () => {
        const now = read();
        if (afterWrite) {
          if (now.currentRaw !== frozen.raw) throw Error('post-write source differs from candidate');
          // Recheck unchanged input identity/selection/rules against the original
          // plan, after independently checking the ACTUAL candidate bytes above.
          return { ...now, currentRaw: frozen.context.currentRaw };
        }
        return now;
      }).status !== 'PASS') throw Error('selection preflight stale/blocked/unknown');
    });
  }

  /** Synthetic ordinary writer uses the very same gate/lock/journal/backup path.
   * Existing product saveData is intentionally NOT redirected here. */
  ordinary(id: string, expected: string | null, raw: string): Promise<Result> {
    return this.run(id, 'ordinary', expected, raw, () => {});
  }

  /** Explicit, separately recorded experiment. No automatic rollback, and the
   * original operation is never rewritten/promoted by recovery. */
  async recover(id: string, originalId: string, expectedCurrent: string | null, approved: boolean): Promise<Result> {
    try {
      if (!approved) throw Error('explicit recovery approval required');
      const original = this.inspect().find(r => r.id === originalId);
      if (!original || original.phase !== 'UNKNOWN' || !original.copy || original.copy.raw === null) throw Error('no identified recoverable preservation');
      const copy = clone(original.copy);
      return this.run(id, 'recovery', expectedCurrent, copy.raw!, () => {
        if (!readRecoveryCopies(this.store).some(c => c.key === copy.key && c.serialized === copy.serialized && c.raw === copy.raw)) throw Error('recovery copy changed');
      }, originalId);
    } catch (e) { return this.refused(String(e)); }
  }

  private refused(reason: string): Result { return { phase: 'REFUSED', reason, executionAllowed: false, assurance: 'UNKNOWN' }; }

  private async run(id: string, kind: RecordEntry['kind'], original: string | null, raw: string, validate: (afterWrite?: boolean) => void, recoveryOf?: string): Promise<Result> {
    if (this.busy || this.poisoned) return this.refused('same-tab writer busy or journal uncertainty HOLD');
    this.busy = true;
    let record: RecordEntry | undefined;
    let ledger: RecordEntry[] = [];
    const persist = () => {
      if (!record) throw Error('missing record');
      const records = [...ledger.filter(r => r.id !== id), record];
      const serialized = JSON.stringify({ version: 1, records });
      this.store.setItem(LEDGER_KEY, serialized);
      if (this.store.getItem(LEDGER_KEY) !== serialized) throw Error('journal readback mismatch');
      ledger = clone(records);
    };
    const step = async (phase: Phase) => {
      record = transition(record!, phase); persist(); await this.checkpoint(phase);
    };
    try {
      return await this.exclusive(async () => {
        try {
          ledger = readLedger(this.store);
          if (!id || ledger.some(r => r.id === id)) return this.refused('operation ID already used');
          if (ledger.some(r => (r.phase === 'UNKNOWN' || !terminal(r.phase)) && r.id !== recoveryOf)) return this.refused('unresolved operation HOLD');
          if (recoveryOf && !ledger.some(r => r.id === recoveryOf && (r.phase === 'UNKNOWN' || !terminal(r.phase)))) return this.refused('recovery target no longer UNKNOWN');
          record = { id, kind, recoveryOf, original, candidate: raw, phase: 'NEW', history: ['NEW'], attempted: false, executionAllowed: false };
          persist();
          await step('CHECKING');
          validate();
          if (!validateRestoreRaw(raw).ok || this.store.getItem(STORAGE_KEY) !== original) throw Error('candidate invalid or current changed');
          await step('PRESERVING');
          // Share format, limits, immutable slots and strict readback with full restore.
          const copy = preserveRestoreSource(this.store, original, () => { validate(); return true; });
          if (!copy.ok) throw Error(`preservation unconfirmed: ${copy.message}`);
          record.copy = copy.copy;
          await step('PRESERVED');
          await step('PREPARING');
          validate();
          if (this.store.getItem(STORAGE_KEY) !== original || this.store.getItem(copy.copy.key) !== copy.copy.serialized) throw Error('source or preservation changed');
          // Persist uncertainty BEFORE invoking primary setItem. A crash after this
          // point is never classified as a proven pre-write refusal on restart.
          await step('WRITING');
          validate();
          if (this.store.getItem(copy.copy.key) !== copy.copy.serialized || this.store.getItem(STORAGE_KEY) !== original) throw Error('final source/copy changed after intent');
          this.store.setItem(STORAGE_KEY, raw); // Exactly one primary key write.
          await step('READING');
          validate(true);
          if (this.store.getItem(STORAGE_KEY) !== raw || this.store.getItem(copy.copy.key) !== copy.copy.serialized) throw Error('post-write readback/copy mismatch');
          record = transition(record, 'OBSERVED_MATCH');
          persist(); // failure here is UNKNOWN, despite matched primary bytes
          return { phase: record.phase, record: clone(record), executionAllowed: false, assurance: 'COOPERATIVE_OBSERVATION_ONLY' };
        } catch (e) {
          if (!record) return this.refused(String(e));
          // A completed terminal record cannot be advanced. Failure to persist its
          // result is a new uncertainty, retaining any original failure.
          if (record.phase === 'OBSERVED_MATCH') record = { ...record, phase: 'READING', history: record.history.slice(0,-1) };
          record = transition(record, record.attempted ? 'UNKNOWN' : 'REFUSED', String(e));
          try { persist(); } catch { this.poisoned = true; }
          return { phase: record.phase, record: clone(record), executionAllowed: false, assurance: 'UNKNOWN' };
        }
      });
    } catch (e) {
      // Lock failure after work ran cannot erase the already-attempted outcome.
      this.poisoned = !!record;
      if (record) {
        const reason = `lock lifecycle failure: ${String(e)}`;
        if (record.phase === 'OBSERVED_MATCH') record = { ...record, phase: 'READING', history: record.history.slice(0,-1) };
        if (!terminal(record.phase)) record = transition(record, record.attempted ? 'UNKNOWN' : 'REFUSED', reason);
        // Do not write the ledger after ownership was lost. A previously saved
        // OBSERVED_MATCH is only the truthful earlier readback observation, never
        // a restart-time permission or proof that lock release succeeded.
        return { phase: record.phase, record: clone(record), reason, executionAllowed: false, assurance: 'UNKNOWN' };
      }
      return this.refused(String(e));
    } finally { this.busy = false; }
  }
}

export { STORAGE_KEY, RECOVERY_KEYS };
