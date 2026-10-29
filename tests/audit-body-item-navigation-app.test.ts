// @vitest-environment jsdom
import { act, createElement, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { FormulaReportModal } from '../components/FormulaReportModal';
import type { FormulaReport } from '../lib/types';
import { CalculatorApp } from '../components/CalculatorApp';
import { createQuoteMarkdown, type QuoteSnapshot } from '../lib/formula-report-quotes';
import { parseReportAudit } from '../lib/formula-report-audit';
import { defaultData, STORAGE_KEY } from '../lib/storage';

const at = '2026-10-28T00:00:00.000Z';
const snapshot: QuoteSnapshot = { version: 1, quoteId: 'first', formulaId: 'f', memoId: 'memo', blockId: 'block', citedAt: at, record: { id: 'evidence', evaluator: 'calculator-memo-v1', status: 'confirmed', calculatedAt: at, persistedAt: at, blocks: [{ blockId: 'block', position: 1, expression: '1', result: '1', resultText: '1', status: 'success', inputs: [] }] } };
const body = ['first', 'middle', 'last'].map(quoteId => createQuoteMarkdown({ ...snapshot, quoteId })).join('\n\n');
const original = { ...defaultData, formulaLibrary: { version: 1, selectedId: 'f', entries: [{ id: 'f', title: '本文から順送り', expression: '1+1', createdAt: at, updatedAt: at }] }, formulaReports: { version: 1, entries: [{ id: 'r', formulaId: 'f', title: '本文確認', body, createdAt: at, updatedAt: at, confirmedExpression: null, evidence: { version: 1, links: [], confirmations: [] } }] } };
let host: HTMLDivElement, root: Root, frames: FrameRequestCallback[];
const button = (name: string, scope: ParentNode = host) => [...scope.querySelectorAll('button')].find(node => node.textContent === name)!;
const away = () => host.querySelector<HTMLElement>('[aria-label="点検からの本文移動先"]')!;
async function click(name: string, scope: ParentNode = host) { await act(async () => { const node = button(name, scope); expect(node, name).toBeTruthy(); node.focus(); node.click(); }); }
const editor = () => host.querySelector<HTMLTextAreaElement>('#formula-report-body')!;
const flush = async () => act(async () => { frames.splice(0).forEach(callback => callback(1)); });
const position = (scope: Element = away()) => scope?.textContent?.match(/対象\s*\d+件中\s*\d+件目/)?.[0].replaceAll(' ', '');
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

it('real CalculatorApp synchronizes sequential body ranges and returns to latest item without reads or writes', async () => {
  await open(); const select = host.querySelector<HTMLSelectElement>('[aria-label="詳細で表示する状態"]')!;
  await act(async () => { select.value = 'review'; select.dispatchEvent(new Event('change', { bubbles: true })); });
  const content = host.querySelector<HTMLElement>('[aria-label="レポート全体の根拠点検"] .modal-content')!; content.scrollTop = 133;
  await click('この項目の本文へ移動'); await flush(); const raw = localStorage.getItem(STORAGE_KEY), read = vi.spyOn(Storage.prototype, 'getItem'), write = vi.spyOn(Storage.prototype, 'setItem');
  const entries = parseReportAudit(body, 'f').items;
  for (const target of [1, 2, 1, 0, 1]) {
    const prior = Number(position()?.match(/中(\d+)件/)?.[1]) - 1;
    await click(target > prior ? '次の項目' : '前の項目', away());
    expect(position()).toBe(`対象3件中${prior + 1}件目`); expect([editor().selectionStart, editor().selectionEnd]).toEqual([entries[prior].start, entries[prior].end]);
    await flush(); expect(position()).toBe(`対象3件中${target + 1}件目`); expect([editor().selectionStart, editor().selectionEnd]).toEqual([entries[target].start, entries[target].end]);
    expect(away().querySelector('mark')?.textContent).toBe(body.slice(entries[target].start, entries[target].end));
  }
  await click('点検へ戻る'); await flush(); expect(position(host)).toBe('対象3件中2件目'); expect(host.querySelector<HTMLSelectElement>('[aria-label="表示する状態"]')!.value).toBe('review');
  expect(document.activeElement?.isConnected).toBe(true); expect(document.activeElement).not.toBe(document.body); expect(editor().value).toBe(body);
  expect(read).not.toHaveBeenCalled(); expect(write).not.toHaveBeenCalled(); read.mockRestore(); write.mockRestore(); expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
});
it('real CalculatorApp repeated activation before frame commits at most the adjacent occurrence', async () => {
  await open(); await click('この項目の本文へ移動'); await flush(); const next = button('次の項目', away()); expect(next).toBeTruthy();
  await act(async () => { next.click(); next.click(); next.click(); }); await flush(); expect(position()).toBe('対象3件中2件目');
  await click('点検へ戻る'); await flush(); expect(position(host)).toBe('対象3件中2件目');
});
it('real CalculatorApp discards outstanding step after ABA without changing the returned text or persisted snapshots', async () => {
  await open(); await click('この項目の本文へ移動'); await flush(); await click('次の項目', away()); const pending = frames.splice(0);
  await change(`prefix\n${body}`); await change(body); editor().setSelectionRange(2, 3);
  await act(async () => pending.forEach(callback => callback(1))); expect([editor().selectionStart, editor().selectionEnd]).toEqual([2, 3]); expect(position()).toBeUndefined(); expect(away().querySelector('mark')).toBeNull();
  await click('点検へ戻る'); await flush(); expect(position(host)).toBeUndefined(); await click('保存記録と照合'); expect(position(host)).toBeUndefined();
  expect(editor().value).toBe(body); expect(localStorage.getItem(STORAGE_KEY)).toBe(JSON.stringify(original));
});
it('real CalculatorApp rejects outstanding step on identical storage notification and after session end', async () => {
  await open(); await click('この項目の本文へ移動'); await flush(); await click('次の項目', away()); const pending = frames.splice(0);
  await act(async () => window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, oldValue: localStorage.getItem(STORAGE_KEY), newValue: localStorage.getItem(STORAGE_KEY) })));
  editor().setSelectionRange(2, 3); await act(async () => pending.forEach(callback => callback(1))); expect([editor().selectionStart, editor().selectionEnd]).toEqual([2, 3]); expect(position()).toBeUndefined();
  await click('往復ナビゲーションを終了'); await click('根拠点検'); await flush(); expect(away()).toBeNull(); expect(position(host)).toBeUndefined(); expect(localStorage.getItem(STORAGE_KEY)).toBe(JSON.stringify(original));
});

