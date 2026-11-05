// Empty loopback origin, fresh contexts, synthetic namespace. Never runs the app.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { chromium, webkit } from './node_modules/playwright/index.mjs';
import { validateArchitectureEvidence, CASES } from './storage-architecture-contract.mjs';
const sha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const tree = execFileSync('git', ['rev-parse', 'HEAD^{tree}'], { encoding: 'utf8' }).trim();
const dirty = !!execFileSync('git', ['status', '--porcelain'], { encoding: 'utf8' }).trim();
assert.equal(sha, process.env.EXPECTED_SHA || sha);
if (process.env.GITHUB_ACTIONS === 'true') assert.equal(dirty, false);
const source = await readFile('tests/storage-architecture/poc.mjs');
const out = `gui-evidence/storage-architecture-${sha.slice(0, 12)}-${randomUUID()}`;
await mkdir(out, { recursive: true });
const evidence = { provenance: { sha, tree, dirty, node: process.version, platform: process.platform,
  run: process.env.GITHUB_RUN_ID || 'local', attempt: process.env.GITHUB_RUN_ATTEMPT || 'local',
  sourceSha256: createHash('sha256').update(source).digest('hex') }, executionAllowed: false, HOLD: true, results: [] };
const server = createServer((req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.url === '/poc.mjs') { res.setHeader('Content-Type', 'text/javascript'); res.end(source); }
  else if (req.url === '/worker.js') { res.setHeader('Content-Type', 'text/javascript'); res.end('let n=0;onmessage=()=>postMessage(++n);'); }
  else if (req.url === '/') { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><title>Stage3B2 isolated PoC</title><script type="module">window.api=await import("/poc.mjs")</script>'); }
  else { res.statusCode = 404; res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const url = `http://127.0.0.1:${server.address().port}/`;
try {
  for (const engine of ['chromium', 'webkit']) {
    let browser;
    const result = { engine, status: 'FAILED', cases: [], pageerrors: [] }; evidence.results.push(result);
    try {
      browser = await ({ chromium, webkit }[engine]).launch({ headless: true }); result.version = browser.version();
      const context = await browser.newContext();
      await context.route('**/*', route => new URL(route.request().url()).origin === new URL(url).origin ? route.continue() : route.abort());
      const page = await context.newPage(), other = await context.newPage();
      context.on('page', p => p.on('pageerror', e => result.pageerrors.push(e.message)));
      for (const p of [page, other]) p.on('pageerror', e => result.pageerrors.push(e.message));
      await Promise.all([page.goto(url), other.goto(url)]);
      await Promise.all([page.waitForFunction(() => !!window.api), other.waitForFunction(() => !!window.api)]);
      const record = async (name, fn) => { const observation = await fn(); result.cases.push({ name, status: 'PASS', observation }); };
      const setup = async () => {
        const name = 'stage3b2-test-' + randomUUID();
        await page.evaluate(async name => {
          window.db = await window.api.openDatabase(name);
          window.initial = window.api.genesis('inc-' + name, 'genesis');
          if (await window.api.bootstrap(window.db, window.initial, true) !== 'CREATED') throw Error('bootstrap failed');
          window.expected = window.api.tokenOf(window.initial);
          window.request = (operation, raw = operation, kind = 'ordinary') => ({ operation, raw, kind, writer: 'v2', instance: 'pageA' });
        }, name);
        await other.evaluate(async name => { window.db = await window.api.openDatabase(name); window.expected = window.api.tokenOf(await window.api.readVault(window.db)); }, name);
        return name;
      };
      await record('same-generation-two-tabs', async () => {
        await setup();
        const both = await Promise.all([page.evaluate(() => window.api.commit(window.db, window.expected, window.request('A'))),
          other.evaluate(() => window.api.commit(window.db, window.expected, { operation: 'B', raw: 'B', writer: 'v2', instance: 'pageB', kind: 'ordinary' }))]);
        assert.deepEqual(both.map(x => x.status).sort(), ['COMMITTED_OBSERVED', 'REFUSED']);
        const s = await page.evaluate(() => window.api.readVault(window.db));
        assert.equal(s.generation, 1); assert.equal(s.history.length, 2); assert.equal(s.copies.length, 1);
        return { outcomes: both, generation: s.generation };
      });
      await record('stale-validation-and-recovery', async () => {
        await setup();
        assert.equal((await other.evaluate(() => window.api.commit(window.db, window.expected, { operation: 'B', raw: 'B', writer: 'v2', instance: 'pageB', kind: 'ordinary' }))).status, 'COMMITTED_OBSERVED');
        const r = await page.evaluate(() => window.api.commit(window.db, window.expected, window.request('recovery', 'old', 'recovery')));
        assert.equal(r.status, 'REFUSED'); return r;
      });
      await record('cooperative-aba-token', async () => {
        await setup();
        await other.evaluate(async () => {
          for (const [operation, raw] of [['B', 'B'], ['A2', 'A']]) {
            const s = await window.api.readVault(window.db);
            const r = await window.api.commit(window.db, window.api.tokenOf(s), { operation, raw, writer: 'v2', instance: 'pageB', kind: 'ordinary' });
            if (r.status !== 'COMMITTED_OBSERVED') throw Error('ABA fixture failed');
          }
        });
        const r = await page.evaluate(() => window.api.commit(window.db, window.expected, window.request('stale')));
        assert.equal(r.status, 'REFUSED'); return r;
      });
      await record('web-lock-ignored-by-old-tab', async () => {
        await page.evaluate(() => {
          localStorage.setItem('stage3b2-test-legacy', 'A'); window.held = false;
          window.lock = navigator.locks.request('stage3b2-test-write', async () => { window.held = true; await new Promise(r => window.release = r); });
        });
        await page.waitForFunction(() => window.held);
        await other.evaluate(() => localStorage.setItem('stage3b2-test-legacy', 'B'));
        assert.equal(await page.evaluate(() => localStorage.getItem('stage3b2-test-legacy')), 'B');
        await page.evaluate(async () => { window.release(); await window.lock; });
        return { lockHeldDuringBypass: true, raw: 'B', safety: 'COUNTEREXAMPLE' };
      });
      await record('unobserved-notification-aba', async () => {
        // Receiver deliberately has no invalidation subscriber. Does not claim UA dropped an event.
        await page.evaluate(() => { localStorage.setItem('stage3b2-test-legacy', 'A'); window.legacyExpected = 'A'; });
        await other.evaluate(() => { localStorage.setItem('stage3b2-test-legacy', 'B'); localStorage.setItem('stage3b2-test-legacy', 'A'); });
        assert.equal(await page.evaluate(() => localStorage.getItem('stage3b2-test-legacy') === window.legacyExpected), true);
        return { rawComparisonAccepts: true, safety: 'COUNTEREXAMPLE', notification: 'subscriber-absent' };
      });
      await record('final-check-set-gap', async () => {
        await page.evaluate(() => { localStorage.setItem('stage3b2-test-legacy', 'A'); window.validated = localStorage.getItem('stage3b2-test-legacy') === 'A'; });
        await other.evaluate(() => localStorage.setItem('stage3b2-test-legacy', 'B'));
        await page.evaluate(() => { if (window.validated) localStorage.setItem('stage3b2-test-legacy', 'C'); });
        assert.equal(await other.evaluate(() => localStorage.getItem('stage3b2-test-legacy')), 'C');
        return { lost: 'B', final: 'C', safety: 'COUNTEREXAMPLE', scheduling: 'explicit-cross-page-boundaries' };
      });
      await record('transaction-abort-preserves-all', async () => {
        await setup();
        const r = await page.evaluate(() => window.api.commit(window.db, window.expected, window.request('abort'), 'abort-after-put'));
        assert.equal(r.status, 'UNKNOWN');
        const s = await other.evaluate(() => window.api.readVault(window.db));
        assert.equal(s.generation, 0); assert.equal(s.raw, 'A'); assert.equal(s.copies.length, 0); assert.equal(s.history.length, 1);
        return { ...r, generation: s.generation, history: s.history.length, copies: s.copies.length };
      });
      await record('commit-before-page-close-ack', async () => {
        const name = await setup();
        const producer = await context.newPage(); await producer.goto(url); await producer.waitForFunction(() => !!window.api);
        await producer.evaluate(async name => {
          window.db = await window.api.openDatabase(name); const s = await window.api.readVault(window.db);
          window.result = await window.api.commit(window.db, window.api.tokenOf(s), { operation: 'lost-ack', raw: 'B', kind: 'ordinary', writer: 'v2', instance: 'producer' });
          // UI acknowledgement intentionally withheld; close destroys this live instance.
          window.acknowledgement = new Promise(() => {});
        }, name);
        assert.equal(await producer.evaluate(() => window.result.status), 'COMMITTED_OBSERVED');
        await producer.close();
        const recovered = await other.evaluate(async () => window.api.reconcile(await window.api.readVault(window.db), 'lost-ack'));
        assert.equal(recovered.status, 'COMMIT_RECORD_OBSERVED'); assert.equal(recovered.acknowledgement, 'UNKNOWN');
        return { ...recovered, interruption: 'actual-page-close-after-tx-complete-before-ui-ack', browserKill: 'NOT_TESTED' };
      });
      await record('exception-after-commit', async () => {
        await setup();
        const r = await page.evaluate(async () => {
          let status;
          try {
            const result = await window.api.commit(window.db, window.expected, window.request('throw-after-commit'));
            if (result.status !== 'COMMITTED_OBSERVED') throw Error('fixture did not commit');
            throw Error('injected-after-complete');
          } catch (e) { status = { status: 'UNKNOWN', originalFailure: e.message }; }
          return { ...status, receipt: window.api.reconcile(await window.api.readVault(window.db), 'throw-after-commit') };
        });
        assert.equal(r.status, 'UNKNOWN'); assert.equal(r.originalFailure, 'injected-after-complete');
        assert.equal(r.receipt.status, 'COMMIT_RECORD_OBSERVED'); return r;
      });
      await record('normal-reopen-new-instance', async () => {
        const name = await setup();
        assert.equal((await page.evaluate(() => window.api.commit(window.db, window.expected, window.request('normal')))).status, 'COMMITTED_OBSERVED');
        await page.evaluate(() => window.db.close());
        const r = await page.evaluate(async name => { window.db = await window.api.openDatabase(name); const s = await window.api.readVault(window.db); return { integrity: window.api.inspect(s), receipt: window.api.reconcile(s, 'normal') }; }, name);
        assert.equal(r.integrity, 'CONSISTENT'); assert.equal(r.receipt.acknowledgement, 'UNKNOWN'); return r;
      });
      await record('missing-corrupt-history-generation-copy', async () => {
        const observations = [];
        for (const fault of ['generation', 'history', 'copy']) {
          await setup();
          await page.evaluate(() => window.api.commit(window.db, window.expected, window.request('before-corruption')));
          await other.evaluate(async fault => {
            const s = await window.api.readVault(window.db);
            if (fault === 'generation') delete s.generation;
            if (fault === 'history') s.history.pop();
            if (fault === 'copy') s.copies[0].raw = 'mismatched-copy';
            await new Promise((resolve, reject) => { const tx = window.db.transaction('vault', 'readwrite'); tx.objectStore('vault').put(s, 'root'); tx.oncomplete = resolve; tx.onabort = reject; });
          }, fault);
          const r = await page.evaluate(() => window.api.commit(window.db, window.expected, window.request('after-corruption')));
          assert.equal(r.status, 'UNKNOWN'); observations.push({ fault, ...r });
        }
        return observations;
      });
      await record('entire-store-loss-no-auto-bootstrap', async () => {
        await setup();
        await other.evaluate(() => new Promise((resolve, reject) => { const tx = window.db.transaction('vault', 'readwrite'); tx.objectStore('vault').clear(); tx.oncomplete = resolve; tx.onabort = reject; }));
        const r = await page.evaluate(() => window.api.commit(window.db, window.expected, window.request('after-loss')));
        assert.equal(r.status, 'UNKNOWN');
        const bootstrap = await page.evaluate(() => window.api.bootstrap(window.db, window.initial, false)); assert.equal(bootstrap, 'REFUSED');
        return { ...r, automaticBootstrap: bootstrap, virginVsEvicted: 'INDISTINGUISHABLE' };
      });
      await record('idb-authority-legacy-fork', async () => {
        await setup();
        await page.evaluate(() => localStorage.setItem('stage3b2-test-legacy', 'A'));
        await page.evaluate(() => window.api.commit(window.db, window.expected, window.request('idb-authority', 'NEW')));
        await other.evaluate(() => localStorage.setItem('stage3b2-test-legacy', 'OLD-TAB'));
        const r = await page.evaluate(async () => ({ idb: (await window.api.readVault(window.db)).raw, legacy: localStorage.getItem('stage3b2-test-legacy') }));
        assert.deepEqual(r, { idb: 'NEW', legacy: 'OLD-TAB' }); return { ...r, safety: 'FORK-REQUIRES-MANUAL-RECONCILIATION' };
      });
      await record('dedicated-workers-not-single-authority', async () => {
        const start = p => p.evaluate(() => new Promise((resolve, reject) => {
          const w = new Worker('/worker.js'); w.onerror = reject; w.onmessage = e => { w.terminate(); resolve(e.data); }; w.postMessage('write');
        }));
        const observations = await Promise.all([start(page), start(other)]);
        assert.deepEqual(observations, [1, 1]); assert.equal(await start(page), 1);
        return { perTabSequence: observations, restartedSequence: 1, safety: 'COUNTEREXAMPLE' };
      });
      await record('restore-and-ordinary-share-transaction', async () => {
        await setup();
        const both = await Promise.all([page.evaluate(() => window.api.commit(window.db, window.expected, window.request('restore', 'RESTORED', 'restore'))),
          other.evaluate(() => window.api.commit(window.db, window.expected, { operation: 'ordinary', raw: 'NEW', writer: 'v2', instance: 'pageB', kind: 'ordinary' }))]);
        assert.deepEqual(both.map(x => x.status).sort(), ['COMMITTED_OBSERVED', 'REFUSED']); return both;
      });
      assert.deepEqual(result.cases.map(x => x.name), CASES); assert.deepEqual(result.pageerrors, []);
      result.status = 'PASS'; await context.close();
    } catch (e) { result.error = String(e.stack || e); process.exitCode = 1; }
    finally { await browser?.close(); await writeFile(`${out}/${engine}.json`, JSON.stringify(result, null, 2) + '\n', { flag: 'wx' }); }
  }
  const errors = validateArchitectureEvidence(evidence, sha);
  if (errors.length) { evidence.errors = errors; process.exitCode = 1; }
} finally {
  await new Promise(resolve => server.close(resolve));
  evidence.status = process.exitCode ? 'FAIL' : 'PASS';
  await writeFile(`${out}/summary.json`, JSON.stringify(evidence, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ out, ...evidence }, null, 2));
}
