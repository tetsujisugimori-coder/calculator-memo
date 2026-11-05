// Additional Stage 3B-3 acceptance, never the formal six-scenario GUI result.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { createWriteStream } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { once } from 'node:events';
import { extname, join, resolve, sep } from 'node:path';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const sha = git('rev-parse', 'HEAD');
const out = join('gui-evidence', `storage-facade-${sha.slice(0, 12)}-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}`);
await mkdir('gui-evidence', { recursive: true });
await mkdir(out); // Fail on reuse; never overwrite earlier failed evidence.
const outcome = { status: 'running', sha, out, startedAt: new Date().toISOString() };
const saveOutcome = () => writeFile(join(out, 'runner-outcome.json'), JSON.stringify(outcome, null, 2) + '\n');
await saveOutcome();
let child, server, stopReason, forceKill;
const stop = reason => {
  stopReason = reason;
  child?.kill('SIGTERM');
  forceKill = setTimeout(() => child?.kill('SIGKILL'), 3000);
  forceKill.unref();
};
process.on('SIGTERM', () => stop('SIGTERM'));
process.on('SIGINT', () => stop('SIGINT'));
const deadline = setTimeout(() => stop('runner 600-second deadline'), 600_000);
async function run(args, name, env = process.env) {
  const log = createWriteStream(join(out, `${name}.log`), { flags: 'wx' });
  child = spawn(process.execPath, args, { env, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.pipe(log); child.stderr.pipe(log);
  child.stdout.pipe(process.stdout); child.stderr.pipe(process.stderr);
  const [code, signal] = await once(child, 'exit');
  log.end(); child = null;
  outcome[name] = { code, signal }; await saveOutcome();
  assert.ok(code === 0 && !signal && !stopReason, `${name} failed: ${code}/${signal}/${stopReason || ''}`);
}
async function sourceDigest() {
  const files = git('ls-files', '-co', '--exclude-standard', '-z').split('\0').filter(Boolean).sort();
  const hash = createHash('sha256');
  for (const name of files) { hash.update(name); hash.update('\0'); hash.update(await readFile(name)); }
  return hash.digest('hex');
}
try {
  assert.equal(sha, process.env.EXPECTED_SHA || sha, 'checkout must match requested SHA');
  const dirty = !!git('status', '--porcelain');
  if (process.env.GITHUB_ACTIONS === 'true') {
    assert.equal(dirty, false, 'CI source must be clean, including untracked source');
    assert.equal(process.env.CHROMIUM_EXECUTABLE_PATH || '', '', 'CI uses the lockfile-pinned browser');
  }
  const sourceSha256 = await sourceDigest();
  await run(['node_modules/vite/bin/vite.js', 'build', '--config', 'vite.pages.config.ts'], 'build');
  assert.equal(await sourceDigest(), sourceSha256, 'source changed during build');
  const files = {};
  async function inventory(dir, prefix = '') {
    for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const name = prefix + entry.name;
      if (entry.isDirectory()) await inventory(join(dir, entry.name), name + '/');
      else files[name] = createHash('sha256').update(await readFile(join(dir, entry.name))).digest('hex');
    }
  }
  await inventory('dist-pages');
  const provenance = {
    kind: 'additional-storage-facade-gui-not-formal', sha, tree: git('rev-parse', 'HEAD^{tree}'), dirty,
    sourceSha256, bundleSha256: createHash('sha256').update(JSON.stringify(files)).digest('hex'), files,
    run: process.env.GITHUB_RUN_ID || 'local', attempt: process.env.GITHUB_RUN_ATTEMPT || 'local',
    node: process.version, playwright: JSON.parse(await readFile('e2e/node_modules/playwright/package.json', 'utf8')).version,
    chromiumExecutableOverride: process.env.CHROMIUM_EXECUTABLE_PATH || null,
    startedAt: outcome.startedAt, nonce: randomUUID(),
  };
  await writeFile(join(out, 'provenance.json'), JSON.stringify(provenance, null, 2) + '\n', { flag: 'wx' });
  // Own the loopback socket directly. A random ephemeral port cannot silently use a stale preview.
  const root = resolve('dist-pages');
  server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      if (url.pathname === '/calculator-memo/__storage_facade_provenance.json') {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        return res.end(JSON.stringify(provenance));
      }
      assert.ok(url.pathname.startsWith('/calculator-memo/'));
      const name = decodeURIComponent(url.pathname.slice('/calculator-memo/'.length)) || 'index.html';
      const path = resolve(root, name);
      assert.ok(path.startsWith(root + sep)); assert.ok(files[name], 'only inventoried build files');
      const bytes = await readFile(path);
      assert.equal(createHash('sha256').update(bytes).digest('hex'), files[name], 'served bundle changed');
      const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf' };
      res.writeHead(200, { 'Content-Type': mime[extname(path)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); res.end(bytes);
    } catch (error) { res.writeHead(404); res.end('Not found'); outcome.serverFailure = String(error); }
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/calculator-memo/`;
  assert.deepEqual(await (await fetch(base + '__storage_facade_provenance.json')).json(), provenance);
  await run(['e2e/storage-facade-browser.mjs'], 'browser', {
    ...process.env, EXPECTED_SHA: sha, STORAGE_FACADE_EVIDENCE_DIR: out, STORAGE_FACADE_TEST_URL: base,
  });
  assert.equal(await sourceDigest(), sourceSha256, 'source changed during browser acceptance');
  const results = JSON.parse(await readFile(join(out, 'results.json'), 'utf8'));
  assert.equal(results.status, 'passed'); assert.equal(results.cases.length, 8);
  assert.ok(results.cases.every(c => c.status === 'passed' && c.contexts.length === 6 && c.contexts.every(s => s.status === 'passed')));
  outcome.status = 'passed';
} catch (error) { outcome.status = 'failed'; outcome.error = error.stack || String(error); process.exitCode = 1; }
finally {
  clearTimeout(deadline); clearTimeout(forceKill);
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  outcome.stopReason = stopReason || null; outcome.finishedAt = new Date().toISOString(); await saveOutcome();
  console.log(`Storage Facade additional evidence: ${out}`);
}
