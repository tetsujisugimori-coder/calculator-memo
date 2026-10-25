import { expect, it } from 'vitest';
import { createAuditRecordMarkdown } from '../lib/formula-report-audit-record';
import { parseReportAudit } from '../lib/formula-report-audit';
import { createQuoteMarkdown, type QuoteSnapshot } from '../lib/formula-report-quotes';
import { createTrackedDifferenceMarkdown, rebuildDifferenceMarkdown } from '../lib/formula-report-diff-tracking';
import type { DifferenceSnapshot } from '../lib/formula-report-snapshots';
const at = '2026-10-25T00:00:00.000Z';
const info = { recordId: 'audit-1', formulaId: 'f', reportId: 'r', generatedAt: at, bodySha256: 'a'.repeat(64), bodyLength: 7 };
const quote: QuoteSnapshot = { version: 1, quoteId: 'q', formulaId: 'f', memoId: 'm', blockId: 'b', citedAt: at, record: { id: 'before', evaluator: 'calculator-memo-v1', status: 'confirmed', calculatedAt: at, persistedAt: at, blocks: [{ blockId: 'b', position: 1, expression: '1', result: '1', resultText: '1', status: 'success', inputs: [] }] } };
const q = createQuoteMarkdown(quote);
const diff: DifferenceSnapshot = { version: 1, differenceId: 'd', preparedAt: at, quote, after: { ...quote.record, id: 'after' }, quoteBodyEdited: false };
const d = createTrackedDifferenceMarkdown(rebuildDifferenceMarkdown(diff), quote, diff.after, 'd', at);
const fixed = (text = `${q}\n\n${d}`) => createAuditRecordMarkdown(text, info);


it('review: audit record nested inside existing difference must not silently hide outer item with complete count', () => {
  const firstFenceEnd = d.indexOf('\n```', d.indexOf('\n')) + 4;
  const body = d.slice(0, firstFenceEnd) + '\n\n' + fixed('history') + '\n\n' + d.slice(firstFenceEnd);
  const result = parseReportAudit(body, 'f');
  expect(result.complete).toBe(false);
  expect(result.items).toHaveLength(1);
  expect(result.items[0]).toMatchObject({ kind: 'difference', bodyStatus: 'invalid', canNavigate: false });
});
it('review: excluding historical record must not bridge a split quote back into intact correspondence', () => {
  const metadataStart = q.indexOf('```calculator-memo-evidence');
  const body = q.slice(0, metadataStart) + fixed('history') + '\n\n' + q.slice(metadataStart);
  const result = parseReportAudit(body, 'f');
  expect(result.items.some(item => item.bodyStatus === 'intact')).toBe(false);
});
