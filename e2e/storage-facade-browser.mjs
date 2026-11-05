// Real built application, fresh synthetic contexts, native Storage fault boundary only.
// Additional acceptance cannot replace the formal 6/1128/592/132 GUI artifact.
import { chromium, webkit, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const out = process.env.STORAGE_FACADE_EVIDENCE_DIR;
const base = process.env.STORAGE_FACADE_TEST_URL;
assert.ok(out && base, 'owned runner and exclusive evidence directory required');
const origin = new URL(base).origin;
assert.equal(new URL(base).hostname, '127.0.0.1');
const provenance = JSON.parse(await readFile(join(out, 'provenance.json'), 'utf8'));
assert.equal(provenance.sha, process.env.EXPECTED_SHA);
import { key, recoveryPrefix, source, protectedRaw, target, recoveryRecord, backup } from './storage-facade-fixtures.mjs';

const record = { kind: 'additional-storage-facade-gui-not-formal', sha: provenance.sha, startedAt: new Date().toISOString(), status: 'running',
  expectedCases: 8, expectedContextsPerCase: 6, noRetryObservationMs: 1600, engineOutcomes: [],
  limitations: ['Not formal GUI success', 'No physical iPhone Safari, software keyboard or OS text scaling', 'Readback is not disk durability', 'Noncooperative old tabs, ABA and TOCTOU remain'], cases: [] };
const save = () => writeFile(join(out, 'results.json'), JSON.stringify(record, null, 2) + '\n');
let activeContext, activeResult;
process.on('SIGTERM', async () => {
  record.status = 'interrupted';
  if (activeResult) { activeResult.status = 'interrupted'; activeResult.error = 'SIGTERM'; }
  await save();
  if (activeContext) await activeContext.tracing.stop({ path: join(out, 'interrupted-trace.zip') }).catch(() => {});
  process.exit(1);
});
const snapshot = page => page.evaluate(() => Object.fromEntries(Object.keys(localStorage).sort().map(k => [k, localStorage.getItem(k)])));
const raw = page => page.evaluate(k => localStorage.getItem(k), key);
const stored = async page => JSON.parse(await raw(page));
const writes = page => page.evaluate(() => window.__storageFacadeProbe.writes);
async function arm(page, method, targetKey, behavior) {
  await page.evaluate(fault => { window.__storageFacadeProbe.fault = fault; }, { method, key: targetKey, behavior });
}
async function geometry(page, r, phase) {
  const dimensions = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
  assert.equal(dimensions.viewport, r.width);
  assert.ok(dimensions.document <= dimensions.viewport + 1 && dimensions.body <= dimensions.viewport + 1, `${phase}: horizontal overflow ${JSON.stringify(dimensions)}`);
  for (const dialog of await page.getByRole('dialog').all()) {
    if (!await dialog.isVisible()) continue;
    const box = await dialog.boundingBox(); assert.ok(box && box.x >= -1 && box.x + box.width <= r.width + 1, `${phase}: dialog fits`);
    for (const content of await dialog.locator('.modal-content').all()) {
      const size = await content.evaluate(el => ({ scroll: el.scrollWidth, client: el.clientWidth }));
      assert.ok(size.scroll <= size.client + 1, `${phase}: content fits ${JSON.stringify(size)}`);
    }
  }
  r.geometry.push({ phase, ...dimensions });
}
async function activate(locator, r) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  assert.ok(box && box.x >= -1 && box.x + box.width <= r.width + 1, 'activated control is horizontally reachable');
  if (r.touch) { await locator.tap(); r.touches++; } else { await locator.click(); r.clicks++; }
}
const button = (scope, name) => scope.getByRole('button', { name, exact: true });
async function expressionInput(page, r) {
  const input = page.getByRole('textbox', { name: '計算式を入力', exact: true });
  // This editor is initially inside a closed native details element. Open it as a user would.
  if (!await input.isVisible()) await activate(page.locator('.expression-entry > summary'), r);
  await expect(input).toBeVisible();
  return input;
}
async function openRestore(page, r) {
  await activate(button(page, 'JSONから復元'), r);
  const dialog = page.getByRole('dialog', { name: 'JSONバックアップから復元', exact: true });
  await dialog.getByLabel('復元JSONファイル').setInputFiles({ name: 'synthetic-facade-backup.json', mimeType: 'application/json', buffer: Buffer.from(backup(target)) });
  await dialog.getByRole('region', { name: '復元プレビュー' }).waitFor();
  return dialog;
}
async function deleteConfirmation(page, r) {
  await activate(button(page, '復旧コピーを管理'), r);
  const dialog = page.getByRole('dialog', { name: '復旧用保全コピーの管理', exact: true });
  const card = dialog.getByRole('article', { name: `復旧コピー ${recoveryPrefix}0`, exact: true });
  await activate(button(card, '削除を確認'), r);
  const confirmation = dialog.getByRole('region', { name: '個別削除の確認' });
  await expect(button(confirmation, 'このコピーだけ削除する')).toBeDisabled();
  await activate(confirmation.getByRole('checkbox'), r);
  return { dialog, final: button(confirmation, 'このコピーだけ削除する') };
}
async function reset(page, r, cancelFirst = false) {
  await activate(button(page, '保存データを初期化'), r);
  let dialog = page.getByRole('dialog', { name: '保存データを初期化しますか？', exact: true });
  if (cancelFirst) {
    await activate(button(dialog, 'キャンセル'), r); assert.equal(await raw(page), protectedRaw);
    await activate(button(page, '保存データを初期化'), r);
    dialog = page.getByRole('dialog', { name: '保存データを初期化しますか？', exact: true });
  }
  await activate(button(dialog, '初期化する'), r);
}
async function assertNoRetry(page, r, before, expectedWrites) {
  await expect.poll(async () => (await writes(page)).length).toBe(expectedWrites);
  const snapshotAtUnknown = await snapshot(page);
  const callsAtUnknown = await writes(page);
  // Close through the real UI before exercising settings; the header is inert while these dialogs are open.
  for (const dialog of await page.getByRole('dialog').all()) {
    if (await dialog.isVisible()) await activate(button(dialog, '閉じる').first(), r);
  }
  await page.getByLabel('テーマ', { exact: true }).selectOption('dark');
  await page.getByLabel('テーマ', { exact: true }).selectOption('light');
  await page.waitForTimeout(record.noRetryObservationMs); // Deliberately observe beyond the autosave timer, not readiness polling.
  assert.deepEqual(await writes(page), callsAtUnknown, 'UNKNOWN must not retry, compensate, repair, or autosave after state changes');
  assert.deepEqual(await snapshot(page), snapshotAtUnknown, 'raw snapshot must remain stable throughout HOLD observation');
  for (const name of Object.keys(before).filter(k => k !== key && !k.startsWith(recoveryPrefix))) assert.equal(snapshotAtUnknown[name], before[name]);
  r.checks.push(`UNKNOWN held: ${expectedWrites} attempted mutation(s), zero automatic retries/compensation after two setting changes and ${record.noRetryObservationMs}ms`);
}
async function happy(page, r) {
  await expect.poll(async () => (await stored(page))?.version).toBe(1);
  assert.ok((await writes(page)).some(w => w.method === 'setItem' && w.key === key), 'first launch empty data uses product writer');
  r.checks.push('first launch empty data persisted');
  await (await expressionInput(page, r)).fill('12+34');
  await activate(button(page, '計算する'), r);
  await expect.poll(async () => (await stored(page)).history[0]?.result).toBe(46);
  assert.equal((await stored(page)).history[0].expression, '12+34');
  await page.getByLabel('テーマ', { exact: true }).selectOption('dark');
  await expect.poll(async () => (await stored(page)).settings.theme).toBe('dark');
  r.checks.push('ordinary calculation 12+34=46 and settings autosaved');
  const tab = page.getByRole('tab', { name: /^メモ/ });
  if (await tab.isVisible()) { await activate(tab, r); await expect.poll(async () => (await stored(page)).settings.activePanel).toBe('notes'); }
  await expect(page.getByTestId('unsaved-changes')).toHaveCount(0);
  await activate(button(page.locator('#notes-panel'), '＋ 新規作成'), r);
  let dialog = page.getByRole('dialog');
  await activate(dialog.getByRole('button').filter({ hasText: 'BLOCKS / MARKDOWN' }), r);
  await dialog.getByLabel('タイトル', { exact: false }).fill('Facade explicit block memo');
  await activate(button(dialog, '＋ 文章'), r);
  await dialog.getByLabel('Markdown文章').fill('Synthetic preserved text 😀');
  await activate(button(dialog, '＋ 旧変数計算'), r);
  await dialog.getByLabel('計算式', { exact: true }).fill('2*(5+3)');
  await expect(dialog.locator('.calculation-live-result strong')).toHaveText('= 16');
  const beforeMemo = await raw(page); await page.waitForTimeout(200); assert.equal(await raw(page), beforeMemo, 'editing does not auto-save block memo draft');
  await geometry(page, r, 'memo-draft');
  await activate(button(dialog, '保存する'), r);
  await expect.poll(async () => (await stored(page)).notes[0]?.title).toBe('Facade explicit block memo');
  assert.equal((await stored(page)).notes[0].blocks.find(b => b.type === 'text').content, 'Synthetic preserved text 😀');
  assert.equal((await stored(page)).notes[0].blocks.find(b => b.type === 'calculation').expression, '2*(5+3)');
  r.checks.push('explicit block memo saved with text and calculation');
  await activate(button(page, '登録式ライブラリ'), r);
  const library = page.getByRole('dialog', { name: '登録式ライブラリ', exact: true });
  await activate(button(library, '計算式を登録'), r);
  await library.getByLabel('登録名', { exact: true }).fill('Facade formula');
  await library.getByLabel('登録する計算式', { exact: true }).fill('x+1');
  await activate(button(library, '登録する'), r);
  await expect.poll(async () => (await stored(page)).formulaLibrary.entries[0]?.expression).toBe('x+1');
  await expect(library.getByTestId('library-unsaved-changes')).toHaveCount(0);
  await activate(button(library, 'レポートを作成'), r);
  const report = page.getByRole('dialog', { name: '登録式の関連レポート', exact: true });
  await report.getByLabel('レポートタイトル', { exact: true }).fill('Facade report');
  await report.getByLabel('レポート本文（Markdown）', { exact: true }).fill('# Synthetic report\n\nExact body 😀');
  await geometry(page, r, 'report-draft');
  await activate(button(report, 'レポートを保存'), r);
  await expect.poll(async () => (await stored(page)).formulaReports.entries[0]?.body).toBe('# Synthetic report\n\nExact body 😀');
  await activate(button(report, 'レポートを閉じる').first(), r); await activate(button(library, '閉じる'), r);
  await expect(page.getByTestId('unsaved-changes')).toHaveCount(0);
  const beforeRestore = await raw(page);
  r.checks.push('registered formula and explicit report saved');
  dialog = await openRestore(page, r);
  assert.equal(await raw(page), beforeRestore);
  await expect(button(dialog, '復元を実行する')).toBeDisabled();
  await activate(button(dialog, '現在データを保全する'), r);
  await dialog.getByText('独立コピー読戻し確認済み', { exact: false }).waitFor();
  const preserved = await snapshot(page);
  assert.equal(JSON.parse(preserved[recoveryPrefix + '0']).raw, beforeRestore);
  assert.equal(preserved[key], beforeRestore);
  await activate(dialog.getByRole('checkbox'), r);
  await activate(button(dialog, '復元を実行する'), r);
  await dialog.getByRole('status').filter({ hasText: '保存原文の書込みと読戻し一致' }).waitFor();
  assert.equal(await raw(page), target); await expect(button(dialog, '復元を実行する')).toBeDisabled();
  await geometry(page, r, 'restored');
  await page.screenshot({ path: join(out, `${r.id}-restore.png`) });
  await activate(button(dialog, '閉じる').last(), r);
  r.checks.push('approved full restore preserved source and wrote exact whitespace/large-number/Unicode target raw');
  const { dialog: manager, final } = await deleteConfirmation(page, r);
  const beforeDelete = await snapshot(page);
  await activate(final, r);
  await manager.getByRole('status').filter({ hasText: '対象1件' }).waitFor();
  const afterDelete = await snapshot(page); const expected = { ...beforeDelete }; delete expected[recoveryPrefix + '0'];
  assert.deepEqual(afterDelete, expected, 'only the separately approved copy was removed');
  await geometry(page, r, 'copy-deleted');
  await page.screenshot({ path: join(out, `${r.id}-copy-deleted.png`) });
  await page.reload(); await button(page, '計算する').waitFor();
  assert.equal(await raw(page), target); assert.equal((await snapshot(page))['other-app'], 'untouched');
  r.checks.push('individually approved copy deletion; exact target survives reload; unrelated storage unchanged');
}
async function resetSuccess(page, r) {
  const before = await snapshot(page); await reset(page, r, true);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect.poll(async () => (await stored(page)).notes).toEqual([]);
  assert.deepEqual((await stored(page)).history, []);
  assert.equal((await snapshot(page))[recoveryPrefix + '0'], before[recoveryPrefix + '0']);
  assert.equal((await snapshot(page))['other-app'], 'untouched');
  await geometry(page, r, 'reset-verified');
  r.checks.push('reset cancel leaves original; explicit confirmed reset clears only current data and preserves recovery/other keys');
}
async function unknown(page, r, kind) {
  const before = await snapshot(page);
  if (kind === 'autosave-unknown') {
    await arm(page, 'setItem', key, 'throw-after');
    await (await expressionInput(page, r)).fill('8+9');
    await activate(button(page, '計算する'), r);
    await page.getByRole('alert').filter({ hasText: /再試行を停止|UNKNOWN/ }).waitFor();
    assert.equal((await stored(page)).history[0].result, 17, 'throw-after fault actually wrote before acknowledgement failed');
  } else if (kind === 'preservation-unknown') {
    const dialog = await openRestore(page, r);
    await arm(page, 'setItem', recoveryPrefix + '0', 'throw-after');
    await activate(button(dialog, '現在データを保全する'), r);
    await dialog.getByRole('alert').filter({ hasText: 'UNKNOWN' }).waitFor();
    await expect(button(dialog, '現在データを保全する')).toBeDisabled();
    await expect(button(dialog, '復元を実行する')).toBeDisabled();
    assert.equal(await raw(page), source);
    assert.equal(JSON.parse((await snapshot(page))[recoveryPrefix + '0']).raw, source);
  } else if (kind === 'delete-unknown') {
    const { dialog, final } = await deleteConfirmation(page, r);
    await arm(page, 'removeItem', recoveryPrefix + '0', 'noop');
    await activate(final, r);
    await dialog.getByRole('alert').filter({ hasText: 'UNKNOWN' }).waitFor();
    await expect(button(dialog, '一覧を再取得')).toBeDisabled();
    assert.deepEqual(await snapshot(page), before, 'no-op delete readback mismatch leaves every key unchanged');
  } else {
    await arm(page, 'setItem', key, 'throw-after'); await reset(page, r);
    await page.getByRole('alert').filter({ hasText: 'UNKNOWN' }).waitFor();
    assert.notEqual(await raw(page), protectedRaw, 'throw-after reset applied before acknowledgement failed');
  }
  await geometry(page, r, kind);
  await page.screenshot({ path: join(out, `${r.id}-held.png`) });
  await assertNoRetry(page, r, before, 1);
}
async function isolated(browser, matrix, kind, operation) {
  const r = { id: `${matrix.engine}-${matrix.width}-${kind}`, width: matrix.width, touch: matrix.width <= 390, kind, status: 'running',
    startedAt: new Date().toISOString(), checks: [], geometry: [], touches: 0, clicks: 0, errors: [], consoleErrors: [], assetErrors: [], servedAssets: [] };
  matrix.contexts.push(r); activeResult = r; await save();
  const context = await browser.newContext({ viewport: { width: matrix.width, height: 900 }, isMobile: r.touch, hasTouch: r.touch, deviceScaleFactor: 1, serviceWorkers: 'block' });
  activeContext = context;
  context.setDefaultTimeout(12_000);
  await context.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort('blockedbyclient'));
  await context.addInitScript(({ key, recoveryPrefix, source, protectedRaw, recoveryRecord, kind }) => {
    // Fixtures are seeded before the app only once; the probe counts product mutations separately.
    if (!sessionStorage.getItem('facade-fixture-seeded')) {
      sessionStorage.setItem('facade-fixture-seeded', 'yes');
      if (kind !== 'happy') localStorage.setItem(key, kind.startsWith('reset') ? protectedRaw : source);
      localStorage.setItem('other-app', 'untouched');
      if (kind === 'delete-unknown' || kind.startsWith('reset')) localStorage.setItem(recoveryPrefix + '0', recoveryRecord);
    }
    window.__storageFacadeProbe = { writes: [], fault: null };
    for (const method of ['setItem', 'removeItem', 'clear']) {
      const native = Storage.prototype[method];
      Storage.prototype[method] = function (...args) {
        if (this !== localStorage) return native.apply(this, args);
        window.__storageFacadeProbe.writes.push({ method, key: args[0] ?? null });
        const f = window.__storageFacadeProbe.fault;
        if (f && f.method === method && f.key === args[0]) {
          if (f.behavior === 'noop') return;
          const result = native.apply(this, args);
          if (f.behavior === 'throw-after') throw new DOMException('Synthetic post-write acknowledgement fault', 'QuotaExceededError');
          return result;
        }
        return native.apply(this, args);
      };
    }
  }, { key, recoveryPrefix, source, protectedRaw, recoveryRecord, kind });
  await context.tracing.start({ screenshots: false, snapshots: true, sources: true });
  const page = await context.newPage();
  const responseChecks = [];
  page.on('pageerror', error => r.errors.push(String(error)));
  page.on('console', msg => { if (msg.type() === 'error') r.consoleErrors.push(msg.text()); });
  page.on('response', response => {
    const name = new URL(response.url()).pathname.replace('/calculator-memo/', '') || 'index.html';
    if (provenance.files[name] && /\.(html|js|css)$/.test(name)) {
      responseChecks.push(response.body().then(bytes => {
        assert.equal(createHash('sha256').update(bytes).digest('hex'), provenance.files[name], `browser received owned build ${name}`);
        r.servedAssets.push(name);
      }).catch(error => r.assetErrors.push(String(error))));
    }
  });
  try {
    await page.goto(base, { waitUntil: 'networkidle' });
    assert.deepEqual(await page.evaluate(async () => (await fetch('./__storage_facade_provenance.json')).json()), provenance);
    await operation(page, r);
    await Promise.all(responseChecks); assert.deepEqual(r.assetErrors, [], 'served bundle identity checks');
    assert.ok(r.servedAssets.some(name => name.endsWith('.js')));
    assert.deepEqual(r.errors, [], 'no uncaught application error');
    assert.deepEqual(r.consoleErrors, [], 'no unexpected console errors');
    r.status = 'passed'; await context.tracing.stop();
  } catch (error) {
    r.status = 'failed'; r.error = error.stack || String(error);
    r.storage = await snapshot(page).catch(() => null); r.mutations = await writes(page).catch(() => null);
    await page.screenshot({ path: join(out, `${r.id}-failure.png`) }).catch(() => {});
    await context.tracing.stop({ path: join(out, `${r.id}-trace.zip`) }).catch(() => {});
  } finally {
    r.finishedAt = new Date().toISOString(); await save(); await context.close(); activeContext = null; activeResult = null;
  }
}
await save();
try {
  for (const [engine, type] of [['chromium', chromium], ['webkit', webkit]]) {
    const launch = { headless: true };
    if (engine === 'chromium' && process.env.CHROMIUM_EXECUTABLE_PATH) launch.executablePath = process.env.CHROMIUM_EXECUTABLE_PATH;
    const engineOutcome = { engine, status: 'launching', executableOverride: launch.executablePath || null };
    record.engineOutcomes.push(engineOutcome); await save();
    let browser;
    try {
      browser = await type.launch(launch);
      engineOutcome.status = 'running';
      for (const width of [375, 390, 765, 1280]) {
        const matrix = { engine, width, browserVersion: browser.version(), executableOverride: launch.executablePath || null, status: 'running', contexts: [] };
        record.cases.push(matrix); await save();
        await isolated(browser, matrix, 'happy', happy);
        await isolated(browser, matrix, 'reset-success', resetSuccess);
        for (const kind of ['autosave-unknown', 'preservation-unknown', 'delete-unknown', 'reset-unknown']) await isolated(browser, matrix, kind, (page, r) => unknown(page, r, kind));
        matrix.status = matrix.contexts.every(c => c.status === 'passed') ? 'passed' : 'failed'; await save();
      }
      engineOutcome.status = record.cases.filter(c => c.engine === engine).every(c => c.status === 'passed') ? 'passed' : 'failed';
    } catch (error) {
      engineOutcome.status = 'failed'; engineOutcome.error = error.stack || String(error);
    } finally {
      if (browser) await browser.close();
      engineOutcome.finishedAt = new Date().toISOString(); await save();
    }
  }
  assert.equal(record.cases.length, 8); assert.ok(record.cases.every(c => c.status === 'passed'), 'all eight matrix cases and six contexts each must pass');
  record.status = 'passed';
} catch (error) { record.status = 'failed'; record.error = error.stack || String(error); process.exitCode = 1; }
finally { record.finishedAt = new Date().toISOString(); await save(); }
console.log(JSON.stringify({ status: record.status, engineOutcomes: record.engineOutcomes, cases: record.cases.map(c => ({ engine: c.engine, width: c.width, status: c.status, contexts: c.contexts.map(s => ({ kind: s.kind, status: s.status, error: s.error })) })) }, null, 2));
