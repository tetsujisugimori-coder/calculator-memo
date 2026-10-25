import { describe, expect, it } from 'vitest';
import { buildAuditMarkdown, type AuditMarkdownInput, bodyLabels, sourceLabels } from '../lib/formula-report-audit-export';
import { parseReportAudit, assessReportAudit, type AuditAcquisition } from '../lib/formula-report-audit';
import { createQuoteMarkdown, type QuoteSnapshot } from '../lib/formula-report-quotes';
import { createTrackedDifferenceMarkdown, rebuildDifferenceMarkdown } from '../lib/formula-report-diff-tracking';
import type { DifferenceSnapshot } from '../lib/formula-report-snapshots';
import type { Memo } from '../lib/types';
import type { EvidenceRecord } from '../lib/calculation-evidence';
import { parseMarkdownBlocks } from '../lib/markdown-blocks';
import { reportFilename } from '../lib/markdown-report';

const at = '2026-10-24T00:00:00.000Z';
const fetchedAt = '2026-10-25T06:00:00.000Z';
const exportedAt = '2026-10-25T06:30:00.000Z';
function fixture() {
  const before: EvidenceRecord = { id: 'before-record', evaluator: 'calculator-memo-v1', status: 'confirmed', calculatedAt: at, persistedAt: at,
    blocks: [{ blockId: 'block-id', position: 1, expression: '1', result: '1', resultText: '1', status: 'success', inputs: [] }] };
  const after = structuredClone(before); after.id = 'after-record'; after.blocks[0].result = '1.0000000000000002';
  const quote: QuoteSnapshot = { version: 1, quoteId: 'quote-id', formulaId: 'formula-id', memoId: 'memo-id', blockId: 'block-id', citedAt: at, record: before };
  const snapshot: DifferenceSnapshot = { version: 1, differenceId: 'difference-id', preparedAt: at, quote, after, quoteBodyEdited: false };
  const difference = createTrackedDifferenceMarkdown(rebuildDifferenceMarkdown(snapshot), quote, after, snapshot.differenceId, at);
  const notes = [{ id: 'memo-id', type: 'plain-calculation', title: '', content: 'PRIVATE CURRENT BODY', createdAt: at, updatedAt: at,
    calculationEvidence: { version: 1, records: [before, after] } }] as Memo[];
  const links = [{ memoId: 'memo-id', recordId: before.id }, { memoId: 'memo-id', recordId: after.id }];
  return { before, after, quote, quoted: createQuoteMarkdown(quote), difference, notes, links };
}
function input(body: string, acquisition?: AuditAcquisition): AuditMarkdownInput {
  const inventory = parseReportAudit(body, 'formula-id');
  return { formulaId: 'formula-id', formulaTitle: '数式', reportId: 'report-id', reportTitle: '説明', editing: true, body, inventory,
    items: assessReportAudit(inventory, acquisition), state: acquisition ? 'checked' : 'unverified', fetchedAt: acquisition ? fetchedAt : undefined, exportedAt };
}
const count = (text: string, word: string) => text.split(word).length - 1;

