// @vitest-environment jsdom
import { act, createElement, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CalculatorApp } from '../components/CalculatorApp';
import { createQuoteMarkdown, type QuoteSnapshot } from '../lib/formula-report-quotes';
import { parseReportAudit } from '../lib/formula-report-audit';
import { defaultData, STORAGE_KEY } from '../lib/storage';

const at = '2026-10-28T00:00:00.000Z';
const snapshot: QuoteSnapshot = { version: 1, quoteId: 'first', formulaId: 'f', memoId: 'memo', blockId: 'block', citedAt: at, record: { id: 'evidence', evaluator: 'calculator-memo-v1', status: 'confirmed', calculatedAt: at, persistedAt: at, blocks: [{ blockId: 'block', position: 1, expression: '1', result: '1', resultText: '1', status: 'success', inputs: [] }] } };
const body = ['first', 'middle', 'last'].map(quoteId => createQuoteMarkdown({ ...snapshot, quoteId })).join('\n\n');
const original = { ...defaultData, formulaLibrary: { version: 1, selectedId: 'f', entries: [{ id: 'f', title: '順送りする式', expression: '1+1', createdAt: at, updatedAt: at }] }, formulaReports: { version: 1, entries: [{ id: 'r', formulaId: 'f', title: '順送り', body, createdAt: at, updatedAt: at, confirmedExpression: null, evidence: { version: 1, links: [], confirmations: [] } }] } };
let host: HTMLDivElement, root: Root, frames: FrameRequestCallback[];
const button = (name: string) => [...host.querySelectorAll('button')].find(node => node.textContent === name)!;
async function click(name: string) { await act(async () => { expect(button(name), name).toBeTruthy(); button(name).focus(); button(name).click(); }); }
const editor = () => host.querySelector<HTMLTextAreaElement>('#formula-report-body')!;
const flush = async () => act(async () => { frames.splice(0).forEach(callback => callback(1)); });
const position = () => host.textContent!.match(/対象\s*\d+件中\s*\d+件目/)?.[0].replaceAll(' ', '');
async function open() {
  await act(async () => root.render(createElement(StrictMode, null, createElement(CalculatorApp))));
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
  await click('登録式ライブラリ'); await click('関連レポートを閲覧・編集'); await click('Markdownを編集'); await click('根拠点検'); await click('保存記録と照合'); await click('根拠1の詳細'); frames = [];
}
async function change(text: string) { await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(editor(), text); editor().dispatchEvent(new Event('input', { bubbles: true })); }); }
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); frames = [];
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} }); HTMLElement.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => { frames.push(callback); return frames.length; })); vi.stubGlobal('cancelAnimationFrame', vi.fn());
  localStorage.clear(); localStorage.setItem(STORAGE_KEY, JSON.stringify(original)); host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('real CalculatorApp steps to each occurrence and repeatedly returns to its detail, focus, filter and scroll without reads or writes', async () => {
  await open(); const auditContent = host.querySelector('[aria-label="レポート全体の根拠点検"] .modal-content')!;
  const select = host.querySelector<HTMLSelectElement>('[aria-label="詳細で表示する状態"]')!;
  await act(async () => { select.value = 'review'; select.dispatchEvent(new Event('change', { bubbles: true })); });
  auditContent.scrollTop = 181; const raw = localStorage.getItem(STORAGE_KEY), read = vi.spyOn(Storage.prototype, 'getItem'), write = vi.spyOn(Storage.prototype, 'setItem');
  const entries = parseReportAudit(body, 'f').items;
  for (const i of [1, 2]) {
    await click('次の項目'); expect(position()).toBe(`対象3件中${i + 1}件目`);
    const origin = button('この項目の本文へ移動');
    for (let repeat = 0; repeat < 2; repeat++) {
      await click('この項目の本文へ移動'); await flush(); expect(editor().value).toBe(body);
      expect([editor().selectionStart, editor().selectionEnd]).toEqual([entries[i].start, entries[i].end]);
      await click('点検へ戻る'); await flush(); expect(position()).toBe(`対象3件中${i + 1}件目`); expect(document.activeElement).toBe(origin);
      expect(host.querySelector<HTMLSelectElement>('[aria-label="表示する状態"]')!.value).toBe('review'); expect(auditContent.scrollTop).toBe(181);
    }
  }
  expect(read).not.toHaveBeenCalled(); expect(write).not.toHaveBeenCalled(); read.mockRestore(); write.mockRestore(); expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
});
it('body ABA while away leaves sequential navigation invalid after return; recheck requires choosing anew', async () => {
  await open(); await click('次の項目'); await click('この項目の本文へ移動'); await flush(); await change(`before\n${body}`); await change(body); await click('点検へ戻る'); await flush();
  expect(position()).toBeUndefined(); expect(host.textContent).toContain('失効'); await click('保存記録と照合'); expect(position()).toBeUndefined(); await click('根拠3の詳細'); expect(position()).toBe('対象3件中3件目');
  expect(editor().value).toBe(body); expect(localStorage.getItem(STORAGE_KEY)).toBe(JSON.stringify(original));
});
it('same-value storage while body navigation is pending discards old callback and detail navigation', async () => {
  await open(); await click('次の項目'); editor().setSelectionRange(2, 3); await click('この項目の本文へ移動'); const pending = frames.splice(0);
  await act(async () => window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, newValue: localStorage.getItem(STORAGE_KEY) })));
  await act(async () => pending.forEach(callback => callback(1))); expect([editor().selectionStart, editor().selectionEnd]).toEqual([2, 3]);
  await click('点検へ戻る'); await flush(); expect(position()).toBeUndefined(); expect(host.textContent).toContain('失効'); expect(localStorage.getItem(STORAGE_KEY)).toBe(JSON.stringify(original));
});
