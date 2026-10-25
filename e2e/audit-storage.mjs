import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

/** Actual CalculatorApp and native cross-page storage events, synthetic data only.
 * Uses explicit mouse/keyboard interactions; existing scenario touch coverage is unchanged. */
export async function exerciseAuditStorage({ page, context, base, expect, passed, prefix, assertHorizontalFit }) {
  const key = 'calculation-memo:data';
  const original = await page.evaluate(key => localStorage.getItem(key), key);
  const at = '2026-10-25T00:00:00.000Z';
  const formula = { id: 'held-f', title: 'Synthetic held report', expression: 'a+1', createdAt: at, updatedAt: at };
  const report = { id: 'held-r', formulaId: formula.id, title: 'Held report', body: 'Synthetic retained body', createdAt: at, updatedAt: at, confirmedExpression: null, evidence: { version: 1, links: [], confirmations: [] } };
  const fixture = { version: 1, history: [], notes: [], settings: { theme: 'light', activePanel: 'history' }, formulaLibrary: { version: 1, selectedId: formula.id, entries: [formula] }, formulaReports: { version: 1, entries: [report] } };
  const audit = () => page.getByRole('dialog', { name: 'レポート全体の根拠点検', exact: true });
  const click = name => page.getByRole('button', { name, exact: true }).click();
  const open = async (edited = false) => {
    await page.goto(base);
    await page.evaluate(({ key, fixture }) => localStorage.setItem(key, JSON.stringify(fixture)), { key, fixture });
    await page.reload();
    await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { window.__heldCopy = text; } } }));
    await click('登録式ライブラリ'); await click('関連レポートを閲覧・編集');
    if (edited) { await click('Markdownを編集'); await page.locator('#formula-report-body').fill('Synthetic local edit'); }
    await click('根拠点検'); await click('保存記録と照合');
  };
  const copy = async () => { await click('点検結果をコピー'); return page.evaluate(() => window.__heldCopy); };
  const held = text => {
    assert.ok(text.includes('現在の保存本文との一致は未確認'), 'Retained body must not be labelled current saved after a native storage event');
    assert.ok(!text.includes('現在表示中の保存済み本文（本文に未保存変更なし）'));
    assert.ok(!text.includes('登録式または保存済みレポートの変更・削除を検知'));
  };
  const second = await context.newPage();
  try {
    // No app runs in the writer page, preventing unrelated automatic writes.
    await second.route('**/__audit_storage_writer.html', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Synthetic storage writer</title>' }));
    await second.goto(base + '__audit_storage_writer.html');
    for (const kind of ['changed', 'deleted', 'edited', 'unrelated']) {
      await open(kind === 'edited');
      const next = structuredClone(fixture);
      if (kind === 'deleted') next.formulaReports.entries = [];
      else if (kind === 'unrelated') next.notes.push({ id: 'unrelated-memo', type: 'plain-calculation', title: 'Other saved note', content: 'not the report', createdAt: at, updatedAt: at });
      else next.formulaReports.entries[0].body = 'Synthetic other-tab body';
      const raw = JSON.stringify(next);
      await second.evaluate(({ key, raw }) => localStorage.setItem(key, raw), { key, raw });
      await expect(page.getByRole('alert').filter({ hasText: '別のタブなどで保存データが変わりました' })).toBeVisible();
      let text = await copy(); held(text);
      await expect(audit()).toContainText('現在の保存本文との一致は未確認');
      assert.ok(text.includes(`現在の編集基準本文との比較）：${kind === 'edited' ? 'あり' : 'なし'}`));
      await click('保存記録と照合'); text = await copy(); held(text); assert.ok(text.includes('点検状態：照合済み'));
      await click('根拠点検を閉じる'); await expect(page.getByRole('button', { name: '根拠点検', exact: true })).toBeFocused();
      await click('根拠点検'); held(await copy());
      const pending = page.waitForEvent('download'); await click('点検結果を.md出力');
      const download = await pending; const file = await readFile(await download.path(), 'utf8'); held(file);
      assert.equal(file.replace(/^出力日時.*$/m, ''), text.replace(/^出力日時.*$/m, ''));
      await click('根拠点検を閉じる');
      if (kind !== 'edited') await click('Markdownを編集');
      await expect(page.locator('#formula-report-body')).toHaveValue(kind === 'edited' ? 'Synthetic local edit' : report.body);
      assert.equal(await page.evaluate(key => localStorage.getItem(key), key), raw, 'View, check, copy and download must not modify external saved data');
      await passed(prefix + ': actual cross-page ' + kind + ' retains body equality caveat independently of source check and audit reopen, copy and download without writes');
    }
    for (const outcome of ['resolve', 'reject']) {
    await open();
    await page.evaluate(() => { navigator.clipboard.writeText = text => { window.__heldCopy = text; return new Promise((resolve, reject) => { window.__heldResolve = resolve; window.__heldReject = reject; }); }; });
    await click('点検結果をコピー');
    await second.evaluate(({ key, fixture }) => localStorage.setItem(key, JSON.stringify({ ...fixture, notes: [{ id: 'async-note', type: 'plain-calculation', title: 'Async', content: 'synthetic', createdAt: '2026-10-25T00:00:00.000Z', updatedAt: '2026-10-25T00:00:00.000Z' }] })), { key, fixture });
    await expect(audit()).toContainText('現在の保存本文との一致は未確認');
    await page.evaluate(outcome => outcome === 'resolve' ? window.__heldResolve() : window.__heldReject(new Error('synthetic delayed clipboard refusal')), outcome);
    await expect(audit().getByText('点検結果Markdown全文（手動コピー用）', { exact: true })).toHaveCount(0);
    await expect(audit().getByRole('status').filter({ hasText: '点検結果をコピーしました' })).toHaveCount(0);
    }
    await passed(prefix + ': cross-page update cancels stale asynchronous clipboard failure recovery and success notices');
    for (const theme of ['dark', 'light']) {
      await page.evaluate(theme => { document.documentElement.dataset.theme = theme; document.documentElement.style.fontSize = '200%'; }, theme);
      await expect(audit()).toContainText('現在の保存本文との一致は未確認');
      await assertHorizontalFit();
      await page.getByRole('button', { name: '点検結果をコピー', exact: true }).focus();
      await expect(page.getByRole('button', { name: '点検結果をコピー', exact: true })).toBeFocused();
    }
    await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
    await page.keyboard.press('Escape'); await expect(page.getByRole('button', { name: '根拠点検', exact: true })).toBeFocused();
    await passed(prefix + ': held-body caveat fits both themes at CSS 200 percent with keyboard Escape focus return');
  } finally {
    await second.close();
    await page.evaluate(({ key, original }) => { if (original === null) localStorage.removeItem(key); else localStorage.setItem(key, original); document.documentElement.style.fontSize = ''; }, { key, original });
    await page.reload();
  }
}
