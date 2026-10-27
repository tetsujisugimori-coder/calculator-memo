import assert from 'node:assert/strict';

/** Native read-only tracking acceptance; only fixture setup and the independent
 * writer modify storage. Every application activation uses the scenario driver. */
export async function exerciseAuditComparisonNavigation({ page, context, base, expect, passed, prefix, assertHorizontalFit, activate, screenshot }) {
  const key = 'calculation-memo:data', at = '2026-10-27T13:00:00+09:00';
  const original = await page.evaluate(key => localStorage.getItem(key), key);
  const formulaId = 'navigation-f', reportId = 'navigation-r';
  const marker = (kind, data) => '```calculator-memo-' + kind + '\n' + JSON.stringify(data) + '\n```';
  const fixed = recordId => marker('audit-record-start-v1', { version: 1, recordId, formulaId, reportId, generatedAt: at, bodySha256: 'a'.repeat(64), bodyLength: 0 }) + '\n\n当時の固定点検記録 ' + recordId + '\n\n' + marker('audit-record-end-v1', { version: 1, recordId });
  const start = marker('audit-comparison-record-start-v1', { version: 1, materialId: 'navigation-日本語-👩‍💻', formulaId, reportId, beforeRecordId: 'navigation-A', afterRecordId: 'navigation-B', preparedAt: at });
  const end = marker('audit-comparison-record-end-v1', { version: 1, materialId: 'navigation-日本語-👩‍💻' });
  const material = start + '\n\n## 固定された説明\n比較不能と一致は別の状態。本文から推測しない。😀\n\n' + end;
  const a = fixed('navigation-A'), b = fixed('navigation-B');
  const body = ['前文 日本語😀 e\u0301', a, material, b, '後方の独立した本文'].join('\n\n');
  const fixture = () => ({ version: 1, history: [], notes: [], settings: { theme: 'light', activePanel: 'history' },
    formulaLibrary: { version: 1, selectedId: formulaId, entries: [{ id: formulaId, title: '固定比較資料の読取専用追跡', expression: '1', createdAt: at, updatedAt: at }] },
    formulaReports: { version: 1, entries: [{ id: reportId, formulaId, title: '出典と本文位置', body, createdAt: at, updatedAt: at, confirmedExpression: null, evidence: { version: 1, links: [], confirmations: [] } }] } });
  const region = () => page.getByRole('region', { name: '固定A/B比較資料', exact: true });
  const detail = () => page.getByRole('region', { name: '固定比較資料の詳細', exact: true });
  const audit = () => page.getByRole('dialog', { name: 'レポート全体の根拠点検', exact: true });
  const editor = () => page.locator('#formula-report-body');
  const button = name => page.getByRole('button', { name, exact: true });
  const raw = () => page.evaluate(key => localStorage.getItem(key), key);
  let activations = 0;
  const click = async name => { await activate(button(name)); activations++; };
  const inspect = async () => { await click('根拠点検'); await click('比較資料1の詳細'); };
  const open = async () => {
    await page.goto(base); await page.evaluate(({ key, data }) => localStorage.setItem(key, JSON.stringify(data)), { key, data: fixture() }); await page.reload();
    await click('登録式ライブラリ'); await click('関連レポートを閲覧・編集'); await click('Markdownを編集');
  };
  const selected = () => editor().evaluate(node => ({ start: node.selectionStart, end: node.selectionEnd, text: node.value.slice(node.selectionStart, node.selectionEnd) }));
  const writer = await context.newPage();
  try {
    await writer.route('**/__comparison_navigation_writer.html', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Synthetic navigation writer</title>' }));
    await writer.goto(base + '__comparison_navigation_writer.html');
    await open(); const saved = await raw(); await inspect();
    await expect(region()).toContainText('認識できた固定比較資料 1件');
    await expect(detail()).toContainText('構造化記録なし'); await expect(region()).toContainText(at);
    const full = page.getByRole('textbox', { name: '固定比較資料の本文全文', exact: true });
    await expect(full).toHaveValue(material); await expect(full).toHaveAttribute('readonly', '');
    for (const theme of ['dark', 'light']) {
      await page.evaluate(theme => { document.documentElement.dataset.theme = theme; document.documentElement.style.fontSize = '200%'; }, theme);
      await assertHorizontalFit(); await full.focus(); await page.keyboard.press('Tab'); await expect(button('この比較資料の本文へ移動')).toBeFocused();
      for (const name of ['この比較資料の本文へ移動', '比較元Aの出典本文へ移動', '比較先Bの出典本文へ移動']) {
        const rect = await button(name).boundingBox(); assert.ok(rect && rect.height >= 44, 'Read-only navigation remains a 44px touch control: ' + name);
      }
      await screenshot(prefix + (theme === 'light' ? '-comparison-source-detail' : '-comparison-source-dark-200'), undefined, false, true);
    }
    await page.evaluate(() => document.documentElement.style.fontSize = '');
    assert.equal(await raw(), saved);
    await passed(prefix + ': fixed comparison source detail preserves exact historical Unicode text and explicit absent structured state without reading new originals with keyboard focus and both themes CSS 200 percent');

    for (const [name, text] of [['比較元Aの出典本文へ移動', a], ['比較先Bの出典本文へ移動', b], ['この比較資料の本文へ移動', material]]) {
      await click(name); await expect(audit()).toHaveCount(0); await expect(editor()).toBeFocused();
      await expect.poll(selected).toEqual({ start: body.indexOf(text), end: body.indexOf(text) + text.length, text });
      await expect(editor()).toHaveValue(body); assert.equal(await raw(), saved); await inspect();
    }
    await passed(prefix + ': unique version one sources A B and comparison material navigate exact original ranges without body original history or calculation changes');
    await click('根拠点検を閉じる');

    await editor().fill(a + '\n\n' + material); await inspect();
    await expect(button('比較元Aの出典本文へ移動')).toBeEnabled(); await expect(button('比較先Bの出典本文へ移動')).toBeDisabled(); await expect(full).toHaveValue(material);
    await click('根拠点検を閉じる'); await editor().fill(body + '\n\n' + a); await inspect();
    await expect(button('比較元Aの出典本文へ移動')).toBeDisabled(); await expect(full).toHaveValue(material); assert.equal(await raw(), saved);
    await passed(prefix + ': missing and duplicate source identities stay non-navigable while fixed comparison text remains readable and saved data unchanged');
    await click('根拠点検を閉じる');

    const ambiguous = [a, start, end, b, end].join('\n\n'); await editor().fill(ambiguous); await inspect();
    await expect(region()).toContainText('不完全'); await expect(button('この比較資料の本文へ移動')).toBeDisabled(); await expect(button('比較先Bの出典本文へ移動')).toBeDisabled();
    const candidates = page.getByRole('region', { name: '固定点検記録の2時点比較', exact: true }).getByRole('combobox', { name: '比較先B', exact: true }).locator('option');
    await expect(candidates.filter({ hasText: 'navigation-B' })).toHaveCount(0); assert.equal(await raw(), saved);
    await passed(prefix + ': ambiguous same ID early end never promotes internal source B or enables material navigation and incomplete inventory remains explicit');
    await click('根拠点検を閉じる');

    await editor().fill(body); await inspect(); await click('根拠点検を閉じる');
    const edited = '編集後😀\n' + body; await editor().fill(edited); await inspect(); await click('比較元Aの出典本文へ移動');
    await expect.poll(selected).toEqual({ start: edited.indexOf(a), end: edited.indexOf(a) + a.length, text: a }); await expect(editor()).toHaveValue(edited); assert.equal(await raw(), saved);
    await passed(prefix + ': editing and reopening resolves only the new held body source positions without reusing stale offsets or persisting draft');

    for (const kind of ['changed', 'deleted']) {
      await open(); await inspect();
      const next = fixture(); if (kind === 'changed') next.formulaReports.entries[0].body = '独立ページの保存本文'; else next.formulaReports.entries = [];
      const changed = JSON.stringify(next);
      await writer.evaluate(({ key, changed }) => localStorage.setItem(key, changed), { key, changed });
      await expect(detail()).toHaveCount(0); await expect(region()).toContainText('追跡位置は失効'); await expect(editor()).toHaveValue(body);
      await click('比較資料1の詳細'); await expect(region()).toContainText('保存原本との一致は未確認'); await expect(full).toHaveValue(material);
      await click('比較元Aの出典本文へ移動'); await expect.poll(selected).toEqual({ start: body.indexOf(a), end: body.indexOf(a) + a.length, text: a });
      await expect(editor()).toHaveValue(body); assert.equal(await raw(), changed);
      await passed(prefix + ': real separate page storage ' + kind + ' invalidates old detail while CalculatorApp retains draft and explicitly reselected source navigates held body only without overwrite');
    }
    assert.equal(activations, 44, 'Native source tracking activations cannot silently disappear');
  } finally {
    await writer.close();
    await page.evaluate(({ key, original }) => { if (original === null) localStorage.removeItem(key); else localStorage.setItem(key, original); document.documentElement.style.fontSize = ''; }, { key, original }); await page.reload();
  }
}
