// @vitest-environment jsdom
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { FormulaLibraryModal } from '../components/FormulaLibraryModal';
import { FormulaDetailView } from '../components/FormulaDetailView';
import { defaultData, loadData, saveDataChecked, STORAGE_KEY } from '../lib/storage';
import { saveFormulaReport } from '../lib/formula-reports';
import type { FormulaLibrary, FormulaReport, StoredData } from '../lib/types';

const date = '2026-10-23T04:00:00.000Z';
const fixture = (): StoredData => {
  const formula = { id: 'formula-a', title: '登録式A', expression: 'x*2', createdAt: date, updatedAt: date };
  const report: FormulaReport = { id: 'report-a', formulaId: formula.id, title: '説明A', body: '保存済み本文', createdAt: date, updatedAt: date, confirmedExpression: formula.expression,
    evidence: { version: 1, links: [], confirmations: [{ id: 'confirmation-a', formulaId: formula.id, confirmedAt: date, definition: { version: 1, expression: formula.expression, variables: ['x'] }, title: '説明A', body: '保存済み本文', links: [], evidenceSignature: '[]' }] } };
  return { ...defaultData, formulaLibrary: { version: 1, entries: [formula], selectedId: formula.id }, formulaReports: { version: 1, entries: [report] } };
};
let host: HTMLDivElement, root: Root;
let persisted: StoredData;
const raw = () => localStorage.getItem(STORAGE_KEY)!;
const detail = () => host.querySelector('[aria-label="保存済み登録式の詳細"]')!;
const status = () => detail().querySelector('[data-testid="formula-detail-assessment"]')?.textContent;
const button = (text: string) => [...host.querySelectorAll('button')].find(item => item.textContent === text)!;
const click = async (text: string) => act(async () => button(text).click());
const input = async (id: string, value: string) => act(async () => {
  const field = host.querySelector<HTMLInputElement | HTMLTextAreaElement>('#' + id)!;
  const proto = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(field, value);
  field.dispatchEvent(new Event('input', { bubbles: true }));
});
function LibraryHarness() {
  const [data, setData] = useState(persisted);
  const [pendingSave, setPendingSave] = useState(false);
  const [queued, setQueued] = useState<StoredData | null>(null);
  const changeFormula = (library: FormulaLibrary) => {
    const next = { ...data, formulaLibrary: library }; setData(next); setPendingSave(true);
    setQueued(next);
  };
  return createElement('div', null, createElement(FormulaLibraryModal, { library: data.formulaLibrary!, reports: data.formulaReports, pendingSave, writable: true, onChange: changeFormula, onClose: vi.fn(), onExecute: vi.fn(), onSaveReport: async request => {
    const loaded = loadData(); if (loaded.status !== 'ok') return '読込失敗';
    const formulaReports = saveFormulaReport(data.formulaReports!, data.formulaLibrary!, request, date, loaded.data.notes);
    const next = { ...data, formulaReports }, result = saveDataChecked(next, loaded.raw);
    if (!result.ok) return '保存失敗';
    setData(next); return formulaReports.entries.find(item => item.id === request.id)!;
  } }), createElement('button', { onClick: () => {
    if (!queued) throw new Error('no queued fixture save');
    const result = saveDataChecked(queued, raw());
    if (!result.ok) throw new Error('fixture save failed');
    setPendingSave(false); setQueued(null);
  } }, 'fixture保存完了'));
}
const renderLibrary = async () => act(async () => root.render(createElement(LibraryHarness)));
beforeEach(() => {
  persisted = fixture(); localStorage.clear(); localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); });

