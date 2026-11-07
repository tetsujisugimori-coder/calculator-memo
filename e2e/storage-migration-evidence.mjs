// Assertion manifest is fixed independently of the loop that runs each case.
export const MIGRATION_CASES = [
  'migration-preserves-source-raw-and-atomic-receipt', 'preview-is-read-only-and-complete',
  'known-absence-and-source-only-or-target-only', 'causal-branches-not-timestamp-authority',
  'stale-source-before-request-no-target-overwrite', 'source-change-during-read-detected',
  'source-change-before-read-frozen-mismatch', 'source-change-in-read-write-gap-detected',
  'legitimate-target-branch-never-overwritten', 'duplicate-request-does-not-register-twice',
  'parallel-same-controller-does-not-double-write', 'actual-two-tab-migration-serialized',
  'closed-queued-migration-cannot-revive', 'caller-mutation-cannot-change-frozen-request',
  'transaction-abort-after-request-success', 'receipt-put-failure-atomic-old-primary',
  'commit-response-loss-UNKNOWN-no-retry', 'adapter-readback-mismatch-HOLD',
  'migration-readback-failure-HOLD', 'journal-receipt-failure-retains-durable-attempt',
  'late-legacy-writer-preserves-both-values', 'restart-never-unlocks-migration',
  'corrupt-generation-authority-UNKNOWN', 'corrupt-receipt-authority-UNKNOWN', 'corrupt-raw-authority-UNKNOWN',
  'rescue-retains-two-independent-raw-branches', 'corrupt-raw-rescue-is-evidence-not-authority',
  'rescue-precommit-race-does-not-write-stale-pair', 'rescue-postcommit-race-retains-evidence-and-HOLD',
  'conflict-allows-explicit-branch-preservation-only', 'duplicate-rescue-never-overwrites-branches',
  'close-during-rescue-fences-journal-write', 'production-namespace-rejected-before-access',
];
export function validateMigrationEvidence(evidence) {
  const failures = [];
  if (evidence?.status !== 'passed' || evidence.error) failures.push('summary-status');
  if (evidence?.provenance?.dirty !== false) failures.push('dirty-or-unknown-source');
  if (evidence?.kind !== 'isolated-migration-not-formal-gui' || evidence.executionAllowed !== false || evidence.HOLD !== true) failures.push('scope');
  if (!/^[a-f0-9]{40}$/.test(evidence?.provenance?.sha ?? '') || !/^[a-f0-9]{40}$/.test(evidence?.provenance?.tree ?? '') || !/^[a-f0-9]{64}$/.test(evidence?.provenance?.sourceSha256 ?? '') || !/^[a-f0-9]{64}$/.test(evidence?.provenance?.moduleSha256 ?? '')) failures.push('provenance');
  const matrix = evidence?.matrix;
  if (!Array.isArray(matrix) || matrix.length !== 8) return [...failures, 'matrix-count'];
  const wanted = new Set(['chromium', 'webkit'].flatMap(engine => [375, 390, 765, 1280].map(width => engine + ':' + width)));
  for (const m of matrix) {
    if (!wanted.delete(m.engine + ':' + m.width)) failures.push('duplicate-or-unexpected-condition');
    if (m.status !== 'passed' || !m.browserVersion || !Array.isArray(m.errors) || m.errors.length) failures.push('condition-status');
    if (!Array.isArray(m.cases) || m.cases.length !== MIGRATION_CASES.length) { failures.push('case-count'); continue; }
    const names = new Set(MIGRATION_CASES);
    for (const c of m.cases) {
      const start = Date.parse(c.startedAt), finish = Date.parse(c.finishedAt);
      if (!Number.isFinite(start) || !Number.isFinite(finish) || finish < start) failures.push('case-time');
      if (!names.delete(c.name)) failures.push('duplicate-or-unexpected-case');
      if (c.status !== 'passed' || !c.kind || !c.startedAt || !c.finishedAt || (typeof c.observation !== 'object' || c.observation === null) || c.error) failures.push('case-status');
    }
    if (names.size) failures.push('missing-case');
  }
  if (wanted.size) failures.push('missing-condition');
  return failures;
}
