import { describe, expect, it } from 'vitest';
import { createAuditRecordMarkdown, scanAuditRecordEnvelopes, AUDIT_RECORD_START, AUDIT_RECORD_END } from '../lib/formula-report-audit-record';
import { buildAuditMarkdown } from '../lib/formula-report-audit-export';
import { parseReportAudit } from '../lib/formula-report-audit';
import { createQuoteMarkdown, readQuoteAssessments, insertQuoteAtCursor, type QuoteSnapshot } from '../lib/formula-report-quotes';
import { createTrackedDifferenceMarkdown, rebuildDifferenceMarkdown, readDifferenceAssessments } from '../lib/formula-report-diff-tracking';
import { insertDifferenceAtCursor } from '../lib/formula-report-diff';
import type { DifferenceSnapshot } from '../lib/formula-report-snapshots';
const at = '2026-10-25T00:00:00.000Z';
const info = { recordId: 'audit-1', formulaId: 'f', reportId: 'r', generatedAt: at, bodySha256: 'a'.repeat(64), bodyLength: 7 };
const quote: QuoteSnapshot = { version: 1, quoteId: 'q', formulaId: 'f', memoId: 'm', blockId: 'b', citedAt: at, record: { id: 'before', evaluator: 'calculator-memo-v1', status: 'confirmed', calculatedAt: at, persistedAt: at, blocks: [{ blockId: 'b', position: 1, expression: '1', result: '1', resultText: '1', status: 'success', inputs: [] }] } };
const q = createQuoteMarkdown(quote);
const diff: DifferenceSnapshot = { version: 1, differenceId: 'd', preparedAt: at, quote, after: { ...quote.record, id: 'after' }, quoteBodyEdited: false };
const d = createTrackedDifferenceMarkdown(rebuildDifferenceMarkdown(diff), quote, diff.after, 'd', at);
const fixed = (text = `${q}\n\n${d}`) => createAuditRecordMarkdown(text, info);

