import { describe, expect, it } from 'vitest';
import { compareQuoteToRecord, quoteComparisonTargets } from '../lib/formula-quote-comparison';
import { createQuoteMarkdown, readQuoteAssessments, type QuoteSnapshot } from '../lib/formula-report-quotes';
import type { EvidenceRecord } from '../lib/calculation-evidence';
import type { Memo } from '../lib/types';

const at = '2026-10-24T00:00:00.000Z';
const record = (id: string): EvidenceRecord => ({ id, evaluator: 'calculator-memo-v1', status: 'confirmed', calculatedAt: at, persistedAt: at, blocks: [
  { blockId: 'a', position: 1, expression: '-0', inputs: [], result: '-0', resultText: '0', status: 'success' },
  { blockId: 'b', position: 2, expression: 'x', inputs: [{ kind: 'variable', name: 'x', sourceBlockId: 'a', value: '-0' }], result: '-0', resultText: '0', status: 'success' },
] });
const snapshot = (): QuoteSnapshot => ({ version: 1, quoteId: 'q', formulaId: 'f', memoId: 'm', blockId: 'b', citedAt: at, record: record('original') });
const memo = (records: EvidenceRecord[], id = 'm'): Memo => ({ id, type: 'plain-calculation', title: '同名', content: '未保存ドラフト999', createdAt: at, updatedAt: at, calculationEvidence: { version: 1, records } });
const links = [{ memoId: 'm', recordId: 'original' }, { memoId: 'm', recordId: 'target' }];
const key = JSON.stringify(['m', 'target']);
const assess = (notes: Memo[], body = createQuoteMarkdown(snapshot()), formulaId = 'f') => readQuoteAssessments(body, formulaId, notes)[0];

describe('quoted snapshot to explicitly linked saved record', () => {
  it.each(['changed', 'missing'])('keeps frozen citation when original is %s', state => {
    const original = record('original'); original.blocks[1].result = '999'; original.blocks[1].resultText = '999';
    const notes = [memo(state === 'changed' ? [original, record('target')] : [record('target')])];
    const quote = assess(notes); expect(quote.status).toBe(state === 'changed' ? 'source-changed' : 'source-missing');
    const before = JSON.stringify({ notes, quote, links });
    const result = compareQuoteToRecord(quote, 'f', notes, links, key);
    expect(result.before.blocks[1].result).toBe('-0'); expect(result.counts.unchanged).toBe(2);
    expect(JSON.stringify({ notes, quote, links })).toBe(before);
  });
  it('distinguishes equal displayed zero from changed signed internal zero', () => {
    const target = record('target'); target.blocks[1].result = '0'; const notes = [memo([target])];
    const row = compareQuoteToRecord(assess(notes), 'f', notes, links, key).rows[1];
    expect(row.changes).toEqual(['internalResult']);
  });
  it.each(['sources', 'values'] as const)('compares saved actual input %s, not current draft', change => {
    const cited = snapshot(); cited.record.blocks[1].position = 3; cited.record.blocks.splice(1, 0, { ...cited.record.blocks[0], blockId: 'a2', position: 2 });
    const target = { ...structuredClone(cited.record), id: 'target' };
    if (change === 'sources') target.blocks[2].inputs[0].sourceBlockId = 'a2';
    else target.blocks[2].inputs[0].value = '0';
    const notes = [memo([target])];
    expect(compareQuoteToRecord(assess(notes, createQuoteMarkdown(cited)), 'f', notes, links, key).rows.find(row => row.blockId === 'b')!.changes).toEqual([change]);
  });
  it('uses block IDs for additions/removals despite identical expressions and names', () => {
    const target = record('target'); target.blocks[1].blockId = 'renamed'; const notes = [memo([target])];
    expect(compareQuoteToRecord(assess(notes), 'f', notes, links, key).counts).toEqual({ changed: 0, added: 1, removed: 1, unchanged: 1 });
  });
  it('offers only same-memo explicit links, excluding original and unlinked records', () => {
    const notes = [memo([record('original'), record('target'), record('unlinked')]), memo([record('target')], 'same-name-other-memo')];
    const allLinks = [...links, { memoId: 'same-name-other-memo', recordId: 'target' }];
    expect(quoteComparisonTargets(assess(notes), 'f', notes, allLinks).map(item => item.link)).toEqual([links[1]]);
    for (const choice of [JSON.stringify(['m', 'original']), JSON.stringify(['m', 'unlinked']), JSON.stringify(['same-name-other-memo', 'target'])]) {
      expect(() => compareQuoteToRecord(assess(notes), 'f', notes, allLinks, choice)).toThrow('保存済み根拠リンク');
    }
  });
  it('does not sort by timestamps or choose any target automatically', () => {
    const target = record('target'); target.persistedAt = '2020-01-01T00:00:00.000Z'; const notes = [memo([target, record('newer')])];
    const ordered = [{ memoId: 'm', recordId: 'newer' }, links[1]];
    expect(quoteComparisonTargets(assess(notes), 'f', notes, ordered).map(item => item.link.recordId)).toEqual(['newer', 'target']);
    expect(() => compareQuoteToRecord(assess(notes), 'f', notes, ordered, '')).toThrow();
  });
  it('preserves edited visible citation but compares its saved metadata', () => {
    const notes = [memo([record('target')])]; const body = createQuoteMarkdown(snapshot()).replace('当時の内部結果：-0', '当時の内部結果：999'); const quote = assess(notes, body);
    expect(quote.status).toBe('edited'); expect(compareQuoteToRecord(quote, 'f', notes, links, key).before.blocks[1].result).toBe('-0');
  });
  it.each(['future', 'foreign', 'duplicate', 'malformed'])('blocks %s quote without changing raw text', kind => {
    const original = createQuoteMarkdown(snapshot());
    const body = kind === 'future' ? original.replace('calculator-memo-evidence-v1', 'calculator-memo-evidence-v2') : kind === 'duplicate' ? `${original}\n\n${original}` : kind === 'malformed' ? '```calculator-memo-evidence-v1\n{bad\n```' : original;
    const notes = [memo([record('target')])]; const quote = assess(notes, body, kind === 'foreign' ? 'foreign' : 'f');
    expect(quote.status).toBe('invalid'); expect(() => quoteComparisonTargets(quote, 'f', notes, links)).toThrow();
  });
  it('revalidates snapshot formula ID and unknown fields at the comparison boundary', () => {
    const notes = [memo([record('target')])]; const quote = assess(notes);
    expect(() => quoteComparisonTargets(quote, 'foreign', notes, links)).toThrow('登録式ID');
    Object.assign(quote.snapshot!, { future: true }); expect(() => quoteComparisonTargets(quote, 'f', notes, links)).toThrow();
  });
  it('distinguishes missing target from ambiguous or unsupported source records', () => {
    expect(() => compareQuoteToRecord(assess([]), 'f', [], links, key)).toThrow('欠落');
    const notes = [memo([record('target')]), memo([record('target')])];
    expect(() => compareQuoteToRecord(assess(notes), 'f', notes, links, key)).toThrow('未知・不正');
    const target = record('target'); Object.assign(target, { future: true }); const unknown = [memo([target])];
    expect(() => compareQuoteToRecord(assess(unknown), 'f', unknown, links, key)).toThrow('未知・不正');
  });
  it('rejects duplicate links rather than choosing an ambiguous association', () => {
    const notes = [memo([record('target')])]; expect(() => quoteComparisonTargets(assess(notes), 'f', notes, [...links, links[1]])).toThrow('重複');
  });
});
