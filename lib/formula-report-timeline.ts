import { formulaDefinitionSnapshot, formulaReportAssessment, hasUnknownFormulaDefinition, readReportEvidence } from './formula-report-evidence';
import type { FormulaReport, Memo, RegisteredFormula } from './types';

/** Display-only projection. Never changes source order, appends events, or evaluates a formula. */
export function formulaReportTimeline(report: FormulaReport, formula: RegisteredFormula | undefined, notes?: Memo[]) {
  const evidence = report.evidence === undefined ? undefined : readReportEvidence(report.evidence, report.formulaId);
  const confirmations = evidence?.confirmations ?? [];
  let definition: ReturnType<typeof formulaDefinitionSnapshot> | undefined;
  try { if (formula && !hasUnknownFormulaDefinition(formula)) definition = formulaDefinitionSnapshot(formula); } catch { /* Unknown is not equal. */ }
  const entries = confirmations.map((confirmation, index) => {
    // Legacy imports can contain parseable dates without an explicit zone. Do not invent a zone/order.
    const timestamp = /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(confirmation.confirmedAt) ? Date.parse(confirmation.confirmedAt) : null;
    return {
      confirmation, savedPosition: index + 1, lastSaved: index === confirmations.length - 1, timestamp,
      definitionMatches: definition ? JSON.stringify(confirmation.definition) === JSON.stringify(definition) && confirmation.formulaId === formula?.id : null,
      reportMatches: confirmation.title === report.title && confirmation.body === report.body,
      linksMatch: JSON.stringify(confirmation.links) === JSON.stringify(evidence!.links),
      assessment: formulaReportAssessment({ ...report, evidence: { version: 1, links: evidence!.links, confirmations: [confirmation] } }, formula, notes),
    };
  });
  // A non-zoned date cannot be interleaved honestly. Preserve the entire saved order in that case.
  const chronological = entries.every(entry => entry.timestamp !== null);
  if (chronological) entries.sort((a, b) => a.timestamp! - b.timestamp! || a.savedPosition - b.savedPosition);
  return { entries, chronological, hasTies: chronological && new Set(entries.map(entry => entry.timestamp)).size !== entries.length };
}
