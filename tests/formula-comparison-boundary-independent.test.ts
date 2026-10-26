import { describe, expect, it } from 'vitest';
import { AUDIT_COMPARISON_RECORD_START as START, AUDIT_COMPARISON_RECORD_END as END, createAuditComparisonRecordMarkdown, scanAuditComparisonRecordEnvelopes as scan } from '../lib/formula-report-audit-comparison-record';
import { createAuditRecordMarkdown, scanAuditRecordEnvelopes } from '../lib/formula-report-audit-record';
import { parseReportAudit } from '../lib/formula-report-audit';
import { insertQuoteAtCursor } from '../lib/formula-report-quotes';
import { reportCode } from '../lib/markdown-report';

const at = '2026-10-26T00:00:00.000Z';
const info = { materialId: 'M', formulaId: 'f', reportId: 'r', beforeRecordId: 'A', afterRecordId: 'B', preparedAt: at };
const marker = (value: unknown, language: string) => reportCode(JSON.stringify(value), language);
const start = marker({ version: 1, ...info }, START);
const end = marker({ version: 1, materialId: 'M' }, END);
const audit = (recordId: string, version: 1 | 2 = 2) => createAuditRecordMarkdown('Historical ' + recordId, {
  recordId, formulaId: 'f', reportId: 'r', generatedAt: at, bodySha256: 'a'.repeat(64), bodyLength: 0,
  ...(version === 2 ? { comparison: { version: 1 as const, state: 'checked' as const, acquisitionStatus: 'ok' as const, fetchedAt: at, complete: true, reason: 'synthetic', items: [] } } : {}),
});
const outer = audit('A');
const internal = audit('B');
const validMaterial = (materialId = 'M') => createAuditComparisonRecordMarkdown('Historical comparison', { ...info, materialId });

describe.each(['\n', '\r\n', '\r'])('independent same-ID boundary review %j', newline => {
  const lines = (text: string) => text.replace(/\n/g, newline);
  it.each(['other-valid-material', 'unknown-start', 'broken-start'])('does not reset ambiguity at %s', kind => {
    const intervening = kind === 'other-valid-material' ? validMaterial('N')
      : kind === 'unknown-start' ? marker({ version: 2, ...info }, START.replace('v1', 'v2'))
        : reportCode('{"version":1,', START);
    const prefix = lines(outer + '\n\n');
    const body = prefix + lines([start, end, 'unprotected-looking gap', internal, intervening, end].join('\n\n'));
    expect.soft(scan(body)).toEqual([{ start: prefix.length, end: body.length, closed: false, status: 'invalid', reason: expect.any(String) }]);
    const candidates = scanAuditRecordEnvelopes(body);
    expect.soft(candidates.map(entry => [entry.status, entry.metadata?.recordId])).toEqual([['complete', 'A']]);
    expect.soft(body.slice(candidates[0].start, candidates[0].end)).toBe(lines(outer));
    expect.soft(parseReportAudit(body, 'f')).toMatchObject({ complete: false, items: [] });
    const position = body.slice(0, body.indexOf('unprotected-looking gap') + 1).replace(/\r\n?/g, '\n').length;
    expect.soft(() => insertQuoteAtCursor(body, 'NEW', position)).toThrow();
  });

  it('does not use equal global start/end totals as proof of unique pairing', () => {
    const prefix = lines(outer + '\n\n');
    const body = prefix + lines([start, end, internal, end, start, 'unclosed later material'].join('\n\n'));
    expect.soft(scan(body)).toEqual([{ start: prefix.length, end: body.length, closed: false, status: 'invalid', reason: expect.any(String) }]);
    expect.soft(scanAuditRecordEnvelopes(body).map(entry => entry.metadata?.recordId)).toEqual(['A']);
  });

  it('does not upgrade an earlier duplicate-ID material when the later occurrence becomes poisoned', () => {
    const first = lines(validMaterial());
    const prefix = lines([validMaterial(), outer, ''].join('\n\n'));
    const body = prefix + lines([start, end, internal, end].join('\n\n'));
    const ranges = scan(body);
    expect.soft(ranges).toEqual([
      { start: 0, end: first.length, closed: true, status: 'invalid', reason: expect.any(String) },
      { start: prefix.length, end: body.length, closed: false, status: 'invalid', reason: expect.any(String) },
    ]);
    const records = scanAuditRecordEnvelopes(body);
    expect.soft(records.map(entry => [entry.status, entry.metadata?.recordId])).toEqual([['complete', 'A']]);
    expect.soft(body.slice(records[0].start, records[0].end)).toBe(lines(outer));
    expect.soft(parseReportAudit(body, 'f')).toMatchObject({ complete: false, items: [] });
  });

  it('retains independent old v1/v2 records between and after individually closed duplicate-ID materials', () => {
    const old = audit('old-v1', 1), current = audit('later-v2');
    const body = lines([validMaterial(), old, validMaterial(), current].join('\n\n'));
    expect(scan(body).map(entry => [entry.status, entry.closed, entry.metadata])).toEqual([['invalid', true, undefined], ['invalid', true, undefined]]);
    const records = scanAuditRecordEnvelopes(body);
    expect(records.map(entry => [entry.status, entry.metadata?.recordId])).toEqual([['complete', 'old-v1'], ['complete', 'later-v2']]);
    expect(records.map(entry => body.slice(entry.start, entry.end))).toEqual([lines(old), lines(current)]);
    expect(records[0].metadata?.comparison).toBeUndefined();
    expect(records[1].metadata?.comparison?.acquisitionStatus).toBe('ok');
    expect(parseReportAudit(body, 'f')).toMatchObject({ complete: false, items: [] });
  });

  it('ignores exact marker text inside an ordinary fenced value and preserves following evidence candidates', () => {
    const material = createAuditComparisonRecordMarkdown(reportCode([start, end, internal, end].join('\n\n')), info);
    const body = lines([material, outer].join('\n\n'));
    expect(scan(body)).toHaveLength(1);
    expect(scan(body)[0]).toMatchObject({ status: 'complete', closed: true });
    expect(scanAuditRecordEnvelopes(body).map(entry => entry.metadata?.recordId)).toEqual(['A']);
    expect(parseReportAudit(body, 'f')).toMatchObject({ complete: true, items: [] });
  });
});
