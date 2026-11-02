// R1/R2 fixtures from the independent d58 review; assertions certify the fix.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
const date = '2026-10-31T20:00:00.000Z', key = 'calculation-memo:data';
const baseData = theme => ({ version: 1, history: [{ id: 'h', expression: '2+2', displayExpression: '2+2', result: 4, resultText: '4', createdAt: date }], notes: [], settings: { theme, activePanel: 'history' } });
const f = { id: 'f', title: 'review formula', expression: '3+1', createdAt: date, updatedAt: date };
const r = { id: 'r', formulaId: 'f', title: 'review report', body: 'independent report', createdAt: date, updatedAt: date, confirmedExpression: null };
const c = { id: 'c', formulaId: 'f', confirmedAt: date, evidenceSignature: '[]', definition: { version: 1, expression: '3+1', variables: [] }, title: 'snapshot', body: '```calculator-memo-future-reference\n{"memoId":"missing"}\n```', links: [] };
const e = { id: 'e', evaluator: 'calculator-memo-v1', status: 'confirmed', calculatedAt: date, persistedAt: date, blocks: [{ blockId: 'b', position: 1, expression: '4', inputs: [], result: '4', resultText: '4', status: 'success' }] };
function envelope(data) {
  const raw = JSON.stringify(data);
  return JSON.stringify({ format: 'calculator-memo-backup', formatVersion: 1, appStorageVersion: 1, acquisition: 'captured', createdAt: date, acquiredAt: date, entries: [{ key, raw, utf16CodeUnits: raw.length, validation: 'ok', counts: { history: data.history.length, notes: data.notes.length, formulas: data.formulaLibrary?.entries.length ?? 0, reports: data.formulaReports?.entries.length ?? 0, executions: 0 } }] });
}
export async function runReferenceReviewRegression(browser, { base, engine, width, theme }) {
  const result = { engine, width, theme, font: '200%', status: 'running', touches: 0, verified: [], observations: [], startedAt: new Date().toISOString() };
  const stem = `gui-evidence/restore-plan-review-${engine}-${width}-${theme}`;
  async function phase(source, backupData, keys, action) {
    const context = await browser.newContext({ viewport: { width, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    await context.tracing.start({ screenshots: false, snapshots: true, sources: true });
    try {
      const raw = JSON.stringify(source), backupText = envelope(backupData);
      const backupPath = `${stem}-${keys.length === 1 ? 'confirmation' : 'dependency'}-backup.json`;
      await writeFile(backupPath, backupText);
      await context.addInitScript(({ key, raw }) => {
        localStorage.setItem(key, raw); localStorage.setItem('calculation-memo:restore-recovery:v1:0', 'review recovery sentinel'); localStorage.setItem('other-key', 'review untouched');
        window.__reviewWrites = []; window.__reviewTouch = 0; window.__reviewOriginal = {};
        document.addEventListener('touchstart', () => window.__reviewTouch++);
        for (const method of ['setItem', 'removeItem', 'clear']) {
          const original = Storage.prototype[method]; window.__reviewOriginal[method] = original;
          Storage.prototype[method] = function(...args) { window.__reviewWrites.push({ method, args }); return original.apply(this, args); };
        }
      }, { key, raw });
      await page.goto(base); await page.evaluate(() => document.documentElement.style.fontSize = '200%');
      const provenance = await page.evaluate(async () => (await fetch('./__selective-restore-plan_provenance.json')).json());
      assert.equal(provenance.sha, process.env.EXPECTED_SHA);
      const stored = () => page.evaluate(() => ({ ...localStorage })), original = await stored();
      const tap = async locator => { await locator.scrollIntoViewIfNeeded(); await locator.tap(); result.touches++; };
      const entrance = page.getByRole('button', { name: '選択復元プレビュー', exact: true }); await tap(entrance);
      const dialog = page.getByRole('dialog', { name: '選択復元プレビュー', exact: true });
      const input = dialog.getByLabel('バックアップファイル', { exact: true });
      await input.setInputFiles(backupPath);
      const acquire = dialog.getByRole('button', { name: '現在データを明示的に再取得して比較', exact: true }); await tap(acquire);
      for (const selected of keys) await tap(dialog.locator(`[data-preview-key="${selected}"]`).getByRole('button', { name: '復元候補に選択', exact: true }));
      const generate = dialog.getByRole('button', { name: '復元計画を明示的に再生成', exact: true });
      await generate.focus(); await page.keyboard.press('Space');
      const state = dialog.getByTestId('restore-plan-state'), panel = dialog.getByRole('region', { name: '復元計画の確認', exact: true });
      await state.getByText('未生成（UNKNOWN）', { exact: true }).waitFor({ state: 'hidden' });
      assert.equal(await generate.evaluate(node => node === document.activeElement), true);
      await action({ page, dialog, panel, state, tap, generate, acquire, raw });
      assert.equal(await readFile(backupPath, 'utf8'), backupText, 'backup file bytes unchanged');
      assert.deepEqual(await stored(), original, 'current raw/recovery/other keys unchanged');
      assert.deepEqual(await page.evaluate(() => window.__reviewWrites), [], 'app setItem/removeItem/clear zero');
      assert.deepEqual(errors, []);
      const overflow = await panel.evaluate(node => [...node.querySelectorAll('p,li,h4,article,button')].filter(el => el.getClientRects().length && el.scrollWidth > el.clientWidth + 1).map(el => el.tagName));
      assert.deepEqual(overflow, []);
      await tap(dialog.getByRole('button', { name: 'プレビューを閉じる', exact: true }));
      assert.equal(await entrance.evaluate(node => node === document.activeElement), true);
      assert.deepEqual(await stored(), original); assert.deepEqual(await page.evaluate(() => window.__reviewWrites), []);
      result.verified.push('backup/current/recovery unchanged; app storage calls zero; Space/focus; native touch; no overflow/errors');
      result.observedTouchStarts = (result.observedTouchStarts ?? 0) + await page.evaluate(() => window.__reviewTouch);
      await context.tracing.stop();
    } catch (error) {
      await page.screenshot({ path: `${stem}-failure.png` }).catch(() => {});
      await context.tracing.stop({ path: `${stem}-trace.zip` }).catch(() => {}); throw error;
    } finally { await context.close(); }
  }
  try {
    const snapshot = { ...baseData(theme), formulaLibrary: { version: 1, entries: [f], selectedId: null }, formulaReports: { version: 1, entries: [{ ...r, evidence: { version: 1, links: [], confirmations: [c] } }] } };
    const parentBackup = { ...snapshot, notes: [{ id: 'm', type: 'plain-calculation', title: 'unselected parent memo', content: 'not evaluated', createdAt: date, updatedAt: date, calculationEvidence: { version: 1, records: [e] } }] };
    await phase(snapshot, parentBackup, ['reports:0:confirmations:0'], async ({ page, dialog, panel, state, tap, generate }) => {
      assert.equal(await state.innerText(), 'UNKNOWN'); const text = await panel.innerText();
      assert.ok(text.includes('判定不能 1件')); assert.ok(text.includes('参照判定不能・曖昧: 1件'));
      assert.equal(await panel.locator('article h4').innerText(), 'confirmations / c: UNKNOWN');
      const summary = dialog.getByRole('region', { name: '復元候補の概要', exact: true }); assert.ok((await summary.innerText()).includes('参照判定不能・未対応: 1件'));
      await tap(dialog.locator('[data-preview-key="reports:0:confirmations:0"]').getByRole('button', { name: '個別詳細', exact: true }));
      const detail = dialog.getByRole('region', { name: '個別詳細', exact: true }); assert.equal(await detail.getByText('検出した参照 2件（対応範囲内のみ）。', { exact: true }).count(), 2);
      assert.equal(await detail.locator('li').filter({ hasText: 'unsupported / calculator-memo-future-reference' }).count(), 2, 'one unsupported per namespace, no duplicates');
      await tap(detail.getByRole('button', { name: '詳細を閉じる', exact: true }));
      result.observations.push({ finding: 'R1', state: 'UNKNOWN', unknownRows: 1, unknownAfterReferences: 1, previewUnknownReferences: 1 });
      await state.scrollIntoViewIfNeeded(); await page.screenshot({ path: `${stem}-confirmation.png` });
      const parentCard = dialog.locator('[data-preview-key="reports:0"]'), childCard = dialog.locator('[data-preview-key="reports:0:confirmations:0"]');
      const checkParent = async (both, blocked) => {
        assert.equal(await state.innerText(), blocked ? 'BLOCKED' : 'UNKNOWN');
        const parent = panel.locator('article').filter({ hasText: 'reports / r: UNKNOWN' }); assert.equal(await parent.count(), 1);
        assert.ok((await parent.innerText()).includes('含まれる子 ["confirmations","r","c"]'));
        const text = await panel.innerText(); assert.ok(text.includes(`判定不能 ${both ? 2 : 1}件`));
        assert.ok(text.includes(blocked ? '参照判定不能・曖昧: UNKNOWN（検査未完了）' : '参照判定不能・曖昧: 1件'));
        assert.ok(text.includes(`全参照 ${blocked ? 7 : 10}件`), 'parent diagnostic display never duplicates canonical references');
        assert.equal(await panel.locator('article').count(), (both ? 2 : 1) + (blocked ? 1 : 0));
        result.observations.push({ finding: 'contained-child', both, blocked, unknownRows: both ? 2 : 1, references: blocked ? 7 : 10, panel: text });
      };
      await tap(parentCard.getByRole('button', { name: '復元候補に選択', exact: true })); assert.ok((await state.innerText()).includes('STALE')); await tap(generate); await checkParent(true, false);
      await state.scrollIntoViewIfNeeded(); await page.screenshot({ path: `${stem}-contained-both.png` });
      await tap(childCard.getByRole('button', { name: '候補から解除', exact: true })); assert.ok((await state.innerText()).includes('STALE')); assert.equal(await panel.locator('article').count(), 0); await tap(generate); await checkParent(false, false);
      await panel.locator('article li').filter({ hasText: '含まれる子' }).first().scrollIntoViewIfNeeded(); await page.screenshot({ path: `${stem}-contained-parent.png` });
      await tap(dialog.locator('[data-preview-key="notes:0:evidence:0"]').getByRole('button', { name: '復元候補に選択', exact: true })); assert.ok((await state.innerText()).includes('STALE')); await tap(generate); await checkParent(false, true);
      await state.scrollIntoViewIfNeeded(); await page.screenshot({ path: `${stem}-contained-blocked.png` });
      await tap(childCard.getByRole('button', { name: '復元候補に選択', exact: true })); assert.ok((await state.innerText()).includes('STALE')); await tap(generate); await checkParent(true, true);
      result.verified.push('contained child origin retained by selected parent; unknown rows count each selection once; canonical references unchanged; unrelated BLOCKED never hides UNKNOWN; selection STALE and explicit regeneration');
    });
    const backupData = { ...baseData(theme), notes: [{ id: 'm', type: 'plain-calculation', title: 'independent memo', content: 'never execute', createdAt: date, updatedAt: date, calculationEvidence: { version: 1, records: [e] } }], formulaLibrary: { version: 1, entries: [{ ...f, futureReference: 'opaque dependency' }], selectedId: null }, formulaReports: { version: 1, entries: [r] } };
    await phase(baseData(theme), backupData, ['reports:0', 'formulas:0', 'notes:0:evidence:0'], async ({ page, dialog, panel, state, tap, generate, acquire, raw }) => {
      const check = async blockedChild => {
        assert.equal(await state.innerText(), 'BLOCKED'); const text = await panel.innerText();
        assert.ok(text.includes('判定不能 2件')); assert.equal(await panel.locator('article h4').filter({ hasText: ': UNKNOWN' }).count(), 2);
        assert.ok(text.includes('バックアップ項目の参照形式')); assert.ok(text.includes('依存する選択項目 formulas:0 がUNKNOWN'));
        if (blockedChild) { assert.ok(text.includes('構造検証: UNKNOWN')); assert.ok(text.includes('UNKNOWN（検査未完了）')); assert.equal(await panel.locator('article h4').filter({ hasText: ': BLOCKED' }).count(), 1); }
        else assert.ok(text.includes('構造検証: PASS'));
        result.observations.push({ finding: 'R2', blockedChild, state: 'BLOCKED', unknownRows: 2, panel: text });
      };
      await check(true); await state.scrollIntoViewIfNeeded(); await page.screenshot({ path: `${stem}-blocked-child.png` });
      const child = dialog.locator('[data-preview-key="notes:0:evidence:0"]'); await tap(child.getByRole('button', { name: '候補から解除', exact: true }));
      assert.ok((await state.innerText()).includes('STALE')); assert.equal(await panel.locator('article').count(), 0);
      await tap(generate); await check(false); await state.scrollIntoViewIfNeeded(); await page.screenshot({ path: `${stem}-without-child.png` });
      await tap(child.getByRole('button', { name: '復元候補に選択', exact: true })); assert.ok((await state.innerText()).includes('STALE')); await tap(generate); await check(true);
      // Synthetic external writer is separated from the app's intercepted calls.
      await page.evaluate(({ key, raw }) => window.__reviewOriginal.setItem.call(localStorage, key, raw + ' '), { key, raw });
      await page.waitForFunction(() => document.querySelector('[data-testid="restore-plan-state"]')?.textContent.includes('STALE'));
      assert.equal(await panel.locator('article').count(), 0); await tap(acquire); assert.ok((await state.innerText()).includes('STALE')); await tap(generate); await check(true);
      await page.evaluate(({ key, raw }) => window.__reviewOriginal.setItem.call(localStorage, key, raw), { key, raw });
      await tap(acquire); await tap(generate); await check(true);
      result.verified.push('R2 selection/raw STALE hides prior details; explicit revalidation; removing/reselecting blocked child retains formula/report UNKNOWN');
    });
    assert.ok(result.observedTouchStarts >= result.touches); result.status = 'passed';
  } catch (error) { result.status = 'failed'; result.error = String(error); throw error; }
  finally { result.finishedAt = new Date().toISOString(); await writeFile(`${stem}.json`, JSON.stringify(result, null, 2)); }
  return result;
}
