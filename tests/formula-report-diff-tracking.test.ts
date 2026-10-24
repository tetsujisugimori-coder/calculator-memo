import { describe, expect, it } from 'vitest';
import type { EvidenceRecord } from '../lib/calculation-evidence';
import { buildQuoteDifferenceMarkdown } from '../lib/formula-report-diff';
import { createTrackedDifferenceMarkdown, readDifferenceAssessments, rebuildDifferenceMarkdown, validateDifferenceSnapshot, type DifferenceSnapshot } from '../lib/formula-report-diff-tracking';
import { insertQuoteAtCursor, type QuoteSnapshot } from '../lib/formula-report-quotes';
import type { Memo } from '../lib/types';

const at = '2026-10-24T00:00:00.000Z';
const original: EvidenceRecord = { id: 'before', evaluator: 'calculator-memo-v1', status: 'confirmed', calculatedAt: at, persistedAt: at, blocks: [
  { blockId: 'b', position: 1, expression: '1', result: '1', resultText: '1', status: 'success', inputs: [] },
] };
function setup(edited = false) {
  const before = structuredClone(original);
  const after = structuredClone(original); after.id = 'after'; after.blocks[0].result = '1.0000000000000002';
  const quote: QuoteSnapshot = { version: 1, quoteId: 'q', formulaId: 'f', memoId: 'm', blockId: 'b', citedAt: at, record: before };
  const memo = { id: 'm', type: 'plain-calculation', title: '', content: '', createdAt: at, updatedAt: at, calculationEvidence: { version: 1, records: [before, after] } } as Memo;
  const notes = [memo];
  const links = [{ memoId: 'm', recordId: 'after' }];
  const markdown = buildQuoteDifferenceMarkdown({ status: edited ? 'edited' : 'matched', reason: '', start: 0, end: 0, snapshot: quote }, 'f', notes, links, JSON.stringify(['m', 'after']));
  const tracked = createTrackedDifferenceMarkdown(markdown, quote, after, 'difference-1', at);
  return { before, after, quote, memo, notes, markdown, tracked };
}
function mutateMetadata(body: string, change: (value: DifferenceSnapshot & Record<string, unknown>) => void) {
  return body.replace(/(`{3,}calculator-memo-difference-v1\n)([^\n]+)(\n`{3,})/, (_, start, json, end) => { const value = JSON.parse(json); change(value); return start + JSON.stringify(value) + end; });
}

