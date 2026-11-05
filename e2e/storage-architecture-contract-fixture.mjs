// Deliberately separate evidence fixture for positive and mutated negative controls.
import { CASES } from './storage-architecture-contract.mjs';
export const FIXED_SHA = 'a'.repeat(40);
export function fixture() {
  const committed = { status: 'COMMITTED_OBSERVED' }, refused = { status: 'REFUSED', reason: 'stale-token' };
  const receipt = { status: 'COMMIT_RECORD_OBSERVED', generation: 1, acknowledgement: 'UNKNOWN', durability: 'NOT_PROVEN' };
  const observations = [
    { outcomes: [committed, refused], generation: 1 }, refused, refused,
    { lockHeldDuringBypass: true, raw: 'B', safety: 'COUNTEREXAMPLE' },
    { rawComparisonAccepts: true, safety: 'COUNTEREXAMPLE', notification: 'subscriber-absent' },
    { lost: 'B', final: 'C', safety: 'COUNTEREXAMPLE', scheduling: 'explicit-cross-page-boundaries' },
    { status: 'UNKNOWN', reason: 'transaction-aborted', generation: 0, history: 1, copies: 0 },
    { ...receipt, interruption: 'actual-page-close-after-tx-complete-before-ui-ack', browserKill: 'NOT_TESTED' },
    { status: 'UNKNOWN', originalFailure: 'injected-after-complete', receipt },
    { integrity: 'CONSISTENT', receipt },
    ['generation', 'history', 'copy'].map(fault => ({ fault, status: 'UNKNOWN' })),
    { status: 'UNKNOWN', automaticBootstrap: 'REFUSED', virginVsEvicted: 'INDISTINGUISHABLE' },
    { idb: 'NEW', legacy: 'OLD-TAB', safety: 'FORK-REQUIRES-MANUAL-RECONCILIATION' },
    { perTabSequence: [1, 1], restartedSequence: 1, safety: 'COUNTEREXAMPLE' }, [refused, committed],
  ];
  return structuredClone({ provenance: { sha: FIXED_SHA, tree: 'b'.repeat(40), sourceSha256: 'c'.repeat(64), dirty: false,
    node: 'v22.13.0', platform: 'linux', run: 'fixture', attempt: '1' }, executionAllowed: false, HOLD: true,
    results: ['chromium', 'webkit'].map(engine => ({ engine, version: 'pinned', status: 'PASS', pageerrors: [],
      cases: CASES.map((name, i) => ({ name, status: 'PASS', observation: observations[i] })) })) });
}
