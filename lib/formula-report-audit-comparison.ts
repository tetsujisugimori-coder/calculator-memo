import type { AuditInventory, AuditItem, AuditSource } from './formula-report-audit';
import { validCalculationEvidence, type EvidenceRecord } from './calculation-evidence';
import { compareEvidenceRecords, type EvidenceComparison } from './evidence-comparison';

export type AuditComparisonSource = {
  side: AuditSource['side']; memoId: string; blockId?: string;
  status: AuditSource['status']; reason: string; linked?: boolean;
  frozen: EvidenceRecord; observed?: EvidenceRecord;
};
export type AuditComparisonItem = {
  id?: string; originQuoteId?: string; originBlockId?: string; kind: AuditItem['kind']; bodyStatus: AuditItem['bodyStatus']; reason: string;
  sources: AuditComparisonSource[];
};
export type AuditBodyContext = { editing: boolean; unsavedChanges: boolean; savedContextChanged: boolean };
export type AuditComparisonSnapshot = {
  version: 1; state: 'unverified' | 'checked' | 'stale'; complete: boolean; reason: string;
  fetchedAt?: string; acquisitionStatus?: 'ok' | 'unavailable' | 'invalid'; bodyContext?: AuditBodyContext; items: AuditComparisonItem[];
};
export type AuditComparableRecord = {
  recordId: string; formulaId: string; reportId: string; snapshot?: AuditComparisonSnapshot;
};
export type AuditComparisonState = 'matched' | 'changed' | 'added' | 'removed' | 'missing' | 'unavailable' | 'incomparable' | 'unknown';
export type AuditSourceComparison = {
  side: AuditSource['side']; before?: AuditComparisonSource; after?: AuditComparisonSource;
  states: AuditComparisonState[]; changes: string[]; frozen?: EvidenceComparison; observed?: EvidenceComparison;
};
export type AuditItemComparison = {
  id?: string; kind: AuditItem['kind']; before?: AuditComparisonItem; after?: AuditComparisonItem;
  states: AuditComparisonState[]; changes: string[]; sources: AuditSourceComparison[];
};
export type AuditRecordComparison = {
  states: AuditComparisonState[]; changes: string[]; rows: AuditItemComparison[]; limitations: string[];
};
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const id = (v: unknown): v is string => typeof v === 'string' && !!v.trim() && v.length <= 120;
const text = (v: unknown): v is string => typeof v === 'string';
const only = (v: Record<string, unknown>, keys: string[]) => Object.keys(v).every(key => keys.includes(key));
const oneOf = (v: unknown, values: readonly string[]) => typeof v === 'string' && values.includes(v);
const record = (v: unknown): v is EvidenceRecord => validCalculationEvidence({ version: 1, records: [v] });
const unique = <T,>(values: T[]) => [...new Set(values)];
const timestamp = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v) && Number.isFinite(Date.parse(v));

