// @vitest-environment jsdom
import { act, createElement, useEffect, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { FormulaLibraryModal } from '../components/FormulaLibraryModal';
import { defaultData, STORAGE_KEY } from '../lib/storage';
import type { StoredData } from '../lib/types';

const date = '2026-10-23T04:00:00.000Z';
function fixture(): StoredData {
  return { ...defaultData,
    formulaLibrary: { version: 1, selectedId: 'formula', entries: [{ id: 'formula', title: '登録式', expression: 'x*2', createdAt: date, updatedAt: date }] },
    formulaReports: { version: 1, entries: [{ id: 'report', formulaId: 'formula', title: '説明', body: '保存本文', createdAt: date, updatedAt: date, confirmedExpression: 'x*2', evidence: { version: 1, links: [], confirmations: [{ id: 'confirmation', formulaId: 'formula', confirmedAt: date, definition: { version: 1, expression: 'x*2', variables: ['x'] }, title: '説明', body: '保存本文', links: [], evidenceSignature: '[]' }] } }] },
  };
}
let host: HTMLDivElement, root: Root, data: StoredData;
let setPending: (value: boolean) => void;
const changed = vi.fn(), execute = vi.fn();
function Harness() {
  const [pendingSave, updatePending] = useState(false);
  useEffect(() => { setPending = updatePending; }, []);
  return createElement(FormulaLibraryModal, { library: data.formulaLibrary!, reports: data.formulaReports, pendingSave, writable: true, onChange: changed, onExecute: execute, onClose: vi.fn() });
}
const raw = () => localStorage.getItem(STORAGE_KEY)!;
const listStatus = () => host.querySelector('[data-testid="formula-list-status"]')?.textContent;
const detail = () => host.querySelector('[aria-label="保存済み登録式の詳細"]')!;
const detailStatus = () => host.querySelector('[data-testid="formula-detail-assessment"]')?.textContent;
function button(text: string) { const found = [...host.querySelectorAll('button')].find(item => item.textContent === text); expect(found).toBeDefined(); return found!; }
const click = async (text: string) => act(async () => { button(text).click(); });
function notify() { window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY })); }
function externalUpdate() { const next = fixture(); next.formulaLibrary!.entries[0].expression = 'x*4'; localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); return raw(); }
function expectStale() { expect(listStatus()).toBe('根拠未照合'); expect(detailStatus()).toBe('根拠未照合（原本更新後）'); }
function expectChanged() { expect(listStatus()).toBe('要再確認'); expect(detailStatus()).toBe('要再確認・式変更あり'); expect(detail().textContent).toContain('x*4'); }
beforeEach(async () => {
  data = fixture(); localStorage.clear(); localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); changed.mockClear(); execute.mockClear();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  await act(async () => { root.render(createElement(Harness)); });
});
afterEach(async () => { await act(async () => { root.unmount(); }); host.remove(); vi.restoreAllMocks(); });

// This harness stresses pendingSave completion notifications, not the application's
// save algorithm: completing after an external update does not assert that a real
// conflicting write succeeded. App-level lock/expectedRaw tests cover that protection.
// External writes are fixture setup; every subsequent observation/refresh must be read-only.
it.each(['separate commits', 'event then completion in one batch', 'completion then event in one batch'] as const)('pending save preserves invalidation until explicit refresh: %s', async ordering => {
  await act(async () => { setPending(true); });
  const expectedRaw = externalUpdate();
  const read = vi.spyOn(Storage.prototype, 'getItem');
  const write = vi.spyOn(Storage.prototype, 'setItem');
  if (ordering === 'separate commits') {
    await act(async () => { notify(); }); expectStale();
    await act(async () => { setPending(false); });
  } else {
    await act(async () => { if (ordering === 'event then completion in one batch') { notify(); setPending(false); } else { setPending(false); notify(); } });
  }
  expectStale(); expect(read).not.toHaveBeenCalled();
  await click('保存済み詳細を再取得'); expectChanged();
  expect(write).not.toHaveBeenCalled(); expect(raw()).toBe(expectedRaw);
  expect(JSON.parse(raw()).formulaReports).toEqual(data.formulaReports); expect(changed).not.toHaveBeenCalled(); expect(execute).not.toHaveBeenCalled();
});

