import { describe, expect, it } from 'vitest';
import { AUDIT_COMPARISON_RECORD_END as END, AUDIT_COMPARISON_RECORD_START as START, createAuditComparisonRecordMarkdown, scanAuditComparisonRecordEnvelopes, type AuditComparisonRecordMetadata } from '../lib/formula-report-audit-comparison-record';
import { createAuditRecordMarkdown, scanAuditRecordEnvelopes } from '../lib/formula-report-audit-record';
import { parseReportAudit } from '../lib/formula-report-audit';
import { createQuoteMarkdown, insertQuoteAtCursor, readQuoteAssessments, type QuoteSnapshot } from '../lib/formula-report-quotes';
import { insertDifferenceAtCursor } from '../lib/formula-report-diff';
import { createTrackedDifferenceMarkdown, readDifferenceAssessments, rebuildDifferenceMarkdown } from '../lib/formula-report-diff-tracking';
import { reportCode } from '../lib/markdown-report';
import type { DifferenceSnapshot } from '../lib/formula-report-snapshots';
const at = '2026-10-26T01:00:00.000Z';
const info: AuditComparisonRecordMetadata = { materialId: 'material-1', formulaId: 'f', reportId: 'r', beforeRecordId: 'audit-a', afterRecordId: 'audit-b', preparedAt: '2026-10-26T10:00:00+09:00' };
const auditInfo = { recordId: 'audit-a', formulaId: 'f', reportId: 'r', generatedAt: at, bodySha256: 'a'.repeat(64), bodyLength: 0 };
const snapshot = { version: 1 as const, state: 'checked' as const, acquisitionStatus: 'ok' as const, fetchedAt: '2026-10-26T01:00:00.000Z', complete: true, reason: '記録された範囲', items: [] };
const audit = createAuditRecordMarkdown('past checked result', { ...auditInfo, comparison: snapshot });
const quote: QuoteSnapshot = { version: 1, quoteId: 'q', formulaId: 'f', memoId: 'm', blockId: 'b', citedAt: at, record: { id: 'before', evaluator: 'calculator-memo-v1', status: 'confirmed', calculatedAt: at, persistedAt: at, blocks: [{ blockId: 'b', position: 1, expression: '1', result: '1', resultText: '1', status: 'success', inputs: [] }] } };
const q = createQuoteMarkdown(quote);
const difference: DifferenceSnapshot = { version: 1, differenceId: 'd', preparedAt: at, quote, after: { ...quote.record, id: 'after' }, quoteBodyEdited: false };
const d = createTrackedDifferenceMarkdown(rebuildDifferenceMarkdown(difference), quote, difference.after, 'd', at);
const fixed = (text = '比較不能：両側0件。取得成功は根拠一致ではない。', metadata = info) => createAuditComparisonRecordMarkdown(text, metadata);
const marker = (value: unknown, language: string) => reportCode(JSON.stringify(value), language);

