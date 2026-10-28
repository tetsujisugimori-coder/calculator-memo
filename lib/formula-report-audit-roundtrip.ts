import { parseReportAudit, isAuditInventoryFor, type AuditInventory } from './formula-report-audit';
import { inspectComparisonMaterials, validSourceRange } from './formula-report-audit-comparison-navigation';
import { inspectAuditRecordMarker, scanAuditRecordEnvelopes } from './formula-report-audit-record';
import { scanAuditComparisonRecordEnvelopes } from './formula-report-audit-comparison-record';
import { parseMarkdownBlocks } from './markdown-blocks';

export type AuditNavigationTarget = Readonly<{
  kind: 'quote' | 'difference' | 'material' | 'record';
  identity: string; formulaId: string; reportId: string;
  /** Held text is only an in-memory occurrence witness, never a new saved snapshot. */
  body: string; markdown: string; start: number; end: number; key: string;
}>;
export type AuditNavigationResolution =
  | { status: 'available'; start: number; end: number; key: string; reason: string }
  | { status: 'unavailable'; reason: string };
type Candidate = Pick<AuditNavigationTarget, 'kind' | 'identity' | 'start' | 'end' | 'key'>;

/** Candidate authority comes exclusively from the existing parsers/scanners.
 * Exact text is compared only AFTER structural identification, never searched
 * as a substitute for parsing or used to repair a damaged envelope. */
function candidates(body: string, formulaId: string, reportId: string, inventory?: AuditInventory): Candidate[] {
  if (!reportId || body.length > 100_000 || !validSourceRange(body, 0, body.length)) return [];
  const result: Candidate[] = [];
  for (const item of (inventory && isAuditInventoryFor(inventory, body, formulaId) ? inventory : parseReportAudit(body, formulaId)).items) {
    const id = item.quote?.snapshot?.quoteId ?? item.difference?.snapshot?.differenceId;
    if (item.canNavigate && id && validSourceRange(body, item.start, item.end)) {
      result.push({ kind: item.kind, identity: id, start: item.start, end: item.end, key: item.key });
    }
  }
  for (const item of inspectComparisonMaterials(body, formulaId, reportId).entries) {
    if (item.status === 'complete' && item.metadata?.formulaId === formulaId && item.metadata.reportId === reportId) {
      result.push({ kind: 'material', identity: item.metadata.materialId, start: item.start, end: item.end, key: item.key });
    }
  }
  const blocks = parseMarkdownBlocks(body);
  const materials = scanAuditComparisonRecordEnvelopes(body, blocks);
  // Diagnostic-only markers can veto an apparent complete record. They never
  // supply metadata, candidates, or a guessed recovered range.
  const markers = blocks.filter(block => !materials.some(range => block.start < range.end && block.end > range.start))
    .flatMap(block => { const marker = inspectAuditRecordMarker(body, block); return marker ? [marker] : []; });
  for (const record of scanAuditRecordEnvelopes(body, blocks)) {
    const info = record.metadata;
    if (record.status !== 'complete' || !record.closed || !info || info.formulaId !== formulaId || info.reportId !== reportId) continue;
    const sameId = markers.filter(marker => marker.claimedId === info.recordId);
    if (sameId.filter(marker => marker.isStart).length !== 1 || sameId.filter(marker => !marker.isStart).length !== 1) continue;
    if (!validSourceRange(body, record.start, record.end)) continue;
    result.push({ kind: 'record', identity: info.recordId, start: record.start, end: record.end, key: `${record.start}:${record.end}` });
  }
  return result;
}

/** Per-view ephemeral authority. Prepared candidates are private, copied values;
 * only parser-proven inventory for the identical input is reused. */
export type AuditNavigationContext = Readonly<{ body: string; formulaId: string; reportId: string }>;
const preparedCandidates = new WeakMap<AuditNavigationContext, Candidate[]>();
export function prepareAuditNavigationContext(body: string, formulaId: string, reportId: string, inventory: AuditInventory): AuditNavigationContext {
  const context = Object.freeze({ body, formulaId, reportId });
  preparedCandidates.set(context, candidates(body, formulaId, reportId, inventory));
  return context;
}
function currentCandidates(body: string, formulaId: string, reportId: string, context?: AuditNavigationContext): Candidate[] {
  if (context?.body === body && context.formulaId === formulaId && context.reportId === reportId) {
    const prepared = preparedCandidates.get(context);
    if (prepared) return prepared;
  }
  return candidates(body, formulaId, reportId);
}

export function captureAuditNavigationTarget(body: string, formulaId: string, reportId: string, start: number, end: number, context?: AuditNavigationContext): AuditNavigationTarget | null {
  if (!validSourceRange(body, start, end) || start === end) return null;
  const all = currentCandidates(body, formulaId, reportId, context);
  const found = all.filter(candidate => candidate.start === start && candidate.end === end);
  if (found.length !== 1) return null;
  const target = found[0];
  if (all.filter(candidate => candidate.kind === target.kind && candidate.identity === target.identity).length !== 1) return null;
  return { ...target, formulaId, reportId, body, markdown: body.slice(start, end) };
}

export function resolveAuditNavigationTarget(body: string, formulaId: string, reportId: string, target: AuditNavigationTarget, context?: AuditNavigationContext): AuditNavigationResolution {
  if (target.formulaId !== formulaId || target.reportId !== reportId) return { status: 'unavailable', reason: 'レポートまたは登録式が変わったため、以前の出現へ移動できません。' };
  const matches = currentCandidates(body, formulaId, reportId, context).filter(candidate => candidate.kind === target.kind && candidate.identity === target.identity);
  if (matches.length !== 1) return { status: 'unavailable', reason: '対象が削除・重複・不完全・未知形式になったか、完全な一意範囲を確認できません。位置を推測しません。' };
  const match = matches[0];
  if (body.slice(match.start, match.end) !== target.markdown || (body === target.body && (match.start !== target.start || match.end !== target.end))) {
    return { status: 'unavailable', reason: '対象資料の本文が変更され、同じ出現であることを確認できません。古い位置や似た文章へ移動しません。' };
  }
  return { status: 'available', start: match.start, end: match.end, key: match.key, reason: '保持本文の同じ対象を完全な一意範囲として確認しました。保存原本との一致や根拠の有効性の証明ではありません。' };
}
