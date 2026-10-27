import { describe, expect, it } from 'vitest';
import { captureAuditNavigationTarget as capture, resolveAuditNavigationTarget as resolve } from '../lib/formula-report-audit-roundtrip';
import { parseReportAudit } from '../lib/formula-report-audit';
import { inspectComparisonMaterials } from '../lib/formula-report-audit-comparison-navigation';
import { createAuditComparisonRecordMarkdown, AUDIT_COMPARISON_RECORD_END } from '../lib/formula-report-audit-comparison-record';
import { createAuditRecordMarkdown, scanAuditRecordEnvelopes, AUDIT_RECORD_START } from '../lib/formula-report-audit-record';
import { createQuoteMarkdown, type QuoteSnapshot } from '../lib/formula-report-quotes';
import { createTrackedDifferenceMarkdown, rebuildDifferenceMarkdown } from '../lib/formula-report-diff-tracking';
import type { DifferenceSnapshot } from '../lib/formula-report-snapshots';
import { reportCode } from '../lib/markdown-report';
const at = '2026-10-27T13:00:00.000Z';
const q: QuoteSnapshot = { version: 1, quoteId: 'q', formulaId: 'f', memoId: 'm', blockId: 'b', citedAt: at, record: { id: 'before', evaluator: 'calculator-memo-v1', status: 'confirmed', calculatedAt: at, persistedAt: at, blocks: [{ blockId: 'b', position: 1, expression: '1', result: '1', resultText: '1', status: 'success', inputs: [] }] } };
const quoted = (id = 'q') => createQuoteMarkdown({ ...q, quoteId: id });
const d: DifferenceSnapshot = { version: 1, differenceId: 'd', preparedAt: at, quote: q, after: { ...q.record, id: 'after' }, quoteBodyEdited: false };
const difference = createTrackedDifferenceMarkdown(rebuildDifferenceMarkdown(d), q, d.after, 'd', at);
const record = (id = 'A') => createAuditRecordMarkdown('固定された点検😀', { recordId: id, formulaId: 'f', reportId: 'r', generatedAt: at, bodySha256: 'a'.repeat(64), bodyLength: 10 });
const material = (text = '固定された比較😀') => createAuditComparisonRecordMarkdown(text, { materialId: 'M', formulaId: 'f', reportId: 'r', beforeRecordId: 'A', afterRecordId: 'B', preparedAt: at });
function target(body: string, kind: 'quote' | 'difference' | 'record' | 'material') {
  const range = kind === 'record' ? scanAuditRecordEnvelopes(body)[0] : kind === 'material' ? inspectComparisonMaterials(body, 'f', 'r').entries[0] : parseReportAudit(body, 'f').items.find(i => i.kind === kind)!;
  return capture(body, 'f', 'r', range.start, range.end)!;
}

