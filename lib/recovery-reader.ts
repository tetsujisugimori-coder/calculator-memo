import { collectBackup, serializeBackup, type Backup, MAX_RAW_CODE_UNITS } from './backup';
import { RECOVERY_KEYS, MAX_RECOVERY_CODE_UNITS, type RecoveryCopy } from './recovery-records';
import { parseStrictJson, validateRestoreRaw } from './restore-validation';
import { STORAGE_KEY } from './storage-format';
type Reader = Pick<Storage, 'getItem'>;
export type RecoverySlot = { key: string; serialized: string | null; status: 'empty' | 'valid' | 'invalid' | 'unknown-version' | 'unavailable'; copy: RecoveryCopy | null; backup: Backup | null; restoreValid: boolean; message: string };
export type RecoverySnapshot = { slots: RecoverySlot[]; currentRaw: string | null; complete: boolean; usedSlots: number | null; freeSlots: number | null; usedCodeUnits: number | null; canCreate: 'possible' | 'blocked' | 'unknown'; message: string };
export function inspectRecoverySlot(key: string, serialized: string | null): RecoverySlot {
  const slot: RecoverySlot = { key, serialized, status: serialized === null ? 'empty' : 'invalid', copy: null, backup: null, restoreValid: false, message: serialized === null ? '空きスロット' : '保全recordを同定できません（UNKNOWN）。削除・書出し不可。' };
  if (serialized === null) return slot;
  // Bound parse allocations. Still count all occupied code units and show this slot.
  if (serialized.length > MAX_RECOVERY_CODE_UNITS) return { ...slot, message: '保全recordが上限を超えています。原文を変更せず操作を停止します。' };
  try {
    const v = parseStrictJson(serialized) as Record<string, unknown>;
    if (!v || typeof v !== 'object' || Array.isArray(v)) return slot;
    if (v.format === 'calculator-memo-recovery' && v.version !== 1) return { ...slot, status: 'unknown-version', message: '未知の保全record version（UNKNOWN）。推測で修復・削除しません。' };
    if (v.format !== 'calculator-memo-recovery' || v.version !== 1 || v.sourceKey !== STORAGE_KEY
      || !(v.raw === null || typeof v.raw === 'string') || (typeof v.raw === 'string' && v.raw.length > MAX_RAW_CODE_UNITS)
      || v.utf16CodeUnits !== (v.raw === null ? null : v.raw.length)
      || typeof v.createdAt !== 'string' || !Number.isFinite(Date.parse(v.createdAt))) return slot;
    const copy: RecoveryCopy = { key, serialized, raw: v.raw as string | null, createdAt: v.createdAt };
    const collected = collectBackup({ getItem: () => copy.raw });
    const restored = copy.raw === null ? null : validateRestoreRaw(copy.raw);
    return { ...slot, status: 'valid', copy, backup: collected.status === 'ready' ? collected.backup : null, restoreValid: restored?.ok === true,
      message: copy.raw === null ? '保存キーなしの記録。復元用のJSON原文はありません。' : restored?.ok ? '保存原文の構造検証済み。真正性・数学的正しさの証明ではありません。' : `保全recordは同定済みですが保存原文は復元不可。${restored && !restored.ok ? restored.message : 'UNKNOWN'}` };
  } catch { return slot; }
}
/** Read only known keys; complete means stable acquisition, not all records valid. */
export function readRecoverySnapshot(storage: Reader): RecoverySnapshot {
  let complete = true;
  let currentRaw: string | null = null;
  try { currentRaw = storage.getItem(STORAGE_KEY); } catch { complete = false; }
  const slots = RECOVERY_KEYS.map(key => {
    try { return inspectRecoverySlot(key, storage.getItem(key)); }
    catch { complete = false; return { key, serialized: null, status: 'unavailable', copy: null, backup: null, restoreValid: false, message: '取得不能（UNKNOWN）。存在しないとは判定しません。' } as RecoverySlot; }
  });
  try {
    for (const slot of slots) if (slot.status === 'unavailable' || storage.getItem(slot.key) !== slot.serialized) complete = false;
    if (storage.getItem(STORAGE_KEY) !== currentRaw) complete = false;
  } catch { complete = false; }
  const usedSlots = complete ? slots.filter(s => s.status !== 'empty').length : null;
  const usedCodeUnits = complete ? slots.reduce((n,s) => n+(s.serialized?.length ?? 0),0) : null;
  const freeSlots = usedSlots === null ? null : RECOVERY_KEYS.length-usedSlots;
  // Allocation estimate uses same envelope as preserveRestoreSource; actual quota is separate.
  const candidateSize = currentRaw !== null && currentRaw.length > MAX_RAW_CODE_UNITS ? Infinity : JSON.stringify({ format:'calculator-memo-recovery',version:1,createdAt:new Date().toISOString(),sourceKey:STORAGE_KEY,raw:currentRaw,utf16CodeUnits:currentRaw===null?null:currentRaw.length }).length;
  const logicalPossible = complete && freeSlots! > 0 && usedCodeUnits! + candidateSize <= MAX_RECOVERY_CODE_UNITS
    && (currentRaw === null || currentRaw.length <= MAX_RAW_CODE_UNITS) && slots.every(s => s.status === 'valid' || s.status === 'empty');
  return { slots, currentRaw, complete, usedSlots, freeSlots, usedCodeUnits, canCreate: !complete ? 'unknown' : logicalPossible ? 'possible' : 'blocked',
    message: !complete ? '一覧または現在保存状態を安定取得できません（UNKNOWN）。再取得するまで書出し・削除を停止します。' : logicalPossible ? '現在原文の新規保全に論理上の空きがあります。ブラウザquotaや実際の保全成功は保証しません。' : '新規保全に必要な空き・容量・record検証条件を満たしません。既存の同一原文copy再利用は復元側で別途検証します。' };
}
export function sameRecoverySnapshot(storage: Reader, snapshot: RecoverySnapshot): boolean {
  return snapshot.complete && snapshot.slots.length === RECOVERY_KEYS.length && RECOVERY_KEYS.every((key,index) => snapshot.slots[index]?.key === key)
    && storage.getItem(STORAGE_KEY) === snapshot.currentRaw && snapshot.slots.every(s => s.status !== 'unavailable' && storage.getItem(s.key) === s.serialized);
}
export function exportRecoveryCopy(storage: Reader, snapshot: RecoverySnapshot, key: string, valid: () => boolean): {ok:true;json:string;filename:string} | {ok:false;message:string} {
  try {
    const slot = snapshot.slots.find(s=>s.key===key);
    if (!valid() || !RECOVERY_KEYS.includes(key) || slot?.status !== 'valid' || !slot.copy || slot.copy.raw === null || !sameRecoverySnapshot(storage,snapshot)) throw Error();
    const checked = inspectRecoverySlot(key,storage.getItem(key));
    if (!checked.copy || checked.copy.serialized !== slot.copy.serialized) throw Error();
    const result = collectBackup({getItem:()=>checked.copy!.raw});
    if (result.status !== 'ready') throw Error();
    const json = serializeBackup(result.backup);
    if (!valid() || !sameRecoverySnapshot(storage,snapshot)) throw Error();
    return {ok:true,json,filename:`calculator-memo-recovery-${slot.copy.createdAt.replace(/[:.]/g,'-')}-slot-${RECOVERY_KEYS.indexOf(key)}.json`};
  } catch { return {ok:false,message:'復旧コピーの読取・原文一致・確認状態を検証できません。再取得してください。コピーは変更していません。'}; }
}
