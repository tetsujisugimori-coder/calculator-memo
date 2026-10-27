// @vitest-environment jsdom
import { act, createElement, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CalculatorApp } from '../components/CalculatorApp';
import { createAuditRecordMarkdown, scanAuditRecordEnvelopes } from '../lib/formula-report-audit-record';
import { createAuditComparisonRecordMarkdown, scanAuditComparisonRecordEnvelopes } from '../lib/formula-report-audit-comparison-record';
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
const normalize = (text: string) => text.replace(/\r\n?/g, '\n');
const position = async (start: number, end = start) => act(async () => { editor().setSelectionRange(start, end); editor().dispatchEvent(new Event('select', { bubbles: true })); });
const flush = async () => act(async () => { const pending = frames.splice(0); pending.forEach(callback => callback(1)); });
async function open(editing = true) {
  await act(async () => root.render(createElement(StrictMode, null, createElement(CalculatorApp))));
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
  await click('登録式ライブラリ'); await click('関連レポートを閲覧・編集');
  if (editing) { await click('Markdownを編集'); await position(0); }
  await click('根拠点検'); await click('比較資料1の詳細'); frames = [];
}
async function change(text: string) { await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(editor(), text); editor().dispatchEvent(new Event('input', { bubbles: true })); }); }
async function external(kind: 'changed' | 'deleted') {
  const next = structuredClone(fixture);
  if (kind === 'changed') next.formulaReports!.entries[0].body = 'another page saved this body'; else next.formulaReports!.entries = [];
  const oldValue = localStorage.getItem(STORAGE_KEY), raw = JSON.stringify(next); localStorage.setItem(STORAGE_KEY, raw);
  await act(async () => window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, oldValue, newValue: raw, storageArea: localStorage })));
  return raw;
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); frames = [];
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} }); HTMLElement.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => { frames.push(callback); return frames.length; })); vi.stubGlobal('cancelAnimationFrame', vi.fn());
  localStorage.clear(); fixture = structuredClone(original); localStorage.setItem(STORAGE_KEY, JSON.stringify(fixture));
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it.each(['\n', '\r\n', '\r'])('real app navigates exact A/B/material ranges without writes or acquiring originals (%j)', async newline => {
  const text = body.replace(/\n/g, newline); fixture.formulaReports!.entries[0].body = text; localStorage.setItem(STORAGE_KEY, JSON.stringify(fixture)); await open();
  const records = scanAuditRecordEnvelopes(text), comparison = scanAuditComparisonRecordEnvelopes(text)[0];
  const raw = localStorage.getItem(STORAGE_KEY), read = vi.spyOn(Storage.prototype, 'getItem'), write = vi.spyOn(Storage.prototype, 'setItem');
  const destinations = [['比較元Aの出典本文へ移動', records[0]], ['比較先Bの出典本文へ移動', records[1]], ['この比較資料の本文へ移動', comparison]] as const;
  for (const [index, [name, range]] of destinations.entries()) {
    if (index) { await click('根拠点検'); await click('比較資料1の詳細'); }
    await click(name); await flush();
    expect(editor().selectionStart).toBe(normalize(text.slice(0, range.start)).length); expect(editor().selectionEnd).toBe(normalize(text.slice(0, range.end)).length);
    expect(document.activeElement).toBe(editor()); expect(editor().value).toBe(normalize(text));
  }
  expect(read).not.toHaveBeenCalled(); expect(write).not.toHaveBeenCalled(); read.mockRestore(); write.mockRestore();
  expect(localStorage.getItem(STORAGE_KEY)).toBe(raw); expect(JSON.parse(raw!).formulaReports.entries[0].evidence).toEqual(report.evidence);
});
it('preview navigation opens editor and focuses selected source without changing the saved report', async () => {
  await open(false); expect(editor()).toBeNull(); await click('比較元Aの出典本文へ移動'); await flush();
  const range = scanAuditRecordEnvelopes(body)[0]; expect(editor().value).toBe(body); expect(editor().selectionStart).toBe(range.start); expect(editor().selectionEnd).toBe(range.end); expect(localStorage.getItem(STORAGE_KEY)).toBe(JSON.stringify(fixture));
});
it.each(['changed', 'deleted'] as const)('real CalculatorApp %s storage preserves held draft/history and rejects queued navigation', async kind => {
  await open(); await click('比較元Aの出典本文へ移動'); expect(frames.length).toBeGreaterThan(0); const pending = frames.splice(0);
  const raw = await external(kind); const selection = [editor().selectionStart, editor().selectionEnd];
  await act(async () => pending.forEach(callback => callback(1)));
  expect([editor().selectionStart, editor().selectionEnd]).toEqual(selection); expect(editor().value).toBe(body); expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
  await click('根拠点検'); await click('比較資料1の詳細'); expect(host.textContent).toContain('保存原本との一致は未確認');
  expect(host.querySelector<HTMLTextAreaElement>('[aria-label="固定比較資料の詳細"] textarea')!.value).toContain('当時の比較結果は変更あり');
});
it('body editing invalidates queued source position, including edit then exact restore', async () => {
  await open(); await click('比較元Aの出典本文へ移動'); const pending = frames.splice(0);
  await change(`追加\n${body}`); await change(body); const selection = [editor().selectionStart, editor().selectionEnd];
  await act(async () => pending.forEach(callback => callback(1)));
  expect([editor().selectionStart, editor().selectionEnd]).toEqual(selection); expect(editor().value).toBe(body); expect(localStorage.getItem(STORAGE_KEY)).toBe(JSON.stringify(fixture));
});
it('selection intent invalidates queued navigation without deleting the selected text', async () => {
  await open(); await click('比較元Aの出典本文へ移動'); const pending = frames.splice(0); await position(4, 7);
  await act(async () => pending.forEach(callback => callback(1)));
  expect([editor().selectionStart, editor().selectionEnd]).toEqual([4, 7]); expect(editor().value).toBe(body);
});
it('newer navigation wins even when old callback runs last', async () => {
  await open(); await click('比較元Aの出典本文へ移動'); const older = frames.splice(0);
  await click('根拠点検'); await click('比較資料1の詳細'); await click('比較先Bの出典本文へ移動'); const newer = frames.splice(0);
  await act(async () => { newer.forEach(callback => callback(1)); older.forEach(callback => callback(2)); });
  const range = scanAuditRecordEnvelopes(body)[1]; expect(editor().selectionStart).toBe(range.start); expect(editor().selectionEnd).toBe(range.end); expect(editor().value).toBe(body);
});
it('closing the report cancels old navigation without touching another focused control', async () => {
  await open(); await click('比較元Aの出典本文へ移動'); const pending = frames.splice(0); const oldEditor = editor();
  await click('レポートを閉じる'); const focus = document.activeElement;
  await act(async () => pending.forEach(callback => callback(1)));
  expect(editor()).toBeNull(); expect(document.activeElement).toBe(focus); expect(oldEditor.value).toBe(body); expect(localStorage.getItem(STORAGE_KEY)).toBe(JSON.stringify(fixture));
});
it('a changed native selection is respected before its select event has been delivered', async () => {
  await open(); await click('比較元Aの出典本文へ移動'); const pending = frames.splice(0);
  await act(async () => { editor().setSelectionRange(4, 7); pending.forEach(callback => callback(1)); });
  expect([editor().selectionStart, editor().selectionEnd]).toEqual([4, 7]); expect(editor().value).toBe(body);
});
