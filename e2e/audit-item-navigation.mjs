import assert from 'node:assert/strict';

// Synthetic app interactions; no alternative parser or product-side test hook.
export async function exerciseAuditItemNavigation({ page, base, expect, passed, prefix, assertHorizontalFit, activate }) {
  const key = 'calculation-memo:data', at = '2026-10-28T07:00:00.000Z';
  const original = await page.evaluate(key => localStorage.getItem(key), key);
  const formulaId = 'item-nav-f', reportId = 'item-nav-r';
  const marker = (kind, data) => '```calculator-memo-' + kind + '\n' + JSON.stringify(data) + '\n```';
  const record = { id: 'roundtrip-source', evaluator: 'calculator-memo-v1', status: 'confirmed', calculatedAt: at, persistedAt: at, blocks: [{ blockId: 'b', position: 1, expression: '1', result: '1', resultText: '1', status: 'success', inputs: [] }] };
  const quote = quoteId => {
    const snapshot = { version: 1, quoteId, formulaId, memoId: 'roundtrip-m', blockId: 'b', citedAt: at, record };
    const text = ['計算根拠引用（固定スナップショット）', `引用ID：${quoteId}`, `登録式ID：${formulaId}`, 'メモID：roundtrip-m', '記録ID：roundtrip-source', 'ブロックID：b', `引用日時：${at}`, `計算日時：${at}`, `保存要求時刻：${at}`, '本文順：1', '実行順：1', '計算モード：legacy（旧方式）', '当時の式：\n1', '当時の表示結果：\n1', '当時の内部結果：1', '記録内の状態：成功・確定記録。真正性や数学的証明の保証ではありません。', '実使用参照元・内部値：', '記録内に実使用参照入力なし', '追跡対象は同じIDの保存記録全体です。現在の計算メモ本文や新しい別IDの計算記録とは比較しません。'].join('\n');
    return '```text\n' + text + '\n```\n\n' + marker('evidence-v1', snapshot);
  };
  const q1 = quote('item-q1'), q2 = quote('item-q2');
  const legacy = '## 引用時の計算記録と保存記録の差分\n\n旧形式の詳細も飛ばさない';
  const body = [q1, legacy, q2].join('\n\n');
  const fixture = () => ({ version: 1, history: [], notes: [], settings: { theme: 'light', activePanel: 'history' },
    formulaLibrary: { version: 1, selectedId: formulaId, entries: [{ id: formulaId, title: '点検の前後移動', expression: '1', createdAt: at, updatedAt: at }] },
    formulaReports: { version: 1, entries: [{ id: reportId, formulaId, title: '本文順の項目', body, createdAt: at, updatedAt: at, confirmedExpression: null, evidence: { version: 1, links: [], confirmations: [] } }] } });
  const audit = () => page.getByRole('dialog', { name: 'レポート全体の根拠点検', exact: true });
  const button = name => page.getByRole('button', { name, exact: true });
  const editor = () => page.locator('#formula-report-body');
  const position = text => page.getByText(text, { exact: true });
  let activations = 0;
  const click = async name => { await activate(button(name)); activations++; };
  const filter = () => page.getByRole('combobox', { name: '詳細で表示する状態', exact: true });
  const chooseFilter = async value => { await activate(filter()); activations++; await filter().selectOption(value); };
  const raw = () => page.evaluate(key => window.__itemNavOriginalGet.call(localStorage, key), key);
  const reads = () => page.evaluate(() => window.__itemNavReads);
  const selectedText = () => editor().evaluate(node => node.value.slice(node.selectionStart, node.selectionEnd));
  try {
    await page.goto(base); await page.evaluate(({ key, data }) => localStorage.setItem(key, JSON.stringify(data)), { key, data: fixture() }); await page.reload();
    await click('登録式ライブラリ'); await click('関連レポートを閲覧・編集'); await click('Markdownを編集');
    await page.evaluate(key => {
      window.__itemNavReads = 0; window.__itemNavOriginalGet = Storage.prototype.getItem;
      Storage.prototype.getItem = function (name) { if (this === localStorage && name === key) window.__itemNavReads++; return window.__itemNavOriginalGet.call(this, name); };
    }, key);
    const saved = await raw(); await click('根拠点検');
    await expect(page.getByText(/対象3件中\d+件目/)).toHaveCount(0);
    await expect(audit()).toContainText('一覧から');
    await click('根拠1の詳細'); await expect(position('対象3件中1件目')).toBeVisible();
    await expect(button('前の項目')).toHaveAttribute('aria-disabled', 'true');
    const beforeReads = await reads();
    await click('次の項目'); await expect(position('対象3件中2件目')).toBeVisible();
    await expect(button('次の項目')).toBeFocused();
    await expect(button('この項目の本文へ移動')).toBeDisabled();
    await click('次の項目'); await expect(position('対象3件中3件目')).toBeVisible();
    await expect(button('次の項目')).toHaveAttribute('aria-disabled', 'true'); await expect(button('次の項目')).toBeFocused();
    await page.keyboard.press('Enter'); await expect(position('対象3件中3件目')).toBeVisible();
    await click('前の項目'); await expect(position('対象3件中2件目')).toBeVisible();
    await click('前の項目'); await expect(position('対象3件中1件目')).toBeVisible(); await expect(button('前の項目')).toBeFocused();
    await page.keyboard.press('Space'); await expect(position('対象3件中1件目')).toBeVisible();
    assert.equal(await reads(), beforeReads); assert.equal(await raw(), saved);
    await passed(prefix + ': filtered body order visits intact and untracked items without skipping, never wraps, and preserves keyboard focus at both endpoints without acquisition or persistence');

    await click('次の項目'); await click('次の項目');
    for (const theme of ['dark', 'light']) {
      await page.evaluate(theme => { document.documentElement.dataset.theme = theme; document.documentElement.style.fontSize = '200%'; }, theme);
      await assertHorizontalFit();
      for (const name of ['前の項目', '次の項目']) { const box = await button(name).boundingBox(); assert.ok(box && box.height >= 44, name + ' remains a touch target'); }
    }
    await page.evaluate(() => document.documentElement.style.fontSize = '');
    await button('この項目の本文へ移動').focus(); await page.keyboard.press('Enter'); await expect.poll(selectedText).toBe(q2);
    await click('点検へ戻る'); await expect(position('対象3件中3件目')).toBeVisible(); await expect(button('この項目の本文へ移動')).toBeFocused();
    await click('前の項目'); await click('前の項目'); await click('この項目の本文へ移動'); await expect.poll(selectedText).toBe(q1);
    await click('点検へ戻る'); await expect(position('対象3件中1件目')).toBeVisible();
    assert.equal(await reads(), beforeReads); assert.equal(await raw(), saved); await expect(editor()).toHaveValue(body);
    await passed(prefix + ': stepping then repeated body roundtrips restores the precise selected occurrence and focus with both themes CSS 200 percent, unchanged body snapshots history and no source reacquisition');

    await chooseFilter('unverified'); await expect(position('対象2件中1件目')).toBeVisible();
    await click('次の項目'); await expect(position('対象2件中2件目')).toBeVisible();
    await chooseFilter('all'); await expect(position('対象3件中3件目')).toBeVisible();
    await click('前の項目'); await expect(position('対象3件中2件目')).toBeVisible();
    await chooseFilter('unverified'); await expect(page.getByRole('region', { name: '点検項目の前後移動', exact: true })).toHaveCount(0);
    await expect(page.getByText(/対象\d+件中\d+件目/)).toHaveCount(0); await expect(audit()).toContainText(/絞り込み.*対象外|対象外.*絞り込み/);
    await expect(audit().getByRole('combobox', { name: '表示する状態', exact: true })).toHaveValue('unverified');
    assert.equal(await raw(), saved); assert.equal(await reads(), beforeReads);
    await passed(prefix + ': detail filter retains occurrence identity and recalculates count and neighbors, excluded selection clears with reason instead of silently choosing another item');

    await click('根拠3の詳細'); await expect(position('対象2件中2件目')).toBeVisible();
    await click('この項目の本文へ移動'); await expect.poll(selectedText).toBe(q2);
    await editor().fill('加筆\n' + body); await editor().fill(body);
    await click('点検へ戻る'); await expect(page.getByText(/対象\d+件中\d+件目/)).toHaveCount(0);
    await expect(button('次の項目')).toHaveCount(0); await expect(audit()).toContainText('失効');
    await click('保存記録と照合'); await expect(page.getByText(/対象\d+件中\d+件目/)).toHaveCount(0);
    await expect(audit()).toContainText('対象項目がありません');
    const refreshedFilter = audit().getByRole('combobox', { name: '表示する状態', exact: true });
    await activate(refreshedFilter); activations++; await refreshedFilter.selectOption('all');
    await expect(audit()).toContainText('一覧から'); assert.equal(await raw(), saved); await expect(editor()).toHaveValue(body);
    await passed(prefix + ': native edited-body ABA cannot restore old selection or position on return and explicit reacquisition requires fresh selection without changing stored bytes');

    await click('根拠点検を閉じる'); await editor().fill(q1); await click('根拠点検');
    const mainFilter = audit().getByRole('combobox', { name: '表示する状態', exact: true });
    await activate(mainFilter); activations++; await mainFilter.selectOption('all');
    await click('根拠1の詳細'); await expect(position('対象1件中1件目')).toBeVisible();
    await expect(button('前の項目')).toHaveAttribute('aria-disabled', 'true'); await expect(button('次の項目')).toHaveAttribute('aria-disabled', 'true');
    await button('次の項目').focus(); await page.keyboard.press('Enter'); await expect(position('対象1件中1件目')).toBeVisible(); await expect(button('次の項目')).toBeFocused();
    await click('根拠一覧に戻る'); await click('根拠点検を閉じる'); await click('根拠点検');
    await expect(page.getByText(/対象\d+件中\d+件目/)).toHaveCount(0); await expect(audit()).toContainText('一覧から');
    assert.equal(await raw(), saved);
    await passed(prefix + ': single-item navigation disables both directions without losing focus and closing then reopening starts without fabricated or restored selection');

    await click('根拠点検を閉じる'); await editor().fill('根拠のない通常の本文'); await click('根拠点検');
    await expect(page.getByText(/対象\d+件中\d+件目/)).toHaveCount(0); await expect(button('次の項目')).toHaveCount(0); await expect(audit()).toContainText('項目がありません');
    assert.equal(await raw(), saved); await expect(editor()).toHaveValue('根拠のない通常の本文'); await click('根拠点検を閉じる');
    await passed(prefix + ': zero items has an explicit empty state and no position or previous-next controls, without saving the edited body or inventing completion');
    assert.equal(activations, 36, 'Item navigation acceptance cannot silently omit native activations');
  } finally {
    await page.evaluate(({ key, original }) => { if (window.__itemNavOriginalGet) Storage.prototype.getItem = window.__itemNavOriginalGet; if (original === null) localStorage.removeItem(key); else localStorage.setItem(key, original); document.documentElement.style.fontSize = ''; }, { key, original }); await page.reload();
  }
}
