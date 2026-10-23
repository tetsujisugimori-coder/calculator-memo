// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CalculatorApp } from '../components/CalculatorApp';
import { defaultData, STORAGE_KEY } from '../lib/storage';
import { formulaReportSignature, type FormulaReportSaveRequest } from '../lib/formula-reports';
import type { FormulaReport, FormulaReports } from '../lib/types';
let result: string | FormulaReport | undefined;
let request: FormulaReportSaveRequest;
vi.mock('../components/FormulaLibraryModal', () => ({ FormulaLibraryModal: ({ reports, onSaveReport }: { reports?: FormulaReports; onSaveReport: (value: FormulaReportSaveRequest) => Promise<string | FormulaReport> }) => createElement('div', null,
  createElement('button', { onClick: async () => { result = await onSaveReport(request); } }, 'save report fixture'),
  createElement('output', { 'data-reports': true }, JSON.stringify(reports ?? null))) }));
const formula = { id: 'f', title: 'same name', expression: 'a+1', createdAt: '2026-10-22', updatedAt: '2026-10-22' };
const original = { ...defaultData, future: { untouched: true }, formulaLibrary: { version: 1, entries: [formula], selectedId: 'f' }, formulaExecutions: [{ formulaId: 'f', expression: 'a+1', inputs: { a: '2' } }] };
let root: Root, host: HTMLDivElement;
const button = (label: string) => [...host.querySelectorAll('button')].find(item => item.textContent === label)!;
const stored = () => JSON.parse(localStorage.getItem(STORAGE_KEY)!);
async function save() { await act(async () => { button('save report fixture').click(); }); }
async function open() { await act(async () => root.render(createElement(CalculatorApp))); await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); }); await act(async () => button('登録式ライブラリ').click()); }
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  localStorage.clear(); localStorage.setItem(STORAGE_KEY, JSON.stringify(original));
  result = undefined; request = { id: 'r', formulaId: 'f', title: 'Explanation', body: 'User text', expectedReport: null, expectedExpression: 'a+1', confirm: false };
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it('persists exact text before publishing, does not auto-confirm, and retains all unrelated data', async () => {
  await open(); await save(); expect(typeof result).toBe('object'); expect(stored().formulaReports.entries[0]).toEqual(result);
  expect(stored().formulaReports.entries[0].confirmedExpression).toBeNull();
  const rest = stored(); delete rest.formulaReports; expect(rest).toEqual(original);
  expect(host.querySelector('output')?.textContent).toContain('User text');
  request = { ...request, expectedReport: formulaReportSignature(result as FormulaReport), confirm: true }; await save();
  expect(stored().formulaReports.entries[0].confirmedExpression).toBe('a+1');
});
it('quota failure keeps report out of React and autosave, allowing a safe explicit retry', async () => {
  await open(); const raw = localStorage.getItem(STORAGE_KEY); const writes = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
  await save(); expect(result).toContain('保存できません'); expect(localStorage.getItem(STORAGE_KEY)).toBe(raw); expect(host.querySelector('output')?.textContent).toBe('null'); expect(writes).toHaveBeenCalledTimes(1);
  writes.mockRestore(); await save(); expect(stored().formulaReports.entries).toHaveLength(1);
});
it.each(['expression', 'report', 'invalid'])('refuses external %s replacement without a storage event', async change => {
  await open(); const external = change === 'invalid' ? '{broken' : JSON.stringify({ ...original, ...(change === 'expression' ? { formulaLibrary: { ...original.formulaLibrary, entries: [{ ...formula, expression: 'a+2' }] } } : { formulaReports: { version: 1, entries: [{ id: 'remote', formulaId: 'f', title: 'Remote', body: 'other', createdAt: '2026-10-22', updatedAt: '2026-10-22', confirmedExpression: null }] } }) });
  vi.spyOn(console, 'error').mockImplementation(() => undefined); localStorage.setItem(STORAGE_KEY, external); request.confirm = true;
  await save(); expect(typeof result).toBe('string'); expect(localStorage.getItem(STORAGE_KEY)).toBe(external); expect(host.querySelector('output')?.textContent).toBe('null');
});
it('does not expose confirmed state while queued behind a lock, then checks changed destination', async () => {
  await open(); let release!: () => void;
  vi.stubGlobal('navigator', { locks: { request: (_name: string, operation: () => unknown) => new Promise(resolve => { release = () => resolve(operation()); }) } });
  request.confirm = true; await save(); expect(result).toBeUndefined(); expect(host.querySelector('output')?.textContent).toBe('null');
  const remote = JSON.stringify({ ...original, formulaLibrary: { ...original.formulaLibrary, entries: [{ ...formula, expression: 'a+9' }] } }); localStorage.setItem(STORAGE_KEY, remote);
  await act(async () => release()); expect(result).toContain('競合'); expect(localStorage.getItem(STORAGE_KEY)).toBe(remote);
});
it('readback uncertainty stops retry and never publishes confirmation in React', async () => {
  await open(); const get = Storage.prototype.getItem, set = Storage.prototype.setItem; let written = false;
  const writes = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) { set.call(this, key, value); written = true; });
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (this: Storage, key) { if (written) throw new Error('readback'); return get.call(this, key); });
  request.confirm = true; await save(); expect(result).toContain('保存された可能性'); expect(host.querySelector('output')?.textContent).toBe('null');
  await save(); expect(writes).toHaveBeenCalledTimes(1); expect(result).toContain('保存保護中');
});
it('a rejected lock leaves storage and report display unchanged', async () => {
  await open(); const raw = localStorage.getItem(STORAGE_KEY);
  vi.stubGlobal('navigator', { locks: { request: () => Promise.reject(new Error('lock denied')) } });
  await save(); expect(result).toBe('lock denied'); expect(localStorage.getItem(STORAGE_KEY)).toBe(raw); expect(host.querySelector('output')?.textContent).toBe('null');
});
it('a local state change during lock wait invalidates the candidate instead of merging stale confirmation', async () => {
  await open(); const raw = localStorage.getItem(STORAGE_KEY); const releases: Array<() => void> = [];
  vi.stubGlobal('navigator', { locks: { request: (_name: string, operation: () => unknown) => new Promise(resolve => { releases.push(() => resolve(operation())); }) } });
  request.confirm = true; await save();
  await act(async () => { const theme = host.querySelector<HTMLSelectElement>('.theme-select select')!; theme.value = 'dark'; theme.dispatchEvent(new Event('change', { bubbles: true })); });
  await act(async () => releases[0]()); expect(result).toContain('アプリ状態が変わりました'); expect(host.querySelector('output')?.textContent).toBe('null'); expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
  await act(async () => releases[1]()); expect(stored().formulaReports).toBeUndefined(); expect(stored().settings.theme).toBe('dark');
});

