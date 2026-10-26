import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

/** Two historical records, never a reconstruction from present-day storage.
 * Synthetic fixture only; native storage events are delivered from a second page. */
export async function exerciseAuditRecordComparison({ page, context, base, expect, passed, prefix, assertHorizontalFit, activate }) {
  const key = 'calculation-memo:data';
  const original = await page.evaluate(key => localStorage.getItem(key), key);
  const at = '2026-10-25T00:00:00.000Z';
  const formulaId = 'compare-f', reportId = 'compare-r';
  const longExpression = 'x' + '+0'.repeat(120);
  const stableId = 'quote-' + 'long-identification-'.repeat(5);
  const calculation = value => ({ id: 'same-source-record', evaluator: 'calculator-memo-v1', status: 'confirmed', calculatedAt: at, persistedAt: at, blocks: [
    { blockId: 'source', position: 1, expression: String(value), inputs: [], result: String(value), resultText: String(value), status: 'success' },
    { blockId: 'target', position: 2, expression: value === 1 ? 'x+1' : longExpression, inputs: [{ kind: 'variable', name: 'x', sourceBlockId: 'source', value: String(value) }], result: '2', resultText: '2', status: 'success' },
  ] });
  const snapshot = value => ({ version: 1, state: 'checked', acquisitionStatus: 'ok', complete: true, reason: 'Synthetic known record', fetchedAt: at, items: [{ id: stableId, kind: 'quote', bodyStatus: 'intact', reason: 'Synthetic intact', sources: [{ side: 'quote', memoId: 'compare-m', blockId: 'target', status: 'matched', reason: 'Synthetic matched', linked: true, frozen: calculation(value), observed: calculation(value) }] }] });
  const fixed = (recordId, value, legacy = false, empty = false) => {
    const version = legacy ? 1 : 2;
    const metadata = { version, recordId, formulaId, reportId, generatedAt: at, bodySha256: 'a'.repeat(64), bodyLength: 100, ...(legacy ? {} : { comparison: { ...snapshot(value), ...(empty ? { items: [] } : {}) } }) };
    return '```calculator-memo-audit-record-start-v' + version + '\n' + JSON.stringify(metadata) + '\n```\n\nHistorical audit ' + recordId + '\n\n```calculator-memo-audit-record-end-v' + version + '\n' + JSON.stringify({ version, recordId }) + '\n```';
  };
  const body = [fixed('record-A', 1), fixed('record-B', 2), fixed('record-legacy', 1, true)].join('\n\n');
  const formula = { id: formulaId, title: '比較式 <script> inert', expression: '1', createdAt: at, updatedAt: at };
  const report = { id: reportId, formulaId, title: 'Synthetic audit comparison', body, createdAt: at, updatedAt: at, confirmedExpression: null, evidence: { version: 1, links: [], confirmations: [] } };
  const fixture = { version: 1, history: [], notes: [], settings: { theme: 'light', activePanel: 'history' }, formulaLibrary: { version: 1, selectedId: formulaId, entries: [formula] }, formulaReports: { version: 1, entries: [report] } };
  const audit = () => page.getByRole('dialog', { name: 'レポート全体の根拠点検', exact: true });
  const comparison = () => page.getByRole('region', { name: '固定点検記録の2時点比較', exact: true });
  const button = name => page.getByRole('button', { name, exact: true });
  const click = name => activate(button(name));
  const result = () => comparison().getByRole('region', { name: '2時点比較結果', exact: true });
  const raw = () => page.evaluate(key => localStorage.getItem(key), key);
  const open = async (data = fixture) => {
    await page.goto(base); await page.evaluate(({ key, fixture }) => localStorage.setItem(key, JSON.stringify(fixture)), { key, fixture: data }); await page.reload();
    await click('登録式ライブラリ'); await click('関連レポートを閲覧・編集'); await click('根拠点検');
  };
  const choose = async (label, id) => {
    const field = comparison().getByRole('combobox', { name: label, exact: true });
    const value = await field.locator('option').filter({ hasText: id }).getAttribute('value');
    await field.selectOption(value);
  };
  const select = async () => {
    await choose('比較元A', 'record-A');
    await choose('比較先B', 'record-B');
  };
  const second = await context.newPage();
  try {
    await second.route('**/__audit_comparison_writer.html', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Synthetic comparison writer</title>' }));
    await second.goto(base + '__audit_comparison_writer.html');
    await open(); const saved = await raw();
    await expect(result()).toHaveCount(0);
    await expect(comparison()).toContainText('record-legacy');
    await expect(comparison().getByRole('combobox', { name: '比較元A', exact: true }).locator('option').filter({ hasText: 'record-legacy' })).toHaveAttribute('disabled', '');
    const keyboardA = comparison().getByRole('combobox', { name: '比較元A', exact: true });
    const keyboardB = comparison().getByRole('combobox', { name: '比較先B', exact: true });
    await keyboardA.focus(); await page.keyboard.press('ArrowDown'); await page.keyboard.press('Tab');
    await expect(keyboardB).toBeFocused(); await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown');
    await expect(keyboardA.locator('option:checked')).toContainText('record-A');
    await expect(keyboardB.locator('option:checked')).toContainText('record-B');
    await expect(result()).toHaveCount(0);
    await page.keyboard.press('Tab'); await expect(button('比較元Aと比較先Bを入れ替える')).toBeFocused();
    await page.keyboard.press('Tab'); await expect(button('選択した2記録を比較')).toBeFocused(); await page.keyboard.press('Enter');
    await expect(result()).toContainText('変更あり');
    await expect(result()).toContainText('入力式'); await expect(result()).toContainText('実使用内部値');
    await expect(result()).toContainText('理由不明');
    for (const [label, expression, input] of [['比較元Aの固定情報', 'x+1', '1'], ['比較先Bの固定情報', longExpression, '2']]) {
      const details = result().locator('details').filter({ has: page.locator('summary').filter({ hasText: label }) });
      await activate(details.locator('summary'));
      await expect(details.locator('.evidence-block-values')).toHaveCount(4);
      const targets = await details.locator('.evidence-block-values').evaluateAll(nodes => [nodes[1], nodes[3]].map(node => {
        const read = name => [...node.querySelectorAll('dt')].find(dt => dt.textContent === name)?.nextElementSibling?.textContent;
        return { expression: read('当時の入力式'), display: read('当時の表示結果'), internal: read('当時の内部結果'), input: read('実使用内部値') };
      }));
      assert.deepEqual(targets, [0, 1].map(() => ({ expression, display: '2', internal: '2', input })));
    }

    assert.equal(await raw(), saved);
    await passed(prefix + ': explicit A B comparison detects changed expression and actual input despite equal target results without modifying saved history or snapshots');

    // Export uses the already displayed result; clipboard is a synthetic sink,
    // while the download event and UTF-8 file bytes come from the real browser.
    const preview = () => comparison().getByRole('textbox', { name: '比較結果Markdown全文（プレビュー）', exact: true });
    const manual = () => comparison().getByRole('textbox', { name: '比較結果Markdown全文（手動コピー用）', exact: true });
    await page.evaluate(() => Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => { window.__auditExport = text; } } }));
    await click('比較結果Markdownをプレビュー');
    const markdown = await preview().inputValue();
    for (const name of ['比較結果Markdownをプレビュー', '比較結果Markdownをコピー', '比較結果を.md出力']) {
      const rect = await button(name).boundingBox();
      assert.ok(rect && rect.height >= 44, 'Export controls retain existing 44px target height: ' + name);
    }
    assert.ok(markdown.includes('record-A') && markdown.includes('record-B') && markdown.includes(longExpression));
    assert.ok(markdown.includes('変更あり') && markdown.includes('理由不明'));
    await click('比較結果Markdownをコピー');
    assert.equal(await page.evaluate(() => window.__auditExport), markdown);
    const downloadEvent = page.waitForEvent('download');
    await click('比較結果を.md出力');
    const download = await downloadEvent;
    assert.match(download.suggestedFilename(), /^[a-zA-Z0-9_.-]+\.md$/);
    assert.deepEqual(await readFile(await download.path()), Buffer.from(markdown, 'utf8'));
    for (const theme of ['dark', 'light']) {
      await page.evaluate(theme => { document.documentElement.dataset.theme = theme; document.documentElement.style.fontSize = '200%'; }, theme);
      await assertHorizontalFit(); await preview().focus(); await expect(preview()).toBeFocused();
    }
    await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
    assert.equal(await raw(), saved);
    await passed(prefix + ': comparison export preview copy and native download preserve identical full Markdown and original data with both themes CSS 200 percent and focus');

    await page.evaluate(() => {
      navigator.clipboard.writeText = async () => { throw new Error('Synthetic clipboard refusal'); };
      window.__auditCreateURL = URL.createObjectURL;
      URL.createObjectURL = () => { throw new Error('Synthetic download refusal'); };
    });
    await click('比較結果Markdownをコピー'); await expect(manual()).toHaveValue(markdown);
    await click('比較結果を.md出力');
    await expect(comparison().getByRole('region', { name: '2時点比較結果のMarkdown出力' })).toContainText('失敗');
    assert.equal(await raw(), saved);
    await page.evaluate(() => { URL.createObjectURL = window.__auditCreateURL; });
    await passed(prefix + ': comparison clipboard and file-generation refusals retain full manual recovery and never report success or modify saved records');

    await page.evaluate(() => { navigator.clipboard.writeText = text => new Promise(resolve => { window.__auditExport = text; window.__auditResolve = resolve; }); });
    await click('比較結果Markdownをコピー');
    const notified = structuredClone(fixture);
    notified.notes.push({ id: 'unrelated-export', type: 'plain-calculation', title: 'Unrelated', content: 'Synthetic', createdAt: at, updatedAt: at });
    await second.evaluate(({ key, data }) => localStorage.setItem(key, data), { key, data: JSON.stringify(notified) });
    await expect(result()).toHaveCount(0); await expect(preview()).toHaveCount(0);
    await page.evaluate(() => window.__auditResolve());
    await expect(manual()).toHaveCount(0);
    await expect(comparison()).not.toContainText('比較結果をコピーしました');
    assert.equal(await raw(), JSON.stringify(notified));
    await passed(prefix + ': pending export copy cannot resurrect old preview success or manual recovery after native unrelated storage notification');
    await open(); await select(); await click('選択した2記録を比較');

    await click('比較元Aと比較先Bを入れ替える'); await expect(result()).toHaveCount(0); await click('選択した2記録を比較'); await expect(result()).toContainText('変更あり');
    await choose('比較元A', 'record-A');
    await choose('比較先B', 'record-A');
    await expect(result()).toHaveCount(0); await click('選択した2記録を比較');
    await expect(comparison()).toContainText('異なる');
    assert.equal(await raw(), saved);
    await passed(prefix + ': swapped or changed selections invalidate old comparison and same fixed record never becomes a false matched comparison');

    for (const kind of ['changed', 'deleted', 'unrelated']) {
      await open(); await select(); await click('選択した2記録を比較'); await expect(result()).toBeVisible();
      const next = structuredClone(fixture);
      if (kind === 'deleted') next.formulaReports.entries = [];
      else if (kind === 'changed') next.formulaReports.entries[0].body = 'External replacement';
      else next.notes.push({ id: 'unrelated', type: 'plain-calculation', title: 'Unrelated', content: 'No target inference', createdAt: at, updatedAt: at });
      const external = JSON.stringify(next);
      await second.evaluate(({ key, external }) => localStorage.setItem(key, external), { key, external });
      await expect(result()).toHaveCount(0); await expect(audit()).toContainText('現在の保存本文との一致は未確認');
      await click('保存記録と照合'); await expect(result()).toHaveCount(0);
      await click('根拠点検を閉じる'); await click('根拠点検'); await expect(result()).toHaveCount(0); await expect(audit()).toContainText('現在の保存本文との一致は未確認');
      await click('根拠点検を閉じる'); await click('Markdownを編集'); await expect(page.locator('#formula-report-body')).toHaveValue(body);
      assert.equal(await raw(), external);
    }
    await passed(prefix + ': native other-page changes deletions and unrelated updates invalidate comparisons with retained old body and no false target-change claim after source refresh and reopen');

    await open(); await select(); await click('選択した2記録を比較'); await click('保存記録と照合'); await expect(result()).toHaveCount(0);
    await select(); await click('選択した2記録を比較'); await expect(result()).toBeVisible();
    await click('根拠点検を閉じる'); await click('Markdownを編集'); await page.locator('#formula-report-body').fill(body + '\nLocal unsaved text'); await click('根拠点検');
    await expect(result()).toHaveCount(0); await select(); await click('選択した2記録を比較'); await expect(result()).toBeVisible();
    await expect(audit()).toContainText('編集中の本文'); assert.equal(await raw(), JSON.stringify(fixture));
    await passed(prefix + ': explicit reacquisition and draft editing discard old results while new historical comparison preserves unsaved text and stored records');

    for (const label of ['比較元Aの固定情報', '比較先Bの固定情報']) await activate(result().locator('summary').filter({ hasText: label }));
    for (const theme of ['dark', 'light']) {
      await page.evaluate(theme => { document.documentElement.dataset.theme = theme; document.documentElement.style.fontSize = '200%'; }, theme);
      await assertHorizontalFit();
      await button('比較元Aと比較先Bを入れ替える').focus(); await expect(button('比較元Aと比較先Bを入れ替える')).toBeFocused();
    }
    await page.keyboard.press('Escape'); await expect(audit()).toHaveCount(0); await expect(button('根拠点検')).toBeFocused();
    await expect(page.locator('#formula-report-body')).toHaveValue(body + '\nLocal unsaved text');
    await passed(prefix + ': comparison long identities fit both themes at CSS 200 percent with keyboard focus restoration and preserved unsaved draft');

    await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
    await click('根拠点検'); await click('点検記録1の本文へ移動');
    await expect.poll(() => page.locator('#formula-report-body').evaluate(node => node.value.slice(node.selectionStart, node.selectionEnd))).toBe(fixed('record-A', 1));
    await page.locator('#formula-report-body').fill(body + '\n\n```calculator-memo-audit-record-start-v99\n{}\n```');
    await click('根拠点検'); await expect(button('点検記録4の本文へ移動')).toBeDisabled();
    await expect(comparison().getByRole('combobox', { name: '比較元A', exact: true }).locator('option').filter({ hasText: '識別不能' })).toHaveAttribute('disabled', '');
    await expect(comparison()).toContainText('日時不明');
    assert.equal(await raw(), JSON.stringify(fixture));
    await passed(prefix + ': valid current record navigation selects its exact region while legacy and unknown incomplete records remain ineligible without mutation');

    const emptyFixture = structuredClone(fixture);
    const emptyBody = [fixed('record-A', 1, false, true), fixed('record-B', 1, false, true)].join('\n\n');
    emptyFixture.formulaReports.entries[0].body = emptyBody;
    await open(emptyFixture); const emptySaved = await raw();
    await expect(result()).toHaveCount(0);
    await expect(comparison()).toContainText('原本取得・形式検証：成功');
    await select();
    await button('選択した2記録を比較').focus();
    await expect(button('選択した2記録を比較')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(result().getByRole('heading', { level: 4, name: '総合状態：比較不能', exact: true })).toHaveText('総合状態：比較不能');
    await expect(result()).toContainText('両記録に比較可能な根拠項目がありません。取得成功は根拠の一致を意味しません。');
    await expect(result()).toContainText('0件は点検完了や数学的な一致を意味しません');
    await expect(result().locator('ol > li')).toHaveCount(0);
    for (const theme of ['dark', 'light']) {
      await page.evaluate(theme => { document.documentElement.dataset.theme = theme; document.documentElement.style.fontSize = '200%'; }, theme);
      await assertHorizontalFit();
      await result().getByRole('heading', { level: 4, name: '総合状態：比較不能', exact: true }).scrollIntoViewIfNeeded();
      await expect(result().getByRole('heading', { level: 4, name: '総合状態：比較不能', exact: true })).toBeVisible();
      await button('比較元Aと比較先Bを入れ替える').focus();
      await expect(button('比較元Aと比較先Bを入れ替える')).toBeFocused();
    }
    assert.equal(await raw(), emptySaved);
    assert.equal(emptySaved, JSON.stringify(emptyFixture));
    await click('比較結果Markdownをプレビュー');
    const emptyMarkdown = await preview().inputValue();
    assert.ok(emptyMarkdown.includes('両記録に比較可能な根拠項目がありません。取得成功は根拠の一致を意味しません。'));
    assert.ok(emptyMarkdown.includes('比較不能'));
    await click('比較元Aと比較先Bを入れ替える');
    await expect(preview()).toHaveCount(0);
    await expect(button('比較結果Markdownをコピー')).toHaveCount(0);
    assert.equal(await raw(), emptySaved);
    await passed(prefix + ': empty successful acquisitions export their incomparable reason and swapping immediately removes the old export target');
    await page.keyboard.press('Escape'); await expect(audit()).toHaveCount(0); await expect(button('根拠点検')).toBeFocused();
    assert.equal(await raw(), emptySaved);
    await passed(prefix + ': successfully acquired empty records remain incomparable with explicit reason zero rows and unchanged storage in both themes CSS 200 percent and keyboard focus');
  } finally {
    await second.close();
    await page.evaluate(({ key, original }) => { if (original === null) localStorage.removeItem(key); else localStorage.setItem(key, original); document.documentElement.style.fontSize = ''; }, { key, original });
    await page.reload();
  }
}
