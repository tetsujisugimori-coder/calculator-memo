// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { FormulaReportModal } from '../components/FormulaReportModal';
import { FormulaLibraryModal } from '../components/FormulaLibraryModal';
import { formulaReportSignature, type FormulaReportSaveRequest } from '../lib/formula-reports';
import * as download from '../lib/markdown-report';
import type { FormulaReport, RegisteredFormula } from '../lib/types';
let host: HTMLDivElement, root: Root;
const formula: RegisteredFormula = { id: 'f1', title: '同名', expression: 'x*2', createdAt: '2026-10-22T00:00:00Z', updatedAt: '2026-10-22T00:00:00Z' };
const report: FormulaReport = { id: 'r1', formulaId: 'f1', title: '説明', body: '# 数学\n\n$x^2$\n\n```html\n<img onerror=alert(1)>\n```\n<script>alert(1)</script>', createdAt: formula.createdAt, updatedAt: formula.updatedAt, confirmedExpression: null };
const closed = vi.fn(); const saved = vi.fn<(request: FormulaReportSaveRequest) => Promise<FormulaReport | string>>();
const button = (name: string) => [...host.querySelectorAll('button')].find(item => item.textContent === name)!;
const click = async (name: string) => act(async () => button(name).click());
const render = async (f: RegisteredFormula | undefined = formula, r: FormulaReport | undefined = report) => act(async () => root.render(createElement(FormulaReportModal, { formulaId: 'f1', formula: f, report: r, writable: true, onClose: closed, onSave: saved })));
const input = async (id: string, value: string) => act(async () => { const field = host.querySelector<HTMLInputElement | HTMLTextAreaElement>('#' + id)!; const proto = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(field, value); field.dispatchEvent(new Event('input', { bubbles: true })); });
beforeEach(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); host = document.createElement('div'); document.body.append(host); root = createRoot(host); saved.mockReset(); closed.mockReset(); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); });
it('opens safe preview without executing HTML, writing, or auto-confirming', async () => { await render(); expect(host.querySelector('.katex')).toBeTruthy(); expect(host.querySelector('script,img')).toBeNull(); expect(host.textContent).toContain('<script>alert(1)</script>'); expect(host.textContent).toContain('式との対応は未確認'); expect(saved).not.toHaveBeenCalled(); });
it('sends explicit confirmation with frozen full report and expression expectations', async () => { saved.mockResolvedValue({ ...report, confirmedExpression: formula.expression }); await render(); await click('現在の式に対する内容を確認して保存'); expect(saved).toHaveBeenCalledWith(expect.objectContaining({ expectedReport: formulaReportSignature(report), expectedExpression: 'x*2', confirm: true })); expect(host.textContent).toContain('内容の確認と保存が完了'); });
it('ordinary save does not implicitly confirm and failure retains edited body', async () => { saved.mockResolvedValue('保存失敗'); await render(); await click('Markdownを編集'); await input('formula-report-body', 'changed'); await click('レポートを保存'); expect(saved).toHaveBeenCalledWith(expect.objectContaining({ body: 'changed', confirm: false })); expect(host.textContent).toContain('保存失敗'); expect((host.querySelector('#formula-report-body') as HTMLTextAreaElement).value).toBe('changed'); });
it('blocks close and duplicate save until async readback resolves', async () => { let resolve!: (value: FormulaReport) => void; saved.mockImplementation(() => new Promise(done => { resolve = done; })); await render(); await click('レポートを保存'); expect(button('レポートを閉じる').disabled).toBe(true); await act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); }); expect(closed).not.toHaveBeenCalled(); expect(host.textContent).toContain('まだ保存済みではありません'); await act(async () => resolve(report)); expect(button('レポートを閉じる').disabled).toBe(false); });
it('dirty close offers explicit discard and keeps source immutable', async () => { const original = JSON.stringify(report); await render(); await click('Markdownを編集'); await input('formula-report-body', 'draft'); await click('レポートを閉じる'); expect(closed).not.toHaveBeenCalled(); await click('編集に戻る'); expect((host.querySelector('#formula-report-body') as HTMLTextAreaElement).value).toBe('draft'); await click('レポートを閉じる'); await click('未保存の編集を破棄して閉じる'); expect(closed).toHaveBeenCalledOnce(); expect(JSON.stringify(report)).toBe(original); });
it('formula changes during editing stop confirmation rather than rebase', async () => { await render(); await render({ ...formula, expression: 'x*3' }); expect(host.textContent).toContain('上書きを停止'); expect(button('現在の式に対する内容を確認して保存').disabled).toBe(true); expect(saved).not.toHaveBeenCalled(); });
it('report changes during editing stop save', async () => { await render(); await render(formula, { ...report, body: 'external' }); expect(button('レポートを保存').disabled).toBe(true); expect(host.textContent).toContain('上書きを停止'); });
it('name-only changes preserve expression confirmation and orphan cannot confirm', async () => { await render({ ...formula, title: 'renamed' }, { ...report, confirmedExpression: formula.expression }); expect(host.textContent).toContain('式との対応を確認済み'); await act(async () => root.render(createElement(FormulaReportModal, { formulaId: "f1", report, writable: true, onClose: closed, onSave: saved }))); expect(host.textContent).toContain('登録式が見つからない'); expect(button('現在の式に対する内容を確認して保存').disabled).toBe(true); });
it('exports exact raw Markdown without writing or inventing explanations', async () => { const copy = vi.fn().mockResolvedValue(undefined); Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: copy } }); const output = vi.spyOn(download, 'downloadMarkdownReport').mockImplementation(() => {}); await render(); await click('レポート本文をコピー'); await click('レポート.mdをダウンロード'); expect(copy).toHaveBeenCalledWith(report.body); expect(output).toHaveBeenCalledWith(expect.objectContaining({ markdown: report.body })); expect(saved).not.toHaveBeenCalled(); });
it('rejects overlong input without silent truncation', async () => { await render(); await click('Markdownを編集'); await input('formula-report-body', 'a'.repeat(100001)); expect((host.querySelector('#formula-report-body') as HTMLTextAreaElement).value.length).toBe(100001); expect(button('レポートを保存').disabled).toBe(true); expect(host.textContent).toContain('超過分は切り捨てません'); });
it('library exposes orphan rescue independently of same-name formula and retains report on delete', async () => { const onChange = vi.fn(); await act(async () => root.render(createElement(FormulaLibraryModal, { library: { version: 1, selectedId: 'f2', entries: [{ ...formula, id: 'f2' }] }, reports: { version: 1, entries: [report] }, onSaveReport: saved, onChange, onClose: closed, onExecute: vi.fn(), writable: true }))); expect(button('レポートを作成')).toBeTruthy(); expect(host.querySelector('[aria-label="登録式が見つからないレポート"]')).toBeTruthy(); await click('説明：閲覧・救出'); expect(host.textContent).toContain('登録式が見つからない'); expect(host.textContent).toContain('登録式ID：f1'); expect(onChange).not.toHaveBeenCalled(); });
it('dirty draft requests navigation warning and explicit discard restores opener focus', async () => {
  const opener = document.createElement('button'); document.body.append(opener); opener.focus();
  await render(); await click('Markdownを編集'); await input('formula-report-body', 'draft');
  const event = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(event); expect(event.defaultPrevented).toBe(true);
  await click('レポートを閉じる'); await click('未保存の編集を破棄して閉じる');
  await act(async () => root.render(null)); expect(document.activeElement).toBe(opener); opener.remove();
});
it('successful saved record supplies exact timestamps and next-save signature, not draft guesses', async () => {
  const persisted = { ...report, confirmedExpression: formula.expression, updatedAt: '2026-10-22T02:00:00Z' };
  saved.mockResolvedValue(persisted); await render(); await click('現在の式に対する内容を確認して保存');
  await render(formula, persisted); expect(host.textContent).toContain(persisted.updatedAt); await click('レポートを保存');
  expect(saved).toHaveBeenLastCalledWith(expect.objectContaining({ expectedReport: formulaReportSignature(persisted), confirm: false }));
});
it('confirmed draft loses confirmed label while text is edited and blocks excess export', async () => {
  const output = vi.spyOn(download, 'downloadMarkdownReport').mockImplementation(() => {});
  await render(formula, { ...report, confirmedExpression: formula.expression }); await click('Markdownを編集'); await input('formula-report-body', 'a'.repeat(100001));
  expect(host.querySelector('p[role="status"]')?.textContent).toBe('編集中の内容は未確認・未保存です');
  await click('レポート.mdをダウンロード'); expect(output).not.toHaveBeenCalled(); expect(host.textContent).toContain('出力を中止');
});
it('oversized pasted body remains intact but is not parsed by preview', async () => {
  await render(); await click('Markdownを編集'); const body = '# This must not render\n' + 'x'.repeat(100001); await input('formula-report-body', body); await click('レポートをプレビュー');
  const preview = host.querySelector('[aria-label="関連レポートのプレビュー"]')!; expect(preview.textContent).toContain('プレビューを停止'); expect(preview.querySelector('h1')).toBeNull();
  await click('Markdownを編集'); expect((host.querySelector('#formula-report-body') as HTMLTextAreaElement).value).toBe(body); expect(saved).not.toHaveBeenCalled();
});
it('external report conflict never leaves a confirmed status', async () => {
  const confirmed = { ...report, confirmedExpression: formula.expression }; await render(formula, confirmed); await render(formula, { ...confirmed, body: 'external revised explanation' });
  expect(host.querySelector('p[role="status"]')?.textContent).toContain('現在の保存内容との照合不能'); expect(host.querySelector('p[role="status"]')?.textContent).not.toContain('式との対応を確認済み');
});
