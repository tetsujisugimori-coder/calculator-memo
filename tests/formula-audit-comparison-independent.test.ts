// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { assessReportAudit, parseReportAudit } from '../lib/formula-report-audit';
import { captureAuditComparison, compareAuditRecords } from '../lib/formula-report-audit-comparison';
const at = '2026-10-25T00:00:00.000Z';
const capture = captureAuditComparison;
it.each(['unavailable', 'invalid'] as const)('independent: zero recognized items retains %s acquisition outcome, not success', failure => {
  const inventory = parseReportAudit('本文に固定引用はありません', 'f');
  const success = capture(inventory, assessReportAudit(inventory, { notes: [], links: [] }), 'checked', at, 'ok');
  const failed = capture(inventory, assessReportAudit(inventory, { notes: [], links: [], error: '取得失敗', invalidData: failure === 'invalid' }), 'checked', at, failure);
  const result = compareAuditRecords({ recordId: 'A', formulaId: 'f', reportId: 'r', snapshot: success }, { recordId: 'B', formulaId: 'f', reportId: 'r', snapshot: failed });
  expect(result.states).toContain(failure === 'invalid' ? 'unknown' : 'unavailable');
  expect(result.states).toContain('changed');
  expect(result.states).not.toEqual(['matched']);
});

import { act, createElement, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { FormulaAuditRecordComparison } from '../components/FormulaAuditRecordComparison';
import { createAuditRecordMarkdown } from '../lib/formula-report-audit-record';
it('independent: StrictMode effect replay does not invalidate every subsequent explicit selection', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  const record = (recordId: string) => createAuditRecordMarkdown('historical', { recordId, formulaId: 'f', reportId: 'r', generatedAt: at, bodyLength: 0, bodySha256: 'a'.repeat(64), comparison: { version: 1, state: 'unverified', complete: true, reason: 'empty recognized inventory', items: [] } });
  try {
    await act(async () => root.render(createElement(StrictMode, null, createElement(FormulaAuditRecordComparison, { body: record('A') + '\n\n' + record('B'), formulaId: 'f', reportId: 'r', onNavigate: () => undefined }))));
    const select = host.querySelector('select')!;
    await act(async () => { select.value = select.options[1].value; select.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(select.value).toBe(select.options[1].value);
  } finally { await act(async () => root.unmount()); host.remove(); }
});
import { createTrackedDifferenceMarkdown, rebuildDifferenceMarkdown } from '../lib/formula-report-diff-tracking';
import type { DifferenceSnapshot } from '../lib/formula-report-snapshots';
import type { EvidenceRecord } from '../lib/calculation-evidence';
it.each(['blockId', 'quoteId'] as const)('independent: a difference preserves changed originating quote %s', changedField => {
  const source: EvidenceRecord = { id: 'source', evaluator: 'calculator-memo-v1', status: 'confirmed', calculatedAt: at, persistedAt: at, blocks: ['one', 'two'].map((blockId, index) => ({ blockId, position: index + 1, expression: '1', result: '1', resultText: '1', status: 'success', inputs: [] })) };
  const a: DifferenceSnapshot = { version: 1, differenceId: 'difference', preparedAt: at, quote: { version: 1, quoteId: 'q1', formulaId: 'f', memoId: 'm', blockId: 'one', citedAt: at, record: source }, after: { ...structuredClone(source), id: 'target' }, quoteBodyEdited: false };
  const b = structuredClone(a); b.quote[changedField] = changedField === 'blockId' ? 'two' : 'q2';
  const build = (value: DifferenceSnapshot) => {
    const body = createTrackedDifferenceMarkdown(rebuildDifferenceMarkdown(value), value.quote, value.after, value.differenceId, value.preparedAt);
    const inventory = parseReportAudit(body, 'f');
    expect(inventory.items[0].bodyStatus).toBe('intact');
    const items = assessReportAudit(inventory, { notes: [{ id: 'm', type: 'plain-calculation', title: '', content: '', createdAt: at, updatedAt: at, calculationEvidence: { version: 1, records: [value.quote.record, value.after] } }], links: [{ memoId: 'm', recordId: value.quote.record.id }, { memoId: 'm', recordId: value.after.id }] });
    return captureAuditComparison(inventory, items, 'checked', at, 'ok');
  };
  const result = compareAuditRecords({ recordId: 'A', formulaId: 'f', reportId: 'r', snapshot: build(a) }, { recordId: 'B', formulaId: 'f', reportId: 'r', snapshot: build(b) });
  expect(result.states).toContain('changed');
});
