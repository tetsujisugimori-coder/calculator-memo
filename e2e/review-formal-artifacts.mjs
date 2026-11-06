// Independently authored artifact audit. Does not import the formal collector or its oracle.
// This checks original files and provenance; it is not a second browser execution or visual judgment.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdir, readFile, mkdir, writeFile, lstat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';

// Fixed regression contract, independently transcribed from the accepted six conditions.
const CONDITIONS = [
  { id: 'chromium-desktop-1365px', engine: 'chromium', width: 1365, height: 1000, isMobile: false, hasTouch: false, deviceScaleFactor: 1, checks: 188, geometry: 100 },
  { id: 'chromium-narrow-390px', engine: 'chromium', width: 390, height: 1000, isMobile: false, hasTouch: false, deviceScaleFactor: 1, checks: 187, geometry: 98 },
  { id: 'chromium-mobile-390px', engine: 'chromium', width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 3, checks: 188, geometry: 98 },
  { id: 'chromium-mobile-375px', engine: 'chromium', width: 375, height: 667, isMobile: true, hasTouch: true, deviceScaleFactor: 2, checks: 188, geometry: 98 },
  { id: 'webkit-mobile-390px', engine: 'webkit', width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 3, checks: 188, geometry: 98 },
  { id: 'webkit-mobile-375px', engine: 'webkit', width: 375, height: 667, isMobile: true, hasTouch: true, deviceScaleFactor: 2, checks: 189, geometry: 100 },
];
const PNG_SUFFIXES = [
  'header', 'guide', 'formula-library-controls', 'basic-math-domain-error', 'variables-dark-result-stress',
  'reference-dark-enlarged-picker', 'default-id-unrelated-rollback', 'diagnostics-independent-causes',
  'diagnostics-dark-enlarged', 'graph-selected-card', 'graph-error-detail', 'graph-dark-enlarged-selection',
  'graph-limit-fallback', 'graph-trial-comparison', 'trial-success', 'trial-failure', 'trial-dark-enlarged-delta',
  'protected-dark-large-text', 'normal-memos-after-repair', 'comparison-material-preview', 'comparison-source-detail', 'audit-roundtrip-target',
];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const canonical = value => JSON.stringify(value);
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let value = n;
  for (let bit = 0; bit < 8; bit++) value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});
