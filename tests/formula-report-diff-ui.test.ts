// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { FormulaReportModal } from '../components/FormulaReportModal';
import { createQuoteMarkdown, readQuoteAssessments, type QuoteSnapshot } from '../lib/formula-report-quotes';
import type { FormulaReportSaveRequest } from '../lib/formula-reports';
import type { EvidenceRecord } from '../lib/calculation-evidence';
import type { FormulaReport, Memo, RegisteredFormula } from '../lib/types';
import { defaultData, STORAGE_KEY } from '../lib/storage';
import * as download from '../lib/markdown-report';

const at = '2026-10-24T00:00:00.000Z';
const formula: RegisteredFormula = { id: 'f', title: '式', expression: 'x*2', createdAt: at, updatedAt: at };
const original: EvidenceRecord = { id: 'original', evaluator: 'calculator-memo-v1', status: 'confirmed', calculatedAt: at, persistedAt: at, blocks: [
  { blockId: 'b', position: 1, expression: '-0', inputs: [], result: '-0', resultText: '0', status: 'success' },
] };
const snapshot: QuoteSnapshot = { version: 1, quoteId: 'q1', formulaId: 'f', memoId: 'm', blockId: 'b', citedAt: at, record: original };
const quote = createQuoteMarkdown(snapshot);
const body = `前文\n選択した本文\n後文\n\n${quote}`;
const target: EvidenceRecord = { ...structuredClone(original), id: 'target', blocks: [{ ...original.blocks[0], result: '0' }] };
const notes = (): Memo[] => [{ id: 'm', type: 'plain-calculation', title: 'メモ', content: '未保存の現在値999', createdAt: at, updatedAt: at, calculationEvidence: { version: 1, records: [structuredClone(original), structuredClone(target)] } }];
const links = [{ memoId: 'm', recordId: 'original' }, { memoId: 'm', recordId: 'target' }];
const report: FormulaReport = { id: 'report', formulaId: 'f', title: '説明', body, createdAt: at, updatedAt: at, confirmedExpression: null, evidence: { version: 1, links, confirmations: [] } };
const targetKey = JSON.stringify(['m', 'target']);
let host: HTMLDivElement, root: Root;
const closed = vi.fn();
const saved = vi.fn<(request: FormulaReportSaveRequest) => Promise<FormulaReport | string>>();
const button = (name: string) => [...host.querySelectorAll('button')].find(item => item.textContent === name)!;
const click = async (name: string) => act(async () => { expect(button(name), name).toBeTruthy(); button(name).click(); });
const editor = () => host.querySelector<HTMLTextAreaElement>('#formula-report-body')!;
const preview = () => host.querySelector('[aria-label="差分の挿入前プレビュー"]');
const field = () => host.querySelector<HTMLSelectElement>('select[aria-label="比較先の保存記録"]')!;
const choose = async (value = targetKey) => act(async () => { field().value = value; field().dispatchEvent(new Event('change', { bubbles: true })); });
const seed = (r = report, otherReports: FormulaReport[] = [], records = notes()) => { const raw = JSON.stringify({ ...defaultData, notes: records, formulaLibrary: { version: 1, selectedId: 'f', entries: [formula] }, formulaReports: { version: 1, entries: [r, ...otherReports] } }); localStorage.setItem(STORAGE_KEY, raw); return raw; };
const render = async (r = report, writable = true) => act(async () => root.render(createElement(FormulaReportModal, { formulaId: r.formulaId, formula, report: r, writable, onClose: closed, onSave: saved })));
const edit = async (value: string) => act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(editor(), value); editor().dispatchEvent(new Event('input', { bubbles: true })); });
const open = async (r = report) => { await render(r); await click('Markdownを編集'); editor().setSelectionRange(3, 9); };
const prepare = async () => { await click('別の保存記録と比較'); await choose(); await click('差分をレポートに挿入'); };
const insert = async () => { await prepare(); expect(preview()).not.toBeNull(); await click('この差分を本文へ挿入'); };
beforeEach(() => { localStorage.clear(); Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); host = document.createElement('div'); document.body.append(host); root = createRoot(host); saved.mockReset(); closed.mockReset(); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); });

