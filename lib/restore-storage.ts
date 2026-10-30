import { MAX_RAW_CODE_UNITS } from './backup';
import { STORAGE_KEY } from './storage';
import { parseStrictJson, validateRestoreRaw } from './restore-validation';

// Separate immutable recovery namespace, not a restore destination or an export entry.
export const RECOVERY_KEYS = Array.from({ length: 8 }, (_, i) => `calculation-memo:restore-recovery:v1:${i}`);
export const MAX_RECOVERY_CODE_UNITS = 4 * 1024 * 1024;
type Store = Pick<Storage, 'getItem' | 'setItem'>;
export type RecoveryCopy = { key: string; serialized: string; raw: string | null; createdAt: string };
type Preservation = { ok: true; copy: RecoveryCopy } | { ok: false; message: string };

/** Only known recovery slots are inspected; occupied slots are never replaced/deleted. */
export function readRecoveryCopies(storage: Pick<Storage, 'getItem'>): RecoveryCopy[] {
  const copies: RecoveryCopy[] = [];
  let total = 0;
  for (const key of RECOVERY_KEYS) {
    const serialized = storage.getItem(key);
    if (serialized === null) continue;
    total += serialized.length;
    if (total > MAX_RECOVERY_CODE_UNITS) throw Error('保全領域の容量上限を超えています。既存コピーは変更しません。');
    const value = parseStrictJson(serialized) as Record<string, unknown>;
    if (!value || typeof value !== 'object' || Array.isArray(value)
      || value.format !== 'calculator-memo-recovery' || value.version !== 1 || value.sourceKey !== STORAGE_KEY
      || !(value.raw === null || typeof value.raw === 'string')
      || (typeof value.raw === 'string' && value.raw.length > MAX_RAW_CODE_UNITS)
      || value.utf16CodeUnits !== (value.raw === null ? null : value.raw.length)
      || typeof value.createdAt !== 'string' || !Number.isFinite(Date.parse(value.createdAt)))
      throw Error('復旧コピーを検証できません。既存コピーを上書きせず停止しました。');
    copies.push({ key, serialized, raw: value.raw as string | null, createdAt: value.createdAt });
  }
  return copies;
}

/** Caller holds the shared write lock. No mutation of the primary data key. */
export function preserveRestoreSource(storage: Store, expectedRaw: string | null, valid = () => true): Preservation {
  try {
    if (!valid() || (expectedRaw !== null && expectedRaw.length > MAX_RAW_CODE_UNITS) || storage.getItem(STORAGE_KEY) !== expectedRaw)
      return { ok: false, message: '保存原文が変化したか、確認状態または容量が不適切です。再度ファイルを選択してください。' };
    const copies = readRecoveryCopies(storage);
    const existing = copies.find(copy => copy.raw === expectedRaw);
    if (existing) {
      if (!valid() || storage.getItem(existing.key) !== existing.serialized || storage.getItem(STORAGE_KEY) !== expectedRaw)
        throw Error('保全確認中に保存内容が変わりました。');
      return { ok: true, copy: existing };
    }
    const key = RECOVERY_KEYS.find(key => !copies.some(copy => copy.key === key));
    if (!key) throw Error('復旧コピーが8件に達しています。既存コピーを削除せず復元を停止しました。');
    const createdAt = new Date().toISOString();
    const serialized = JSON.stringify({ format: 'calculator-memo-recovery', version: 1, createdAt, sourceKey: STORAGE_KEY, raw: expectedRaw, utf16CodeUnits: expectedRaw === null ? null : expectedRaw.length });
    if (copies.reduce((n, copy) => n + copy.serialized.length, serialized.length) > MAX_RECOVERY_CODE_UNITS)
      throw Error('復旧コピーの合計容量上限を超えるため停止しました。');
    if (!valid() || storage.getItem(key) !== null || storage.getItem(STORAGE_KEY) !== expectedRaw) throw Error('保全直前に保存内容が変わりました。');
    storage.setItem(key, serialized);
    if (storage.getItem(key) !== serialized || storage.getItem(STORAGE_KEY) !== expectedRaw || !valid()) throw Error('保全コピーの読戻し、または現在原文の一致を確認できません。');
    return { ok: true, copy: { key, serialized, raw: expectedRaw, createdAt } };
  } catch (cause) {
    return { ok: false, message: cause instanceof Error ? cause.message : '現在原文を保全できません。保存データは置き換えていません。' };
  }
}

export type RestoreWriteResult = { status: 'verified' } | { status: 'aborted' | 'unknown'; message: string };
/** No automatic rollback: a later writer's bytes must never be overwritten.
 * A verified readback is NOT a disk durability or atomic compare-and-swap claim. */
export function restoreRaw(storage: Store, raw: string, expectedRaw: string | null, copy: RecoveryCopy, approvedAndCurrent: () => boolean): RestoreWriteResult {
  let attempted = false;
  try {
    const checked = validateRestoreRaw(raw);
    if (!checked.ok || !approvedAndCurrent() || !RECOVERY_KEYS.includes(copy.key) || copy.raw !== expectedRaw
      || !readRecoveryCopies(storage).some(current => current.key === copy.key && current.serialized === copy.serialized && current.raw === expectedRaw)
      || storage.getItem(STORAGE_KEY) !== expectedRaw)
      return { status: 'aborted', message: '原文・保全コピー・承認・確認状態のいずれかが失効しました。上書きせず停止しました。' };
    // Keep final checks adjacent to the write; no awaits in this critical section.
    if (storage.getItem(copy.key) !== copy.serialized || !approvedAndCurrent() || storage.getItem(STORAGE_KEY) !== expectedRaw)
      return { status: 'aborted', message: '復元直前に保存内容が変わりました。上書きしていません。' };
    attempted = true;
    storage.setItem(STORAGE_KEY, raw);
    if (storage.getItem(STORAGE_KEY) !== raw || !approvedAndCurrent())
      return { status: 'unknown', message: '書込み後の原文一致または確認状態を確認できません（UNKNOWN）。自動再試行・巻戻しはしません。復旧コピーを保管し、再読込前に保存原文を確認してください。' };
    return { status: 'verified' };
  } catch {
    return attempted
      ? { status: 'unknown', message: '書込みを試みましたが結果を確認できません（UNKNOWN）。保存済みの可能性があるため再試行・自動巻戻しはしません。復旧コピーは保持しています。' }
      : { status: 'aborted', message: '保存領域または復旧コピーを確認できず停止しました。保存原文は置き換えていません。' };
  }
}