describe('audit Markdown uses the shared report-wide audit', () => {
  it.each(['\n', '\r\n'])('exports mixed occurrences in body order and original UTF-16 positions (%j)', newline => {
    const f = fixture(); const body = `日本語😀\n\n${f.difference}\n\n${f.quoted}`.replace(/\n/g, newline);
    const value = input(body, f); const { markdown } = buildAuditMarkdown(value);
    expect(markdown.indexOf('### 1. 比較差分')).toBeLessThan(markdown.indexOf('### 2. 固定引用'));
    expect(markdown).toContain('認識できた出現数：2件。見直し対象：0件。');
    for (const item of value.items) expect(markdown).toContain(`本文位置：開始 ${item.start}、終了 ${item.end}。`);
    expect(count(markdown, '出典照合状態：保存記録と一致')).toBe(3);
    expect(markdown).toContain('0始まり UTF-16');
  });
  it.each(['quote', 'difference'])('does not confuse edited %s text with matching source', kind => {
    const f = fixture(); const body = kind === 'quote' ? f.quoted.replace('当時の式：', '編集した式：') : f.difference.replace('### 観測された変更', '### 編集された解釈');
    const value = input(body, f), { markdown } = buildAuditMarkdown(value);
    expect(markdown).toContain(`本文状態：${bodyLabels.edited}`);
    expect(markdown).toContain(`出典照合状態：${sourceLabels.matched}`);
    expect(markdown).toContain('見直し対象：1件');
  });
  it('names both independently troubled comparison sides and counts the row once', () => {
    const f = fixture(); f.before.blocks[0].result = '2';
    (f.notes[0] as Extract<Memo, { type: 'plain-calculation' }>).calculationEvidence!.records = [f.before];
    const value = input(f.difference, { ...f, links: [] }); const { markdown } = buildAuditMarkdown(value);
    expect(markdown).toContain('認識できた出現数：1件。見直し対象：1件。');
    const beforeSection = markdown.slice(markdown.indexOf('#### 比較元'), markdown.indexOf('#### 比較先'));
    const afterSection = markdown.slice(markdown.indexOf('#### 比較先'));
    expect(beforeSection).toContain('before-record'); expect(beforeSection).toContain('保存記録の変更');
    expect(afterSection).toContain('after-record'); expect(afterSection).toContain('記録・ブロック欠落');
    expect(count(markdown, '関連付け解除・保存済み根拠リンクなし')).toBe(2);
  });
  it('keeps association loss separate from matching sources', () => {
    const f = fixture(); const { markdown } = buildAuditMarkdown(input(f.quoted, { ...f, links: [] }));
    expect(markdown).toContain('出典照合状態：保存記録と一致'); expect(markdown).toContain('関連付け解除'); expect(markdown).toContain('見直し対象：1件');
  });
  it.each([{ error: 'storage failed' }, { invalidData: true, error: 'invalid data' }])('exports acquisition failure as failure, not absence or old success (%j)', flags => {
    const f = fixture(); const value = { ...input(f.difference, { ...f, ...flags }), acquisitionError: flags.error };
    const { markdown } = buildAuditMarkdown(value);
    expect(markdown).toContain(flags.invalidData ? '出典照合状態：未知・不正' : '出典照合状態：取得失敗');
    expect(markdown).not.toContain('出典照合状態：保存記録と一致');
    expect(markdown).not.toContain('出典照合状態：記録・ブロック欠落');
    expect(markdown).toContain('関連付け：未判定'); expect(markdown).toContain('原本取得試行日時');
  });
  it.each(['unverified', 'stale'] as const)('downgrades accidentally retained matched results for %s, excluding obsolete time/error', state => {
    const f = fixture(); const value = { ...input(`${f.quoted}\n\n${f.difference}`, f), state, acquisitionError: 'OBSOLETE ERROR' };
    const old = JSON.stringify(value); const { markdown } = buildAuditMarkdown(value);
    expect(markdown).toContain(state === 'stale' ? '点検状態：結果失効・未照合' : '点検状態：未照合');
    expect(markdown).not.toContain(fetchedAt); expect(markdown).not.toContain('OBSOLETE ERROR');
    expect(markdown).not.toContain('出典照合状態：保存記録と一致'); expect(count(markdown, '出典照合状態：未照合')).toBe(3);
    expect(markdown).toContain('見直し対象：2件'); expect(JSON.stringify(value)).toBe(old);
  });
  it('distinguishes the actual acquisition and export times, normalizing explicit zones to UTC', () => {
    const f = fixture(); const value = { ...input(f.quoted, f), editing: false, exportedAt: '2026-10-25T15:30:00+09:00' };
    const { markdown } = buildAuditMarkdown(value);
    expect(markdown).toContain(`出力日時（UTC、ISO 8601）：${exportedAt}`);
    expect(markdown).toContain(`原本の観測取得日時（UTC、ISO 8601）：${fetchedAt}`);
    expect(markdown).toContain('保存済み本文（本文に未保存変更なし）');
  });
  it('separates unchanged saved body from unsaved report metadata', () => {
    const { markdown } = buildAuditMarkdown({ ...input('ordinary'), editing: false, unsavedChanges: true });
    expect(markdown).toContain('保存済み本文（本文に未保存変更なし）');
    expect(markdown).toContain('レポートの未保存変更（タイトル・関連付けを含む）：あり');
  });
  it('marks a frozen opened body separately from the current saved report', () => {
    const { markdown } = buildAuditMarkdown({ ...input('ordinary'), editing: false, savedContextChanged: true });
    expect(markdown).toContain('画面に保持している本文');
    expect(markdown).not.toContain('現在表示中の保存済み本文');
    expect(markdown).toContain('保存原本との照合結果とは別の制約');
    expect(markdown).toContain('本文の未保存変更（現在の編集基準本文との比較）：なし');
    expect(buildAuditMarkdown({ ...input('changed'), editing: true, savedContextChanged: true }).markdown).toContain('本文の未保存変更（現在の編集基準本文との比較）：あり');
  });
  it('does not invent an acquisition time or absent identity', () => {
    const f = fixture(); const value = input(f.quoted, f); delete value.fetchedAt; delete value.reportId; delete value.formulaTitle;
    const { markdown } = buildAuditMarkdown(value);
    expect(markdown).toContain('原本の観測取得日時：未記録'); expect(count(markdown, exportedAt)).toBe(1);
    expect(markdown).toContain('未提供（推測しません）'); expect(markdown).toContain('編集中本文（本文に未保存変更あり）');
  });
  it.each(['2026-10-25T06:30:00', 'not-a-date', '2026-99-99T99:00:00Z'])('refuses ambiguous or invalid output time %s', exportedAt => {
    expect(() => buildAuditMarkdown({ ...input('ordinary'), exportedAt })).toThrow('タイムゾーン');
  });
  it('does not use output time instead of an invalid recorded acquisition time', () => {
    const f = fixture(); expect(() => buildAuditMarkdown({ ...input(f.quoted, f), fetchedAt: 'bad' })).toThrow('日時');
  });
  it.each(['quote', 'difference'])('preserves duplicate %s occurrences without fabricated IDs', kind => {
    const f = fixture(), body = kind === 'quote' ? f.quoted : f.difference;
    const { markdown } = buildAuditMarkdown(input(`${body}\n\n${body}`, f));
    expect(markdown).toContain('認識できた出現数：2件。見直し対象：2件。');
    expect(count(markdown, '本文状態：未知・不正／対応不明')).toBe(2);
    expect(markdown).not.toContain('before-record'); expect(markdown).not.toContain('after-record');
    expect(count(markdown, '本文移動：対応位置を安全に確定できないため移動不能')).toBe(2);
  });
  it.each(['future', 'missing', 'nested'])('exports incomplete %s parse and does not recover hidden later items', kind => {
    const f = fixture(); let body = f.difference;
    if (kind === 'future') body = body.replace('calculator-memo-difference-start-v1', 'calculator-memo-difference-start-v2');
    if (kind === 'missing') body = body.slice(0, body.indexOf('```calculator-memo-difference-v1'));
    if (kind === 'nested') body = body.replace('### 観測された変更', '```calculator-memo-difference-start-v1\n{"version":1,"differenceId":"nested"}\n```\n\n### 観測された変更');
    const { markdown, warnings } = buildAuditMarkdown(input(`${body}\n\n${f.quoted}\n\n${f.difference}`, f));
    expect(markdown).toContain('集計の完全性：不完全'); expect(markdown).toContain('認識できた出現数：1件');
    expect(markdown).not.toContain('### 2.'); expect(warnings).toHaveLength(1);
  });
  it('reports untracked legacy evidence and zero recognizable items without claiming completion', () => {
    const legacy = buildAuditMarkdown(input('## 引用時の計算記録と保存記録の差分')).markdown;
    expect(legacy).toContain('追跡情報不足'); expect(legacy).toContain('移動不能');
    const empty = buildAuditMarkdown(input('No provenance marker remains.')).markdown;
    expect(empty).toContain('認識できた出現数：0件'); expect(empty).toContain('全件一致、点検完了を意味しません');
    expect(empty).toContain('すべての根拠を網羅した数ではありません');
  });
  it('marks an over-limit unparsed body incomplete rather than silently treating it as empty', () => {
    const { markdown } = buildAuditMarkdown(input('x'.repeat(100001)));
    expect(markdown).toContain('集計の完全性：不完全'); expect(markdown).toContain('根拠0件とは判定していません');
  });
  it.each(['filter', 'reorder', 'position'])('rejects partial or mixed result identities: %s', kind => {
    const f = fixture(); const value = input(`${f.quoted}\n\n${f.difference}`, f);
    if (kind === 'filter') value.items = value.items.slice(1);
    if (kind === 'reorder') value.items.reverse();
    if (kind === 'position') value.items[0] = { ...value.items[0], start: 1 };
    expect(() => buildAuditMarkdown(value)).toThrow('全件');
  });
  it('refuses positions from a longer previous body without reparsing or substituting results', () => {
    const f = fixture(); const value = input(f.quoted, f); value.body = 'short';
    expect(() => buildAuditMarkdown(value)).toThrow('本文と点検位置');
  });
  it('uses fenced full literal text for identifiers, titles, errors and reasons, preserving hostile input', () => {
    const f = fixture(); const hostile = 'line1\n| table |\n````\n<script>alert(1)</script>\n# fake heading\n![x](https://example.invalid)\r\n';
    const value = { ...input(f.quoted, { ...f, error: 'failed' }), reportTitle: hostile, formulaTitle: hostile, formulaId: hostile, reportId: hostile, acquisitionError: hostile };
    value.items[0] = { ...value.items[0], reason: hostile, sources: value.items[0].sources.map(source => ({ ...source, reason: hostile })) };
    const { markdown, filename } = buildAuditMarkdown(value);
    expect(count(markdown, hostile)).toBe(7);
    const blocks = parseMarkdownBlocks(markdown);
    expect(blocks.filter(block => block.kind === 'heading').map(block => block.text)).not.toContain('fake heading');
    expect(filename).toBe(reportFilename(`${hostile}-根拠点検`));
    expect(markdown).toContain('ファイル名のみ既存の安全化');
  });
  it('preserves long identifiers and many rows without hidden truncation', () => {
    const f = fixture(); const id = '長'.repeat(5000);
    const value = { ...input(Array.from({ length: 12 }, (_, index) => createQuoteMarkdown({ ...f.quote, quoteId: `q-${index}` })).join('\n\n'), f), reportTitle: id, reportId: id };
    const { markdown } = buildAuditMarkdown(value);
    expect(count(markdown, id)).toBe(2); expect(markdown).toContain('認識できた出現数：12件'); expect(markdown).toContain('### 12. 固定引用');
  });
  it('stops entire output above the existing size bound, never returns a truncated success', () => {
    expect(() => buildAuditMarkdown({ ...input('text'), reportTitle: 'x'.repeat(4_000_001) })).toThrow('省略せず出力を停止');
  });
  it('does not dump body or snapshots and never changes inputs', () => {
    const f = fixture(); const value = input(`PRIVATE FULL REPORT BODY\n\n${f.quoted}\n\n${f.difference}`, f);
    const initial = JSON.stringify({ value, f }); const result = buildAuditMarkdown(value);
    expect(result.markdown).not.toContain('PRIVATE FULL REPORT BODY'); expect(result.markdown).not.toContain('PRIVATE CURRENT BODY');
    expect(result.markdown).not.toContain('calculator-memo-evidence-v1'); expect(result.markdown).not.toContain('"evaluator"');
    expect(result.markdown).toContain('復元できません'); expect(JSON.stringify({ value, f })).toBe(initial);
    expect(buildAuditMarkdown(value)).toEqual(result);
  });
});
