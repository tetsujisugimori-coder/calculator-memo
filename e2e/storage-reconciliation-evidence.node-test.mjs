import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CASES, EXPECTED, validateReconciliationEvidence } from './storage-reconciliation-evidence.mjs';
const good = () => ({ kind: 'read-only-reconciliation', status: 'passed', HOLD: true, executionAllowed: false,
  provenance: { dirty: false, sha: 'a'.repeat(40), tree: 'b'.repeat(40), sourceSha256: 'c'.repeat(64), moduleSha256: 'd'.repeat(64) },
  matrix: ['chromium', 'webkit'].flatMap(engine => [375, 390, 765, 1280].map(width => ({ engine, width, status: 'passed', browserVersion: 'test-version', errors: [], png: `${engine}-${width}.png`, pngSha256: 'e'.repeat(64), cases: CASES.map((name, i) => ({ name, status: 'passed', startedAt: '2026-11-07T00:00:00Z', finishedAt: '2026-11-07T00:00:01Z', observation: { executionAllowed: false, before: 'exact raw', after: 'exact raw', mutations: 0, report: { state: EXPECTED[i], HOLD: true, executionAllowed: false, findings: [] } } })) }))) });
test('complete evidence positive control', () => assert.deepEqual(validateReconciliationEvidence(good(), { sha: 'a'.repeat(40), tree: 'b'.repeat(40) }), []));
const mutations = [
 e => { e.matrix = []; }, e => { e.matrix.pop(); }, e => { e.matrix[1] = e.matrix[0]; },
 e => { e.matrix[0].cases = []; }, e => { e.matrix[0].cases.pop(); }, e => { e.matrix[0].cases[1] = e.matrix[0].cases[0]; },
 e => { e.status = 'failed'; }, e => { e.matrix[0].status = 'failed'; }, e => { e.matrix[0].cases[0].status = 'failed'; },
 e => { e.matrix[0].errors = ['pageerror']; }, e => { e.provenance.dirty = true; }, e => { e.provenance.sourceSha256 = ''; },
 e => { e.provenance.tree = ''; }, e => { e.provenance.sha = 'old-head'; }, e => { e.provenance.moduleSha256 = ''; },
 e => { e.matrix[0].pngSha256 = ''; }, e => { e.matrix[0].png = ''; }, e => { e.executionAllowed = true; },
 e => { e.matrix[0].cases[0].observation.mutations = 1; }, e => { e.matrix[0].cases[0].observation.after = 'changed'; },
 e => { e.matrix[0].cases[0].observation = null; }, e => { e.matrix[0].cases[0].observation.report.HOLD = false; },
 e => { e.matrix[0].cases[3].observation.report.state = 'CONSISTENT'; }, e => { e.matrix[0].cases[0].finishedAt = 'invalid'; },
];
mutations.forEach((mutate, i) => test(`reject independent malformed evidence ${i}`, () => { const e = good(); mutate(e); assert.notDeepEqual(validateReconciliationEvidence(e), []); }));
test('reject stale HEAD despite syntactically valid SHA', () => assert.ok(validateReconciliationEvidence(good(), { sha: '0'.repeat(40), tree: 'b'.repeat(40) }).includes('provenance')));
