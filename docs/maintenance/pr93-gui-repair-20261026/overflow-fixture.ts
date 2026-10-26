// Synthetic-only saved-report fixture, built with the production Markdown builder.
import { buildQuoteDifferenceMarkdown } from '../../../lib/formula-report-diff';
import { createTrackedDifferenceMarkdown } from '../../../lib/formula-report-diff-tracking';
import { createQuoteMarkdown, type QuoteSnapshot } from '../../../lib/formula-report-quotes';
import type { EvidenceRecord } from '../../../lib/calculation-evidence';
import type { Memo, StoredData } from '../../../lib/types';
export function overflowFixture(formulaId = 'quote-formula'): StoredData {
  const at = '2026-10-26T03:22:15.150Z';
  const before: EvidenceRecord = { id: 'quote-record-' + 'r'.repeat(100), evaluator: 'calculator-memo-v1', status: 'confirmed', calculatedAt: at, persistedAt: at, blocks: [{ blockId: 'quote-result', position: 1, expression: '1', inputs: [], result: '1', resultText: '1', status: 'success' }] };
  const after: EvidenceRecord = { ...structuredClone(before), id: 'quote-comparison-record', blocks: [{ ...before.blocks[0], expression: '2', result: '2', resultText: '2' }] };
  const quote: QuoteSnapshot = { version: 1, quoteId: '965d1c53-3da3-4ae2-a73c-fd94df1efe4f', formulaId, memoId: 'quote-memo', blockId: 'quote-result', citedAt: at, record: before };
  const memo: Memo = { id: 'quote-memo', type: 'plain-calculation', title: 'Synthetic overflow source', content: 'Current draft is not historical evidence', createdAt: at, updatedAt: at, calculationEvidence: { version: 1, records: [before, after] } };
  const links = [{ memoId: memo.id, recordId: before.id }, { memoId: memo.id, recordId: after.id }];
  const difference = buildQuoteDifferenceMarkdown({ status: 'matched', reason: '', start: 0, end: 0, snapshot: quote }, formulaId, [memo], links, JSON.stringify([memo.id, after.id]));
  const body = createTrackedDifferenceMarkdown(difference, quote, after, 'f94c198b-b4b1-4a41-a86e-11d63e9013bd', '2026-10-26T03:22:40.026Z') + '\n\n' + createQuoteMarkdown(quote);
  return { version: 1, notes: [memo], history: [], settings: { theme: 'light', activePanel: 'history' },
    formulaLibrary: { version: 1, entries: [{ id: formulaId, title: 'Synthetic overflow formula', expression: 'x * 2', createdAt: at, updatedAt: at }], selectedId: formulaId },
    formulaReports: { version: 1, entries: [{ id: 'quote-report', formulaId, title: 'Synthetic overflow report', body, createdAt: at, updatedAt: at, confirmedExpression: null, evidence: { version: 1, links, confirmations: [] } }] } };
}
