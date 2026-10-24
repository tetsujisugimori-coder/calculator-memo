// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { FormulaQuoteComparison, type QuoteSource } from '../components/FormulaQuoteComparison';
import { FormulaQuoteStatus } from '../components/FormulaReportQuotes';
import { FormulaReportModal } from '../components/FormulaReportModal';
import { createQuoteMarkdown, readQuoteAssessments, type QuoteSnapshot } from '../lib/formula-report-quotes';
import type { EvidenceRecord } from '../lib/calculation-evidence';
import type { FormulaReport, Memo, RegisteredFormula } from '../lib/types';
import { defaultData, STORAGE_KEY } from '../lib/storage';

const at = '2026-10-24T00:00:00.000Z';
const original: EvidenceRecord = { id: 'original', evaluator: 'calculator-memo-v1', status: 'confirmed', calculatedAt: at, persistedAt: at, blocks: [
  { blockId: 'b', position: 1, expression: '-0', inputs: [], result: '-0', resultText: '0', status: 'success' },
] };
const snapshot: QuoteSnapshot = { version: 1, quoteId: 'q1', formulaId: 'f', memoId: 'm', blockId: 'b', citedAt: at, record: original };
const body = createQuoteMarkdown(snapshot);
const target: EvidenceRecord = { ...structuredClone(original), id: 'target', blocks: [{ ...original.blocks[0], result: '0' }] };
const notes = (): Memo[] => [{ id: 'm', type: 'plain-calculation', title: 'メモ', content: '現在のドラフト999', createdAt: at, updatedAt: at, calculationEvidence: { version: 1, records: [structuredClone(original), structuredClone(target)] } }];
const links = [{ memoId: 'm', recordId: 'original' }, { memoId: 'm', recordId: 'target' }];
const targetKey = JSON.stringify(['m', 'target']);
let host: HTMLDivElement, root: Root;
const closed = vi.fn(), refreshed = vi.fn();
const button = (name: string) => [...host.querySelectorAll('button')].find(item => item.textContent === name)!;
const click = async (name: string) => act(async () => { expect(button(name), name).toBeTruthy(); button(name).click(); });
const field = () => host.querySelector<HTMLSelectElement>('select[aria-label="比較先の保存記録"]')!;
const differences = () => host.querySelector('[aria-label="引用時と比較先の差分"]');
const choose = async (value = targetKey) => act(async () => { field().value = value; field().dispatchEvent(new Event('change', { bubbles: true })); });
const render = async (source: QuoteSource, text = body, quote = readQuoteAssessments(text, 'f', source.notes)[0]) => act(async () => root.render(createElement(FormulaQuoteComparison, { quote, formulaId: 'f', body: text, links, source, onRefresh: refreshed, onClose: closed })));
beforeEach(() => { localStorage.clear(); Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); host = document.createElement('div'); document.body.append(host); root = createRoot(host); closed.mockReset(); refreshed.mockReset(); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); });

