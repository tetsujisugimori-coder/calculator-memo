// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CalculatorApp } from '../components/CalculatorApp';
import { defaultData, STORAGE_KEY } from '../lib/storage';
import type { Memo, PlainCalculationNote } from '../lib/types';
vi.mock('../components/NotesPanel', () => ({ NotesPanel: ({ notes, onEdit }: { notes: Memo[]; onEdit: (note: Memo) => void }) => createElement('button', { onClick: () => onEdit(notes[0]) }, 'edit fixture') }));
const note = (): PlainCalculationNote => ({ id: 'note', type: 'plain-calculation', title: 'source', content: '', createdAt: '', updatedAt: '', calculationPolicy: { version: 1, mode: 'manual' }, blocks: [{ id: 'a', type: 'calculation', expression: '12', displayExpression: '12', result: 10, resultText: '10', error: null, evaluationMode: 'block-references', references: { version: 1, entries: [] } }] });
let root: Root, host: HTMLDivElement;
const button = (text: string) => [...host.querySelectorAll('button')].find(b => b.textContent === text)!;
async function click(text: string) { await act(async () => { button(text).click(); }); }
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  localStorage.clear(); localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...defaultData, notes: [note()] }));
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function open() {
  await act(async () => { root.render(createElement(CalculatorApp)); });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
  await click('edit fixture'); await click('メモ全体を再計算');
}
it('successful explicit save persists a record before closing and keeps unknown original fields', async () => {
  const original = { ...note(), future: { a: 'opaque' } };
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...defaultData, notes: [original] }));
  await open(); await click('保存する');
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!);
  expect(saved.notes[0].calculationEvidence.records).toHaveLength(1);
  expect(saved.notes[0].future).toEqual(original.future);
  expect(host.querySelector('.note-form')).toBeNull();
  expect(host.querySelector('.toast')?.textContent).toContain('更新しました');
});
it('quota failure does not publish new evidence through React state or later autosave', async () => {
  await open(); const before = localStorage.getItem(STORAGE_KEY);
  const set = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
  await click('保存する');
  expect(localStorage.getItem(STORAGE_KEY)).toBe(before);
  expect(host.querySelector('.note-form')).not.toBeNull();
  expect(host.textContent).toContain('保存済みとして扱っていません');
  expect(host.querySelector('.toast')?.textContent).not.toContain('更新しました');
  expect(set).toHaveBeenCalledTimes(1);
  set.mockRestore(); await click('キャンセル');
  expect(localStorage.getItem(STORAGE_KEY)).toBe(before);
});
it('foreign update before explicit save is not overwritten and draft remains open', async () => {
  await open();
  const foreign = JSON.stringify({ ...defaultData, notes: [{ ...note(), title: 'other tab' }] });
  localStorage.setItem(STORAGE_KEY, foreign);
  await click('保存する');
  expect(localStorage.getItem(STORAGE_KEY)).toBe(foreign);
  expect(host.querySelector('.note-form')).not.toBeNull();
  expect(host.textContent).toContain('競合');
});
it('foreign storage event freezes autosave rather than replacing new history', async () => {
  await open(); const foreign = JSON.stringify({ ...defaultData, notes: [{ ...note(), title: 'other tab' }] });
  localStorage.setItem(STORAGE_KEY, foreign);
  await act(async () => window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, newValue: foreign })));
  expect(host.textContent).toContain('保存待ち: 0件');
  await click('保存する'); expect(localStorage.getItem(STORAGE_KEY)).toBe(foreign); expect(host.textContent).toContain('保存保護中');
});
it('while waiting for the shared write lock, input and all modal close routes are disabled', async () => {
  await open(); let release!: () => void; let first = true;
  vi.stubGlobal('navigator', { locks: { request: (_name: string, operation: () => unknown) => { if (!first) return Promise.resolve(operation()); first = false; return new Promise(resolve => { release = () => resolve(operation()); }); } } });
  await act(async () => { button('保存する').click(); });
  expect(host.querySelector('fieldset')?.disabled).toBe(true);
  expect(host.querySelector<HTMLInputElement>('.note-form input')?.matches(':disabled')).toBe(true);
  const close = host.querySelector<HTMLButtonElement>('.modal-header button')!; expect(close.disabled).toBe(true);
  await act(async () => { button('キャンセル').click(); close.click(); document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
  expect(host.querySelector('.note-form')).not.toBeNull();
  await act(async () => { release(); });
  expect(host.querySelector('.note-form')).toBeNull();
  expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).notes[0].calculationEvidence.records).toHaveLength(1);
});
it('a write followed by readback failure is reported as uncertain and never blindly appended again', async () => {
  await open();
  const set = Storage.prototype.setItem; const get = Storage.prototype.getItem; let written = false;
  const writes = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) { set.call(this, key, value); written = true; });
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (this: Storage, key) { if (written) throw new Error('readback unavailable'); return get.call(this, key); });
  await act(async () => { button('保存する').click(); });
  expect(host.textContent).toContain('保存された可能性'); expect(host.querySelector('.note-form')).not.toBeNull();
  expect(JSON.parse(get.call(localStorage, STORAGE_KEY)!).notes[0].calculationEvidence.records).toHaveLength(1);
  await act(async () => { button('保存する').click(); }); expect(writes).toHaveBeenCalledTimes(1);
});
it('a rejected browser write lock stops autosave with a visible notice and no write', async () => {
  await open(); await click('キャンセル'); const raw = localStorage.getItem(STORAGE_KEY);
  vi.stubGlobal('navigator', { locks: { request: () => Promise.reject(new Error('lock denied')) } });
  await act(async () => { const select = host.querySelector<HTMLSelectElement>('.theme-select select')!; select.value = 'dark'; select.dispatchEvent(new Event('change', { bubbles: true })); });
  expect(host.textContent).toContain('保存用ロックを取得できず'); expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
});
it.each(['autosave', 'storage event', 'explicit save'])('a corrupted replacement enters non-destructive recovery rather than generic conflict: %s', async trigger => {
  await open(); if (trigger === 'autosave') await click('キャンセル');
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const malformed = '{ "notes": '; localStorage.setItem(STORAGE_KEY, malformed);
  await act(async () => {
    if (trigger === 'storage event') window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, newValue: malformed }));
    else if (trigger === 'explicit save') button('保存する').click();
    else { const select = host.querySelector<HTMLSelectElement>('.theme-select select')!; select.value = 'dark'; select.dispatchEvent(new Event('change', { bubbles: true })); }
  });
  expect(host.querySelector('.storage-recovery')?.textContent).toContain('保存データを読み込めませんでした');
  expect(host.querySelector('#calculator')?.hasAttribute('inert')).toBe(true);
  expect(localStorage.getItem(STORAGE_KEY)).toBe(malformed);
});
