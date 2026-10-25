import { describe, expect, it } from 'vitest';
import { parseReportAudit, assessReportAudit } from '../lib/formula-report-audit';
import { createQuoteMarkdown, type QuoteSnapshot } from '../lib/formula-report-quotes';
import { createTrackedDifferenceMarkdown, rebuildDifferenceMarkdown } from '../lib/formula-report-diff-tracking';
import type { DifferenceSnapshot } from '../lib/formula-report-snapshots';
import type { Memo } from '../lib/types';
import type { EvidenceRecord } from '../lib/calculation-evidence';

const at = '2026-10-24T00:00:00.000Z';
function setup() {
  const before: EvidenceRecord = { id: 'before', evaluator: 'calculator-memo-v1', status: 'confirmed', calculatedAt: at, persistedAt: at,
    blocks: [{ blockId: 'b', position: 1, expression: '1', result: '1', resultText: '1', status: 'success', inputs: [] }] };
  const after = structuredClone(before); after.id = 'after'; after.blocks[0].result = '1.0000000000000002';
  const quote: QuoteSnapshot = { version: 1, quoteId: 'q', formulaId: 'f', memoId: 'm', blockId: 'b', citedAt: at, record: before };
  const snapshot: DifferenceSnapshot = { version: 1, differenceId: 'd', preparedAt: at, quote, after, quoteBodyEdited: false };
  const difference = createTrackedDifferenceMarkdown(rebuildDifferenceMarkdown(snapshot), quote, after, 'd', at);
  const notes = [{ id: 'm', type: 'plain-calculation', title: '', content: '', createdAt: at, updatedAt: at,
    calculationEvidence: { version: 1, records: [before, after] } }] as Memo[];
  const links = [{ memoId: 'm', recordId: 'before' }, { memoId: 'm', recordId: 'after' }];
  return { before, after, quote, quoted: createQuoteMarkdown(quote), difference, notes, links };
}

