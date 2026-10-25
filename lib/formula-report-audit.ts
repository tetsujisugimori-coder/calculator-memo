import { outsideAuditRecordBlocks, scanAuditRecordEnvelopes } from './formula-report-audit-record';
import { parseMarkdownBlocks } from './markdown-blocks';
import { closedCode, scanDifferenceEnvelopes } from './formula-report-diff-envelope';
import { readQuoteAssessments, type QuoteAssessment } from './formula-report-quotes';
import { assessDifferenceSource, readDifferenceAssessments, type DifferenceAssessment } from './formula-report-diff-tracking';
import type { EvidenceRecord } from './calculation-evidence';
import type { FormulaReportEvidenceLink, Memo } from './types';

export type AuditSource = {
  side: 'quote' | 'before' | 'after';
  status: 'unverified' | 'matched' | 'changed' | 'missing' | 'invalid' | 'unavailable';
  reason: string; linked?: boolean; record?: EvidenceRecord;
};
export type AuditItem = {
  key: string; kind: 'quote' | 'difference'; start: number; end: number; order: number;
  bodyStatus: 'intact' | 'edited' | 'invalid' | 'untracked'; reason: string;
  canNavigate: boolean; quote?: QuoteAssessment; difference?: DifferenceAssessment;
  sources: AuditSource[]; needsReview: boolean;
};
export type AuditInventory = { items: AuditItem[]; complete: boolean; reason: string };
export type AuditAcquisition = { notes: Memo[]; links: FormulaReportEvidenceLink[]; error?: string; stale?: boolean; invalidData?: boolean };

/** Parse once for this body. The strict insertion scanner is also the boundary
 * authority here: a poisoned region hides an unknown number of later items. */
export function parseReportAudit(body: string, formulaId: string): AuditInventory {
  if (body.length > 100_000) return { items: [], complete: false, reason: '本文上限超過のため列挙できません。根拠0件とは判定していません。' };
  const originalBlocks = parseMarkdownBlocks(body);
  const auditRecords = scanAuditRecordEnvelopes(body, originalBlocks);
  const blocks = outsideAuditRecordBlocks(body, originalBlocks);
  const ranges = scanDifferenceEnvelopes(body, blocks);
  const differences = readDifferenceAssessments(body, formulaId, [], { stale: true }, { blocks, ranges });
  // Filter before quote duplicate detection so snapshots inside an envelope can
  // neither become evidence nor invalidate a real outer quote with the same ID.
  const quoteBlocks = blocks.filter(block => !ranges.some(range => block.start < range.end && block.end > range.start));
  const quotes = readQuoteAssessments(body, formulaId, [], { stale: true }, quoteBlocks);
  const items: AuditItem[] = [];
  for (const input of quotes) {
    const quote = { ...input };
    const metadata = quoteBlocks.find(block => block.end === quote.end && block.kind === 'code' && block.language.startsWith('calculator-memo-evidence'));
    if (metadata && !closedCode(body, metadata)) {
      quote.status = 'invalid'; quote.reason = '引用メタデータのフェンスが閉じていません。対応を推測しません。';
    }
    if (quote.status === 'invalid') delete quote.snapshot;
    const bodyStatus = quote.status === 'invalid' ? (!metadata && quote.reason.includes('欠落') ? 'untracked' : 'invalid') : quote.status === 'edited' ? 'edited' : 'intact';
    items.push({ key: `quote:${quote.start}:${quote.end}`, kind: 'quote', start: quote.start, end: quote.end, order: 0, bodyStatus,
      reason: bodyStatus === 'intact' ? '引用本文と固定snapshotの形式が一致しています。出典状態とは別です。' : quote.reason,
      canNavigate: bodyStatus === 'intact' || (bodyStatus === 'edited' && !!metadata && quote.start < metadata.start), quote, sources: [], needsReview: true });
  }
  for (const input of differences) {
    const difference = { ...input }; delete difference.before; delete difference.after;
    const range = ranges.find(value => value.start === difference.start && value.end === difference.end);
    const bodyStatus = difference.status === 'tracked' ? 'intact' : difference.status;
    items.push({ key: `difference:${difference.start}:${difference.end}`, kind: 'difference', start: difference.start, end: difference.end, order: 0,
      bodyStatus, reason: difference.reason, canNavigate: !!range && range.status === 'complete' && !!difference.snapshot,
      difference, sources: [], needsReview: true });
  }
  items.sort((a, b) => a.start - b.start || a.end - b.end);
  items.forEach((item, index) => { item.order = index + 1; });
  const complete = auditRecords.every(record => record.status === 'complete') && !quotes.some(quote => auditRecords.some(record => quote.start < record.end && quote.end > record.start)) && ranges.every(range => range.closed) && quotes.every(quote => !quoteBlocks.some(block => block.end === quote.end && block.kind === 'code' && !closedCode(body, block)));
  return { items: assessReportAudit({ items, complete, reason: '' }), complete,
    reason: complete ? '認識可能な根拠を本文順に列挙しています。マーカーが完全に削除された文章の由来は推定しません。' + (auditRecords.length ? ` 固定点検記録${auditRecords.length}件の内部は過去記録として除外しています。現在の引用・比較差分として二重計上しません。` : '') : '集計は不完全です。固定点検記録を含む未知・不正・重複・破損・終端欠落で対応が曖昧な領域には未列挙の項目があり得ます。隠れた件数は不明です。' };
}

/** Exactly one acquisition is supplied by the caller. This pure function never
 * reads storage, changes snapshots, recomputes calculations, or writes history. */
export function assessReportAudit(inventory: AuditInventory, acquisition?: AuditAcquisition): AuditItem[] {
  return inventory.items.map(original => {
    const item = { ...original, sources: [] as AuditSource[] };
    const quote = item.quote?.snapshot, difference = item.difference?.snapshot;
    const frozen = quote ? [{ side: 'quote' as const, memoId: quote.memoId, record: quote.record, blockId: quote.blockId }]
      : difference ? [{ side: 'before' as const, memoId: difference.quote.memoId, record: difference.quote.record }, { side: 'after' as const, memoId: difference.quote.memoId, record: difference.after }] : [];
    item.sources = frozen.map(entry => {
      if (!acquisition || acquisition.stale) return { side: entry.side, status: 'unverified', reason: '未照合です。保存記録と照合を明示的に実行してください。' };
      const state = assessDifferenceSource(entry.memoId, entry.record, acquisition.notes, acquisition);
      const source: AuditSource = { ...state, side: entry.side, status: state.status === 'stale' ? 'unverified' : state.status };
      if (!acquisition.error && !acquisition.invalidData) source.linked = acquisition.links.some(link => link.memoId === entry.memoId && link.recordId === entry.record.id);
      if ('blockId' in entry && source.record && !source.record.blocks.some(block => block.blockId === entry.blockId)) {
        source.status = 'missing'; source.reason = '引用元の対象ブロックが欠落しています。保存記録全体の欠落とは別です。';
      }
      return source;
    });
    item.needsReview = item.bodyStatus !== 'intact' || !item.sources.length || item.sources.some(source => source.status !== 'matched' || source.linked === false);
    return item;
  });
}