function crc32(bytes) {
  let value = 0xffffffff;
  for (const byte of bytes) value = crcTable[(value ^ byte) & 255] ^ (value >>> 8);
  return (value ^ 0xffffffff) >>> 0;
}
export function inspectPng(bytes, expectedWidth) {
  assert.ok(bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), 'PNG signature');
  let offset = 8, header, ended = false;
  const compressed = [];
  while (offset < bytes.length) {
    assert.ok(offset + 12 <= bytes.length, 'PNG chunk header/trailer truncated');
    const length = bytes.readUInt32BE(offset), end = offset + 12 + length;
    assert.ok(end <= bytes.length, 'PNG chunk data truncated');
    const kind = bytes.toString('ascii', offset + 4, offset + 8), payload = bytes.subarray(offset + 8, offset + 8 + length);
    assert.equal(crc32(bytes.subarray(offset + 4, offset + 8 + length)), bytes.readUInt32BE(offset + 8 + length), 'PNG chunk CRC: ' + kind);
    if (!header) {
      assert.equal(kind, 'IHDR', 'PNG first chunk must be IHDR'); assert.equal(length, 13);
      header = { width: payload.readUInt32BE(0), height: payload.readUInt32BE(4), bitDepth: payload[8], colorType: payload[9], interlace: payload[12] };
      assert.equal(header.width, expectedWidth, 'PNG pixel width must match condition width times device scale');
      assert.ok(header.height > 0 && header.height <= 100_000, 'PNG height must be positive and bounded');
      const depths = { 0: [1, 2, 4, 8, 16], 2: [8, 16], 3: [1, 2, 4, 8], 4: [8, 16], 6: [8, 16] };
      assert.ok(depths[header.colorType]?.includes(header.bitDepth), 'PNG depth/color combination');
      assert.equal(payload[10], 0, 'PNG compression'); assert.equal(payload[11], 0, 'PNG filter method');
      assert.ok([0, 1].includes(header.interlace), 'PNG interlace method');
    } else assert.notEqual(kind, 'IHDR', 'duplicate PNG header');
    if (kind === 'IDAT') compressed.push(payload);
    if (kind === 'IEND') { assert.equal(length, 0); assert.equal(end, bytes.length, 'no data after PNG end'); ended = true; }
    offset = end;
  }
  assert.ok(header && ended && compressed.length, 'PNG must contain image data and end');
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[header.colorType];
  const passes = header.interlace ? [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]] : [[0, 0, 1, 1]];
  const rows = [];
  for (const [x, y, dx, dy] of passes) {
    const width = Math.max(0, Math.ceil((header.width - x) / dx)), height = Math.max(0, Math.ceil((header.height - y) / dy));
    if (width && height) rows.push({ height, rowBytes: Math.ceil(width * channels * header.bitDepth / 8) + 1 });
  }
  const expectedBytes = rows.reduce((sum, p) => sum + p.height * p.rowBytes, 0);
  assert.ok(expectedBytes <= 512 * 1024 * 1024, 'PNG inflated-size bound');
  const decoded = inflateSync(Buffer.concat(compressed), { maxOutputLength: expectedBytes + 1 });
  assert.equal(decoded.length, expectedBytes, 'PNG complete decoded scanlines');
  let cursor = 0;
  for (const pass of rows) for (let row = 0; row < pass.height; row++) {
    assert.ok(decoded[cursor] <= 4, 'PNG scanline filter'); cursor += pass.rowBytes;
  }
  return header;
}
async function jsonFile(path) { return JSON.parse(await readFile(path, 'utf8')); }
async function regularInventory(root, prefix = '') {
  const files = [];
  for (const name of (await readdir(join(root, prefix))).sort()) {
    const relative = prefix ? prefix + '/' + name : name, full = join(root, relative), stat = await lstat(full);
    assert.equal(stat.isSymbolicLink(), false, 'no artifact symlinks');
    if (stat.isDirectory()) files.push(...await regularInventory(root, relative));
    else { assert.ok(stat.isFile(), 'regular artifact file'); const bytes = await readFile(full); files.push({ path: relative, bytes: bytes.length, sha256: hash(bytes) }); }
  }
  return files;
}
function identity(value, expected, label) {
  assert.equal(value.sha, expected.sha, label + ' SHA'); assert.equal(String(value.run), expected.run, label + ' run');
  assert.equal(String(value.attempt), expected.attempt, label + ' attempt');
  if (value.tree !== undefined) assert.equal(value.tree, expected.tree, label + ' tree');
}
export async function auditFormalArtifacts(root, officialFile, expected) {
  assert.match(expected.sha, /^[a-f0-9]{40}$/); assert.match(expected.tree, /^[a-f0-9]{40}$/);
  assert.ok(expected.run && expected.attempt, 'run and attempt required');
  for (const name of ['checksResult', 'matrixResult', 'aggregateResult']) assert.equal(expected[name], 'success', 'prerequisite ' + name);
  const prefix = `formal-gui-${expected.sha}-${expected.attempt}-`;
  const entries = await readdir(root, { withFileTypes: true });
  assert.ok(entries.every(e => e.isDirectory() && !e.isSymbolicLink()), 'only original artifact directories');
  assert.deepEqual(entries.map(e => e.name).sort(), CONDITIONS.map(c => prefix + c.id).sort(), 'exact six original artifact folders');
  const manifest = { kind: 'independent-original-formal-artifact-audit', status: 'passed', sha: expected.sha, tree: expected.tree,
    run: expected.run, attempt: expected.attempt, treeAttribution: 'derived from independently checked exact PR HEAD; original workers do not record a tree field',
    limitations: ['No second browser execution', 'PNG structural/decompression inspection, not human pixel review', 'Same-run artifacts and workflow code remain reviewable, not tamper-proof attestation'], conditions: [] };
  for (const condition of CONDITIONS) {
    const folder = join(root, prefix + condition.id), worker = join(folder, condition.id);
    const single = await jsonFile(join(folder, 'single-ci-outcomes.json')), record = await jsonFile(join(worker, 'provenance.json'));
    const stage = await jsonFile(join(folder, 'ci-outcomes.json'));
    identity(single, expected, 'single'); identity(record, expected, 'provenance'); identity(record.servedIdentity, expected, 'served'); identity(stage, expected, 'stage');
    assert.equal(single.id, condition.id); assert.equal(single.expectedSha, expected.sha);
    assert.equal(stage.scenario, condition.id); assert.equal(single.status, 'passed'); assert.equal(record.status, 'passed');
    assert.equal(single.child.code, 0); assert.equal(single.child.signal, null); assert.equal(single.logError, null);
    assert.equal(record.expectedSha, expected.sha); assert.equal(record.servedIdentity.branch, record.branch);
    assert.ok(typeof record.branch === 'string' && record.branch.length > 0);
    assert.equal(record.syntheticDataOnly, true); assert.equal(record.productionDeployed, false); assert.deepEqual(record.errors, []);
    assert.ok(Object.keys(stage.steps).length > 0);
    assert.ok(Object.values(stage.steps).every(s => s.outcome === 'success'), 'every original setup/browser/GUI stage must pass');
    assert.equal(record.scenarios.length, 1);
    const observed = record.scenarios[0];
    for (const key of ['id', 'engine', 'width', 'height', 'isMobile', 'hasTouch', 'deviceScaleFactor']) assert.equal(observed[key], condition[key], 'original condition ' + key);
    assert.equal(observed.status, 'passed'); assert.ok(typeof observed.browserVersion === 'string' && observed.browserVersion.length > 0);
    if (condition.hasTouch) assert.equal(observed.touchActivations, 1344);
    assert.equal(record.checks.length, condition.checks); assert.equal(new Set(record.checks).size, condition.checks);
    assert.ok(record.checks.every(x => typeof x === 'string' && x.startsWith(condition.id + ': ')));
    assert.equal(record.screenshotCheckpoints.length, condition.geometry);
    assert.equal(new Set(record.screenshotCheckpoints.map(c => c.name)).size, condition.geometry);
    assert.ok(record.screenshotCheckpoints.every(c => c.horizontalFit === 'passed'));
    const images = (await readdir(worker)).filter(name => name.endsWith('.png')).sort();
    const expectedNames = PNG_SUFFIXES.map(suffix => condition.id + '-' + suffix + '.png').sort();
    assert.deepEqual(images, expectedNames, 'all 22 original named screenshots'); assert.equal(single.pngCount, 22);
    assert.deepEqual(record.screenshotCheckpoints.filter(c => c.retained).map(c => c.name + '.png').sort(), expectedNames, 'retained checkpoints match original PNGs');
    const pngs = [];
    for (const name of images) {
      const bytes = await readFile(join(worker, name)), dimensions = inspectPng(bytes, condition.width * condition.deviceScaleFactor);
      pngs.push({ name, bytes: bytes.length, sha256: hash(bytes), ...dimensions });
    }
    const files = await regularInventory(folder);
    const declaredInventory = await jsonFile(join(folder, 'inventory.json'));
    const kind = path => path.endsWith('.png') ? 'png' : path.endsWith('.zip') ? 'trace' : path.endsWith('.log') ? 'log' : path.endsWith('.json') ? 'json' : 'other';
    const inventoried = files.filter(f => f.path.split('/').at(-1) !== 'inventory.json').map(f => ({ path: f.path, bytes: f.bytes, kind: kind(f.path) }));
    const sortFiles = list => [...list].sort((a, b) => a.path.localeCompare(b.path));
    assert.deepEqual(sortFiles(declaredInventory.files), sortFiles(inventoried), 'original uploaded inventory path/size/kind mismatch');
    assert.equal(declaredInventory.totalBytes, inventoried.reduce((n, f) => n + f.bytes, 0), 'original inventory byte total');
    const kindTotals = {};
    for (const file of inventoried) { kindTotals[file.kind] ||= { count: 0, bytes: 0 }; kindTotals[file.kind].count++; kindTotals[file.kind].bytes += file.bytes; }
    assert.deepEqual(declaredInventory.totals, kindTotals, 'original inventory category totals');
    manifest.conditions.push({ id: condition.id, browserVersion: observed.browserVersion, checks: record.checks.length, geometry: record.screenshotCheckpoints.length,
      pngCount: pngs.length, pngs, files, inventorySha256: hash(canonical(files)), provenanceSha256: hash(await readFile(join(worker, 'provenance.json'))) });
  }
  const totals = { contexts: manifest.conditions.length, checks: manifest.conditions.reduce((n, c) => n + c.checks, 0),
    horizontalCheckpoints: manifest.conditions.reduce((n, c) => n + c.geometry, 0), pngs: manifest.conditions.reduce((n, c) => n + c.pngCount, 0) };
  assert.deepEqual(totals, { contexts: 6, checks: 1128, horizontalCheckpoints: 592, pngs: 132 });
  const officialBytes = await readFile(officialFile), official = JSON.parse(officialBytes);
  identity(official, expected, 'official aggregate'); assert.equal(official.status, 'passed'); assert.equal(official.mode, 'six-independent-jobs');
  assert.deepEqual(official.coverage, { contexts: totals.contexts, checks: totals.checks, horizontalCheckpoints: totals.horizontalCheckpoints });
  assert.equal(official.pngs, totals.pngs); assert.equal(official.workers.length, 6);
  assert.equal(new Set(official.workers.map(w => w.id)).size, 6);
  for (const own of manifest.conditions) {
    const reported = official.workers.find(w => w.id === own.id); assert.ok(reported, 'official worker must exist');
    assert.equal(reported.status, 'passed'); assert.equal(reported.checks, own.checks); assert.equal(reported.geometry, own.geometry); assert.equal(reported.png, own.pngCount);
  }
  manifest.totals = totals; manifest.officialAggregate = { sha256: hash(officialBytes), status: official.status };
  manifest.originalsInventorySha256 = hash(canonical(manifest.conditions.map(c => ({ id: c.id, inventorySha256: c.inventorySha256 }))));
  return manifest;
}

