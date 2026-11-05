// Independent artifact mutation sweep. Input is an actual archived CI summary.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { validateArchitectureEvidence } from '../../../../e2e/storage-architecture-contract.mjs';

const target = fileURLToPath(new URL('.', import.meta.url));
const evidence = readFileSync(process.argv[2]);
const input = JSON.parse(evidence);
const sha = input.provenance.sha;
const reviewedHead = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const currentContract = readFileSync('e2e/storage-architecture-contract.mjs');
assert.deepEqual(validateArchitectureEvidence(input, sha), [], 'actual CI evidence must remain a healthy positive');
const rejected = [];
const mustReject = (label, change) => {
  const e = structuredClone(input); change(e);
  const errors = validateArchitectureEvidence(e, sha);
  assert.ok(errors.length, label); rejected.push({ label, errors });
};
function leafPaths(value, path = []) {
  if (value !== null && typeof value === 'object') return Object.keys(value).flatMap(k => leafPaths(value[k], [...path, k]));
  return [path];
}
for (let engine = 0; engine < input.results.length; engine++) {
  for (let i = 0; i < input.results[engine].cases.length; i++) {
    const name = input.results[engine].cases[i].name;
    mustReject(`${engine}/${name}/empty-observation`, e => e.results[engine].cases[i].observation = {});
    mustReject(`${engine}/${name}/missing-observation`, e => delete e.results[engine].cases[i].observation);
    for (const path of leafPaths(input.results[engine].cases[i].observation)) {
      mustReject(`${engine}/${name}/${path.join('.')}/null`, e => {
        let pointer = e.results[engine].cases[i].observation;
        for (const key of path.slice(0, -1)) pointer = pointer[key];
        pointer[path.at(-1)] = null;
      });
    }
  }
}
for (const key of ['sha', 'tree', 'sourceSha256', 'dirty', 'node', 'platform', 'run', 'attempt']) {
  mustReject('provenance/' + key, e => delete e.provenance[key]);
}
mustReject('dirty=true', e => e.provenance.dirty = true);
mustReject('wrong-summary-status', e => e.status = 'FAIL');
mustReject('engine-error-contradicts-PASS', e => e.results[0].error = 'failed');
mustReject('duplicate-engine', e => e.results[1].engine = e.results[0].engine);
mustReject('write-enabled', e => e.executionAllowed = true);
mustReject('HOLD-released', e => e.HOLD = false);

// Same real positive fixture + exact one corruption, against old and new validators.
const negative = structuredClone(input);
negative.results[0].cases[0].observation.outcomes = [{ status: 'COMMITTED_OBSERVED' }, { status: 'COMMITTED_OBSERVED' }];
const oldSource = execFileSync('git', ['show', '525c383efbb0251fe097431ca68c6674f1c70224:e2e/storage-architecture-contract.mjs']);
const old = await import('data:text/javascript;base64,' + oldSource.toString('base64'));
assert.deepEqual(old.validateArchitectureEvidence(negative, sha), [], 'old validator counterexample must reproduce');
const fixedErrors = validateArchitectureEvidence(negative, sha);
assert.ok(fixedErrors.includes('chromium oracle same-generation-two-tabs'));
writeFileSync(target + 'same-input-oracle-negative.json', JSON.stringify(negative, null, 2) + '\n');
const result = { reviewedHead, node: process.version, platform: process.platform,
  evidence: { sha, tree: input.provenance.tree, run: input.provenance.run, attempt: input.provenance.attempt,
    sha256: createHash('sha256').update(evidence).digest('hex'), engines: input.results.map(r => ({ engine: r.engine, version: r.version, cases: r.cases.length })) },
  contractSha256: createHash('sha256').update(currentContract).digest('hex'),
  actualEvidencePositive: 'PASS', sameInputOld: 'INCORRECTLY_ACCEPTED', sameInputNew: fixedErrors,
  mutationsRejected: rejected.length, rejected, status: 'PASS' };
writeFileSync(target + 'oracle-recheck-result.json', JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ ...result, rejected: undefined }, null, 2));
