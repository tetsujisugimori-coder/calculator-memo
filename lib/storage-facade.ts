import { localStorageAdapter, type StorageAccess, type StorageAdapter } from './localstorage-adapter';
import { cloneDefaultData, loadData, readStoredNotes, STORAGE_KEY } from './storage-format';
import { MAX_RAW_CODE_UNITS } from './backup';
import { MAX_RECOVERY_CODE_UNITS, RECOVERY_KEYS, readRecoveryCopies, type RecoveryCopy } from './recovery-records';
import { inspectRecoverySlot, sameRecoverySnapshot, type RecoverySnapshot } from './recovery-reader';
import { validateRestoreRaw } from './restore-validation';
import { recoverySessionActive, RECOVERY_SESSION_LOCK, registerStorageMutation, withStorageWriteLock } from './storage-lock';
import type { StoredData } from './types';
export { withStorageWriteLock, isStorageLockUncertain } from './storage-lock';
export type { StorageAccess, StorageAdapter } from './localstorage-adapter';

type RequestContext = {
  writer: string;
  /** Diagnostic only. Never persisted and never used as a receipt or generation. */
  operationId?: string;
  /** Rechecked synchronously after lock acquisition and immediately before mutation. */
  valid?: () => boolean;
};
export type StorageOperation = RequestContext & (
  | { kind: 'ordinary-save'; data: StoredData; expectedRaw: string | null }
  | { kind: 'reset'; expectedRaw: string | null; approvedAndCurrent: () => boolean }
  | { kind: 'preserve'; expectedRaw: string | null }
  | { kind: 'full-restore'; raw: string; expectedRaw: string | null; copy: RecoveryCopy; approvedAndCurrent: () => boolean }
  | { kind: 'recovery-delete'; key: string; snapshot: RecoverySnapshot; approvedAndCurrent: () => boolean }
  | { kind: 'selective-restore'; executionAllowed: false }
);
export type StorageOutcome = 'VERIFIED' | 'CONFLICT' | 'INVALID' | 'UNAVAILABLE' | 'UNKNOWN' | 'BLOCKED';
export type StorageDiagnostic = {
  operationId: string; writer: string; operation: StorageOperation['kind'];
  phase: 'admission' | 'validation' | 'mutation' | 'readback' | 'lock';
  mutationAttempted: boolean; hold: boolean;
};
export type StorageOperationResult = {
  status: StorageOutcome; message: string; diagnostic: StorageDiagnostic;
  raw?: string; copy?: RecoveryCopy;
};
let nextOperation = 0;
const holds = new WeakMap<object, StorageDiagnostic>();
// Module-private capability issued only inside the exclusive session lease.
const deletionLease = Symbol('recovery-delete-lease');
const unknownMessage = '書込みを試みましたが結果を確認できません（UNKNOWN）。自動再試行・巻戻しを停止しました。原文と保全コピーを確認し、必要なら明示的に再読み込みしてください。';
function diagnostic(request: StorageOperation): StorageDiagnostic {
  return { operationId: request.operationId ?? `runtime-write-${++nextOperation}`, writer: request.writer, operation: request.kind, phase: 'admission', mutationAttempted: false, hold: false };
}
/** The only mutation coordinator. Sync helpers use this inside the existing
 * caller-owned lock; runStorageOperation acquires it for standalone async use.
 * The adapter seam does NOT claim CAS, durable receipt, protocol authority or an
 * IDB transaction. Old/non-cooperating tabs and ABA remain outside the guarantee. */
