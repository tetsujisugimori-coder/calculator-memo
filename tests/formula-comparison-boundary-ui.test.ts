// @vitest-environment jsdom
import { act, createElement, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it } from 'vitest';
import { FormulaAuditRecordComparison } from '../components/FormulaAuditRecordComparison';
import { createAuditRecordMarkdown } from '../lib/formula-report-audit-record';
import { AUDIT_COMPARISON_RECORD_START as START, AUDIT_COMPARISON_RECORD_END as END } from '../lib/formula-report-audit-comparison-record';
import { reportCode } from '../lib/markdown-report';

it.each(['\n', '\r\n', '\r'])('keeps outer A eligible but never promotes B between duplicate same-ID ends %j', async newline => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const at = '2026-10-26T01:00:00.000Z';
  const record = (recordId: string) => createAuditRecordMarkdown(recordId, { recordId, formulaId: 'f', reportId: 'r', generatedAt: at,
    bodySha256: 'a'.repeat(64), bodyLength: 0, comparison: { version: 1, state: 'checked', acquisitionStatus: 'ok', fetchedAt: at, complete: true, reason: 'synthetic', items: [] } });
  const start = reportCode(JSON.stringify({ version: 1, materialId: 'M', formulaId: 'f', reportId: 'r', beforeRecordId: 'outer-A', afterRecordId: 'internal-B', preparedAt: at }), START);
  const end = reportCode(JSON.stringify({ version: 1, materialId: 'M' }), END);
  const body = [record('outer-A'), start, end, record('internal-B'), end].join('\n\n').replace(/\n/g, newline);
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  try {
    await act(async () => root.render(createElement(StrictMode, null, createElement(FormulaAuditRecordComparison, { body, formulaId: 'f', reportId: 'r', onNavigate: () => {} }))));
    const selects = [...host.querySelectorAll('select')]; expect(selects).toHaveLength(2);
    for (const select of selects) {
      const choices = [...select.options].filter(option => option.value !== '' && !option.disabled);
      expect(choices).toHaveLength(1);
      expect(choices[0].textContent).toContain('outer-A');
      expect([...select.options].some(option => option.textContent?.includes('internal-B'))).toBe(false);
    }
    expect(host.querySelector('[aria-label="2時点比較結果"]')).toBeNull();
  } finally { await act(async () => root.unmount()); host.remove(); }
});
