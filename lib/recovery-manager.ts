import { isStorageUncertain, runStorageOperation } from './storage-facade';
import type { RecoverySnapshot } from './recovery-reader';
export { readRecoverySnapshot, exportRecoveryCopy } from './recovery-reader';
export type { RecoverySlot, RecoverySnapshot } from './recovery-reader';
export { holdRecoverySession, RECOVERY_SESSION_LOCK } from './storage-lock';
export const RECOVERY_CHANGED_EVENT = 'calculator-memo:recovery-changed';
export function notifyRecoveryChanged(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(RECOVERY_CHANGED_EVENT));
}
export type RecoveryDeleteResult = { status: 'verified' | 'aborted' | 'unknown'; message: string };
/** The facade acquires the exclusive recovery session + common write lock. */
export async function deleteRecoveryCopy(storage: Pick<Storage, 'getItem' | 'removeItem'>, snapshot: RecoverySnapshot, key: string, approvedAndCurrent: () => boolean): Promise<RecoveryDeleteResult> {
  const result = await runStorageOperation({ kind: 'recovery-delete', writer: 'recovery-delete-confirmation', snapshot, key, approvedAndCurrent }, storage);
  return { status: result.status === 'VERIFIED' ? 'verified' : isStorageUncertain(result) ? 'unknown' : 'aborted', message: result.message };
}