describe('comparison difference source tracking', () => {
  it('round trips both immutable saved snapshots and actual observed preparation time', () => {
    const { tracked, notes, markdown, quote, after } = setup();
    const raw = JSON.stringify(notes), originalQuote = JSON.stringify(quote);
    const result = readDifferenceAssessments(`intro\n\n${tracked}\n\nend`, 'f', notes);
    expect(result).toHaveLength(1); expect(result[0].status).toBe('tracked');
    expect(result[0].before?.status).toBe('matched'); expect(result[0].after?.status).toBe('matched');
    expect(result[0].snapshot?.quote).toEqual(quote); expect(result[0].snapshot?.after).toEqual(after);
    expect(result[0].snapshot?.preparedAt).toBe(at); expect(rebuildDifferenceMarkdown(result[0].snapshot!)).toBe(markdown);
    expect(JSON.stringify(notes)).toBe(raw); expect(JSON.stringify(quote)).toBe(originalQuote);
  });
  it('detects same-ID internal value changes even when displayed value is equal', () => {
    const { tracked, notes, before } = setup(); before.blocks[0].result = '1.0000000000000004';
    const result = readDifferenceAssessments(tracked, 'f', notes)[0];
    expect(result.before?.status).toBe('changed'); expect(result.after?.status).toBe('matched');
    expect(result.snapshot?.quote.record.blocks[0].result).toBe('1');
  });
  it.each(['before', 'after'] as const)('detects the %s record deletion without losing either frozen record', which => {
    const { tracked, notes, memo } = setup(); if (memo.type === 'plain-calculation') memo.calculationEvidence!.records = memo.calculationEvidence!.records.filter(record => record.id !== which);
    const result = readDifferenceAssessments(tracked, 'f', notes)[0];
    expect(result[which]?.status).toBe('missing'); expect(result.snapshot?.quote.record.id).toBe('before'); expect(result.snapshot?.after.id).toBe('after');
  });
  it('treats removed blocks as changed records, not a whole-record disappearance', () => {
    const { tracked, notes, after } = setup(); after.blocks[0].blockId = 'replacement';
    expect(readDifferenceAssessments(tracked, 'f', notes)[0].after?.status).toBe('changed');
  });
  it.each([{ error: 'read failed' }, { stale: true }])('never marks cached records verified when unavailable %j', availability => {
    const { tracked, notes } = setup(); const result = readDifferenceAssessments(tracked, 'f', notes, availability)[0];
    expect(result.before?.status).toBe(availability.error ? 'unavailable' : 'stale');
    expect(result.after?.record).toBeUndefined(); expect(result.snapshot).toBeDefined();
  });
  it.each(['future', 'bad-result', 'unknown-field'])('distinguishes current storage %s from missing', kind => {
    const { tracked, notes, memo, after } = setup();
    if (kind === 'future' && memo.type === 'plain-calculation') Object.assign(memo.calculationEvidence!, { version: 2 });
    if (kind === 'bad-result') after.blocks[0].result = 'NaN';
    if (kind === 'unknown-field') Object.assign(after, { future: true });
    expect(readDifferenceAssessments(tracked, 'f', notes)[0].after?.status).toBe('invalid');
  });
  it('separates edited visible Markdown from both current source comparisons', () => {
    const { tracked, notes } = setup(); const result = readDifferenceAssessments(tracked.replace('### 観測された変更', '### 手書きの解釈'), 'f', notes)[0];
    expect(result.status).toBe('edited'); expect(result.before?.status).toBe('matched'); expect(result.after?.status).toBe('matched'); expect(result.snapshot).toBeDefined();
  });
  it('preserves the original edited-quote annotation rather than assuming current text', () => {
    const { tracked, notes } = setup(true); const result = readDifferenceAssessments(tracked, 'f', notes)[0];
    expect(result.status).toBe('tracked'); expect(result.snapshot?.quoteBodyEdited).toBe(true);
  });
  it('refuses tracking for an arbitrary or changed Markdown claim', () => {
    const { markdown, quote, after } = setup(); expect(() => createTrackedDifferenceMarkdown(markdown.replace('1.0000000000000002', '500'), quote, after, 'd', at)).toThrow();
  });
  it.each(['version', 'extra', 'quote-extra', 'record-extra', 'missing-date', 'same-record', 'invalid-time'])('does not expose snapshots from invalid metadata: %s', kind => {
    const { tracked, notes } = setup(); const changed = mutateMetadata(tracked, value => {
      if (kind === 'version') Object.assign(value, { version: 2 });
      if (kind === 'extra') value.future = 1;
      if (kind === 'quote-extra') Object.assign(value.quote, { future: 1 });
      if (kind === 'record-extra') Object.assign(value.after, { future: 1 });
      if (kind === 'missing-date') delete (value.after as Partial<EvidenceRecord>).persistedAt;
      if (kind === 'same-record') value.after.id = value.quote.record.id;
      if (kind === 'invalid-time') value.preparedAt = 'unknown';
    }); const result = readDifferenceAssessments(changed, 'f', notes)[0];
    expect(result.status).toBe('invalid'); expect(result.snapshot).toBeUndefined(); expect(result.before).toBeUndefined();
  });
  it('rejects foreign formula identities even if names and expressions coincide', () => {
    const { tracked, notes } = setup(); const result = readDifferenceAssessments(tracked, 'different-formula', notes)[0];
    expect(result.status).toBe('invalid'); expect(result.snapshot).toBeUndefined();
  });
  it('does not resolve identical record IDs from another memo', () => {
    const { tracked, notes, memo } = setup(); memo.id = 'another-memo';
    expect(readDifferenceAssessments(tracked, 'f', notes)[0].before?.status).toBe('missing');
  });
  it('handles multiple distinct citations but refuses duplicate difference identifiers', () => {
    const { tracked, notes, markdown, quote, after } = setup();
    const second = createTrackedDifferenceMarkdown(markdown, quote, after, 'difference-2', at);
    expect(readDifferenceAssessments(tracked + '\n\n' + second, 'f', notes).map(item => item.status)).toEqual(['tracked', 'tracked']);
    const duplicate = readDifferenceAssessments(tracked + '\n\n' + tracked, 'f', notes);
    expect(duplicate.map(item => item.status)).toEqual(['invalid', 'invalid']); expect(duplicate.every(item => !item.snapshot)).toBe(true);
  });
  it('reports legacy Markdown as untracked without guessing sources from its IDs', () => {
    const { markdown, notes } = setup(); const result = readDifferenceAssessments(markdown, 'f', notes)[0];
    expect(result.status).toBe('untracked'); expect(result.snapshot).toBeUndefined();
  });
  it('detects missing closing metadata and missing start separately', () => {
    const { tracked, notes } = setup();
    const missingMetadata = tracked.slice(0, tracked.indexOf('```calculator-memo-difference-v1'));
    expect(readDifferenceAssessments(missingMetadata, 'f', notes)[0].status).toBe('untracked');
    const missingStart = tracked.replace(/^```calculator-memo-difference-start-v1\n[^\n]+\n```\n\n/, '');
    const results = readDifferenceAssessments(missingStart, 'f', notes);
    expect(results.some(item => item.status === 'edited' && item.snapshot)).toBe(true);
    expect(results.every(item => item.status !== 'tracked')).toBe(true);
  });
  it('rejects mismatched structural IDs and future fence versions', () => {
    const { tracked, notes } = setup();
    expect(readDifferenceAssessments(tracked.replace('"differenceId":"difference-1"', '"differenceId":"different"'), 'f', notes)[0].snapshot).toBeUndefined();
    expect(readDifferenceAssessments(tracked.replace('calculator-memo-difference-v1', 'calculator-memo-difference-v2'), 'f', notes)[0].status).toBe('invalid');
  });
  it('uses renderer structural blocks and never executes or recognizes marker strings inside data fences', () => {
    const { quote, after, notes } = setup(); after.blocks[0].expression = '```calculator-memo-difference-v1\n{}\n```\n日本語 <script>alert(1)</script>';
    const markdown = buildQuoteDifferenceMarkdown({ status: 'matched', reason: '', start: 0, end: 0, snapshot: quote }, 'f', notes, [{ memoId: 'm', recordId: 'after' }], '["m","after"]');
    const tracked = createTrackedDifferenceMarkdown(markdown, quote, after, 'd', at);
    const results = readDifferenceAssessments(tracked, 'f', notes); expect(results).toHaveLength(1); expect(results[0].status).toBe('tracked');
  });
  it('allows line ending conversion but no altered source values', () => {
    const { tracked, notes } = setup(); expect(readDifferenceAssessments(tracked.replace(/\n/g, '\r\n'), 'f', notes)[0].status).toBe('tracked');
  });
  it('never truncates overcapacity bodies', () => {
    const { tracked, notes } = setup(); const body = tracked + 'x'.repeat(100_000); const raw = body;
    expect(readDifferenceAssessments(body, 'f', notes)[0].status).toBe('invalid'); expect(body).toBe(raw);
  });
  it('rejects nested starts without associating the later metadata to guessed boundaries', () => {
    const { tracked, notes } = setup();
    const nested = tracked.replace('## 引用時の計算記録と保存記録の差分', '```calculator-memo-difference-start-v1\n{"version":1,"differenceId":"difference-1"}\n```\n\n## 引用時の計算記録と保存記録の差分');
    expect(readDifferenceAssessments(nested, 'f', notes).every(item => !item.snapshot && item.status === 'invalid')).toBe(true);
  });
  it('keeps unknown start-only forms distinct from simply missing metadata', () => {
    const result = readDifferenceAssessments('```calculator-memo-difference-start-v2\n{"version":2,"differenceId":"future"}\n```', 'f', []);
    expect(result[0].status).toBe('invalid'); expect(result[0].snapshot).toBeUndefined();
  });
  it.each(['heading', 'gap', 'metadata', 'future'])('refuses quote insertion into the tracked %s interior', location => {
    const { tracked } = setup();
    const body = location === 'future' ? tracked.replaceAll('difference-start-v1', 'difference-start-v2') : tracked;
    const offset = location === 'heading' || location === 'future' ? body.indexOf('### 引用時') : location === 'gap' ? body.indexOf('```calculator-memo-difference-v1') - 1 : body.indexOf('```calculator-memo-difference-v1') + 4;
    expect(() => insertQuoteAtCursor(body, 'new quote', offset)).toThrow();
    expect(body.includes('1.0000000000000002')).toBe(true);
  });
  it('allows insertion outside a complete tracked envelope without changing it', () => {
    const { tracked } = setup();
    expect(insertQuoteAtCursor(tracked, 'new quote', 0).body.endsWith(tracked)).toBe(true);
    expect(insertQuoteAtCursor(tracked, 'new quote', tracked.length).body.startsWith(tracked)).toBe(true);
  });
  it('refuses insertion at an unclosed tracked envelope end', () => {
    const { tracked } = setup();
    const body = tracked.slice(0, tracked.indexOf('```calculator-memo-difference-v1'));
    expect(() => insertQuoteAtCursor(body, 'new quote', body.length)).toThrow();
  });
  it('strictly rejects insufficient snapshot structures', () => {
    expect(() => validateDifferenceSnapshot({ version: 1, differenceId: 'd', preparedAt: at })).toThrow();
  });
});