it.each(['保存済み一覧を再取得', '保存済み詳細を再取得'])('a notification before synchronous refresh is reconciled by its new snapshot: %s', async refresh => {
  const expectedRaw = externalUpdate(), write = vi.spyOn(Storage.prototype, 'setItem');
  await act(async () => { notify(); button(refresh).click(); });
  expectChanged(); expect(raw()).toBe(expectedRaw); expect(write).not.toHaveBeenCalled();
});
it.each(['same batch', 'separate commits'] as const)('a notification after refresh invalidates its previous snapshot: %s', async ordering => {
  const previous = raw();
  if (ordering === 'same batch') {
    await act(async () => { button('保存済み一覧を再取得').click(); externalUpdate(); notify(); });
  } else {
    await click('保存済み一覧を再取得'); externalUpdate();
    await act(async () => { notify(); });
  }
  expectStale(); expect(detail().textContent).toContain('x*2'); expect(detail().textContent).not.toContain('x*4');
  const expectedRaw = raw(), write = vi.spyOn(Storage.prototype, 'setItem'); expect(expectedRaw).not.toBe(previous);
  await click('保存済み詳細を再取得'); expectChanged(); expect(raw()).toBe(expectedRaw); expect(write).not.toHaveBeenCalled();
});

// Native storage notifications are queued tasks: they cannot interrupt synchronous
// loadData()/getItem(). Dispatching an event inside a getItem mock would create a
// re-entrant path unavailable to native browser storage events, not a real race.
// A queued notification, however, must still invalidate a completed refresh.
it('a notification queued during a synchronous read is processed after refresh and stays stale', async () => {
  const originalGetItem = Storage.prototype.getItem;
  let queued = false;
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (this: Storage, key: string) {
    const value = originalGetItem.call(this, key);
    if (key === STORAGE_KEY && !queued) { queued = true; queueMicrotask(notify); }
    return value;
  });
  // Microtasks run after this synchronous call too; this tests the ordering boundary,
  // not the actual browser task source or cross-tab delivery timing.
  await click('保存済み一覧を再取得'); expectStale();
  await click('保存済み一覧を再取得'); expect(listStatus()).toBe('確認済み'); expect(detailStatus()).toBe('確認済み・式一致');
});

it.each(['保存済み一覧を再取得', '保存済み詳細を再取得'])('failed read recovers only on manual retry with shared state and unchanged history: %s', async refresh => {
  const expectedRaw = raw(), write = vi.spyOn(Storage.prototype, 'setItem');
  const read = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('denied', 'SecurityError'); });
  vi.spyOn(console, 'error').mockImplementation(() => {});
  await click(refresh); expect(listStatus()).toBe('状態判定不能'); expect(detail().textContent).toContain('判定不能'); expect(detailStatus()).not.toBe('確認済み・式一致');
  const readCount = read.mock.calls.length;
  await act(async () => { notify(); }); expect(read).toHaveBeenCalledTimes(readCount); expect(listStatus()).toBe('状態判定不能');
  read.mockRestore();
  await act(async () => {}); expect(listStatus()).toBe('状態判定不能');
  await click(refresh); expect(listStatus()).toBe('確認済み'); expect(detailStatus()).toBe('確認済み・式一致');
  expect(write).not.toHaveBeenCalled(); expect(raw()).toBe(expectedRaw); expect(JSON.parse(raw()).formulaReports).toEqual(data.formulaReports);
  expect(changed).not.toHaveBeenCalled(); expect(execute).not.toHaveBeenCalled();
});
