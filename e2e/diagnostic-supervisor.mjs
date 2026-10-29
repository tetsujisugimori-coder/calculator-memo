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
  await new Promise(resolve => { if (out.destroyed) resolve(); else out.end(resolve); });
  return { ...result, timedOut, interrupted, spawnError, logError, durationMs: performance.now() - started, ok: result.code === 0 && !timedOut && !interrupted && !spawnError && !logError };
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
      const record = evidence?.cases?.[0];
      const valid = evidence?.status === 'passed' && record?.status === 'passed' && record?.checks?.length === 11 && record?.actions?.length > 0 && record?.errors?.length === 0 && evidence?.identity?.diagnosticSha === sha;
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
  const changes = execFileSync('git', ['status', '--porcelain', '--', 'e2e/diagnostic-pr103.mjs', 'e2e/diagnostic-supervisor.mjs'], { cwd: root, encoding: 'utf8' });
  if (changes.trim()) throw Error('diagnostic code must match its committed SHA');
  const result = await runPlan({ output, app, driver: fileURLToPath(new URL('./diagnostic-pr103.mjs', import.meta.url)), sha });
  if (result.status !== 'passed') process.exitCode = 1;
}
