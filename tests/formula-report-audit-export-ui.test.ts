// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import * as markdownReports from '../lib/markdown-report';
import { FormulaReportAudit } from '../components/FormulaReportAudit';
import { FormulaReportModal } from '../components/FormulaReportModal';
import { createTrackedDifferenceMarkdown } from '../lib/formula-report-diff-tracking';
import { buildQuoteDifferenceMarkdown } from '../lib/formula-report-diff';
import { createQuoteMarkdown, type QuoteSnapshot } from '../lib/formula-report-quotes';
import type { EvidenceRecord } from '../lib/calculation-evidence';
import type { FormulaReport, Memo, RegisteredFormula } from '../lib/types';
import type { FormulaReportSaveRequest } from '../lib/formula-reports';
import { defaultData, STORAGE_KEY } from '../lib/storage';

const at = '2026-10-24T00:00:00.000Z';
const before: EvidenceRecord = { id: 'original', evaluator: 'calculator-memo-v1', status: 'confirmed', calculatedAt: at, persistedAt: at,
  blocks: [{ blockId: 'b', position: 1, expression: '-0', inputs: [], result: '-0', resultText: '0', status: 'success' }] };
const after: EvidenceRecord = { ...structuredClone(before), id: 'target', blocks: [{ ...before.blocks[0], result: '0' }] };
const quote: QuoteSnapshot = { version: 1, quoteId: 'q1', formulaId: 'f', memoId: 'm', blockId: 'b', citedAt: at, record: before };
const links = [{ memoId: 'm', recordId: 'original' }, { memoId: 'm', recordId: 'target' }];
const notes = (records = [before, after]): Memo[] => [{ id: 'm', type: 'plain-calculation', title: 'メモ', content: '現在の未保存値999', createdAt: at, updatedAt: at,
  calculationEvidence: { version: 1, records: structuredClone(records) } }];
const visible = buildQuoteDifferenceMarkdown({ status: 'matched', reason: '', snapshot: quote, start: 0, end: 0 }, 'f', notes(), links, JSON.stringify(['m', 'target']));
const tracked = (id = 'difference1') => createTrackedDifferenceMarkdown(visible, quote, after, id, at);
const formula: RegisteredFormula = { id: 'f', title: '式', expression: 'x*2', createdAt: at, updatedAt: at };
const report = (body = tracked()): FormulaReport => ({ id: 'report', formulaId: 'f', title: '説明', body, createdAt: at, updatedAt: at, confirmedExpression: null,
  evidence: { version: 1, links, confirmations: [] } });
let host: HTMLDivElement, root: Root;
const refresh = vi.fn(), close = vi.fn();
const copy = vi.fn<(text: string) => Promise<void>>();
const save = vi.fn<(request: FormulaReportSaveRequest) => Promise<FormulaReport | string>>();
const button = (name: string) => [...host.querySelectorAll('button')].find(node => node.textContent === name)!;
const click = async (name: string) => act(async () => { expect(button(name), name).toBeTruthy(); button(name).click(); });
const seed = (r = report(), records = notes()) => { const raw = JSON.stringify({ ...defaultData, notes: records, formulaLibrary: { version: 1, selectedId: 'f', entries: [formula] }, formulaReports: { version: 1, entries: [r] } }); localStorage.setItem(STORAGE_KEY, raw); return raw; };
const renderEditor = async (r = report()) => act(async () => root.render(createElement(FormulaReportModal, { formulaId: r.formulaId, formula, report: r, writable: true, onClose: close, onSave: save })));
beforeEach(() => { HTMLElement.prototype.scrollIntoView = vi.fn(); localStorage.clear(); Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); host = document.createElement('div'); document.body.append(host); root = createRoot(host); refresh.mockReset(); close.mockReset(); save.mockReset(); copy.mockReset().mockResolvedValue(); Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: copy } }); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.useRealTimers(); vi.restoreAllMocks(); });

const navigate = vi.fn();
const audit = async (body = `${createQuoteMarkdown(quote)}\n\n${tracked()}`, key = 'one') => act(async () => root.render(createElement(FormulaReportAudit, { key, body, formulaId: 'f', formulaTitle: '登録式タイトル', reportId: 'report', reportTitle: '説明', editing: true, onNavigate: navigate })));
const openAudit = async () => click('根拠点検');
const auditRegion = () => host.querySelector('[aria-label="本文順の根拠一覧"]')!;
const copied = () => copy.mock.calls.at(-1)![0];
const exportCopy = async () => click('点検結果をコピー');
const exportFile = async () => click('点検結果を.md出力');
const setFilter = async (value: string) => act(async () => { const select = host.querySelector('.report-audit select')! as HTMLSelectElement; select.value = value; select.dispatchEvent(new Event('change', { bubbles: true })); });

