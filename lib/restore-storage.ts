import { executeStorageOperation, isStorageUncertain, type StorageOutcome } from './storage-facade';
import type { RecoveryCopy } from './recovery-records';
export { RECOVERY_KEYS, MAX_RECOVERY_CODE_UNITS, readRecoveryCopies } from './recovery-records';
export type { RecoveryCopy } from './recovery-records';
type Store = Pick<Storage, 'getItem' | 'setItem'>;
export type Preservation = { ok: true; copy: RecoveryCopy } | { ok: false; message: string; status: StorageOutcome; uncertain: boolean };
/** Caller holds the existing shared write lock. Unknown preservation also freezes
 * subsequent primary writes: a thrown set may have created the recovery copy. */
export function preserveRestoreSource(storage: Store, expectedRaw: string | null, valid = () => true): Preservation {
  const result = executeStorageOperation({ kind: 'preserve', writer: 'restore-preservation', expectedRaw, valid }, storage);
  return result.status === 'VERIFIED' && result.copy ? { ok: true, copy: result.copy }
    : { ok: false, status: result.status, uncertain: isStorageUncertain(result), message: result.message };
}
export type RestoreWriteResult = { status: 'verified' } | { status: 'aborted' | 'unknown'; message: string };
/** No automatic rollback or retry. VERIFIED means observed raw readback only. */
export function restoreRaw(storage: Store, raw: string, expectedRaw: string | null, copy: RecoveryCopy, approvedAndCurrent: () => boolean): RestoreWriteResult {
  const result = executeStorageOperation({ kind: 'full-restore', writer: 'full-restore-confirmation', raw, expectedRaw, copy, approvedAndCurrent }, storage);
  return result.status === 'VERIFIED' ? { status: 'verified' }
    : { status: isStorageUncertain(result) ? 'unknown' : 'aborted', message: result.message };
}