/** Validate machine data, not historical prose. No repairs, inference or evaluation. */
export function validateAuditComparisonSnapshot(value: unknown): value is AuditComparisonSnapshot {
  if (!object(value) || !only(value, ['version', 'state', 'complete', 'reason', 'fetchedAt', 'acquisitionStatus', 'bodyContext', 'items']) || value.version !== 1
    || !oneOf(value.state, ['unverified', 'checked', 'stale']) || typeof value.complete !== 'boolean' || !text(value.reason)
    || (value.bodyContext !== undefined && (!object(value.bodyContext) || !only(value.bodyContext, ['editing', 'unsavedChanges', 'savedContextChanged']) || ['editing', 'unsavedChanges', 'savedContextChanged'].some(key => typeof (value.bodyContext as Record<string, unknown>)[key] !== 'boolean')))
    || (value.acquisitionStatus !== undefined && (value.state !== 'checked' || !oneOf(value.acquisitionStatus, ['ok', 'unavailable', 'invalid'])))
    || (value.fetchedAt !== undefined && (!timestamp(value.fetchedAt) || value.state !== 'checked')) || !Array.isArray(value.items)) return false;
  return value.items.every(item => {
    if (!object(item) || !only(item, ['id', 'originQuoteId', 'originBlockId', 'kind', 'bodyStatus', 'reason', 'sources']) || (item.id !== undefined && !id(item.id))
      || (item.originQuoteId !== undefined && (!id(item.originQuoteId) || item.kind !== 'difference'))
      || (item.originBlockId !== undefined && (!id(item.originBlockId) || item.kind !== 'difference'))
      || !oneOf(item.kind, ['quote', 'difference']) || !oneOf(item.bodyStatus, ['intact', 'edited', 'invalid', 'untracked']) || !text(item.reason) || !Array.isArray(item.sources)) return false;
    if (['intact', 'edited'].includes(item.bodyStatus as string) && (!id(item.id) || item.sources.length !== (item.kind === 'quote' ? 1 : 2))) return false;
    if (['invalid', 'untracked'].includes(item.bodyStatus as string) && item.sources.length !== 0) return false;
    const sides = new Set<string>();
    return item.sources.every(source => {
      if (!object(source) || !only(source, ['side', 'memoId', 'blockId', 'status', 'reason', 'linked', 'frozen', 'observed'])
        || !oneOf(source.side, item.kind === 'quote' ? ['quote'] : ['before', 'after']) || sides.has(source.side as string) || !id(source.memoId)
        || (source.blockId !== undefined && !id(source.blockId)) || !oneOf(source.status, ['unverified', 'matched', 'changed', 'missing', 'invalid', 'unavailable'])
        || !text(source.reason) || (source.linked !== undefined && typeof source.linked !== 'boolean') || !record(source.frozen)
        || (item.kind === 'quote' && (source.blockId === undefined || !source.frozen.blocks.some(block => block.blockId === source.blockId)))
        || (item.kind === 'difference' && source.blockId !== undefined)
        || (item.kind === 'difference' && source.side === 'before' && item.originBlockId !== undefined && !source.frozen.blocks.some(block => block.blockId === item.originBlockId))
        || (source.observed !== undefined && (!record(source.observed) || source.observed.id !== source.frozen.id))
        || (value.acquisitionStatus === 'unavailable' && source.status !== 'unavailable')
        || (value.acquisitionStatus === 'invalid' && source.status !== 'invalid')
        || (value.state !== 'checked' && (source.status !== 'unverified' || source.observed !== undefined || source.linked !== undefined))
        || (['matched', 'changed'].includes(source.status as string) && source.observed === undefined)
        || (['unverified', 'invalid', 'unavailable'].includes(source.status as string) && source.observed !== undefined)
        || (source.status === 'matched' && JSON.stringify(source.frozen) !== JSON.stringify(source.observed))
        || (source.status === 'changed' && JSON.stringify(source.frozen) === JSON.stringify(source.observed))
        || (source.status === 'missing' && source.observed !== undefined && (source.blockId === undefined || source.observed.blocks.some(block => block.blockId === source.blockId)))) return false;
      sides.add(source.side as string); return true;
    });
  });
}

/** Capture only the already assessed generation. Never reads storage or updates a snapshot. */
export function captureAuditComparison(inventory: AuditInventory, items: AuditItem[], state: AuditComparisonSnapshot['state'], fetchedAt?: string, acquisitionStatus?: AuditComparisonSnapshot['acquisitionStatus'], bodyContext?: AuditBodyContext): AuditComparisonSnapshot {
  if (items.length !== inventory.items.length || items.some((item, index) => {
    const original = inventory.items[index];
    return item.key !== original.key || item.order !== original.order || item.kind !== original.kind || item.start !== original.start || item.end !== original.end
      || item.bodyStatus !== original.bodyStatus || JSON.stringify(item.quote?.snapshot) !== JSON.stringify(original.quote?.snapshot) || JSON.stringify(item.difference?.snapshot) !== JSON.stringify(original.difference?.snapshot);
  })) throw new Error('同じ世代の全出現と一致しません。絞り込み後・別本文の項目は固定記録へ保存できません。');
  const result: AuditComparisonSnapshot = { version: 1, state, complete: inventory.complete, reason: inventory.reason,
    ...(state === 'checked' && fetchedAt ? { fetchedAt } : {}), ...(state === 'checked' && acquisitionStatus ? { acquisitionStatus } : {}), ...(bodyContext ? { bodyContext } : {}), items: items.map(item => {
      const quote = item.quote?.snapshot, difference = item.difference?.snapshot;
      const frozen = quote ? [{ side: 'quote' as const, memoId: quote.memoId, blockId: quote.blockId, frozen: quote.record }]
        : difference ? [{ side: 'before' as const, memoId: difference.quote.memoId, frozen: difference.quote.record }, { side: 'after' as const, memoId: difference.quote.memoId, frozen: difference.after }] : [];
      return { ...(quote || difference ? { id: quote?.quoteId ?? difference!.differenceId } : {}), ...(difference ? { originQuoteId: difference.quote.quoteId, originBlockId: difference.quote.blockId } : {}), kind: item.kind, bodyStatus: item.bodyStatus, reason: item.reason,
        sources: frozen.map(entry => {
          const assessed = item.sources.find(source => source.side === entry.side);
          return { ...entry, status: state === 'checked' && assessed ? assessed.status : 'unverified', reason: state === 'checked' && assessed ? assessed.reason : 'この時点では未照合です。',
            ...(state === 'checked' && assessed?.linked !== undefined ? { linked: assessed.linked } : {}), ...(state === 'checked' && assessed?.record ? { observed: assessed.record } : {}) };
        }) };
    }) };
  if (!validateAuditComparisonSnapshot(result)) throw new Error('点検比較データを検証できません。元の本文・保存記録は変更していません。');
  return structuredClone(result);
}

