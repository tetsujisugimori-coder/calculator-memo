import { describe, expect, it } from 'vitest';
import { inspectComparisonMaterials, validSourceRange } from '../lib/formula-report-audit-comparison-navigation';
import { AUDIT_COMPARISON_RECORD_START as START, AUDIT_COMPARISON_RECORD_END as END, createAuditComparisonRecordMarkdown } from '../lib/formula-report-audit-comparison-record';
import { AUDIT_RECORD_START, AUDIT_RECORD_END, createAuditRecordMarkdown, scanAuditRecordEnvelopes } from '../lib/formula-report-audit-record';
import { reportCode } from '../lib/markdown-report';
const info = { materialId: 'M', formulaId: 'f', reportId: 'r', beforeRecordId: 'A', afterRecordId: 'B', preparedAt: '2026-10-27T10:00:00+09:00' };
const auditInfo = { recordId: 'A', formulaId: 'f', reportId: 'r', generatedAt: info.preparedAt, bodySha256: 'a'.repeat(64), bodyLength: 0 };
const audit = (id = 'A', reportId = 'r') => createAuditRecordMarkdown('過去の点検 😀', { ...auditInfo, recordId: id, reportId });
const material = (text = '比較不能という文字列だけでは状態を推定しない', materialId = 'M') => createAuditComparisonRecordMarkdown(text, { ...info, materialId });
const marker = (value: unknown, language: string) => reportCode(JSON.stringify(value), language);
const start = () => marker({ version: 1, ...info }, START);
const end = (id = 'M') => marker({ version: 1, materialId: id }, END);
const inspect = (body: string) => inspectComparisonMaterials(body, 'f', 'r');

