// Stage 3B-5 isolated browser acceptance. This never serves or imports the product application.
import assert from 'node:assert/strict';
import { validateMigrationEvidence } from './storage-migration-evidence.mjs';
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
const out = join('gui-evidence', `storage-migration-${sha.slice(0, 12)}-${randomUUID()}`);
await mkdir(out, { recursive: true });
const evidence = {
  kind: 'isolated-migration-not-formal-gui', status: 'running', executionAllowed: false, HOLD: true,
  provenance: { sha, tree, dirty: !!git('status', '--porcelain'), node: process.version,
    platform: process.platform, startedAt: new Date().toISOString(),
    run: process.env.GITHUB_RUN_ID || 'local', attempt: process.env.GITHUB_RUN_ATTEMPT || 'local' },
  matrix: [], unverified: ['physical Safari', 'power loss/media flush', 'browser process crash', 'actual quota exhaustion', 'uncontrolled page/process crash' ],
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
const E = JSON.stringify({ version: 1, history: [], notes: [], settings: { theme: 'light', activePanel: 'history' } });
const stamp = '2026-01-01T00:00:00.000Z';
const raw = value => ' \n' + JSON.stringify({ version: 1,
  history: [{ id: 'history-synthetic', expression: '1+1', displayExpression: '1+1', result: 2, resultText: '2', createdAt: stamp }],
  notes: [{ id: 'note-synthetic', type: 'plain-calculation', title: 'Synthetic memo', content: value, createdAt: stamp, updatedAt: stamp }],
  formulaLibrary: { version: 1, entries: [{ id: 'formula-synthetic', title: 'Synthetic formula', expression: 'x+1', createdAt: stamp, updatedAt: stamp }], selectedId: 'formula-synthetic' },
  settings: { theme: 'light', activePanel: 'history' }, synthetic: value, futureNumber: 42 }, null, 2).replace('42', '900719925474099312345') + '\t';
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
    write: false, minify: false, lib: { entry: 'e2e/fixtures/storage-migration-browser.ts', formats: ['es'], fileName: 'fixture' },
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
    else if (req.url === '/') { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Stage 3B-5 synthetic transaction acceptance</title><script type="module">window.api=await import("/fixture.mjs")</script>'); }
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
        await runCases({ page, other, context: activeContext, base, record, A, B, C, E, width, engineType: type, launchOptions: { headless: true, ...(engine === 'chromium' && process.env.CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH } : {}) } });
        assert.equal(result.cases.length, 33, 'all 33 migration and negative and lifecycle cases must execute');
        assert.equal(new Set(result.cases.map(c => c.name)).size, 33, 'case identities must be unique');
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
  assert.deepEqual(validateMigrationEvidence(evidence), [], 'complete fixed-case evidence required');
} catch (error) { evidence.status = 'failed'; evidence.error = error.stack || String(error); process.exitCode = 1; }
finally {
  await activeContext?.close(); await browser?.close();
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  evidence.finishedAt = new Date().toISOString(); await save();
  console.log(JSON.stringify({ out, status: evidence.status, matrix: evidence.matrix.map(m => ({ engine: m.engine, width: m.width, status: m.status, error: m.error, cases: m.cases?.map(c => ({ name: c.name, status: c.status, error: c.error })) })) }, null, 2));
}

