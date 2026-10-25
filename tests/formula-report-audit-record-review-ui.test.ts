// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import { FormulaReportModal } from '../components/FormulaReportModal';
import { defaultData, STORAGE_KEY } from '../lib/storage';
import type { FormulaReport, RegisteredFormula } from '../lib/types';
const at = '2026-10-25T00:00:00.000Z';
const formula: RegisteredFormula = { id: 'f', title: '式', expression: 'x+1', createdAt: at, updatedAt: at };
const report: FormulaReport = { id: 'r', formulaId: 'f', title: '記録', body: '前文\n後文', createdAt: at, updatedAt: at, confirmedExpression: null };
let host: HTMLDivElement, root: Root, raw: string;
const save = vi.fn(), close = vi.fn();
const button = (name: string) => [...host.querySelectorAll('button')].find(n => n.textContent === name)!;
const click = async (name: string) => act(async () => { expect(button(name), name).toBeTruthy(); button(name).click(); });
const render = async (r = report) => act(async () => root.render(createElement(FormulaReportModal, { formulaId: 'f', formula, report: r, writable: true, onSave: save, onClose: close })));
const editor = () => host.querySelector<HTMLTextAreaElement>('#formula-report-body')!;
const prepare = async (checked = false) => { await click('Markdownを編集'); editor().setSelectionRange(3, 5); await click('根拠点検'); if (checked) await click('保存記録と照合'); await click('レポートへ挿入'); await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); }); };
beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  Object.defineProperty(globalThis.crypto, 'subtle', { configurable: true, value: webcrypto.subtle });
  HTMLElement.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1)); vi.stubGlobal('cancelAnimationFrame', vi.fn());
  localStorage.clear(); raw = JSON.stringify({ ...defaultData, formulaLibrary: { version: 1, selectedId: 'f', entries: [formula] }, formulaReports: { version: 1, entries: [report] } }); localStorage.setItem(STORAGE_KEY, raw);
  host = document.createElement('div'); document.body.append(host); root = createRoot(host); save.mockReset(); close.mockReset(); await render();
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('review: parent storage protection without browser notification invalidates held preview', async () => {
  await prepare(true);
  await act(async () => root.render(createElement(FormulaReportModal, { formulaId: 'f', formula, report, writable: true, savedContextUncertain: true, onSave: save, onClose: close })));
  expect(host.querySelector('#audit-record-markdown')).toBeNull();
});
it('review: changing target and returning cannot revive pending preview', async () => {
  let resolve!: (value: ArrayBuffer) => void;
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(() => new Promise(r => { resolve = r; }));
  await click('根拠点検'); await click('レポートへ挿入');
  await render({ ...report, id: 'other' }); await render(report);
  await act(async () => resolve(new ArrayBuffer(32)));
  expect(host.querySelector('#audit-record-markdown')).toBeNull(); expect(save).not.toHaveBeenCalled();
});
it('review: canceled and restarted digest cannot replace newer preview', async () => {
  const finish: ((value: ArrayBuffer) => void)[] = [];
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(() => new Promise(r => { finish.push(r); }));
  await click('根拠点検'); await click('レポートへ挿入'); await click('根拠点検を閉じる');
  await click('根拠点検'); await click('レポートへ挿入');
  await act(async () => finish[1](new ArrayBuffer(32)));
  const current = host.querySelector<HTMLTextAreaElement>('#audit-record-markdown')!.value;
  await act(async () => finish[0](new Uint8Array(32).fill(1).buffer));
  expect(host.querySelector<HTMLTextAreaElement>('#audit-record-markdown')!.value).toBe(current);
});
it('review: preparing stays focusable but repeated activation cannot start another digest', async () => {
  let resolve!: (value: ArrayBuffer) => void;
  const digest = vi.spyOn(crypto.subtle, 'digest').mockImplementation(() => new Promise(r => { resolve = r; }));
  await click('根拠点検'); await click('レポートへ挿入');
  expect(button('レポートへ挿入').disabled).toBe(false);
  expect(button('レポートへ挿入').getAttribute('aria-disabled')).toBe('true');
  expect(document.activeElement).toBe(button('レポートへ挿入'));
  await click('レポートへ挿入'); expect(digest).toHaveBeenCalledTimes(1);
  await act(async () => resolve(new ArrayBuffer(32)));
  await click('挿入をやめる'); expect(document.activeElement).toBe(button('レポートへ挿入'));
});
