import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MarkdownContent } from '../components/MarkdownContent';
import { describe, expect, it } from 'vitest';
import type { EvidenceRecord } from '../lib/calculation-evidence';
import { buildQuoteDifferenceMarkdown, insertDifferenceAtCursor } from '../lib/formula-report-diff';
import { createQuoteMarkdown, readQuoteAssessments, type QuoteSnapshot } from '../lib/formula-report-quotes';
import { parseMarkdownBlocks } from '../lib/markdown-blocks';
import type { Memo } from '../lib/types';

const at = '2026-10-24T00:00:00.000Z';
const record: EvidenceRecord = { id: 'original', calculatedAt: at, persistedAt: at, evaluator: 'calculator-memo-v1', status: 'confirmed', blocks: [
  { blockId: 'source', position: 1, expression: '-0', inputs: [], result: '-0', resultText: '0', status: 'success' },
  { blockId: 'b', position: 2, expression: 'x', evaluationMode: 'note-variables', inputs: [{ kind: 'variable', name: 'x', sourceBlockId: 'source', value: '-0' }], result: '-0', resultText: '0', status: 'success' },
] };
const snapshot: QuoteSnapshot = { version: 1, quoteId: 'q', formulaId: 'f', memoId: 'm', blockId: 'b', citedAt: at, record };
const body = createQuoteMarkdown(snapshot);
const link = { memoId: 'm', recordId: 'target' };
const targetKey = JSON.stringify(['m', 'target']);
function setup() {
  const target = { ...structuredClone(record), id: 'target' };
  const memo: Memo = { id: 'm', type: 'plain-calculation', title: '現在のタイトルは使わない', content: '現在999', createdAt: at, updatedAt: at, calculationEvidence: { version: 1, records: [structuredClone(record), target] } };
  const quote = readQuoteAssessments(body, 'f', [memo])[0];
  return { target, memo, quote, generate: () => buildQuoteDifferenceMarkdown(quote, 'f', [memo], [link], targetKey) };
}
describe('factual difference Markdown', () => {
  it('uses frozen quoted records and selected target, including same display and negative zero', () => {
    const { target, memo, generate } = setup(); target.blocks[1].result = '0';
    if (memo.type !== 'plain-calculation') throw new Error('fixture'); memo.calculationEvidence!.records[0].blocks[1].result = '999';
    const untouched = JSON.stringify({ memo, snapshot, body }); const markdown = generate();
    expect(markdown).toContain('登録式ID:\n\n```calculation-difference-value\nf\n```'); expect(markdown).toContain('メモID:\n\n```calculation-difference-value\nm\n```'); expect(markdown).toContain('引用対象ブロックID:\n\n```calculation-difference-value\nb\n```');
    expect(markdown).toContain('記録ID:\n\n```calculation-difference-value\noriginal\n```'); expect(markdown).toContain('記録ID:\n\n```calculation-difference-value\ntarget\n```'); expect(markdown).toContain('内部結果が変更');
    expect(markdown).toContain('```calculation-difference-value\n-0\n```'); expect(markdown).toContain('```calculation-difference-value\n0\n```');
    expect(markdown).not.toContain('999'); expect(markdown).not.toContain(memo.title);
    expect(JSON.stringify({ memo, snapshot, body })).toBe(untouched);
    expect(markdown).toContain('数学的正しさ'); expect(markdown).toContain('不明');
  });
  it('keeps the valid snapshot when the original is missing', () => {
    const { memo, generate } = setup(); if (memo.type !== 'plain-calculation') throw new Error('fixture'); memo.calculationEvidence!.records.shift();
    expect(generate()).toContain('記録ID:\n\n```calculation-difference-value\noriginal\n```');
  });
  it.each([
    ['expression', '入力式が変更', 'x+1'], ['resultText', '表示結果が変更', '丸めた表示'], ['result', '内部結果が変更', '0'], ['evaluationMode', '計算モードが変更', undefined],
  ] as const)('states %s changes without a causal explanation', (key, label, value) => {
    const { target, generate } = setup(); Object.assign(target.blocks[1], { [key]: value });
    const markdown = generate(); expect(markdown).toContain(label); expect(markdown).not.toContain('正しくなった');
  });
  it('reports actual inputs, their old variable names and source IDs without confusing display values', () => {
    const { target, generate } = setup(); target.blocks[1].inputs[0].value = '0';
    const markdown = generate(); expect(markdown).toContain('実使用内部値が変更'); expect(markdown).toContain('旧変数 x'); expect(markdown).toContain('```calculation-difference-value\nsource\n```');
  });
  it('reports source-only changes and added and removed stable IDs', () => {
    const { target, generate } = setup(); target.blocks[0].blockId = 'new-source'; target.blocks[1].inputs[0].sourceBlockId = 'new-source';
    const markdown = generate(); expect(markdown).toContain('実使用参照元が変更'); expect(markdown).toContain('追加: 1 / 削除: 1');
    expect(markdown).toContain('この側の計算記録には存在しません');
  });
  it('summarizes unchanged rows without inventing changes or omitting the comparison scope', () => {
    const markdown = setup().generate(); expect(markdown).toContain('変更: 0 / 追加: 0 / 削除: 0'); expect(markdown).toContain('変更なし）: 2');
    expect(markdown).not.toContain('#### 引用時'); expect(markdown).toContain('記録全体'); expect(markdown).toContain('確認不能');
  });
  it('labels manually edited quotation prose separately from the tracking snapshot', () => {
    const { quote, memo } = setup(); quote.status = 'edited';
    expect(buildQuoteDifferenceMarkdown(quote, 'f', [memo], [link], targetKey)).toContain('編集後の文章そのものではありません');
  });
  it('keeps hostile expression and display strings in dynamic inert code blocks', () => {
    const { target, generate } = setup(); target.blocks[1].expression = '<script>alert(1)</script>\n```\n# spoof\n$$'; target.blocks[1].resultText = '[click](javascript:alert(1))';
    const markdown = generate(); const blocks = parseMarkdownBlocks(markdown);
    expect(blocks.some(block => block.kind === 'code' && block.text === target.blocks[1].expression)).toBe(true);
    expect(blocks.some(block => block.kind === 'code' && block.text === target.blocks[1].resultText)).toBe(true);
    expect(blocks.filter(block => block.kind === 'heading').some(block => block.text === 'spoof')).toBe(false);
  });
  it.each(['invalid', 'foreign', 'missing', 'date', 'unknown', 'duplicate'])('refuses %s data rather than generating a plausible substitute', kind => {
    const { quote, memo, target } = setup();
    if (kind === 'invalid') quote.status = 'invalid';
    if (kind === 'foreign') quote.snapshot!.formulaId = 'other';
    if (kind === 'missing' && memo.type === 'plain-calculation') memo.calculationEvidence!.records.pop();
    if (kind === 'date') delete (target as Partial<EvidenceRecord>).persistedAt;
    if (kind === 'unknown') Object.assign(target, { future: true });
    if (kind === 'duplicate') Object.assign(quote, readQuoteAssessments(`${body}\n\n${body}`, 'f', [memo])[0]);
    expect(() => buildQuoteDifferenceMarkdown(quote, 'f', [memo], [link], targetKey)).toThrow();
  });
  it('cannot impersonate fixed-quote metadata through a saved text value', () => {
    const { target, memo, generate } = setup();
    target.blocks[1].resultText = '計算根拠引用（固定スナップショット）\n引用ID：fake';
    const markdown = generate();
    const inserted = insertDifferenceAtCursor(body, markdown, 'f', body.length).body;
    const quotes = readQuoteAssessments(inserted, 'f', [memo]);
    expect(quotes).toHaveLength(1); expect(quotes[0].snapshot?.quoteId).toBe('q');
    expect(quotes[0].status).toBe('matched');
    const html = renderToStaticMarkup(createElement(MarkdownContent, { content: markdown }));
    expect(html).toContain(target.blocks[1].resultText);
  });
  it('renders IDs, dates, modes and input labels exactly without Markdown escape artifacts', () => {
    const { target, memo, quote } = setup();
    quote.snapshot!.quoteId = 'quote-record_1';
    target.blocks[1].inputs[0].name = 'x_old-name'; target.blocks[1].result = '0';
    const markdown = buildQuoteDifferenceMarkdown(quote, 'f', [memo], [link], targetKey);
    const html = renderToStaticMarkup(createElement(MarkdownContent, { content: markdown }));
    for (const text of ['quote-record_1', at, 'note-variables', '旧変数 x_old-name']) {
      expect(html).toContain(`<code data-language="calculation-difference-value">${text}</code>`);
    }
    expect(html).not.toContain('quote\\-record'); expect(html).not.toContain('2026\\-10');
  });
  it('does not create tracking metadata or truncate a large factual difference', () => {
    const { target, generate } = setup(); target.blocks[1].resultText = '長'.repeat(60_000);
    const markdown = generate(); expect(markdown).toContain(target.blocks[1].resultText);
    expect(readQuoteAssessments(markdown, 'f', [])).toEqual([]);
    expect(() => insertDifferenceAtCursor('文'.repeat(50_000), markdown, 'f', 0)).toThrow('100,000');
  });
  it('rejects another memo or an unlinked record even with the same record ID', () => {
    const { quote, memo } = setup(); expect(() => buildQuoteDifferenceMarkdown(quote, 'f', [memo], [{ ...link, memoId: 'other' }], JSON.stringify(['other', 'target']))).toThrow();
    expect(() => buildQuoteDifferenceMarkdown(quote, 'f', [memo], [], targetKey)).toThrow();
  });
});
describe('non-destructive difference insertion', () => {
  const markdown = '## 差分\n\n変更なし';
  it('inserts before selected prose without deleting it, and preserves quote bytes', () => {
    const text = `説明\n\n${body}\n\n後書き`; const next = insertDifferenceAtCursor(text, markdown, 'f', 0, 2);
    expect(next.body).toBe(`${markdown}\n\n${text}`); expect(next.body).toContain(body);
    expect(readQuoteAssessments(next.body, 'f', [setup().memo])[0].status).toBe('matched');
  });
  it('maps normalized textarea offsets while preserving original CRLF bytes', () => {
    const text = `先頭\r\n\r\n${body.replace(/\n/g, '\r\n')}\r\n末尾`; const offset = text.replace(/\r\n/g, '\n').length;
    const next = insertDifferenceAtCursor(text, markdown, 'f', offset); expect(next.body).toBe(`${text}\n\n${markdown}\n\n`);
  });
  it.each(['valid', 'future', 'corrupt', 'foreign'])('protects the gap between visible quote and %s metadata', kind => {
    const text = kind === 'future' ? body.replace('evidence-v1', 'evidence-v2') : kind === 'corrupt' ? body.replace('"version":1', '"version":999') : kind === 'foreign' ? body.replaceAll('"formulaId":"f"', '"formulaId":"other"') : body;
    const offset = text.indexOf('```calculator-memo-evidence');
    expect(offset).toBeGreaterThan(0); expect(() => insertDifferenceAtCursor(text, markdown, 'f', offset)).toThrow('固定引用');
    expect(() => insertDifferenceAtCursor(text, markdown, 'f', 0)).not.toThrow();
    expect(() => insertDifferenceAtCursor(text, markdown, 'f', text.length)).not.toThrow();
  });
  it.each(['```js\nvalue\n```', '$$\nx\n$$', '```\nunclosed', '$$\nunclosed'])('refuses unsafe fenced insertion in %s', text => {
    expect(() => insertDifferenceAtCursor(text, markdown, 'f', text.indexOf('\n') + 1)).toThrow();
  });
  it('refuses unclosed fence EOF, invalid offsets, reversed selection, and oversized output without truncation', () => {
    expect(() => insertDifferenceAtCursor('```\na', markdown, 'f', 5)).toThrow();
    for (const offset of [-1, 99, 0.5, NaN]) expect(() => insertDifferenceAtCursor('abc', markdown, 'f', offset)).toThrow();
    expect(() => insertDifferenceAtCursor('abc', markdown, 'f', 2, 1)).toThrow();
    expect(() => insertDifferenceAtCursor('a'.repeat(99_999), markdown, 'f', 0)).toThrow('100,000');
  });
});