it('exports the exact all-item assessment despite an empty review filter without reading or writing originals', async () => {
  const raw = seed(); await audit(); await openAudit(); await click('保存記録と照合'); await setFilter('review');
  expect(auditRegion().children.length).toBe(0);
  const read = vi.spyOn(Storage.prototype, 'getItem'), write = vi.spyOn(Storage.prototype, 'setItem');
  await exportCopy();
  expect(copied()).toContain('固定引用'); expect(copied()).toContain('比較差分'); expect(copied()).toContain('q1'); expect(copied()).toContain('difference1');
  expect(copied()).toContain('保存記録と一致'); expect(copied()).toContain('登録式タイトル'); expect(copied()).toContain('説明');
  expect(copied()).not.toContain('calculator-memo-evidence-v1');
  expect(read).not.toHaveBeenCalled(); expect(write).not.toHaveBeenCalled(); expect(save).not.toHaveBeenCalled();
  read.mockRestore(); expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
  expect(host.textContent).toContain('点検結果をコピーしました');
});
it('copy and file export use the same full generator and distinguish output from original observation time', async () => {
  seed(); vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-25T01:00:00Z'));
  await audit(); await openAudit(); await click('保存記録と照合');
  vi.setSystemTime(new Date('2026-10-25T02:00:00Z'));
  const download = vi.spyOn(markdownReports, 'downloadMarkdownReport').mockImplementation(() => {});
  await exportCopy(); await exportFile();
  expect(download.mock.calls[0][0].markdown).toBe(copied());
  expect(copied()).toContain('2026-10-25T01:00:00.000Z'); expect(copied()).toContain('2026-10-25T02:00:00.000Z');
  expect(download.mock.calls[0][0].filename).toMatch(/\.md$/);
  expect(host.textContent).toContain('保存完了はブラウザで確認'); vi.useRealTimers();
});
it('unverified and stale exports never reuse successful source judgments or old observation timestamps', async () => {
  seed(); await audit(); await openAudit(); await exportCopy(); expect(copied()).toContain('未照合'); expect(copied()).not.toContain('保存記録と一致');
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-25T01:00:00Z'));
  await click('保存記録と照合'); vi.setSystemTime(new Date('2026-10-25T02:00:00Z'));
  await act(async () => window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, newValue: 'changed' })));
  await exportCopy(); expect(copied()).toContain('失効'); expect(copied()).not.toContain('保存記録と一致'); expect(copied()).not.toContain('2026-10-25T01:00:00.000Z'); vi.useRealTimers();
});
it('synchronous storage invalidation before the React render also downgrades a click', async () => {
  seed(); await audit(); await openAudit(); await click('保存記録と照合');
  await act(async () => { window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, newValue: 'new' })); button('点検結果をコピー').click(); });
  expect(copied()).toContain('失効'); expect(copied()).not.toContain('保存記録と一致');
});
it.each(['clipboard', 'download'])('failed %s export offers inert complete manual text and never reports success', async kind => {
  const raw = seed(); await audit(); await openAudit();
  if (kind === 'clipboard') copy.mockRejectedValue(new Error('<img onerror="bad()"> denied'));
  else vi.spyOn(markdownReports, 'downloadMarkdownReport').mockImplementation(() => { throw new Error('download failed'); });
  await (kind === 'clipboard' ? exportCopy() : exportFile());
  const manual = host.querySelector<HTMLTextAreaElement>('.report-audit textarea')!;
  expect(manual.labels?.length).toBe(1); expect(manual.labels?.[0].textContent).toBe("点検結果Markdown全文（手動コピー用）");
  expect(manual.readOnly).toBe(true); expect(manual.value).toContain('q1'); expect(manual.value).toContain('difference1');
  expect(host.querySelector('img')).toBeNull(); expect(host.querySelector('.report-audit [role="alert"]')).not.toBeNull();
  expect(host.textContent).not.toContain('点検結果をコピーしました'); expect(host.textContent).not.toContain('ダウンロードを要求しました');
  expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
});
it.each(['close', 'refresh', 'storage', 'switch'])('late clipboard success or failure cannot restore a notice or manual text after %s', async change => {
  let finish!: (value?: unknown) => void;
  copy.mockImplementation(() => new Promise<void>((resolve, reject) => { finish = () => change === 'refresh' ? reject(new Error('late failure')) : resolve(); }));
  seed(); await audit(); await openAudit(); await exportCopy();
  expect(button('点検結果をコピー').disabled).toBe(true);
  if (change === 'close') { await click('根拠点検を閉じる'); await openAudit(); }
  if (change === 'refresh') await click('保存記録と照合');
  if (change === 'storage') await act(async () => window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, newValue: 'new' })));
  if (change === 'switch') { await audit('new body', 'new-report'); await openAudit(); }
  await act(async () => finish());
  expect(host.textContent).not.toContain('点検結果をコピーしました'); expect(host.textContent).not.toContain('late failure');
  expect(host.querySelector('.report-audit textarea')).toBeNull(); expect(button('点検結果をコピー').disabled).toBe(false);
});
it('repeated copy clicks while pending do not queue another write', async () => {
  let finish!: () => void; copy.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
  seed(); await audit(); await openAudit();
  await act(async () => { button('点検結果をコピー').click(); button('点検結果をコピー').click(); });
  expect(copy).toHaveBeenCalledTimes(1); await act(async () => finish());
});
it('report identity/title edits remount the audit and invalidate pending completion without saving', async () => {
  let finish!: () => void; copy.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
  const raw = seed(); await renderEditor(); await openAudit(); await click('保存記録と照合'); await exportCopy();
  // Parent prop generation changes model a same-tab saved original notification.
  await act(async () => root.render(createElement(FormulaReportModal, { formulaId: 'f', formula, report: report(), originalGeneration: 'saved-new', writable: true, onClose: close, onSave: save })));
  await openAudit(); await act(async () => finish());
  expect(host.textContent).not.toContain('点検結果をコピーしました'); expect(auditRegion().textContent).not.toContain('保存記録と一致');
  expect(localStorage.getItem(STORAGE_KEY)).toBe(raw); expect(save).not.toHaveBeenCalled();
});