describe('temporary read-only audit occurrence witness', () => {
  it.each(['\n', '\r\n', '\r'])('roundtrips all four structural target types using raw %j offsets', newline => {
    const body = [quoted(), difference, record(), material()].join('\n\n').replace(/\n/g, newline);
    for (const kind of ['quote', 'difference', 'record', 'material'] as const) {
      const t = target(body, kind); expect(t).not.toBeNull(); expect(t.kind).toBe(kind);
      expect(resolve(body, 'f', 'r', t)).toMatchObject({ status: 'available', start: t.start, end: t.end });
      const changed = `前書き😀${newline}${newline}${body}${newline}${newline}後書き`;
      const current = target(changed, kind);
      expect(resolve(changed, 'f', 'r', t)).toMatchObject({ status: 'available', start: current.start, end: current.end });
      expect(current.start).toBe(t.start + `前書き😀${newline}${newline}`.length);
    }
  });
  it('distinguishes separately identified occurrences with otherwise identical displayed contents', () => {
    const body = `${quoted('first')}\n\n${quoted('second')}`;
    const items = parseReportAudit(body, 'f').items;
    const a = capture(body, 'f', 'r', items[0].start, items[0].end)!;
    const b = capture(body, 'f', 'r', items[1].start, items[1].end)!;
    expect(a.identity).not.toBe(b.identity); expect(a.start).not.toBe(b.start);
    for (const t of [a, b]) expect(resolve(`先頭\n\n${body}`, 'f', 'r', t)).toMatchObject({ status: 'available', start: t.start + 4, end: t.end + 4 });
  });
  it.each(['quote', 'difference', 'record', 'material'] as const)('refuses deleted, changed or duplicate %s without guessing', kind => {
    const body = ({ quote: quoted(), difference, record: record(), material: material() })[kind];
    const t = target(body, kind); expect(t).not.toBeNull();
    expect(resolve('削除済み', 'f', 'r', t).status).toBe('unavailable');
    const changed = body.slice(0, t.start) + body.slice(t.start, t.end).replace(/固定された|当時の式|観測された変更/, '改変された') + body.slice(t.end);
    expect(changed).not.toBe(body); expect(resolve(changed, 'f', 'r', t).status).toBe('unavailable');
    expect(resolve(`${body}\n\n${body}`, 'f', 'r', t).status).toBe('unavailable');
  });
  it.each(['quote', 'difference', 'record', 'material'] as const)('does not capture duplicate %s even at an exact old range', kind => {
    const body = ({ quote: quoted(), difference, record: record(), material: material() })[kind];
    const t = target(body, kind); expect(capture(`${body}\n\n${body}`, 'f', 'r', t.start, t.end)).toBeNull();
  });
  it('rejects foreign report/formula, zero and partial ranges', () => {
    const body = material(), t = target(body, 'material');
    expect(resolve(body, 'other', 'r', t).status).toBe('unavailable'); expect(resolve(body, 'f', 'other', t).status).toBe('unavailable');
    expect(capture(body, 'f', 'other', 0, body.length)).toBeNull(); expect(capture(body, 'f', 'r', 1, body.length)).toBeNull(); expect(capture(body, 'f', 'r', 0, 0)).toBeNull();
  });
  it('does not use material-internal records, quotes or differences as candidates', () => {
    const body = material(`${record()}\n\n${quoted()}\n\n${difference}`);
    for (const text of [record(), quoted(), difference]) { const start = body.indexOf(text); expect(start).toBeGreaterThan(0); expect(capture(body, 'f', 'r', start, start + text.length)).toBeNull(); }
    expect(target(body, 'material')).not.toBeNull();
  });
  it.each(['\n', '\r\n', '\r'])('rejects same-ID early material terminator with real end retained (%j)', newline => {
    const normal = material(), t = target(normal, 'material');
    const end = reportCode(JSON.stringify({ version: 1, materialId: 'M' }), AUDIT_COMPARISON_RECORD_END);
    const broken = normal.replace('固定された比較😀', `${end}\n\n${record('B')}`).replace(/\n/g, newline);
    expect(resolve(broken, 'f', 'r', t).status).toBe('unavailable');
    const index = broken.indexOf(record('B').replace(/\n/g, newline));
    expect(capture(broken, 'f', 'r', index, index + record('B').replace(/\n/g, newline).length)).toBeNull();
  });
  it('diagnostic-only duplicate start within poisoned region cannot restore an apparently complete record', () => {
    const body = record(), t = target(body, 'record');
    const changed = `${body}\n\n${reportCode('{broken', AUDIT_RECORD_START)}\n\n${body}`;
    expect(resolve(changed, 'f', 'r', t).status).toBe('unavailable');
  });
  it.each(['future', 'broken', 'unclosed', 'code-fence'])('rejects %s target while preserving unrelated valid earlier target', mode => {
    const original = material(), t = target(original, 'material');
    const broken = mode === 'future' ? original.replace('start-v1', 'start-v99') : mode === 'broken' ? original.replace('"version":1', '"version":') : mode === 'unclosed' ? original.slice(0, -3) : reportCode(original);
    expect(resolve(broken, 'f', 'r', t).status).toBe('unavailable');
    const r = record(), rt = target(r, 'record'); expect(resolve(`${r}\n\n${broken}`, 'f', 'r', rt).status).toBe('available');
  });
  it.each(['\ud800', '\udc00'])('refuses malformed UTF-16 body %j', char => {
    const body = material(), t = target(body, 'material'); expect(resolve(`${char}${body}`, 'f', 'r', t).status).toBe('unavailable');
    expect(capture(`${char}${body}`, 'f', 'r', 1, body.length + 1)).toBeNull();
  });
  it('does not mutate the token or fixed body and never uses arbitrary text as a candidate', () => {
    const body = material(), t = Object.freeze(target(body, 'material')), before = JSON.stringify(t);
    for (let i = 0; i < 3; i++) expect(resolve(body, 'f', 'r', t).status).toBe('available');
    expect(JSON.stringify(t)).toBe(before); expect(capture('似ている文章😀', 'f', 'r', 0, 8)).toBeNull();
  });
});
