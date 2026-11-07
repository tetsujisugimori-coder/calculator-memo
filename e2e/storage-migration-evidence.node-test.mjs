import test from 'node:test';
import assert from 'node:assert/strict';
import { MIGRATION_CASES, validateMigrationEvidence } from './storage-migration-evidence.mjs';
const fixture = () => ({ kind: 'isolated-migration-not-formal-gui', status: 'passed', executionAllowed: false, HOLD: true,
  provenance: { dirty: false, sha: 'a'.repeat(40), tree: 'b'.repeat(40), sourceSha256: 'c'.repeat(64), moduleSha256: 'd'.repeat(64) },
  matrix: ['chromium', 'webkit'].flatMap(engine => [375, 390, 765, 1280].map(width => ({ engine, width, status: 'passed', browserVersion: 'synthetic', errors: [], cases: MIGRATION_CASES.map(name => ({ name, kind: 'synthetic-validator-only', status: 'passed', startedAt: '2026-11-06T00:00:00Z', finishedAt: '2026-11-06T00:00:01Z', observation: {} })) }))),
});
test('complete synthetic manifest accepted, not a browser run', () => assert.deepEqual(validateMigrationEvidence(fixture()), []));
const controls = {
  failedSummary: x => { x.status = 'failed'; },
  dirtySource: x => { x.provenance.dirty = true; },
  nullObservation: x => { x.matrix[0].cases[1].observation = null; },
  invalidTimestamps: x => { x.matrix[0].cases[1].startedAt = 'yesterday'; },
  reversedTimestamps: x => { x.matrix[0].cases[1].finishedAt = '2025-01-01T00:00:00Z'; },
  missingEngine: x => { x.matrix = x.matrix.filter(m => m.engine !== 'webkit'); },
  duplicateCondition: x => { x.matrix[1] = x.matrix[0]; },
  missingCase: x => { x.matrix[0].cases.pop(); },
  duplicateCase: x => { x.matrix[0].cases[1] = x.matrix[0].cases[0]; },
  inventedCase: x => { x.matrix[0].cases[1].name = 'invented'; },
  failedCase: x => { x.matrix[0].cases[1].status = 'failed'; },
  runningCase: x => { x.matrix[0].cases[1].status = 'running'; },
  missingObservation: x => { delete x.matrix[0].cases[1].observation; },
  missingFinished: x => { delete x.matrix[0].cases[1].finishedAt; },
  hiddenError: x => { x.matrix[0].cases[1].error = 'failed'; },
  pageError: x => { x.matrix[0].errors.push('error'); },
  failedCondition: x => { x.matrix[0].status = 'failed'; },
  unknownBrowser: x => { x.matrix[0].browserVersion = ''; },
  wrongSha: x => { x.provenance.sha = ''; },
  missingSource: x => { delete x.provenance.sourceSha256; },
  missingModule: x => { delete x.provenance.moduleSha256; },
  productionPermission: x => { x.executionAllowed = true; },
  unlocked: x => { x.HOLD = false; },
};
for (const [name, mutate] of Object.entries(controls)) test('rejects ' + name, () => { const x = fixture(); mutate(x); assert.ok(validateMigrationEvidence(x).length > 0); });
