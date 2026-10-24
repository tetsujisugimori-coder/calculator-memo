import { describe, expect, it } from 'vitest';
import { createQuoteMarkdown, insertQuoteAtCursor, quoteCandidates, readQuoteAssessments, validateQuoteSnapshot, type QuoteSnapshot } from '../lib/formula-report-quotes';
import { parseMarkdownBlocks } from '../lib/markdown-blocks';
import type { Memo } from '../lib/types';
const now = '2026-10-24T00:00:00.000Z';
const snapshot: QuoteSnapshot = { version: 1, quoteId: 'q', formulaId: 'f', memoId: 'm', blockId: 'b', citedAt: now, record: {
  id: 'r', evaluator: 'calculator-memo-v1', status: 'confirmed', calculatedAt: now, persistedAt: now, blocks: [
    { blockId: 'a', position: 1, expression: '-0', inputs: [], result: '-0', resultText: '0', status: 'success' },
    { blockId: 'b', position: 2, expression: 'x', inputs: [{ kind: 'variable', name: 'x', sourceBlockId: 'a', value: '-0' }], result: '-0', resultText: '0', status: 'success' },
  ],
} };
const notes: Memo[] = [{ id: 'm', type: 'plain-calculation', title: '元', content: '現在本文は別物', createdAt: now, updatedAt: now, calculationEvidence: { version: 1, records: [snapshot.record] } }];
const body = () => createQuoteMarkdown(snapshot);
const assess = (markdown = body(), source = notes) => readQuoteAssessments(markdown, 'f', source);
function changed(mutator: (value: QuoteSnapshot) => void) { const value = structuredClone(snapshot); mutator(value); return value; }
function modifiedNotes(mutator: (value: QuoteSnapshot) => void): Memo[] { return [{ ...notes[0], calculationEvidence: { version: 1, records: [changed(mutator).record] } } as Memo]; }
describe('fixed calculation citations', () => {
  it('renders exact saved internal values separately from display text, without mutation', () => {
    const before = JSON.stringify({ snapshot, notes }); const result = body();
    expect(result).toContain('当時の表示結果：\n0'); expect(result).toContain('当時の内部結果：-0'); expect(result).toContain('内部値：-0');
    expect(result).toContain('数学的証明の保証ではありません'); expect(assess()).toHaveLength(1); expect(assess()[0].status).toBe('matched');
    expect(JSON.stringify({ snapshot, notes })).toBe(before);
  });
  it('candidates are only explicit associated links and do not infer names or definitions', () => {
    expect(quoteCandidates(notes, [])).toEqual([]);
    expect(quoteCandidates(notes, [{ memoId: 'm', recordId: 'r' }])).toHaveLength(1);
    expect(quoteCandidates(notes, [{ memoId: 'm', recordId: 'absent' }])).toEqual([]);
  });
  it('clones candidate records and leaves raw source untouched', () => {
    const choices = quoteCandidates(notes, [{ memoId: 'm', recordId: 'r' }]); choices[0].record!.blocks[0].result = '10';
    expect(snapshot.record.blocks[0].result).toBe('-0');
  });
  it('detects any same-ID record changes including other blocks and actual input values', () => {
    for (const change of [(v: QuoteSnapshot) => { v.record.blocks[0].expression = '0'; }, (v: QuoteSnapshot) => { v.record.blocks[1].inputs[0].value = '1'; }, (v: QuoteSnapshot) => { v.record.persistedAt = '2026-10-24T01:00:00.000Z'; }]) {
      expect(assess(body(), modifiedNotes(change))[0].status).toBe('source-changed');
    }
  });
  it('does not equate new record IDs or current memo body changes with same-record change', () => {
    const source = structuredClone(notes); source[0].title = '新名'; if (source[0].type === 'plain-calculation') source[0].content = '変更済み現在本文';
    expect(assess(body(), source)[0].status).toBe('matched');
    expect(assess(body(), modifiedNotes(v => { v.record.id = 'new'; }))[0].status).toBe('source-missing');
  });
  it('distinguishes missing memo, record and block', () => {
    expect(assess(body(), [])[0].status).toBe('source-missing');
    expect(assess(body(), modifiedNotes(v => { v.record.blocks.pop(); }))[0].status).toBe('source-missing');
  });
  it.each([{ error: 'load failed' }, { stale: true }])('fails closed on acquisition status %j', availability => {
    expect(readQuoteAssessments(body(), 'f', notes, availability)[0].status).toBe('unavailable');
  });
  it('rejects duplicate memo IDs as unavailable, never matching', () => { expect(assess(body(), [...notes, ...notes])[0].status).toBe('unavailable'); });
  it.each(['unknown', 'unconfirmed', 'error', null])('does not cite unsupported record state %j', status => {
    const value = changed(v => { (v.record as unknown as { status: unknown }).status = status; });
    expect(() => createQuoteMarkdown(value)).toThrow();
    expect(assess(body(), modifiedNotes(v => { (v.record as unknown as { status: unknown }).status = status; }))[0].status).toBe('unavailable');
  });
  it.each([null, '', 'NaN', 'Infinity', '01'])('rejects missing/invalid internal result %j', result => {
    const value = changed(v => { (v.record.blocks[1] as unknown as { result: unknown }).result = result; }); expect(() => createQuoteMarkdown(value)).toThrow();
  });
  it.each([null, {}, { ...snapshot, version: 2 }, { ...snapshot, future: true }, { ...snapshot, quoteId: '' }, { ...snapshot, citedAt: 'yesterday' }])('rejects unsupported metadata %j', value => { expect(() => validateQuoteSnapshot(value)).toThrow(); });
  it('rejects unknown nested fields without removing them', () => {
    const value = changed(v => { Object.assign(v.record.blocks[1].inputs[0], { future: 1 }); }); const original = JSON.stringify(value);
    expect(() => createQuoteMarkdown(value)).toThrow(); expect(JSON.stringify(value)).toBe(original);
    expect(assess(body(), modifiedNotes(v => { Object.assign(v.record, { future: 1 }); }))[0].status).toBe('unavailable');
  });
  it('safely fences Japanese, newlines, markup, backticks and special characters', () => {
    const value = changed(v => { v.record.blocks[1].expression = '日本語😀\n```\n<script>alert(1)</script>\n# Heading'; });
    const markdown = createQuoteMarkdown(value); const parsed = parseMarkdownBlocks(markdown);
    expect(parsed.map(b => b.kind)).toEqual(['code', 'code']); expect(parsed[0].kind === 'code' && parsed[0].text).toContain('<script>');
    expect(readQuoteAssessments(markdown, 'f', modifiedNotes(v => { v.record.blocks[1].expression = value.record.blocks[1].expression; }))[0].status).toBe('matched');
  });
  it('preserves distinct repeated citations of same block, flags duplicated quote identity', () => {
    const second = createQuoteMarkdown({ ...snapshot, quoteId: 'q2' }); expect(assess(`${body()}\n\n${second}`).map(r => r.status)).toEqual(['matched', 'matched']);
    expect(assess(`${body()}\n\n${body()}`).map(r => r.status)).toEqual(['invalid', 'invalid']);
  });
  it('flags manual visible changes independently of unchanged metadata', () => { expect(assess(body().replace('当時の内部結果：-0', '当時の内部結果：999'))[0].status).toBe('edited'); });
  it('flags removed visible citation, malformed metadata, unknown future version and foreign formula', () => {
    const metadata = parseMarkdownBlocks(body())[1]; expect(assess(body().slice(metadata.start))[0].status).toBe('edited');
    expect(assess('```calculator-memo-evidence-v1\n{bad\n```')[0].status).toBe('invalid');
    expect(assess(body().replace('calculator-memo-evidence-v1', 'calculator-memo-evidence-v2'))[0].status).toBe('invalid');
    expect(readQuoteAssessments(body(), 'other', notes)[0].status).toBe('invalid');
  });
  it('detects metadata removal while retaining visible text', () => {
    const metadata = parseMarkdownBlocks(body())[1]; expect(assess(body().slice(0, metadata.start))[0].status).toBe('invalid');
  });
  it('does not interpret quoted code examples as metadata', () => { expect(assess('````example\n```calculator-memo-evidence-v1\n{}\n```\n````')).toEqual([]); });
  it('survives raw Markdown round trip and CRLF conversion without data writes', () => {
    expect(assess(JSON.parse(JSON.stringify(body())))[0].status).toBe('matched'); expect(assess(body().replace(/\n/g, '\r\n'))[0].status).toBe('matched');
  });
  it('stops oversize citation/assessment without silently cutting text', () => {
    const value = changed(v => { v.record.blocks[1].resultText = 'x'.repeat(60_000); }); expect(() => createQuoteMarkdown(value)).toThrow('上限');
    expect(assess('x'.repeat(100_001))[0].status).toBe('unavailable');
  });
});
describe('non-destructive cursor insertion', () => {
  it.each([0, 2, 4])('inserts at cursor %s without replacing prose', position => {
    const result = insertQuoteAtCursor('abcd', 'QUOTE', position); expect(result.body.replace(/\n/g, '')).toBe(`abcd`.slice(0, position) + 'QUOTE' + 'abcd'.slice(position));
  });
  it('preserves selected prose and inserts before selection', () => { expect(insertQuoteAtCursor('abcdef', 'Q', 1, 5).body).toBe('a\n\nQ\n\nbcdef'); });
  it('maps normalized textarea offsets back to CRLF and preserves untouched bytes', () => {
    const result = insertQuoteAtCursor('a\r\nb\rc', 'Q', 3, 4); expect(result.body).toBe('a\r\nb\n\nQ\n\n\rc'); expect(result.caret).toBe(8);
  });
  it.each([-1, 9, NaN, 1.5])('rejects invalid cursor %s', offset => { expect(() => insertQuoteAtCursor('abc', 'Q', offset)).toThrow(); });
  it('refuses insertion inside code or display math instead of hiding citation tracking', () => {
    expect(() => insertQuoteAtCursor('```text\nabc\n```', 'Q', 9)).toThrow('ブロック内');
    expect(() => insertQuoteAtCursor('$$\nx\n$$', 'Q', 4)).toThrow('ブロック内');
  });
  it.each([
    '$$\nx', '$$\nx\n\n', '$$', '$$\n', '$$\nx\n$$!',
    '```text\nabc', '```text\nabc\n\n', '```',
    '````text\nx\n```', '~~~text\nx\n```', '```text\nx\n```!',
    '```text\nx\n    ```', '~~~text\nx\n~~~ suffix',
    '  ````text\r\nabc\r\n\r\n',
  ])('rejects EOF of unclosed block %j without swallowing a quote', source => {
    const cursor = source.replace(/\r\n?/g, '\n').length;
    expect(() => insertQuoteAtCursor(source, body(), cursor)).toThrow('ブロック内');
  });
  it.each([
    '$$\nx\n$$', '$$\nx\n$$\n\n', '```text\nabc\n```',
    '````text\nx\n`````', '~~~text\nx\n~~~ \t',
    '  ```text\r\nabc\r\n   ```\r\n\r\n',
  ])('allows EOF after a closed block %j with intact quote assessments', source => {
    const cursor = source.replace(/\r\n?/g, '\n').length;
    const inserted = insertQuoteAtCursor(source, body(), cursor);
    expect(inserted.body.startsWith(source)).toBe(true);
    expect(assess(inserted.body).map(item => item.status)).toEqual(['matched']);
  });
  it('rejects invalid range and capacity without modifying original', () => {
    expect(() => insertQuoteAtCursor('abc', 'Q', 2, 1)).toThrow(); expect(() => insertQuoteAtCursor('a'.repeat(100_000), 'Q', 0)).toThrow('上限');
  });
});
