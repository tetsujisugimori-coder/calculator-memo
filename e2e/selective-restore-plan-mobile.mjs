import { chromium, webkit } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const base = process.env.RESTORE_PLAN_TEST_URL || 'http://127.0.0.1:4195/calculator-memo/';
const key = 'calculation-memo:data';
const at = '2026-11-01T00:00:00.000Z';
const history = (id, result = 2) => ({ id, expression: '1+1', displayExpression: '1+1', result, resultText: String(result), createdAt: at });
const cases = [];
const record = { expectedSha: process.env.EXPECTED_SHA || null, run: process.env.GITHUB_RUN_ID || 'local', attempt: process.env.GITHUB_RUN_ATTEMPT || 'local', expectedCases: 8, status: 'running', cases };
await mkdir('gui-evidence', { recursive: true });
const save = () => writeFile('gui-evidence/selective-restore-plan-results.json', JSON.stringify(record, null, 2) + '\n');
function wrap(raw) { const data = JSON.parse(raw); return JSON.stringify({ format: 'calculator-memo-backup', formatVersion: 1, appStorageVersion: 1, acquisition: 'captured', createdAt: at, acquiredAt: at, entries: [{ key, raw, utf16CodeUnits: raw.length, validation: 'ok', counts: { history: data.history.length, notes: data.notes.length, formulas: 0, reports: 0, executions: 0 } }] }); }
async function fit(page, dialog, label) {
  const geometry = await page.evaluate(() => ({ width: document.documentElement.clientWidth, page: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) }));
  assert.ok(geometry.page <= geometry.width, `${label}: page fits`);
  const overflow = await dialog.locator('.modal-content').evaluate(root => [root, ...root.querySelectorAll('p,li,h3,h4,article,button,summary')].filter(e => e.getClientRects().length && e.scrollWidth > e.clientWidth + 1).map(e => ({ tag: e.tagName, text: e.textContent.slice(0,80), scroll: e.scrollWidth, width: e.clientWidth })));
  assert.deepEqual(overflow, [], `${label}: modal fits`);
  for (const button of await dialog.getByRole('button').all()) {
    if (!await button.isVisible()) continue;
    await button.scrollIntoViewIfNeeded(); const rect = await button.boundingBox();
    assert.ok(rect && rect.width >= 44 && rect.height >= 44 && rect.x >= 0 && rect.x + rect.width <= geometry.width, `${label}: 44px reachable button`);
    assert.equal(await button.evaluate(e => { const r = e.getBoundingClientRect(); return e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)); }), true);
  }
  return geometry;
}
await save();
try {
  for (const [name, engine] of [['chromium', chromium], ['webkit', webkit]]) {
    const browser = await engine.launch({ headless: true });
    try { for (const width of [375, 390]) for (const theme of ['light', 'dark']) {
      const result = { engine: name, width, theme, font: '200%', status: 'running', verified: [], touches: 0, startedAt: new Date().toISOString() }; cases.push(result); await save();
      const context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
      const page = await context.newPage(); const errors = []; page.on('pageerror', e => errors.push(String(e)));
      await context.tracing.start({ screenshots: false, snapshots: true, sources: true });
      try {
        const source = ` ${JSON.stringify({ version: 1, history: [history('same')], notes: [], settings: { theme, activePanel: 'history' } })} `;
        const backupRaw = JSON.stringify({ version: 1, history: [history('same'), history('長い識別子-'.repeat(25))], notes: [], settings: { theme, activePanel: 'history' } });
        await page.goto(base);
        await page.evaluate(({ key, source }) => { localStorage.clear(); localStorage.setItem(key, source); localStorage.setItem('calculation-memo:restore-recovery:v1:0', 'protected recovery raw'); localStorage.setItem('other-app', 'untouched'); }, { key, source });
        await page.reload(); await page.waitForFunction(theme => document.documentElement.dataset.theme === theme, theme);
        result.provenance = await page.evaluate(async () => (await fetch('./__selective-restore-plan_provenance.json')).json()); assert.equal(result.provenance.sha, process.env.EXPECTED_SHA);
        await page.evaluate(() => document.documentElement.style.fontSize = '200%');
        const stored = () => page.evaluate(() => Object.fromEntries(Object.keys(localStorage).map(k => [k,localStorage.getItem(k)]))); const original = await stored();
        await page.evaluate(() => { window.__planWrites = []; window.__planTouch = 0; window.__planOriginal = {}; document.addEventListener('touchstart', () => window.__planTouch++); for (const method of ['setItem','removeItem','clear']) { const original = Storage.prototype[method]; window.__planOriginal[method] = original; Storage.prototype[method] = function(...args) { window.__planWrites.push({ method, args }); return original.apply(this,args); }; } });
        const tap = async locator => { await locator.scrollIntoViewIfNeeded(); await locator.tap(); result.touches++; };
        const entrance = page.getByRole('button', { name: '選択復元プレビュー', exact: true }); await tap(entrance);
        const dialog = page.getByRole('dialog', { name: '選択復元プレビュー', exact: true });
        const upload = text => dialog.getByLabel('バックアップファイル', { exact: true }).setInputFiles({ name: 'restore-plan.json', mimeType: 'application/json', buffer: Buffer.from(text) });
        await upload(wrap(backupRaw)); await dialog.locator('[data-preview-key]').first().waitFor();
        const acquire = dialog.getByRole('button', { name: '現在データを明示的に再取得して比較', exact: true }); await tap(acquire);
        const same = dialog.locator('[data-preview-key="history:0"]'); await tap(same.getByRole('button', { name: '復元候補に選択', exact: true }));
        const generate = dialog.getByRole('button', { name: '復元計画を明示的に再生成', exact: true });
        await generate.focus(); await page.keyboard.press('Space'); const state = dialog.getByTestId('restore-plan-state'); await state.getByText('事前検証PASS', { exact: true }).waitFor(); assert.equal(await generate.evaluate(e => e === document.activeElement), true, 'generation retains keyboard focus'); result.verified.push('UNCHANGED preflight PASS, keyboard focus retained, no execution permission');
        result.passGeometry = await fit(page, dialog, 'pass'); await state.scrollIntoViewIfNeeded(); await page.screenshot({ path: `gui-evidence/restore-plan-${name}-${width}-${theme}-pass.png` });
        const added = dialog.locator('[data-preview-key="history:1"]'); await tap(added.getByRole('button', { name: '復元候補に選択', exact: true })); await page.waitForFunction(() => document.querySelector('[data-testid="restore-plan-state"]')?.textContent.includes('STALE')); assert.ok(!(await dialog.innerText()).includes('事前検証PASS')); await tap(generate); assert.equal(await state.innerText(), 'BLOCKED');
        const panel = dialog.getByRole('region', { name: '復元計画の確認', exact: true }); assert.ok((await panel.innerText()).includes('予定操作: ADD')); assert.ok((await panel.innerText()).includes('構造検証: PASS')); assert.ok((await panel.innerText()).includes('原文保持: BLOCKED')); result.verified.push('selection expires PASS, ADD validates version 1 but raw preservation blocks execution');
        result.blockedGeometry = await fit(page, dialog, 'blocked-long-id'); await state.scrollIntoViewIfNeeded(); await page.screenshot({ path: `gui-evidence/restore-plan-${name}-${width}-${theme}-blocked.png` });
        // A real second page changes only the synthetic fixture. App writes stay separately observed.
        const writer = await context.newPage(); await writer.goto(base); await writer.evaluate(({ key, raw }) => localStorage.setItem(key, raw), { key, raw: source + ' ' }); await writer.close();
        await page.waitForFunction(() => document.querySelector('[data-testid="restore-plan-state"]')?.textContent.includes('STALE')); assert.ok(!(await panel.innerText()).includes('構造検証: PASS')); await tap(acquire); assert.ok((await state.innerText()).includes('STALE')); await tap(generate); assert.equal(await state.innerText(), 'BLOCKED');
        await page.evaluate(({ key, source }) => window.__planOriginal.setItem.call(localStorage,key,source), { key, source });
        await page.waitForFunction(() => document.querySelector('[data-testid="restore-plan-state"]')?.textContent.includes('STALE')); await tap(acquire); await tap(generate); result.verified.push('real second-tab and same-tab raw change invalidate, explicit acquisition alone does not revive the plan');
        await page.evaluate(key => { window.__planGet = Storage.prototype.getItem; Storage.prototype.getItem = function(k) { if (k === key) throw new DOMException('denied','SecurityError'); return window.__planGet.call(this,k); }; }, key);
        await tap(acquire); assert.ok((await state.innerText()).includes('STALE')); assert.ok(!(await panel.innerText()).includes('構造検証: PASS')); await page.evaluate(() => Storage.prototype.getItem = window.__planGet); result.verified.push('read failure removes successful candidate details');
        await upload('{broken'); await dialog.getByRole('alert').waitFor(); assert.equal(await dialog.getByTestId('restore-plan-state').count(), 0); result.verified.push('replacement invalid JSON discards old plan');
        assert.deepEqual(await stored(), original); assert.deepEqual(await page.evaluate(() => window.__planWrites), []); assert.equal(await dialog.getByRole('button', { name: '復元を実行する', exact: true }).count(), 0);
        await tap(dialog.getByRole('button', { name: 'プレビューを閉じる', exact: true })); assert.equal(await entrance.evaluate(e => e === document.activeElement), true, 'modal returns focus'); assert.deepEqual(await stored(), original); assert.deepEqual(await page.evaluate(() => window.__planWrites), []); assert.deepEqual(errors, []); result.observedTouchStarts = await page.evaluate(() => window.__planTouch); assert.ok(result.observedTouchStarts >= result.touches);
        result.verified.push('current/recovery/other raw unchanged, app set/remove/clear zero, native emulated touches, close focus, no errors'); result.status = 'passed';
        await context.tracing.stop();
      } catch (error) { result.status = 'failed'; result.error = String(error); await page.screenshot({ path: `gui-evidence/restore-plan-${name}-${width}-${theme}-failure.png` }).catch(() => {}); await context.tracing.stop({ path: `gui-evidence/restore-plan-${name}-${width}-${theme}-trace.zip` }).catch(() => {}); throw error; }
      finally { result.finishedAt = new Date().toISOString(); await save(); await context.close(); }
    }} finally { await browser.close(); }
  }
  assert.equal(cases.length, 8); assert.ok(cases.every(c => c.status === 'passed')); record.status = 'passed';
} catch (error) { record.status = 'failed'; record.error = String(error); throw error; }
finally { record.finishedAt = new Date().toISOString(); await save(); }
console.log(JSON.stringify(record, null, 2));
