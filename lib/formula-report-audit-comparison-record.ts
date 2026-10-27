import { parseMarkdownBlocks, type MarkdownBlock } from './markdown-blocks';
import { closedCode, scanDifferenceEnvelopes } from './formula-report-diff-envelope';
import { reportCode } from './markdown-report';

const PREFIX = 'calculator-memo-audit-comparison-record';
export const AUDIT_COMPARISON_RECORD_START = `${PREFIX}-start-v1`;
export const AUDIT_COMPARISON_RECORD_END = `${PREFIX}-end-v1`;
/** preparedAt is insertion-preview preparation, never insertion/save completion. */
export type AuditComparisonRecordMetadata = {
  materialId: string; formulaId: string; reportId: string;
  beforeRecordId: string; afterRecordId: string; preparedAt: string;
};
export type AuditComparisonRecordEnvelope = {
  start: number; end: number; closed: boolean; status: 'complete' | 'invalid';
  reason: string; metadata?: AuditComparisonRecordMetadata;
};
const invalid = '固定比較資料の境界が未知・不正・重複または不完全です。内部の根拠・点検記録を推測せず除外し、集計は不完全です。';
function object(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
function keys(value: Record<string, unknown>, expected: string[]) { return Object.keys(value).length === expected.length && expected.every(key => Object.hasOwn(value, key)); }
function wellFormed(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) { const next = value.charCodeAt(++i); if (!(next >= 0xdc00 && next <= 0xdfff)) return false; }
    else if (code >= 0xdc00 && code <= 0xdfff) return false;
  }
  return true;
}
function metadata(value: unknown): AuditComparisonRecordMetadata | undefined {
  if (!object(value) || value.version !== 1 || !keys(value, ['version', 'materialId', 'formulaId', 'reportId', 'beforeRecordId', 'afterRecordId', 'preparedAt'])) return;
  if (![value.materialId, value.formulaId, value.reportId, value.beforeRecordId, value.afterRecordId].every(id => typeof id === 'string' && id.trim().length > 0 && id.length <= 120 && wellFormed(id))) return;
  if (value.beforeRecordId === value.afterRecordId || typeof value.preparedAt !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(value.preparedAt) || !Number.isFinite(Date.parse(value.preparedAt))) return;
  const { version: _version, ...info } = value; void _version;
  return info as AuditComparisonRecordMetadata;
}

/** Fixed explanatory material is not another point-in-time audit record. Only
 * exact, closed markers with the same ID end it. Poisoning never self-repairs.
 * Marker-like content inside ordinary fenced values remains inert. */
export function scanAuditComparisonRecordEnvelopes(body: string, blocks?: MarkdownBlock[]): AuditComparisonRecordEnvelope[] {
  if (!body.includes(PREFIX)) return [];
  blocks ??= parseMarkdownBlocks(body);
  const markers = blocks.flatMap(block => {
    if (block.kind !== 'code' || !block.language.startsWith(PREFIX)) return [];
    let value: unknown;
    try { value = JSON.parse(block.text); } catch { /* Never repair identifiers. */ }
    const closed = closedCode(body, block);
    const startMetadata = closed && block.language === AUDIT_COMPARISON_RECORD_START ? metadata(value) : undefined;
    const endId = closed && block.language === AUDIT_COMPARISON_RECORD_END && object(value)
      && keys(value, ['version', 'materialId']) && value.version === 1 && typeof value.materialId === 'string' ? value.materialId : undefined;
    return [{ block, startMetadata, endId }];
  });
  // Do not certify the first end before checking for a second exact end of the
  // same start. Only another exact, valid start of that ID begins a new interval;
  // unrelated/unknown markers cannot release the earlier ambiguous interior.
  // Individually closed duplicate-ID materials retain their existing separate
  // ranges (and duplicate-ID status), preserving independent evidence between.
  const lastStart = new Map<string, { start: number; ended: boolean }>();
  const ambiguousStarts = new Set<number>();
  for (const { block, startMetadata, endId } of markers) {
    if (startMetadata) lastStart.set(startMetadata.materialId, { start: block.start, ended: false });
    if (endId !== undefined) {
      const start = lastStart.get(endId);
      if (start?.ended) ambiguousStarts.add(start.start);
      if (start) start.ended = true;
    }
  }
  const ranges: AuditComparisonRecordEnvelope[] = [];
  let pending: { start: number; metadata?: AuditComparisonRecordMetadata; poisoned: boolean } | undefined;
  for (const { block, startMetadata, endId } of markers) {
    if (pending?.poisoned) continue;
    if (!pending && startMetadata) {
      pending = { start: block.start, metadata: startMetadata, poisoned: ambiguousStarts.has(block.start) }; continue;
    }
    if (pending?.metadata && endId === pending.metadata.materialId) {
      ranges.push({ start: pending.start, end: block.end, closed: true, status: 'complete', metadata: pending.metadata,
        reason: '過去の点検記録同士を比較した固定資料です。現在の根拠・点検記録候補ではなく、自動更新・保存・確認・数学的証明を意味しません。' });
      pending = undefined; continue;
    }
    pending = { start: pending?.start ?? block.start, poisoned: true };
  }
  if (pending) ranges.push({ start: pending.start, end: body.length, closed: false, status: 'invalid', reason: invalid });
  const differences = scanDifferenceEnvelopes(body, blocks);
  for (const range of ranges) {
    if (differences.some(diff => diff.start < range.end && diff.end > range.start && !(diff.start >= range.start && diff.end <= range.end))) {
      range.status = 'invalid'; range.reason = '比較差分と固定比較資料が入れ子・交差しています。集計は不完全です。'; delete range.metadata;
    }
  }
  const counts = new Map<string, number>();
  // Poison/crossing may erase output metadata, not the observed duplicate ID.
  for (const { startMetadata } of markers) if (startMetadata) counts.set(startMetadata.materialId, (counts.get(startMetadata.materialId) ?? 0) + 1);
  for (const range of ranges) if (range.metadata && counts.get(range.metadata.materialId)! > 1) { range.status = 'invalid'; range.reason = invalid; delete range.metadata; }
  return ranges;
}

