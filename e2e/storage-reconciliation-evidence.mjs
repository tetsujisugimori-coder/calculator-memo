import { createHash } from 'node:crypto';
export const CASES = ['consistent-read-only', 'interrupted-before-save', 'receipt-before-failure', 'response-loss-after-save', 'partial-receipt-loss', 'whole-storage-loss', 'generation-rollback', 'aba-same-content', 'late-old-tab', 'multiple-branches', 'raw-hash-mismatch', 'quota-diagnostic', 'restart-unknown', 'rescue-capture-gap', 'hold-operation', 'closed-request'];
export const EXPECTED = ['CONSISTENT', 'INCOMPLETE', 'INCOMPLETE', 'INCOMPLETE', 'INCOMPLETE', 'INCOMPLETE', 'CONFLICT', 'UNKNOWN', 'CONFLICT', 'CONFLICT', 'CORRUPTED', 'INCOMPLETE', 'INCOMPLETE', 'CONFLICT', 'BLOCKED', 'BLOCKED'];
export const REQUIRED_CODES = [null, 'migration-receipt-missing', 'historical-intent-not-completion:UNKNOWN', 'retained-journal-unknown:response-lost', 'missing-or-extra-receipt', 'previously-observed-store-disappeared', 'generation-rollback-observed', 'historical-intent-not-completion:READBACK_MATCH', 'old-source-diverged-from-frozen-legacy', 'historical-rescue-attempt-not-completion', 'invalid-rescue-branch', 'migration-receipt-missing', 'retained-journal-unknown:restart-unknown', 'rescue-capture-gap-no-durable-raw', 'persistent-target-hold', 'closed-request-invalidated'];
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
      const report = c.observation?.report, required = REQUIRED_CODES[CASES.indexOf(c.name)];
      if (required && !report?.findings?.some(f => f.code === required)) failures.push('missing-case-reason');
      if (c.name !== 'closed-request') {
        if (!Array.isArray(report?.candidates) || !Array.isArray(report?.missingEvidence) || !Array.isArray(report?.usedEvidence) || report?.authority !== 'NOT_ESTABLISHED') failures.push('report-evidence-missing');
        try {
          const snapshot = JSON.parse(c.observation.before);
          const source = report.evidence.source.kind === 'present' ? report.evidence.source.value : null;
          if (snapshot.source !== source || JSON.stringify(snapshot.target) !== JSON.stringify(report.evidence.target) || JSON.stringify(snapshot.journal) !== JSON.stringify(report.evidence.journal)) failures.push('report-snapshot-mismatch');
          for (const candidate of report.candidates) {
            if (typeof candidate.raw !== 'string' || candidate.length !== candidate.raw.length || candidate.hashAlgorithm !== 'SHA-256/UTF-16LE-code-units' || candidate.hash !== createHash('sha256').update(Buffer.from(candidate.raw, 'utf16le')).digest('hex') || candidate.executionAllowed !== false) failures.push('candidate-integrity');
          }
          if (c.name === 'multiple-branches' && report.candidates.length !== 4 || c.name === 'whole-storage-loss' && report.candidates.length !== 0) failures.push('candidate-completeness');
        } catch { failures.push('raw-evidence-invalid'); }
      }
      if (c.name === 'restart-unknown' && (c.observation?.pageReloadReport?.state !== 'INCOMPLETE' || !c.observation?.pageReloadReport?.findings?.some(f => f.state === 'UNKNOWN'))) failures.push('restart-evidence-missing');
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
