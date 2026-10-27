// @vitest-environment jsdom
import { act, createElement, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { FormulaAuditComparisonSources } from '../components/FormulaAuditComparisonSources';
import { createAuditRecordMarkdown, scanAuditRecordEnvelopes } from '../lib/formula-report-audit-record';
import { createAuditComparisonRecordMarkdown, scanAuditComparisonRecordEnvelopes } from '../lib/formula-report-audit-comparison-record';
import { STORAGE_KEY } from '../lib/storage';
const at = '2026-10-27T13:00:00+09:00';
const record = (recordId: string) => createAuditRecordMarkdown('旧点検記録😀', { recordId, formulaId: 'f', reportId: 'r', generatedAt: at, bodySha256: 'a'.repeat(64), bodyLength: 3 });
const material = createAuditComparisonRecordMarkdown('## 当時の結果\n比較不能\n日本語😀\n一致と書いても再判定しない', { materialId: 'material', formulaId: 'f', reportId: 'r', beforeRecordId: 'a', afterRecordId: 'b', preparedAt: at });
const body = `前文😀\n\n${record('a')}\n\n${material}\n\n${record('b')}\n後文`;
let root: Root, host: HTMLDivElement;
const navigate = vi.fn();
const button = (name: string) => [...host.querySelectorAll('button')].find(b => b.textContent === name)!;
const click = async (name: string) => act(async () => { expect(button(name)).toBeTruthy(); button(name).click(); });
async function render(text = body, generation = 1, reportId = 'r') { await act(async () => root.render(createElement(StrictMode, null, createElement(FormulaAuditComparisonSources, { body: text, formulaId: 'f', reportId, generation, onNavigate: navigate })))); }
beforeEach(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); host = document.createElement('div'); document.body.append(host); root = createRoot(host); navigate.mockReset(); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); });
it.each(['\n', '\r\n', '\r'])('readonly inspection preserves full fixed bytes and raw source ranges (%j)', async newline => {
  const text = body.replace(/\n/g, newline); await render(text);
  const read = vi.spyOn(Storage.prototype, 'getItem'), write = vi.spyOn(Storage.prototype, 'setItem');
  await click('比較資料1の詳細');
  const envelope = scanAuditComparisonRecordEnvelopes(text)[0];
  const textarea = host.querySelector('textarea')!;
  expect(textarea.readOnly).toBe(true); expect(textarea.value).toBe(text.slice(envelope.start, envelope.end).replace(/\r\n?/g, '\n'));
  expect(host.textContent).toContain('構造化記録なし'); expect(host.textContent).toContain('挿入・保存日時ではありません');
  await click('比較元Aの出典本文へ移動'); await click('比較先Bの出典本文へ移動'); await click('この比較資料の本文へ移動');
  const records = scanAuditRecordEnvelopes(text);
  expect(navigate.mock.calls).toEqual([[records[0].start, records[0].end], [records[1].start, records[1].end], [envelope.start, envelope.end]]);
  expect(read).not.toHaveBeenCalled(); expect(write).not.toHaveBeenCalled();
});
it('missing source keeps fixed text readable and disables only unavailable source', async () => {
  await render(`${record('a')}\n\n${material}`); await click('比較資料1の詳細');
  expect(button('比較元Aの出典本文へ移動').disabled).toBe(false); expect(button('比較先Bの出典本文へ移動').disabled).toBe(true);
  expect(host.querySelector('textarea')!.value).toContain('比較不能');
});
it.each(['body', 'generation', 'report'] as const)('%s change invalidates selected detail and old position', async kind => {
  await render(); await click('比較資料1の詳細'); const old = button('比較元Aの出典本文へ移動');
  await render(kind === 'body' ? `追加\n${body}` : body, kind === 'generation' ? 2 : 1, kind === 'report' ? 'other' : 'r');
  await act(async () => old.click()); expect(navigate).not.toHaveBeenCalled(); expect(host.querySelector('textarea')).toBeNull(); expect(host.textContent).toContain('失効');
});
it.each([STORAGE_KEY, null])('same-turn storage %j refuses an old live callback before rerender', async key => {
  await render(); await click('比較資料1の詳細'); const old = button('比較元Aの出典本文へ移動');
  await act(async () => { window.dispatchEvent(new StorageEvent('storage', { key })); old.click(); });
  expect(navigate).not.toHaveBeenCalled(); expect(host.textContent).toContain('失効'); expect(host.textContent).toContain('保存原本との一致は未確認');
  await click('比較資料1の詳細'); await click('比較元Aの出典本文へ移動'); expect(navigate).toHaveBeenCalledTimes(1);
});
it('unrelated storage key does not invalidate held-body selection', async () => {
  await render(); await click('比較資料1の詳細'); await act(async () => window.dispatchEvent(new StorageEvent('storage', { key: 'unrelated' })));
  await click('比較元Aの出典本文へ移動'); expect(navigate).toHaveBeenCalledTimes(1);
});
it('wrong report identity never enables material or sources', async () => {
  await render(body, 1, 'wrong'); await click('比較資料1の詳細');
  expect(button('この比較資料の本文へ移動').disabled).toBe(true); expect(button('比較元Aの出典本文へ移動').disabled).toBe(true); expect(button('比較先Bの出典本文へ移動').disabled).toBe(true);
});
it('duplicate source cannot become a unique navigation target', async () => {
  await render(`${body}\n\n${record('a')}`); await click('比較資料1の詳細'); expect(button('比較元Aの出典本文へ移動').disabled).toBe(true); expect(host.querySelector('textarea')!.value).toContain('比較不能');
});
