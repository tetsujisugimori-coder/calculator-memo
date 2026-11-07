import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { validateReconciliationEvidence } from '../../../../e2e/storage-reconciliation-evidence.mjs';
const source = process.argv[2] || 'gui-evidence/storage-reconciliation-5a042f4b85e6-cf390e26-5ed5-4b46-ad62-df4a922ca544/summary.json';
const e = JSON.parse(readFileSync(source));
const expected = { sha: e.provenance.sha, tree: e.provenance.tree };
const cases = [];
function run(name, mutate, shouldAccept = false) {
 const copy = structuredClone(e); mutate(copy); const failures = validateReconciliationEvidence(copy, expected);
 cases.push({ name, expected: shouldAccept ? 'accept' : 'reject', actual: failures.length ? 'reject' : 'accept', failures, status: Boolean(failures.length) !== shouldAccept ? 'GREEN' : 'RED' });
}
run('positive original native evidence', () => {}, true);
run('R4 delete all source/current candidates', e => { e.matrix[0].cases[0].observation.report.candidates = []; });
run('R4 invent source generation and receipt', e => { Object.assign(e.matrix[0].cases[0].observation.report.candidates[0], { token: { structure: 1, incarnation: 'invented', generation: 1984, latestOperation: 'invented' }, receipt: 'invented' }); });
run('R4 replace candidate raw and recompute hash', e => { const c = e.matrix[0].cases[0].observation.report.candidates[0]; c.raw += ' '; c.length = c.raw.length; c.hash = createHash('sha256').update(Buffer.from(c.raw, 'utf16le')).digest('hex'); });
run('R4 replace same-length candidates with duplicates', e => { const c = e.matrix[0].cases.find(c => c.name === 'multiple-branches').observation.report.candidates; c[3] = structuredClone(c[2]); });
run('R4 fabricate candidate ID inventory', e => { e.matrix[0].cases[0].observation.report.candidates[0].ids = ['notes:never-existed']; });
run('R4 wrong candidate schema validity', e => { e.matrix[0].cases[0].observation.report.candidates[0].schemaValid = false; });
run('old HEAD rejected with current expected SHA', e => { e.provenance.sha = '0'.repeat(40); });
run('R5 report writeAllowed true', e => { e.matrix[0].cases[0].observation.report.writeAllowed = true; });
const report = { source, checkedSHA: expected.sha, cases };
console.log(JSON.stringify(report, null, 2));
if (process.env.OUTPUT) writeFileSync(process.env.OUTPUT, JSON.stringify(report, null, 2) + '\n');
process.exitCode = cases.some(c => c.status === 'RED') ? 1 : 0;