describe('fixed A/B comparison explanatory material, not another audit', () => {
  it.each(['\n', '\r\n', '\r'])('preserves outer real quote, difference and audit candidates before duplicate detection %j', newline => {
    const inner = fixed(`${q}\n\n${d}\n\n${audit}`);
    const body = `${q}\n\n${inner}\n\n${d}\n\n${audit}`.replace(/\n/g, newline);
    const inventory = parseReportAudit(body, 'f');
    expect(inventory.complete).toBe(true);
    expect(inventory.items.map(row => [row.kind, row.bodyStatus])).toEqual([['quote', 'intact'], ['difference', 'intact']]);
    expect(inventory.reason).toContain('固定比較資料1件');
    expect(readQuoteAssessments(body, 'f', [])).toHaveLength(1);
    expect(readDifferenceAssessments(body, 'f', [])).toHaveLength(1);
    expect(scanAuditRecordEnvelopes(body)).toHaveLength(1);
    expect(scanAuditRecordEnvelopes(body)[0].metadata?.recordId).toBe('audit-a');
    expect(scanAuditRecordEnvelopes(body)[0].status).toBe('complete');
  });
  it('stores exact output including CRLF, Unicode, long values and hostile inert text without extra snapshots', () => {
    const text = `# old output\r\n出力日時：2026-10-25T00:00:00Z\n\n${reportCode(`${fixed()}\n${audit}\n\`\`\`\n|表|\n<script>⚗️</script>\n日本語　ID${'x'.repeat(1500)}`)}`;
    const original = structuredClone(info);
    const result = fixed(text);
    expect(result).toBe(`${marker({ version: 1, ...info }, START)}\n\n${text}\n\n${marker({ version: 1, materialId: info.materialId }, END)}`);
    expect(info).toEqual(original);
    expect(scanAuditComparisonRecordEnvelopes(result)).toHaveLength(1);
    expect(scanAuditRecordEnvelopes(result)).toEqual([]);
    expect(parseReportAudit(result, 'f')).toMatchObject({ complete: true, items: [] });
    expect(Object.keys(scanAuditComparisonRecordEnvelopes(result)[0].metadata!)).toEqual(Object.keys(info));
  });
  it.each(['changed', 'matched', 'incomparable', 'unavailable', 'unknown'])('does not reinterpret %s output', state => {
    const text = `状態：${state}\n理由：記録どおり`; const result = fixed(text);
    expect(result).toContain(text); expect(parseReportAudit(result, 'f').items).toEqual([]);
  });
  it.each(['future', 'suffix', 'broken', 'extra', 'wrong-id', 'wrong-version', 'missing-end', 'orphan-end', 'unclosed-end', 'nested', 'fake-end'])('keeps %s poisoned to EOF even after a later plausible end', mode => {
    let material = fixed('readable interior');
    if (mode === 'future') material = material.replace(START, 'calculator-memo-audit-comparison-record-start-v2');
    if (mode === 'suffix') material = material.replace(START, START + '-future');
    if (mode === 'broken') material = material.replace('"version":1', '"version":');
    if (mode === 'extra') material = material.replace('"version":1', '"extra":true,"version":1');
    if (mode === 'wrong-id') material = material.replace('"version":1,"materialId":"material-1"}', '"version":1,"materialId":"other"}');
    if (mode === 'wrong-version') material = material.replace(END, END.replace('v1', 'v2'));
    if (mode === 'missing-end') material = material.slice(0, material.indexOf('```' + END));
    if (mode === 'orphan-end') material = material.slice(material.indexOf('```' + END));
    if (mode === 'unclosed-end') material = material.slice(0, -3);
    if (mode === 'nested') material = material.replace('readable interior', fixed('nested', { ...info, materialId: 'inner' }));
    if (mode === 'fake-end') material = material.replace('readable interior', marker({ version: 1, materialId: 'fake' }, END));
    const body = `${q}\n\n${material}\n\n${audit}\n\n${d}`;
    expect(scanAuditComparisonRecordEnvelopes(body).at(-1)).toMatchObject({ end: body.length, closed: false, status: 'invalid' });
    expect(parseReportAudit(body, 'f')).toMatchObject({ complete: false });
    expect(parseReportAudit(body, 'f').items.map(row => row.kind)).toEqual(['quote']);
    expect(scanAuditRecordEnvelopes(body)).toEqual([]);
    expect(() => insertQuoteAtCursor(body, 'new', body.length)).toThrow();
  });
  it('invalidates duplicate material IDs while retaining external audit candidates and evidence', () => {
    const body = `${fixed(q)}\n\n${audit}\n\n${q}\n\n${fixed(d)}\n\n${d}`;
    expect(scanAuditComparisonRecordEnvelopes(body).map(range => [range.status, range.metadata])).toEqual([['invalid', undefined], ['invalid', undefined]]);
    expect(parseReportAudit(body, 'f').complete).toBe(false);
    expect(parseReportAudit(body, 'f').items.map(row => row.kind)).toEqual(['quote', 'difference']);
    expect(scanAuditRecordEnvelopes(body)[0].status).toBe('complete');
  });
  it('rejects structural recursive construction and unclosed code/math instead of repairing', () => {
    expect(() => fixed(fixed())).toThrow();
    expect(() => fixed('```text\nopen')).toThrow();
    expect(() => fixed('$$\nopen')).toThrow();
  });
  it('does not detect marker-looking plain paragraphs or nested ordinary code as envelopes', () => {
    const body = `paragraph ${START}\n\n${reportCode(fixed())}\n\n${q}`;
    expect(scanAuditComparisonRecordEnvelopes(body)).toEqual([]);
    expect(parseReportAudit(body, 'f')).toMatchObject({ complete: true });
    expect(parseReportAudit(body, 'f').items).toHaveLength(1);
  });
  it.each(['quote', 'difference'])('protects full readable interior for %s insertion and allows exact boundaries', kind => {
    const body = fixed('readable historical text');
    const insert = (position: number) => kind === 'quote' ? insertQuoteAtCursor(body, 'NEW', position) : insertDifferenceAtCursor(body, 'NEW', 'f', position);
    expect(() => insert(body.indexOf('historical') + 1)).toThrow();
    expect(() => insert(body.indexOf('\n\n') + 1)).toThrow();
    expect(insert(0).body.endsWith(body)).toBe(true);
    expect(insert(body.length).body.startsWith(body)).toBe(true);
  });
  it.each(['\n', '\r\n', '\r'])('inserts before a selected range without deleting or normalizing surrounding text %j', newline => {
    const body = `head${newline}選択🧮${newline}tail`; const material = fixed();
    const result = insertDifferenceAtCursor(body, material, 'f', 5, 9);
    expect(result.body).toBe(`head${newline}\n\n${material}\n\n選択🧮${newline}tail`);
  });
  it('preserves invalid outer difference rather than erasing it when it encloses material', () => {
    const end = d.indexOf('\n```', d.indexOf('\n')) + 4;
    const body = d.slice(0, end) + '\n\n' + fixed() + '\n\n' + d.slice(end);
    expect(scanAuditComparisonRecordEnvelopes(body)[0].status).toBe('invalid');
    const inventory = parseReportAudit(body, 'f');
    expect(inventory.complete).toBe(false);
    expect(inventory.items).toHaveLength(1);
    expect(inventory.items[0]).toMatchObject({ kind: 'difference', bodyStatus: 'invalid', canNavigate: false });
    expect(inventory.items[0].difference?.snapshot).toBeUndefined();
  });
  it('does not treat a split quote across material as matched or complete', () => {
    const split = q.indexOf('```calculator-memo-evidence');
    const body = q.slice(0, split) + fixed() + '\n\n' + q.slice(split);
    const inventory = parseReportAudit(body, 'f');
    expect(inventory.complete).toBe(false);
    expect(inventory.items).toHaveLength(1);
    expect(inventory.items[0]).toMatchObject({ bodyStatus: 'invalid', canNavigate: false });
  });
  it('marks an enclosing historical audit invalid and ineligible, not another matching record', () => {
    const body = audit.replace('past checked result', fixed());
    expect(scanAuditRecordEnvelopes(body)).toHaveLength(1);
    expect(scanAuditRecordEnvelopes(body)[0]).toMatchObject({ status: 'invalid' });
    expect(scanAuditRecordEnvelopes(body)[0].metadata).toBeUndefined();
    expect(parseReportAudit(body, 'f')).toMatchObject({ complete: false, items: [] });
    expect(() => createAuditRecordMarkdown(fixed(), auditInfo)).toThrow();
  });
  it.each(['materialId', 'formulaId', 'reportId', 'beforeRecordId', 'afterRecordId'])('rejects missing, long or ill-formed %s without mutation', key => {
    for (const value of ['', 'x'.repeat(121), '\ud800']) {
      const data = { ...info, [key]: value }; const original = structuredClone(data);
      expect(() => fixed('text', data)).toThrow(); expect(data).toEqual(original);
    }
  });
  it.each(['2026-10-26', 'not a date', '2026-10-26T10:00:00'])('rejects missing timezone or invalid preparation time %s', preparedAt => {
    expect(() => fixed('text', { ...info, preparedAt })).toThrow();
  });
  it('rejects the same record twice and unknown metadata keys', () => {
    expect(() => fixed('text', { ...info, afterRecordId: info.beforeRecordId })).toThrow();
    expect(() => fixed('text', { ...info, unknown: true } as AuditComparisonRecordMetadata)).toThrow();
  });
  it('rejects malformed UTF-16 without replacing it; retains valid surrogate pairs', () => {
    expect(() => fixed('a\ud800b')).toThrow('文字情報');
    expect(() => fixed('a\udc00b')).toThrow('文字情報');
    expect(fixed('🧮漢字e\u0301')).toContain('🧮漢字e\u0301');
  });
  it('distinguishes output capacity from insertion capacity and never returns partial bytes', () => {
    const overhead = fixed('').length;
    const exact = fixed('x'.repeat(100_000 - overhead));
    expect(exact.length).toBe(100_000);
    expect(() => fixed('x'.repeat(100_001 - overhead))).toThrow('100,000');
    // The insertion itself adds spacing, so even an exactly-full material is refused.
    expect(() => insertDifferenceAtCursor('', exact, 'f', 0)).toThrow('100,000');
  });
});
