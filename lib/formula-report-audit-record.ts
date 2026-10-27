import { scanAuditComparisonRecordEnvelopes } from './formula-report-audit-comparison-record';
import { parseMarkdownBlocks, type MarkdownBlock } from './markdown-blocks';
import { closedCode, scanDifferenceEnvelopes } from './formula-report-diff-envelope';
import { reportCode } from './markdown-report';
import { validateAuditComparisonSnapshot, type AuditComparisonSnapshot } from './formula-report-audit-comparison';

const PREFIX = 'calculator-memo-audit-record';
export const AUDIT_RECORD_START = `${PREFIX}-start-v1`;
export const AUDIT_RECORD_END = `${PREFIX}-end-v1`;
export const AUDIT_RECORD_START_V2 = `${PREFIX}-start-v2`;
export const AUDIT_RECORD_END_V2 = `${PREFIX}-end-v2`;
export type AuditRecordMetadata = { recordId: string; formulaId: string; reportId: string; generatedAt: string; bodySha256: string; bodyLength: number; comparison?: AuditComparisonSnapshot };
export type AuditRecordEnvelope = { start: number; end: number; closed: boolean; status: 'complete' | 'invalid'; reason: string; metadata?: AuditRecordMetadata };
const invalid = '固定点検記録の境界が未知・不正・重複または不完全です。内部の根拠数は推測せず、集計は不完全です。';
function object(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value); }
function keys(value: Record<string, unknown>, expected: string[]) { return Object.keys(value).length === expected.length && expected.every(key => Object.hasOwn(value, key)); }
function metadata(value: unknown): AuditRecordMetadata | undefined {
  if (!object(value) || ![1, 2].includes(value.version as number)) return;
  const expected = ['version', 'recordId', 'formulaId', 'reportId', 'generatedAt', 'bodySha256', 'bodyLength'];
  if (value.version === 2) expected.push('comparison');
  if (!keys(value, expected) || (value.version === 2 && !validateAuditComparisonSnapshot(value.comparison))) return;
  if (![value.recordId, value.formulaId, value.reportId].every(id => typeof id === 'string' && id.trim().length > 0 && id.length <= 120)) return;
  if (typeof value.generatedAt !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(value.generatedAt) || !Number.isFinite(Date.parse(value.generatedAt))) return;
  if (typeof value.bodySha256 !== 'string' || !/^[a-f0-9]{64}$/.test(value.bodySha256) || !Number.isSafeInteger(value.bodyLength) || (value.bodyLength as number) < 0 || (value.bodyLength as number) > 100_000) return;
  const { version: _version, ...result } = value;
  void _version;
  return result as AuditRecordMetadata;
}

/** Shares the renderer's strict block boundaries. Once pairing is ambiguous,
 * no later plausible end repairs it. Payloads are identification, not signatures
 * or proof that the visible historical record has never been edited. */
export function scanAuditRecordEnvelopes(body: string, blocks: MarkdownBlock[] = parseMarkdownBlocks(body)): AuditRecordEnvelope[] {
  const comparisonRecords = scanAuditComparisonRecordEnvelopes(body, blocks);
  blocks = blocks.filter(block => !comparisonRecords.some(range => block.start < range.end && block.end > range.start));
  const results: AuditRecordEnvelope[] = [];
  let pending: { start: number; version?: 1 | 2; metadata?: AuditRecordMetadata; poisoned: boolean } | undefined;
  for (const block of blocks) {
    if (block.kind !== 'code' || !block.language.startsWith(PREFIX) || pending?.poisoned) continue;
    let value: unknown;
    try { value = JSON.parse(block.text); } catch { /* Never infer malformed metadata. */ }
    if (!pending && [AUDIT_RECORD_START, AUDIT_RECORD_START_V2].includes(block.language) && closedCode(body, block)) {
      const version = block.language === AUDIT_RECORD_START ? 1 : 2;
      const parsed = object(value) && value.version === version ? metadata(value) : undefined;
      if (parsed) { pending = { start: block.start, version, metadata: parsed, poisoned: false }; continue; }
    }
    if (pending?.metadata && block.language === (pending.version === 2 ? AUDIT_RECORD_END_V2 : AUDIT_RECORD_END) && closedCode(body, block) && object(value) && keys(value, ['version', 'recordId']) && value.version === pending.version && value.recordId === pending.metadata.recordId) {
      results.push({ start: pending.start, end: block.end, closed: true, status: 'complete', reason: '固定点検記録です。現在の根拠の出現として数えません。内容の真正性・現在の一致・数学的正しさは保証しません。', metadata: pending.metadata });
      pending = undefined; continue;
    }
    pending = { start: pending?.start ?? block.start, poisoned: true };
  }
  if (pending) results.push({ start: pending.start, end: body.length, closed: false, status: 'invalid', reason: invalid });
  const differences = scanDifferenceEnvelopes(body, blocks);
  for (const range of results) {
    if (differences.some(diff => diff.start < range.end && diff.end > range.start && !(diff.start >= range.start && diff.end <= range.end))) {
      range.status = 'invalid'; range.reason = '比較差分と固定点検記録が入れ子・交差しています。集計は不完全です。';
    }
  }
  for (const range of results) {
    if (comparisonRecords.some(record => range.start < record.end && range.end > record.start)) {
      range.status = 'invalid'; range.reason = '固定点検記録と固定比較資料が入れ子・交差しています。集計は不完全です。'; delete range.metadata;
    }
  }
  const counts = new Map<string, number>();
  for (const range of results) if (range.metadata) counts.set(range.metadata.recordId, (counts.get(range.metadata.recordId) ?? 0) + 1);
  for (const range of results) if (range.metadata && counts.get(range.metadata.recordId)! > 1) { range.status = 'invalid'; range.reason = invalid; delete range.metadata; }
  return results;
}

export function outsideAuditRecordBlocks(body: string, blocks: MarkdownBlock[] = parseMarkdownBlocks(body)): MarkdownBlock[] {
  const ranges = [...scanAuditRecordEnvelopes(body), ...scanAuditComparisonRecordEnvelopes(body)];
  return blocks.filter(block => !ranges.some(range => block.start < range.end && block.end > range.start));
}

/** Wraps the existing builder's exact Markdown; does not read/assess/retrieve. */
export function createAuditRecordMarkdown(markdown: string, info: AuditRecordMetadata): string {
  const version = info.comparison ? 2 : 1;
  const payload = { version, ...info };
  const start = version === 2 ? AUDIT_RECORD_START_V2 : AUDIT_RECORD_START;
  const end = version === 2 ? AUDIT_RECORD_END_V2 : AUDIT_RECORD_END;
  if (!metadata(payload)) throw new Error('固定点検記録の識別情報を検証できません。本文は変更していません。');
  const result = `${reportCode(JSON.stringify(payload), start)}\n\n${markdown}\n\n${reportCode(JSON.stringify({ version, recordId: info.recordId }), end)}`;
  const ranges = scanAuditRecordEnvelopes(result);
  if (ranges.length !== 1 || ranges[0].status !== 'complete' || ranges[0].end !== result.length) throw new Error('固定点検記録の領域を安全に構成できません。本文は変更していません。');
  if (result.length > 100_000) throw new Error('固定点検記録が本文上限100,000文字を超えます。切り捨てず挿入を停止しました。');
  return result;
}
