// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CalculatorApp } from '../components/CalculatorApp';
import { defaultData, STORAGE_KEY } from '../lib/storage';
import { createQuoteMarkdown, type QuoteSnapshot } from '../lib/formula-report-quotes';
import type { EvidenceRecord } from '../lib/calculation-evidence';
import type { FormulaReport, StoredData } from '../lib/types';
import * as markdownReports from '../lib/markdown-report';

// Real parent/library/editor/audit tree: no replacement report props and no mocked storage loader.
const at = '2026-10-25T00:00:00.000Z';
const formula = { id: 'f', title: '保持本文検証', expression: 'a+1', createdAt: at, updatedAt: at };
const record: EvidenceRecord = { id: 'source', evaluator: 'calculator-memo-v1', status: 'confirmed', calculatedAt: at, persistedAt: at, blocks: [{ blockId: 'b', position: 1, expression: '1+1', inputs: [], result: '2', resultText: '2', status: 'success' }] };
const quote: QuoteSnapshot = { version: 1, quoteId: 'q', formulaId: 'f', memoId: 'm', blockId: 'b', citedAt: at, record };
const report: FormulaReport = { id: 'r', formulaId: 'f', title: '保持した説明', body: `old held body\n${createQuoteMarkdown(quote)}`, createdAt: at, updatedAt: at, confirmedExpression: null, evidence: { version: 1, links: [{ memoId: 'm', recordId: 'source' }], confirmations: [{ id: 'confirmation', formulaId: 'f', confirmedAt: at, definition: { version: 1, expression: 'a+1', variables: ['a'] }, title: 'earlier confirmation', body: 'earlier body', links: [], evidenceSignature: '[]' }] } };
const original: StoredData = { ...defaultData, notes: [{ id: 'm', type: 'plain-calculation', title: 'Synthetic source', content: '1+1', createdAt: at, updatedAt: at, calculationEvidence: { version: 1, records: [record] } }], formulaLibrary: { version: 1, selectedId: 'f', entries: [formula] }, formulaReports: { version: 1, entries: [report] } };
let host: HTMLDivElement, root: Root;
const copy = vi.fn<(text: string) => Promise<void>>();
const button = (label: string) => [...host.querySelectorAll('button')].find(node => node.textContent === label)!;
const click = async (label: string) => act(async () => { expect(button(label), label).toBeTruthy(); button(label).click(); });
const copied = () => copy.mock.calls.at(-1)![0];
async function open() {
  await act(async () => root.render(createElement(CalculatorApp)));
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
  await click('登録式ライブラリ'); await click('関連レポートを閲覧・編集'); await click('根拠点検');
}
async function external(kind: 'changed' | 'deleted' | 'unrelated') {
  const next = structuredClone(original);
  if (kind === 'changed') next.formulaReports!.entries[0].body = 'external new body';
  if (kind === 'deleted') next.formulaReports!.entries = [];
  if (kind === 'unrelated') next.notes.push({ id: 'unrelated', type: 'plain-calculation', title: 'Unrelated note', content: '3+4', createdAt: at, updatedAt: at });
  const raw = JSON.stringify(next), oldValue = localStorage.getItem(STORAGE_KEY);
  localStorage.setItem(STORAGE_KEY, raw);
  await act(async () => window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, oldValue, newValue: raw, storageArea: localStorage })));
  return raw;
}
function expectHeld(markdown = copied()) {
  expect(markdown).toContain('保持');
  expect(markdown).toContain('現在の保存本文との一致は未確認');
  expect(markdown).not.toContain('現在表示中の保存済み本文（本文に未保存変更なし）');
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  HTMLElement.prototype.scrollIntoView = vi.fn();
  localStorage.clear(); localStorage.setItem(STORAGE_KEY, JSON.stringify(original));
  copy.mockReset().mockResolvedValue();
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: copy } });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it.each(['changed', 'deleted'] as const)('real storage %s retains body without describing it as current saved, even after source recheck and reopen', async kind => {
  await open(); await click('保存記録と照合');
  const raw = await external(kind);
  if (!button('点検結果をコピー')) await click('根拠点検');
  await click('点検結果をコピー'); expectHeld();
  expect(copied()).toContain('現在の編集基準本文との比較）：なし');
  expect(host.textContent).toContain('現在の保存本文との一致は未確認');
  await click('保存記録と照合'); await click('点検結果をコピー'); expectHeld(); expect(copied()).toContain('点検状態：照合済み');
  await click('根拠点検を閉じる'); await click('根拠点検'); await click('点検結果をコピー'); expectHeld();
  await click('根拠点検を閉じる'); await click('レポートを閉じる'); await click('関連レポートを閲覧・編集'); await click('根拠点検'); await click('点検結果をコピー'); expectHeld();
  expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
});