it('real CalculatorApp rejects an interrupted cursor move and allows a fresh body step without committing the rejected item', async () => {
  await open(); await click('この項目の本文へ移動'); await flush(); await click('次の項目', away());
  editor().setSelectionRange(2, 3); await flush(); expect(position()).toBe('対象3件中1件目'); expect([editor().selectionStart, editor().selectionEnd]).toEqual([2, 3]);
  expect(away().textContent).toMatch(/中止|移動できません/); await click('次の項目', away()); await flush(); expect(position()).toBe('対象3件中2件目');
  expect(editor().value).toBe(body); expect(localStorage.getItem(STORAGE_KEY)).toBe(JSON.stringify(original));
});

it('real report modal rejects a queued body step when an explicit save starts before its frame', async () => {
  let settle!: (result: string) => void;
  const save = vi.fn(() => new Promise<string>(resolve => { settle = resolve; }));
  await act(async () => root.render(createElement(FormulaReportModal, { formulaId: 'f', formula: original.formulaLibrary.entries[0], report: original.formulaReports.entries[0] as FormulaReport, writable: true, onClose: vi.fn(), onSave: save })));
  await click('Markdownを編集'); await click('根拠点検'); await click('保存記録と照合'); await click('根拠1の詳細'); await click('この項目の本文へ移動'); await flush();
  const before = away().querySelector('mark')?.textContent, range = [editor().selectionStart, editor().selectionEnd];
  await click('次の項目', away()); await click('レポートを保存'); expect(save).toHaveBeenCalledTimes(1); await flush();
  expect(position()).toBe('対象3件中1件目'); expect(away().querySelector('mark')?.textContent).toBe(before); expect([editor().selectionStart, editor().selectionEnd]).toEqual(range);
  expect(button('次の項目', away()).getAttribute('aria-disabled')).toBe('true');
  await act(async () => settle('試験用の保存失敗')); expect(position()).toBe('対象3件中1件目');
  expect(editor().value).toBe(body); expect(localStorage.getItem(STORAGE_KEY)).toBe(JSON.stringify(original));
});
