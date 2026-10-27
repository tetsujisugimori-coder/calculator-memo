// @vitest-environment jsdom
import { act, createElement, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CalculatorApp } from '../components/CalculatorApp';
import { createAuditRecordMarkdown } from '../lib/formula-report-audit-record';
import { createAuditComparisonRecordMarkdown } from '../lib/formula-report-audit-comparison-record';
import { defaultData, STORAGE_KEY } from '../lib/storage';
import type { FormulaReport, StoredData } from '../lib/types';

const at = '2026-10-27T00:00:00.000Z';
const fixed = (recordId: string) => createAuditRecordMarkdown(`点検記録 ${recordId} 日本語😀`, { recordId, formulaId: 'f', reportId: 'r', generatedAt: at, bodySha256: 'a'.repeat(64), bodyLength: 10 });
const material = createAuditComparisonRecordMarkdown('## 固定比較の本文\n当時の比較結果は変更あり\n同じ文章😀', { materialId: 'm', formulaId: 'f', reportId: 'r', beforeRecordId: 'a', afterRecordId: 'b', preparedAt: at });
const body = `前文😀 e\u0301\n\n${fixed('a')}\n\n${material}\n\n${fixed('b')}\n\n同じ文章😀\n後文`;
const report: FormulaReport = { id: 'r', formulaId: 'f', title: '出典追跡の説明', body, createdAt: at, updatedAt: at, confirmedExpression: null, evidence: { version: 1, links: [], confirmations: [{ id: 'confirmation', formulaId: 'f', confirmedAt: at, definition: { version: 1, expression: '1+1', variables: [] }, title: 'earlier confirmation', body: 'unchanged historical body', links: [], evidenceSignature: '[]' }] } };
const original: StoredData = { ...defaultData, formulaLibrary: { version: 1, selectedId: 'f', entries: [{ id: 'f', title: '追跡する式', expression: '1+1', createdAt: at, updatedAt: at }] }, formulaReports: { version: 1, entries: [report] } };
let host: HTMLDivElement, root: Root, fixture: StoredData, frames: FrameRequestCallback[];
const button = (name: string) => [...host.querySelectorAll('button')].find(node => node.textContent === name)!;
const click = async (name: string) => act(async () => { expect(button(name), name).toBeTruthy(); button(name).click(); });
const editor = () => host.querySelector<HTMLTextAreaElement>('#formula-report-body')!;
const position = async (start: number, end = start) => act(async () => { editor().setSelectionRange(start, end); editor().dispatchEvent(new Event('select', { bubbles: true })); });
const flush = async () => act(async () => { const pending = frames.splice(0); pending.forEach(callback => callback(1)); });
async function open(editing = true) {
  await act(async () => root.render(createElement(StrictMode, null, createElement(CalculatorApp))));
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
  await click('登録式ライブラリ'); await click('関連レポートを閲覧・編集');
  if (editing) { await click('Markdownを編集'); await position(0); }
  button('根拠点検').focus(); await click('根拠点検'); await click('比較資料1の詳細'); frames = [];
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); frames = [];
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} }); HTMLElement.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => { frames.push(callback); return frames.length; })); vi.stubGlobal('cancelAnimationFrame', vi.fn());
  localStorage.clear(); fixture = structuredClone(original); localStorage.setItem(STORAGE_KEY, JSON.stringify(fixture));
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });


it('independent: close after normal return restores focus to audit opener', async () => {
  await open();
  button('この比較資料の本文へ移動').focus(); await click('この比較資料の本文へ移動'); await flush();
  button('点検へ戻る').focus(); await click('点検へ戻る'); await flush();
  await click('根拠点検を閉じる'); await flush();
  expect(document.activeElement).toBe(button('根拠点検'));
});
it('independent: a storage notification cannot revive roundtrip even with same raw value', async () => {
  await open(); await click('保存記録と照合'); await click('比較資料1の詳細');
  await click('この比較資料の本文へ移動'); await flush();
  const raw = localStorage.getItem(STORAGE_KEY);
  await act(async () => window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, oldValue: raw, newValue: raw, storageArea: localStorage })));
  await position(0); frames = [];
  await click('本文の対象へもう一度移動'); await flush();
  expect(editor().selectionStart).toBe(0);
});
