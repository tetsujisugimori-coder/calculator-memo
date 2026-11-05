import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { validateArchitectureEvidence } from '../../../../e2e/storage-architecture-contract.mjs';
const sha = '1df6f24a1641dca7bff189f68099a4501c79fe60';
const bytes = readFileSync(process.argv[2]), e = JSON.parse(bytes);
assert.equal(e.provenance.sha, sha);
assert.equal(e.provenance.tree, execFileSync('git', ['show', '-s', '--format=%T', sha], { encoding: 'utf8' }).trim());
const source = execFileSync('git', ['show', sha + ':tests/storage-architecture/poc.mjs']);
assert.equal(e.provenance.sourceSha256, createHash('sha256').update(source).digest('hex'));
assert.equal(e.provenance.run, '41999757708'); assert.equal(e.provenance.attempt, '1');
assert.equal(e.provenance.dirty, false); assert.equal(e.status, 'PASS');
assert.deepEqual(validateArchitectureEvidence(e, sha), []);
const result = { sha, tree: e.provenance.tree, run: e.provenance.run, attempt: e.provenance.attempt,
  summarySha256: createHash('sha256').update(bytes).digest('hex'), sourceSha256: e.provenance.sourceSha256,
  scope: 'independent artifact readback; browser execution was performed by CI, not locally by reviewer',
  engines: e.results.map(r => ({ engine: r.engine, version: r.version, status: r.status, cases: r.cases.length, pageerrors: r.pageerrors })),
  status: 'PASS' };
writeFileSync(fileURLToPath(new URL('corrected-native-verification.json', import.meta.url)), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify(result, null, 2));
