import assert from 'node:assert/strict';

/** Native synthetic app path. Only fixture setup / the independent writer uses
 * storage directly; the editor is changed by fill and actual UI activations. */
export async function exerciseAuditComparisonInsertion({ page, context, base, expect, passed, prefix, assertHorizontalFit, activate, screenshot }) {
  const key = 'calculation-memo:data';
  const original = await page.evaluate(key => localStorage.getItem(key), key);
  const at = '2026-10-26T00:00:00.000Z';
  const formulaId = 'insert-comparison-f', reportId = 'insert-comparison-r';
  const longId = 'quote-日本語-👩‍💻-' + 'long-id-'.repeat(9);
  const record = value => ({ id: 'same-source', evaluator: 'calculator-memo-v1', status: 'confirmed', calculatedAt: at, persistedAt: at,
    blocks: [{ blockId: 'block', position: 1, expression: value === 1 ? '1+1' : '2', result: '2', resultText: '2', status: 'success', inputs: [] }] });
  const fixed = (recordId, value, empty = false) => {
    const comparison = { version: 1, state: 'checked', acquisitionStatus: 'ok', complete: true, reason: 'Synthetic known record', fetchedAt: at,
      items: empty ? [] : [{ id: longId, kind: 'quote', bodyStatus: 'intact', reason: '日本語 Unicode | ` ~~~~\n全文保持', sources: [{ side: 'quote', memoId: 'source-m', blockId: 'block', status: 'matched', reason: 'Synthetic matched', linked: true, frozen: record(value), observed: record(value) }] }] };
    return '```calculator-memo-audit-record-start-v2\n' + JSON.stringify({ version: 2, recordId, formulaId, reportId, generatedAt: at, bodySha256: 'a'.repeat(64), bodyLength: 100, comparison }) + '\n```\n\nHistorical audit ' + recordId + '\n\n```calculator-memo-audit-record-end-v2\n' + JSON.stringify({ version: 2, recordId }) + '\n```';
  };
  const bodyFor = empty => 'SELECTED 日本語👩‍💻　英数字\n\n' + fixed('insert-A', 1, empty) + '\n\n' + fixed('insert-B', 2, empty);
  const fixture = empty => ({ version: 1, history: [], notes: [], settings: { theme: 'light', activePanel: 'history' },
    formulaLibrary: { version: 1, selectedId: formulaId, entries: [{ id: formulaId, title: '比較資料 <script> inert', expression: '1', createdAt: at, updatedAt: at }] },
    formulaReports: { version: 1, entries: [{ id: reportId, formulaId, title: '比較資料固定挿入', body: bodyFor(empty), createdAt: at, updatedAt: at, confirmedExpression: null, evidence: { version: 1, links: [], confirmations: [] } }] } });
  const audit = () => page.getByRole('dialog', { name: 'レポート全体の根拠点検', exact: true });
  const comparison = () => page.getByRole('region', { name: '固定点検記録の2時点比較', exact: true });
  const result = () => comparison().getByRole('region', { name: '2時点比較結果', exact: true });
  const preview = () => page.getByRole('region', { name: '比較資料の固定挿入プレビュー', exact: true });
  const markdown = () => page.getByRole('textbox', { name: '挿入する比較資料Markdown全文', exact: true });
  const editor = () => page.locator('#formula-report-body');
  const button = name => page.getByRole('button', { name, exact: true });
  let activations = 0;
  const click = async name => { await activate(button(name)); activations++; };
  const raw = () => page.evaluate(key => localStorage.getItem(key), key);
  const open = async (empty = false) => {
    await page.goto(base); await page.evaluate(({ key, data }) => localStorage.setItem(key, JSON.stringify(data)), { key, data: fixture(empty) }); await page.reload();
    await click('登録式ライブラリ'); await click('関連レポートを閲覧・編集'); await click('Markdownを編集');
    await editor().focus(); await editor().evaluate(node => node.setSelectionRange(0, 8));
  };
  const select = async () => {
    for (const [label, recordId] of [['比較元A', 'insert-A'], ['比較先B', 'insert-B']]) {
      const field = comparison().getByRole('combobox', { name: label, exact: true });
      const value = await field.locator('option').filter({ hasText: recordId }).getAttribute('value'); await field.selectOption(value);
    }
    await click('選択した2記録を比較');
  };
  const prepare = async () => { await click('比較結果をレポートに挿入'); await expect(preview()).toBeVisible(); };
  const second = await context.newPage();
  try {
    await second.route('**/__comparison_material_writer.html', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Synthetic material writer</title>' }));
    await second.goto(base + '__comparison_material_writer.html');
    await open(); const saved = await raw();
    await click('根拠点検'); await expect(button('比較結果をレポートに挿入')).toHaveCount(0);
    await select(); await expect(result()).toContainText('変更あり');
    await click('比較結果Markdownをプレビュー');
    const exported = await comparison().getByRole('textbox', { name: '比較結果Markdown全文（プレビュー）', exact: true }).inputValue();
    await prepare(); const firstPreview = await markdown().inputValue();
    assert.ok(firstPreview.includes(exported), 'Insertion wraps the identical exported bytes, including its original output time');
    assert.ok(firstPreview.includes('insert-A') && firstPreview.includes('insert-B') && firstPreview.includes(longId));
    await expect(preview()).toContainText(reportId); await expect(preview()).toContainText('0');
    for (const theme of ['dark', 'light']) {
      await page.evaluate(theme => { document.documentElement.dataset.theme = theme; document.documentElement.style.fontSize = '200%'; }, theme);
      await assertHorizontalFit(); await markdown().focus(); await expect(markdown()).toBeFocused();
      for (const name of ['比較資料を本文へ固定挿入', '比較資料の挿入をやめる']) {
        const rect = await button(name).boundingBox(); assert.ok(rect && rect.height >= 44, name + ' retains 44px control');
      }
    }
    await markdown().focus(); await page.keyboard.press('Tab'); await expect(button('比較資料を本文へ固定挿入')).toBeFocused();
    await page.keyboard.press('Tab'); await expect(button('比較資料の挿入をやめる')).toBeFocused();
    await markdown().scrollIntoViewIfNeeded();
    await screenshot(prefix + '-comparison-material-preview', undefined, false, true);
    await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
    await click('比較資料の挿入をやめる'); await expect(preview()).toHaveCount(0); await expect(button('比較結果をレポートに挿入')).toBeFocused();
    assert.equal(await raw(), saved);
    await passed(prefix + ': comparison material full preview reuses export bytes direction long Unicode identities and output time with cancel focus both themes CSS 200 percent and no persistence');

    await prepare(); const inserted = await markdown().inputValue();
    await click('比較資料を本文へ固定挿入'); await expect(audit()).toHaveCount(0);
    await expect(editor()).toHaveValue(inserted + '\n\n' + bodyFor(false)); await expect(editor()).toBeFocused();
    assert.equal(await raw(), saved);
    await click('直前の比較資料挿入を取り消す'); await expect(editor()).toHaveValue(bodyFor(false)); assert.equal(await raw(), saved);
    await passed(prefix + ': explicit comparison material insertion keeps selected prose and exact dedicated undo restores original body without modifying snapshots saved records or confirmations');

    await editor().focus(); await editor().evaluate(node => node.setSelectionRange(0, 0));
    await click('根拠点検'); await select(); await prepare(); const secondMaterial = await markdown().inputValue();
    await click('比較資料を本文へ固定挿入'); await click('根拠点検');
    await expect(audit()).toContainText('認識できた出現 0件');
    await expect(comparison().getByRole('combobox', { name: '比較元A', exact: true }).locator('option')).toHaveCount(3);
    await click('根拠点検を閉じる');
    const edited = secondMaterial + '\n\n' + bodyFor(false) + '\nUSER EDIT ' + secondMaterial;
    await editor().fill(edited); await click('直前の比較資料挿入を取り消す');
    await expect(editor()).toHaveValue(edited); await expect(page.getByRole('alert').filter({ hasText: '安全な取消を確認できません' })).toBeVisible();
    assert.equal(await raw(), saved);
    await passed(prefix + ': inserted comparison material never becomes an audit item or A B candidate and duplicate text plus later editing cannot trick dedicated undo into deleting another occurrence');

    for (const kind of ['changed', 'deleted']) {
      await open(); await click('根拠点検'); await select(); await prepare();
      const changed = fixture(false); if (kind === 'deleted') changed.formulaReports.entries = []; else changed.formulaReports.entries[0].body = 'EXTERNAL BODY';
      const external = JSON.stringify(changed);
      await second.evaluate(({ key, external }) => localStorage.setItem(key, external), { key, external });
      await expect(preview()).toHaveCount(0); await expect(result()).toHaveCount(0); await expect(audit()).toContainText('現在の保存本文との一致は未確認');
      await click('保存記録と照合'); await click('根拠点検を閉じる'); await click('根拠点検');
      await expect(preview()).toHaveCount(0); await expect(audit()).toContainText('現在の保存本文との一致は未確認');
      await select(); await expect(button('比較結果をレポートに挿入')).toBeDisabled();
      await click('根拠点検を閉じる'); await expect(editor()).toHaveValue(bodyFor(false)); assert.equal(await raw(), external);
      await passed(prefix + ': native second-page report ' + kind + ' invalidates comparison insertion while real CalculatorApp retains its old draft and source refresh cannot certify saved-body equality');
    }

    await open(); await click('根拠点検'); await select(); await prepare();
    await click('保存記録と照合'); await expect(preview()).toHaveCount(0); await expect(result()).toHaveCount(0);
    await select(); await prepare(); await click('比較元Aと比較先Bを入れ替える'); await expect(preview()).toHaveCount(0);
    await click('選択した2記録を比較'); await prepare();
    const reverse = await markdown().inputValue();
    assert.ok(reverse.indexOf('insert-B') < reverse.indexOf('insert-A'), 'A to B direction follows explicit swapped selection');
    await click('根拠点検を閉じる'); await expect(editor()).toHaveValue(bodyFor(false)); assert.equal(await raw(), saved);
    await passed(prefix + ': explicit acquisition and A B swap discard old insertion targets and regenerated reverse direction does not silently reuse an earlier preview');

    await open(true); const emptySaved = await raw(); await click('根拠点検'); await select();
    await expect(result()).toContainText('総合状態：比較不能'); await prepare();
    const emptyMaterial = await markdown().inputValue();
    assert.ok(emptyMaterial.includes('両記録に比較可能な根拠項目がありません。取得成功は根拠の一致を意味しません。'));
    await click('比較資料を本文へ固定挿入'); const persistedBody = emptyMaterial + '\n\n' + bodyFor(true);
    await expect(editor()).toHaveValue(persistedBody); assert.equal(await raw(), emptySaved);
    await click('レポートを保存');
    await expect.poll(async () => JSON.parse(await raw()).formulaReports.entries[0].body).toBe(persistedBody);
    const afterSave = JSON.parse(await raw());
    assert.deepEqual(afterSave.formulaReports.entries[0].evidence.confirmations, []); assert.deepEqual(afterSave.notes, []); assert.deepEqual(afterSave.history, []);
    await expect(button('直前の比較資料挿入を取り消す')).toBeDisabled();
    await page.reload(); await click('登録式ライブラリ'); await click('関連レポートを閲覧・編集'); await click('根拠点検');
    await expect(audit()).toContainText('認識できた出現 0件');
    await expect(comparison().getByRole('combobox', { name: '比較元A', exact: true }).locator('option')).toHaveCount(3);
    assert.equal(JSON.parse(await raw()).formulaReports.entries[0].body, persistedBody);
    await passed(prefix + ': incomparable empty successful records are insertable with their exact reason and only explicit save persists material which remains excluded from evidence after real reload');

    await click('根拠点検を閉じる'); await click('Markdownを編集');
    const protectedPosition = persistedBody.indexOf('##'); assert.ok(protectedPosition > 0 && protectedPosition < emptyMaterial.length);
    await editor().focus(); await editor().evaluate((node, position) => node.setSelectionRange(position, position), protectedPosition);
    await click('根拠点検'); await select(); await click('比較結果をレポートに挿入');
    await expect(preview()).toHaveCount(0); await expect(audit().getByRole('alert')).toContainText('挿入');
    await click('根拠点検を閉じる'); await expect(editor()).toHaveValue(persistedBody);
    assert.equal(JSON.parse(await raw()).formulaReports.entries[0].body, persistedBody);
    await passed(prefix + ': insertion inside an existing fixed comparison material is rejected in the real editor without splitting its protected body or altering saved content');
    assert.equal(activations, 70, 'New helper real button activations are deterministic and cannot silently drop operations');
  } finally {
    await second.close();
    await page.evaluate(({ key, original }) => { if (original === null) localStorage.removeItem(key); else localStorage.setItem(key, original); document.documentElement.style.fontSize = ''; }, { key, original });
    await page.reload();
  }
}
