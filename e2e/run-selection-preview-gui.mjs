// Own a fresh loopback preview; never use a previously running server.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createWriteStream } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { once } from 'node:events';
import net from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
await mkdir('gui-evidence', { recursive: true });
const sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
assert.equal(sha, process.env.EXPECTED_SHA || sha, 'checkout must equal requested HEAD');
const dirty = execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { encoding: 'utf8' }).trim().length > 0;
if (process.env.GITHUB_ACTIONS === 'true') assert.equal(dirty, false, 'CI tracked source must be clean');
const provenance = { sha, dirty, run: process.env.GITHUB_RUN_ID || 'local', attempt: process.env.GITHUB_RUN_ATTEMPT || 'local', job: 'selection-preview', node: process.version, startedAt: new Date().toISOString() };
await writeFile('dist-pages/__selection-preview_provenance.json', JSON.stringify(provenance));
await writeFile('gui-evidence/selection-preview-provenance.json', JSON.stringify(provenance, null, 2));
const probe = net.createServer(); probe.listen(4194, '127.0.0.1'); await once(probe, 'listening'); await new Promise(resolve => probe.close(resolve));
const log = createWriteStream('gui-evidence/selection-preview-server.log');
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--config', 'vite.pages.config.ts', '--host', '127.0.0.1', '--port', '4194', '--strictPort'], { stdio: ['ignore', 'pipe', 'pipe'] });
const serverExited = once(server, 'exit');
server.stdout.pipe(log); server.stderr.pipe(log);
let child; let stopping = false;
const stop = signal => { stopping = true; child?.kill(signal); server.kill(signal); };
process.on('SIGTERM', () => stop('SIGTERM')); process.on('SIGINT', () => stop('SIGINT'));
try {
  let ready = false;
  for (let attempt = 0; attempt < 60 && !stopping; attempt++) {
    if (server.exitCode !== null || server.signalCode !== null) throw Error(`preview exited ${server.exitCode}`);
    try { const response = await fetch('http://127.0.0.1:4194/calculator-memo/__selection-preview_provenance.json', { signal: AbortSignal.timeout(500) }); if (response.ok) { assert.deepEqual(await response.json(), provenance); ready = true; break; } } catch { /* bounded readiness polling */ }
    await delay(250);
  }
  assert.ok(ready && !stopping, 'owned preview did not become ready');
  child = spawn(process.execPath, ['e2e/selection-preview-mobile.mjs'], { stdio: 'inherit', env: { ...process.env, EXPECTED_SHA: sha } });
  const [code, signal] = await once(child, 'exit');
  process.exitCode = code === 0 && !signal && !stopping ? 0 : 1;
} finally {
  if (server.exitCode === null && server.signalCode === null) { server.kill('SIGTERM'); const killer = setTimeout(() => server.kill('SIGKILL'), 3000); await serverExited; clearTimeout(killer); }
  log.end();
}
