// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { FormulaReportModal } from '../components/FormulaReportModal';
import { createAuditComparisonRecordMarkdown as material, scanAuditComparisonRecordEnvelopes as scan, AUDIT_COMPARISON_RECORD_START as START, AUDIT_COMPARISON_RECORD_END as END } from '../lib/formula-report-audit-comparison-record';
import { createAuditRecordMarkdown as audit, scanAuditRecordEnvelopes } from '../lib/formula-report-audit-record';
import { parseReportAudit } from '../lib/formula-report-audit';
import { reportCode } from '../lib/markdown-report';
import { insertDifferenceAtCursor } from '../lib/formula-report-diff';
const info = { materialId: 'review-material', formulaId: 'f', reportId: 'r', beforeRecordId: 'A', afterRecordId: 'B', preparedAt: '2026-10-26T19:00:00+09:00' };
const point = audit('historical report', { recordId: 'A', formulaId: 'f', reportId: 'r', generatedAt: info.preparedAt, bodySha256: 'a'.repeat(64), bodyLength: 0, comparison: { version: 1, state: 'checked', acquisitionStatus: 'ok', complete: true, reason: 'empty is not equality', items: [] } });
const start = reportCode(JSON.stringify({ version: 1, ...info }), START);
const end = reportCode(JSON.stringify({ version: 1, materialId: info.materialId }), END);
it('independent oracle: opaque marker-like output bytes do not create candidate records', () => {
  const output = reportCode(`${point}\r\n${start}\r\n${end}\r\n~~~\r\n😀\ud834\udd1e`);
  const fixed = material(output, info), body = `${point}\n\n${fixed}`;
  expect(fixed.slice(start.length + 2, -(end.length + 2))).toBe(output);
  expect(scanAuditRecordEnvelopes(body).map(x => x.metadata?.recordId)).toEqual(['A']);
  expect(parseReportAudit(body, 'f')).toMatchObject({ complete: true, items: [] });
});
it.each(['\n', '\r\n', '\r'])('independent oracle: crossing old/new end is never a usable audit %j', newline => {
  const split = point.indexOf('\n\nhistorical report');
  const body = `${point.slice(0, split)}\n\n${start}\n\n${point.slice(split)}\n\n${end}`.replace(/\n/g, newline);
  expect(parseReportAudit(body, 'f').complete).toBe(false);
  expect(scanAuditRecordEnvelopes(body).every(x => x.status === 'invalid' && !x.metadata)).toBe(true);
  expect(() => insertDifferenceAtCursor(body, 'NEW', 'f', body.indexOf('historical'))).toThrow();
});
it.each(['future-version', 'extra-end-key', 'wrong-end-id'])('independent oracle: %s does not leak later genuine records into candidates', mode => {
  let broken = start;
  if (mode === 'future-version') broken = broken.replace(START, START.replace('v1', 'v999'));
  const wrongEnd = mode === 'extra-end-key' ? reportCode(JSON.stringify({ version: 1, materialId: info.materialId, extra: true }), END) : mode === 'wrong-end-id' ? reportCode(JSON.stringify({ version: 1, materialId: 'wrong' }), END) : end;
  const body = `${broken}\n\n${wrongEnd}\n\n${end}\n\n${point}`;
  expect(scan(body).at(-1)).toMatchObject({ status: 'invalid', closed: false, end: body.length });
  expect(scanAuditRecordEnvelopes(body)).toEqual([]);
  expect(parseReportAudit(body, 'f').complete).toBe(false);
  expect(() => insertDifferenceAtCursor(body, 'NEW', 'f', body.length)).toThrow();
});
it('independent oracle: exact boundary insertion preserves existing bytes and never erases selection', () => {
  const fixed = material('unchanged output', info), original = `${point}\n\n${fixed}\n\nselected😀suffix`;
  const position = point.length + 2 + fixed.length;
  const next = insertDifferenceAtCursor(original, 'INSERT', 'f', position, original.length);
  expect(next.body).toBe(original.slice(0, position) + '\n\nINSERT\n\n' + original.slice(position));
  expect(next.body.endsWith('selected😀suffix')).toBe(true);
  expect(scanAuditRecordEnvelopes(next.body)[0].metadata?.recordId).toBe('A');
});

it('independent negative: failed collection acquisition refuses fixed insertion, but historical comparison remains exportable', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('storage unavailable'); });
  const writes = vi.spyOn(Storage.prototype, 'setItem');
  const body = `${point}\n\n${point.replaceAll('"recordId":"A"', '"recordId":"B"')}`;
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  const button = (label: string) => [...host.querySelectorAll('button')].find(x => x.textContent === label)!;
  const click = async (label: string) => act(async () => { expect(button(label), label).toBeTruthy(); button(label).click(); });
  try {
    await act(async () => root.render(createElement(FormulaReportModal, { formulaId: 'f', formula: { id: 'f', title: 'Formula', expression: '1', createdAt: info.preparedAt, updatedAt: info.preparedAt }, report: { id: 'r', formulaId: 'f', title: 'Report', body, createdAt: info.preparedAt, updatedAt: info.preparedAt, confirmedExpression: null }, writable: true, onClose: vi.fn(), onSave: vi.fn() })));
    await click('Markdownを編集'); await click('根拠点検');
    const selects = host.querySelectorAll<HTMLSelectElement>('[aria-label="固定点検記録の2時点比較"] select');
    for (const [index, id] of ['A', 'B'].entries()) await act(async () => { const option = [...selects[index].options].find(x => x.textContent?.includes(`：${id}（`))!; selects[index].value = option.value; selects[index].dispatchEvent(new Event('change', { bubbles: true })); });
    await click('選択した2記録を比較'); await click('比較結果Markdownをプレビュー');
    expect(host.querySelector('[aria-label="2時点比較結果のMarkdown出力"] textarea')).not.toBeNull();
    await click('比較結果をレポートに挿入');
    expect(host.querySelector('[aria-label="比較資料の固定挿入プレビュー"]')).toBeNull();
    expect(host.querySelector<HTMLTextAreaElement>('#formula-report-body')!.value).toBe(body);
    expect(writes).not.toHaveBeenCalled();
  } finally { await act(async () => root.unmount()); host.remove(); get.mockRestore(); writes.mockRestore(); vi.unstubAllGlobals(); }
});
