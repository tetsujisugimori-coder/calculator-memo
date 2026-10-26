import { expect, it } from 'vitest';
import { compareAuditRecords, type AuditComparisonSnapshot } from '../lib/formula-report-audit-comparison';
import { buildAuditComparisonMarkdown } from '../lib/formula-report-audit-comparison-export';
import { scanAuditRecordEnvelopes, type AuditRecordMetadata } from '../lib/formula-report-audit-record';
import type { EvidenceRecord } from '../lib/calculation-evidence';
const at = '2026-10-26T00:00:00.000Z';
const calc = (result = '0'): EvidenceRecord => ({ id: 'original', calculatedAt: at, persistedAt: at, evaluator: 'calculator-memo-v1', status: 'confirmed', blocks: [{ blockId: 'block', position: 1, expression: '0', inputs: [], result, resultText: '0', status: 'success' }] });
function meta(recordId: string, items = true): AuditRecordMetadata {
 const comparison: AuditComparisonSnapshot = { version: 1, state: 'checked', acquisitionStatus: 'ok', fetchedAt: at, complete: true, reason: 'full', items: items ? [{ id: 'stable', kind: 'quote', bodyStatus: 'intact', reason: 'intact', sources: [{ side: 'quote', memoId: 'memo', blockId: 'block', status: 'matched', reason: 'same', frozen: calc(), observed: calc() }] }] : [] };
 return { recordId, formulaId: 'formula', reportId: 'report', generatedAt: '2026-10-26T09:00:00+09:00', bodySha256: 'a'.repeat(64), bodyLength: 1, comparison };
}
function build(a: AuditRecordMetadata, b: AuditRecordMetadata) {
 const result = compareAuditRecords({ ...a, snapshot: a.comparison }, { ...b, snapshot: b.comparison });
 const input = { before: a, after: b, result, exportedAt: at };
 const old = JSON.stringify(input), output = buildAuditComparisonMarkdown(input);
 expect(JSON.stringify(input)).toBe(old);
 return { output, result };
}
it('independent: zero valid rows remain incomparable in exact supplied result and output', () => {
 const { result, output } = build(meta('A', false), meta('B', false));
 expect(result.states).toEqual(['incomparable']); expect(result.rows).toHaveLength(0);
 expect(output.markdown).toContain('取得成功は根拠の一致を意味しません'); expect(output.markdown).not.toContain('一致（比較可能な項目）');
});
it.each(['added', 'removed'] as const)('independent: one-side zero preserves %s', state => {
 const { result, output } = build(meta('A', state === 'removed'), meta('B', state === 'added'));
 expect(result.states).toEqual([state]); expect(result.rows).toHaveLength(1); expect(output.markdown).toContain(state === 'added' ? '追加' : '削除');
});
it('independent: internal negative zero differs although both displayed values are zero', () => {
 const a = meta('A'), b = meta('B'); const source = b.comparison!.items[0].sources[0]; source.frozen = calc('-0'); source.observed = calc('-0');
 const { result, output } = build(a, b); expect(result.states).toContain('changed');
 expect(output.markdown).toContain('```text\n-0\n```'); expect(output.markdown).toContain('内部結果'); expect(output.markdown).toContain('表示結果');
});
it('independent: missing observed original is not replaced with frozen data', () => {
 const a = meta('A'), b = meta('B'), source = b.comparison!.items[0].sources[0]; source.status = 'missing'; delete source.observed;
 const { result, output } = build(a, b); expect(result.states).toContain('missing'); expect(result.states).toContain('incomparable');
 expect(output.markdown).toContain('この側の保存原本情報はありません。固定snapshotで代用しません');
});
it('independent: inert values cannot introduce fixed-record envelopes or headings', () => {
 const a = meta('A'), b = meta('B');
 const text = '日本語🙂\r\n```calculator-memo-audit-record-start-v2\n{}\n```\n# injected\n``````\n<script>inert</script>';
 a.comparison!.items[0].reason = text;
 const { output } = build(a, b); expect(output.markdown).toContain(text);
 expect(output.markdown).toContain('```````text\n' + text + '\n```````'); expect(scanAuditRecordEnvelopes(output.markdown)).toEqual([]);
});
it('independent: acquisition failure and missing acquisition history are not formatted as success', () => {
 const a = meta('A', false), b = meta('B', false); b.comparison!.acquisitionStatus = 'unavailable'; delete a.comparison!.acquisitionStatus;
 const { result, output } = build(a, b); expect(result.states).toEqual(expect.arrayContaining(['unavailable', 'unknown', 'incomparable']));
 expect(output.markdown).toContain('成否未記録（成功と推測しません）'); expect(output.markdown).toContain('原本取得試行日時'); expect(output.markdown).not.toContain('成功（根拠一致とは別）');
});
it('independent: date-only observations retain matched grounds, do not replace generation timezone', () => {
 const a = meta('A'), b = meta('B'); b.generatedAt = '2026-10-26T01:00:00+01:00';
 const s = b.comparison!.items[0].sources[0]; for (const record of [s.frozen, s.observed!]) { record.calculatedAt = '2026-10-26T01:00:00.000Z'; record.persistedAt = '2026-10-26T02:00:00.000Z'; }
 const { result, output } = build(a, b); expect(result.states).toEqual(['matched']);
 for (const value of [b.generatedAt, s.frozen.calculatedAt, s.frozen.persistedAt]) expect(output.markdown).toContain(value);
 expect(output.markdown).toContain('日時だけの差は既存仕様どおり計算根拠の変更にしません');
});
it('independent: old record missing structural data cannot acquire invented rows', () => {
 const a = meta('A'), b = meta('B'); delete a.comparison;
 const { result, output } = build(a, b); expect(result.states).toEqual(['incomparable']); expect(result.rows).toHaveLength(0);
 expect(output.markdown).toContain('旧 v1 記録等：構造化比較資料不足'); expect(output.markdown).not.toContain('###### 計算ブロック');
});