export function outsideAuditComparisonRecordBlocks(body: string, blocks: MarkdownBlock[] = parseMarkdownBlocks(body)): MarkdownBlock[] {
  const ranges = scanAuditComparisonRecordEnvelopes(body);
  return blocks.filter(block => !ranges.some(range => block.start < range.end && block.end > range.start));
}

/** Validate textarea-normalized UTF-16 positions without repairing the source. */
export function assertAuditComparisonInsertionPosition(body: string, start: number, end: number): void {
  const normalized = body.replace(/\r\n?/g, '\n');
  const splitsPair = (position: number) => position > 0 && position < normalized.length
    && normalized.charCodeAt(position - 1) >= 0xd800 && normalized.charCodeAt(position - 1) <= 0xdbff
    && normalized.charCodeAt(position) >= 0xdc00 && normalized.charCodeAt(position) <= 0xdfff;
  if (!wellFormed(body) || ![start, end].every(position => Number.isInteger(position) && position >= 0 && position <= normalized.length)
    || start > end || splitsPair(start) || splitsPair(end)) {
    throw new Error('本文または挿入位置に不正な文字境界があります。補完・切り捨てをせず挿入を停止しました。本文は保持しています。');
  }
}

/** Preserve the exact existing output bytes; no comparator, storage, or clock. */
export function createAuditComparisonRecordMarkdown(markdown: string, info: AuditComparisonRecordMetadata): string {
  const payload = { version: 1, ...info };
  if (!metadata(payload) || typeof markdown !== 'string' || !wellFormed(markdown)) throw new Error('固定比較資料の識別情報・文字情報を検証できません。本文は変更していません。');
  const result = `${reportCode(JSON.stringify(payload), AUDIT_COMPARISON_RECORD_START)}\n\n${markdown}\n\n${reportCode(JSON.stringify({ version: 1, materialId: info.materialId }), AUDIT_COMPARISON_RECORD_END)}`;
  if (result.length > 100_000) throw new Error('固定比較資料が本文上限100,000文字を超えます。切り捨てず挿入を停止しました。');
  const ranges = scanAuditComparisonRecordEnvelopes(result);
  if (ranges.length !== 1 || ranges[0].status !== 'complete' || ranges[0].start !== 0 || ranges[0].end !== result.length) throw new Error('固定比較資料の領域を安全に構成できません。本文は変更していません。');
  return result;
}

/** Read-only marker observations for diagnostics; claimedId never authorizes navigation. */
export function inspectAuditComparisonMarker(body: string, block: MarkdownBlock) {
  if (block.kind !== 'code' || !block.language.startsWith(PREFIX)) return undefined;
  let value: unknown;
  try { value = JSON.parse(block.text); } catch { /* Observation only. */ }
  const known = [AUDIT_COMPARISON_RECORD_START, AUDIT_COMPARISON_RECORD_END].includes(block.language)
    && !(object(value) && typeof value.version === 'number' && value.version !== 1);
  const closed = closedCode(body, block);
  const startMetadata = closed && block.language === AUDIT_COMPARISON_RECORD_START ? metadata(value) : undefined;
  const endId = closed && block.language === AUDIT_COMPARISON_RECORD_END && object(value)
    && keys(value, ['version', 'materialId']) && value.version === 1 && typeof value.materialId === 'string' ? value.materialId : undefined;
  return { start: block.start, end: block.end, known, closed, startMetadata, endId,
    claimedId: object(value) && typeof value.materialId === 'string' ? value.materialId : undefined };
}