const key = (item: AuditComparisonItem) => JSON.stringify([item.kind, item.id]);
const sourceStates = (source: AuditComparisonSource): AuditComparisonState[] => source.status === 'missing' ? ['missing'] : source.status === 'unavailable' ? ['unavailable'] : source.status === 'invalid' ? ['unknown', 'incomparable'] : [];
function recordDiff(a: EvidenceRecord, b: EvidenceRecord): EvidenceComparison {
  return compareEvidenceRecords(a, b, { allowSameRecordId: true });
}
function compareSource(before: AuditComparisonSource | undefined, after: AuditComparisonSource | undefined): AuditSourceComparison {
  const result: AuditSourceComparison = { side: (after ?? before)!.side, before, after, states: [], changes: [] };
  if (!before || !after) { result.states = ['incomparable']; result.changes.push('片側の出典情報不足'); return result; }
  result.states.push(...sourceStates(before), ...sourceStates(after));
  for (const [field, label] of [['memoId', '参照元メモID'], ['blockId', '引用対象ブロックID'], ['status', '出典照合状態'], ['linked', '関連付け状態']] as const) if (before[field] !== after[field]) result.changes.push(label);
  if (before.memoId !== after.memoId) {
    result.states.push('incomparable'); result.changes.push('異なるメモ間のブロック同一性は対応付け不能');
  } else {
    for (const field of ['frozen', 'observed'] as const) {
      const a = before[field], b = after[field];
      if (!a || !b) { if (field === 'observed') { result.changes.push('取得原本の比較情報不足（欠けた原本は固定snapshotで代用しません）'); result.states.push('incomparable'); } continue; }
      const diff = recordDiff(a, b); result[field] = diff;
      if (diff.warnings.some(warning => warning.includes('未知'))) result.states.push('unknown', 'incomparable');
      if (a.id !== b.id) result.changes.push(`${field === 'frozen' ? '固定snapshot' : '取得原本'}の記録ID`);
      if (diff.counts.added || diff.counts.removed || diff.counts.changed) result.changes.push(`${field === 'frozen' ? '固定snapshot' : '取得原本'}の計算根拠`);
      // Existing engine compares actual reads; reference definitions (including unused
      // targets) are an additional explicit field, never an inferred numerical change.
      if (a.blocks.some(block => {
        const other = b.blocks.find(candidate => candidate.blockId === block.blockId);
        const refs = (value: typeof block) => JSON.stringify(value.references?.entries.map(entry => [entry.slot, entry.blockId]).sort((x, y) => Number(x[0]) - Number(y[0])));
        return other && refs(block) !== refs(other);
      })) result.changes.push(`${field === 'frozen' ? '固定snapshot' : '取得原本'}の参照先ID定義`);
    }
  }
  // Information shortfalls are constraints, not evidence that something changed.
  if (result.changes.some(change => !change.includes('情報不足') && !change.includes('対応付け不能'))) result.states.push('changed');
  result.states = unique(result.states.length ? result.states : ['matched']);
  return result;
}

