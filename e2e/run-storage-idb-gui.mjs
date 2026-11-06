// Stage 3B-4 isolated browser acceptance. This never serves or imports the product application.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { once } from 'node:events';
import { join } from 'node:path';
import { build } from 'vite';
import { chromium, webkit } from './node_modules/playwright/index.mjs';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const sha = git('rev-parse', 'HEAD'), tree = git('rev-parse', 'HEAD^{tree}');
const out = join('gui-evidence', `storage-idb-${sha.slice(0, 12)}-${randomUUID()}`);
await mkdir(out, { recursive: true });
const evidence = {
  kind: 'isolated-idb-not-formal-gui', status: 'running', executionAllowed: false, HOLD: true,
  provenance: { sha, tree, dirty: !!git('status', '--porcelain'), node: process.version,
    platform: process.platform, startedAt: new Date().toISOString(),
    run: process.env.GITHUB_RUN_ID || 'local', attempt: process.env.GITHUB_RUN_ATTEMPT || 'local' },
  matrix: [], unverified: ['physical Safari', 'power loss/media flush', 'browser process crash', 'actual quota exhaustion', 'page termination during active native transaction'],
};
const save = () => writeFile(join(out, 'summary.json'), JSON.stringify(evidence, null, 2) + '\n');
await save();
let server, activeContext, browser;
const sha256 = value => createHash('sha256').update(value).digest('hex');
async function sourceDigest() {
  const hash = createHash('sha256');
  for (const file of git('ls-files', '-co', '--exclude-standard', '-z').split('\0').filter(Boolean).sort()) {
    hash.update(file); hash.update('\0'); hash.update(await readFile(file));
  }
  return hash.digest('hex');
}
const raw = value => ' \n' + JSON.stringify({ version: 1, history: [], notes: [], settings: { theme: 'light', activePanel: 'history' }, synthetic: value, futureNumber: 42 }, null, 2).replace('42', '900719925474099312345') + '\t';
const A = raw('A 😀'), B = raw('B 😀'), C = raw('C 😀');
try {
  assert.equal(sha, process.env.EXPECTED_SHA || sha, 'checkout must equal exact requested head');
  if (process.env.GITHUB_ACTIONS === 'true') {
    assert.equal(evidence.provenance.dirty, false, 'CI source must be clean');
    assert.equal(process.env.CHROMIUM_EXECUTABLE_PATH || '', '', 'CI uses pinned browsers');
  }
  evidence.provenance.chromiumExecutableOverride = process.env.CHROMIUM_EXECUTABLE_PATH || null;
  evidence.provenance.sourceSha256 = await sourceDigest();
  const output = await build({ configFile: false, logLevel: 'error', build: {
    write: false, minify: false, lib: { entry: 'e2e/fixtures/storage-idb.ts', formats: ['es'], fileName: 'fixture' },
    rolldownOptions: { output: { codeSplitting: false } },
  } });
  const chunks = (Array.isArray(output) ? output : [output]).flatMap(o => o.output).filter(entry => entry.type === 'chunk');
  assert.equal(chunks.length, 1, 'self-contained fixture module required');
  const fixtureModule = chunks[0].code;
  evidence.provenance.moduleSha256 = sha256(fixtureModule);
  await writeFile(join(out, 'fixture.bundle.mjs.txt'), fixtureModule, { flag: 'wx' });
  server = createServer((req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (req.url === '/fixture.mjs') { res.setHeader('Content-Type', 'text/javascript'); res.end(fixtureModule); }
    else if (req.url === '/identity.json') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(evidence.provenance)); }
    else if (req.url === '/') { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><meta charset="utf-8"><title>Stage 3B-4 synthetic transaction acceptance</title><script type="module">window.api=await import("/fixture.mjs")</script>'); }
    else { res.statusCode = 404; res.end(); }
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/`;
  evidence.provenance.origin = new URL(base).origin;
  for (const [engine, type] of [['chromium', chromium], ['webkit', webkit]]) {
    let engineFailure;
    try {
      browser = await type.launch({ headless: true, ...(engine === 'chromium' && process.env.CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } : {}) });
      for (const width of [375, 390, 765, 1280]) {
        const result = { engine, width, browserVersion: browser.version(), status: 'running', cases: [], errors: [] };
        evidence.matrix.push(result); await save();
        activeContext = await browser.newContext({ viewport: { width, height: 900 }, isMobile: width <= 390, hasTouch: width <= 390, serviceWorkers: 'block' });
        activeContext.setDefaultTimeout(10_000);
        await activeContext.route('**/*', route => new URL(route.request().url()).origin === new URL(base).origin ? route.continue() : route.abort());
        activeContext.on('page', p => p.on('pageerror', error => result.errors.push(String(error))));
        const page = await activeContext.newPage(), other = await activeContext.newPage();
        await Promise.all([page.goto(base), other.goto(base)]);
        await Promise.all([page.waitForFunction(() => !!window.api), other.waitForFunction(() => !!window.api)]);
        assert.equal(await page.evaluate(async () => (await fetch('/identity.json')).json().then(x => x.moduleSha256)), sha256(fixtureModule));
        await activeContext.tracing.start({ screenshots: false, snapshots: true, sources: true });
        const record = async (name, kind, fn) => {
          const entry = { name, kind, status: 'running', startedAt: new Date().toISOString() };
          result.cases.push(entry); await save();
          try { entry.observation = await fn(); entry.status = 'passed'; }
          catch (error) { entry.status = 'failed'; entry.error = error.stack || String(error); }
          entry.finishedAt = new Date().toISOString(); await save();
        };
        // Case implementations below use fixed input raw strings, never serialization from actual state.
        await runCases({ page, other, context: activeContext, base, record, A, B, C });
        assert.equal(result.cases.length, 39, 'complete isolated acceptance case count');
        assert.equal(new Set(result.cases.map(c => c.name)).size, 39, 'each case identity must be unique');
        assert.deepEqual(result.errors, [], 'no uncaught browser exceptions');
        result.status = result.cases.length > 0 && result.cases.every(c => c.status === 'passed') ? 'passed' : 'failed';
        if (result.status === 'failed') {
          await page.screenshot({ path: join(out, `${engine}-${width}-failed.png`) });
          await activeContext.tracing.stop({ path: join(out, `${engine}-${width}-trace.zip`) });
        } else await activeContext.tracing.stop();
        result.finishedAt = new Date().toISOString(); await save();
        await activeContext.close(); activeContext = null;
      }
    } catch (error) { engineFailure = error.stack || String(error); }
    finally {
      if (engineFailure) evidence.matrix.push({ engine, status: 'failed', error: engineFailure });
      await activeContext?.close(); activeContext = null;
      await browser?.close(); browser = null; await save();
    }
  }
  assert.equal(evidence.matrix.length, 8, 'both engines and all four widths must run');
  assert.ok(evidence.matrix.every(m => m.status === 'passed'), 'all conditions and negative controls must pass');
  assert.equal(await sourceDigest(), evidence.provenance.sourceSha256, 'source changed during acceptance');
  evidence.status = 'passed';
} catch (error) { evidence.status = 'failed'; evidence.error = error.stack || String(error); process.exitCode = 1; }
finally {
  await activeContext?.close(); await browser?.close();
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  evidence.finishedAt = new Date().toISOString(); await save();
  console.log(JSON.stringify({ out, status: evidence.status, matrix: evidence.matrix.map(m => ({ engine: m.engine, width: m.width, status: m.status, error: m.error, cases: m.cases?.map(c => ({ name: c.name, status: c.status, error: c.error })) })) }, null, 2));
}

async function runCases({ page, other, context, base, record, A, B, C }) {
  const setup = async () => {
    const name = 'stage3b4-test-' + randomUUID();
    const initial = await page.evaluate(async ({ name, raw }) => {
      window.dbName = name; window.faultPoint = null; window.events = []; window.postCommitFault = false; window.readbackFault = false;
      window.adapter = window.api.createIsolatedAdapter(name, {
        fault: point => { window.events.push({ point, at: performance.now() }); if (point === window.faultPoint) throw new DOMException('Injected ' + point, 'QuotaExceededError'); },
        afterComplete: () => { if (window.postCommitFault) throw new Error('Injected exception after complete'); },
        readback: snapshot => window.readbackFault ? { ...snapshot, current: 'Injected mismatch' } : snapshot,
      });
      const created = await window.adapter.initialize(raw, 'inc-' + name, raw);
      window.initial = await window.adapter.inspect(raw);
      const authorized = await window.adapter.authorize({ token: window.initial.token, raw, legacyRaw: raw });
      return { created, initial: window.initial, authorized };
    }, { name, raw: A });
    assert.equal(initial.created.status, 'CREATED');
    assert.equal(initial.initial.raw, A);
    assert.equal(initial.initial.token.generation, 0);
    assert.equal(initial.initial.executionAllowed, false);
    assert.equal(initial.initial.writeAllowed, false);
    assert.equal(initial.authorized.status, 'AUTHORIZED');
    const second = await other.evaluate(async ({ name, raw }) => {
      window.dbName = name; window.adapter = window.api.createIsolatedAdapter(name);
      window.initial = await window.adapter.inspect(raw);
      return window.adapter.authorize({ token: window.initial.token, raw, legacyRaw: raw });
    }, { name, raw: A });
    assert.equal(second.status, 'AUTHORIZED');
    return { name, initial };
  };
  const save = (p, operationId, candidateRaw = B, override = {}) => p.evaluate(({ operationId, candidateRaw, override, legacyRaw }) => window.adapter.save({
    protocol: 1, expected: window.initial.token, expectedRaw: window.initial.raw, candidateRaw, operationId, legacyRaw, ...override,
  }), { operationId, candidateRaw, override, legacyRaw: A });
  const inspect = p => p.evaluate(raw => window.adapter.inspect(raw), A);
  const refresh = p => p.evaluate(async raw => {
    window.initial = await window.adapter.inspect(raw);
    return window.adapter.authorize({ token: window.initial.token, raw: window.initial.raw, legacyRaw: raw });
  }, A);
  const nativeSnapshot = p => p.evaluate(() => new Promise((resolve, reject) => {
    const request = indexedDB.open(window.dbName);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction('records', 'readonly'), records = {};
      const cursor = tx.objectStore('records').openCursor();
      cursor.onsuccess = () => { const c = cursor.result; if (c) { records[c.key] = c.value; c.continue(); } };
      tx.oncomplete = () => { db.close(); resolve(records); };
      tx.onabort = () => { db.close(); reject(tx.error); };
    };
  }));
  const corrupt = (p, action) => p.evaluate(action => new Promise((resolve, reject) => {
    const request = indexedDB.open(window.dbName);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction('records', 'readwrite'), store = tx.objectStore('records');
      const cursor = store.openCursor();
      cursor.onsuccess = () => {
        const c = cursor.result; if (!c) return;
        const key = String(c.key);
        if (action === 'missing-receipt' && key.startsWith('receipt:')) c.delete();
        if (action === 'missing-copy' && key.startsWith('copy:')) c.delete();
        if (action === 'corrupt-current' && key === 'current') c.update('corrupt-not-json');
        if (action === 'corrupt-copy' && key.startsWith('copy:')) c.update({ ...c.value, raw: 'corrupted-copy' });
        if (action === 'corrupt-generation' && key === 'head') c.update({ ...c.value, generation: -1 });
        if (action === 'unknown-protocol' && key === 'head') c.update({ ...c.value, protocol: 999 });
        c.continue();
      };
      tx.oncomplete = () => { db.close(); resolve(true); };
      tx.onabort = () => { db.close(); reject(tx.error); };
    };
  }), action);
  const primary = snapshot => Object.fromEntries(Object.entries(snapshot).filter(([k]) => k === 'current' || k === 'head' || k.startsWith('receipt:') || k.startsWith('copy:')));

  await record('raw-atomic-normal-and-reopen', 'real-browser', async () => {
    const { name } = await setup(); const initial = await nativeSnapshot(page);
    const result = await save(page, 'normal', B); assert.equal(result.status, 'VERIFIED');
    const final = await inspect(page), snapshot = await nativeSnapshot(page);
    assert.equal(final.raw, B, 'exact input raw including whitespace/large integer/Unicode preserved');
    assert.equal(final.token.generation, 1); assert.equal(final.token.latestOperation, 'normal');
    assert.equal(Object.keys(snapshot).filter(k => k.startsWith('receipt:')).length, Object.keys(initial).filter(k => k.startsWith('receipt:')).length + 1);
    assert.equal(Object.keys(snapshot).filter(k => k.startsWith('copy:')).length, 1);
    const reopened = await other.evaluate(async ({ name, raw }) => { window.adapter.close(); window.adapter = window.api.createIsolatedAdapter(name); return window.adapter.inspect(raw); }, { name, raw: A });
    assert.equal(reopened.raw, B); assert.equal(reopened.writeAllowed, false);
    assert.equal((await save(other, 'restart-without-explicit-authorize', C)).status, 'BLOCKED');
    return { result, final, reopened };
  });
  await record('same-generation-actual-two-tabs', 'real-multi-tab', async () => {
    await setup();
    const outcomes = await Promise.all([save(page, 'tab-a', B), save(other, 'tab-b', C)]);
    assert.deepEqual(outcomes.map(r => r.status).sort(), ['CONFLICT', 'VERIFIED']);
    const final = await inspect(page); assert.equal(final.token.generation, 1);
    assert.equal(final.raw, outcomes[0].status === 'VERIFIED' ? B : C);
    return { outcomes, final };
  });
  await record('stale-tab-save-before-another-operation', 'real-multi-tab', async () => {
    await setup(); assert.equal((await save(other, 'interference', C)).status, 'VERIFIED');
    const result = await save(page, 'stale', B); assert.equal(result.status, 'CONFLICT');
    assert.equal((await inspect(other)).raw, C); return result;
  });
  await record('aba-same-raw-stale-generation-refused', 'real-multi-tab', async () => {
    await setup(); assert.equal((await save(other, 'aba-b', B)).status, 'VERIFIED');
    assert.equal((await refresh(other)).status, 'AUTHORIZED');
    assert.equal((await save(other, 'aba-a', A)).status, 'VERIFIED');
    const current = await inspect(other); assert.equal(current.raw, A); assert.equal(current.token.generation, 2);
    const result = await save(page, 'aba-stale', C); assert.equal(result.status, 'CONFLICT'); return { result, current };
  });
  await record('duplicate-operation-id-refused', 'real-browser', async () => {
    await setup(); assert.equal((await save(page, 'duplicate', B)).status, 'VERIFIED');
    await refresh(page); const before = await nativeSnapshot(page);
    const result = await save(page, 'duplicate', C); assert.notEqual(result.status, 'VERIFIED');
    assert.deepEqual(primary(await nativeSnapshot(page)), primary(before)); return result;
  });
  for (const [name, override] of [
    ['old-incarnation', { expected: { structure: 1, incarnation: 'old-incarnation', generation: 0, latestOperation: 'genesis' } }],
    ['unknown-request-protocol', { protocol: 999 }],
    ['unknown-request-structure', { expected: { structure: 999, incarnation: 'unknown', generation: 0, latestOperation: 'genesis' } }],
    ['wrong-expected-raw', { expectedRaw: 'not original' }],
    ['generation-overflow-request', { expected: { structure: 1, incarnation: 'unknown', generation: Number.MAX_SAFE_INTEGER + 1, latestOperation: 'genesis' } }],
    ['invalid-candidate-schema', { candidateRaw: '{"version":999}' }],
  ]) await record(name, 'synthetic-request', async () => {
    await setup(); const before = await nativeSnapshot(page), result = await save(page, name, B, override);
    assert.notEqual(result.status, 'VERIFIED'); assert.deepEqual(primary(await nativeSnapshot(page)), primary(before)); return result;
  });
  for (const point of ['current-put', 'head-put', 'copy-put', 'receipt-put', 'intent-commit-put', 'request-success']) {
    await record('atomic-abort-' + point, 'injected-fault-real-idb-transaction', async () => {
      const { name } = await setup(), before = await nativeSnapshot(page);
      await page.evaluate(point => { window.faultPoint = point; }, point);
      const result = await save(page, 'abort-' + point, B); assert.equal(result.status, 'UNKNOWN');
      const after = await nativeSnapshot(other); assert.deepEqual(primary(after), primary(before), 'all primary/copy/token/receipt changes rollback together');
      const blocked = await save(page, 'auto-retry-' + point, C); assert.equal(blocked.status, 'BLOCKED');
      const recovered = await other.evaluate(async ({ name, raw }) => { window.adapter.close(); window.adapter = window.api.createIsolatedAdapter(name); return window.adapter.inspect(raw); }, { name, raw: A });
      assert.notEqual(recovered.state, 'READ_ONLY');
      return { result, blocked, recovered, events: await page.evaluate(() => window.events) };
    });
  }
  for (const point of ['complete', 'ack-put']) await record('committed-notification-failure-' + point, 'injected-postcommit-notification', async () => {
    await setup(); await page.evaluate(point => { window.faultPoint = point; }, point);
    const result = await save(page, 'lost-' + point, B); assert.equal(result.status, 'UNKNOWN');
    const snapshot = await nativeSnapshot(other);
    assert.equal((await inspect(other)).raw, B, 'data committed despite UNKNOWN acknowledgement');
    const blocked = await save(page, 'retry-lost-' + point, C); assert.equal(blocked.status, 'BLOCKED');
    return { result, snapshot, blocked };
  });
  await record('post-complete-exception-and-original-outcome', 'injected-postcommit-exception', async () => {
    await setup(); await page.evaluate(() => { window.postCommitFault = true; });
    const result = await save(page, 'post-complete-throw', B); assert.equal(result.status, 'UNKNOWN');
    const recovery = await inspect(other); assert.equal(recovery.raw, B); assert.notEqual(recovery.state, 'READ_ONLY');
    assert.equal((await save(page, 'retry-post-throw', C)).status, 'BLOCKED'); return { originalOutcome: result, laterObservation: recovery };
  });
  await record('postcommit-readback-mismatch', 'injected-readback', async () => {
    await setup(); await page.evaluate(() => { window.readbackFault = true; });
    const result = await save(page, 'mismatch', B); assert.equal(result.status, 'UNKNOWN');
    assert.equal((await inspect(other)).raw, B); assert.equal((await save(page, 'retry-mismatch', C)).status, 'BLOCKED'); return result;
  });
  await record('intent-persistence-failure-fail-closed', 'injected-quota-at-intent', async () => {
    await setup(); const before = await nativeSnapshot(page);
    await page.evaluate(() => { window.faultPoint = 'intent-put'; });
    const result = await save(page, 'intent-fail', B); assert.notEqual(result.status, 'VERIFIED');
    assert.deepEqual(primary(await nativeSnapshot(other)), primary(before));
    assert.equal((await save(page, 'intent-fail-retry', C)).status, 'BLOCKED'); return result;
  });
  await record('diagnostic-persistence-failure-fail-closed', 'injected-double-fault', async () => {
    await setup(); await page.evaluate(() => { window.postCommitFault = true; window.faultPoint = 'diagnostic-put'; });
    const result = await save(page, 'diagnostic-fail', B); assert.equal(result.status, 'UNKNOWN');
    const later = await inspect(other); assert.notEqual(later.state, 'READ_ONLY');
    assert.equal((await save(page, 'diagnostic-retry', C)).status, 'BLOCKED'); return { originalOutcome: result, laterObservation: later };
  });
  for (const fault of ['missing-receipt', 'missing-copy', 'corrupt-current', 'corrupt-copy', 'corrupt-generation', 'unknown-protocol']) {
    await record('authority-rejects-' + fault, 'synthetic-corruption-real-idb', async () => {
      await setup(); assert.equal((await save(page, 'before-corruption', B)).status, 'VERIFIED');
      await corrupt(other, fault); const before = await nativeSnapshot(other), result = await inspect(page);
      assert.notEqual(result.state, 'READ_ONLY'); assert.equal(result.writeAllowed, false);
      const attempt = await save(page, 'after-corruption', C); assert.notEqual(attempt.status, 'VERIFIED');
      assert.deepEqual(primary(await nativeSnapshot(other)), primary(before), 'reader and refused save cannot repair corruption'); return { result, attempt };
    });
  }
  await record('old-localstorage-tab-divergence', 'real-multi-tab', async () => {
    await setup();
    await page.evaluate(raw => localStorage.setItem('stage3b4-test-legacy', raw), A);
    assert.equal((await save(page, 'idb-new', B)).status, 'VERIFIED');
    await other.evaluate(raw => localStorage.setItem('stage3b4-test-legacy', raw), C);
    const before = await nativeSnapshot(page);
    const result = await page.evaluate(() => window.adapter.inspect(localStorage.getItem('stage3b4-test-legacy')));
    assert.notEqual(result.state, 'READ_ONLY'); assert.equal(result.raw, B);
    assert.equal(await page.evaluate(() => localStorage.getItem('stage3b4-test-legacy')), C);
    assert.deepEqual(await nativeSnapshot(page), before, 'no automatic merge or import'); return result;
  });
  await record('eight-recovery-slots-preserved-ninth-refused', 'real-browser', async () => {
    await setup(); const outcomes = [];
    for (let n = 1; n <= 8; n++) {
      if (n > 1) assert.equal((await refresh(page)).status, 'AUTHORIZED');
      const candidate = n % 2 ? B : A;
      const result = await save(page, 'slot-' + n, candidate); assert.equal(result.status, 'VERIFIED'); outcomes.push(result.status);
    }
    assert.equal((await refresh(page)).status, 'AUTHORIZED');
    const before = await nativeSnapshot(page), rejected = await save(page, 'slot-9', C);
    assert.equal(rejected.status, 'BLOCKED'); assert.deepEqual(await nativeSnapshot(page), before);
    assert.equal(Object.keys(before).filter(k => k.startsWith('copy:')).length, 8);
    for (let n = 1; n <= 8; n++) assert.equal(before['copy:' + n].raw, n % 2 ? A : B, 'each preserved source is exact independent input');
    return { outcomes, rejected, generation: 8, preservedCopies: 8 };
  });
  await record('readonly-inspect-does-not-create', 'real-browser', async () => {
    const name = 'stage3b4-test-missing-' + randomUUID();
    const result = await page.evaluate(async ({ name, raw }) => {
      const adapter = window.api.createIsolatedAdapter(name), inspected = await adapter.inspect(raw); adapter.close();
      const request = indexedDB.open(name); let created = false;
      await new Promise((resolve, reject) => { request.onupgradeneeded = () => { created = true; request.transaction.abort(); }; request.onsuccess = () => { request.result.close(); resolve(); }; request.onerror = () => created ? resolve() : reject(request.error); });
      return { inspected, absentAfterInspect: created };
    }, { name, raw: A });
    assert.equal(result.absentAfterInspect, true); assert.notEqual(result.inspected.state, 'READ_ONLY'); return result;
  });
  await record('real-page-close-after-commit-reopen', 'actual-page-close-not-process-crash', async () => {
    const { name } = await setup();
    const producer = await context.newPage(); await producer.goto(base); await producer.waitForFunction(() => !!window.api);
    const committed = await producer.evaluate(async ({ name, raw, candidate }) => {
      const adapter = window.api.createIsolatedAdapter(name), initial = await adapter.inspect(raw);
      await adapter.authorize({ token: initial.token, raw, legacyRaw: raw });
      return adapter.save({ protocol: 1, expected: initial.token, expectedRaw: raw, candidateRaw: candidate, operationId: 'page-close', legacyRaw: raw });
    }, { name, raw: A, candidate: B });
    assert.equal(committed.status, 'VERIFIED'); await producer.close();
    const restarted = await other.evaluate(async ({ name, raw }) => { window.adapter.close(); window.adapter = window.api.createIsolatedAdapter(name); return window.adapter.inspect(raw); }, { name, raw: A });
    assert.equal(restarted.raw, B); assert.equal(restarted.writeAllowed, false);
    const noRetry = await save(other, 'page-close-retry', C); assert.equal(noRetry.status, 'BLOCKED');
    return { committed, restarted, noRetry, interruption: 'actual page close after observed completion; browser process remained alive' };
  });
  await record('unavailable-indexeddb-fail-closed', 'injected-unavailable-factory', async () => {
    const result = await page.evaluate(async raw => {
      const adapter = window.api.createIsolatedAdapter('stage3b4-test-unavailable', { factory: { open() { throw new DOMException('Synthetic IndexedDB unavailable', 'SecurityError'); } } });
      return { initialization: await adapter.initialize(raw, 'synthetic-incarnation'), inspection: await adapter.inspect(raw) };
    }, A);
    assert.equal(result.initialization.status, 'UNAVAILABLE'); assert.equal(result.inspection.state, 'UNKNOWN');
    assert.equal(result.inspection.writeAllowed, false); return result;
  });
  await record('native-versionchange-closes-and-holds', 'native-idb-versionchange', async () => {
    await setup(); await other.evaluate(() => window.adapter.close());
    const version = await other.evaluate(() => new Promise((resolve, reject) => {
      const request = indexedDB.open(window.dbName, 2);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => { const db = request.result, version = db.version; db.close(); resolve(version); };
    }));
    assert.equal(version, 2);
    const result = await save(page, 'after-versionchange', B); assert.equal(result.status, 'BLOCKED');
    const inspected = await inspect(page); assert.equal(inspected.state, 'UNKNOWN');
    return { nativeVersion: version, result, inspected };
  });
  await record('blocked-upgrade-native-event', 'native-blocked-upgrade-with-forced-factory-version', async () => {
    const { name } = await setup(); await Promise.all([page.evaluate(() => window.adapter.close()), other.evaluate(() => window.adapter.close())]);
    await other.evaluate(() => new Promise((resolve, reject) => {
      const request = indexedDB.open(window.dbName, 1);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => { window.upgradeBlocker = request.result; window.blockedEvents = []; window.upgradeBlocker.onversionchange = event => window.blockedEvents.push({ type: event.type, at: performance.now() }); resolve(); };
    }));
    try {
      const inspected = await page.evaluate(async ({ name, raw }) => {
        // Explicit factory injection forces an upgrade; the IDB blocked event itself is native.
        const adapter = window.api.createIsolatedAdapter(name, { factory: { open: n => indexedDB.open(n, 2) } });
        return adapter.inspect(raw);
      }, { name, raw: A });
      assert.equal(inspected.state, 'UNKNOWN'); assert.match(inspected.reason, /blocked/);
      const nativeEvents = await other.evaluate(() => window.blockedEvents); assert.equal(nativeEvents[0].type, 'versionchange');
      return { inspected, nativeEvents, injection: 'factory chooses version 2; native connection deliberately refuses versionchange close' };
    } finally { await other.evaluate(() => window.upgradeBlocker.close()); }
  });
  await record('real-page-close-before-save', 'actual-page-close-before-request', async () => {
    const { name } = await setup(), before = await nativeSnapshot(page);
    const producer = await context.newPage(); await producer.goto(base); await producer.waitForFunction(() => !!window.api);
    await producer.evaluate(async ({ name, raw }) => {
      window.adapter = window.api.createIsolatedAdapter(name); const initial = await window.adapter.inspect(raw);
      return window.adapter.authorize({ token: initial.token, raw, legacyRaw: raw });
    }, { name, raw: A });
    await producer.close(); const after = await nativeSnapshot(other); assert.deepEqual(after, before);
    return { unchanged: true, interruption: 'actual page close after explicit authorize, before save request' };
  });
  await record('real-page-close-after-commit-before-ack', 'actual-page-close-with-injected-ack-barrier', async () => {
    const { name } = await setup(); const producer = await context.newPage(); await producer.goto(base); await producer.waitForFunction(() => !!window.api);
    await producer.evaluate(async ({ name, raw, candidate }) => {
      window.commitObserved = false;
      const adapter = window.api.createIsolatedAdapter(name, { afterComplete: () => { window.commitObserved = true; return new Promise(() => {}); } });
      const initial = await adapter.inspect(raw); await adapter.authorize({ token: initial.token, raw, legacyRaw: raw });
      window.pendingSave = adapter.save({ protocol: 1, expected: initial.token, expectedRaw: raw, candidateRaw: candidate, operationId: 'close-before-ack', legacyRaw: raw });
    }, { name, raw: A, candidate: B });
    await producer.waitForFunction(() => window.commitObserved); await producer.close();
    const inspected = await other.evaluate(async ({ name, raw }) => { window.adapter.close(); window.adapter = window.api.createIsolatedAdapter(name); return window.adapter.inspect(raw); }, { name, raw: A });
    assert.equal(inspected.raw, B); assert.equal(inspected.state, 'HOLD');
    assert.equal((await refresh(other)).status, 'BLOCKED');
    const result = await save(other, 'after-page-termination', C); assert.equal(result.status, 'BLOCKED');
    return { inspected, result, interruption: 'actual page close after tx complete at explicit synthetic ack barrier; not browser crash or power loss' };
  });
  await record('namespace-rejects-production-name', 'synthetic-request', async () => {
    const result = await page.evaluate(() => { try { window.api.createIsolatedAdapter('calculation-memo'); return 'accepted'; } catch { return 'rejected'; } });
    assert.equal(result, 'rejected'); return { result };
  });
}
