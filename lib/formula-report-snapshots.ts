import type { EvidenceRecord } from './calculation-evidence';
import { resolveReportEvidence } from './formula-report-evidence';
import type { Memo } from './types';

export type QuoteSnapshot = { version: 1; quoteId: string; formulaId: string; memoId: string; blockId: string; citedAt: string; record: EvidenceRecord };
export type DifferenceSnapshot = { version: 1; differenceId: string; preparedAt: string; quote: QuoteSnapshot; after: EvidenceRecord; quoteBodyEdited: boolean };
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const identifier = (value: unknown): value is string => typeof value === 'string' && !!value.trim() && value.length <= 120;
const id = identifier;
const timestamp = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value));
const exact = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).length === keys.length && Object.keys(value).every(key => keys.includes(key));
function savedSnapshotRecord(value: unknown, memoId: string) {
  const memo = { id: memoId, type: 'plain-calculation', title: '', content: '', createdAt: '', updatedAt: '', calculationEvidence: { version: 1, records: [value] } } as Memo;
  return resolveReportEvidence([memo], [{ memoId, recordId: object(value) && typeof value.id === 'string' ? value.id : '' }])[0];
}
export function validateQuoteSnapshot(value: unknown): asserts value is QuoteSnapshot {
  if (!object(value) || value.version !== 1 || Object.keys(value).some(key => !['version', 'quoteId', 'formulaId', 'memoId', 'blockId', 'citedAt', 'record'].includes(key))
    || !identifier(value.quoteId) || !identifier(value.formulaId) || !identifier(value.memoId) || !identifier(value.blockId)
    || typeof value.citedAt !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value.citedAt) || !Number.isFinite(Date.parse(value.citedAt))) throw new Error('未対応または不正な引用形式です。本文は保持しています。');
  const resolved = savedSnapshotRecord(value.record, value.memoId);
  if (resolved.status !== 'available' || !resolved.record?.blocks.some(block => block.blockId === value.blockId)) throw new Error('引用時の保存記録を安全に検証できません。本文は保持しています。');
}
export function validateDifferenceSnapshot(value: unknown): asserts value is DifferenceSnapshot {
  if (!object(value) || !exact(value, ['version', 'differenceId', 'preparedAt', 'quote', 'after', 'quoteBodyEdited']) || value.version !== 1
    || !id(value.differenceId) || !timestamp(value.preparedAt) || typeof value.quoteBodyEdited !== 'boolean') throw new Error('未対応または不正な差分追跡情報です。本文は保持しています。');
  validateQuoteSnapshot(value.quote);
  const after = value.after as EvidenceRecord;
  const source = savedSnapshotRecord(after, value.quote.memoId);
  if (source.status !== 'available' || !source.record || !id(source.record.id) || source.record.id === value.quote.record.id) throw new Error('比較先の引用時保存記録を検証できません。本文は保持しています。');
}