it.each([['名称だけ変更', 'x*2', '確認済み・式一致'], ['式の変更', 'x*3', '要再確認・式変更あり'], ['変数の変更', 'y*2', '要再確認・式変更あり']])('same-tab formula edit/save/return refreshes without a storage event: %s', async (title, expression, expected) => {
  const events = vi.fn(); window.addEventListener('storage', events);
  const original = raw(); await renderLibrary(); expect(status()).toBe('確認済み・式一致');
  await click('登録式を編集'); await input('library-title', title); await input('library-expression', expression); await click('登録する');
  expect(detail().textContent).toContain('未保存'); expect(detail().textContent).toContain('x*2'); expect(raw()).toBe(original);
  await click('fixture保存完了');
  expect(detail().textContent).toContain(title); expect(detail().querySelector('.library-expression')?.textContent).toContain(expression); expect(status()).toBe(expected);
  expect(JSON.parse(raw()).formulaReports).toEqual(fixture().formulaReports); expect(events).not.toHaveBeenCalled(); window.removeEventListener('storage', events);
});
it('same-tab ordinary report save/close reloads the new saved body but never promotes old history', async () => {
  await renderLibrary(); await click('関連レポートを閲覧・編集'); await click('Markdownを編集'); await input('formula-report-body', '新しく保存した説明'); await click('レポートを保存');
  await click('レポートを閉じる'); expect(detail().querySelector('[aria-label="保存済み関連レポート"]')?.textContent).toBe('新しく保存した説明'); expect(status()).toBe('未確認');
  expect(JSON.parse(raw()).formulaReports.entries[0].evidence.confirmations).toEqual(fixture().formulaReports!.entries[0].evidence!.confirmations);
});
it('same-tab explicit confirmation/save/close refreshes confirmation only after checked persistence', async () => {
  await renderLibrary(); await click('関連レポートを閲覧・編集'); await click('Markdownを編集'); await input('formula-report-body', '利用者が確認する新本文'); await click('現在の式に対する内容を確認して保存'); await click('レポートを閉じる');
  expect(status()).toBe('確認済み・式一致'); expect(detail().textContent).toContain('利用者が確認する新本文'); expect(JSON.parse(raw()).formulaReports.entries[0].evidence.confirmations).toHaveLength(2);
});
it('formula edit cancel preserves raw JSON, confirmation history and detail state', async () => {
  const original = raw(); await renderLibrary(); await click('登録式を編集'); await input('library-title', '破棄する名前'); await input('library-expression', 'z*999'); await click('編集をキャンセル');
  expect(raw()).toBe(original); expect(status()).toBe('確認済み・式一致'); expect(detail().textContent).not.toContain('z*999');
});
it('report edit discard preserves raw JSON/history and reloads the original detail body', async () => {
  const original = raw(); await renderLibrary(); await click('関連レポートを閲覧・編集'); await click('Markdownを編集'); await input('formula-report-body', '破棄する本文'); await click('レポートを閉じる'); await click('未保存の編集を破棄して閉じる');
  expect(raw()).toBe(original); expect(status()).toBe('確認済み・式一致'); expect(detail().textContent).not.toContain('破棄する本文'); expect(detail().textContent).toContain('保存済み本文');
});
it('library detail invalidates cross-tab state before refresh and cannot approve an altered source', async () => {
  await renderLibrary(); const other = fixture(); other.formulaLibrary!.entries[0].expression = 'x*4'; const updated = JSON.stringify(other); localStorage.setItem(STORAGE_KEY, updated);
  await act(async () => window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, newValue: updated })));
  expect(status()).toBe('根拠未照合（原本更新後）'); await click('保存済み詳細を再取得'); expect(status()).toBe('要再確認・式変更あり'); expect(raw()).toBe(updated);
});
const mutations: [string, (data: StoredData) => void][] = [
  ['unknown formula field', data => Object.assign(data.formulaLibrary!.entries[0], { future: 'preserve' })],
  ['unknown report format version', data => Object.assign(data.formulaReports!, { version: 999 })],
  ['unknown confirmation definition field', data => Object.assign(data.formulaReports!.entries[0].evidence!.confirmations[0].definition, { future: 'preserve' })],
  ['unknown evidence links field', data => { data.formulaReports!.entries[0].evidence!.links = [Object.assign({ memoId: 'm', recordId: 'r' }, { future: 'preserve' })]; }],
  ['malformed confirmation definition', data => Object.assign(data.formulaReports!.entries[0].evidence!.confirmations[0], { definition: null })],
  ['malformed confirmation variables', data => Object.assign(data.formulaReports!.entries[0].evidence!.confirmations[0].definition, { variables: [null] })],
  ['malformed confirmation links', data => Object.assign(data.formulaReports!.entries[0].evidence!.confirmations[0], { links: [null] })],
  ['malformed confirmation history', data => Object.assign(data.formulaReports!.entries[0].evidence!, { confirmations: [null] })],
];
it.each(mutations)('strict detail refresh preserves %s without an exception or confirmed upgrade', async (_name, mutate) => {
  await renderLibrary(); const value = fixture(); mutate(value); const changed = JSON.stringify(value); localStorage.setItem(STORAGE_KEY, changed); const write = vi.spyOn(Storage.prototype, 'setItem');
  await click('保存済み詳細を再取得'); expect(detail().textContent).toContain('判定不能'); expect(status()).not.toBe('確認済み・式一致'); expect(raw()).toBe(changed); expect(write).not.toHaveBeenCalled();
});
it('a detail re-mount reads corrupt current storage rather than carrying forward old confirmed state', async () => {
  await act(async () => root.render(createElement(FormulaDetailView, { formulaId: 'formula-a', key: 'initial' })));
  expect(status()).toBe('確認済み・式一致'); localStorage.setItem(STORAGE_KEY, '{broken'); vi.spyOn(console, 'error').mockImplementation(() => {});
  await act(async () => root.render(createElement(FormulaDetailView, { formulaId: 'formula-a', key: 'reopened' })));
  expect(detail().textContent).toContain('判定不能'); expect(status()).not.toBe('確認済み・式一致'); expect(raw()).toBe('{broken');
});

