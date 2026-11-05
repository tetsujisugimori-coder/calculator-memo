export const CASES = ['same-generation-two-tabs', 'stale-validation-and-recovery', 'cooperative-aba-token',
  'web-lock-ignored-by-old-tab', 'unobserved-notification-aba', 'final-check-set-gap', 'transaction-abort-preserves-all',
  'commit-before-page-close-ack', 'exception-after-commit', 'normal-reopen-new-instance', 'missing-corrupt-history-generation-copy',
  'entire-store-loss-no-auto-bootstrap', 'idb-authority-legacy-fork', 'dedicated-workers-not-single-authority',
  'restore-and-ordinary-share-transaction'];
const receipt = o => o?.status === 'COMMIT_RECORD_OBSERVED' && o.generation === 1
  && o.acknowledgement === 'UNKNOWN' && o.durability === 'NOT_PROVEN';
const race = o => Array.isArray(o) && o.length === 2
  && JSON.stringify(o.map(r => r.status).sort()) === JSON.stringify(['COMMITTED_OBSERVED', 'REFUSED'])
  && o.find(r => r.status === 'REFUSED').reason === 'stale-token';
const refused = o => o?.status === 'REFUSED' && o.reason === 'stale-token';
const ORACLES = [
  o => race(o?.outcomes) && o.generation === 1,
  refused, refused,
  o => o?.lockHeldDuringBypass === true && o.raw === 'B' && o.safety === 'COUNTEREXAMPLE',
  o => o?.rawComparisonAccepts === true && o.safety === 'COUNTEREXAMPLE' && o.notification === 'subscriber-absent',
  o => o?.lost === 'B' && o.final === 'C' && o.safety === 'COUNTEREXAMPLE' && o.scheduling === 'explicit-cross-page-boundaries',
  o => o?.status === 'UNKNOWN' && o.reason === 'transaction-aborted' && o.generation === 0 && o.history === 1 && o.copies === 0,
  o => receipt(o) && o.interruption === 'actual-page-close-after-tx-complete-before-ui-ack' && o.browserKill === 'NOT_TESTED',
  o => o?.status === 'UNKNOWN' && o.originalFailure === 'injected-after-complete' && receipt(o.receipt),
  o => o?.integrity === 'CONSISTENT' && receipt(o.receipt),
  o => Array.isArray(o) && o.length === 3 && ['generation', 'history', 'copy'].every((fault, i) => o[i]?.fault === fault && o[i].status === 'UNKNOWN'),
  o => o?.status === 'UNKNOWN' && o.automaticBootstrap === 'REFUSED' && o.virginVsEvicted === 'INDISTINGUISHABLE',
  o => o?.idb === 'NEW' && o.legacy === 'OLD-TAB' && o.safety === 'FORK-REQUIRES-MANUAL-RECONCILIATION',
  o => JSON.stringify(o?.perTabSequence) === '[1,1]' && o.restartedSequence === 1 && o.safety === 'COUNTEREXAMPLE',
  race,
];
export function validateArchitectureEvidence(e, sha) {
  const errors = [];
  if (!/^[a-f0-9]{40}$/.test(sha || '') || e?.provenance?.sha !== sha
    || !/^[a-f0-9]{40}$/.test(e.provenance.tree || '') || !/^[a-f0-9]{64}$/.test(e.provenance.sourceSha256 || '')
    || e.provenance.dirty !== false || !e.provenance.node || !e.provenance.platform || !e.provenance.run || !e.provenance.attempt) errors.push('provenance');
  if (e?.status && e.status !== 'PASS') errors.push('failed summary');
  if (e?.executionAllowed !== false || e?.HOLD !== true) errors.push('safety boundary');
  if (e?.results?.length !== 2) errors.push('engine count');
  for (const engine of ['chromium', 'webkit']) {
    const rows = e?.results?.filter(r => r.engine === engine) || [];
    if (rows.length !== 1) { errors.push(engine + ' missing/duplicate'); continue; }
    const r = rows[0];
    if (r.status !== 'PASS' || r.error || !r.version || !Array.isArray(r.pageerrors) || r.pageerrors.length) errors.push(engine + ' failed/errors');
    if (JSON.stringify(r.cases?.map(c => c.name)) !== JSON.stringify(CASES)
      || r.cases?.some(c => c.status !== 'PASS' || c.observation === undefined)) errors.push(engine + ' incomplete cases');
    for (let i = 0; i < CASES.length; i++) {
      try { if (!ORACLES[i](r.cases?.[i]?.observation)) errors.push(engine + ' oracle ' + CASES[i]); }
      catch { errors.push(engine + ' malformed ' + CASES[i]); }
    }
  }
  return errors;
}