async function main() {
  const out = 'formal-independent-audit'; await mkdir(out, { recursive: true });
  const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
  let result;
  try {
    const sha = git('rev-parse', 'HEAD'), tree = git('rev-parse', 'HEAD^{tree}');
    assert.equal(sha, process.env.EXPECTED_SHA, 'review checkout must be exact PR head');
    const expected = { sha, tree, run: process.env.GITHUB_RUN_ID, attempt: process.env.GITHUB_RUN_ATTEMPT,
      checksResult: process.env.CHECKS_JOB_RESULT, matrixResult: process.env.MATRIX_JOB_RESULT, aggregateResult: process.env.AGGREGATE_JOB_RESULT };
    result = await auditFormalArtifacts(process.argv[2] || 'formal-review-originals', process.argv[3] || 'formal-review-official/result.json', expected);
    result.recordedAt = new Date().toISOString(); result.auditorSourceSha256 = hash(await readFile(fileURLToPath(import.meta.url)));
    result.manifestSha256 = hash(canonical(result));
    console.log(JSON.stringify({ status: result.status, sha, tree, run: expected.run, attempt: expected.attempt, totals: result.totals,
      originalsInventorySha256: result.originalsInventorySha256, conditions: result.conditions.map(c => ({ id: c.id, checks: c.checks, geometry: c.geometry, pngs: c.pngCount, inventorySha256: c.inventorySha256 })) }, null, 2));
    for (const condition of result.conditions) for (const png of condition.pngs) console.log(JSON.stringify({ condition: condition.id,
      png: png.name, sha256: png.sha256, width: png.width, height: png.height }));
    console.log('All original PNG names, dimensions and SHA256 values are preserved in manifest.json.');
  } catch (error) { result = { status: 'failed', sha: process.env.EXPECTED_SHA, run: process.env.GITHUB_RUN_ID, attempt: process.env.GITHUB_RUN_ATTEMPT, error: error.stack || String(error) }; process.exitCode = 1; console.error(error); }
  await writeFile(join(out, 'manifest.json'), JSON.stringify(result, null, 2) + '\n');
  if (process.env.GITHUB_STEP_SUMMARY) await writeFile(process.env.GITHUB_STEP_SUMMARY,
    `## Independent original artifact audit\n\nResult: **${result.status}**; SHA: ${result.sha}; run/attempt: ${result.run}/${result.attempt}.\n\nOriginal files independently inspected: ${result.totals?.contexts ?? 'UNKNOWN'}/6 contexts, ${result.totals?.checks ?? 'UNKNOWN'}/1128 checks, ${result.totals?.horizontalCheckpoints ?? 'UNKNOWN'}/592 geometry, ${result.totals?.pngs ?? 'UNKNOWN'}/132 PNG. Full per-file SHA256 manifest is in the audit artifact. This is an artifact audit, not a new browser execution or human image review.\n`, { flag: 'a' });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
