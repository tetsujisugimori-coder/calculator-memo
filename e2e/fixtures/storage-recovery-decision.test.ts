import { describe, it, expect } from 'vitest';
import { reconcileEvidence } from './storage-reconciliation';
import { buildRecoveryDecisionSheet, type ReconciliationReport } from './storage-recovery-decision';

function fixture(): ReconciliationReport {
  // Deliberately a synthetic decision-layer fixture, not a browser or durable-storage result.
  return {
    subject: { source: 'stage3b5-test-review', destination: 'stage3b4-test-review' },
    state: 'CONSISTENT', findings: [], usedEvidence: ['source', 'target', 'journal'],
    missingEvidence: [], knownCausality: [], unknownCausality: [],
    candidates: [{
      evidence: 'source', raw: '{"synthetic":true}', length: 18,
      hash: 'a'.repeat(64), hashAlgorithm: 'SHA-256-UTF16LE',
      ids: [], schemaValid: true, token: null, receipt: null,
      rationale: 'Synthetic reference only', executionAllowed: false,
    }],
    HOLD: true, executionAllowed: false, writeAllowed: false,
    authority: 'NOT_ESTABLISHED',
  } as unknown as ReconciliationReport;
}
describe('Stage 3B-7B decision-only layer', () => {
  it('never authorizes a CONSISTENT observation and leaves environments untested', () => {
    const sheet = buildRecoveryDecisionSheet(fixture());
    expect(sheet).toMatchObject({
      diagnosticState: 'CONSISTENT', disposition: 'HOLD',
      authority: 'NOT_ESTABLISHED', executionAllowed: false,
      writeAllowed: false, selectedCandidate: null, candidateCount: 1,
    });
    expect(sheet.environment).toHaveLength(6);
    expect(sheet.environment.every(x => x.status === 'NOT_TESTED')).toBe(true);
    expect(sheet.candidates[0].executionAllowed).toBe(false);
    expect(JSON.stringify(sheet)).not.toContain('synthetic":true');
    expect('raw' in sheet.candidates[0]).toBe(false);
  });
  it('retains concurrent conflict and UNKNOWN without selecting a branch', () => {
    const x = fixture();
    x.findings = [
      { state: 'CONFLICT', code: 'old-source-diverged', evidence: ['source'] },
      { state: 'UNKNOWN', code: 'historical-intent', evidence: ['target.intent'] },
    ];
    x.state = 'CONFLICT';
    x.missingEvidence = ['completion:target.intent'];
    x.candidates.push({ ...x.candidates[0], evidence: 'journal.rescue:r-old', raw: 'different' });
    const result = buildRecoveryDecisionSheet(x);
    expect(result.findings.map(f => f.state)).toEqual(['CONFLICT', 'UNKNOWN']);
    expect(result.missingEvidence).toContain('completion:target.intent');
    expect(result.candidateCount).toBe(2);
    expect(result.selectedCandidate).toBeNull();
    expect(result.candidates.map(c => c.evidence)).toEqual(['source', 'journal.rescue:r-old']);
  });
  it('retains CORRUPTED, BLOCKED and UNKNOWN findings simultaneously', () => {
    const x = fixture();
    x.state = 'CORRUPTED';
    x.findings = [
      { state: 'BLOCKED', code: 'persistent-hold', evidence: ['target'] },
      { state: 'CORRUPTED', code: 'invalid-raw', evidence: ['source'] },
      { state: 'UNKNOWN', code: 'not-observed', evidence: ['journal'] },
    ];
    expect(buildRecoveryDecisionSheet(x).findings).toHaveLength(3);
  });
  it('fails closed if report claims write or execution permissions', () => {
    for (const key of ['executionAllowed', 'writeAllowed', 'HOLD', 'authority'] as const) {
      const x = fixture() as unknown as Record<string, unknown>;
      x[key] = key === 'authority' ? 'ESTABLISHED' : true;
      if (key === 'HOLD') x[key] = false;
      expect(() => buildRecoveryDecisionSheet(x as ReconciliationReport)).toThrow();
    }
  });
  it('rejects a summary that hides UNKNOWN findings', () => {
    const x = fixture();
    x.findings = [{ state: 'UNKNOWN', code: 'unavailable', evidence: ['source'] }];
    expect(() => buildRecoveryDecisionSheet(x)).toThrow('inconsistent-diagnostic-state');
  });
  it('rejects executable candidate and production scope', () => {
    const a = fixture();
    (a.candidates[0] as { executionAllowed: boolean }).executionAllowed = true;
    expect(() => buildRecoveryDecisionSheet(a)).toThrow();
    const b = fixture();
    b.subject.source = 'production-user-data';
    expect(() => buildRecoveryDecisionSheet(b)).toThrow('synthetic-namespace-required');
  });
  it('refuses unsubstantiated environment PASS and duplicate tracks', () => {
    const blank = { id: 'A1' as const, status: 'PASS' as const, evidenceRefs: [], limitation: '' };
    expect(() => buildRecoveryDecisionSheet(fixture(), [blank])).toThrow('invalid-environment-evidence');
    const recorded = { ...blank, evidenceRefs: ['independent-physical-test:ref'], limitation: 'Only tested device and session' };
    expect(() => buildRecoveryDecisionSheet(fixture(), [recorded, recorded])).toThrow('invalid-environment-evidence');
    expect(buildRecoveryDecisionSheet(fixture(), [recorded]).environment[0].status).toBe('PASS');
    expect(buildRecoveryDecisionSheet(fixture(), [recorded]).environment[1].status).toBe('NOT_TESTED');
  });
});

describe('integration with the actual Stage 3B-6 reconciler', () => {
  it('keeps all real synthetic candidate origins, without copying raw or granting execution', async () => {
    const raw = JSON.stringify({ version: 1, history: [], notes: [], settings: { theme: 'light', activePanel: 'history' } });
    const token = { structure: 1, incarnation: 'review', generation: 0, latestOperation: 'genesis' };
    const snapshot = { head: { ...token, protocol: 1, legacyRaw: raw }, current: raw,
      control: { protocol: 1, state: 'CLEAR' },
      'receipt:genesis': { protocol: 1, token, previous: null, raw } };
    const report = await reconcileEvidence({
      scope: { source: 'stage3b5-test-review', destination: 'stage3b4-test-review' },
      capture: { source: { kind: 'present', value: raw }, target: { kind: 'present', value: snapshot }, journal: { kind: 'present', value: {} } },
    });
    expect(report.state).toBe('CONSISTENT');
    const sheet = buildRecoveryDecisionSheet(report);
    expect(sheet.candidates.map(x => x.evidence)).toEqual(report.candidates.map(x => x.evidence));
    expect(sheet.candidateCount).toBe(2);
    expect(sheet.selectedCandidate).toBeNull();
    expect(sheet.executionAllowed).toBe(false);
    expect(JSON.stringify(sheet)).not.toContain(raw);
  });
});
