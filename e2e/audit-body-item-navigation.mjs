import assert from 'node:assert/strict';

// Synthetic app interactions; no alternative parser or product-side test hook.
export async function exerciseAuditBodyItemNavigation({ page, context, base, expect, passed, prefix, assertHorizontalFit, activate }) {
  const key = 'calculation-memo:data', at = '2026-10-28T07:00:00.000Z';
  const original = await page.evaluate(key => localStorage.getItem(key), key);
  const formulaId = 'body-nav-f', reportId = 'body-nav-r';
  const marker = (kind, data) => '```calculator-memo-' + kind + '\n' + JSON.stringify(data) + '\n```';
  const record = { id: 'roundtrip-source', evaluator: 'calculator-memo-v1', status: 'confirmed', calculatedAt: at, persistedAt: at, blocks: [{ blockId: 'b', position: 1, expression: '1', result: '1', resultText: '1', status: 'success', inputs: [] }] };
  const quote = quoteId => {
    const snapshot = { version: 1, quoteId, formulaId, memoId: 'roundtrip-m', blockId: 'b', citedAt: at, record };
    const text = ['計算根拠引用（固定スナップショット）', `引用ID：${quoteId}`, `登録式ID：${formulaId}`, 'メモID：roundtrip-m', '記録ID：roundtrip-source', 'ブロックID：b', `引用日時：${at}`, `計算日時：${at}`, `保存要求時刻：${at}`, '本文順：1', '実行順：1', '計算モード：legacy（旧方式）', '当時の式：\n1', '当時の表示結果：\n1', '当時の内部結果：1', '記録内の状態：成功・確定記録。真正性や数学的証明の保証ではありません。', '実使用参照元・内部値：', '記録内に実使用参照入力なし', '追跡対象は同じIDの保存記録全体です。現在の計算メモ本文や新しい別IDの計算記録とは比較しません。'].join('\n');
    return '```text\n' + text + '\n```\n\n' + marker('evidence-v1', snapshot);
  };
  const q1 = quote('body-q1'), q2 = quote('body-q2'), q3 = quote('body-q3');
  const legacy = '## 引用時の計算記録と保存記録の差分\n\n旧形式の詳細も飛ばさない';
  const body = [q1, q2, legacy, q3].join('\n\n');
  const fixture = { version: 1, history: [], notes: [], settings: { theme: 'light', activePanel: 'history' },
    formulaLibrary: { version: 1, selectedId: formulaId, entries: [{ id: formulaId, title: '本文からの前後移動', expression: '1', createdAt: at, updatedAt: at }] },
    formulaReports: { version: 1, entries: [{ id: reportId, formulaId, title: '本文と点検の現在項目', body, createdAt: at, updatedAt: at, confirmedExpression: null, evidence: { version: 1, links: [], confirmations: [] } }] } };
  const audit = () => page.getByRole('dialog', { name: 'レポート全体の根拠点検', exact: true });
  const target = () => page.getByRole('region', { name: '点検からの本文移動先', exact: true });
  const button = name => page.getByRole('button', { name, exact: true });
  const editor = () => page.locator('#formula-report-body');
  let activations = 0;
  const click = async name => { await activate(button(name)); activations++; };
  const step = async name => { await activate(target().getByRole('button', { name, exact: true })); activations++; };
  const selected = () => editor().evaluate(node => node.value.slice(node.selectionStart, node.selectionEnd));
  const raw = () => page.evaluate(key => window.__bodyNavGet.call(localStorage, key), key);
  const counts = () => page.evaluate(() => ({ reads: window.__bodyNavReads, writes: window.__bodyNavWrites }));
  const selection = async (text, position) => {
    await expect.poll(selected).toBe(text);
    await expect(target()).toContainText(position);
    await expect(target().locator('.audit-target-excerpt')).toHaveText(text);
  };
  const writer = await context.newPage();
  try {
    await writer.route('**/__body_nav_writer.html', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Synthetic body navigation writer</title>' }));
    await writer.goto(base + '__body_nav_writer.html');
    await page.goto(base); await page.evaluate(({ key, fixture }) => localStorage.setItem(key, JSON.stringify(fixture)), { key, fixture }); await page.reload();
    await click('登録式ライブラリ'); await click('関連レポートを閲覧・編集'); await click('Markdownを編集'); await click('根拠点検');
    await expect(audit()).toContainText('一覧から'); await expect(target()).toHaveCount(0);
    await click('根拠1の詳細'); await click('この項目の本文へ移動'); await selection(q1, '対象4件中1件目');
    await page.evaluate(key => {
      window.__bodyNavGet = Storage.prototype.getItem; window.__bodyNavSet = Storage.prototype.setItem;
      window.__bodyNavReads = 0; window.__bodyNavWrites = 0;
      Storage.prototype.getItem = function (name) { if (this === localStorage && name === key) window.__bodyNavReads++; return window.__bodyNavGet.call(this, name); };
      Storage.prototype.setItem = function (name, value) { if (this === localStorage && name === key) window.__bodyNavWrites++; return window.__bodyNavSet.call(this, name, value); };
    }, key);
    const saved = await raw();
    await expect(target().getByRole('button', { name: '前の項目', exact: true })).toHaveAttribute('aria-disabled', 'true');
    await target().getByRole('button', { name: '前の項目', exact: true }).focus(); await page.keyboard.press('Enter'); await selection(q1, '対象4件中1件目');
    await step('次の項目'); await selection(q2, '対象4件中2件目');
    await step('次の項目'); await selection(q2, '対象4件中2件目'); await expect(target()).toContainText(/移動でき|移動しません|確認でき/);
    await step('前の項目'); await selection(q1, '対象4件中1件目');
    assert.deepEqual(await counts(), { reads: 0, writes: 0 }); assert.equal(await raw(), saved);
    await passed(prefix + ': body sequential navigation follows exact occurrences and refuses the next untracked item without skipping or changing selected label range position or saved data');

    await click('点検へ戻る'); await expect(page.getByText('対象4件中1件目', { exact: true })).toBeVisible();
    const filter = page.getByRole('combobox', { name: '詳細で表示する状態', exact: true });
    await activate(filter); activations++; await filter.selectOption('unverified');
    await click('この項目の本文へ移動'); await selection(q1, '対象3件中1件目');
    await step('次の項目'); await selection(q2, '対象3件中2件目');
    await step('次の項目'); await selection(q3, '対象3件中3件目');
    await expect(target().getByRole('button', { name: '次の項目', exact: true })).toHaveAttribute('aria-disabled', 'true');
    await click('点検へ戻る'); await expect(page.getByText('対象3件中3件目', { exact: true })).toBeVisible();
    await expect(filter).toHaveValue('unverified'); await expect(button('この項目の本文へ移動')).toBeFocused();
    assert.deepEqual(await counts(), { reads: 0, writes: 0 }); assert.equal(await raw(), saved);
    await passed(prefix + ': body steps reuse current filtering and returning opens the newly reached item detail with filter and focus preserved without reacquisition');

    await click('この項目の本文へ移動'); await selection(q3, '対象3件中3件目');
    for (const theme of ['dark', 'light']) {
      await page.evaluate(theme => { document.documentElement.dataset.theme = theme; document.documentElement.style.fontSize = '200%'; }, theme);
      await assertHorizontalFit();
      for (const name of ['前の項目', '次の項目', '点検へ戻る']) {
        const node = target().getByRole('button', { name, exact: true }); const rect = await node.boundingBox();
        assert.ok(rect && rect.height >= 44, name + ' remains touch sized');
      }
    }
    await page.evaluate(() => document.documentElement.style.fontSize = '');
    await target().getByRole('button', { name: '前の項目', exact: true }).focus(); await page.keyboard.press('Enter'); await selection(q2, '対象3件中2件目');
    await target().getByRole('button', { name: '前の項目', exact: true }).focus(); await page.keyboard.press('Space'); await selection(q1, '対象3件中1件目');
    await target().getByRole('button', { name: '前の項目', exact: true }).focus(); await page.keyboard.press('Space'); await selection(q1, '対象3件中1件目');
    await step('次の項目'); await selection(q2, '対象3件中2件目'); await step('次の項目'); await selection(q3, '対象3件中3件目');
    await expect(target().getByRole('button', { name: '次の項目', exact: true })).toBeFocused();
    await page.keyboard.press('Enter'); await selection(q3, '対象3件中3件目');
    assert.deepEqual(await counts(), { reads: 0, writes: 0 }); assert.equal(await raw(), saved); await expect(editor()).toHaveValue(body);
    await passed(prefix + ': body navigation supports keyboard and touch with focus retained at endpoints and nonobstructing light dark 200 percent layout while snapshots and history remain unchanged');

    await editor().fill('加筆\n' + body); await editor().fill(body);
    await expect(target()).toContainText('失効'); await expect(target().getByText(/対象\d+件中\d+件目/)).toHaveCount(0);
    await click('点検へ戻る'); await expect(audit()).toContainText('失効'); await expect(page.getByText(/対象\d+件中\d+件目/)).toHaveCount(0);
    await click('保存記録と照合'); await expect(page.getByText(/対象\d+件中\d+件目/)).toHaveCount(0);
    const mainFilter = audit().getByRole('combobox', { name: '表示する状態', exact: true });
    await activate(mainFilter); activations++; await mainFilter.selectOption('all');
    await click('根拠2の詳細'); await click('この項目の本文へ移動'); await selection(q2, '対象4件中2件目');
    assert.equal(await raw(), saved); assert.equal((await counts()).writes, 0);
    await passed(prefix + ': body ABA invalidates old sequential position and explicit recheck never restores a previous selection until the user chooses anew');

    const updated = JSON.parse(saved); updated.settings.theme = 'dark';
    await writer.evaluate(({ key, updated }) => localStorage.setItem(key, JSON.stringify(updated)), { key, updated });
    await expect(target()).toContainText('失効'); await expect(target().getByText(/対象\d+件中\d+件目/)).toHaveCount(0);
    await expect(target().locator('.audit-target-excerpt')).toHaveCount(0);
    await click('点検へ戻る'); await expect(audit()).toContainText('失効'); await expect(page.getByText(/対象\d+件中\d+件目/)).toHaveCount(0);
    assert.equal(await raw(), JSON.stringify(updated)); assert.equal((await counts()).writes, 0); await expect(editor()).toHaveValue(body);
    await click('根拠点検を閉じる'); await expect(target()).toHaveCount(0);
    await passed(prefix + ': genuine external storage notification discards body range and position without overwriting the held draft or external saved bytes');

    await editor().fill(q1); await click('根拠点検'); await click('根拠1の詳細'); await click('この項目の本文へ移動'); await selection(q1, '対象1件中1件目');
    for (const name of ['前の項目', '次の項目']) await expect(target().getByRole('button', { name, exact: true })).toHaveAttribute('aria-disabled', 'true');
    await click('往復ナビゲーションを終了'); await expect(target()).toHaveCount(0);
    await editor().fill('根拠のない本文'); await click('根拠点検'); await expect(audit()).toContainText('項目がありません'); await expect(target()).toHaveCount(0);
    await expect(page.getByText(/対象\d+件中\d+件目/)).toHaveCount(0); await click('根拠点検を閉じる');
    assert.equal(await raw(), JSON.stringify(updated)); assert.equal((await counts()).writes, 0);
    await passed(prefix + ': a single body item has disabled boundaries and ending or reopening with zero items never fabricates body navigation or preserves old selection');
    assert.equal(activations, 31, 'Body navigation cannot omit native operations');
  } finally {
    await writer.close();
    await page.evaluate(({ key, original }) => { if (window.__bodyNavGet) Storage.prototype.getItem = window.__bodyNavGet; if (window.__bodyNavSet) Storage.prototype.setItem = window.__bodyNavSet; if (original === null) localStorage.removeItem(key); else localStorage.setItem(key, original); document.documentElement.style.fontSize = ''; }, { key, original });
    await page.reload();
  }
}
