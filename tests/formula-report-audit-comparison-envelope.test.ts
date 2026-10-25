import { describe, expect, it } from 'vitest';
import { createAuditRecordMarkdown, scanAuditRecordEnvelopes, AUDIT_RECORD_START_V2 } from '../lib/formula-report-audit-record';
import { parseReportAudit } from '../lib/formula-report-audit';
import type { AuditComparisonSnapshot } from '../lib/formula-report-audit-comparison';
const base = { recordId: 'a', formulaId: 'f', reportId: 'r', generatedAt: '2026-10-25T00:00:00Z', bodySha256: 'a'.repeat(64), bodyLength: 0 };
const comparison: AuditComparisonSnapshot = { version: 1, state: 'unverified', complete: true, reason: '認識した0件', items: [] };
describe('fixed audit comparison envelope compatibility', () => {
  it('preserves legacy v1 bytes and lists as missing structured comparison', () => {
    const old = createAuditRecordMarkdown('old', base);
    expect(old).toContain('calculator-memo-audit-record-start-v1');
    expect(scanAuditRecordEnvelopes(old)[0].metadata?.comparison).toBeUndefined();
    const modern = createAuditRecordMarkdown('new', { ...base, recordId: 'b', comparison });
    expect(modern).toContain(AUDIT_RECORD_START_V2);
    const body = old + '\n\n' + modern;
    const parsed = scanAuditRecordEnvelopes(body);
    expect(parsed).toHaveLength(2);
    expect(body.slice(parsed[0].start, parsed[0].end)).toBe(old);
    expect(parsed[1].metadata?.comparison).toEqual(comparison);
    expect(parseReportAudit(body, 'f').items).toEqual([]);
    expect(parseReportAudit(body, 'f').complete).toBe(true);
  });
  it.each(['\n', '\r\n', '\r'])('keeps exact offsets and no recursive counts with %j', newline => {
    const body = 'head' + newline + createAuditRecordMarkdown('historical', { ...base, comparison }).replace(/\n/g, newline) + newline + 'tail';
    const range = scanAuditRecordEnvelopes(body)[0];
    expect(range.status).toBe('complete');
    expect(body.slice(range.start, range.end)).toContain(AUDIT_RECORD_START_V2);
    expect(parseReportAudit(body, 'f').items).toEqual([]);
  });
  it.each(['unknown', 'mismatch', 'extra', 'missing', 'unclosed', 'duplicate'])('never upgrades %s data', mode => {
    let body = createAuditRecordMarkdown('result', { ...base, comparison });
    if (mode === 'unknown') body = body.replaceAll('-v2', '-v3');
    if (mode === 'mismatch') body = body.replace('-end-v2', '-end-v1');
    if (mode === 'extra') body = body.replace('"version":2', '"surprise":1,"version":2');
    if (mode === 'missing') body = body.replace('"items":[]', '"items":null');
    if (mode === 'unclosed') body = body.slice(0, -3);
    if (mode === 'duplicate') body += '\n\n' + body;
    expect(scanAuditRecordEnvelopes(body).every(record => record.status === 'invalid')).toBe(true);
    expect(parseReportAudit(body, 'f').complete).toBe(false);
  });
  it('cannot wrap invalid comparison data or silently exceed existing capacity', () => {
    expect(() => createAuditRecordMarkdown('x', { ...base, comparison: { ...comparison, version: 99 } as unknown as AuditComparisonSnapshot })).toThrow();
    expect(() => createAuditRecordMarkdown('x'.repeat(100_000), { ...base, comparison })).toThrow('100,000');
  });
});
