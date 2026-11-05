import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CASES, validateArchitectureEvidence } from './storage-architecture-contract.mjs';
import { fixture, FIXED_SHA } from './storage-architecture-contract-fixture.mjs';
test('complete evidence accepted', () => assert.deepEqual(validateArchitectureEvidence(fixture(), FIXED_SHA), []));
for (const [name, change] of Object.entries({
  'missing engine': e => e.results.pop(), 'duplicate engine': e => e.results[1].engine = 'chromium',
  'failed engine': e => e.results[0].status = 'FAILED', 'missing case': e => e.results[0].cases.pop(),
  'duplicate case': e => e.results[0].cases[1] = e.results[0].cases[0], 'wrong sha': e => e.provenance.sha = 'old',
  'page error': e => e.results[1].pageerrors.push('error'), 'missing observation': e => delete e.results[0].cases[0].observation,
  'missing version': e => delete e.results[0].version, 'write enabled': e => e.executionAllowed = true,
  'HOLD released': e => e.HOLD = false, 'missing source identity': e => delete e.provenance.sourceSha256,
  'dirty tree': e => e.provenance.dirty = true, 'failed summary': e => e.status = 'FAIL',
  'two accepted writers': e => e.results[0].cases[0].observation.outcomes[1] = { status: 'COMMITTED_OBSERVED' },
  'abort partially committed': e => e.results[0].cases[6].observation.copies = 1,
  'ack inferred': e => e.results[0].cases[7].observation.acknowledgement = 'SUCCESS',
  'missing corruption fault': e => e.results[0].cases[10].observation.pop(),
  'automatic bootstrap': e => e.results[0].cases[11].observation.automaticBootstrap = 'CREATED',
})) test('reject ' + name, () => { const e = fixture(); change(e); assert.ok(validateArchitectureEvidence(e, FIXED_SHA).length); });
for (const [i, name] of CASES.entries()) test('reject empty observation for ' + name, () => {
  const e = fixture(); e.results[0].cases[i].observation = {}; assert.ok(validateArchitectureEvidence(e, FIXED_SHA).length);
});
