// Full-suite coordinator. Each worker owns its context, localStorage, server and evidence.
import { spawn, execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import assert from 'node:assert/strict';
import { scenarios, scenarioPort, executionOrder } from './scenario-config.mjs';
import { validateCoverage } from './ci-contract.mjs';
import { runtimeResources } from './runtime-resources.mjs';
process.chdir(fileURLToPath(new URL('../', import.meta.url)));
const output = 'gui-evidence';
await mkdir(output, { recursive: true });
const started = performance.now();
const summary = { schemaVersion: 3, status: 'running', startedAt: new Date().toISOString(), concurrency: 3, resourcesAtStart: runtimeResources(), executionOrder: executionOrder.map(index => scenarios[index].id), workers: [], scenarios: [], checks: [], errors: [] };
const persist = () => writeFile(output + '/provenance.json', JSON.stringify(summary, null, 2) + '\n');
let next = 0;
async function runWorker() {
  while (next < scenarios.length) {
    const index = executionOrder[next++], scenario = scenarios[index];
    const directory = output + '/' + scenario.id;
    await mkdir(directory, { recursive: true });
    const start = performance.now();
    const worker = { id: scenario.id, status: 'running', startedAt: new Date().toISOString(), port: scenarioPort(index) };
    summary.workers.push(worker);
    const log = createWriteStream(directory + '/worker.log');
    let streamError;
    log.on('error', error => { streamError = String(error); });
    const child = spawn(process.execPath, ['e2e/scenario.mjs'], { env: { ...process.env, EXPECTED_SHA: summary.sha, E2E_SCENARIO: scenario.id, GUI_EVIDENCE_DIR: directory, GUI_PORT: String(worker.port) }, stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.pipe(log, { end: false }); child.stderr.pipe(log, { end: false });
    const result = await new Promise(resolve => { child.on('error', error => resolve({ error: String(error), code: null })); child.on('close', (code, signal) => resolve({ code, signal })); });
    await new Promise(resolve => { if (log.destroyed) resolve(); else { log.once("error", resolve); log.end(resolve); } });
    Object.assign(worker, result, { durationMs: performance.now() - start, finishedAt: new Date().toISOString() });
    if (streamError) worker.logError = streamError;
    try { worker.record = JSON.parse(await readFile(directory + '/provenance.json', 'utf8')); }
    catch (error) { worker.evidenceError = String(error); }
    worker.status = result.code === 0 && !streamError && worker.record?.status === 'passed' ? 'passed' : 'failed';
    console.log(worker.id, worker.status, Math.round(worker.durationMs) + 'ms');
    // Continue other independent conditions to preserve diagnostic coverage, never retry a failed condition.
  }
}
try {
  summary.sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  summary.expectedSha = process.env.EXPECTED_SHA || summary.sha;
  if (process.env.CI) assert.ok(process.env.EXPECTED_SHA, 'CI requires exact PR head SHA');
  assert.equal(summary.sha, summary.expectedSha, 'Checkout must equal PR head');
  summary.servedIdentity = { sha: summary.sha, branch: process.env.PR_BRANCH || execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { encoding: "utf8" }).trim(), run: process.env.GITHUB_RUN_ID || "local", attempt: process.env.GITHUB_RUN_ATTEMPT || "1" };
  await writeFile("dist-pages/__gui_provenance.json", JSON.stringify(summary.servedIdentity) + "\n");
  await persist();
  const workers = await Promise.allSettled([runWorker(), runWorker(), runWorker()]);
  assert.ok(workers.every(worker => worker.status === "fulfilled"), "Worker orchestration failure: " + workers.filter(worker => worker.status === "rejected").map(worker => String(worker.reason)).join("; "));
  summary.workers.sort((a,b) => scenarios.findIndex(s=>s.id===a.id) - scenarios.findIndex(s=>s.id===b.id));
  assert.ok(summary.workers.every(worker => worker.status === 'passed'), 'One or more scenario workers failed; inspect each worker evidence');
  const records = summary.workers.map(worker => worker.record);
  summary.coverage = validateCoverage(records, summary.sha);
  summary.scenarios = records.flatMap(record => record.scenarios);
  summary.checks = records.flatMap(record => record.checks);
  summary.status = 'passed';
} catch (error) {
  summary.status = 'failed'; summary.failure = { message: String(error), stack: error.stack };
  process.exitCode = 1; console.error(error);
} finally {
  summary.wallDurationMs = performance.now() - started;
  summary.sumWorkerDurationMs = summary.workers.reduce((sum, worker) => sum + (worker.durationMs || 0), 0);
  // Full per-worker records live once in their own directories, not duplicated in aggregate JSON.
  summary.workers = summary.workers.map(({ record, ...worker }) => ({ ...worker, evidence: worker.id + '/provenance.json', ...(record ? { checkCount: record.checks.length } : {}) }));
  summary.finishedAt = new Date().toISOString();
  summary.resourcesAtEnd = runtimeResources();
  await persist();
}
