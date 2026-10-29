// Focused diagnostic; never imported by the official suite.
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import { resolve, join } from 'node:path';
import { once } from 'node:events';
import { summarizeCase } from './diagnostic-aggregate.mjs';

const app = resolve(process.env.DIAG_APP_ROOT || '.');
const output = resolve(process.env.DIAG_OUTPUT || 'diagnostic-evidence');
const target = '52f4f6914fcd3c72b0829018842f653f06abe5f2';
const cases = [{ width: 375, observe: false }, { width: 375, observe: true }, { width: 390, observe: false }, { width: 390, observe: true }];
const index = Number(process.env.DIAG_CASE);
assert.ok(Number.isInteger(index) && index >= 0 && index < cases.length, 'DIAG_CASE must select one predeclared case');
await mkdir(output, { recursive: true });
const started = performance.now();
let status = { status: 'running', target, startedAt: new Date().toISOString(), cases: [], limits: { caseMs: 300000, totalMs: 1200000 }, mode: 'fresh contexts only; not formal GUI', persistence: { writes: 0, durationMs: 0, note: 'previous writes only; final write excluded' } };
const save = async () => { const t = performance.now(); await writeFile(join(output, 'progress.json'), JSON.stringify(status, null, 2) + '\n'); status.persistence.writes++; status.persistence.durationMs += performance.now() - t; };
await save();
let server, browser, context, stream, active, abort = false;
const failSignal = signal => { abort = true; status.signal = signal; if (context) context.close().catch(() => {}); if (server) server.kill('SIGTERM'); };
process.once('SIGTERM', () => failSignal('SIGTERM')); process.once('SIGINT', () => failSignal('SIGINT'));
try {
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: app, encoding: 'utf8' }).trim();
  assert.equal(sha, target, 'diagnostic application checkout must be exact');
  assert.equal(execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: app, encoding: 'utf8' }).trim(), '', 'tracked application files must match checkout');
  assert.equal(process.version, 'v22.13.0', 'diagnostic Node must be pinned');
  assert.equal(process.platform, 'linux'); assert.equal(process.arch, 'x64');
  const osRelease = await readFile('/etc/os-release', 'utf8'); assert.match(osRelease, /^ID=ubuntu$/m); assert.match(osRelease, /^VERSION_ID="?24\.04"?$/m);
  status.identity = { appSha: sha, diagnosticSha: process.env.DIAG_CODE_SHA || 'UNVERIFIED', run: process.env.GITHUB_RUN_ID || 'local', attempt: process.env.GITHUB_RUN_ATTEMPT || '1', node: process.version, platform: process.platform, arch: process.arch, image: process.env.ImageVersion || 'UNKNOWN' };
  const pkg = JSON.parse(await readFile(join(app, 'e2e/node_modules/@playwright/test/package.json'), 'utf8'));
  assert.equal(pkg.version, '1.56.1');
  const pw = await import(pathToFileURL(join(app, 'e2e/node_modules/@playwright/test/index.mjs')).href);
  const { exerciseAuditRecordComparison } = await import(pathToFileURL(join(app, 'e2e/audit-record-comparison.mjs')).href);
  const { runtimeResources } = await import(pathToFileURL(join(app, 'e2e/runtime-resources.mjs')).href);
  const port = 4284, origin = `http://127.0.0.1:${port}`, base = origin + '/calculator-memo/';
  await writeFile(join(app, 'dist-pages/__gui_provenance.json'), JSON.stringify(status.identity));
  stream = createWriteStream(join(output, 'preview.log'));
  server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--config', 'vite.pages.config.ts', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], { cwd: app, stdio: ['ignore', 'pipe', 'pipe'] });
  server.stdout.pipe(stream); server.stderr.pipe(stream);
  let ready = false, serverError, startup = ''; server.stdout.on('data', c => { startup = (startup + String(c)).slice(-4096); if (startup.includes(base)) ready = true; }); server.on('error', e => { serverError = String(e); });
  const prep = performance.now();
  await pw.expect.poll(async () => { if (serverError || server.exitCode !== null) throw Error(serverError || 'preview exited'); if (!ready) return 0; try { return (await fetch(base)).status; } catch { return 0; } }, { timeout: 30000 }).toBe(200);
  status.prepareMs = performance.now() - started; status.previewWaitMs = performance.now() - prep; await save();
  for (const item of [cases[index]]) {
    if (abort || performance.now() - started > status.limits.totalMs - status.limits.caseMs) throw Error('insufficient remaining budget or interrupted');
    active = { ...item, status: 'running', startedAt: new Date().toISOString(), actions: [], checks: [], observations: [], resourceSamples: [], errors: [], startMs: performance.now() - started };
    status.cases.push(active); await save();
    const timer = setTimeout(() => { active.timeout = true; if (context) context.close().catch(() => {}); }, status.limits.caseMs);
    const caseStart = performance.now();
    try {
      active.resourcesStart = runtimeResources();
      browser = await pw.webkit.launch();
      context = await browser.newContext({ viewport: { width: item.width, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3, locale: 'ja-JP', timezoneId: 'Asia/Tokyo', colorScheme: 'light', serviceWorkers: 'block' });
      await context.route('**/*', route => { if (new URL(route.request().url()).origin !== origin) { active.errors.push('external request blocked'); return route.abort(); } return route.continue(); });
      await context.addInitScript(() => { window.__guiTouchStarts = 0; document.addEventListener('touchstart', () => { window.__guiTouchStarts += 1; }, { passive: true }); });
      context.on('page', p => { p.on('pageerror', e => active.errors.push(String(e))); p.on('console', m => { if (m.type() === 'error') active.errors.push(m.text()); }); p.on('response', r => { if (r.status() >= 400) active.errors.push(`HTTP ${r.status()}`); }); });
      const page = await context.newPage(); page.setDefaultTimeout(10000);
      await page.goto(base); const served = await page.evaluate(async () => (await fetch('./__gui_provenance.json', { cache: 'no-store' })).json()); assert.deepEqual(served, status.identity);
      const observe = async label => { if (!item.observe) return; const t = performance.now(); const dom = await page.evaluate(() => ({ elements: document.querySelectorAll('*').length, dialogs: document.querySelectorAll('[role=dialog]').length })); active.observations.push({ label, ...dom, pages: context.pages().length, durationMs: performance.now() - t }); await save(); };
      const activate = async locator => { const t = performance.now(), action = { requestMs: t - caseStart }, actionIndex = active.actions.length; active.actions.push(action); await save(); try { if (actionIndex % 20 === 0) { const sampleMs = performance.now() - caseStart, resources = runtimeResources(); active.resourceSamples.push({ actionIndex, sampleMs, relation: 'after request before dispatch', resources }); await save(); } const before = await page.evaluate(() => window.__guiTouchStarts); action.dispatchStartMs = performance.now() - caseStart; await locator.tap(); action.dispatchEndMs = performance.now() - caseStart; await pw.expect.poll(() => page.evaluate(() => window.__guiTouchStarts)).toBeGreaterThan(before); action.touchObservedMs = performance.now() - caseStart; } finally { action.endMs = performance.now() - caseStart; active.aggregate = summarizeCase(active); await save(); } };
      const assertHorizontalFit = async () => { const size = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth })); assert.equal(size.viewport, item.width); assert.ok(size.document <= size.viewport + 1 && size.body <= size.viewport + 1); for (const modal of await page.getByRole('dialog').all()) { if (!(await modal.isVisible())) continue; const r = await modal.boundingBox(); assert.ok(r && r.x >= -1 && r.x + r.width <= item.width + 1); for (const area of await modal.locator('.modal-content').all()) { const s = await area.evaluate(e => ({ scroll: e.scrollWidth, client: e.clientWidth })); assert.ok(s.scroll <= s.client + 1); } } };
      await observe('before');
      const helperStart = performance.now();
      try { await exerciseAuditRecordComparison({ page, context, base, expect: pw.expect, passed: async name => { active.checks.push(name); await save(); if (active.checks.length === 1) await observe('first-comparison'); }, prefix: `diagnostic-${item.width}`, assertHorizontalFit, activate }); }
      finally { active.helperDurationMs = performance.now() - helperStart; }
      await observe('after'); active.aggregate = summarizeCase(active);
      assert.equal(active.checks.length, 11); assert.equal(active.errors.length, 0); assert.ok(!active.timeout && !abort);
      assert.equal(active.aggregate.requestToEnd.missing, 0); assert.equal(active.aggregate.dispatch.missing, 0);
      assert.equal(active.aggregate.resource.missingSamples, 0); assert.equal(active.aggregate.resource.missingProcessTree, 0); assert.equal(active.aggregate.resource.collection.missing, 0);
      assert.equal(active.aggregate.dom.observations, active.aggregate.dom.expected);
      assert.equal(server.exitCode, null, 'owned preview must remain alive'); assert.equal(server.signalCode, null, 'owned preview must remain alive');
      active.status = 'passed';
    } finally {
      clearTimeout(timer); active.durationMs = performance.now() - caseStart; active.resourcesEnd = runtimeResources(); active.aggregate = summarizeCase(active);
      if (context) await context.close().catch(e => { active.errors.push('context close: ' + String(e)); active.status = 'failed'; process.exitCode = 1; }); context = null;
      if (browser) await browser.close().catch(e => { active.errors.push('browser close: ' + String(e)); active.status = 'failed'; process.exitCode = 1; }); browser = null;
      active.finishedAt = new Date().toISOString(); await save();
    }
    assert.equal(active.status, 'passed', 'case cleanup must succeed');
  }
  status.status = 'passed';
} catch (error) { status.status = 'failed'; status.failure = String(error.stack || error); if (active && active.status === 'running') active.status = 'failed'; process.exitCode = 1; }
finally {
  const cleanupStart = performance.now();
  if (context) await context.close().catch(() => {}); if (browser) await browser.close().catch(() => {});
  if (server && server.exitCode === null) { const done = once(server, 'exit'); server.kill('SIGTERM'); await Promise.race([done, new Promise(r => setTimeout(r, 3000))]); if (server.exitCode === null) server.kill('SIGKILL'); }
  if (stream) await new Promise(resolve => stream.end(resolve)); status.cleanupMs = performance.now() - cleanupStart; status.finishedAt = new Date().toISOString(); status.durationMs = performance.now() - started; await save();
}