it('checks persisted evidence again inside the lock and never confirms a same-ID replacement', async () => {
  const { formulaDefinitionSignature, reportEvidenceSignature } = await import('../lib/formula-report-evidence');
  const now = '2026-10-23T00:00:00.000Z';
  const note = { id: 'evidence-memo', type: 'plain-calculation' as const, title: 'Saved', content: '', createdAt: now, updatedAt: now,
    calculationEvidence: { version: 1 as const, records: [{ id: 'evidence-record', calculatedAt: now, persistedAt: now, evaluator: 'calculator-memo-v1' as const, status: 'confirmed' as const,
      blocks: [{ blockId: 'a', position: 1, expression: '-0', inputs: [], result: '-0', resultText: '0', status: 'success' as const }] }] } };
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...original, notes: [note] }));
  await open(); let release!: () => void;
  vi.stubGlobal('navigator', { locks: { request: (_name: string, operation: () => unknown) => new Promise(resolve => { release = () => resolve(operation()); }) } });
  const links = [{ memoId: note.id, recordId: 'evidence-record' }];
  request = { ...request, confirm: true, links, expectedDefinition: formulaDefinitionSignature(formula), expectedEvidence: reportEvidenceSignature([note], links) };
  await save(); expect(result).toBeUndefined();
  const changed = structuredClone(note); changed.calculationEvidence.records[0].blocks[0].result = '1';
  const external = JSON.stringify({ ...original, notes: [changed] }); localStorage.setItem(STORAGE_KEY, external);
  await act(async () => release()); expect(result).toContain('競合');
  expect(localStorage.getItem(STORAGE_KEY)).toBe(external); expect(host.querySelector('output')?.textContent).toBe('null');
});
it('failed confirmation writes never publish appended confirmation history', async () => {
  await open(); request.confirm = true;
  const raw = localStorage.getItem(STORAGE_KEY);
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });
  await save(); expect(result).toContain('保存できません'); expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
  expect(host.querySelector('output')?.textContent).toBe('null');
});

it('unsupported evidence protects the loaded original and blocks all ordinary writes', async () => {
  const raw = JSON.stringify({ ...original, formulaReports: { version: 1, entries: [{
    id: 'r', formulaId: 'f', title: '説明', body: '原本', createdAt: '2026-10-23', updatedAt: '2026-10-23', confirmedExpression: null,
    evidence: { version: 1, links: [], confirmations: [], futureMeaning: { retain: true } },
  }] } });
  localStorage.setItem(STORAGE_KEY, raw);
  const writes = vi.spyOn(Storage.prototype, 'setItem');
  await act(async () => root.render(createElement(CalculatorApp)));
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
  expect(host.textContent).toContain('関連レポートを読み取れませんでした');
  expect(host.textContent).toContain('原本');
  await act(async () => button('登録式ライブラリ').click());
  await save(); expect(result).toContain('保存保護中');
  expect(writes).not.toHaveBeenCalled(); expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
});
