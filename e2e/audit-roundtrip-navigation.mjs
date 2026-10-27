import assert from 'node:assert/strict';

/** Current held-body roundtrips only. Fixtures and the isolated writer are the
 * only storage writers; application controls use the native scenario driver. */
export async function exerciseAuditRoundtripNavigation({ page, context, base, expect, passed, prefix, assertHorizontalFit, activate, screenshot }) {
  const key = 'calculation-memo:data', at = '2026-10-27T14:00:00.000Z';
  const original = await page.evaluate(key => localStorage.getItem(key), key);
  const formulaId = 'roundtrip-f', reportId = 'roundtrip-r';
  const marker = (kind, data) => '```calculator-memo-' + kind + '\n' + JSON.stringify(data) + '\n```';
  const fixed = recordId => marker('audit-record-start-v1', { version: 1, recordId, formulaId, reportId, generatedAt: at, bodySha256: 'a'.repeat(64), bodyLength: 0 }) + '\n\n当時の固定点検記録 ' + recordId + '\n\n' + marker('audit-record-end-v1', { version: 1, recordId });
  const materialId = 'roundtrip-日本語-👩‍💻';
  const material = marker('audit-comparison-record-start-v1', { version: 1, materialId, formulaId, reportId, beforeRecordId: 'roundtrip-A', afterRecordId: 'roundtrip-B', preparedAt: at }) + '\n\n## 当時の比較\n再比較しない固定資料😀\n\n' + marker('audit-comparison-record-end-v1', { version: 1, materialId });
  const record = { id: 'roundtrip-source', evaluator: 'calculator-memo-v1', status: 'confirmed', calculatedAt: at, persistedAt: at, blocks: [{ blockId: 'b', position: 1, expression: '1', result: '1', resultText: '1', status: 'success', inputs: [] }] };
  const quote = quoteId => {
    const snapshot = { version: 1, quoteId, formulaId, memoId: 'roundtrip-m', blockId: 'b', citedAt: at, record };
    const text = ['計算根拠引用（固定スナップショット）', `引用ID：${quoteId}`, `登録式ID：${formulaId}`, 'メモID：roundtrip-m', '記録ID：roundtrip-source', 'ブロックID：b', `引用日時：${at}`, `計算日時：${at}`, `保存要求時刻：${at}`, '本文順：1', '実行順：1', '計算モード：legacy（旧方式）', '当時の式：\n1', '当時の表示結果：\n1', '当時の内部結果：1', '記録内の状態：成功・確定記録。真正性や数学的証明の保証ではありません。', '実使用参照元・内部値：', '記録内に実使用参照入力なし', '追跡対象は同じIDの保存記録全体です。現在の計算メモ本文や新しい別IDの計算記録とは比較しません。'].join('\n');
    return '```text\n' + text + '\n```\n\n' + marker('evidence-v1', snapshot);
  };
  const a = fixed('roundtrip-A'), b = fixed('roundtrip-B'), q1 = quote('roundtrip-q1'), q2 = quote('roundtrip-q2');
  const body = ['前文 日本語😀 e\u0301', a, material, b, q1, q2, '後方の独立した本文'].join('\n\n');
  const fixture = () => ({ version: 1, history: [], notes: [], settings: { theme: 'light', activePanel: 'history' },
    formulaLibrary: { version: 1, selectedId: formulaId, entries: [{ id: formulaId, title: '点検と本文の安全な往復', expression: '1', createdAt: at, updatedAt: at }] },
    formulaReports: { version: 1, entries: [{ id: reportId, formulaId, title: '往復ナビゲーション', body, createdAt: at, updatedAt: at, confirmedExpression: null, evidence: { version: 1, links: [], confirmations: [] } }] } });
  const audit = () => page.getByRole('dialog', { name: 'レポート全体の根拠点検', exact: true });
  const detail = () => page.getByRole('region', { name: '固定比較資料の詳細', exact: true });
  const highlight = () => page.getByRole('region', { name: '点検からの本文移動先', exact: true });
  const editor = () => page.locator('#formula-report-body');
  const button = name => page.getByRole('button', { name, exact: true });
  const raw = () => page.evaluate(key => localStorage.getItem(key), key);
  const selected = () => editor().evaluate(node => ({ start: node.selectionStart, end: node.selectionEnd, text: node.value.slice(node.selectionStart, node.selectionEnd) }));
  let activations = 0;
  const click = async name => { await activate(button(name)); activations++; };
  const inspect = async () => { await click('根拠点検'); await click('比較資料1の詳細'); };
  const open = async () => {
    await page.goto(base); await page.evaluate(({ key, data }) => localStorage.setItem(key, JSON.stringify(data)), { key, data: fixture() }); await page.reload();
    await click('登録式ライブラリ'); await click('関連レポートを閲覧・編集'); await click('Markdownを編集');
  };
  const expectSelection = async (text, currentBody = body) => {
    await expect.poll(selected).toEqual({ start: currentBody.indexOf(text), end: currentBody.indexOf(text) + text.length, text });
    await expect(editor()).toHaveValue(currentBody);
  };
  const writer = await context.newPage();
  try {
    await writer.route('**/__audit_roundtrip_writer.html', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Synthetic roundtrip writer</title>' }));
    await writer.goto(base + '__audit_roundtrip_writer.html');
    await open(); const saved = await raw(); await inspect();
    await click('この比較資料の本文へ移動'); await expectSelection(material); await expect(highlight()).toBeVisible();
    for (const theme of ['dark', 'light']) {
      await page.evaluate(theme => { document.documentElement.dataset.theme = theme; document.documentElement.style.fontSize = '200%'; }, theme);
      await assertHorizontalFit(); await button('点検へ戻る').focus(); await expect(button('点検へ戻る')).toBeFocused();
      const rect = await button('点検へ戻る').boundingBox(); assert.ok(rect && rect.height >= 44, 'Return control stays touch-sized at CSS 200 percent');
      await screenshot(prefix + (theme === 'light' ? '-audit-roundtrip-target' : '-audit-roundtrip-dark-200'), undefined, false, true);
    }
    await page.evaluate(() => document.documentElement.style.fontSize = '');
    await click('点検へ戻る'); await expect(detail()).toBeVisible(); await expect(button('この比較資料の本文へ移動')).toBeFocused();
    for (const [name, text] of [['比較元Aの出典本文へ移動', a], ['比較先Bの出典本文へ移動', b]]) {
      await click(name); await expectSelection(text); await click('点検へ戻る'); await expect(detail()).toBeVisible(); await expect(button(name)).toBeFocused();
    }
    await button('この比較資料の本文へ移動').focus(); await page.keyboard.press('Enter'); await expectSelection(material);
    await button('点検へ戻る').focus(); await page.keyboard.press('Enter'); await expect(detail()).toBeVisible(); await expect(button('この比較資料の本文へ移動')).toBeFocused();
    assert.equal(await raw(), saved);
    await passed(prefix + ': fixed material and sources A B make repeated roundtrips restoring detail and keyboard focus with a nonpersisted target and both themes CSS 200 percent layout');

    const filter = audit().getByRole('combobox', { name: '表示する状態', exact: true });
    await activate(filter); activations++; await filter.selectOption('unverified');
    for (const [index, text] of [[1, q1], [2, q2]]) {
      const name = `根拠${index}の本文へ移動`;
      await button(name).scrollIntoViewIfNeeded();
      const beforeScroll = await audit().locator('.modal-content').first().evaluate(node => node.scrollTop);
      assert.ok(beforeScroll > 0, 'Fixture genuinely exercises scrolled audit list');
      await click(name); await expectSelection(text); await click('点検へ戻る');
      await expect(filter).toHaveValue('unverified'); await expect(button(name)).toBeFocused();
      await expect.poll(() => audit().locator('.modal-content').first().evaluate(node => node.scrollTop)).toBeCloseTo(beforeScroll, 0);
    }
    assert.equal(await raw(), saved);
    await passed(prefix + ': two distinct quote occurrences preserve filtered list scroll and originating focus across repeated roundtrips without changing snapshots or saved bytes');

    await click('根拠2の本文へ移動');
    const edited = '前に加筆😀\n\n' + body + '\n\n後に加筆';
    await editor().fill(edited); await click('本文の対象へもう一度移動'); await expectSelection(q2, edited);
    await click('点検へ戻る'); await expect(filter).toHaveValue('unverified');
    await expect(audit()).toContainText('roundtrip-q2'); assert.equal(await raw(), saved);
    await passed(prefix + ': prefix and suffix edits reparse the unique unchanged occurrence before renavigation without reusing old offsets or fetching saved originals');

    for (const changed of [body.replace(material, ''), body + '\n\n' + material]) {
      await click('根拠点検を閉じる'); await editor().fill(body); await inspect(); await click('この比較資料の本文へ移動');
      await editor().fill(changed); const beforeSelection = await selected();
      await click('本文の対象へもう一度移動'); await expect.poll(selected).toEqual(beforeSelection);
      await expect(editor()).toHaveValue(changed); await click('点検へ戻る');
      await expect(detail()).toHaveCount(0); await expect(audit()).toContainText(/復帰|失効|特定でき|変更/); assert.equal(await raw(), saved);
    }
    await passed(prefix + ': deleted and duplicate material identities refuse renavigation preserving native selection and edited body and do not revive historical detail on return');

    for (const kind of ['changed', 'deleted']) {
      await open(); await inspect(); await click('この比較資料の本文へ移動');
      const next = fixture(); if (kind === 'changed') next.formulaReports.entries[0].body = '独立ページで保存した本文'; else next.formulaReports.entries = [];
      const external = JSON.stringify(next);
      await writer.evaluate(({ key, external }) => localStorage.setItem(key, external), { key, external });
      await expect(page.getByRole('alert').filter({ hasText: '別のタブなどで保存データが変わりました' })).toBeVisible();
      const beforeSelection = await selected(); await click('本文の対象へもう一度移動'); await expect.poll(selected).toEqual(beforeSelection);
      await click('点検へ戻る'); await expect(detail()).toHaveCount(0); await expect(audit()).toContainText('現在の保存本文との一致は未確認');
      await expect(editor()).toHaveValue(body); assert.equal(await raw(), external);
      await passed(prefix + ': native cross page storage ' + kind + ' expires return authority without overwriting retained body saved original or confirmation history');
    }

    await click('根拠点検を閉じる'); await inspect(); await click('この比較資料の本文へ移動');
    await click('往復ナビゲーションを終了'); await expect(button('点検へ戻る')).toHaveCount(0); await expect(highlight()).toHaveCount(0);
    await click('根拠点検'); await click('根拠点検を閉じる'); await expect(button('点検へ戻る')).toHaveCount(0); await expect(highlight()).toHaveCount(0);
    await button('根拠点検').focus(); await page.keyboard.press('Enter'); await expect(audit()).toBeVisible(); await page.keyboard.press('Escape');
    await expect(audit()).toHaveCount(0); await expect(button('根拠点検')).toBeFocused(); await expect(button('点検へ戻る')).toHaveCount(0);
    await expect(editor()).toHaveValue(body);
    await passed(prefix + ': explicit roundtrip end and subsequent audit session close remove return and highlight state without forcing further navigation or editing');
    assert.equal(activations, 54, 'Roundtrip acceptance cannot silently omit native activations');
  } finally {
    await writer.close();
    await page.evaluate(({ key, original }) => { if (original === null) localStorage.removeItem(key); else localStorage.setItem(key, original); document.documentElement.style.fontSize = ''; }, { key, original }); await page.reload();
  }
}
