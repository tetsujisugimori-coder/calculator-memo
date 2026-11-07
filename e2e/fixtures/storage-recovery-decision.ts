// Stage 3B-7B: synthetic-only, pure human decision material.
// No storage APIs, no persistence, and no recovery operation is exposed.
import type { reconcileEvidence } from './storage-reconciliation';

export type ReconciliationReport = Awaited<ReturnType<typeof reconcileEvidence>>;
export type EnvironmentStatus = 'PASS' | 'FAIL' | 'PARTIAL' | 'UNKNOWN' | 'NOT_TESTED';
export type EnvironmentId = 'A1' | 'A2' | 'A3' | 'A4' | 'A5' | 'A6';
export type EnvironmentCheck = {
  id: EnvironmentId;
  status: EnvironmentStatus;
  evidenceRefs: string[];
  limitation: string;
};
const ids: readonly EnvironmentId[] = ['A1', 'A2', 'A3', 'A4', 'A5', 'A6'];
const priorities = ['CORRUPTED', 'CONFLICT', 'INCOMPLETE', 'UNKNOWN', 'BLOCKED'] as const;

export function buildRecoveryDecisionSheet(report: ReconciliationReport, observedEnvironment: readonly EnvironmentCheck[] = []) {
  // This module is deliberately not a path for importing production storage.
  if (!/^stage3b5-test-[A-Za-z0-9_-]{1,120}$/.test(report?.subject?.source ?? '') ||
      !/^stage3b4-test-[A-Za-z0-9_-]{1,120}$/.test(report?.subject?.destination ?? '')) {
    throw Error('synthetic-namespace-required');
  }
  if (report.HOLD !== true || report.executionAllowed !== false ||
      report.writeAllowed !== false || report.authority !== 'NOT_ESTABLISHED') {
    throw Error('recovery-authorization-forbidden');
  }
  if (!Array.isArray(report.findings) || !Array.isArray(report.candidates) ||
      !Array.isArray(report.usedEvidence) || !Array.isArray(report.missingEvidence) ||
      !Array.isArray(report.knownCausality) || !Array.isArray(report.unknownCausality)) {
    throw Error('invalid-decision-evidence');
  }
  const states = new Set(report.findings.map(f => f.state));
  if (report.findings.some(f => !priorities.includes(f.state)) ||
      report.state !== (priorities.find(s => states.has(s)) ?? 'CONSISTENT')) {
    throw Error('inconsistent-diagnostic-state');
  }
  if (report.candidates.some(c => c.executionAllowed !== false ||
      typeof c.evidence !== 'string' || !c.evidence ||
      typeof c.length !== 'number' || !Number.isSafeInteger(c.length) || c.length < 0 ||
      typeof c.hash !== 'string' || !/^[a-f0-9]{64}$/i.test(c.hash))) {
    throw Error('invalid-or-executable-candidate');
  }

  const supplied = new Map<EnvironmentId, EnvironmentCheck>();
  for (const check of observedEnvironment) {
    if (!ids.includes(check.id) || supplied.has(check.id) ||
        !['PASS', 'FAIL', 'PARTIAL', 'UNKNOWN', 'NOT_TESTED'].includes(check.status) ||
        !Array.isArray(check.evidenceRefs) ||
        check.evidenceRefs.some(x => typeof x !== 'string' || !x.trim()) ||
        typeof check.limitation !== 'string' ||
        (check.status === 'PASS' && check.evidenceRefs.length === 0)) {
      throw Error('invalid-environment-evidence');
    }
    supplied.set(check.id, check);
  }
  const environment = ids.map(id => {
    const observed = supplied.get(id);
    return observed ? { ...observed, evidenceRefs: [...observed.evidenceRefs] } :
      { id, status: 'NOT_TESTED' as const, evidenceRefs: [], limitation: 'No independent environment evidence supplied.' };
  });
  const candidates = report.candidates.map((c, index) => ({
    index, evidence: c.evidence, length: c.length, hash: c.hash,
    hashAlgorithm: c.hashAlgorithm, schemaValid: c.schemaValid,
    token: c.token ? structuredClone(c.token) : null,
    receipt: c.receipt, ids: [...c.ids],
    evidenceOnly: true as const, executionAllowed: false as const,
  }));
  // Never emit candidate.raw, declare a selected winner, or imply durability.
  return {
    diagnosticState: report.state,
    disposition: 'HOLD' as const,
    authority: 'NOT_ESTABLISHED' as const,
    executionAllowed: false as const,
    writeAllowed: false as const,
    candidateCount: candidates.length,
    selectedCandidate: null,
    candidates,
    findings: structuredClone(report.findings),
    usedEvidence: [...report.usedEvidence],
    missingEvidence: [...report.missingEvidence],
    knownCausality: [...report.knownCausality],
    unknownCausality: [...report.unknownCausality],
    environment,
    instructions: [
      'Preserve all original branches and evidence outside the affected store.',
      'Keep every unresolved finding, capture gap and historical UNKNOWN.',
      'Seek independent missing evidence; do not rank branches by timestamps or matching hashes.',
      'Any future restore implementation and user authorization require a separate design and review.',
    ],
    limitation: 'This sheet reports bounded synthetic evidence, not proof of authority, full history, durability, or permission to restore.',
  };
}