/** Explicit fixed-record comparison. Record identity and eligibility are rechecked here. */
export function compareAuditRecords(before: AuditComparableRecord, after: AuditComparableRecord): AuditRecordComparison {
  const result: AuditRecordComparison = { states: [], changes: [], rows: [], limitations: ['変更理由は記録されていないため理由不明です。数学的正しさ・真正性・現在の保存原本との一致を証明しません。', '順序は選択したA→Bです。記録日時の前後を推測しません。'] };
  const stop = (reason: string, state: AuditComparisonState = 'incomparable') => { result.states = [state, ...(state === 'unknown' ? ['incomparable' as const] : [])]; result.limitations.push(reason); return result; };
  if (![before.recordId, after.recordId, before.formulaId, after.formulaId, before.reportId, after.reportId].every(id)) return stop('対象の識別情報が不足しています。');
  if (before.recordId === after.recordId) return stop('異なる固定点検記録を2件選択してください。');
  if (before.formulaId !== after.formulaId || before.reportId !== after.reportId) return stop('異なる登録式・レポートの記録は比較対象外です。');
  if (!before.snapshot || !after.snapshot) return stop('旧記録には構造化した式・入力・参照・内部結果・出典状態がありません。本文や現在値から復元せず比較不能とします。');
  if (!validateAuditComparisonSnapshot(before.snapshot) || !validateAuditComparisonSnapshot(after.snapshot)) return stop('未知・不正な比較形式です。原文は保持します。', 'unknown');
  const a = structuredClone(before.snapshot), b = structuredClone(after.snapshot);
  for (const snapshot of [a, b]) {
    if (snapshot.state !== 'checked') { result.states.push('incomparable'); result.limitations.push('未照合または失効した記録です。取得原本の状態は比較できません。'); }
    else if (snapshot.acquisitionStatus === 'unavailable') result.states.push('unavailable', 'incomparable');
    else if (snapshot.acquisitionStatus === 'invalid' || snapshot.acquisitionStatus === undefined) { result.states.push('unknown', 'incomparable'); result.limitations.push(snapshot.acquisitionStatus === undefined ? '原本取得の成否が記録されていません。0件でも取得成功とは推測しません。' : '取得した保存形式が未知・不正です。'); }
  }
  if (!a.bodyContext || !b.bodyContext) result.limitations.push('保持本文・未保存編集の状態は片側または両側で未記録です。保存本文との一致を推測しません。');
  else {
    for (const [key, label] of [['editing', '対象本文の編集状態'], ['unsavedChanges', 'レポートの未保存変更状態'], ['savedContextChanged', '保存本文との一致確認制約']] as const) if (a.bodyContext[key] !== b.bodyContext[key]) result.changes.push(label);
    if (a.bodyContext.savedContextChanged || b.bodyContext.savedContextChanged) result.limitations.push('点検対象は画面に保持した本文です。出典照合成功でも現在の保存本文との一致は未確認です。');
  }
  if (a.acquisitionStatus !== b.acquisitionStatus) result.changes.push('原本取得・形式検証状態');
  if (a.state !== b.state) result.changes.push('記録の照合状態');
  if (a.complete !== b.complete) result.changes.push('集計の完全性');
  if (!a.complete || !b.complete) { result.states.push('incomparable'); result.limitations.push('片側または両側の集計が不完全です。未列挙の項目数と追加・削除は確定できません。'); }
  const counts = (items: AuditComparisonItem[]) => { const map = new Map<string, number>(); items.forEach(item => map.set(key(item), (map.get(key(item)) ?? 0) + 1)); return map; };
  const ac = counts(a.items), bc = counts(b.items);
  const usable = (item: AuditComparisonItem) => !!item.id && (ac.get(key(item)) ?? 0) <= 1 && (bc.get(key(item)) ?? 0) <= 1;
  for (const [items, side] of [[a.items, 'before'], [b.items, 'after']] as const) for (const item of items.filter(item => !usable(item))) result.rows.push({ id: item.id, kind: item.kind, [side]: item, states: ['incomparable'], changes: ['根拠ID欠落・重複のため対応付け不能'], sources: [] });
  const mappingComplete = a.complete && b.complete && a.items.every(usable) && b.items.every(usable);
  const am = new Map(a.items.filter(usable).map(item => [key(item), item]));
  const bm = new Map(b.items.filter(usable).map(item => [key(item), item]));
  for (const k of unique([...am.keys(), ...bm.keys()])) {
    const left = am.get(k), right = bm.get(k), item = right ?? left!;
    const row: AuditItemComparison = { id: item.id, kind: item.kind, before: left, after: right, states: [], changes: [], sources: [] };
    if (!left || !right) { row.states.push(mappingComplete ? left ? 'removed' : 'added' : 'incomparable'); row.changes.push(mappingComplete ? '選択した記録間の出現追加・削除' : '集計不完全または対応付け不能のため片側不在を追加・削除と断定しません'); }
    else {
      if (item.kind === 'difference') {
        if (!left.originQuoteId || !right.originQuoteId || !left.originBlockId || !right.originBlockId) { row.states.push('incomparable'); row.changes.push('原引用の識別情報不足（引用ID・対象ブロックID）'); }
        for (const [field, label] of [['originQuoteId', '原引用ID'], ['originBlockId', '原引用対象ブロックID']] as const) if (left[field] && right[field] && left[field] !== right[field]) row.changes.push(label);
      }
      if (left.bodyStatus !== right.bodyStatus) row.changes.push('引用・差分本文の編集/検証状態');
      if (['invalid', 'untracked'].includes(left.bodyStatus) || ['invalid', 'untracked'].includes(right.bodyStatus) || !left.sources.length || !right.sources.length) row.states.push('incomparable');
      for (const side of unique([...left.sources, ...right.sources].map(source => source.side))) row.sources.push(compareSource(left.sources.find(source => source.side === side), right.sources.find(source => source.side === side)));
      row.states.push(...row.sources.flatMap(source => source.states).filter(state => state !== 'matched'));
      if (row.changes.some(change => !change.includes('情報不足'))) row.states.push('changed');
      if (!row.states.length) row.states.push('matched');
    }
    row.states = unique(row.states); result.rows.push(row);
  }
  result.states.push(...result.rows.flatMap(row => row.states).filter(state => state !== 'matched'));
  if (result.changes.length) result.states.push('changed');
  result.states = unique(result.states.length ? result.states : ['matched']);
  return result;
}