export function executeStorageOperation(request: StorageOperation, storage?: StorageAccess): StorageOperationResult {
  return executeStorageOperationInternal(request, storage);
}
function executeStorageOperationInternal(request: StorageOperation, storage?: StorageAccess, lease?: symbol): StorageOperationResult {
  try { return executeWithAdapterInternal(request, localStorageAdapter(storage), lease); }
  catch { return { status: 'UNAVAILABLE', message: '保存領域を利用できません。書込みを開始していません。', diagnostic: diagnostic(request) }; }
}
/** Adapter injection seam, not an alternate write policy. */
export function executeWithAdapter(request: StorageOperation, adapter: StorageAdapter): StorageOperationResult {
  return executeWithAdapterInternal(request, adapter);
}
function executeWithAdapterInternal(request: StorageOperation, adapter: StorageAdapter, lease?: symbol): StorageOperationResult {
  const info = diagnostic(request);
  const result = (status: StorageOutcome, message: string, value: { raw?: string; copy?: RecoveryCopy } = {}): StorageOperationResult => {
    if (status === 'UNKNOWN') { info.hold = true; holds.set(adapter.identity, { ...info }); }
    return { status, message, diagnostic: { ...info }, ...value };
  };
  const blocked = () => result('BLOCKED', '承認または確認状態が失効しています。書込みを停止しました。');
  const conflict = () => result('CONFLICT', '保存原文または保全領域が変化しました。上書きせず停止しました。');
  const valid = () => (!request.valid || request.valid()) &&
    (!('approvedAndCurrent' in request) || request.approvedAndCurrent());
  const reader = { getItem: (key: string) => adapter.read(key) };
  const write = (key: string, raw: string) => {
    info.phase = 'mutation'; info.mutationAttempted = true; // BEFORE the call, including throw-after-write.
    registerStorageMutation(() => { info.phase = 'lock'; result('UNKNOWN', unknownMessage); });
    adapter.write(key, raw);
    info.phase = 'readback';
  };
  const changedAfter = () => result(info.mutationAttempted ? 'UNKNOWN' : 'CONFLICT', info.mutationAttempted ? unknownMessage : '保存確認中に原文が変わりました。');
  try {
    if (request.kind === 'recovery-delete' && lease !== deletionLease) return result('BLOCKED', '個別削除には共通窓口の非同期ロック取得が必要です。同期APIからの削除は許可されていません。');
    if (request.kind === 'selective-restore') return result('BLOCKED', 'Stage 3A executionAllowed=false / Stage 3B HOLD。選択復元の実書込みは許可されていません。');
    if (holds.has(adapter.identity)) { info.hold = true; return result('BLOCKED', '先行操作がUNKNOWNのため、この画面の保存はHOLD中です。自動再試行しません。'); }
    if (!request.writer || !valid()) return blocked();
    if (request.kind === 'recovery-delete' ? !adapter.canRemove : !adapter.canSet)
      return result('UNAVAILABLE', '必要な保存APIを利用できません。書込みを開始していません。');
    info.phase = 'validation';
    if (request.kind === 'ordinary-save' || request.kind === 'reset') {
      const current = adapter.read(STORAGE_KEY);
      if (current !== request.expectedRaw) {
        if (request.kind === 'ordinary-save' && loadData({ getItem: () => current }).status === 'error') return result('INVALID', '保存先を安全に読み取れません。元データを保護しています。');
        return conflict();
      }
      let raw: string;
      if (request.kind === 'ordinary-save') {
        // Never silently repair an invalid existing destination.
        const destination = loadData(reader);
        if (destination.status === 'error') return result(destination.reason === 'storage-unavailable' ? 'UNAVAILABLE' : 'INVALID', destination.message);
        try { readStoredNotes(request.data.notes); raw = JSON.stringify(request.data); }
        catch { return result('INVALID', '保存候補をJSONに変換できません。'); }
        if (typeof raw !== 'string' || loadData({ getItem: () => raw }).status !== 'ok') return result('INVALID', '保存候補の形式が不正です。');
      } else raw = JSON.stringify(cloneDefaultData());
      if (!valid()) return blocked();
      if (adapter.read(STORAGE_KEY) !== request.expectedRaw) return conflict();
      if (raw !== request.expectedRaw) write(STORAGE_KEY, raw);
      if (adapter.read(STORAGE_KEY) !== raw || !valid()) return changedAfter();
      return result('VERIFIED', '保存原文の読戻し一致を確認しました。端末ディスクへの永続化は保証しません。', { raw });
    }
    if (request.kind === 'preserve') {
      if (request.expectedRaw !== null && request.expectedRaw.length > MAX_RAW_CODE_UNITS) return result('INVALID', '保存原文が保全容量上限を超えています。');
      if (adapter.read(STORAGE_KEY) !== request.expectedRaw) return conflict();
      // Read first, parse second: IO errors remain UNAVAILABLE; corrupt records INVALID.
      const slotBytes = new Map(RECOVERY_KEYS.map(key => [key, adapter.read(key)]));
      let copies: RecoveryCopy[];
      try { copies = readRecoveryCopies({ getItem: key => slotBytes.get(key) ?? null }); }
      catch { return result('INVALID', '保全領域を検証できません。既存コピーは変更しません。'); }
      const existing = copies.find(copy => copy.raw === request.expectedRaw);
      if (existing) {
        if (!valid()) return blocked();
        if (adapter.read(existing.key) !== existing.serialized || adapter.read(STORAGE_KEY) !== request.expectedRaw) return conflict();
        return result('VERIFIED', '同じ原文の既存保全コピーを読戻し確認しました。', { copy: existing });
      }
      const key = RECOVERY_KEYS.find(key => slotBytes.get(key) === null);
      if (!key) return result('BLOCKED', '復旧コピーが8件に達しています。既存コピーを削除せず停止しました。');
      const createdAt = new Date().toISOString();
      const serialized = JSON.stringify({ format: 'calculator-memo-recovery', version: 1, createdAt, sourceKey: STORAGE_KEY, raw: request.expectedRaw, utf16CodeUnits: request.expectedRaw === null ? null : request.expectedRaw.length });
      if (copies.reduce((n, copy) => n + copy.serialized.length, serialized.length) > MAX_RECOVERY_CODE_UNITS) return result('BLOCKED', '復旧コピーの合計容量上限を超えるため停止しました。');
      if (!valid()) return blocked();
      if (RECOVERY_KEYS.some(slot => adapter.read(slot) !== slotBytes.get(slot)) || adapter.read(STORAGE_KEY) !== request.expectedRaw) return conflict();
      write(key, serialized);
      if (adapter.read(key) !== serialized || adapter.read(STORAGE_KEY) !== request.expectedRaw || !valid()
        || RECOVERY_KEYS.some(slot => slot !== key && adapter.read(slot) !== slotBytes.get(slot))) return changedAfter();
      return result('VERIFIED', '保全コピーと原文・他コピーの不変を読戻し確認しました。', { copy: { key, serialized, raw: request.expectedRaw, createdAt } });
    }
    if (request.kind === 'full-restore') {
      if (!validateRestoreRaw(request.raw).ok) return result('INVALID', '復元原文を検証できません。');
      const { copy } = request;
      if (!RECOVERY_KEYS.includes(copy.key) || copy.raw !== request.expectedRaw) return result('INVALID', '対象の保全コピーが不正です。');
      const bytes = new Map(RECOVERY_KEYS.map(key => [key, adapter.read(key)]));
      let copies: RecoveryCopy[];
      try { copies = readRecoveryCopies({ getItem: key => bytes.get(key) ?? null }); }
      catch { return result('INVALID', '保全コピーを検証できません。'); }
      if (!copies.some(current => current.key === copy.key && current.serialized === copy.serialized && current.raw === request.expectedRaw)) return conflict();
      if (!valid()) return blocked();
      if (adapter.read(copy.key) !== copy.serialized || adapter.read(STORAGE_KEY) !== request.expectedRaw) return conflict();
      write(STORAGE_KEY, request.raw);
      if (adapter.read(STORAGE_KEY) !== request.raw || adapter.read(copy.key) !== copy.serialized || !valid()) return changedAfter();
      return result('VERIFIED', '復元原文の読戻し一致を確認しました。', { raw: request.raw });
    }
    if (request.kind === 'recovery-delete') {
      const { snapshot, key } = request;
      const slot = snapshot.slots.find(item => item.key === key);
      if (!RECOVERY_KEYS.includes(key) || slot?.status !== 'valid' || !slot.copy) return result('INVALID', '個別削除の対象を同定できません。');
      if (!sameRecoverySnapshot(reader, snapshot)) return conflict();
      const checked = inspectRecoverySlot(key, adapter.read(key));
      if (checked.status !== 'valid' || checked.copy?.serialized !== slot.copy.serialized) return result('INVALID', '削除対象を検証できません。');
      if (!valid()) return blocked();
      if (!sameRecoverySnapshot(reader, snapshot)) return conflict();
      info.phase = 'mutation'; info.mutationAttempted = true;
      registerStorageMutation(() => { info.phase = 'lock'; result('UNKNOWN', unknownMessage); });
      adapter.remove(key);
      info.phase = 'readback';
      if (adapter.read(key) !== null || adapter.read(STORAGE_KEY) !== snapshot.currentRaw
        || snapshot.slots.some(item => item.key !== key && adapter.read(item.key) !== item.serialized) || !valid()) return changedAfter();
      return result('VERIFIED', '対象1件の不存在と現在原文・他コピーの不変を読戻し確認しました。端末ディスクへの永続化は保証しません。');
    }
    return result('BLOCKED', '未対応の保存操作です。');
  } catch {
    return info.mutationAttempted ? result('UNKNOWN', unknownMessage) : result('UNAVAILABLE', '保存状態または事前条件を確認できず停止しました。書込みを開始していません。');
  }
}
/** Async entry for new callers. Never nest inside withStorageWriteLock.
 * Recovery deletion retains the stronger exclusive session lease requirement. */
