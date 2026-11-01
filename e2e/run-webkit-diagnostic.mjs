// Finite diagnostic: first full-prefix WK390; focused controls are a separate job.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { diagnosticSource } from './webkit-diagnostic-source.mjs';
import { runChild } from './diagnostic-supervisor.mjs';

const codeRoot = fileURLToPath(new URL('../', import.meta.url));
const app = resolve(process.env.WK_APP_ROOT || '.');
const output = resolve(process.env.GUI_EVIDENCE_DIR || 'gui-evidence/webkit-diagnostic');
const focused = process.env.WK_FOCUSED === '1';
const scenario = process.env.E2E_SCENARIO || 'webkit-mobile-390px';
const git = (...args) => execFileSync('git', args, { cwd: app, encoding: 'utf8' }).trim();
await mkdir(output, { recursive: true });
const sha = git('rev-parse', 'HEAD');
assert.match(sha, /^[0-9a-f]{40}$/);
if (process.env.EXPECTED_SHA) assert.equal(sha, process.env.EXPECTED_SHA);
const diagnosticFiles = ['run-webkit-diagnostic.mjs', 'webkit-diagnostic-source.mjs', 'webkit-diagnostic-observer.mjs'];
const diagnosticSources = {};
await mkdir(join(output, 'diagnostic-source'), { recursive: true });
for (const name of diagnosticFiles) {
  const bytes = await readFile(join(codeRoot, 'e2e', name));
  await writeFile(join(output, 'diagnostic-source', name), bytes);
  diagnosticSources[name] = { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
}
const diagnosticWorkingTree = execFileSync('git', ['status', '--short'], { cwd: codeRoot, encoding: 'utf8' }).trim();
const source = await readFile(join(app, 'e2e/scenario.mjs'), 'utf8');
const observation = { executablePath: process.env.WK_LOCAL_EXECUTABLE || null, tapFrames: process.env.WK_TAP_FRAMES === '1' };
assert.ok(!observation.executablePath || !process.env.GITHUB_ACTIONS, 'Local executable override forbidden in GitHub Actions');
if (observation.executablePath) {
  const bytes = await readFile(observation.executablePath);
  await writeFile(join(output, 'diagnostic-source/local-browser-wrapper.sh'), bytes);
  observation.executableSha256 = createHash('sha256').update(bytes).digest('hex');
}
const derived = diagnosticSource(source.replaceAll('\r\n', '\n'), pathToFileURL(join(output, 'diagnostic-source/webkit-diagnostic-observer.mjs')).href, focused, observation);
const generated = join(app, 'e2e/.webkit-diagnostic-' + process.pid + '.mjs');
const identity = { sha, tree: git('rev-parse', 'HEAD^{tree}'), branch: process.env.PR_BRANCH || git('rev-parse', '--abbrev-ref', 'HEAD'), run: process.env.GITHUB_RUN_ID || 'local', attempt: process.env.GITHUB_RUN_ATTEMPT || '1' };
const record = { diagnosticSources, diagnosticWorkingTree, observation, diagnosticOnly: true, mode: focused ? 'focused-comparison' : 'full-prefix', scenario, ...identity,
  diagnosticSha: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: codeRoot, encoding: 'utf8' }).trim(),
  sourceBlob: git('rev-parse', 'HEAD:e2e/scenario.mjs'), node: process.version, platform: process.platform,
  startedAt: new Date().toISOString(), sourceSha256: derived.originalSha256, derivedSha256: derived.derivedSha256, awaitLocations: derived.locations,
  originalFileSha256: createHash('sha256').update(source).digest('hex'), sourceNormalization: 'CRLF to LF before AST transformation; sourceSha256 describes normalized source, originalFileSha256 describes preserved original-scenario.mjs',
  status: 'running', formalAcceptance: false, capMs: focused ? 150000 : 1200000 };
if (process.env.WK_DEADLINE_UTC_MS) {
  const remaining = Number(process.env.WK_DEADLINE_UTC_MS) - Date.now() - 15000;
  assert.ok(Number.isFinite(remaining) && remaining > 0, 'Diagnostic job has no remaining bounded budget');
  record.capMs = Math.min(record.capMs, remaining);
}
const save = () => writeFile(join(output, 'diagnostic.json'), JSON.stringify(record, null, 2) + '\n');
await save();
try {
  if (focused) assert.ok(process.env.WK_FIXTURE, 'Focused controls require captured A fixture');
  await writeFile(join(app, 'dist-pages/__gui_provenance.json'), JSON.stringify({ sha: identity.sha, branch: identity.branch, run: identity.run, attempt: identity.attempt }) + '\n');
  await writeFile(join(output, 'original-scenario.mjs'), source);
  await writeFile(join(output, 'derived-worker.mjs'), derived.code);
  await writeFile(generated, derived.code);
  const env = { ...process.env, EXPECTED_SHA: sha, PR_BRANCH: identity.branch, E2E_SCENARIO: scenario, GUI_EVIDENCE_DIR: output, GUI_PORT: process.env.GUI_PORT || '4391' };
  record.child = await runChild({ command: process.execPath, args: [generated], env, log: join(output, 'worker.log'), timeoutMs: record.capMs, graceMs: 10000 });
  const result = JSON.parse(await readFile(join(output, 'provenance.json'), 'utf8'));
  record.checks = result.checks.length; record.geometry = result.screenshotCheckpoints.length;
  record.lastStage = result.stage; record.errors = result.errors; record.resultStatus = result.status;
  record.status = record.child.ok && result.status === 'passed' && result.sha === sha && result.diagnosticOnly === true ? 'diagnostic-passed' : 'diagnostic-failed';
} catch (error) { record.status = 'diagnostic-failed'; record.error = String(error.stack || error); }
finally {
  await unlink(generated).catch(() => {});
  record.diagnosticSourcesUnchangedAtEnd = {};
  for (const name of diagnosticFiles) {
    try { record.diagnosticSourcesUnchangedAtEnd[name] = createHash('sha256').update(await readFile(join(codeRoot, 'e2e', name))).digest('hex') === diagnosticSources[name].sha256; }
    catch (error) { record.diagnosticSourcesUnchangedAtEnd[name] = { status: 'UNKNOWN', error: String(error) }; }
  }
  record.finishedAt = new Date().toISOString(); await save();
}
if (record.status !== 'diagnostic-passed') process.exitCode = 1;
