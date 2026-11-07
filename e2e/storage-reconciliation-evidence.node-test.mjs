import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateReconciliationEvidence } from './storage-reconciliation-evidence.mjs';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
const original = JSON.parse(readFileSync(new URL('./fixtures/storage-reconciliation-evidence.json', import.meta.url), 'utf8'));
// Structural-validator fixture only. Repeating one real context here is not browser execution evidence.
const good = () => { const e = structuredClone(original); e.matrix = ['chromium', 'webkit'].flatMap(engine => [375,390,765,1280].map(width => ({ ...structuredClone(original.matrix[0]), engine, width }))); return e; };
test('complete evidence positive control', () => assert.deepEqual(validateReconciliationEvidence(good(), { sha: original.provenance.sha, tree: original.provenance.tree }), []));
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

test('missing raw report fails closed', () => { const e = good(); delete e.matrix[0].cases[0].observation.report.evidence; assert.ok(validateReconciliationEvidence(e).length); });
test('candidate hash mutation fails', () => { const e = good(); e.matrix[0].cases[0].observation.report.candidates[0].hash = '0'.repeat(64); assert.ok(validateReconciliationEvidence(e).includes('candidate-integrity')); });
test('erasing failure reasons fails', () => { const e = good(); e.matrix[0].cases[1].observation.report.findings = []; assert.ok(validateReconciliationEvidence(e).includes('missing-case-reason')); });
test('erasing restart observation fails', () => { const e = good(); delete e.matrix[0].cases[12].observation.pageReloadReport; assert.ok(validateReconciliationEvidence(e).includes('restart-evidence-missing')); });

const originMutations = [
 ['missing candidates', e => { e.matrix[0].cases[0].observation.report.candidates = []; }],
 ['invented source causality', e => { Object.assign(e.matrix[0].cases[0].observation.report.candidates[0], { token: { structure: 1, incarnation: 'invented', generation: 4, latestOperation: 'invented' }, receipt: 'invented' }); }],
 ['replacement raw with valid hash', e => { const c = e.matrix[0].cases[0].observation.report.candidates[0]; c.raw += ' '; c.length = c.raw.length; c.hash = createHash('sha256').update(Buffer.from(c.raw, 'utf16le')).digest('hex'); }],
 ['duplicate candidate origin', e => { const c = e.matrix[0].cases.find(c => c.name === 'multiple-branches').observation.report.candidates; c[3] = structuredClone(c[2]); }],
 ['invented inventory', e => { e.matrix[0].cases[0].observation.report.candidates[0].ids = ['notes:invented']; }],
 ['write permission', e => { e.matrix[0].cases[0].observation.report.writeAllowed = true; }],
];
for (const [name, mutate] of originMutations) test('independent regression: ' + name, () => { const e = good(); mutate(e); assert.ok(validateReconciliationEvidence(e).length); });

test('independent regression: schema validity cannot be flipped', () => { const e = good(); e.matrix[0].cases[0].observation.report.candidates[0].schemaValid = false; assert.ok(validateReconciliationEvidence(e).includes('candidate-schema')); });
