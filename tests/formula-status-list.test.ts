// @vitest-environment jsdom
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { FormulaLibraryModal } from '../components/FormulaLibraryModal';
import { defaultData, loadData, saveDataChecked, STORAGE_KEY } from '../lib/storage';
import { saveFormulaReport } from '../lib/formula-reports';
import type { FormulaLibrary, FormulaReport, StoredData } from '../lib/types';

const date = '2026-10-23T04:00:00.000Z';
function fixture(): StoredData {
  const entries = ['confirmed', 'changed', 'unconfirmed', 'absent', 'unknown'].map(id => ({ id, title: id, expression: id === 'changed' ? 'x*3' : 'x*2', createdAt: date, updatedAt: date }));
  const reports: FormulaReport[] = entries.filter(item => item.id !== 'absent').map(formula => ({ id: `report-${formula.id}`, formulaId: formula.id, title: `説明-${formula.id}`, body: `保存本文-${formula.id}`, createdAt: date, updatedAt: date, confirmedExpression: 'x*2', evidence: { version: 1, links: [], confirmations: [{ id: `confirmation-${formula.id}`, formulaId: formula.id, confirmedAt: date, definition: { version: 1, expression: 'x*2', variables: ['x'] }, title: `説明-${formula.id}`, body: `保存本文-${formula.id}`, links: [], evidenceSignature: '[]' }] } }));
  reports.find(item => item.formulaId === 'unconfirmed')!.body = '確認後に編集した本文';
  Object.assign(entries.find(item => item.id === 'unknown')!, { futureDefinition: 'preserve' });
  return { ...defaultData, formulaLibrary: { version: 1, entries, selectedId: 'confirmed' }, formulaReports: { version: 1, entries: reports } };
}
let host: HTMLDivElement, root: Root, persisted: StoredData;
const changed = vi.fn(), execute = vi.fn();
const raw = () => localStorage.getItem(STORAGE_KEY)!;
const list = () => host.querySelector('[aria-label="登録式一覧"]')!;
const listStatuses = () => [...list().querySelectorAll('[data-testid="formula-list-status"]')].map(item => item.textContent);
const rowNames = () => [...list().querySelectorAll('button')].map(item => item.getAttribute('aria-label'));
const detail = () => host.querySelector('[aria-label="保存済み登録式の詳細"]')!;
const detailStatus = () => detail().querySelector('[data-testid="formula-detail-assessment"]')?.textContent;
const click = async (text: string) => act(async () => {
  const button = [...host.querySelectorAll('button')].find(item => item.textContent === text);
  expect(button, `button ${text}`).toBeDefined(); button!.click();
});
const choose = async (value: string) => act(async () => {
  const select = host.querySelector<HTMLSelectElement>('[aria-label="根拠状態で絞り込み"]')!;
  select.value = value; select.dispatchEvent(new Event('change', { bubbles: true }));
});
const input = async (id: string, value: string) => act(async () => {
  const field = host.querySelector<HTMLInputElement | HTMLTextAreaElement>('#' + id)!;
  const proto = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(field, value); field.dispatchEvent(new Event('input', { bubbles: true }));
});
function Harness() {
  const [data, setData] = useState(persisted);
  const [queued, setQueued] = useState<StoredData | null>(null);
  const change = (library: FormulaLibrary) => { changed(library); const next = { ...data, formulaLibrary: library }; setData(next); setQueued(next); };
  return createElement('div', null, createElement(FormulaLibraryModal, {
    library: data.formulaLibrary!, reports: data.formulaReports, pendingSave: queued !== null, writable: true,
    onChange: change, onClose: vi.fn(), onExecute: execute,
    onSaveReport: async request => {
      const loaded = loadData(); if (loaded.status !== 'ok') return '読込失敗';
      const formulaReports = saveFormulaReport(data.formulaReports!, data.formulaLibrary!, request, date, loaded.data.notes);
      const next = { ...data, formulaReports }; if (!saveDataChecked(next, loaded.raw).ok) return '保存失敗';
      setData(next); return formulaReports.entries.find(item => item.id === request.id)!;
    },
  }), createElement('button', { onClick: () => {
    if (!queued || !saveDataChecked(queued, raw()).ok) throw new Error('fixture save failed'); setQueued(null);
  } }, 'fixture保存完了'));
}
const render = async () => act(async () => root.render(createElement(Harness)));
beforeEach(() => {
  persisted = fixture(); localStorage.clear(); localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted)); changed.mockClear(); execute.mockClear();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); });

