import { compareEvidenceRecords } from './evidence-comparison';
import { readReportEvidenceLinks, reportEvidenceLinkKey, resolveReportEvidence } from './formula-report-evidence';
import { validateQuoteSnapshot, type QuoteAssessment } from './formula-report-quotes';
import type { FormulaReportEvidenceLink, Memo } from './types';

/** Restrict correspondence to one memo; never infer identity from names or formulas. */
export function quoteComparisonTargets(quote: QuoteAssessment, formulaId: string, notes: Memo[], links: FormulaReportEvidenceLink[]) {
  if (quote.status === 'invalid' || !quote.snapshot) throw new Error('比較不能：引用情報を安全に検証できません。本文は保持しています。');
  validateQuoteSnapshot(quote.snapshot);
  if (quote.snapshot.formulaId !== formulaId) throw new Error('比較不能：登録式IDが一致しません。');
  const eligible = readReportEvidenceLinks(links).filter(link => link.memoId === quote.snapshot!.memoId && link.recordId !== quote.snapshot!.record.id);
  return resolveReportEvidence(notes, eligible);
}

/** Both operands are saved snapshots; missing original does not invalidate the citation. */
export function compareQuoteToRecord(quote: QuoteAssessment, formulaId: string, notes: Memo[], links: FormulaReportEvidenceLink[], selectedKey: string) {
  const target = quoteComparisonTargets(quote, formulaId, notes, links).find(item => reportEvidenceLinkKey(item.link) === selectedKey);
  if (!target) throw new Error('比較不能：同じメモIDの保存済み根拠リンクから別の記録を選択してください。');
  if (target.status === 'missing') throw new Error('比較先の保存記録が欠落しています。別の記録では代用しません。');
  if (target.status !== 'available' || !target.record) throw new Error('比較不能：比較先が未知・不正な形式のため取得した値を利用できません。');
  return compareEvidenceRecords(quote.snapshot!.record, target.record);
}