describe('read-only comparison material inventory and source resolver', () => {
  it.each(['\n', '\r\n', '\r'])('keeps exact bytes and raw source ranges %j', nl => {
    const body = [audit(), material(), audit('B')].join('\n\n').replace(/\n/g, nl);
    const result = inspect(body);
    expect(result.complete).toBe(true);
    expect(result.entries).toHaveLength(1);
    const entry = result.entries[0];
    expect(entry.status).toBe('complete');
    expect(entry.metadata).toEqual(info);
    expect(entry.markdown).toBe(material().replace(/\n/g, nl));
    for (const source of [entry.before, entry.after]) {
      expect(source.status).toBe('available');
      expect(body.slice(source.start!, source.end!)).toBe(audit(source.recordId).replace(/\n/g, nl));
      expect(validSourceRange(body, source.start!, source.end!)).toBe(true);
    }
    expect(entry.before.metadata?.comparison).toBeUndefined(); // v1 is a source, not a comparison snapshot.
    expect(entry.metadata).not.toHaveProperty('state');
    expect(entry.metadata).not.toHaveProperty('reason');
  });
  it('does not count internal B, while allowing real B after normal material', () => {
    const body = [audit(), material(audit('B')), audit('B')].join('\n\n');
    const entry = inspect(body).entries[0];
    expect(entry.after.status).toBe('available');
    expect(entry.after.start).toBe(body.lastIndexOf(audit('B')));
    expect(scanAuditRecordEnvelopes(body)).toHaveLength(2);
  });
  it('missing sources do not prevent fixed material reading', () => {
    const entry = inspect(material(audit('B'))).entries[0];
    expect(entry.markdown).toContain('過去の点検');
    expect(entry.status).toBe('complete');
    expect(entry.before.status).toBe('missing');
    expect(entry.after.status).toBe('missing');
  });
  it.each(['other', undefined])('requires current report identity %s', reportId => {
    const entry = inspectComparisonMaterials([audit(), material(), audit('B')].join('\n\n'), 'f', reportId).entries[0];
    expect(entry.before.status).toBe('unidentified');
    expect(entry.before.start).toBeUndefined();
  });
  it('does not navigate foreign formula or source report identity', () => {
    const body = [audit('A', 'other'), material()].join('\n\n');
    expect(inspect(body).entries[0].before.status).toBe('unidentified');
    expect(inspectComparisonMaterials(body, 'other', 'r').entries[0].before.status).toBe('unidentified');
  });
  it('reports duplicate source envelopes as ambiguous without range authority', () => {
    const entry = inspect([audit(), audit(), material()].join('\n\n')).entries[0];
    expect(entry.before.status).toBe('ambiguous');
    expect(entry.before.metadata).toBeUndefined();
    expect(entry.before.start).toBeUndefined();
  });
  it('reports duplicate material IDs without restoring erased metadata', () => {
    const result = inspect([material(), audit(), material()].join('\n\n'));
    expect(result.complete).toBe(false);
    expect(result.entries.map(e => e.status)).toEqual(['duplicate', 'duplicate']);
    expect(result.entries.every(e => !e.metadata && e.before.status === 'unidentified')).toBe(true);
  });
  it.each(['\n', '\r\n', '\r'])('never releases internal B after repeated same-ID ends %j', nl => {
    const body = [audit(), start(), end(), audit('B'), end()].join('\n\n').replace(/\n/g, nl);
    const result = inspect(body);
    expect(result.complete).toBe(false);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({ status: 'ambiguous', end: body.length });
    expect(result.entries[0].before.status).toBe('unidentified');
    expect(scanAuditRecordEnvelopes(body).map(e => e.metadata?.recordId)).toEqual(['A']);
  });
  it.each([
    ['unknown', marker({ version: 99, ...info }, START.replace('v1', 'v99'))],
    ['unknown', marker({ ...info, version: 99 }, START)],
    ['malformed', reportCode('{broken', START)],
    ['incomplete', start()],
    ['incomplete', [start(), end('fake'), end()].join('\n\n')],
  ])('classifies %s using marker facts only', (status, body) => {
    expect(inspect(body).entries[0].status).toBe(status);
    expect(inspect(body).complete).toBe(false);
    expect(inspect(body).entries[0].metadata).toBeUndefined();
  });
  it('does not promote a nested material in an older audit record', () => {
    const body = [marker({ version: 1, ...auditInfo }, AUDIT_RECORD_START), material(), marker({ version: 1, recordId: 'A' }, AUDIT_RECORD_END)].join('\n\n');
    expect(inspect(body)).toMatchObject({ entries: [], complete: false });
  });
  it('refuses record start inside M with end outside M', () => {
    const body = [start(), marker({ version: 1, ...auditInfo }, AUDIT_RECORD_START), end(), marker({ version: 1, recordId: 'A' }, AUDIT_RECORD_END)].join('\n\n');
    const result = inspect(body);
    expect(result.complete).toBe(false);
    expect(result.entries[0].status).toBe('ambiguous');
    expect(result.entries[0].metadata).toBeUndefined();
  });
  it('excludes M when a record begins before M and ends inside M', () => {
    const body = [marker({ version: 1, ...auditInfo }, AUDIT_RECORD_START), start(), marker({ version: 1, recordId: 'A' }, AUDIT_RECORD_END), end()].join('\n\n');
    expect(inspect(body)).toMatchObject({ entries: [], complete: false });
  });
  it('refuses same-ID strict starts swallowed by a later poisoned record range', () => {
    const body = [audit(), material(), reportCode('{broken', AUDIT_RECORD_START), audit()].join('\n\n');
    expect(inspect(body).entries[0].before.status).toBe('ambiguous');
  });
  it('keeps incomplete record-looking content inside an otherwise normal material inert', () => {
    const body = material(marker({ version: 1, ...auditInfo }, AUDIT_RECORD_START));
    expect(inspect(body).entries[0].status).toBe('complete');
    expect(inspect(body).entries[0].before.status).toBe('missing');
  });
  it('does not promote markers inside an ordinary code fence', () => {
    expect(inspect(reportCode(material())).entries).toEqual([]);
  });
  it.each([
    ['unknown', marker({ version: 99, recordId: 'A' }, AUDIT_RECORD_START.replace('v1', 'v99'))],
    ['invalid', marker({ version: 1, recordId: 'A' }, AUDIT_RECORD_START)],
    ['unknown', reportCode('{bad', AUDIT_RECORD_START)],
  ])('diagnoses unusable source as %s, not missing or available', (status, damaged) => {
    const entry = inspect([material(), damaged].join('\n\n')).entries[0];
    expect(entry.before.status).toBe(status);
    expect(entry.before.start).toBeUndefined();
    expect(entry.before.metadata).toBeUndefined();
  });
  it('preserves unrelated earlier independent material when later nested material is excluded', () => {
    const nested = [marker({ version: 1, ...auditInfo }, AUDIT_RECORD_START), material('nested', 'N'), marker({ version: 1, recordId: 'A' }, AUDIT_RECORD_END)].join('\n\n');
    const result = inspect([material(), nested].join('\n\n'));
    expect(result.entries.map(e => e.metadata?.materialId)).toEqual(['M']);
    expect(result.complete).toBe(false);
  });
  it('does not mutate input metadata or output bytes across repeated inspections', () => {
    const before = JSON.stringify(info);
    const body = [audit(), material('日本語\r\n😀\r長文' + 'x'.repeat(1000)), audit('B')].join('\n\n');
    expect(inspect(body)).toEqual(inspect(body));
    expect(JSON.stringify(info)).toBe(before);
    expect(inspect(body).entries[0].markdown).toBe(material('日本語\r\n😀\r長文' + 'x'.repeat(1000)));
  });
});

describe('original UTF-16 range validation', () => {
  it.each([[0, 7], [1, 3], [5, 7], [7, 7]])('accepts boundaries %j', (start, end) => {
    expect(validSourceRange('a😀\r\nbc', start, end)).toBe(true);
  });
  it.each([[2, 3], [0, 2], [4, 5], [0, 4], [-1, 1], [2, 1], [0, 8], [0.5, 1], [NaN, 1], [0, Infinity]])('rejects broken boundaries %j', (start, end) => {
    expect(validSourceRange('a😀\r\nbc', start, end)).toBe(false);
  });
  it.each(['\ud800x', 'x\udc00'])('rejects malformed UTF-16 body %j', body => {
    expect(validSourceRange(body, 0, body.length)).toBe(false);
  });
});
