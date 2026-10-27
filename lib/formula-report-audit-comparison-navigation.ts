import { parseMarkdownBlocks } from './markdown-blocks';
import { inspectAuditComparisonMarker, scanAuditComparisonRecordEnvelopes, type AuditComparisonRecordMetadata } from './formula-report-audit-comparison-record';
import { inspectAuditRecordMarker, scanAuditRecordEnvelopes, type AuditRecordMetadata } from './formula-report-audit-record';

export type SourceResolution = {
  status: 'available' | 'missing' | 'ambiguous' | 'invalid' | 'unknown' | 'unidentified';
  reason: string; start?: number; end?: number; recordId?: string; metadata?: AuditRecordMetadata;
};
export type ComparisonMaterialEntry = {
  key: string; start: number; end: number;
  status: 'complete' | 'incomplete' | 'unknown' | 'malformed' | 'duplicate' | 'ambiguous';
  reason: string; metadata?: AuditComparisonRecordMetadata; markdown: string;
  before: SourceResolution; after: SourceResolution;
};
export type ComparisonMaterialInventory = { entries: ComparisonMaterialEntry[]; complete: boolean; reason: string };

/** Original-source UTF-16 offsets, not textarea-normalized offsets. Never repair. */
export function validSourceRange(body: string, start: number, end: number): boolean {
  if (![start, end].every(p => Number.isSafeInteger(p) && p >= 0 && p <= body.length) || start > end) return false;
  for (let i = 0; i < body.length; i++) {
    const c = body.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const next = body.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff) || i === start || i === end) return false;
    } else if (c >= 0xdc00 && c <= 0xdfff) return false;
  }
  return ![start, end].some(p => p > 0 && body[p - 1] === '\r' && body[p] === '\n');
}

const intersects = (a: { start: number; end: number }, b: { start: number; end: number }) => a.start < b.end && a.end > b.start;
const unidentified = (): SourceResolution => ({ status: 'unidentified', reason: '検証済みの出典識別情報がないため確認できません。' });

/** Pure projection of existing scanners. No storage, clock, comparator or mutation. */
export function inspectComparisonMaterials(body: string, formulaId: string, reportId?: string): ComparisonMaterialInventory {
  const blocks = parseMarkdownBlocks(body);
  const materials = scanAuditComparisonRecordEnvelopes(body, blocks);
  const records = scanAuditRecordEnvelopes(body, blocks);
  // Veto-only diagnostic scan: reveal record boundaries that cross a material.
  // Its metadata is NEVER used as a source candidate or navigation authority.
  const diagnosticRecords = scanAuditRecordEnvelopes(body, blocks.filter(block => !inspectAuditComparisonMarker(body, block)));
  const materialMarkers = blocks.flatMap(block => {
    const marker = inspectAuditComparisonMarker(body, block); return marker ? [marker] : [];
  });
  const recordMarkers = blocks.filter(block => !materials.some(range => intersects(block, range))).flatMap(block => {
    const marker = inspectAuditRecordMarker(body, block); return marker ? [marker] : [];
  });
  const resolve = (recordId: string, info: AuditComparisonRecordMetadata): SourceResolution => {
    const result = (status: SourceResolution['status'], reason: string): SourceResolution => ({ status, reason, recordId });
    if (!reportId || info.formulaId !== formulaId || info.reportId !== reportId) return result('unidentified', '比較資料と表示中レポートの識別情報が一致しません。');
    // Include only observed envelope starts in diagnostic matches; nested payloads are never candidates.
    const claimed = records.flatMap(range => {
      const marker = recordMarkers.find(marker => marker.start === range.start);
      return marker?.claimedId === recordId ? [{ range, marker }] : [];
    });
    if (recordMarkers.filter(marker => marker.isStart && marker.claimedId === recordId).length > 1 || claimed.length > 1) return result('ambiguous', '同じ出典IDの領域が複数あり、一意に特定できません。');
    if (claimed.length === 1) {
      const { range, marker } = claimed[0];
      if (!marker.known) return result('unknown', '出典の形式が未知のため確認できません。');
      if (range.status !== 'complete' || !range.closed || !range.metadata || !validSourceRange(body, range.start, range.end)) return result('invalid', '出典が破損・不完全または曖昧なため移動できません。');
      if (range.metadata.formulaId !== formulaId || range.metadata.reportId !== reportId) return result('unidentified', '出典IDは存在しますが、レポート識別情報が一致しません。');
      return { status: 'available', reason: '表示中本文の出典を一意に特定しました。保存原本との一致や真正性は保証しません。', recordId, start: range.start, end: range.end, metadata: range.metadata };
    }
    if (records.some(range => range.status !== 'complete') || materials.some(range => range.status !== 'complete')) return result('unknown', '不完全な保護領域があり、出典の不存在を確定できません。');
    return result('missing', '対応する出典は現在の本文に存在しません。');
  };
  let suppressed = false;
  const entries: ComparisonMaterialEntry[] = [];
  for (const range of materials) {
    // A comparison envelope inside an older record must not become an independent material.
    if (records.some(record => record.start < range.start && record.end >= range.end)) { suppressed = true; continue; }
    const first = materialMarkers.find(marker => marker.start === range.start);
    let status: ComparisonMaterialEntry['status'] = range.status === 'complete' ? 'complete' : 'incomplete';
    let reason = range.reason;
    if (range.status !== 'complete') {
      if (first && !first.known) status = 'unknown';
      else if (!first?.startMetadata) status = 'malformed';
      else {
        const id = first.startMetadata.materialId;
        const starts = materialMarkers.filter(marker => marker.startMetadata?.materialId === id);
        const next = starts.find(marker => marker.start > first.start)?.start ?? body.length;
        const ends = materialMarkers.filter(marker => marker.endId === id && marker.start > first.start && marker.start < next);
        if (starts.length > 1) status = 'duplicate';
        else if (ends.length > 1 || records.some(record => intersects(record, range))) status = 'ambiguous';
      }
    }
    if (diagnosticRecords.some(record => record.closed && intersects(record, range) && !(record.start >= range.start && record.end <= range.end))) {
      status = 'ambiguous'; reason = '固定点検記録と固定比較資料が入れ子・交差しているため、独立資料として移動できません。';
    }
    if (!validSourceRange(body, range.start, range.end)) { status = 'malformed'; reason = '本文または資料位置の文字境界が不正です。移動できません。'; }
    const metadata = status === 'complete' ? range.metadata : undefined;
    entries.push({ key: `${range.start}:${range.end}`, start: range.start, end: range.end, status, reason, metadata,
      markdown: body.slice(range.start, range.end), before: metadata ? resolve(metadata.beforeRecordId, metadata) : unidentified(), after: metadata ? resolve(metadata.afterRecordId, metadata) : unidentified() });
  }
  const complete = !suppressed && entries.every(entry => entry.status === 'complete') && records.every(record => record.status === 'complete');
  return { entries, complete, reason: complete ? '表示中本文で認識できる固定比較資料の一覧です。' : '不正・未知・入れ子の保護領域があるため、一覧件数または出典検索は不完全です。内部資料は独立に数えません。' };
}
