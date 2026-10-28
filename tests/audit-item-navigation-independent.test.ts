// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { FormulaReportAudit } from '../components/FormulaReportAudit';
import { createQuoteMarkdown, type QuoteSnapshot } from '../lib/formula-report-quotes';
import { createTrackedDifferenceMarkdown } from '../lib/formula-report-diff-tracking';
import { buildQuoteDifferenceMarkdown } from '../lib/formula-report-diff';
import { createAuditRecordMarkdown } from '../lib/formula-report-audit-record';
import { createAuditComparisonRecordMarkdown } from '../lib/formula-report-audit-comparison-record';
import { defaultData, STORAGE_KEY } from '../lib/storage';
import type { EvidenceRecord } from '../lib/calculation-evidence';
import type { Memo } from '../lib/types';

const at = '2026-10-28T00:00:00.000Z';
const record: EvidenceRecord = { id: 'one', evaluator: 'calculator-memo-v1', status: 'confirmed', calculatedAt: at, persistedAt: at,
  blocks: [{ blockId: 'block', position: 1, expression: '2+2', inputs: [], result: '4', resultText: '4', status: 'success' }] };
const other = { ...structuredClone(record), id: 'two' };
const quote: QuoteSnapshot = { version: 1, quoteId: 'unique-one', formulaId: 'formula', memoId: 'memo', blockId: 'block', citedAt: at, record };
const links = [{ memoId: 'memo', recordId: 'one' }, { memoId: 'memo', recordId: 'two' }];
const notes: Memo[] = [{ id: 'memo', type: 'plain-calculation', title: 'synthetic', content: '', createdAt: at, updatedAt: at, calculationEvidence: { version: 1, records: [record, other] } }];
const difference = createTrackedDifferenceMarkdown(buildQuoteDifferenceMarkdown({ status: 'matched', reason: '', snapshot: quote, start: 0, end: 0 }, 'formula', notes, links, JSON.stringify(['memo', 'two'])), quote, other, 'diff', at);
const body = `${createQuoteMarkdown(quote)}\n\n${difference}\n\n${createQuoteMarkdown({ ...quote, quoteId: 'unique-three' })}`;
let host: HTMLDivElement, root: Root;
const nav = vi.fn();
const button = (text: string) => [...host.querySelectorAll('button')].find(node => node.textContent === text)!;
const click = async (text: string) => act(async () => { const element = button(text); expect(element, text).toBeTruthy(); element.focus(); element.click(); });
const render = async (disabled = false) => act(async () => root.render(createElement(FormulaReportAudit, { body, formulaId: 'formula', reportId: 'report', editing: true, disabled, onNavigate: nav })));
beforeEach(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); HTMLElement.prototype.scrollIntoView = vi.fn(); host = document.createElement('div'); document.body.append(host); root = createRoot(host); nav.mockReset(); localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...defaultData, notes })); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); });

it('independent: quote → difference → quote retains the exact next button and refuses endpoint activation', async () => {
  await render(); await click('根拠点検'); await click('根拠1の詳細');
  const next = button('次の項目');
  expect(next).toBeTruthy();
  const reads = vi.spyOn(Storage.prototype, 'getItem'), writes = vi.spyOn(Storage.prototype, 'setItem');
  await click('次の項目');
  expect(host.textContent).toContain('対象3件中2件目'); expect(host.textContent).toContain('比較差分の出典確認');
  expect(button('次の項目')).toBe(next); expect(document.activeElement).toBe(next);
  await click('次の項目');
  expect(host.textContent).toContain('対象3件中3件目'); expect(button('次の項目')).toBe(next);
  expect(next.getAttribute('aria-disabled')).toBe('true'); expect(document.activeElement).toBe(next);
  await click('次の項目'); expect(host.textContent).toContain('対象3件中3件目');
  expect(reads).not.toHaveBeenCalled(); expect(writes).not.toHaveBeenCalled(); expect(nav).not.toHaveBeenCalled();
});

it('independent: saving guard stops both directions without losing selected position', async () => {
  await render(); await click('根拠点検'); await click('根拠2の詳細');
  await render(true);
  await click('次の項目'); await click('前の項目');
  expect(host.textContent).toContain('対象3件中2件目'); expect(nav).not.toHaveBeenCalled();
  await render(false); await click('次の項目'); expect(host.textContent).toContain('対象3件中3件目');
});

it('independent: a matching-value storage event clears old detail and cannot be undone by a normal rerender', async () => {
  await render(); await click('根拠点検'); await click('保存記録と照合'); await click('根拠2の詳細');
  const raw = localStorage.getItem(STORAGE_KEY);
  const reads = vi.spyOn(Storage.prototype, 'getItem');
  await act(async () => window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, oldValue: raw, newValue: raw })));
  await render();
  expect(host.textContent).not.toMatch(/対象3件中[123]件目/); expect(button('次の項目')).toBeUndefined(); expect(reads).not.toHaveBeenCalled();
  await click('保存記録と照合'); expect(button('次の項目')).toBeUndefined();
});

it('independent: excluded detail selection gives focus to a connected control in the remaining audit', async () => {
  await render(); await click('根拠点検'); await click('保存記録と照合'); await click('根拠1の詳細');
  const select = host.querySelector<HTMLSelectElement>('[aria-label="詳細で表示する状態"]')!;
  expect(select).toBeTruthy();
  await act(async () => { select.focus(); select.value = 'unverified'; select.dispatchEvent(new Event('change', { bubbles: true })); });
  expect(host.textContent).not.toMatch(/対象\d+件中\d+件目/);
  const audit = host.querySelector('[aria-label="レポート全体の根拠点検"]')!;
  expect(audit.contains(document.activeElement)).toBe(true);
  expect(document.activeElement?.isConnected).toBe(true);
  expect(document.activeElement).not.toBe(document.body);
});


it.each(['changed', 'deleted'])('independent regression: explicitly reselected fixed material after storage %s still navigates the held strict source', async kind => {
  const fixed = (id: string) => createAuditRecordMarkdown('fixed ' + id, { recordId: id, formulaId: 'formula', reportId: 'report', generatedAt: at, bodySha256: 'a'.repeat(64), bodyLength: 0 });
  const a = fixed('A'), b = fixed('B');
  const material = createAuditComparisonRecordMarkdown('fixed material', { materialId: 'material', formulaId: 'formula', reportId: 'report', beforeRecordId: 'A', afterRecordId: 'B', preparedAt: at });
  const held = ['prefix', a, material, b].join('\n\n');
  await act(async () => root.render(createElement(FormulaReportAudit, { body: held, formulaId: 'formula', reportId: 'report', editing: true, onNavigate: nav })));
  await click('根拠点検'); await click('比較資料1の詳細');
  await act(async () => window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, newValue: kind === 'changed' ? 'changed original' : null })));
  expect(host.querySelector('[aria-label="固定比較資料の詳細"]')).toBeNull();
  await click('比較資料1の詳細');
  const reads = vi.spyOn(Storage.prototype, 'getItem'), writes = vi.spyOn(Storage.prototype, 'setItem');
  await click('比較元Aの出典本文へ移動');
  expect(nav).toHaveBeenCalledWith(held.indexOf(a), held.indexOf(a) + a.length, expect.any(Function));
  expect(reads).not.toHaveBeenCalled(); expect(writes).not.toHaveBeenCalled();
});
