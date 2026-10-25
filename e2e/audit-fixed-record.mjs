import assert from 'node:assert/strict';

/** Synthetic app integration, native same-context cross-page storage delivery.
 * All button activations use touch on mobile contexts; fill/select and keyboard paths remain explicit. */
export async function exerciseAuditFixedRecord({ page, context, base, expect, passed, prefix, assertHorizontalFit, activate }) {
  const key = 'calculation-memo:data';
  const original = await page.evaluate(key => localStorage.getItem(key), key);
  const at = '2026-10-25T00:00:00.000Z';
  const formula = { id: 'fixed-f', title: '固定点検 ` <script>長い識別情報</script>', expression: '1', createdAt: at, updatedAt: at };
  const record = { id: 'fixed-source', evaluator: 'calculator-memo-v1', status: 'confirmed', calculatedAt: at, persistedAt: at, blocks: [{ blockId: 'b', position: 1, expression: '1', result: '1', resultText: '1', status: 'success', inputs: [] }] };
  const quote = id => {
    const snapshot = { version: 1, quoteId: id, formulaId: formula.id, memoId: 'fixed-m', blockId: 'b', citedAt: at, record };
    const text = ['計算根拠引用（固定スナップショット）', `引用ID：${id}`, `登録式ID：${formula.id}`, 'メモID：fixed-m', '記録ID：fixed-source', 'ブロックID：b', `引用日時：${at}`, `計算日時：${at}`, `保存要求時刻：${at}`, '本文順：1', '実行順：1', '計算モード：legacy（旧方式）', '当時の式：\n1', '当時の表示結果：\n1', '当時の内部結果：1', '記録内の状態：成功・確定記録。真正性や数学的証明の保証ではありません。', '実使用参照元・内部値：', '記録内に実使用参照入力なし', '追跡対象は同じIDの保存記録全体です。現在の計算メモ本文や新しい別IDの計算記録とは比較しません。'].join('\n');
    return '```text\n' + text + '\n```\n\n```calculator-memo-evidence-v1\n' + JSON.stringify(snapshot) + '\n```';
  };
  const body = 'SELECTED WORDS\n\n' + quote('fixed-q1') + '\n\n' + quote('fixed-q2');
  const report = { id: 'fixed-r', formulaId: formula.id, title: 'Fixed record synthetic', body, createdAt: at, updatedAt: at, confirmedExpression: null, evidence: { version: 1, links: [{ memoId: 'fixed-m', recordId: record.id }], confirmations: [] } };
  const fixture = { version: 1, history: [], notes: [{ id: 'fixed-m', type: 'plain-calculation', title: 'Synthetic', content: '', createdAt: at, updatedAt: at, calculationEvidence: { version: 1, records: [record] } }], settings: { theme: 'light', activePanel: 'history' }, formulaLibrary: { version: 1, selectedId: formula.id, entries: [formula] }, formulaReports: { version: 1, entries: [report] } };
  const audit = () => page.getByRole('dialog', { name: 'レポート全体の根拠点検', exact: true });
  const preview = () => page.getByRole('dialog', { name: '点検結果の固定記録を挿入', exact: true });
  const editor = () => page.locator('#formula-report-body');
  const button = name => page.getByRole('button', { name, exact: true });
  const click = name => activate(button(name));
  const open = async () => {
    await page.goto(base); await page.evaluate(({ key, fixture }) => localStorage.setItem(key, JSON.stringify(fixture)), { key, fixture }); await page.reload();
    await click('登録式ライブラリ'); await click('関連レポートを閲覧・編集'); await click('Markdownを編集');
    await editor().focus(); await editor().evaluate(element => element.setSelectionRange(0, 8));
    await click('根拠点検');
  };
  const raw = () => page.evaluate(key => localStorage.getItem(key), key);
  const second = await context.newPage();
  try {
    await second.route('**/__audit_record_writer.html', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Synthetic writer</title>' }));
    await second.goto(base + '__audit_record_writer.html');
    await open(); const saved = await raw();
    await click('レポートへ挿入'); await expect(preview()).toBeVisible();
    await expect(page.locator('#audit-record-target-body')).toHaveValue(body);
    const unchecked = await page.locator('#audit-record-markdown').inputValue();
    assert.ok(unchecked.includes('点検状態：未照合') && unchecked.includes('認識できた出現数：2件'));
    assert.ok(unchecked.includes('bodySha256') && unchecked.includes('固定点検記録'));
    await click('固定記録を本文へ挿入'); await expect(preview()).toHaveCount(0);
    await expect(editor()).toHaveValue(unchecked + '\n\n' + body);
    assert.equal(await raw(), saved);
    await click('直前の点検記録挿入を取り消す'); await expect(editor()).toHaveValue(body);
    assert.equal(await raw(), saved);
    await passed(prefix + ': fixed audit preview preserves unchecked state and exact selected text, explicit insert and exact undo without saving');

    await editor().focus(); await editor().evaluate(element => element.setSelectionRange(0, 0));
    await click('根拠点検'); await click('保存記録と照合'); await expect(audit()).toContainText('出現 2件／見直し対象 0件');
    await audit().getByLabel('表示する状態').selectOption('review');
    await click('レポートへ挿入'); const checked = await page.locator('#audit-record-markdown').inputValue();
    assert.ok(checked.includes('認識できた出現数：2件') && checked.includes('点検状態：照合済み') && checked.includes('原本の観測取得日時'));
    await click('固定記録を本文へ挿入');
    await click('根拠点検'); await expect(audit()).toContainText('出現 2件'); await expect(audit()).toContainText('固定点検記録1件');
    await click('根拠点検を閉じる');
    const inserted = await editor().inputValue(); await editor().fill(inserted + '\nUSER EDIT');
    await click('直前の点検記録挿入を取り消す'); await expect(editor()).toHaveValue(inserted + '\nUSER EDIT');
    await expect(page.getByRole('alert').filter({ hasText: '安全に取消できません' })).toBeVisible();
    assert.equal(await raw(), saved);
    await passed(prefix + ': checked audit freezes all filtered-out occurrences and source time, avoids recursive counts and refuses undo after new edits');

    for (const kind of ['changed', 'deleted']) {
      await open(); await click('保存記録と照合'); await click('レポートへ挿入'); await expect(preview()).toBeVisible();
      const next = structuredClone(fixture); if (kind === 'deleted') next.formulaReports.entries = []; else next.formulaReports.entries[0].body = 'EXTERNAL BODY';
      const external = JSON.stringify(next);
      await second.evaluate(({ key, external }) => localStorage.setItem(key, external), { key, external });
      await expect(preview()).toHaveCount(0); await expect(audit()).toContainText('現在の保存本文との一致は未確認');
      await click('保存記録と照合'); await click('根拠点検を閉じる'); await click('根拠点検');
      await expect(audit()).toContainText('現在の保存本文との一致は未確認');
      await click('根拠点検を閉じる'); await expect(editor()).toHaveValue(body); assert.equal(await raw(), external);
      await passed(prefix + ': native other-page ' + kind + ' invalidates fixed audit preview without overwriting retained body or upgrading saved equality');
    }

    await open();
    await page.evaluate(() => {
      const original = crypto.subtle.digest.bind(crypto.subtle);
      window.__recordDigestOriginal = original;
      crypto.subtle.digest = (...args) => new Promise((resolve, reject) => { window.__recordDigestFinish = () => original(...args).then(resolve, reject); });
    });
    await click('レポートへ挿入');
    await second.evaluate(({ key, fixture }) => localStorage.setItem(key, JSON.stringify({ ...fixture, notes: fixture.notes.map(note => ({ ...note, content: 'Unrelated memo content update' })) })), { key, fixture });
    await expect(audit()).toContainText('現在の保存本文との一致は未確認');
    await page.evaluate(async () => { await window.__recordDigestFinish(); crypto.subtle.digest = window.__recordDigestOriginal; await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
    await expect(preview()).toHaveCount(0); await click('根拠点検を閉じる'); await expect(editor()).toHaveValue(body);
    await passed(prefix + ': delayed audit body digest cannot resurrect a stale insertion preview after native storage notification');

    await open(); await activate(button('レポートへ挿入'));
    await expect(preview()).toBeVisible();
    for (const theme of ['dark', 'light']) {
      await page.evaluate(theme => { document.documentElement.dataset.theme = theme; document.documentElement.style.fontSize = '200%'; }, theme);
      await assertHorizontalFit();
      await button('挿入をやめる').focus(); await expect(button('挿入をやめる')).toBeFocused();
    }
    await page.keyboard.press('Escape'); await expect(preview()).toHaveCount(0); await expect(button('レポートへ挿入')).toBeFocused();
    await page.keyboard.press('Escape'); await expect(button('根拠点検')).toBeFocused();
    await passed(prefix + ': fixed record full-text preview fits both themes at CSS 200 percent and restores nested keyboard focus with explicit mobile activation');
  } finally {
    await second.close();
    await page.evaluate(({ key, original }) => { if (original === null) localStorage.removeItem(key); else localStorage.setItem(key, original); document.documentElement.style.fontSize = ''; }, { key, original });
    await page.reload();
  }
}
