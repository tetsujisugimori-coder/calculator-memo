import { STORAGE_KEY } from './storage-format';
let writeQueue: Promise<unknown> = Promise.resolve();
type WriteScope = { unknown: Array<() => void> };
let synchronousScope: WriteScope | undefined;
export class StorageLockUncertainError extends Error {
  constructor() { super('保存操作後にロック処理が失敗し結果はUNKNOWNです。自動再試行を停止しました。'); }
}
/** Facade calls this BEFORE mutation. Hooks contain no source data. All product
 * mutation callbacks are synchronous, even though acquisition is asynchronous. */
export function registerStorageMutation(onUnknown: () => void): void {
  synchronousScope?.unknown.push(onUnknown);
}
export function isStorageLockUncertain(cause: unknown): boolean { return cause instanceof StorageLockUncertainError; }
/** All current application writers use this same lock. No retry/fallback after
 * request rejection. API absence retains the existing same-tab-only queue. */
export function withStorageWriteLock<T>(write: () => T | Promise<T>): Promise<T> {
  const run = async (): Promise<T> => {
    let live = true;
    const scope: WriteScope = { unknown: [] };
    const invoke = () => {
      // Synthetic broken LockManager may call back after rejecting its request.
      if (!live) throw Error('保存ロック要求は失効しました。書込みは開始しません。');
      const previous = synchronousScope;
      synchronousScope = scope;
      try { return write(); }
      finally { synchronousScope = previous; }
    };
    try {
      return typeof navigator !== 'undefined' && navigator.locks
        // Keep the historical async callback contract. In Node 24 a sync throw
        // can strand the native lock, whereas a rejected callback Promise releases it.
        ? await navigator.locks.request(`${STORAGE_KEY}:write`, async () => invoke()) : await invoke();
    } catch (cause) {
      if (scope.unknown.length) {
        for (const hold of scope.unknown) hold();
        throw new StorageLockUncertainError();
      }
      throw cause;
    } finally { live = false; }
  };
  const result = writeQueue.then(run, run);
  writeQueue = result.catch(() => undefined);
  return result;
}
export const RECOVERY_SESSION_LOCK = `${STORAGE_KEY}:recovery-session`;
let localRestoreSessions = 0;
export function recoverySessionActive(): boolean { return localRestoreSessions > 0; }
/** Shared lease protects copies while a full-restore UI is open. */
export function holdRecoverySession(ready: (ok: boolean) => void): () => void {
  localRestoreSessions++;
  let released = false;
  let release: () => void = () => undefined;
  const held = new Promise<void>(resolve => { release = resolve; });
  if (typeof navigator === 'undefined' || !navigator.locks) ready(true);
  else void navigator.locks.request(RECOVERY_SESSION_LOCK, { mode: 'shared' }, async () => {
    if (!released) ready(true);
    await held;
  }).catch(() => { if (!released) ready(false); });
  return () => { if (released) return; released = true; localRestoreSessions--; release(); };
}