it('starts with no automatic selection and displays signed internal-only differences after choice', async () => {
  await render({ notes: notes(), fetchedAt: at }); expect(field().value).toBe(''); expect(differences()).toBeNull();
  expect([...field().options].map(option => option.value)).toEqual(['', targetKey]); await choose();
  expect(differences()!.textContent).toContain('変更 1'); expect(differences()!.textContent).toContain('内部結果');
  expect(host.textContent).toContain('再計算・保存・確認履歴の追加は行いません'); expect(host.textContent).not.toContain('現在のドラフト999');
});
it('announces edited quote text while still using the frozen saved snapshot', async () => {
  await render({ notes: notes(), fetchedAt: at }, body.replace('当時の内部結果：-0', '当時の内部結果：999')); await choose();
  expect(host.textContent).toContain('編集後の文章そのものではありません'); expect(differences()!.textContent).toContain('-0');
});
it.each(['missing', 'changed'])('can compare when original source is %s', async state => {
  const source = notes(); if (source[0].type !== 'plain-calculation') throw new Error('fixture');
  if (state === 'missing') source[0].calculationEvidence!.records.shift(); else source[0].calculationEvidence!.records[0].blocks[0].result = '999';
  await render({ notes: source, fetchedAt: at }); await choose(); expect(differences()!.textContent).toContain('変更 1');
  expect(host.querySelector('[aria-label="引用時の記録"]')!.textContent).not.toContain('999');
});
it('shows a missing target distinctly and never substitutes another record', async () => {
  const source = notes(); if (source[0].type !== 'plain-calculation') throw new Error('fixture'); source[0].calculationEvidence!.records.pop();
  await render({ notes: source, fetchedAt: at }); await choose(); expect(differences()).toBeNull();
  expect(host.querySelector('[role="alert"]')!.textContent).toContain('保存記録が欠落'); expect(field().selectedOptions[0].textContent).toContain('欠落');
});
it.each([{ error: 'read denied' }, { stale: true }])('invalidates old differences and disables selection for unavailable source %j', async availability => {
  const source = { notes: notes(), fetchedAt: at }; await render(source); await choose(); expect(differences()).not.toBeNull();
  await render({ ...source, ...availability }); expect(differences()).toBeNull(); expect(field().disabled).toBe(true);
  expect(host.querySelector('[role="alert"]')!.textContent).toContain('error' in availability ? '欠落とは断定しません' : '明示再取得');
  await render(source); expect(field().value).toBe(''); expect(differences()).toBeNull();
});
it.each(['notes', 'timestamp', 'body'])('invalidates selected target immediately when %s changes', async change => {
  const source = { notes: notes(), fetchedAt: at }; await render(source); await choose();
  await render(change === 'notes' ? { ...source, notes: notes() } : change === 'timestamp' ? { ...source, fetchedAt: '2026-10-24T01:00:00.000Z' } : source, change === 'body' ? `${body}\n追記` : body);
  expect(field().value).toBe(''); expect(differences()).toBeNull();
  await render(source); expect(field().value).toBe(''); expect(differences()).toBeNull();
  expect(host.textContent).toContain('比較先の選択を解除しました');
  await choose(); expect(host.textContent).not.toContain('比較先の選択を解除しました');
});
it('clears a selected comparison before requesting explicit refresh even if callback has not returned new data', async () => {
  await render({ notes: notes(), fetchedAt: at }); await choose(); await click('比較用の保存原本を再取得');
  expect(refreshed).toHaveBeenCalledOnce(); expect(field().value).toBe(''); expect(differences()).toBeNull();
});
it('switching quote identity clears the old target even in the same multi-quote body', async () => {
  const second = { ...snapshot, quoteId: 'q2' }; const text = `${body}\n\n${createQuoteMarkdown(second)}`;
  const source = { notes: notes(), fetchedAt: at }; const quotes = readQuoteAssessments(text, 'f', source.notes);
  await render(source, text, quotes[0]); await choose(); await render(source, text, quotes[1]);
  expect(field().value).toBe(''); expect(differences()).toBeNull();
});
it.each(['future', 'mismatch', 'duplicate'])('blocks unsafe %s quote comparison', async kind => {
  const text = kind === 'future' ? body.replace('calculator-memo-evidence-v1', 'calculator-memo-evidence-v2') : kind === 'duplicate' ? `${body}\n\n${body}` : body;
  const source = { notes: notes(), fetchedAt: at }; const quote = readQuoteAssessments(text, kind === 'mismatch' ? 'other-formula' : 'f', source.notes)[0];
  await render(source, text, quote); expect(field().disabled).toBe(true); expect(differences()).toBeNull(); expect(host.querySelector('[role="alert"]')).not.toBeNull();
});
it('closing via Escape restores focus to the exact opener and removes differences', async () => {
  await act(async () => root.render(createElement(FormulaQuoteStatus, { body, formulaId: 'f', links, source: { notes: notes(), fetchedAt: at } })));
  const opener = button('別の保存記録と比較'); opener.focus(); await click('別の保存記録と比較'); await choose();
  await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  expect(differences()).toBeNull(); expect(document.activeElement).toBe(opener); expect(host.querySelector('[role="dialog"]')).toBeNull();
});
it('editor comparison and refresh leave draft, raw storage and confirmation history unchanged', async () => {
  const formula: RegisteredFormula = { id: 'f', title: '式', expression: 'x*2', createdAt: at, updatedAt: at };
  const report: FormulaReport = { id: 'report', formulaId: 'f', title: '説明', body, createdAt: at, updatedAt: at, confirmedExpression: null, evidence: { version: 1, links, confirmations: [] } };
  const raw = JSON.stringify({ ...defaultData, notes: notes(), formulaLibrary: { version: 1, selectedId: 'f', entries: [formula] }, formulaReports: { version: 1, entries: [report] } }); localStorage.setItem(STORAGE_KEY, raw);
  const save = vi.fn(); await act(async () => root.render(createElement(FormulaReportModal, { formulaId: 'f', formula, report, writable: true, onSave: save, onClose: closed })));
  await click('Markdownを編集'); const editor = host.querySelector<HTMLTextAreaElement>('#formula-report-body')!;
  const draft = `${body}\n未保存の追記`;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(editor, draft); editor.dispatchEvent(new Event('input', { bubbles: true })); });
  await click('別の保存記録と比較'); await choose(); expect(differences()).not.toBeNull(); await click('比較用の保存原本を再取得');
  expect(differences()).toBeNull(); await click('比較表示を閉じる'); expect(editor.value).toBe(draft); expect(localStorage.getItem(STORAGE_KEY)).toBe(raw); expect(save).not.toHaveBeenCalled(); expect(JSON.parse(raw).formulaReports.entries[0].evidence.confirmations).toEqual([]);
});