it.each(['changed', 'deleted'])('independent regression: exports the frozen opened body with a saved-context warning after the same report is %s', async change => {
  const initial = report(); seed(initial); await renderEditor(initial);
  const updated = { ...initial, body: 'REPLACED SAVED BODY', updatedAt: '2026-10-25T01:00:00Z' };
  const raw = change === 'changed' ? seed(updated) : JSON.stringify({ ...defaultData, notes: notes(), formulaLibrary: { version: 1, selectedId: 'f', entries: [formula] }, formulaReports: { version: 1, entries: [] } });
  localStorage.setItem(STORAGE_KEY, raw);
  await act(async () => root.render(createElement(FormulaReportModal, { formulaId: 'f', formula, report: change === 'changed' ? updated : undefined, writable: true, onClose: close, onSave: save })));
  await openAudit(); await exportCopy();
  expect(copied()).toContain('difference1');
  expect(copied()).toContain('画面に保持している本文');
  expect(copied()).toContain('現在の保存本文との一致は未確認');
  expect(copied()).toContain('現在の保存済み本文とは断定しません');
  expect(copied()).toContain('未照合');
  await click('保存記録と照合'); await exportCopy();
  // Reacquiring source records cannot silently turn the frozen editor body into
  // the current saved report; the warning must survive explicit comparison.
  expect(copied()).toContain('difference1');
  expect(copied()).toContain('現在の保存本文との一致は未確認');
  expect(copied()).toContain('現在の保存済み本文とは断定しません');
  expect(localStorage.getItem(STORAGE_KEY)).toBe(raw); expect(save).not.toHaveBeenCalled();
});

it.each(['resolve', 'reject'])('parent protection without a storage event invalidates delayed clipboard %s', async outcome => {
  seed();
  const render = (savedContextChanged: boolean) => act(async () => root.render(createElement(FormulaReportAudit, { body: tracked(), formulaId: 'f', editing: false, savedContextChanged, onNavigate: navigate })));
  await render(false); await openAudit();
  let settle!: () => void;
  copy.mockImplementationOnce(() => new Promise<void>((resolve, reject) => { settle = outcome === 'resolve' ? resolve : () => reject(new Error('late failure')); }));
  await exportCopy();
  await render(true);
  await act(async () => settle());
  expect(host.textContent).not.toContain('点検結果をコピーしました');
  expect(host.querySelector('#audit-export-manual-copy')).toBeNull();
  expect(button('点検結果をコピー').disabled).toBe(false);
  await exportCopy(); expect(copied()).toContain('現在の保存本文との一致は未確認');
});
