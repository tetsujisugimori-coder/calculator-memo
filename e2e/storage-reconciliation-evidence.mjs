import { createHash } from 'node:crypto';
export const CASES = ['consistent-read-only', 'interrupted-before-save', 'receipt-before-failure', 'response-loss-after-save', 'partial-receipt-loss', 'whole-storage-loss', 'generation-rollback', 'aba-same-content', 'late-old-tab', 'multiple-branches', 'raw-hash-mismatch', 'quota-diagnostic', 'restart-unknown', 'rescue-capture-gap', 'hold-operation', 'closed-request'];
export const EXPECTED = ['CONSISTENT', 'INCOMPLETE', 'INCOMPLETE', 'INCOMPLETE', 'INCOMPLETE', 'INCOMPLETE', 'CONFLICT', 'UNKNOWN', 'CONFLICT', 'CONFLICT', 'CORRUPTED', 'INCOMPLETE', 'INCOMPLETE', 'CONFLICT', 'BLOCKED', 'BLOCKED'];
export const REQUIRED_CODES = [null, 'migration-receipt-missing', 'historical-intent-not-completion:UNKNOWN', 'retained-journal-unknown:response-lost', 'missing-or-extra-receipt', 'previously-observed-store-disappeared', 'generation-rollback-observed', 'historical-intent-not-completion:READBACK_MATCH', 'old-source-diverged-from-frozen-legacy', 'historical-rescue-attempt-not-completion', 'invalid-rescue-branch', 'migration-receipt-missing', 'retained-journal-unknown:restart-unknown', 'rescue-capture-gap-no-durable-raw', 'persistent-target-hold', 'closed-request-invalidated'];
const object = v => !!v && typeof v === 'object' && !Array.isArray(v);
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sha = raw => createHash('sha256').update(Buffer.from(raw, 'utf16le')).digest('hex');
function inventory(raw) {
  const p = JSON.parse(raw), ids = [];
  for (const [path, rows] of [['history', p.history], ['notes', p.notes], ['formulaLibrary.entries', p.formulaLibrary?.entries ?? []], ['formulaReports.entries', p.formulaReports?.entries ?? []], ['formulaExecutions', p.formulaExecutions ?? []]]) {
    if (!Array.isArray(rows)) throw Error('invalid inventory collection');
    for (const row of rows) if (object(row)) {
      if (path === 'formulaExecutions' && typeof row.formulaId === 'string') ids.push(path + ':formulaId:' + row.formulaId);
      else if (typeof row.id === 'string') ids.push(path + ':' + row.id);
    }
  }
  return ids;
}
// Independent origin contract: candidates are exact references to retained raw
// observations, never self-authenticating strings with a freshly calculated hash.
function origins(report) {
  const out = [], ev = report.evidence;
  const add = (evidence, raw, token = null, receipt = null) => { if (typeof raw === 'string' && raw.length <= 2_097_152) out.push({ evidence, raw, token, receipt, ids: inventory(raw) }); };
  if (ev.source.kind === 'present') add('source', ev.source.value);
  if (ev.target.kind === 'present' && object(ev.target.value)) {
    const target = ev.target.value, head = target.head;
    // Any reported target integrity defect forbids attaching its generation.
    const damaged = report.findings.some(f => ['CORRUPTED', 'INCOMPLETE'].includes(f.state) && f.evidence.includes('target'));
    let token = null;
    if (!damaged && object(head)) {
      token = { structure: head.structure, incarnation: head.incarnation, generation: head.generation, latestOperation: head.latestOperation };
      const receipt = target['receipt:' + head.latestOperation];
      if (!object(receipt) || !equal(token, receipt.token) || receipt.raw !== target.current || Object.keys(target).filter(k => k.startsWith('receipt:')).length !== head.generation + 1) throw Error('unproven target generation');
    }
    add('target.current', target.current, token, token?.latestOperation ?? null);
  }
  if (ev.journal.kind === 'present' && object(ev.journal.value)) for (const [key, r] of Object.entries(ev.journal.value)) {
    if (!key.startsWith('rescue:') || !object(r)) continue;
    const attempt = ev.journal.value['rescue-attempt:' + r.rescueId];
    if (r.protocol !== 1 || key !== 'rescue:' + r.rescueId || r.executionAllowed !== false || !Array.isArray(r.branches) || r.branches.length < 1 || r.branches.length > 2 || !object(attempt) || attempt.protocol !== 1 || attempt.state !== 'PENDING' || attempt.rescueId !== r.rescueId || r.source !== report.subject.source || r.destination !== report.subject.destination) continue;
    const seenOrigins = new Set();
    let valid = true;
    for (const b of r.branches) {
      try {
        if (!object(b) || !['OLD_LOCAL_STORAGE', 'ISOLATED_IDB'].includes(b.origin) || seenOrigins.has(b.origin) || b.hash !== sha(b.raw) || !equal(b.ids, inventory(b.raw)) || b.branchId !== r.rescueId + (b.origin === 'OLD_LOCAL_STORAGE' ? '-old' : '-idb')) valid = false;
        seenOrigins.add(b.origin);
        if (b.origin === 'OLD_LOCAL_STORAGE' && (b.generation !== null || b.receipt !== null || b.parent !== null)) valid = false;
        if (b.origin === 'ISOLATED_IDB' && (!object(r.targetEvidence) || r.targetEvidence.current !== b.raw || b.generation !== null && (!equal(b.generation, { structure: r.targetEvidence.head?.structure, incarnation: r.targetEvidence.head?.incarnation, generation: r.targetEvidence.head?.generation, latestOperation: r.targetEvidence.head?.latestOperation }) || b.receipt !== b.generation.latestOperation))) valid = false;
      } catch { valid = false; }
    }
    if (!valid) continue;
    for (const b of r.branches) {
      add('journal.' + key + '.' + b.branchId, b.raw, b.generation, b.receipt);
    }
  }
  return out;
}
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
        const derivedState = ['CORRUPTED', 'CONFLICT', 'INCOMPLETE', 'UNKNOWN', 'BLOCKED'].find(state => report?.findings?.some(f => f.state === state)) ?? 'CONSISTENT';
        if (derivedState !== report?.state) failures.push('state-findings-contradiction');
        if (!Array.isArray(report?.candidates) || !Array.isArray(report?.missingEvidence) || !Array.isArray(report?.usedEvidence) || report?.authority !== 'NOT_ESTABLISHED' || report?.writeAllowed !== false) failures.push('report-evidence-missing');
        try {
          const snapshot = JSON.parse(c.observation.before);
          const source = report.evidence.source.kind === 'present' ? report.evidence.source.value : null;
          if (snapshot.source !== source || JSON.stringify(snapshot.target) !== JSON.stringify(report.evidence.target) || JSON.stringify(snapshot.journal) !== JSON.stringify(report.evidence.journal)) failures.push('report-snapshot-mismatch');
          const expectedCandidates = origins(report), seen = new Set();
          if (report.candidates.length !== expectedCandidates.length) failures.push('candidate-completeness');
          for (const candidate of report.candidates) {
            const origin = expectedCandidates.find(o => o.evidence === candidate.evidence);
            if (!origin || seen.has(candidate.evidence) || !equal(origin, { evidence: candidate.evidence, raw: candidate.raw, token: candidate.token, receipt: candidate.receipt, ids: candidate.ids })) failures.push('candidate-origin-mismatch');
            seen.add(candidate.evidence);
            // Every candidate in this fixed 16-case native suite has a valid document schema.
            if (candidate.schemaValid !== true) failures.push('candidate-schema');
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