it('requires preview and explicit insertion, showing identities without writing body or storage', async () => {
  const raw = seed(); await open(); await prepare();
  expect(preview()!.textContent).toContain('original'); expect(preview()!.textContent).toContain('target');
  expect(preview()!.textContent).toContain('-0'); expect(host.textContent).toContain('レポートID：report');
  expect(host.textContent).toContain('保存と確認は別操作'); expect(editor().value).toBe(body);
  expect(localStorage.getItem(STORAGE_KEY)).toBe(raw); expect(saved).not.toHaveBeenCalled();
  await click('差分挿入をキャンセル'); expect(preview()).toBeNull(); expect(editor().value).toBe(body); expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
});
it('inserts at the selection start, preserves selected text and every quote byte, and supports exact undo', async () => {
  const raw = seed(); await open(); await insert(); const after = editor().value;
  expect(after.startsWith('前文\n')).toBe(true); expect(after.endsWith(body.slice(3))).toBe(true); expect(after).toContain(quote);
  expect(readQuoteAssessments(after, 'f', notes()).map(item => item.snapshot)).toEqual([snapshot]);
  expect(readQuoteAssessments(after, 'f', notes())[0].status).toBe('matched'); expect(localStorage.getItem(STORAGE_KEY)).toBe(raw); expect(saved).not.toHaveBeenCalled();
  expect(button('直前の引用を取り消す').disabled).toBe(true); expect(button('直前のテンプレート追加を取り消す').disabled).toBe(true);
  await click('直前の差分挿入を取り消す'); expect(editor().value).toBe(body); expect(button('直前の差分挿入を取り消す').disabled).toBe(true); expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
});
it('manual editing invalidates dedicated undo without deleting any subsequent changes', async () => {
  seed(); await open(); await insert(); const edited = `${editor().value}\n利用者の追加説明`;
  await edit(edited); expect(button('直前の差分挿入を取り消す').disabled).toBe(true); await click('直前の差分挿入を取り消す'); expect(editor().value).toBe(edited);
});
it('a new insertion replaces only the dedicated undo baseline', async () => {
  const raw = seed(); await open(); await insert(); const first = editor().value;
  editor().setSelectionRange(first.length, first.length); await insert(); expect(editor().value.length).toBeGreaterThan(first.length);
  await click('直前の差分挿入を取り消す'); expect(editor().value).toBe(first); expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
});
it('successful explicit save invalidates undo, while confirmation remains an explicit separate request', async () => {
  seed(); saved.mockImplementation(async request => ({ ...report, body: request.body })); await open(); await insert(); const after = editor().value;
  await click('レポートを保存'); expect(saved).toHaveBeenCalledWith(expect.objectContaining({ body: after, confirm: false })); expect(button('直前の差分挿入を取り消す').disabled).toBe(true); expect(editor().value).toBe(after);
});
it('failed save preserves the inserted draft and original storage/confirmation history', async () => {
  const raw = seed(); saved.mockResolvedValue('保存・読戻しに失敗しました'); await open(); await insert(); const after = editor().value;
  await click('レポートを保存'); expect(saved).toHaveBeenCalledWith(expect.objectContaining({ body: after, confirm: false })); expect(editor().value).toBe(after); expect(host.textContent).toContain('保存・読戻しに失敗しました'); expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
});
it.each(['selection', 'refresh', 'body', 'report'])('invalidates prepared content after %s changes', async change => {
  seed(); await open(); await prepare(); expect(preview()).not.toBeNull();
  if (change === 'selection') await choose('');
  else if (change === 'refresh') await click('比較用の保存原本を再取得');
  else if (change === 'body') await edit(`${body}\n未保存追記`);
  else await render({ ...report, id: 'another-report' });
  expect(preview()).toBeNull(); expect(button('この差分を本文へ挿入')).toBeUndefined(); expect(saved).not.toHaveBeenCalled();
});
it('storage events invalidate preview and require fresh explicit target selection', async () => {
  const raw = seed(); await open(); await prepare();
  await act(async () => window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, newValue: raw + ' ' })));
  expect(preview()).toBeNull(); expect(field().disabled).toBe(true); expect(editor().value).toBe(body);
  await click('比較用の保存原本を再取得'); expect(field().value).toBe(''); expect(preview()).toBeNull(); expect(button('差分をレポートに挿入').disabled).toBe(true); expect(saved).not.toHaveBeenCalled();
});
it.each(['changed', 'broken'])('rechecks raw storage at insertion and rejects an unnotified %s source', async state => {
  seed(); await open(); await prepare(); if (state === 'broken') vi.spyOn(console, 'error').mockImplementation(() => {});
  const nextRaw = state === 'broken' ? '{broken' : JSON.stringify({ ...defaultData, notes: [] }); localStorage.setItem(STORAGE_KEY, nextRaw);
  await click('この差分を本文へ挿入'); expect(editor().value).toBe(body); expect(preview()).toBeNull(); expect(localStorage.getItem(STORAGE_KEY)).toBe(nextRaw); expect(saved).not.toHaveBeenCalled();
});
it('failed explicit refresh keeps draft intact and does not reuse an earlier preview after recovery', async () => {
  seed(); await open(); const draft = `${body}\n保存していない説明`; await edit(draft); editor().setSelectionRange(draft.length, draft.length); await prepare();
  vi.spyOn(console, 'error').mockImplementation(() => {}); localStorage.setItem(STORAGE_KEY, '{broken'); await click('比較用の保存原本を再取得');
  expect(preview()).toBeNull(); expect(editor().value).toBe(draft); expect(field().disabled).toBe(true);
  seed(); await click('比較用の保存原本を再取得'); expect(field().value).toBe(''); expect(preview()).toBeNull(); expect(editor().value).toBe(draft);
});
it('copy and Markdown download contain the exact inserted draft, preserving fixed quote metadata', async () => {
  const raw = seed(); const copy = vi.fn().mockResolvedValue(undefined); Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: copy } }); const output = vi.spyOn(download, 'downloadMarkdownReport').mockImplementation(() => {});
  await open(); await insert(); const after = editor().value; await click('レポート本文をコピー'); await click('レポート.mdをダウンロード');
  expect(copy).toHaveBeenCalledWith(after); expect(output).toHaveBeenCalledWith(expect.objectContaining({ markdown: after })); expect(readQuoteAssessments(after, 'f', notes())[0].snapshot).toEqual(snapshot); expect(localStorage.getItem(STORAGE_KEY)).toBe(raw); expect(saved).not.toHaveBeenCalled();
});
it.each(['missing', 'changed'])('uses the frozen snapshot despite the original saved record being %s', async state => {
  const records = notes(); if (records[0].type !== 'plain-calculation') throw new Error('fixture');
  if (state === 'missing') records[0].calculationEvidence!.records.shift(); else records[0].calculationEvidence!.records[0].blocks[0].result = '999';
  const raw = seed(report, [], records); await open(); await insert(); expect(editor().value).toContain(quote); expect(editor().value).not.toContain('999'); expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
});
it.each(['code', 'math', 'quote-gap'])('refuses an insertion position inside %s without altering the original draft', async location => {
  const r = location === 'code' ? { ...report, body: `\`\`\`text\nprotected\n\`\`\`\n\n${body}` } : location === 'math' ? { ...report, body: `$$\nprotected\n$$\n\n${body}` } : report;
  const raw = seed(r); await open(r);
  const position = location === 'quote-gap' ? r.body.indexOf('```calculator-memo-evidence-v1') : r.body.indexOf('protected') + 2;
  editor().setSelectionRange(position, position); await prepare(); expect(preview()).toBeNull(); expect(editor().value).toBe(r.body); expect(localStorage.getItem(STORAGE_KEY)).toBe(raw); expect(saved).not.toHaveBeenCalled();
});
it('rejects character-limit overflow before insertion without truncating the draft', async () => {
  const r = { ...report, body: body + '\n' + '文'.repeat(100_000 - body.length - 1) }; const raw = seed(r); await open(r); await prepare();
  expect(preview()).toBeNull(); expect(editor().value).toBe(r.body); expect(localStorage.getItem(STORAGE_KEY)).toBe(raw); expect(saved).not.toHaveBeenCalled();
});
it('rejects aggregate report capacity overflow without trimming another report or history', async () => {
  const others = Array.from({ length: 3 }, (_, index): FormulaReport => ({ ...report, id: `other-${index}`, formulaId: `other-formula-${index}`, body: '文'.repeat(100_000), evidence: { version: 1, links: [], confirmations: [] } }));
  // Keep the original valid payload just under 1 MB; inserting even a short factual diff exceeds it.
  const base = JSON.stringify({ version: 1, entries: [report, ...others] });
  const margin = 1_000_000 - new TextEncoder().encode(base).length - 300;
  others.push({ ...report, id: 'padding', formulaId: 'padding-formula', body: 'x'.repeat(Math.max(0, margin - 400)), evidence: { version: 1, links: [], confirmations: [] } });
  const raw = seed(report, others); await open(); await prepare(); expect(preview()).toBeNull(); expect(editor().value).toBe(body); expect(localStorage.getItem(STORAGE_KEY)).toBe(raw); expect(saved).not.toHaveBeenCalled();
});
it('Escape dismisses only the preview and restores its trigger before comparison closes', async () => {
  seed(); await open(); await click('別の保存記録と比較'); await choose(); const trigger = button('差分をレポートに挿入'); trigger.focus(); await click('差分をレポートに挿入');
  await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  expect(preview()).toBeNull(); expect(field()).not.toBeNull(); expect(document.activeElement).toBe(trigger); expect(editor().value).toBe(body);
});
it('protected editing disables the insertion action without changing original data', async () => {
  const raw = seed(); await render(report, false); await click('別の保存記録と比較'); await choose(); expect(button('差分をレポートに挿入').disabled).toBe(true); expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
});
it('switching to another report invalidates the previous insertion undo', async () => {
  seed(); await open(); await insert(); const after = editor().value;
  await render({ ...report, id: 'other-report', formulaId: 'other-formula' });
  expect(button('直前の差分挿入を取り消す').disabled).toBe(true); expect(editor().value).toBe(after); expect(saved).not.toHaveBeenCalled();
});
it('a template operation replaces its own undo without retaining stale difference undo', async () => {
  seed(); await open(); await insert(); const afterDiff = editor().value;
  await click('テンプレートを挿入（末尾に追加）'); expect(button('直前の差分挿入を取り消す').disabled).toBe(true);
  await click('直前のテンプレート追加を取り消す'); expect(editor().value).toBe(afterDiff); expect(button('直前の差分挿入を取り消す').disabled).toBe(true);
});
it('insertion restores focus to the editor without replacing the original selection text', async () => {
  seed(); await open(); await insert(); await act(async () => new Promise(resolve => setTimeout(resolve, 40)));
  expect(document.activeElement).toBe(editor()); expect(editor().selectionStart).toBe(editor().selectionEnd); expect(editor().value.slice(editor().selectionEnd)).toBe(body.slice(3));
});