it('shows every saved assessment, distinguishing absent reports from edited/unconfirmed reports', async () => {
  await render(); expect(listStatuses()).toEqual(['確認済み', '要再確認', '未確認', '根拠なし（レポート未登録）', '状態判定不能']);
  expect(host.textContent).toContain('数学的正しさの保証ではありません');
});
it('filters all categories without writing, reordering, selecting or changing the original data', async () => {
  const original = raw(), write = vi.spyOn(Storage.prototype, 'setItem'); await render();
  for (const [group, names] of [['confirmed', ['confirmed']], ['changed', ['changed']], ['unconfirmed', ['unconfirmed', 'absent']], ['unknown', ['unknown']], ['all', ['confirmed', 'changed', 'unconfirmed', 'absent', 'unknown']]] as const) {
    await choose(group); expect(rowNames()).toEqual(names); expect(detailStatus()).toBe('確認済み・式一致');
  }
  expect(raw()).toBe(original); expect(write).not.toHaveBeenCalled(); expect(changed).not.toHaveBeenCalled();
});
it('same-name rows navigate and execute by stable ID, including their separate report and history', async () => {
  persisted.formulaLibrary!.entries[0].title = '同じ名前'; persisted.formulaLibrary!.entries[1].title = '同じ名前'; localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted)); const original = raw();
  await render(); const buttons = list().querySelectorAll<HTMLButtonElement>('[aria-label="同じ名前"]');
  await act(async () => buttons[1].click()); expect(detail().textContent).toContain('保存本文-changed'); expect(detail().textContent).toContain('confirmation-changed'); expect(detailStatus()).toBe('要再確認・式変更あり');
  await click('登録式を実行'); expect(execute).toHaveBeenLastCalledWith('changed');
  await act(async () => buttons[0].click()); expect(detail().textContent).toContain('保存本文-confirmed'); expect(detail().textContent).not.toContain('保存本文-changed'); expect(detailStatus()).toBe('確認済み・式一致'); expect(raw()).toBe(original);
});
it('keeps pending formula edits separate, then refreshes list and detail from successful storage', async () => {
  const original = raw(); await render(); await click('登録式を編集'); await input('library-expression', 'z*999'); await click('登録する');
  expect(raw()).toBe(original); expect(listStatuses()[0]).toBe('確認済み'); expect(detailStatus()).toBe('確認済み・式一致'); expect(detail().textContent).not.toContain('z*999'); expect(detail().textContent).toContain('未保存');
  await click('fixture保存完了'); expect(listStatuses()[0]).toBe('要再確認'); expect(detailStatus()).toBe('要再確認・式変更あり'); expect(detail().textContent).toContain('z*999');
  expect(JSON.parse(raw()).formulaReports).toEqual(fixture().formulaReports);
});
it('new unsaved formulas are unverified rather than claiming a saved report exists', async () => {
  const original = raw(); await render(); await click('計算式を登録'); await input('library-title', '未保存の新式'); await input('library-expression', 'a*2'); await click('登録する');
  expect(listStatuses()).toContain('根拠未照合'); expect(raw()).toBe(original);
  await choose('unknown'); expect(rowNames()).toContain('未保存の新式');
});
it.each(['保存済み一覧を再取得', '保存済み詳細を再取得'])('storage updates invalidate both views until explicit shared refresh: %s', async refresh => {
  await render(); const updated = fixture(); updated.formulaLibrary!.entries[0].expression = 'x*4'; const next = JSON.stringify(updated); localStorage.setItem(STORAGE_KEY, next);
  await act(async () => window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, newValue: next })));
  expect(listStatuses()).toEqual(Array(5).fill('根拠未照合')); expect(detailStatus()).toBe('根拠未照合（原本更新後）');
  await choose('confirmed'); expect(rowNames()).toEqual([]); expect(host.textContent).toContain('この状態に該当する登録式はありません');
  await choose('unknown'); expect(rowNames()).toHaveLength(5); await click(refresh); expect(rowNames()).toEqual(['unknown']);
  await choose('all'); expect(listStatuses()[0]).toBe('要再確認'); expect(detailStatus()).toBe('要再確認・式変更あり'); expect(raw()).toBe(next);
});
it('read failures never retain a confirmed list or detail assessment and never write', async () => {
  await render(); const original = raw(), write = vi.spyOn(Storage.prototype, 'setItem');
  const read = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('denied', 'SecurityError'); }); vi.spyOn(console, 'error').mockImplementation(() => {});
  await click('保存済み一覧を再取得'); expect(listStatuses()).toEqual(Array(5).fill('状態判定不能')); expect(detail().textContent).toContain('判定不能'); expect(detailStatus()).not.toBe('確認済み・式一致'); expect(write).not.toHaveBeenCalled();
  read.mockRestore(); expect(raw()).toBe(original);
});
it.each(['formula', 'report'])('%s edit cancellation leaves list, raw JSON and confirmation history unchanged', async kind => {
  const original = raw(); await render();
  if (kind === 'formula') { await click('登録式を編集'); await input('library-expression', 'z*999'); await click('編集をキャンセル'); }
  else { await click('関連レポートを閲覧・編集'); await click('Markdownを編集'); await input('formula-report-body', '未保存の破棄本文'); await click('レポートを閉じる'); await click('未保存の編集を破棄して閉じる'); }
  expect(raw()).toBe(original); expect(listStatuses()[0]).toBe('確認済み'); expect(detailStatus()).toBe('確認済み・式一致'); expect(detail().textContent).not.toContain('未保存の破棄本文');
});
it('report body save demotes prior history, and explicit confirmation promotes only after saving', async () => {
  await render(); await click('関連レポートを閲覧・編集'); await click('Markdownを編集'); await input('formula-report-body', '保存する新本文'); await click('レポートを保存'); await click('レポートを閉じる');
  expect(listStatuses()[0]).toBe('未確認'); expect(detailStatus()).toBe('未確認'); expect(JSON.parse(raw()).formulaReports.entries[0].evidence.confirmations).toHaveLength(1);
  await click('関連レポートを閲覧・編集'); await click('Markdownを編集'); await click('現在の式に対する内容を確認して保存'); await click('レポートを閉じる');
  expect(listStatuses()[0]).toBe('確認済み'); expect(detailStatus()).toBe('確認済み・式一致'); expect(JSON.parse(raw()).formulaReports.entries[0].evidence.confirmations).toHaveLength(2);
});
const protectedMutations: [string, (data: StoredData) => void][] = [
  ['unknown report version', data => Object.assign(data.formulaReports!, { version: 999 })],
  ['duplicate formula IDs', data => { data.formulaLibrary!.entries[1].id = data.formulaLibrary!.entries[0].id; }],
  ['duplicate report IDs', data => { data.formulaReports!.entries[1].id = data.formulaReports!.entries[0].id; }],
  ['unknown nested evidence link', data => { data.formulaReports!.entries[0].evidence!.links = [Object.assign({ memoId: 'm', recordId: 'r' }, { future: ['preserve'] })]; }],
  ['unknown confirmation definition', data => Object.assign(data.formulaReports!.entries[0].evidence!.confirmations[0].definition, { future: ['preserve'] })],
  ['unknown confirmation history field', data => Object.assign(data.formulaReports!.entries[0].evidence!.confirmations[0], { future: ['preserve'] })],
  ['null definition', data => Object.assign(data.formulaReports!.entries[0].evidence!.confirmations[0], { definition: null })],
  ['null variables', data => Object.assign(data.formulaReports!.entries[0].evidence!.confirmations[0].definition, { variables: [null] })],
  ['null links', data => Object.assign(data.formulaReports!.entries[0].evidence!.confirmations[0], { links: [null] })],
  ['null history', data => Object.assign(data.formulaReports!.entries[0].evidence!, { confirmations: [null] })],
];
it.each(protectedMutations)('protected %s survives list refresh and filters byte-for-byte, with checked writes blocked', async (_name, mutate) => {
  await render(); const invalid = fixture(); mutate(invalid); const original = JSON.stringify(invalid); localStorage.setItem(STORAGE_KEY, original); const write = vi.spyOn(Storage.prototype, 'setItem');
  await click('保存済み一覧を再取得'); expect(listStatuses()[0]).toBe('状態判定不能'); expect(detail().textContent).toContain('判定不能');
  await choose('confirmed'); expect(rowNames()).toEqual([]); await choose('unknown'); expect(rowNames()).toHaveLength(5);
  expect(saveDataChecked(fixture(), original).ok).toBe(false); expect(write).not.toHaveBeenCalled(); expect(raw()).toBe(original);
});
it('malformed JSON remains intact and never displays confirmed rows', async () => {
  await render(); localStorage.setItem(STORAGE_KEY, '{broken'); vi.spyOn(console, 'error').mockImplementation(() => {}); const write = vi.spyOn(Storage.prototype, 'setItem');
  await click('保存済み一覧を再取得'); expect(listStatuses()).toEqual(Array(5).fill('状態判定不能')); expect(raw()).toBe('{broken'); expect(write).not.toHaveBeenCalled();
});
it('missing evidence records never inherit confirmation merely because history exists', async () => {
  const report = persisted.formulaReports!.entries[0];
  report.evidence!.links = [{ memoId: 'missing-memo', recordId: 'missing-record' }];
  report.evidence!.confirmations[0].links = [...report.evidence!.links];
  localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted)); const original = raw();
  await render(); expect(listStatuses()[0]).toBe('状態判定不能'); expect(detailStatus()).toContain('判定不能');
  await choose('confirmed'); expect(rowNames()).toEqual([]); expect(raw()).toBe(original);
});
it('unrelated storage events preserve the snapshot, whereas storage clear invalidates all rows', async () => {
  await render(); const original = raw();
  await act(async () => window.dispatchEvent(new StorageEvent('storage', { key: 'unrelated-setting' })));
  expect(listStatuses()[0]).toBe('確認済み'); expect(detailStatus()).toBe('確認済み・式一致');
  await act(async () => window.dispatchEvent(new StorageEvent('storage', { key: null })));
  expect(listStatuses()).toEqual(Array(5).fill('根拠未照合')); expect(detailStatus()).toBe('根拠未照合（原本更新後）'); expect(raw()).toBe(original);
});
it('failed confirmation save does not publish draft content or new history to either saved view', async () => {
  const original = raw(); await render(); await click('関連レポートを閲覧・編集'); await click('Markdownを編集'); await input('formula-report-body', '保存できない本文');
  const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Quota exceeded', 'QuotaExceededError'); }); vi.spyOn(console, 'error').mockImplementation(() => {});
  await click('現在の式に対する内容を確認して保存'); expect(host.textContent).toContain('保存失敗'); expect(raw()).toBe(original); write.mockRestore();
  await click('レポートを閉じる'); await click('未保存の編集を破棄して閉じる'); expect(listStatuses()[0]).toBe('確認済み'); expect(detailStatus()).toBe('確認済み・式一致'); expect(detail().textContent).not.toContain('保存できない本文'); expect(raw()).toBe(original);
});
