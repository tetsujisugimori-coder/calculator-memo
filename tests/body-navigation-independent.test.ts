import { expect, it } from 'vitest';
import { parseReportAudit } from '../lib/formula-report-audit';
import { captureAuditNavigationTarget as capture, resolveAuditNavigationTarget as resolve, prepareAuditNavigationContext as prepare } from '../lib/formula-report-audit-roundtrip';
import { createQuoteMarkdown, type QuoteSnapshot } from '../lib/formula-report-quotes';
const at = '2026-10-28T00:00:00.000Z';
const snapshot: QuoteSnapshot = { version: 1, quoteId: 'q', formulaId: 'f', memoId: 'm', blockId: 'b', citedAt: at, record: { id: 'r', evaluator: 'calculator-memo-v1', status: 'confirmed', calculatedAt: at, persistedAt: at, blocks: [{ blockId: 'b', position: 1, expression: '1', result: '1', resultText: '1', status: 'success', inputs: [] }] } };
const body = createQuoteMarkdown(snapshot);
it('independent: prepared navigation retains the exact uncached rejection rules across changed input and identity', () => {
  const inventory = parseReportAudit(body, 'f'), item = inventory.items[0];
  const context = prepare(body, 'f', 'report', inventory);
  const target = capture(body, 'f', 'report', item.start, item.end, context)!;
  expect(target).not.toBeNull();
  for (const text of [body, `prefix\n${body}`, `${body}\n\n${body}`, 'deleted', body.replace('当時の式', '改変された式'), body.replaceAll('evidence-v1', 'evidence-v99')]) {
    for (const [formulaId, reportId] of [['f', 'report'], ['other', 'report'], ['f', 'other']]) {
      expect(resolve(text, formulaId, reportId, target, context)).toEqual(resolve(text, formulaId, reportId, target));
      expect(capture(text, formulaId, reportId, item.start, item.end, context)).toEqual(capture(text, formulaId, reportId, item.start, item.end));
    }
  }
});
it('independent: an unbranded inventory or context cannot inject guessed ranges', () => {
  const inventory = parseReportAudit(body, 'f'), item = inventory.items[0];
  const fake = { ...inventory, items: [{ ...item, start: 0, end: 4 }] };
  const context = prepare(body, 'f', 'report', fake);
  expect(capture(body, 'f', 'report', 0, 4, context)).toBeNull();
  expect(capture(body, 'f', 'report', item.start, item.end, context)).toEqual(capture(body, 'f', 'report', item.start, item.end));
  const forged = { body, formulaId: 'f', reportId: 'report' };
  expect(capture(body, 'f', 'report', 0, 4, forged)).toBeNull();
});
