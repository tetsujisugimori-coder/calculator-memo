// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { FormulaReportModal } from '../components/FormulaReportModal';
import { FormulaQuoteStatus } from '../components/FormulaReportQuotes';
import { createQuoteMarkdown, readQuoteAssessments, type QuoteSnapshot } from '../lib/formula-report-quotes';
import type { FormulaReportSaveRequest } from '../lib/formula-reports';
import type { EvidenceRecord } from '../lib/calculation-evidence';
import type { FormulaReport, Memo, RegisteredFormula } from '../lib/types';
import { defaultData, STORAGE_KEY } from '../lib/storage';
import * as download from '../lib/markdown-report';

const at = '2026-10-22T00:00:00.000Z';
const formula: RegisteredFormula = { id: 'f1', title: '同名', expression: 'x*2', createdAt: at, updatedAt: at };
const record: EvidenceRecord = { id: 'rec1', calculatedAt: at, persistedAt: at, evaluator: 'calculator-memo-v1', status: 'confirmed', blocks: [
  { blockId: 'a', position: 1, expression: '-0', inputs: [], result: '-0', resultText: '0', status: 'success' },
  { blockId: 'b', position: 2, expression: 'a', inputs: [{ kind: 'variable', name: 'a', sourceBlockId: 'a', value: '-0' }], result: '-0', resultText: '0', status: 'success' },
] };
const links = [{ memoId: 'memo1', recordId: 'rec1' }];
const report: FormulaReport = { id: 'r1', formulaId: 'f1', title: '説明', body: '前文\n選択した本文\n後文', createdAt: at, updatedAt: at, confirmedExpression: null, evidence: { version: 1, links, confirmations: [] } };
const notes = (): Memo[] => [{ id: 'memo1', type: 'plain-calculation', title: '保存メモ', content: '現在の未確定値999', createdAt: at, updatedAt: at, calculationEvidence: { version: 1, records: [structuredClone(record)] } }];
const snapshot = (): QuoteSnapshot => ({ version: 1, quoteId: 'q1', formulaId: 'f1', memoId: 'memo1', blockId: 'b', citedAt: at, record: structuredClone(record) });
const quote = () => createQuoteMarkdown(snapshot());
let host: HTMLDivElement, root: Root;
const closed = vi.fn();
const saved = vi.fn<(request: FormulaReportSaveRequest) => Promise<FormulaReport | string>>();
const button = (name: string) => [...host.querySelectorAll('button')].find(item => item.textContent === name)!;
const click = async (name: string) => act(async () => { expect(button(name), name).toBeTruthy(); button(name).click(); });
const editor = () => host.querySelector<HTMLTextAreaElement>('#formula-report-body')!;
const seed = (r: FormulaReport = report) => { const raw = JSON.stringify({ ...defaultData, notes: notes(), formulaLibrary: { version: 1, selectedId: 'f1', entries: [formula] }, formulaReports: { version: 1, entries: [r] } }); localStorage.setItem(STORAGE_KEY, raw); return raw; };
const render = async (r: FormulaReport | undefined = report, writable = true) => act(async () => root.render(createElement(FormulaReportModal, { formulaId: 'f1', formula, report: r, writable, onClose: closed, onSave: saved })));
const select = async (label: string, value: string) => act(async () => {
  const fieldLabel = [...host.querySelectorAll('label')].find(item => item.textContent === label)!;
  const field = document.getElementById(fieldLabel.htmlFor) as HTMLSelectElement;
  field.value = value; field.dispatchEvent(new Event('change', { bubbles: true }));
});
const changeBody = async (value: string) => act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(editor(), value); editor().dispatchEvent(new Event('input', { bubbles: true })); });
const prepare = async () => { await click('計算根拠を引用'); await select('引用する保存済み計算記録', JSON.stringify(['memo1', 'rec1'])); await select('引用するブロック', 'b'); await click('引用の挿入前プレビュー'); };
const insert = async () => { await prepare(); await click('この引用を本文へ挿入'); };
beforeEach(() => { localStorage.clear(); Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); host = document.createElement('div'); document.body.append(host); root = createRoot(host); saved.mockReset(); closed.mockReset(); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); });

