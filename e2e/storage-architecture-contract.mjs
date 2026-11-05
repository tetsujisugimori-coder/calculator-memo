export const CASES = ['same-generation-two-tabs', 'stale-validation-and-recovery', 'cooperative-aba-token',
  'web-lock-ignored-by-old-tab', 'unobserved-notification-aba', 'final-check-set-gap', 'transaction-abort-preserves-all',
  'commit-before-page-close-ack', 'exception-after-commit', 'normal-reopen-new-instance', 'missing-corrupt-history-generation-copy',
  'entire-store-loss-no-auto-bootstrap', 'idb-authority-legacy-fork', 'dedicated-workers-not-single-authority',
  'restore-and-ordinary-share-transaction'];
export function validateArchitectureEvidence(e, sha) {
  const errors = [];
  if (!sha || e?.provenance?.sha !== sha || !e.provenance.tree || !e.provenance.sourceSha256) errors.push('provenance');
  if (e?.executionAllowed !== false || e?.HOLD !== true) errors.push('safety boundary');
  if (e?.results?.length !== 2) errors.push('engine count');
  for (const engine of ['chromium', 'webkit']) {
    const rows = e?.results?.filter(r => r.engine === engine) || [];
    if (rows.length !== 1) { errors.push(engine + ' missing/duplicate'); continue; }
    const r = rows[0];
    if (r.status !== 'PASS' || !r.version || !Array.isArray(r.pageerrors) || r.pageerrors.length) errors.push(engine + ' failed/errors');
    if (JSON.stringify(r.cases?.map(c => c.name)) !== JSON.stringify(CASES)
      || r.cases?.some(c => c.status !== 'PASS' || c.observation === undefined)) errors.push(engine + ' incomplete cases');
  }
  return errors;
}