describe('report-wide evidence inventory and explicit acquisition', () => {
  it.each(['\n', '\r\n'])('orders mixed occurrences and preserves original UTF-16 %j positions', newline => {
    const { quoted, difference } = setup();
    const body = `日本語😀\n\n${difference}\n\n${quoted}`.replace(/\n/g, newline);
    const result = parseReportAudit(body, 'f');
    expect(result.complete).toBe(true); expect(result.items.map(x => x.kind)).toEqual(['difference', 'quote']);
    expect(result.items.map(x => x.order)).toEqual([1, 2]);
    expect(result.items[0].start).toBe(body.indexOf('```calculator-memo-difference-start-v1'));
    expect(result.items[1].start).toBe(body.indexOf('```text\n計算根拠'.replace(/\n/g, newline)));
    expect(result.items.every(x => x.canNavigate)).toBe(true);
    expect(result.items.flatMap(x => x.sources).every(x => x.status === 'unverified')).toBe(true);
  });
  it('uses no current values until explicitly given one acquisition', () => {
    const { quoted, notes, links } = setup(); const inventory = parseReportAudit(quoted, 'f');
    expect(inventory.items[0].bodyStatus).toBe('intact'); expect(inventory.items[0].needsReview).toBe(true);
    const items = assessReportAudit(inventory, { notes, links });
    expect(items[0].sources[0]).toMatchObject({ status: 'matched', linked: true }); expect(items[0].needsReview).toBe(false);
    expect(inventory.items[0].sources[0].status).toBe('unverified');
  });
  it.each(['quote', 'difference'])('separates edited %s body from matched sources', kind => {
    const { quoted, difference, notes, links } = setup();
    const body = kind === 'quote' ? quoted.replace('当時の式：', '編集した式：') : difference.replace('### 観測された変更', '### 編集された解釈');
    const item = assessReportAudit(parseReportAudit(body, 'f'), { notes, links })[0];
    expect(item.bodyStatus).toBe('edited'); expect(item.sources.every(x => x.status === 'matched')).toBe(true); expect(item.needsReview).toBe(true);
  });
  it.each(['quote', 'difference'])('keeps duplicate %s occurrences but refuses correspondence', kind => {
    const fixture = setup(), text = kind === 'quote' ? fixture.quoted : fixture.difference;
    const items = assessReportAudit(parseReportAudit(`${text}\n\n${text}`, 'f'), fixture);
    expect(items).toHaveLength(2); expect(new Set(items.map(x => x.key)).size).toBe(2);
    for (const item of items) { expect(item.bodyStatus).toBe('invalid'); expect(item.sources).toEqual([]); expect(item.quote?.snapshot ?? item.difference?.snapshot).toBeUndefined(); expect(item.canNavigate).toBe(false); }
  });
  it('does not count nested snapshot quote markers or poison the outside duplicate map', () => {
    const { quoted, difference } = setup();
    const nested = difference.replace('### 観測された変更', `${quoted}\n\n### 観測された変更`);
    const inventory = parseReportAudit(`${nested}\n\n${quoted}`, 'f');
    expect(inventory.items).toHaveLength(2); expect(inventory.items[0].kind).toBe('difference');
    expect(inventory.items[1].bodyStatus).toBe('intact');
  });
  it.each(['preview', 'future', 'mismatch', 'missing', 'nested'])('does not recover after ambiguous %s envelopes; counts incomplete', kind => {
    const { difference, quoted } = setup();
    let text = difference;
    if (kind === 'preview') text = text.replace('### 観測された変更', '```calculator-memo-difference-preview\n{}\n```\n\n### 観測された変更');
    if (kind === 'future') text = text.replace('calculator-memo-difference-start-v1', 'calculator-memo-difference-start-v2');
    if (kind === 'mismatch') text = text.replace('"differenceId":"d"', '"differenceId":"other"');
    if (kind === 'missing') text = text.slice(0, text.indexOf('```calculator-memo-difference-v1'));
    if (kind === 'nested') text = text.replace('### 観測された変更', '```calculator-memo-difference-start-v1\n{"version":1,"differenceId":"nested"}\n```\n\n### 観測された変更');
    const inventory = parseReportAudit(`${text}\n\n${quoted}\n\n${difference}`, 'f');
    expect(inventory.complete).toBe(false); expect(inventory.items).toHaveLength(1); expect(inventory.items[0].canNavigate).toBe(false); expect(inventory.items[0].sources).toEqual([]);
  });
  it.each(['quote', 'difference'])('rejects foreign formula %s snapshot instead of exposing it', kind => {
    const fixture = setup(); const item = parseReportAudit(kind === 'quote' ? fixture.quoted : fixture.difference, 'other').items[0];
    expect(item.bodyStatus).toBe('invalid'); expect(item.sources).toEqual([]); expect(item.quote?.snapshot ?? item.difference?.snapshot).toBeUndefined();
  });
  it('retains legacy differences and missing quote metadata as untracked', () => {
    const { quoted } = setup(); const text = quoted.slice(0, quoted.indexOf('```calculator-memo-evidence'));
    const inventory = parseReportAudit(`## 引用時の計算記録と保存記録の差分\n\n${text}`, 'f');
    expect(inventory.items.map(x => x.bodyStatus)).toEqual(['untracked', 'untracked']); expect(inventory.items.every(x => !x.canNavigate)).toBe(true);
  });
  it('does not invent evidence from ordinary enclosing code, inline code or math', () => {
    const { quoted, difference } = setup();
    expect(parseReportAudit(`~~~~javascript\n${quoted}\n${difference}\n~~~~\n\n\`calculator-memo-evidence-v1\`\n\n$$\ncalculator-memo-difference-v1\n$$`, 'f').items).toEqual([]);
  });
  it('zero recognizable items is not an inferred completeness claim about provenance', () => {
    const inventory = parseReportAudit('ただの文章', 'f'); expect(inventory.items).toEqual([]); expect(inventory.reason).toContain('推定しません');
  });
  it('over-limit body is unenumerated, not an apparent zero-pass result', () => {
    const inventory = parseReportAudit('x'.repeat(100001), 'f'); expect(inventory.complete).toBe(false); expect(inventory.reason).toContain('根拠0件とは判定していません');
  });
  it('unclosed quote metadata is invalid, hidden, and incomplete', () => {
    const { quoted } = setup(); const item = parseReportAudit(quoted.slice(0, -3), 'f');
    expect(item.complete).toBe(false); expect(item.items[0].bodyStatus).toBe('invalid'); expect(item.items[0].quote?.snapshot).toBeUndefined();
  });
  it.each(['before', 'after'] as const)('keeps one changed difference side separate (%s)', side => {
    const fixture = setup(); fixture[side].blocks[0].result = '1.0000000000000004';
    const item = assessReportAudit(parseReportAudit(fixture.difference, 'f'), fixture)[0];
    expect(item.sources.find(x => x.side === side)?.status).toBe('changed'); expect(item.sources.find(x => x.side !== side)?.status).toBe('matched');
  });
  it.each(['before', 'after'] as const)('keeps missing difference side separate (%s)', side => {
    const fixture = setup(); const memo = fixture.notes[0]; if (memo.type === 'plain-calculation') memo.calculationEvidence!.records = memo.calculationEvidence!.records.filter(x => x.id !== side);
    const item = assessReportAudit(parseReportAudit(fixture.difference, 'f'), fixture)[0];
    expect(item.sources.find(x => x.side === side)?.status).toBe('missing'); expect(item.sources.find(x => x.side !== side)?.status).toBe('matched'); expect(item.difference?.snapshot).toBeDefined();
  });
  it('unlinked matched sources are separate from missing and require review', () => {
    const fixture = setup(); const item = assessReportAudit(parseReportAudit(fixture.quoted, 'f'), { ...fixture, links: [] })[0];
    expect(item.sources[0]).toMatchObject({ status: 'matched', linked: false }); expect(item.needsReview).toBe(true);
  });
  it.each([{ error: 'failed' }, { invalidData: true }, { stale: true }])('failure/invalid/stale never reuses a previous matched result %j', flags => {
    const fixture = setup(); const inventory = parseReportAudit(`${fixture.quoted}\n\n${fixture.difference}`, 'f');
    expect(assessReportAudit(inventory, fixture).every(x => !x.needsReview)).toBe(true);
    const items = assessReportAudit(inventory, { ...fixture, ...flags });
    const expected = 'stale' in flags ? 'unverified' : 'invalidData' in flags ? 'invalid' : 'unavailable';
    expect(items.flatMap(x => x.sources).every(x => x.status === expected && !x.record && x.linked === undefined)).toBe(true);
    expect(assessReportAudit(inventory, fixture).every(x => !x.needsReview)).toBe(true);
  });
  it('never substitutes a same-named record in another memo', () => {
    const fixture = setup(); fixture.notes[0].id = 'another';
    expect(assessReportAudit(parseReportAudit(fixture.quoted, 'f'), fixture)[0].sources[0].status).toBe('missing');
  });
  it('retains body, immutable snapshots, records, links, and pre-existing audit results', () => {
    const fixture = setup(); const body = `${fixture.quoted}\n\n${fixture.difference}`, before = JSON.stringify(fixture);
    const inventory = parseReportAudit(body, 'f'), frozen = JSON.stringify(inventory);
    assessReportAudit(inventory, fixture); assessReportAudit(inventory, { ...fixture, error: 'failure' });
    expect(JSON.stringify(fixture)).toBe(before); expect(JSON.stringify(inventory)).toBe(frozen);
  });
});
