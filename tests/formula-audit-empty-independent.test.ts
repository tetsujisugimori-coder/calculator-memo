import { describe, expect, it } from 'vitest';
import { compareAuditRecords, type AuditComparableRecord, type AuditComparisonSnapshot } from '../lib/formula-report-audit-comparison';

const statuses = ['ok', 'unavailable', 'invalid', undefined] as const;
const empty = (recordId: string, acquisitionStatus: AuditComparisonSnapshot['acquisitionStatus']): AuditComparableRecord => ({
  recordId, formulaId: 'formula', reportId: 'report',
  snapshot: { version: 1, state: 'checked', complete: true, reason: 'independent fixture', acquisitionStatus, items: [] },
});
function freezeDeep(value: unknown): void {
  if (!value || typeof value !== 'object') return;
  Object.values(value).forEach(freezeDeep);
  Object.freeze(value);
}

describe('independent empty comparison acquisition matrix', () => {
  it.each(statuses.flatMap(a => statuses.map(b => [a, b] as const)))('%s / %s never certifies empty evidence', (aStatus, bStatus) => {
    const a = empty('A', aStatus), b = empty('B', bStatus);
    const original = JSON.stringify([a, b]); freezeDeep(a); freezeDeep(b);
    const result = compareAuditRecords(a, b);
    expect(result.rows).toEqual([]);
    expect(result.states).toContain('incomparable');
    expect(result.states).not.toContain('matched');
    expect(result.states.includes('unavailable')).toBe([aStatus, bStatus].includes('unavailable'));
    expect(result.states.includes('unknown')).toBe([aStatus, bStatus].some(s => s === 'invalid' || s === undefined));
    expect(result.states.includes('changed')).toBe(aStatus !== bStatus);
    expect(result.limitations).toContain('両記録に比較可能な根拠項目がありません。取得成功は根拠の一致を意味しません。');
    expect(JSON.stringify([a, b])).toBe(original);
    const reversed = compareAuditRecords(b, a);
    expect([...reversed.states].sort()).toEqual([...result.states].sort());
  });
  it('does not hide independent metadata and incomplete-inventory constraints behind empty state', () => {
    const a = empty('A', 'ok'), b = empty('B', 'ok');
    a.snapshot!.bodyContext = { editing: false, unsavedChanges: false, savedContextChanged: false };
    b.snapshot!.bodyContext = { editing: true, unsavedChanges: true, savedContextChanged: true };
    b.snapshot!.complete = false;
    const result = compareAuditRecords(a, b);
    expect(result.states).toContain('incomparable'); expect(result.states).toContain('changed');
    expect(result.states).not.toContain('matched'); expect(result.rows).toEqual([]);
    expect(result.limitations.some(text => text.includes('集計が不完全'))).toBe(true);
    expect(result.changes.length).toBeGreaterThan(0);
  });
});
