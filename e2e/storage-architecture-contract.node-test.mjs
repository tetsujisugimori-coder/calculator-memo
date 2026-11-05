import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CASES, validateArchitectureEvidence } from './storage-architecture-contract.mjs';
const fixture = () => ({ provenance: { sha: 'fixed', tree: 'tree', sourceSha256: 'hash' }, executionAllowed: false, HOLD: true,
  results: ['chromium', 'webkit'].map(engine => ({ engine, version: 'pinned', status: 'PASS', pageerrors: [], cases: CASES.map(name => ({ name, status: 'PASS', observation: {} })) })) });
test('complete evidence accepted', () => assert.deepEqual(validateArchitectureEvidence(fixture(), 'fixed'), []));
for (const [name, change] of Object.entries({
  'missing engine': e => e.results.pop(), 'duplicate engine': e => e.results[1].engine = 'chromium',
  'failed engine': e => e.results[0].status = 'FAILED', 'missing case': e => e.results[0].cases.pop(),
  'duplicate case': e => e.results[0].cases[1] = e.results[0].cases[0], 'wrong sha': e => e.provenance.sha = 'old',
  'page error': e => e.results[1].pageerrors.push('error'), 'missing observation': e => delete e.results[0].cases[0].observation,
  'missing version': e => delete e.results[0].version, 'write enabled': e => e.executionAllowed = true,
  'HOLD released': e => e.HOLD = false, 'missing source identity': e => delete e.provenance.sourceSha256,
})) test('reject ' + name, () => { const e = fixture(); change(e); assert.ok(validateArchitectureEvidence(e, 'fixed').length); });