export async function runStorageOperation(request: StorageOperation, storage?: StorageAccess): Promise<StorageOperationResult> {
  let observed: StorageOperationResult | undefined;
  let live = true;
  const refused = (status: 'BLOCKED' | 'UNAVAILABLE', message: string): StorageOperationResult => ({ status, message, diagnostic: { ...diagnostic(request), phase: 'lock' } });
  const run = () => withStorageWriteLock(() => { observed = executeStorageOperation(request, storage); return observed; });
  try {
    if (request.kind !== 'recovery-delete') return await run();
    if (typeof navigator === 'undefined' || !navigator.locks) return refused('UNAVAILABLE', 'Web Locksを利用できないため安全な個別削除を停止しています。');
    if (recoverySessionActive() || !request.approvedAndCurrent()) return refused('BLOCKED', '復元画面が使用中、または承認が失効しています。削除していません。');
    return await navigator.locks.request(RECOVERY_SESSION_LOCK, { mode: 'exclusive', ifAvailable: true }, async lock => {
      if (!live) return refused('BLOCKED', '個別削除ロック要求は失効しました。削除していません。');
      if (!lock) return refused('BLOCKED', '別タブで復元画面を使用中です。削除していません。');
      const originalValid = request.valid;
      const guarded = { ...request, valid: () => live && !recoverySessionActive() && (!originalValid || originalValid()) };
      return await withStorageWriteLock(() => { observed = executeStorageOperationInternal(guarded, storage, deletionLease); return observed; });
    });
  } catch {
    // An exception after a mutation callback is not a successful lock protocol.
    // Preserve uncertainty and HOLD even when raw readback had succeeded.
    if (observed?.diagnostic.mutationAttempted) {
      const info = { ...observed.diagnostic, phase: 'lock' as const, hold: true };
      try { holds.set(localStorageAdapter(storage).identity, info); } catch { /* Already latched by mutation hook when available. */ }
      return { status: 'UNKNOWN', message: unknownMessage, diagnostic: info };
    }
    if (observed && isStorageUncertain(observed)) return observed;
    return refused('UNAVAILABLE', 'ロックを取得できず保存を停止しました。ロックなしで再試行しません。');
  } finally { live = false; }
}
/** Compatibility conversions must preserve HOLD as non-retryable uncertainty. */
export function isStorageUncertain(result: StorageOperationResult): boolean {
  return result.status === 'UNKNOWN' || result.diagnostic.hold;
}
