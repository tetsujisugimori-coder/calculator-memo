export const CASES = ['consistent-read-only', 'interrupted-before-save', 'receipt-before-failure', 'response-loss-after-save', 'partial-receipt-loss', 'whole-storage-loss', 'generation-rollback', 'aba-same-content', 'late-old-tab', 'multiple-branches', 'raw-hash-mismatch', 'quota-diagnostic', 'restart-unknown', 'rescue-capture-gap', 'hold-operation', 'closed-request'];
export const EXPECTED = ['CONSISTENT', 'INCOMPLETE', 'INCOMPLETE', 'INCOMPLETE', 'INCOMPLETE', 'INCOMPLETE', 'CONFLICT', 'UNKNOWN', 'CONFLICT', 'CONFLICT', 'CORRUPTED', 'INCOMPLETE', 'INCOMPLETE', 'CONFLICT', 'BLOCKED', 'BLOCKED'];
export function validateReconciliationEvidence(e, expected) {
  const failures = [];
  if (e?.status !== 'passed' || e.error) failures.push('summary-status');
  if (e?.HOLD !== true || e.executionAllowed !== false || e.kind !== 'read-only-reconciliation') failures.push('scope');
  const p = e?.provenance;
  if (!p || p.dirty !== false || !/^[a-f0-9]{40}$/.test(p.sha ?? '') || !/^[a-f0-9]{40}$/.test(p.tree ?? '') || !/^[a-f0-9]{64}$/.test(p.sourceSha256 ?? '') || !/^[a-f0-9]{64}$/.test(p.moduleSha256 ?? '') || expected && (p.sha !== expected.sha || p.tree !== expected.tree)) failures.push('provenance');
  if (!Array.isArray(e?.matrix) || e.matrix.length !== 8) return [...failures, 'matrix-count'];
  const matrix = new Set(['chromium', 'webkit'].flatMap(engine => [375, 390, 765, 1280].map(width => `${engine}:${width}`)));
  for (const m of e.matrix) {
    if (!matrix.delete(`${m.engine}:${m.width}`)) failures.push('condition-identity');
    if (m.status !== 'passed' || !m.browserVersion || !Array.isArray(m.errors) || m.errors.length || !m.png || !/^[a-f0-9]{64}$/.test(m.pngSha256 ?? '')) failures.push('condition-status');
    if (!Array.isArray(m.cases) || m.cases.length !== CASES.length) { failures.push('case-count'); continue; }
    const cases = new Set(CASES);
    for (const c of m.cases) {
      if (c.observation?.report?.state !== EXPECTED[CASES.indexOf(c.name)]) failures.push('unexpected-diagnostic-state');
      if (!cases.delete(c.name)) failures.push('case-identity');
      if (c.status !== 'passed' || c.error || !c.observation || c.observation.executionAllowed !== false || c.observation.mutations !== 0 || c.observation.before !== c.observation.after || !c.observation.report || c.observation.report.executionAllowed !== false || c.observation.report.HOLD !== true || !Array.isArray(c.observation.report.findings)) failures.push('case-status');
      if (!Number.isFinite(Date.parse(c.startedAt)) || !Number.isFinite(Date.parse(c.finishedAt)) || Date.parse(c.finishedAt) < Date.parse(c.startedAt)) failures.push('case-time');
    }
    if (cases.size) failures.push('missing-case');
  }
  if (matrix.size) failures.push('missing-condition');
  return failures;
}
