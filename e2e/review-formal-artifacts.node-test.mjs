// Synthetic artifact controls only: these do not execute or certify real GUI conditions.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, mkdir, readFile, writeFile, readdir, rm, unlink, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { deflateSync } from 'node:zlib';
import { auditFormalArtifacts, inspectPng } from './review-formal-artifacts.mjs';
const expected = { sha: 'a'.repeat(40), tree: 'b'.repeat(40), run: 'synthetic-7', attempt: '1', checksResult: 'success', matrixResult: 'success', aggregateResult: 'success' };
const conditions = [
  ['chromium-desktop-1365px', 'chromium', 1365, 1000, false, false, 1, 188, 100],
  ['chromium-narrow-390px', 'chromium', 390, 1000, false, false, 1, 187, 98],
  ['chromium-mobile-390px', 'chromium', 390, 844, true, true, 3, 188, 98],
  ['chromium-mobile-375px', 'chromium', 375, 667, true, true, 2, 188, 98],
  ['webkit-mobile-390px', 'webkit', 390, 844, true, true, 3, 188, 98],
  ['webkit-mobile-375px', 'webkit', 375, 667, true, true, 2, 189, 100],
].map(([id, engine, width, height, isMobile, hasTouch, deviceScaleFactor, checks, geometry]) => ({ id, engine, width, height, isMobile, hasTouch, deviceScaleFactor, checks, geometry }));
const suffixes = ['header', 'guide', 'formula-library-controls', 'basic-math-domain-error', 'variables-dark-result-stress', 'reference-dark-enlarged-picker', 'default-id-unrelated-rollback', 'diagnostics-independent-causes', 'diagnostics-dark-enlarged', 'graph-selected-card', 'graph-error-detail', 'graph-dark-enlarged-selection', 'graph-limit-fallback', 'graph-trial-comparison', 'trial-success', 'trial-failure', 'trial-dark-enlarged-delta', 'protected-dark-large-text', 'normal-memos-after-repair', 'comparison-material-preview', 'comparison-source-detail', 'audit-roundtrip-target'];
function crc(bytes) {
  let value = -1;
  for (const byte of bytes) { value ^= byte; for (let n = 0; n < 8; n++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1; }
  return (value ^ -1) >>> 0;
}
function png(width) {
  const chunk = (type, payload) => { const size = Buffer.alloc(4), body = Buffer.concat([Buffer.from(type), payload]), checksum = Buffer.alloc(4); size.writeUInt32BE(payload.length); checksum.writeUInt32BE(crc(body)); return Buffer.concat([size, body, checksum]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width); ihdr.writeUInt32BE(1, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(Buffer.alloc(width * 3 + 1))), chunk('IEND', Buffer.alloc(0))]);
}
async function change(path, fn) { const value = JSON.parse(await readFile(path, 'utf8')); fn(value); await writeFile(path, JSON.stringify(value)); }
const kind = path => path.endsWith('.png') ? 'png' : path.endsWith('.json') ? 'json' : 'other';
async function inventory(folder) {
  const files = [];
  const walk = async (prefix = '') => { for (const entry of await readdir(join(folder, prefix), { withFileTypes: true })) {
    const path = prefix ? prefix + '/' + entry.name : entry.name;
    if (entry.isDirectory()) await walk(path);
    else if (entry.name !== 'inventory.json') files.push({ path, bytes: (await readFile(join(folder, path))).length, kind: kind(path) });
  } };
  await walk(); const totals = {}; for (const f of files) { totals[f.kind] ||= { count: 0, bytes: 0 }; totals[f.kind].count++; totals[f.kind].bytes += f.bytes; }
  await writeFile(join(folder, 'inventory.json'), JSON.stringify({ files, totals, totalBytes: files.reduce((n, f) => n + f.bytes, 0) }));
}
async function fixture(action) {
  const temp = await mkdtemp(join(tmpdir(), 'formal-independent-test-')), root = join(temp, 'originals'), official = join(temp, 'official.json');
  await mkdir(root); const workers = [];
  try {
    for (const c of conditions) {
      const folder = join(root, `formal-gui-${expected.sha}-1-${c.id}`), worker = join(folder, c.id); await mkdir(worker, { recursive: true });
      const record = { ...expected, expectedSha: expected.sha, status: 'passed', branch: 'synthetic', servedIdentity: { ...expected, branch: 'synthetic' }, syntheticDataOnly: true, productionDeployed: false, errors: [],
        scenarios: [{ ...c, status: 'passed', browserVersion: 'synthetic-not-native', ...(c.hasTouch ? { touchActivations: 1344 } : {}) }],
        checks: Array.from({ length: c.checks }, (_, n) => c.id + ': synthetic check ' + n),
        screenshotCheckpoints: Array.from({ length: c.geometry }, (_, n) => ({ name: c.id + '-' + (suffixes[n] || 'geometry-' + n), retained: n < 22, horizontalFit: 'passed' })) };
      await writeFile(join(worker, 'provenance.json'), JSON.stringify(record));
      await writeFile(join(folder, 'single-ci-outcomes.json'), JSON.stringify({ ...expected, expectedSha: expected.sha, id: c.id, status: 'passed', child: { code: 0, signal: null }, logError: null, pngCount: 22 }));
      await writeFile(join(folder, 'ci-outcomes.json'), JSON.stringify({ ...expected, scenario: c.id, steps: { gui: { outcome: 'success' } } }));
      for (const suffix of suffixes) await writeFile(join(worker, `${c.id}-${suffix}.png`), png(c.width * c.deviceScaleFactor));
      await inventory(folder); workers.push({ id: c.id, status: 'passed', checks: c.checks, geometry: c.geometry, png: 22 });
    }
    await writeFile(official, JSON.stringify({ ...expected, status: 'passed', mode: 'six-independent-jobs', coverage: { contexts: 6, checks: 1128, horizontalCheckpoints: 592 }, pngs: 132, workers }));
    const folder = join(root, `formal-gui-${expected.sha}-1-${conditions[0].id}`), worker = join(folder, conditions[0].id);
    await action({ root, official, folder, worker, provenance: join(worker, 'provenance.json'), outcome: join(folder, 'single-ci-outcomes.json'), image: join(worker, conditions[0].id + '-header.png'), audit: (options = expected) => auditFormalArtifacts(root, official, options) });
  } finally { await rm(temp, { recursive: true, force: true }); }
}
test('synthetic full originals produce 6/1128/592/132 and per-file SHA manifest', async () => fixture(async f => {
  const result = await f.audit(); assert.deepEqual(result.totals, { contexts: 6, checks: 1128, horizontalCheckpoints: 592, pngs: 132 });
  assert.equal(result.conditions.length, 6); assert.equal(result.conditions.flatMap(c => c.pngs).length, 132);
  assert.ok(result.conditions.every(c => /^[a-f0-9]{64}$/.test(c.inventorySha256) && c.pngs.every(p => /^[a-f0-9]{64}$/.test(p.sha256))));
}));
const mutations = [
  ['missing original condition', f => rm(f.folder, { recursive: true }), /exact six/],
  ['duplicate/unexpected condition folder', f => mkdir(join(f.root, 'duplicate')), /exact six/],
  ['stale artifact folder', f => rename(f.folder, f.folder.replace(expected.sha, 'c'.repeat(40))), /exact six/],
  ['missing original provenance', f => unlink(f.provenance), /ENOENT/],
  ['mutated record SHA', f => change(f.provenance, r => { r.sha = 'c'.repeat(40); }), /SHA/],
  ['mutated record tree', f => change(f.provenance, r => { r.tree = 'c'.repeat(40); }), /tree/],
  ['stale run', f => change(f.outcome, r => { r.run = 'other-run'; }), /run/],
  ['stale attempt', f => change(f.provenance, r => { r.attempt = '2'; }), /attempt/],
  ['failed browser outcome', f => change(f.outcome, r => { r.child.code = 1; }), /1 !== 0/],
  ['duplicate check', f => change(f.provenance, r => { r.checks[1] = r.checks[0]; }), /187 !== 188/],
  ['reduced check count', f => change(f.provenance, r => { r.checks.pop(); }), /187 !== 188/],
  ['reduced geometry count', f => change(f.provenance, r => { r.screenshotCheckpoints.pop(); }), /99 !== 100/],
  ['wrong condition identity', f => change(f.provenance, r => { r.scenarios[0].id = conditions[1].id; }), /original condition/],
  ['missing named PNG', f => unlink(f.image), /22 original named/],
  ['fake PNG bytes', f => writeFile(f.image, 'fake PNG'), /PNG signature/],
  ['CRC corrupted PNG', async f => { const bytes = await readFile(f.image); bytes[20] ^= 1; await writeFile(f.image, bytes); }, /CRC/],
  ['wrong PNG dimensions', f => writeFile(f.image, png(1)), /pixel width/],
  ['official aggregate mismatch', f => change(f.official, r => { r.coverage.checks = 1127; }), /1127/],
  ['original inventory mismatch', f => change(join(f.folder, 'inventory.json'), r => { r.files[0].bytes++; }), /inventory path\/size\/kind mismatch/],
];
for (const [name, mutate, expectedError] of mutations) test('reject synthetic ' + name, async () => fixture(async f => { await mutate(f); await assert.rejects(f.audit(), expectedError); }));
test('PNG truncated bytes are rejected', () => { const bytes = png(1); assert.throws(() => inspectPng(bytes.subarray(0, bytes.length - 1), 1), /truncated/); });
test('failed prerequisites remain failed despite complete synthetic files', async () => fixture(async f => {
  for (const key of ['checksResult', 'matrixResult', 'aggregateResult']) await assert.rejects(f.audit({ ...expected, [key]: 'failure' }), /prerequisite/);
}));
