import { describe, expect, it } from 'vitest';
import { buildAuditComparisonMarkdown, formatAuditComparisonStates } from '../lib/formula-report-audit-comparison-export';
import { compareAuditRecords, type AuditComparisonSnapshot } from '../lib/formula-report-audit-comparison';
import type { AuditRecordMetadata } from '../lib/formula-report-audit-record';
import type { EvidenceRecord } from '../lib/calculation-evidence';
import { reportCode } from '../lib/markdown-report';
const at = '2026-10-25T00:00:00.000Z';
const record = (): EvidenceRecord => ({ id: 'r', evaluator: 'calculator-memo-v1', status: 'confirmed', calculatedAt: at, persistedAt: at, blocks: [
  { blockId: 'a', position: 1, expression: '1', inputs: [], result: '1', resultText: '1', status: 'success' },
  { blockId: 'b', position: 2, expression: 'a+1', inputs: [{ kind: 'variable', name: 'a', sourceBlockId: 'a', value: '1' }], result: '2', resultText: '2', status: 'success' },
] });
const snapshot = (): AuditComparisonSnapshot => ({ version: 1, state: 'checked', acquisitionStatus: 'ok', complete: true, reason: 'known', fetchedAt: at, items: [{ id: 'q', kind: 'quote', bodyStatus: 'intact', reason: 'known', sources: [{ side: 'quote', memoId: 'm', blockId: 'b', status: 'matched', reason: 'known', linked: true, frozen: record(), observed: record() }] }] });
const pair = (): [AuditRecordMetadata, AuditRecordMetadata] => ['A', 'B'].map(recordId => ({ recordId, formulaId: 'f', reportId: 'p', generatedAt: '2026-10-25T09:00:00+09:00', bodySha256: 'a'.repeat(64), bodyLength: 1, comparison: snapshot() })) as [AuditRecordMetadata, AuditRecordMetadata];
const render = (a: AuditRecordMetadata, b: AuditRecordMetadata) => { const result = compareAuditRecords({ ...a, snapshot: a.comparison }, { ...b, snapshot: b.comparison }); return { result, output: buildAuditComparisonMarkdown({ before: a, after: b, result, exportedAt: at }) }; };
const mutate = (b: AuditRecordMetadata, fn: (r: EvidenceRecord) => void) => { const s = b.comparison!.items[0].sources[0]; fn(s.frozen); fn(s.observed!); };
describe('fixed audit comparison Markdown presentation', () => {
  it('formats the exact result, direction, times and all calculation fields without mutation', () => {
    const [a, b] = pair(); const original = JSON.stringify([a, b]); const { result, output } = render(a, b);
    expect(output.markdown).toContain(formatAuditComparisonStates(result.states));
    for (const value of ['比較元 A → 比較先 B', '2026-10-25T09:00:00+09:00', at, '登録式 ID', '数学レポート ID', '内部結果', '表示結果', '入力名', '実使用参照元 blockId', '実際に使用した内部値', '引用・差分snapshot同士', '各点検時に取得した保存原本同士']) expect(output.markdown).toContain(value);
    result.limitations.forEach(value => expect(output.markdown).toContain(reportCode(value)));
    expect(JSON.stringify([a, b])).toBe(original); expect(output.filename).toBe('audit-comparison-20261025T000000000Z.md');
  });
  it.each(['expression', 'inputs', 'source', 'result', 'resultText', 'references'] as const)('keeps existing %s changes and original values', key => {
    const [a, b] = pair(); mutate(b, r => { const block = r.blocks[1];
      if (key === 'expression') block.expression = 'a+2';
      if (key === 'inputs') block.inputs[0].value = '3';
      if (key === 'source') block.inputs = [];
      if (key === 'result') block.result = '3';
      if (key === 'resultText') block.resultText = '2.00';
      if (key === 'references') block.references = { version: 1, entries: [{ slot: 1, blockId: 'a' }] };
    });
    const { result, output } = render(a, b); expect(result.states).toContain('changed'); expect(output.markdown).toContain('変更あり');
    for (const source of result.rows[0].sources) source.changes.forEach(value => expect(output.markdown).toContain(reportCode(value)));
  });
  it('retains changed grounds even if results match', () => {
    const [a, b] = pair(); mutate(b, r => { r.blocks[1].expression = '1+1'; r.blocks[1].inputs = []; });
    const { result, output } = render(a, b); expect(result.states).toContain('changed'); expect(output.markdown).toContain(reportCode('1+1')); expect(output.markdown).toContain(reportCode('a+1'));
  });
  it.each(['added', 'removed'] as const)('preserves one-sided %s rows', state => {
    const [a, b] = pair(); (state === 'added' ? a : b).comparison!.items = [];
    const { result, output } = render(a, b); expect(result.states).toEqual([state]); expect(output.markdown).toContain(state === 'added' ? '追加' : '削除'); expect(output.markdown).toContain('列挙された比較行数：1');
  });
  it('preserves source-only changes with equal inputs and result values', () => {
    const [a, b] = pair();
    for (const metadata of [a, b]) mutate(metadata, r => { r.blocks.splice(1, 0, { ...structuredClone(r.blocks[0]), blockId: 'a2', position: 2 }); r.blocks[2].position = 3; });
    mutate(b, r => { r.blocks[2].inputs[0].sourceBlockId = 'a2'; });
    const { result, output } = render(a, b); expect(result.states).toContain('changed'); expect(output.markdown).toContain('実使用参照元'); expect(output.markdown).toContain(reportCode('a2')); expect(output.markdown).toContain(reportCode('a'));
  });
  it('keeps stable item matching despite inventory order changes', () => {
    const [a, b] = pair(); for (const metadata of [a, b]) metadata.comparison!.items.push({ ...structuredClone(metadata.comparison!.items[0]), id: 'q2' });
    b.comparison!.items.reverse(); const { result, output } = render(a, b);
    expect(result.states).toEqual(['matched']); expect(output.markdown).toContain('列挙された比較行数：2'); expect(output.markdown).toContain(reportCode('q2'));
  });
  it('preserves missing source state without calling absence a successful acquisition match', () => {
    const [a, b] = pair(); const source = b.comparison!.items[0].sources[0]; source.status = 'missing'; delete source.observed;
    const { result, output } = render(a, b); expect(result.states).toContain('missing'); expect(output.markdown).toContain('根拠欠落'); expect(output.markdown).toContain('記録・ブロック欠落');
  });
  it('keeps both empty inventories incomparable with the exact reason', () => {
    const [a, b] = pair(); a.comparison!.items = []; b.comparison!.items = [];
    const { result, output } = render(a, b); expect(result.states).toEqual(['incomparable']); expect(output.markdown).toContain('両記録に比較可能な根拠項目がありません。取得成功は根拠の一致を意味しません。'); expect(output.markdown).toContain('列挙された比較行数：0');
    expect(output.markdown).not.toContain('一致（比較可能な項目）');
  });
  it.each(['unavailable', 'invalid', undefined] as const)('preserves %s acquisition constraints without fallback to success', acquisitionStatus => {
    const [a, b] = pair(); a.comparison!.items = []; b.comparison!.items = []; b.comparison!.acquisitionStatus = acquisitionStatus;
    const { result, output } = render(a, b); expect(output.markdown).toContain(formatAuditComparisonStates(result.states)); expect(result.states).toContain('incomparable'); expect(output.markdown).toContain('原本取得試行日時');
  });
  it.each(['unverified', 'stale'] as const)('preserves historical %s records as such', state => {
    const [a, b] = pair(); b.comparison = { version: 1, state, complete: true, reason: 'not checked', items: [] };
    const { result, output } = render(a, b); expect(result.states).toContain('incomparable'); expect(output.markdown).toContain(state === 'stale' ? '当時の照合結果失効' : '当時は未照合');
  });
  it.each(['duplicate', 'incomplete', 'missing-id'] as const)('preserves %s constraints and comparison rows', kind => {
    const [a, b] = pair(); if (kind === 'duplicate') b.comparison!.items.push(structuredClone(b.comparison!.items[0]));
    if (kind === 'incomplete') b.comparison!.complete = false;
    if (kind === 'missing-id') b.comparison!.items[0] = { kind: 'quote', bodyStatus: 'untracked', reason: 'lost id', sources: [] };
    const { result, output } = render(a, b); expect(result.states).toContain('incomparable'); expect(output.markdown).toContain(`列挙された比較行数：${result.rows.length}`); result.limitations.forEach(value => expect(output.markdown).toContain(value));
  });
  it('preserves v1 information shortage instead of inventing snapshot', () => {
    const [a, b] = pair(); delete a.comparison;
    const { output } = render(a, b); expect(output.markdown).toContain('旧 v1 記録等：構造化比較資料不足'); expect(output.markdown).toContain('比較不能');
  });
  it('does not interpret malformed/future snapshots', () => {
    const [a, b] = pair(); Object.assign(b.comparison!, { version: 99 });
    const { output } = render(a, b); expect(output.markdown).toContain('記録形式不明・不正'); expect(output.markdown).toContain('比較不能');
  });
  it.each(['calculatedAt', 'persistedAt'] as const)('shows %s differences without changing existing matched state', key => {
    const [a, b] = pair(); mutate(b, r => { r[key] = '2026-10-26T00:00:00.000Z'; });
    const { result, output } = render(a, b); expect(result.states).toEqual(['matched']); expect(output.markdown).toContain('2026-10-26T00:00:00.000Z'); expect(output.markdown).toContain('日時だけの差');
  });
  it('does not substitute a frozen snapshot for missing observed original', () => {
    const [a, b] = pair(); const source = b.comparison!.items[0].sources[0]; delete source.observed; source.status = 'unavailable';
    const { output } = render(a, b); expect(output.markdown).toContain('情報不足：この側の保存原本情報はありません。固定snapshotで代用しません。'); expect(output.markdown).toContain('取得不能');
  });
  it('includes difference origin identity and both source roles', () => {
    const [a, b] = pair(); for (const metadata of [a, b]) metadata.comparison!.items = [{ id: 'diff', originQuoteId: 'quote-origin', originBlockId: 'b', kind: 'difference', bodyStatus: 'intact', reason: 'known', sources: ['before', 'after'].map(side => ({ side: side as 'before' | 'after', memoId: 'm', status: 'matched', reason: 'known', frozen: record(), observed: record() })) }];
    const { output } = render(a, b); for (const value of ['differenceId', '原引用 quoteId', 'quote-origin', '原引用対象 blockId', '比較差分の比較元', '比較差分の比較先']) expect(output.markdown).toContain(value);
  });
  it('preserves arbitrary Markdown, Unicode, CRLF, whitespace and long strings verbatim inside safe fences', () => {
    const [a, b] = pair(); const value = '  # 見出し|`\r\n```\n<script>🌏𠮷</script>\n~~~\n' + '長'.repeat(12000) + '\r\n末尾  ';
    b.comparison!.reason = value; b.comparison!.items[0].reason = value;
    mutate(b, r => { r.blocks[1].resultText = value; });
    const { output } = render(a, b); expect(output.markdown).toContain(reportCode(value)); expect(output.markdown).toContain(value); expect(output.filename).toMatch(/^[A-Za-z0-9.-]+$/);
  });
  it('keeps held-body confidence separate from successful historical comparisons', () => {
    const [a, b] = pair(); const { result } = render(a, b); const output = buildAuditComparisonMarkdown({ before: a, after: b, result, exportedAt: at, savedContextChanged: true });
    expect(output.markdown).toContain('現在画面に保持した本文と現在の保存本文との一致は未確認'); expect(output.markdown).toContain('保存通知だけでは対象レポートの変更・削除を断定しません');
  });
  it('does not recompute or discard captured limitations', () => {
    const [a, b] = pair(); const result = { states: ['incomparable'] as const, changes: ['captured-change'], rows: [], limitations: ['captured-limit'] };
    const output = buildAuditComparisonMarkdown({ before: a, after: b, result: { ...result, states: [...result.states] }, exportedAt: at });
    expect(output.markdown).toContain('captured-limit'); expect(output.markdown).toContain('captured-change'); expect(output.markdown).not.toContain('一致（比較可能な項目）');
  });
  it.each(['2026-10-25T12:00:00', 'bad-date'])('rejects ambiguous output clock %s', exportedAt => {
    const [a, b] = pair(); const { result } = render(a, b); expect(() => buildAuditComparisonMarkdown({ before: a, after: b, result, exportedAt })).toThrow('タイムゾーン');
  });
});
