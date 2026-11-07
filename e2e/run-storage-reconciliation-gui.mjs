import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { once } from 'node:events';
import { join } from 'node:path';
import { build } from 'vite';
import { chromium, webkit } from './node_modules/playwright/index.mjs';
import { CASES, validateReconciliationEvidence } from './storage-reconciliation-evidence.mjs';
const git = (...a) => execFileSync('git', a, { encoding: 'utf8' }).trim();
const hash = x => createHash('sha256').update(x).digest('hex');
const sha = git('rev-parse', 'HEAD'), tree = git('rev-parse', 'HEAD^{tree}');
const out = join('gui-evidence', `storage-reconciliation-${sha.slice(0, 12)}-${randomUUID()}`);
await mkdir(out, { recursive: true });
const evidence = { kind: 'read-only-reconciliation', status: 'running', HOLD: true, executionAllowed: false,
  provenance: { sha, tree, dirty: !!git('status', '--porcelain'), startedAt: new Date().toISOString(), node: process.version, platform: process.platform, run: process.env.GITHUB_RUN_ID || 'local' }, matrix: [],
  notTested: ['physical Safari', 'actual disk/quota exhaustion', 'media persistence', 'unobserved source values', 'unobserved storage rollback'] };
const save = () => writeFile(join(out, 'summary.json'), JSON.stringify(evidence, null, 2) + '\n');
async function sourceHash() { const h = createHash('sha256'); for (const f of git('ls-files', '-co', '--exclude-standard', '-z').split('\0').filter(Boolean).sort()) { h.update(f + '\0'); h.update(await readFile(f)); } return h.digest('hex'); }
let server, browser, context;
try {
  assert.equal(sha, process.env.EXPECTED_SHA || sha);
  assert.equal(evidence.provenance.dirty, false, 'commit source before evidence run');
  if (process.env.GITHUB_ACTIONS === 'true') assert.equal(process.env.WEBKIT_EXECUTABLE_PATH || '', '', 'CI must use pinned default launcher');
  evidence.provenance.webkitExecutableOverride = process.env.WEBKIT_EXECUTABLE_PATH || null;
  evidence.provenance.sourceSha256 = await sourceHash();
  const built = await build({ configFile: false, logLevel: 'error', build: { write: false, minify: false, lib: { entry: 'e2e/fixtures/storage-reconciliation-browser.ts', formats: ['es'] }, rolldownOptions: { output: { codeSplitting: false } } } });
  const chunks = (Array.isArray(built) ? built : [built]).flatMap(x => x.output).filter(x => x.type === 'chunk'); assert.equal(chunks.length, 1);
  const fixtureModule = chunks[0].code; evidence.provenance.moduleSha256 = hash(fixtureModule);
  await writeFile(join(out, 'fixture.bundle.mjs.txt'), fixtureModule);
  server = createServer((req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (req.url === '/fixture.mjs') { res.setHeader('Content-Type', 'text/javascript'); res.end(fixtureModule); }
    else if (req.url === '/') { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Stage 3B-6 synthetic read-only diagnostics</title><style>body{font:16px sans-serif;margin:12px}pre{white-space:pre-wrap;overflow-wrap:anywhere}</style><h1>Stage 3B-6 合成データ診断</h1><p>読取り専用・HOLD・復旧実行禁止</p><button id="diagnose">明示的に照合</button><pre id="report"></pre><script type="module">window.api=await import("/fixture.mjs");document.querySelector("button").onclick=async()=>{window.clickReport=await window.reader.diagnose();document.querySelector("pre").textContent=JSON.stringify(window.clickReport,null,2)}</script>'); }
    else { res.statusCode = 404; res.end(); }
  });
  server.listen(0, '127.0.0.1'); await once(server, 'listening'); const origin = `http://127.0.0.1:${server.address().port}`;
  for (const [engine, type] of [['chromium', chromium], ['webkit', webkit]]) {
    try {
      browser = await type.launch({ headless: true, ...(engine === 'webkit' && process.env.WEBKIT_EXECUTABLE_PATH ? { executablePath: process.env.WEBKIT_EXECUTABLE_PATH } : {}) });
      for (const width of [375, 390, 765, 1280]) {
        const row = { engine, width, browserVersion: browser.version(), status: 'running', errors: [], cases: [] }; evidence.matrix.push(row); await save();
        context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: width < 400, isMobile: width < 400, serviceWorkers: 'block' });
        await context.route('**/*', r => new URL(r.request().url()).origin === origin ? r.continue() : r.abort());
        const page = await context.newPage(); page.on('pageerror', e => row.errors.push(String(e)));
        await page.goto(origin); await page.waitForFunction(() => !!window.api);
        for (const name of CASES) {
          const c = { name, status: 'running', startedAt: new Date().toISOString() }; row.cases.push(c); await save();
          try {
            c.observation = await page.evaluate(async ({ name, id }) => {
              const api = window.api, A = ' \n{"version":1,"history":[],"notes":[],"settings":{"theme":"light","activePanel":"history"},"x":"A","n":9007199254740993123}\t', B = A.replace('"A"', '"B"'), C = A.replace('"A"', '"C"');
              const empty = JSON.stringify({ version: 1, history: [], notes: [], settings: { theme: 'light', activePanel: 'history' } });
              const scope = { source: 'stage3b5-test-' + id, destination: 'stage3b4-test-' + id };
              const check = (v, reason) => { if (!v) throw Error(reason); };
              const mutate = (dbName, storeName, fn) => new Promise((resolve, reject) => { const r = indexedDB.open(dbName, 1); r.onupgradeneeded = () => r.result.createObjectStore(storeName); r.onerror = () => reject(r.error); r.onsuccess = () => { const db = r.result, tx = db.transaction(storeName, 'readwrite'); fn(tx.objectStore(storeName)); tx.oncomplete = () => { db.close(); resolve(); }; tx.onabort = () => { db.close(); reject(tx.error); }; }; });
              const adapter = api.createIsolatedAdapter(scope.destination);
              localStorage.setItem(scope.source, A);
              await adapter.initialize(['consistent-read-only', 'aba-same-content'].includes(name) ? A : empty, 'incarnation', A); adapter.close();
              await mutate(scope.destination + '-migration', 'evidence', () => {});
              const reader = () => api.createReadOnlyReconciler({ scope, getItem: k => localStorage.getItem(k) });
              const baseline = (await reader().diagnose()).evidence;
              let operation, previous, expected, expectedCode, pendingClose = false;
              const options = { source: { key: scope.source, getItem: k => localStorage.getItem(k) }, targetName: scope.destination };
              const init = baseline.target.value.head;
              const migrate = async opts => { const engine = api.createMigrationEngine({ ...options, ...opts }); const result = await engine.migrate({ migrationId: 'm', expectedSourceRaw: A, expectedTargetRaw: empty, expectedTargetToken: { structure: 1, incarnation: init.incarnation, generation: init.generation, latestOperation: init.latestOperation } }); engine.close(); return result; };
              if (name === 'consistent-read-only') expected = 'CONSISTENT';
              else if (name === 'interrupted-before-save') { await migrate({ fault: p => { if (p === 'before-save') throw Error('interrupted'); } }); expected = 'INCOMPLETE'; expectedCode = 'migration-receipt-missing'; }
              else if (name === 'receipt-before-failure') { await migrate({ adapterOptions: { fault: p => { if (p === 'receipt-put') throw Error('receipt-fault'); } } }); expected = 'INCOMPLETE'; }
              else if (name === 'response-loss-after-save') { await migrate({ fault: p => { if (p === 'after-save') throw Error('response-lost'); } }); expected = 'INCOMPLETE'; }
              else if (name === 'partial-receipt-loss') { await migrate({}); await mutate(scope.destination, 'records', s => s.delete('receipt:m')); expected = 'INCOMPLETE'; }
              else if (name === 'whole-storage-loss') { await migrate({}); previous = (await reader().diagnose()).evidence; await Promise.all([scope.destination, scope.destination + '-migration'].map(n => new Promise((res, rej) => { const r = indexedDB.deleteDatabase(n); r.onsuccess = res; r.onerror = rej; }))); localStorage.removeItem(scope.source); expected = 'INCOMPLETE'; expectedCode = 'previously-observed-store-disappeared'; }
              else if (name === 'generation-rollback') { await migrate({}); previous = (await reader().diagnose()).evidence; await mutate(scope.destination, 'records', s => { s.clear(); Object.entries(baseline.target.value).forEach(([k, v]) => s.put(v, k)); }); expected = 'CONFLICT'; expectedCode = 'generation-rollback-observed'; }
              else if (name === 'aba-same-content') {
                const writer = api.createIsolatedAdapter(scope.destination); let observation = await writer.inspect(A);
                await writer.authorize({ token: observation.token, raw: A, legacyRaw: A });
                const first = await writer.save({ protocol: 1, expected: observation.token, expectedRaw: A, candidateRaw: B, operationId: 'aba-b', legacyRaw: A }); check(first.status === 'VERIFIED', 'ABA first save');
                observation = await writer.inspect(A); const second = await writer.save({ protocol: 1, expected: observation.token, expectedRaw: B, candidateRaw: A, operationId: 'aba-a', legacyRaw: A }); check(second.status === 'VERIFIED', 'ABA second save'); writer.close();
                previous = baseline; expected = 'UNKNOWN';
              }
              else if (name === 'late-old-tab') { await migrate({}); localStorage.setItem(scope.source, C); expected = 'CONFLICT'; }
              else if (name === 'multiple-branches' || name === 'raw-hash-mismatch') { const engine = api.createMigrationEngine(options); localStorage.setItem(scope.source, B); await engine.preserveBranches({ rescueId: 'r' }); engine.close(); expected = 'CONFLICT'; if (name === 'raw-hash-mismatch') { const saved = (await api.readSyntheticStore(scope.destination + '-migration', 'evidence')).value['rescue:r']; saved.branches[0].hash = '0'.repeat(64); await mutate(scope.destination + '-migration', 'evidence', s => s.put(saved, 'rescue:r')); expected = 'CORRUPTED'; } }
              else if (name === 'quota-diagnostic') { await migrate({ fault: p => { if (p === 'before-save') throw new DOMException('Synthetic quota', 'QuotaExceededError'); } }); expected = 'INCOMPLETE'; }
              else if (name === 'restart-unknown') { await migrate({ fault: p => { if (p === 'after-save') throw Error('restart-unknown'); } }); previous = (await reader().diagnose()).evidence; expected = 'INCOMPLETE'; }
              else if (name === 'rescue-capture-gap') { localStorage.setItem(scope.source, B); const engine = api.createMigrationEngine({ ...options, fault: p => { if (p === 'rescue-before-commit') localStorage.setItem(scope.source, C); } }); await engine.preserveBranches({ rescueId: 'r' }); engine.close(); expected = 'CONFLICT'; expectedCode = 'rescue-capture-gap-no-durable-raw'; }
              else if (name === 'hold-operation') { await mutate(scope.destination, 'records', s => s.put({ protocol: 1, state: 'HOLD' }, 'control')); operation = 'restore'; expected = 'BLOCKED'; }
              else if (name === 'closed-request') { pendingClose = true; expected = 'BLOCKED'; }
              const capture = async () => ({ source: localStorage.getItem(scope.source), target: await api.readSyntheticStore(scope.destination, 'records'), journal: await api.readSyntheticStore(scope.destination + '-migration', 'evidence') });
              const before = JSON.stringify(await capture());
              let mutations = 0; const restores = [];
              for (const [proto, names] of [[Storage.prototype, ['setItem', 'removeItem', 'clear']], [IDBObjectStore.prototype, ['add', 'put', 'delete', 'clear']]]) for (const k of names) { const original = proto[k]; proto[k] = function (...a) { mutations++; return original.apply(this, a); }; restores.push(() => { proto[k] = original; }); }
              let report;
              try {
                const r = reader();
                if (pendingClose) { const promise = r.diagnose(); r.close(); try { await promise; throw Error('closed request revived'); } catch (e) { check(String(e).includes('invalidated'), 'expected invalidated'); report = { state: 'BLOCKED', findings: [{ code: 'closed-request-invalidated' }], HOLD: true, executionAllowed: false }; } }
                else { report = await r.diagnose(previous, operation); r.close(); }
              } finally { restores.forEach(f => f()); }
              const after = JSON.stringify(await capture());
              check(mutations === 0 && before === after, 'diagnosis must not mutate');
              check(report.state === expected, `state ${report.state}, expected ${expected}`);
              if (expectedCode) check(report.findings.some(f => f.code === expectedCode), 'missing ' + expectedCode);
              if (name === 'rescue-capture-gap') check(!report.candidates.some(c => c.raw === B), 'uncaptured B invented');
              check(report.executionAllowed === false && report.HOLD === true, 'execution forbidden');
              window.reader = reader(); window.lastScope = scope; window.lastReport = report;
              return { report, before, after, mutations, executionAllowed: false, expected, expectedCode: expectedCode ?? null };
            }, { name, id: randomUUID() });
            if (name === 'restart-unknown') {
              await page.reload(); await page.waitForFunction(() => !!window.api);
              const restarted = await page.evaluate(async scope => { window.reader = window.api.createReadOnlyReconciler({ scope, getItem: k => localStorage.getItem(k) }); return window.reader.diagnose(); }, c.observation.report.subject);
              assert.equal(restarted.state, 'INCOMPLETE'); assert.ok(restarted.findings.some(f => f.state === 'UNKNOWN')); c.observation.pageReloadReport = restarted;
            }
            if (name === 'aba-same-content') assert.ok(c.observation.report.knownCausality.some(x => x.includes('ABA')));
            c.status = 'passed';
          } catch (e) { c.status = 'failed'; c.error = e.stack || String(e); }
          c.finishedAt = new Date().toISOString(); await save();
        }
        await page.locator('#diagnose')[width < 400 ? 'tap' : 'click'](); await page.waitForFunction(() => !!window.clickReport);
        row.png = `${engine}-${width}.png`; await page.screenshot({ path: join(out, row.png) }); row.pngSha256 = hash(await readFile(join(out, row.png)));
        row.status = row.errors.length === 0 && row.cases.every(c => c.status === 'passed') ? 'passed' : 'failed'; await context.close(); context = null; await save();
      }
    } catch (e) { evidence.matrix.push({ engine, status: 'failed', error: e.stack || String(e) }); }
    finally { await context?.close(); context = null; await browser?.close(); browser = null; }
  }
  assert.equal(await sourceHash(), evidence.provenance.sourceSha256, 'source changed during run');
  evidence.status = 'passed'; assert.deepEqual(validateReconciliationEvidence(evidence, { sha, tree }), []);
} catch (e) { evidence.status = 'failed'; evidence.error = e.stack || String(e); process.exitCode = 1; }
finally { await context?.close(); await browser?.close(); if (server) { server.closeAllConnections(); await new Promise(r => server.close(r)); } evidence.finishedAt = new Date().toISOString(); await save(); console.log(JSON.stringify({ out, status: evidence.status, errors: evidence.matrix.flatMap(m => m.error || m.cases?.filter(c => c.error).map(c => ({ engine: m.engine, width: m.width, name: c.name, error: c.error })) || []) }, null, 2)); }