it('ordinary report edits preserve supported unknown metadata rather than silently stripping it', async () => {
  const metadata = { futureDescription: { nested: ['preserve', 42] } };
  Object.assign(persisted.formulaReports!.entries[0], metadata);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
  await renderLibrary(); expect(status()).toBe('確認済み・式一致');
  await click('関連レポートを閲覧・編集'); await click('Markdownを編集'); await input('formula-report-body', '新本文'); await click('レポートを保存'); await click('レポートを閉じる');
  const saved = JSON.parse(raw()).formulaReports.entries[0];
  expect(saved.futureDescription).toEqual(metadata.futureDescription);
  expect(saved.evidence.confirmations).toEqual(fixture().formulaReports!.entries[0].evidence!.confirmations);
  expect(status()).toBe('未確認');
});
it('ordinary formula edits preserve unknown fields and never elevate their assessment', async () => {
  Object.assign(persisted.formulaLibrary!.entries[0], { futureDefinition: { scale: 999 } });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
  await renderLibrary(); expect(status()).toContain('判定不能');
  await click('登録式を編集'); await input('library-title', '名称編集'); await click('登録する');
  await click('fixture保存完了');
  expect(JSON.parse(raw()).formulaLibrary.entries[0].futureDefinition).toEqual({ scale: 999 });
  expect(status()).toContain('判定不能');
});
it('failed explicit report save does not publish the new body or confirmation history', async () => {
  const original = raw(); await renderLibrary(); await click('関連レポートを閲覧・編集'); await click('Markdownを編集'); await input('formula-report-body', '保存できない確認本文');
  const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Quota exceeded', 'QuotaExceededError'); });
  vi.spyOn(console, 'error').mockImplementation(() => {});
  await click('現在の式に対する内容を確認して保存');
  expect(host.textContent).toContain('保存失敗'); expect(raw()).toBe(original);
  write.mockRestore();
  await click('レポートを閉じる'); await click('未保存の編集を破棄して閉じる');
  expect(status()).toBe('確認済み・式一致'); expect(detail().textContent).not.toContain('保存できない確認本文'); expect(raw()).toBe(original);
});