it('unrelated stored changes produce an unknown equality warning, not a target report change/deletion claim', async () => {
  await open(); const raw = await external('unrelated');
  if (!button('点検結果をコピー')) await click('根拠点検');
  await click('点検結果をコピー'); expectHeld();
  expect(copied()).not.toContain('登録式または保存済みレポートの変更・削除を検知');
  expect(host.textContent).not.toContain('登録式または保存済みレポートが変更されています');
  await click('保存記録と照合'); await click('点検結果をコピー'); expectHeld();
  expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
});

it('local edited body and external storage equality uncertainty remain separate through source recheck', async () => {
  await open(); await click('根拠点検を閉じる'); await click('Markdownを編集');
  const editor = host.querySelector('#formula-report-body') as HTMLTextAreaElement;
  expect(editor).toBeTruthy();
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(editor, 'local edited body');
    editor.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await click('根拠点検'); const raw = await external('changed');
  if (!button('点検結果をコピー')) await click('根拠点検');
  await click('点検結果をコピー'); expectHeld();
  expect(copied()).toContain('現在の編集基準本文との比較）：あり');
  await click('保存記録と照合'); await click('点検結果をコピー'); expectHeld();
  await click('根拠点検を閉じる');
  expect(editor.value).toBe('local edited body'); expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
});

it.each(['resolve', 'reject'] as const)('external storage update prevents delayed clipboard %s from restoring old success or manual text', async outcome => {
  await open();
  let resolve!: () => void, reject!: (error: Error) => void;
  copy.mockImplementationOnce(() => new Promise<void>((yes, no) => { resolve = yes; reject = no; }));
  await click('点検結果をコピー'); expect(copy).toHaveBeenCalledOnce();
  const raw = await external('changed');
  await act(async () => { if (outcome === 'resolve') resolve(); else reject(new Error('delayed denial')); });
  expect(host.textContent).not.toContain('点検結果をコピーしました');
  expect(host.querySelector('.report-audit textarea')).toBeNull();
  if (!button('点検結果をコピー')) await click('根拠点検');
  expect(host.textContent).not.toContain('点検結果をコピーしました');
  expect(host.querySelector('.report-audit textarea')).toBeNull();
  await click('点検結果をコピー'); expectHeld(); expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
});

it('copy and file export share body uncertainty without reading/writing originals or changing the held editor', async () => {
  await open(); const raw = await external('deleted');
  if (!button('点検結果をコピー')) await click('根拠点検');
  await click('保存記録と照合');
  const download = vi.spyOn(markdownReports, 'downloadMarkdownReport').mockImplementation(() => {});
  const reads = vi.spyOn(Storage.prototype, 'getItem'), writes = vi.spyOn(Storage.prototype, 'setItem');
  await click('点検結果をコピー'); await click('点検結果を.md出力');
  expectHeld(); expectHeld(download.mock.calls[0][0].markdown);
  expect(download.mock.calls[0][0].markdown.replace(/出力日時（UTC、ISO 8601）：[^\n]+/, 'TIME')).toBe(copied().replace(/出力日時（UTC、ISO 8601）：[^\n]+/, 'TIME'));
  expect(reads).not.toHaveBeenCalled(); expect(writes).not.toHaveBeenCalled(); reads.mockRestore();
  expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
  await click('根拠点検を閉じる'); await click('Markdownを編集');
  expect([...host.querySelectorAll('textarea')].some(node => node.value === report.body)).toBe(true);
});

it('same-turn storage notification and export cannot mix old saved-body wording with an invalidated source generation', async () => {
  await open(); await click('保存記録と照合');
  const next = structuredClone(original); next.formulaReports!.entries[0].body = 'external replacement';
  const raw = JSON.stringify(next), oldValue = localStorage.getItem(STORAGE_KEY);
  localStorage.setItem(STORAGE_KEY, raw);
  await act(async () => {
    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, oldValue, newValue: raw, storageArea: localStorage }));
    button('点検結果をコピー').click();
  });
  expectHeld(); expect(copied()).toContain('結果失効');
  expect(copied()).not.toContain('出典に対する照合：保存記録と一致');
  expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
});
