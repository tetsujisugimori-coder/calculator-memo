import { executeStorageOperation, isStorageUncertain, type StorageOperationResult } from './storage-facade';
import { STORAGE_KEY } from './storage-format';
import type { StoredData } from './types';
export { STORAGE_KEY, defaultData, loadData } from './storage-format';
export type { StorageLoadFailureReason, StorageLoadResult, StorageProtectionReason } from './storage-format';
export { withStorageWriteLock, isStorageLockUncertain } from './storage-facade';
type WritableStorage = Pick<Storage, 'getItem' | 'setItem'>;

/** Legacy sync compatibility helper, unused by the product UI. It now enters
 * the facade and requires verified readback. Its baseline is acquired NOW, not
 * at the caller's edit start, and it cannot acquire an async Web Lock. New
 * callers must use runStorageOperation with their captured expectedRaw instead. */
export function saveData(data: StoredData, storage?: WritableStorage): boolean {
  try {
    const target = storage ?? localStorage;
    return executeStorageOperation({ kind: 'ordinary-save', writer: 'legacy-save-data', data, expectedRaw: target.getItem(STORAGE_KEY) }, target).status === 'VERIFIED';
  } catch { return false; }
}
export type CheckedSaveResult = { ok: true; raw: string } | { ok: false; reason: 'conflict' | 'invalid' | 'unavailable' | 'uncertain' | 'blocked' };
function checked(result: StorageOperationResult): CheckedSaveResult {
  if (result.status === 'VERIFIED' && result.raw !== undefined) return { ok: true, raw: result.raw };
  if (isStorageUncertain(result)) return { ok: false, reason: 'uncertain' };
  return { ok: false, reason: result.status === 'CONFLICT' ? 'conflict' : result.status === 'INVALID' ? 'invalid' : result.status === 'BLOCKED' ? 'blocked' : 'unavailable' };
}
/** Caller owns the existing shared lock; same synchronous byte contract. */
export function saveDataChecked(data: StoredData, expectedRaw: string | null, storage?: WritableStorage, writer = 'ordinary-save', valid?: () => boolean): CheckedSaveResult {
  return checked(executeStorageOperation({ kind: 'ordinary-save', writer, data, expectedRaw, valid }, storage));
}
/** Explicit destructive-confirmation boundary. The UI uses the checked result
 * so UNKNOWN is terminal rather than being flattened into retryable false. */
export function resetStoredDataChecked(expectedRaw: string | null, storage?: WritableStorage, approvedAndCurrent: () => boolean = () => true): CheckedSaveResult {
  return checked(executeStorageOperation({ kind: 'reset', writer: 'reset-confirmation', expectedRaw, approvedAndCurrent }, storage));
}
/** Kept for existing consumers. false is never proof that no write happened. */
export function resetStoredData(expectedRaw: string | null, storage?: WritableStorage): boolean {
  return resetStoredDataChecked(expectedRaw, storage).ok;
}