describe('fixed audit record strict boundaries', () => {
  it.each(['\n', '\r\n', '\r'])('excludes historical quote and diff before duplicate checks, preserving outside occurrences %j', newline => {
    const body = `${q}\n\n${fixed()}\n\n${d}`.replace(/\n/g, newline);
    const inventory = parseReportAudit(body, 'f');
    expect(inventory.complete).toBe(true); expect(inventory.items.map(item => item.kind)).toEqual(['quote', 'difference']);
    expect(inventory.items.every(item => item.bodyStatus === 'intact')).toBe(true);
    expect(readQuoteAssessments(`${fixed()}\n${q}`, 'f', [])).toHaveLength(1);
    expect(readDifferenceAssessments(body, 'f', [])).toHaveLength(1);
    expect(inventory.reason).toContain('固定点検記録1件');
  });
  it.each(['future', 'broken', 'nested', 'wrong-end', 'unclosed', 'missing-end', 'orphan'])('does not recover ambiguous %s envelope at a later end', mode => {
    let record = fixed();
    if (mode === 'future') record = record.replace(AUDIT_RECORD_START, 'calculator-memo-audit-record-start-v2');
    if (mode === 'broken') record = record.replace('"version":1', '"version":');
    if (mode === 'nested') record = record.replace(q, fixed('nested'));
    if (mode === 'wrong-end') record = record.replace('"version":1,"recordId":"audit-1"}', '"version":1,"recordId":"other"}');
    if (mode === 'unclosed') record = record.slice(0, -3);
    if (mode === 'missing-end') record = record.slice(0, record.indexOf('```' + AUDIT_RECORD_END));
    if (mode === 'orphan') record = record.slice(record.indexOf('```' + AUDIT_RECORD_END));
    const body = `${q}\n\n${record}\n\n${d}`;
    const ranges = scanAuditRecordEnvelopes(body);
    expect(ranges.at(-1)).toMatchObject({ end: body.length, closed: false, status: 'invalid' });
    expect(parseReportAudit(body, 'f')).toMatchObject({ complete: false });
    expect(parseReportAudit(body, 'f').items.map(item => item.kind)).toEqual(['quote']);
    expect(() => insertQuoteAtCursor(body, 'new', body.replace(/\r\n?/g, '\n').length)).toThrow();
  });
  it('flags duplicate record IDs without hiding real outside references', () => {
    const body = `${fixed()}\n\n${q}\n\n${fixed()}\n\n${d}`;
    expect(scanAuditRecordEnvelopes(body).every(range => range.status === 'invalid' && !range.metadata)).toBe(true);
    expect(parseReportAudit(body, 'f').complete).toBe(false);
    expect(parseReportAudit(body, 'f').items.map(item => item.kind)).toEqual(['quote', 'difference']);
  });
  it('does not interpret reserved markers nested in ordinary fenced code', () => {
    const body = `\`\`\`\`text\n${fixed()}\n\`\`\`\`\n\n${q}`;
    expect(scanAuditRecordEnvelopes(body)).toEqual([]);
    expect(parseReportAudit(body, 'f').items).toHaveLength(1);
  });
  it('protects readable interior and metadata gaps for both quote and diff insertion', () => {
    const body = fixed('historical text'); const position = body.indexOf('historical') + 3;
    expect(() => insertQuoteAtCursor(body, 'new', position)).toThrow();
    expect(() => insertDifferenceAtCursor(body, 'new', 'f', position)).toThrow();
    expect(insertDifferenceAtCursor(body, 'new', 'f', 0).body.endsWith(body)).toBe(true);
    expect(insertDifferenceAtCursor(body, 'new', 'f', body.length).body.startsWith(body)).toBe(true);
  });
  it('preserves CRLF outside a selected non-destructive insertion', () => {
    const body = 'one\r\ntwo\r\nthree';
    const inserted = insertDifferenceAtCursor(body, fixed('snapshot'), 'f', 4, 7);
    expect(inserted.body).toBe(`one\r\n\n\n${fixed('snapshot')}\n\ntwo\r\nthree`);
  });
  it.each([{ bodySha256: 'bad' }, { bodyLength: -1 }, { bodyLength: 100001 }, { generatedAt: '2026-10-25' }, { reportId: '' }, { recordId: 'x'.repeat(121) }])('rejects invalid metadata %j', change => {
    expect(() => createAuditRecordMarkdown('result', { ...info, ...change })).toThrow();
  });
  it('rejects unclosed or recursive user supplied payload instead of constructing apparent valid record', () => {
    expect(() => fixed('```text\nunclosed')).toThrow();
    expect(() => fixed(fixed('nested'))).toThrow();
  });
  it('preserves an invalid outer difference row when a historical record is nested inside it', () => {
    const end = d.indexOf('\n```', d.indexOf('\n')) + 4;
    const body = d.slice(0, end) + '\n\n' + fixed('history') + '\n\n' + d.slice(end);
    const inventory = parseReportAudit(body, 'f');
    expect(inventory.complete).toBe(false);
    expect(inventory.items).toHaveLength(1);
    expect(inventory.items[0]).toMatchObject({ kind: 'difference', bodyStatus: 'invalid', canNavigate: false });
    expect(inventory.items[0].difference?.snapshot).toBeUndefined();
  });
  it('marks a quote split across a historical record incomplete and never bridges it into a valid quote', () => {
    const split = q.indexOf('```calculator-memo-evidence');
    const body = q.slice(0, split) + fixed('history') + '\n\n' + q.slice(split);
    const inventory = parseReportAudit(body, 'f');
    expect(inventory.complete).toBe(false);
    expect(inventory.items).toHaveLength(1);
    expect(inventory.items[0]).toMatchObject({ kind: 'quote', bodyStatus: 'invalid', canNavigate: false });
  });
  it('retains malicious reserved-fence titles and IDs as inert builder strings', () => {
    const malicious = `${fixed('fake nested')}\n<script>alert(1)</script>\n|table|\n\`\`\``;
    const inventory = parseReportAudit(q, 'f');
    const output = buildAuditMarkdown({ body: q, formulaId: 'f', formulaTitle: malicious, reportTitle: malicious, reportId: malicious, editing: false, inventory, items: inventory.items, state: 'unverified', exportedAt: at });
    const record = fixed(output.markdown);
    expect(scanAuditRecordEnvelopes(record)).toHaveLength(1);
    expect(scanAuditRecordEnvelopes(record)[0].status).toBe('complete');
    expect(parseReportAudit(`${record}\n\n${q}`, 'f').items).toHaveLength(1);
    expect(record).toContain(malicious);
  });
  it('supports mixed line endings without offset drift or source modification', () => {
    const record = fixed('snapshot').replace(/\n/g, '\r\n');
    const body = `before\r\n${record}\n\n${q}`;
    const parsed = parseReportAudit(body, 'f');
    expect(parsed.complete).toBe(true);
    expect(parsed.items[0].start).toBe(body.indexOf(q));
    expect(body.slice(parsed.items[0].start, parsed.items[0].end)).toBe(q);
  });
  it('rejects oversized output without truncation', () => { expect(() => fixed('x'.repeat(100_000))).toThrow('100,000'); });
  it('keeps an empty audit record historical, not evidence or mathematical confirmation', () => {
    expect(parseReportAudit(fixed('0件は点検完了を意味しない'), 'f').items).toEqual([]);
    expect(scanAuditRecordEnvelopes(fixed('record'))[0].reason).toContain('数学的正しさは保証しません');
  });
});