it('previews the selected saved block with actual internal inputs, without draft evaluation or writes', async () => {
  const raw = seed(); await render(); await click('Markdownを編集'); await prepare();
  const preview = host.querySelector('[aria-label="引用の挿入前プレビュー"]')!;
  expect(preview.textContent).toContain('ブロックID：b'); expect(preview.textContent).toContain('内部値：-0'); expect(preview.textContent).toContain('当時の表示結果：'); expect(preview.textContent).not.toContain('未確定値999');
  expect(editor().value).toBe(report.body); expect(localStorage.getItem(STORAGE_KEY)).toBe(raw); expect(saved).not.toHaveBeenCalled();
});
it('inserts before a selected range without erasing selected text and offers exact undo', async () => {
  const raw = seed(); await render(); await click('Markdownを編集'); editor().setSelectionRange(3, 9); await insert();
  const body = editor().value; expect(body.startsWith('前文\n')).toBe(true); expect(body.endsWith('選択した本文\n後文')).toBe(true); expect(readQuoteAssessments(body, 'f1', notes())[0].status).toBe('matched');
  expect(localStorage.getItem(STORAGE_KEY)).toBe(raw); await click('直前の引用を取り消す'); expect(editor().value).toBe(report.body); expect(saved).not.toHaveBeenCalled();
});
it('canceling an insertion preview leaves body and saved history unchanged', async () => {
  const raw = seed(); await render(); await click('Markdownを編集'); await prepare(); await click('引用選択を取り消す');
  expect(editor().value).toBe(report.body); expect(localStorage.getItem(STORAGE_KEY)).toBe(raw); expect(saved).not.toHaveBeenCalled();
});
it('ignores unsaved report-prop links when the stored report has none', async () => {
  seed({ ...report, evidence: { version: 1, links: [], confirmations: [] } }); await render(); await click('Markdownを編集'); await click('計算根拠を引用');
  expect(host.textContent).toContain('引用可能な関連記録はありません'); expect(button('引用の挿入前プレビュー').disabled).toBe(true);
});
it('a new report cannot cite an unrelated saved record without a persisted association', async () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...defaultData, notes: notes() }));
  await act(async () => root.render(createElement(FormulaReportModal, { formulaId: 'f1', formula, writable: true, onClose: closed, onSave: saved })));
  await click('計算根拠を引用'); expect(host.textContent).toContain('引用可能な関連記録はありません');
});
it('failed save retains inserted quote for recovery and never mutates source/history', async () => {
  const raw = seed(); saved.mockResolvedValue('保存・読戻しに失敗しました'); await render(); await click('Markdownを編集'); await insert(); const body = editor().value;
  await click('レポートを保存'); expect(saved).toHaveBeenCalledWith(expect.objectContaining({ body, confirm: false })); expect(editor().value).toBe(body); expect(host.textContent).toContain('保存・読戻しに失敗しました'); expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
});
it('rejects same-tab raw changes between preview and insertion without changing the draft', async () => {
  seed(); await render(); await click('Markdownを編集'); await prepare(); localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...defaultData, notes: [] })); await click('この引用を本文へ挿入');
  expect(editor().value).toBe(report.body); expect(host.textContent).toContain('引用前に原本の変更または取得失敗を検知'); expect(button('計算根拠を引用').disabled).toBe(true); expect(saved).not.toHaveBeenCalled();
});
it('storage update makes existing quotes unverified until explicit successful refresh', async () => {
  const r = { ...report, body: quote() }; const raw = seed(r); await render(r);
  await act(async () => window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, newValue: raw + ' ' })));
  expect(host.querySelector('[aria-label="計算根拠引用の状態"]')!.textContent).toContain('根拠未照合'); expect(button('引用元の保存記録・ブロックを開く').disabled).toBe(true);
  await click('保存済み根拠を再取得'); expect(host.querySelector('[aria-label="計算根拠引用の状態"]')!.textContent).toContain('保存記録全体と一致'); expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
});
it('failed explicit refresh preserves quote and distinguishes retrieval failure, then recovers', async () => {
  const r = { ...report, body: quote() }; seed(r); await render(r); vi.spyOn(console, 'error').mockImplementation(() => {}); localStorage.setItem(STORAGE_KEY, '{broken'); await click('保存済み根拠を再取得');
  expect(host.querySelector('[aria-label="計算根拠引用の状態"]')!.textContent).toContain('原本取得失敗'); expect(button('引用元の保存記録・ブロックを開く').disabled).toBe(true); expect(localStorage.getItem(STORAGE_KEY)).toBe('{broken');
  seed(r); await click('保存済み根拠を再取得'); expect(host.querySelector('[aria-label="計算根拠引用の状態"]')!.textContent).toContain('保存記録全体と一致'); expect(saved).not.toHaveBeenCalled();
});
it('manual quote text edits are not silently called matched and invalidate insertion undo', async () => {
  seed(); await render(); await click('Markdownを編集'); await insert(); await changeBody(editor().value.replace('当時の式：', '変更した式：'));
  expect(host.querySelector('[aria-label="計算根拠引用の状態"]')!.textContent).toContain('形式が編集'); expect(button('直前の引用を取り消す').disabled).toBe(true); expect(saved).not.toHaveBeenCalled();
});
it('copy and Markdown export preserve all tracking bytes without implicit saving', async () => {
  const body = quote(), r = { ...report, body }; const raw = seed(r); const copy = vi.fn().mockResolvedValue(undefined); Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: copy } }); const output = vi.spyOn(download, 'downloadMarkdownReport').mockImplementation(() => {});
  await render(r); await click('レポート本文をコピー'); await click('レポート.mdをダウンロード'); expect(copy).toHaveBeenCalledWith(body); expect(output).toHaveBeenCalledWith(expect.objectContaining({ markdown: body })); expect(readQuoteAssessments(copy.mock.calls[0][0], 'f1', notes())[0].status).toBe('matched'); expect(localStorage.getItem(STORAGE_KEY)).toBe(raw); expect(saved).not.toHaveBeenCalled();
});
it('read-only source viewer opens the exact selected block without storage mutation', async () => {
  const raw = seed(); await act(async () => root.render(createElement(FormulaQuoteStatus, { body: quote(), formulaId: 'f1', links, source: { notes: notes(), fetchedAt: at } })));
  await click('引用元の保存記録・ブロックを開く'); expect(host.textContent).toContain('ブロックID：b'); expect(host.textContent).toContain('現在取得した保存原本'); await click('引用元表示を閉じる'); expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
});
it('removing association is distinct from deleted source and preserves the quote', async () => {
  const body = quote(); await act(async () => root.render(createElement(FormulaQuoteStatus, { body, formulaId: 'f1', links: [], source: { notes: notes(), fetchedAt: at } })));
  expect(host.textContent).toContain('現在の保存済み根拠リンクにはありません'); expect(host.textContent).toContain('保存記録全体と一致');
  await act(async () => root.render(createElement(FormulaQuoteStatus, { body, formulaId: 'f1', links, source: { notes: [], fetchedAt: at } })));
  expect(host.textContent).toContain('保存記録が欠落'); expect(button('引用元の保存記録・ブロックを開く').disabled).toBe(true);
});
it('renders dangerous quoted expressions as text rather than active HTML', async () => {
  const value = snapshot(); value.record.blocks[1].expression = '<img src=x onerror=alert(1)><script>bad()</script>'; const body = createQuoteMarkdown(value);
  seed({ ...report, body }); await render({ ...report, body }); expect(host.querySelector('script')).toBeNull(); expect(host.querySelector('img')).toBeNull(); expect(host.textContent).toContain('<script>bad()</script>');
});
it('protected reports disable quote insertion and never write', async () => {
  const raw = seed(); await render(report, false); await click('Markdownを編集'); expect(button('計算根拠を引用').disabled).toBe(true); expect(localStorage.getItem(STORAGE_KEY)).toBe(raw); expect(saved).not.toHaveBeenCalled();
});
it('ordinary save and readback keep quotes without adding confirmation history', async () => {
  seed(); let persisted: FormulaReport | undefined;
  saved.mockImplementation(async request => { persisted = { ...report, body: request.body, updatedAt: '2026-10-22T01:00:00.000Z' }; seed(persisted); return persisted; });
  await render(); await click('Markdownを編集'); await insert(); const body = editor().value; await click('レポートを保存');
  expect(saved).toHaveBeenCalledOnce(); expect(saved.mock.calls[0][0].confirm).toBe(false); expect(persisted!.evidence!.confirmations).toEqual([]);
  await act(async () => root.render(null)); await render(persisted); expect(host.querySelector('[aria-label="計算根拠引用の状態"]')!.textContent).toContain('保存記録全体と一致');
  await click('Markdownを編集'); expect(editor().value).toBe(body); expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!).notes[0].calculationEvidence.records).toEqual([record]);
});
it('repeated citation of the same block creates independent snapshots and undo removes only the last', async () => {
  seed(); await render(); await click('Markdownを編集'); await insert(); const first = editor().value;
  editor().setSelectionRange(first.length, first.length); await insert(); const assessments = readQuoteAssessments(editor().value, 'f1', notes());
  expect(assessments).toHaveLength(2); expect(assessments.map(item => item.status)).toEqual(['matched', 'matched']); expect(new Set(assessments.map(item => item.snapshot!.quoteId)).size).toBe(2);
  await click('直前の引用を取り消す'); expect(editor().value).toBe(first); expect(saved).not.toHaveBeenCalled();
});
it('storage event during prepared preview disables insertion without losing the existing draft', async () => {
  seed(); await render(); await click('Markdownを編集'); await prepare();
  await act(async () => window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, newValue: 'changed' })));
  expect(button('この引用を本文へ挿入').disabled).toBe(true); await click('この引用を本文へ挿入'); expect(editor().value).toBe(report.body); expect(saved).not.toHaveBeenCalled();
});
it('read failure between preview and insertion preserves raw protected data and draft', async () => {
  seed(); await render(); await click('Markdownを編集'); await prepare(); vi.spyOn(console, 'error').mockImplementation(() => {}); localStorage.setItem(STORAGE_KEY, '{invalid'); await click('この引用を本文へ挿入');
  expect(editor().value).toBe(report.body); expect(localStorage.getItem(STORAGE_KEY)).toBe('{invalid'); expect(host.textContent).toContain('本文は変更していません'); expect(saved).not.toHaveBeenCalled();
});
it('compact native options retain full long identifiers and expression in selected details and quote metadata', async () => {
  const memoId = 'memo-' + 'm'.repeat(80), recordId = 'record-' + 'r'.repeat(80), blockId = 'block-' + 'b'.repeat(80);
  const expression = '1+'.repeat(100) + '1', title = '長い保存メモ名'.repeat(30);
  const longRecord: EvidenceRecord = { ...record, id: recordId, blocks: [{ ...record.blocks[0], blockId, expression }] };
  const longNotes: Memo[] = [{ id: memoId, type: 'plain-calculation', title, content: '', createdAt: at, updatedAt: at, calculationEvidence: { version: 1, records: [longRecord] } }];
  const r: FormulaReport = { ...report, evidence: { version: 1, links: [{ memoId, recordId }], confirmations: [] } };
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...defaultData, notes: longNotes, formulaLibrary: { version: 1, selectedId: 'f1', entries: [formula] }, formulaReports: { version: 1, entries: [r] } }));
  await render(r); await click('Markdownを編集'); await click('計算根拠を引用'); await select('引用する保存済み計算記録', JSON.stringify([memoId, recordId])); await select('引用するブロック', blockId);
  const picker = [...host.querySelectorAll('[role="dialog"]')].find(dialog => dialog.querySelector('h2')?.textContent === '計算根拠を引用')!;
  const options = [...picker.querySelectorAll('option')];
  expect(options.find(option => option.value === JSON.stringify([memoId, recordId]))!.textContent).toBe('記録1：' + recordId.slice(0, 8) + '…');
  expect(options.find(option => option.value === blockId)!.textContent).toBe('ブロック1：' + blockId.slice(0, 8) + '…');
  expect(host.textContent).toContain(title); expect(host.textContent).toContain(memoId); expect(host.textContent).toContain(recordId); expect(host.textContent).toContain(blockId); expect(host.textContent).toContain(expression);
  await click('引用の挿入前プレビュー'); const preview = host.querySelector('[aria-label="引用の挿入前プレビュー"]')!;
  const metadata = [...preview.querySelectorAll('code')].map(node => node.textContent ?? '').find(text => text.startsWith('{"version":1'))!;
  expect(JSON.parse(metadata)).toMatchObject({ memoId, blockId, record: { id: recordId, blocks: [{ blockId, expression }] } });
  expect(saved).not.toHaveBeenCalled();
});
