import { spawn, execFileSync } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';

// Exported separately so timeout, failure and cleanup can be tested without a browser.
export async function runChild({ command, args, env, log, timeoutMs, graceMs = 5000 }) {
  const started = performance.now(), out = createWriteStream(log);
  let logError; out.on('error', e => { logError = String(e); });
  const child = spawn(command, args, { env, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.pipe(out, { end: false }); child.stderr.pipe(out, { end: false });
  let timedOut = false, interrupted = false, escalation, spawnError;
  const signal = name => { try { if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, name); else child.kill(name); } catch {} };
  const stop = () => { signal('SIGTERM'); if (!escalation) escalation = setTimeout(() => signal('SIGKILL'), graceMs); };
  const interrupt = () => { interrupted = true; stop(); };
  process.once('SIGTERM', interrupt); process.once('SIGINT', interrupt);
  const timer = setTimeout(() => { timedOut = true; stop(); }, timeoutMs);
  const result = await new Promise(resolve => { child.once('error', e => { spawnError = String(e); }); child.once('close', (code, signalName) => resolve({ code, signal: signalName })); });
  clearTimeout(timer); clearTimeout(escalation); process.removeListener('SIGTERM', interrupt); process.removeListener('SIGINT', interrupt);
  // A closed leader does not prove its process group is gone. Check the group
  // created for this child, terminate remaining members, and fail closed if the
  // platform cannot confirm disappearance. PID namespace visibility is limited.
  let groupCleanup = 'unverified-platform';
  if (process.platform === 'linux' && child.pid) {
    const groupState = () => { try { process.kill(-child.pid, 0); return 'present'; } catch (e) { return e.code === 'ESRCH' ? 'absent' : 'unknown'; } };
    const waitAbsent = async ms => { const deadline = performance.now() + ms; let state; do { state = groupState(); if (state !== 'present') return state; await new Promise(r => setTimeout(r, 50)); } while (performance.now() < deadline); return state; };
    let state = groupState();
    if (state === 'present') { signal('SIGTERM'); state = await waitAbsent(graceMs); }
    if (state === 'present') { signal('SIGKILL'); state = await waitAbsent(graceMs); }
    groupCleanup = state === 'absent' ? 'confirmed-absent-in-namespace' : 'unconfirmed';
  }
  await new Promise(resolve => { if (out.destroyed) resolve(); else out.end(resolve); });
  return { ...result, timedOut, interrupted, spawnError, logError, groupCleanup, durationMs: performance.now() - started, ok: result.code === 0 && !timedOut && !interrupted && !spawnError && !logError && (process.platform !== 'linux' || groupCleanup === 'confirmed-absent-in-namespace') };
}

export async function runPlan({ output, app, driver, sha, timeoutMs = 300000, totalMs = 1200000 }) {
  await mkdir(output, { recursive: true });
  const began = performance.now(), result = { status: 'running', startedAt: new Date().toISOString(), diagnosticSha: sha, app, cases: [] };
  const save = () => writeFile(join(output, 'summary.json'), JSON.stringify(result, null, 2) + '\n');
  await save();
  try {
    for (let i = 0; i < 4; i++) {
      if (performance.now() - began > totalMs - timeoutMs) throw Error('insufficient total budget');
      const dir = join(output, `case-${i}`); await mkdir(dir, { recursive: true });
      const item = { index: i, startedAt: new Date().toISOString(), status: 'running' }; result.cases.push(item); await save();
      const child = await runChild({ command: process.execPath, args: [driver], env: { ...process.env, DIAG_CASE: String(i), DIAG_APP_ROOT: app, DIAG_OUTPUT: dir, DIAG_CODE_SHA: sha }, log: join(dir, 'worker.log'), timeoutMs });
      let evidence;
      try { evidence = JSON.parse(await readFile(join(dir, 'progress.json'), 'utf8')); } catch (e) { item.evidenceError = String(e); }
      const record = evidence?.cases?.[0], summary = record?.aggregate;
      const valid = evidence?.status === 'passed' && record?.status === 'passed' && record?.checks?.length === 11 && record?.actions?.length === 65 && record?.errors?.length === 0 && evidence?.identity?.diagnosticSha === sha && evidence?.identity?.appSha === '52f4f6914fcd3c72b0829018842f653f06abe5f2' && record?.width === (i < 2 ? 375 : 390) && record?.observe === (i % 2 === 1) && summary?.actions === record?.actions?.length && summary?.requestToEnd?.missing === 0 && summary?.dispatch?.missing === 0 && summary?.resource?.missingSamples === 0 && summary?.resource?.missingProcessTree === 0 && summary?.resource?.collection?.missing === 0 && summary?.dom?.observations === summary?.dom?.expected;
      Object.assign(item, child, { status: child.ok && valid ? 'passed' : 'failed', checkCount: record?.checks?.length ?? null, actionCount: record?.actions?.length ?? null, finishedAt: new Date().toISOString() }); await save();
      if (!child.ok || !valid) throw Error(`case ${i} failed, timed out, or lacked evidence; remaining cases not started`);
    }
    result.status = 'passed';
  } catch (e) { result.status = 'failed'; result.failure = String(e); }
  result.finishedAt = new Date().toISOString(); result.durationMs = performance.now() - began; await save();
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const app = resolve(process.env.DIAG_APP_ROOT || '.');
  const output = resolve(process.env.DIAG_OUTPUT || 'diagnostic-evidence');
  const sha = process.env.DIAG_CODE_SHA;
  if (!sha || !/^[0-9a-f]{40}$/.test(sha)) throw Error('DIAG_CODE_SHA must identify the diagnostic code');
  const root = fileURLToPath(new URL('../', import.meta.url));
  const actual = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  if (actual !== sha) throw Error('diagnostic checkout SHA mismatch');
  const changes = execFileSync('git', ['status', '--porcelain', '--', 'e2e/diagnostic-pr103.mjs', 'e2e/diagnostic-supervisor.mjs', 'e2e/diagnostic-aggregate.mjs'], { cwd: root, encoding: 'utf8' });
  if (changes.trim()) throw Error('diagnostic code must match its committed SHA');
  const result = await runPlan({ output, app, driver: fileURLToPath(new URL('./diagnostic-pr103.mjs', import.meta.url)), sha });
  if (result.status !== 'passed') process.exitCode = 1;
}