async function runCases({ page, other, record, A, B, C, E }) {
  const setup = async ({ source = A, target = E } = {}) => {
    const name = 'stage3b4-test-migration-' + randomUUID(), key = 'stage3b5-test-source-' + randomUUID();
    const initial = await page.evaluate(async ({ name, key, source, target }) => {
      window.dbName = name; window.sourceKey = key; window.sourceRaw = source; window.targetRaw = target;
      window.events = []; window.faultPoint = null; window.faultAction = 'throw'; window.adapterFault = null; window.adapterReadback = false;
      localStorage.setItem(key, source); localStorage.setItem('unrelated-synthetic', 'preserve');
      window.adapter = window.api.createIsolatedAdapter(name);
      const creation = await window.adapter.initialize(target, 'incarnation', source);
      window.initial = await window.adapter.inspect(source);
      window.newEngine = () => window.api.createMigrationEngine({
        source: { key, getItem: key => localStorage.getItem(key) }, targetName: name,
        adapterOptions: { fault: point => { window.events.push('adapter:' + point); if (point === window.adapterFault) throw Error('injected-' + point); }, readback: snapshot => window.adapterReadback ? { ...snapshot, current: 'corrupt' } : snapshot },
        fault: async point => {
          window.events.push(point);
          if (point !== window.faultPoint) return;
          if (window.faultAction === 'change-source') localStorage.setItem(key, window.changedRaw);
          else if (window.faultAction === 'barrier') { window.barrierReached = true; await new Promise(resolve => { window.releaseBarrier = resolve; }); }
          else if (window.faultAction === 'close') window.engine.close();
          else throw Error('injected-' + point);
        },
      });
      window.engine = window.newEngine();
      window.request = { migrationId: 'migration', expectedSourceRaw: source, expectedTargetRaw: target, expectedTargetToken: window.initial.token };
      window.baseEvidence = { sourceRaw: source, targetRaw: target, targetToken: window.initial.token };
      return { creation, initial: window.initial };
    }, { name, key, source, target });
    assert.equal(initial.creation.status, 'CREATED'); assert.equal(initial.initial.raw, target);
    await other.evaluate(({ name, key, source, target, token }) => {
      window.dbName = name; window.sourceKey = key; window.adapter = window.api.createIsolatedAdapter(name);
      window.engine = window.api.createMigrationEngine({ source: { key, getItem: key => localStorage.getItem(key) }, targetName: name });
      window.request = { migrationId: 'other-migration', expectedSourceRaw: source, expectedTargetRaw: target, expectedTargetToken: token };
    }, { name, key, source, target, token: initial.initial.token });
    return { name, key, initial };
  };
  const migrate = (p = page) => p.evaluate(() => window.engine.migrate(window.request));
  const native = (p = page, journal = false) => p.evaluate(({ journal }) => new Promise((resolve, reject) => {
    let absent = false; const request = indexedDB.open(window.dbName + (journal ? '-migration' : ''));
    request.onupgradeneeded = () => { absent = true; request.transaction.abort(); };
    request.onerror = () => absent ? resolve({}) : reject(request.error);
    request.onsuccess = () => {
      const db = request.result, tx = db.transaction(journal ? 'evidence' : 'records', 'readonly'), records = {};
      const cursor = tx.objectStore(journal ? 'evidence' : 'records').openCursor();
      cursor.onsuccess = () => { const c = cursor.result; if (c) { records[c.key] = c.value; c.continue(); } };
      tx.oncomplete = () => { db.close(); resolve(records); }; tx.onabort = () => { db.close(); reject(tx.error); };
    };
  }), { journal });
  const oldRaw = () => page.evaluate(() => localStorage.getItem(window.sourceKey));
  const setOld = value => other.evaluate(value => localStorage.setItem(window.sourceKey, value), value);
  const preview = (withBase = true) => page.evaluate(withBase => window.engine.preview(withBase ? window.baseEvidence : undefined), withBase);
  const rescue = id => page.evaluate(id => window.engine.preserveBranches({ rescueId: id, base: window.baseEvidence }), id);
  const configure = (point, action = 'throw') => page.evaluate(({ point, action, changed }) => { window.faultPoint = point; window.faultAction = action; window.changedRaw = changed; }, { point, action, changed: B });
  const primary = s => Object.fromEntries(Object.entries(s).filter(([k]) => k === 'current' || k === 'head' || k.startsWith('receipt:') || k.startsWith('copy:')));
  const targetWrite = async value => other.evaluate(async ({ value, source }) => {
    const current = await window.adapter.inspect(source);
    const auth = await window.adapter.authorize({ token: current.token, raw: current.raw, legacyRaw: source });
    const saved = await window.adapter.save({ protocol: 1, expected: current.token, expectedRaw: current.raw, candidateRaw: value, operationId: 'new-writer', legacyRaw: source });
    return { auth, saved };
  }, { value, source: A });
  const corrupt = action => other.evaluate(action => new Promise((resolve, reject) => {
    const r = indexedDB.open(window.dbName); r.onerror = () => reject(r.error);
    r.onsuccess = () => { const db = r.result, tx = db.transaction('records', 'readwrite'), store = tx.objectStore('records');
      const q = store.openCursor(); q.onsuccess = () => { const c = q.result; if (!c) return;
        if (action === 'generation' && c.key === 'head') c.update({ ...c.value, generation: -1 });
        if (action === 'receipt' && String(c.key).startsWith('receipt:')) c.delete();
        if (action === 'raw' && c.key === 'current') c.update('broken-target'); c.continue(); };
      tx.oncomplete = () => { db.close(); resolve(); }; tx.onabort = () => { db.close(); reject(tx.error); };
    };
  }), action);

  await record('migration-preserves-source-raw-and-atomic-receipt', 'native-idb', async () => {
    await setup(); const before = await native(), result = await migrate(), after = await native(), journal = await native(page, true);
    assert.equal(result.state, 'VERIFIED'); assert.equal(after.current, A); assert.equal(await oldRaw(), A);
    assert.equal(after.head.generation, 1); assert.equal(after['receipt:migration'].raw, A); assert.equal(after['copy:1'].raw, E);
    assert.equal(journal['receipt:migration'].sourceRaw, A); assert.equal(await page.evaluate(() => localStorage.getItem('unrelated-synthetic')), 'preserve');
    assert.deepEqual(Object.keys(before).sort(), ['control', 'current', 'head', 'receipt:genesis']);
    return { result, after, journal };
  });
  await record('preview-is-read-only-and-complete', 'native-readonly', async () => {
    await setup(); const before = await native(), result = await preview(), after = await native();
    assert.equal(result.executionAllowed, false); assert.equal(result.writeAllowed, false); assert.deepEqual(before, after);
    assert.equal(result.candidateCount, 3); assert.equal(result.wholeDocumentCandidateCount, 1); assert.equal(result.branchCount, 2);
    assert.deepEqual(result.sourceDetails.counts, { history: 1, notes: 1, formulas: 1, reports: 0, executions: 0 });
    for (const field of ['source', 'destination', 'sourceDetails', 'targetDetails', 'targetGeneration', 'sourceGeneration', 'exactRawEquality', 'candidateCount', 'collisionIds', 'reasons', 'rawPreservation', 'plannedChanges', 'protectedTargets', 'verification']) assert.ok(field in result, field);
    assert.deepEqual(await native(page, true), {}); return result;
  });
  await record('known-absence-and-source-only-or-target-only', 'native-and-pure-presence', async () => {
    await setup(); const snapshot = await native();
    const result = await page.evaluate(({ A, snapshot }) => ({ old: window.api.classifyBranches(A, null), idb: window.api.classifyBranches(null, snapshot), absent: window.api.classifyBranches(null, null), unknown: window.api.classifyBranches(A, undefined) }), { A, snapshot });
    assert.deepEqual(result, { old: 'ONLY_OLD', idb: 'ONLY_IDB', absent: 'ABSENT', unknown: 'UNKNOWN' });
    await other.evaluate(() => localStorage.removeItem(window.sourceKey)); assert.equal((await preview()).classification, 'ONLY_IDB'); return result;
  });
  await record('causal-branches-not-timestamp-authority', 'native-classification', async () => {
    await setup({ target: A }); assert.equal((await preview()).classification, 'SAME');
    await setOld(B); assert.equal((await preview()).classification, 'SOURCE_ONLY_CHANGE'); assert.equal((await preview(false)).classification, 'UNKNOWN');
    await setOld(A); assert.equal((await targetWrite(C)).saved.status, 'VERIFIED'); assert.equal((await preview()).classification, 'TARGET_ONLY_CHANGE');
    await setOld(B); const both = await preview(); assert.equal(both.classification, 'BOTH_CHANGED'); return both;
  });
  await record('stale-source-before-request-no-target-overwrite', 'native-old-writer', async () => {
    await setup(); const before = await native(); await setOld(B); const result = await migrate();
    assert.equal(result.state, 'CONFLICT'); assert.deepEqual(primary(await native()), primary(before)); assert.equal(await oldRaw(), B); return result;
  });
  await record('source-change-during-read-detected', 'source-read-fault', async () => {
    await setup(); await configure('source-after-read', 'change-source'); const result = await migrate();
    assert.equal(result.state, 'UNKNOWN'); assert.equal((await native()).current, E); assert.equal(await oldRaw(), B); return result;
  });
  await record('source-change-before-read-frozen-mismatch', 'source-read-fault', async () => {
    await setup(); await configure('source-before-read', 'change-source'); const result = await migrate();
    assert.equal(result.state, 'CONFLICT'); assert.equal((await native()).current, E); return result;
  });
  await record('source-change-in-read-write-gap-detected', 'source-precommit-fault', async () => {
    await setup(); await configure('source-precommit', 'change-source'); const result = await migrate();
    assert.equal(result.state, 'CONFLICT'); assert.equal((await native()).current, E); return result;
  });
  await record('legitimate-target-branch-never-overwritten', 'native-target-conflict', async () => {
    await setup({ target: B }); const before = await native(), result = await migrate();
    assert.equal(result.state, 'CONFLICT'); assert.deepEqual(primary(await native()), primary(before)); return result;
  });
  await record('duplicate-request-does-not-register-twice', 'native-idempotence', async () => {
    await setup(); assert.equal((await migrate()).state, 'VERIFIED'); const before = await native(), journal = await native(page, true), result = await migrate();
    assert.equal(result.state, 'BLOCKED'); assert.deepEqual(await native(), before); assert.deepEqual(await native(page, true), journal); return result;
  });
  await record('parallel-same-controller-does-not-double-write', 'native-concurrency', async () => {
    await setup(); const results = await page.evaluate(() => Promise.all([window.engine.migrate(window.request), window.engine.migrate(window.request)]));
    assert.ok(results.every(x => ['UNKNOWN', 'BLOCKED', 'VERIFIED'].includes(x.state))); assert.ok(results.filter(x => x.state === 'VERIFIED').length <= 1);
    assert.ok((await native()).head.generation <= 1); return results;
  });
  await record('actual-two-tab-migration-serialized', 'native-multi-tab', async () => {
    await setup(); const results = await Promise.all([migrate(page), migrate(other)]);
    assert.deepEqual(results.map(x => x.state).sort(), ['BLOCKED', 'VERIFIED']); assert.equal((await native()).head.generation, 1); return results;
  });
  await record('closed-queued-migration-cannot-revive', 'native-lock-queue', async () => {
    await setup(); await other.evaluate(() => { window.lockReady = false; window.holding = navigator.locks.request(window.dbName + ':migration', async () => { window.lockReady = true; await new Promise(r => { window.unlock = r; }); }); });
    await other.waitForFunction(() => window.lockReady);
    await page.evaluate(() => { window.pending = window.engine.migrate(window.request); }); await page.evaluate(() => window.engine.close());
    await other.evaluate(() => window.unlock()); const result = await page.evaluate(() => window.pending);
    assert.notEqual(result.state, 'VERIFIED'); assert.equal((await native()).current, E); assert.deepEqual(await native(page, true), {}); return result;
  });
  await record('caller-mutation-cannot-change-frozen-request', 'async-input-mutation', async () => {
    await setup(); await configure('before-save', 'barrier'); await page.evaluate(() => { window.pending = window.engine.migrate(window.request); });
    await page.waitForFunction(() => window.barrierReached); await page.evaluate(raw => { window.request.expectedSourceRaw = raw; window.request.migrationId = 'mutated'; window.releaseBarrier(); }, B);
    const result = await page.evaluate(() => window.pending); assert.equal(result.state, 'VERIFIED'); const after = await native();
    assert.equal(after.current, A); assert.equal(after.head.latestOperation, 'migration'); return result;
  });
  for (const [name, fault] of [['transaction-abort-after-request-success', 'request-success'], ['receipt-put-failure-atomic-old-primary', 'receipt-put'], ['commit-response-loss-UNKNOWN-no-retry', 'complete']]) {
    await record(name, 'native-transaction-injected-fault', async () => {
      await setup(); const before = await native(); await page.evaluate(fault => { window.adapterFault = fault; }, fault);
      const result = await migrate(), after = await native(); assert.equal(result.state, 'UNKNOWN'); assert.equal(await oldRaw(), A);
      if (fault === 'complete') assert.equal(after.current, A); else assert.deepEqual(primary(after), primary(before));
      const retry = await migrate(); assert.equal(retry.state, 'BLOCKED'); assert.deepEqual(await native(), after); return { result, retry, after };
    });
  }
  await record('adapter-readback-mismatch-HOLD', 'injected-readback', async () => {
    await setup(); await page.evaluate(() => { window.adapterReadback = true; }); const result = await migrate();
    assert.equal(result.state, 'UNKNOWN'); assert.equal((await native()).current, A); assert.equal((await migrate()).state, 'BLOCKED'); return result;
  });
  await record('migration-readback-failure-HOLD', 'injected-readback', async () => {
    await setup(); await configure('readback'); const result = await migrate(); assert.equal(result.state, 'UNKNOWN');
    assert.equal((await native()).current, A); assert.equal((await migrate()).state, 'BLOCKED'); return result;
  });
  await record('journal-receipt-failure-retains-durable-attempt', 'native-journal-fault', async () => {
    await setup(); await page.evaluate(() => { window.originalAdd = IDBObjectStore.prototype.add; IDBObjectStore.prototype.add = function(value, key) { if (this.name === 'evidence' && String(key).startsWith('receipt:')) throw Error('journal-receipt-injected'); return window.originalAdd.call(this, value, key); }; });
    let result; try { result = await migrate(); } finally { await page.evaluate(() => { IDBObjectStore.prototype.add = window.originalAdd; }); }
    assert.equal(result.state, 'UNKNOWN'); assert.equal((await native()).current, A); const journal = await native(page, true);
    assert.ok(journal['attempt:migration']); assert.equal(journal['receipt:migration'], undefined); assert.equal((await migrate()).state, 'BLOCKED'); return { result, journal };
  });
  await record('late-legacy-writer-preserves-both-values', 'injected-late-old-write', async () => {
    await setup(); await configure('source-postcommit', 'change-source'); const result = await migrate();
    assert.equal(result.state, 'UNKNOWN'); assert.equal((await native()).current, A); assert.equal(await oldRaw(), B); assert.equal((await migrate()).state, 'BLOCKED'); return result;
  });
  await record('restart-never-unlocks-migration', 'fresh-controller', async () => {
    await setup(); assert.equal((await migrate()).state, 'VERIFIED'); const before = await native();
    await page.evaluate(() => { window.engine.close(); window.engine = window.newEngine(); }); const result = await migrate();
    assert.equal(result.state, 'BLOCKED'); assert.deepEqual(await native(), before); return result;
  });
  for (const action of ['generation', 'receipt', 'raw']) {
    await record('corrupt-' + action + '-authority-UNKNOWN', 'native-corrupt-evidence', async () => {
      await setup(); await corrupt(action); const before = await native(), p = await preview(), result = await migrate();
      assert.equal(p.classification, 'UNKNOWN'); assert.notEqual(result.state, 'VERIFIED'); assert.deepEqual(primary(await native()), primary(before)); return { preview: p, result };
    });
  }
  await record('rescue-retains-two-independent-raw-branches', 'native-rescue', async () => {
    await setup({ target: A }); await setOld(B); assert.equal((await targetWrite(C)).saved.status, 'VERIFIED');
    const before = await native(), result = await rescue('fork'); assert.equal(result.state, 'VERIFIED'); assert.equal(result.branches.length, 2);
    assert.deepEqual(result.branches.map(b => b.raw), [B, C]); assert.equal(result.branches[0].parent, null);
    for (const b of result.branches) assert.equal(b.hash, createHash('sha256').update(Buffer.from(b.raw, 'utf16le')).digest('hex'));
    assert.deepEqual(await native(), before); assert.equal(await oldRaw(), B); return result;
  });
  await record('corrupt-raw-rescue-is-evidence-not-authority', 'native-corrupt-rescue', async () => {
    await setup(); await setOld('broken-source'); await corrupt('raw'); const before = await native(); const result = await rescue('corrupt');
    assert.equal(result.state, 'VERIFIED'); assert.deepEqual(result.branches.map(b => b.raw), ['broken-source', 'broken-target']);
    assert.ok(result.branches.every(b => b.schemaValid === false && b.parent === null && b.generation === null)); assert.deepEqual(await native(), before); return result;
  });
  await record('rescue-precommit-race-does-not-write-stale-pair', 'injected-rescue-race', async () => {
    await setup(); await configure('rescue-before-commit', 'change-source'); const result = await rescue('race');
    assert.equal(result.state, 'UNKNOWN'); assert.equal((await native(page, true))['rescue:race'], undefined); assert.equal((await rescue('retry')).state, 'BLOCKED'); return result;
  });
  await record('rescue-postcommit-race-retains-evidence-and-HOLD', 'injected-rescue-race', async () => {
    await setup(); await configure('rescue-after-commit', 'change-source'); const result = await rescue('race');
    assert.equal(result.state, 'UNKNOWN'); const journal = await native(page, true); assert.ok(journal['rescue:race']); assert.equal(await oldRaw(), B);
    assert.equal((await rescue('retry')).state, 'BLOCKED'); return { result, journal };
  });
  await record('conflict-allows-explicit-branch-preservation-only', 'native-conflict-rescue', async () => {
    await setup({ target: B }); assert.equal((await migrate()).state, 'CONFLICT');
    const before = await native(), result = await rescue('after-conflict');
    assert.equal(result.state, 'VERIFIED'); assert.deepEqual(result.branches.map(b => b.raw), [A, B]);
    assert.deepEqual(await native(), before); assert.equal((await migrate()).state, 'BLOCKED'); return result;
  });
  await record('duplicate-rescue-never-overwrites-branches', 'native-rescue-idempotence', async () => {
    await setup(); assert.equal((await rescue('same')).state, 'VERIFIED'); const before = await native(page, true), result = await rescue('same');
    assert.ok(['BLOCKED', 'VERIFIED'].includes(result.state)); assert.deepEqual(await native(page, true), before); return result;
  });
  await record('close-during-rescue-fences-journal-write', 'injected-close', async () => {
    await setup(); await configure('rescue-before-commit', 'close'); const result = await rescue('closed');
    assert.notEqual(result.state, 'VERIFIED'); assert.equal((await native(page, true))['rescue:closed'], undefined); return result;
  });
  await record('production-namespace-rejected-before-access', 'namespace-negative-control', async () => {
    const result = await page.evaluate(() => {
      let calls = 0; const results = [];
      for (const [key, targetName] of [['calculation-memo:data', 'stage3b4-test-ok'], ['stage3b5-test-ok', 'calculation-memo'], ['stage3b5-test-../prod', 'stage3b4-test-ok']]) {
        try { window.api.createMigrationEngine({ source: { key, getItem() { calls++; return null; } }, targetName }); results.push('accepted'); } catch { results.push('rejected'); }
      }
      return { calls, results };
    });
    assert.deepEqual(result, { calls: 0, results: ['rejected', 'rejected', 'rejected'] }); return result;
  });
}
