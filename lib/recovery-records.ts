import { MAX_RAW_CODE_UNITS } from './backup';
import { STORAGE_KEY } from './storage-format';
import { parseStrictJson } from './restore-validation';

// Separate immutable recovery namespace, not a restore destination or an export entry.
export const RECOVERY_KEYS = Array.from({ length: 8 }, (_, i) => `calculation-memo:restore-recovery:v1:${i}`);
export const MAX_RECOVERY_CODE_UNITS = 4 * 1024 * 1024;
export type RecoveryCopy = { key: string; serialized: string; raw: string | null; createdAt: string };

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
