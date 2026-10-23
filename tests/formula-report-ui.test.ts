// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { FormulaReportModal } from '../components/FormulaReportModal';
import { FormulaLibraryModal } from '../components/FormulaLibraryModal';
import { formulaReportSignature, type FormulaReportSaveRequest } from '../lib/formula-reports';
import * as download from '../lib/markdown-report';
import { reportEvidenceSignature } from '../lib/formula-report-evidence';
import { defaultData, STORAGE_KEY } from '../lib/storage';
import type { FormulaReport, RegisteredFormula, Memo } from '../lib/types';
let host: HTMLDivElement, root: Root;
const formula: RegisteredFormula = { id: 'f1', title: '同名', expression: 'x*2', createdAt: '2026-10-22T00:00:00Z', updatedAt: '2026-10-22T00:00:00Z' };
const report: FormulaReport = { id: 'r1', formulaId: 'f1', title: '説明', body: '# 数学\n\n$x^2$\n\n```html\n<img onerror=alert(1)>\n```\n<script>alert(1)</script>', createdAt: formula.createdAt, updatedAt: formula.updatedAt, confirmedExpression: null };
const confirmedReport = (): FormulaReport => ({ ...report, confirmedExpression: formula.expression, evidence: { version: 1, links: [], confirmations: [{ id: 'confirmation1', formulaId: formula.id, confirmedAt: formula.createdAt, definition: { version: 1, expression: formula.expression, variables: ['x'] }, title: report.title, body: report.body, links: [], evidenceSignature: '[]' }] } });
const closed = vi.fn(); const saved = vi.fn<(request: FormulaReportSaveRequest) => Promise<FormulaReport | string>>();
const button = (name: string) => [...host.querySelectorAll('button')].find(item => item.textContent === name)!;
const click = async (name: string) => act(async () => button(name).click());
const render = async (f: RegisteredFormula | undefined = formula, r: FormulaReport | undefined = report) => act(async () => root.render(createElement(FormulaReportModal, { formulaId: 'f1', formula: f, report: r, writable: true, onClose: closed, onSave: saved })));
const input = async (id: string, value: string) => act(async () => { const field = host.querySelector<HTMLInputElement | HTMLTextAreaElement>('#' + id)!; const proto = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(field, value); field.dispatchEvent(new Event('input', { bubbles: true })); });
beforeEach(() => { localStorage.clear(); Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); host = document.createElement('div'); document.body.append(host); root = createRoot(host); saved.mockReset(); closed.mockReset(); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); });
it('opens safe preview without executing HTML, writing, or auto-confirming', async () => { await render(); expect(host.querySelector('.katex')).toBeTruthy(); expect(host.querySelector('script,img')).toBeNull(); expect(host.textContent).toContain('<script>alert(1)</script>'); expect(host.textContent).toContain('式との対応は未確認'); expect(saved).not.toHaveBeenCalled(); });
it('sends explicit confirmation with frozen full report and expression expectations', async () => { saved.mockResolvedValue({ ...report, confirmedExpression: formula.expression }); await render(); await click('現在の式に対する内容を確認して保存'); expect(saved).toHaveBeenCalledWith(expect.objectContaining({ expectedReport: formulaReportSignature(report), expectedExpression: 'x*2', confirm: true })); expect(host.textContent).toContain('内容の確認と保存が完了'); });
it('ordinary save does not implicitly confirm and failure retains edited body', async () => { saved.mockResolvedValue('保存失敗'); await render(); await click('Markdownを編集'); await input('formula-report-body', 'changed'); await click('レポートを保存'); expect(saved).toHaveBeenCalledWith(expect.objectContaining({ body: 'changed', confirm: false })); expect(host.textContent).toContain('保存失敗'); expect((host.querySelector('#formula-report-body') as HTMLTextAreaElement).value).toBe('changed'); });
it('blocks close and duplicate save until async readback resolves', async () => { let resolve!: (value: FormulaReport) => void; saved.mockImplementation(() => new Promise(done => { resolve = done; })); await render(); await click('レポートを保存'); expect(button('レポートを閉じる').disabled).toBe(true); await act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); }); expect(closed).not.toHaveBeenCalled(); expect(host.textContent).toContain('まだ保存済みではありません'); await act(async () => resolve(report)); expect(button('レポートを閉じる').disabled).toBe(false); });
it('dirty close offers explicit discard and keeps source immutable', async () => { const original = JSON.stringify(report); await render(); await click('Markdownを編集'); await input('formula-report-body', 'draft'); await click('レポートを閉じる'); expect(closed).not.toHaveBeenCalled(); await click('編集に戻る'); expect((host.querySelector('#formula-report-body') as HTMLTextAreaElement).value).toBe('draft'); await click('レポートを閉じる'); await click('未保存の編集を破棄して閉じる'); expect(closed).toHaveBeenCalledOnce(); expect(JSON.stringify(report)).toBe(original); });
it('formula changes during editing stop confirmation rather than rebase', async () => { await render(); await render({ ...formula, expression: 'x*3' }); expect(host.textContent).toContain('上書きを停止'); expect(button('現在の式に対する内容を確認して保存').disabled).toBe(true); expect(saved).not.toHaveBeenCalled(); });
it('report changes during editing stop save', async () => { await render(); await render(formula, { ...report, body: 'external' }); expect(button('レポートを保存').disabled).toBe(true); expect(host.textContent).toContain('上書きを停止'); });
it('name-only changes preserve expression confirmation and orphan cannot confirm', async () => { await render({ ...formula, title: 'renamed' }, confirmedReport()); expect(host.textContent).toContain('式との対応を確認済み'); await act(async () => root.render(createElement(FormulaReportModal, { formulaId: "f1", report, writable: true, onClose: closed, onSave: saved }))); expect(host.textContent).toContain('登録式が見つからない'); expect(button('現在の式に対する内容を確認して保存').disabled).toBe(true); });
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

const evidenceRecord = { id: 'rec1', calculatedAt: '2026-10-22T00:00:00.000Z', persistedAt: '2026-10-22T00:00:00.000Z', evaluator: 'calculator-memo-v1', status: 'confirmed', blocks: [
  { blockId: 'a', position: 1, expression: '-0', inputs: [], result: '-0', resultText: '0', status: 'success' },
  { blockId: 'b', position: 2, expression: 'a', inputs: [{ kind: 'variable', name: 'a', sourceBlockId: 'a', value: '-0' }], result: '-0', resultText: '0', status: 'success' },
] };
const evidenceStorage = () => ({ ...defaultData, notes: [{ id: 'memo1', type: 'plain-calculation', title: '過去のメモ', content: '現在値999（使わない）', createdAt: formula.createdAt, updatedAt: formula.createdAt, calculationEvidence: { version: 1, records: [evidenceRecord] } }] });
it('reads saved internal numbers and actual inputs without saving or replacing them from current content', async () => {
  const data = evidenceStorage(), raw = JSON.stringify(data); localStorage.setItem(STORAGE_KEY, raw);
  const linked = { ...report, evidence: { version: 1 as const, links: [{ memoId: 'memo1', recordId: 'rec1' }], confirmations: [] } };
  await render(formula, linked);
  expect(host.textContent).toContain('実使用内部値'); expect(host.textContent).toContain('-0'); expect(host.textContent).not.toContain('現在値999');
  expect(localStorage.getItem(STORAGE_KEY)).toBe(raw); expect(saved).not.toHaveBeenCalled();
});
it('selection is a draft, explicit save carries stable IDs and acquired signatures', async () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(evidenceStorage())); await render();
  await act(async () => { const choice = host.querySelector<HTMLSelectElement>('#report-evidence-choice')!; choice.value = JSON.stringify(['memo1','rec1']); choice.dispatchEvent(new Event('change', { bubbles: true })); });
  await click('根拠に追加'); expect(host.querySelector('p[role="status"]')?.textContent).toContain('未確認・未保存'); expect(saved).not.toHaveBeenCalled();
  saved.mockResolvedValue('保存失敗'); await click('レポートを保存');
  expect(saved).toHaveBeenCalledWith(expect.objectContaining({ links: [{ memoId: 'memo1', recordId: 'rec1' }], expectedEvidence: expect.any(String), expectedDefinition: expect.any(String), confirm: false }));
  expect(host.textContent).toContain('記録ID：rec1'); expect(host.textContent).toContain('保存失敗');
});
it('refresh of a missing record retains its identity and removes previous values instead of selecting another record', async () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(evidenceStorage()));
  await render(formula, { ...report, evidence: { version: 1, links: [{ memoId: 'memo1', recordId: 'rec1' }], confirmations: [] } });
  expect(host.textContent).toContain('-0'); localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultData));
  await click('保存済み根拠を再取得'); expect(host.textContent).toContain('参照不能'); expect(host.textContent).toContain('記録ID：rec1'); expect(host.textContent).not.toContain('当時の内部結果');
  expect(button('現在の式に対する内容を確認して保存').disabled).toBe(true); expect(saved).not.toHaveBeenCalled();
});
it('malformed refreshed storage clears stale detail and blocks confirmation, never substituting current edits', async () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(evidenceStorage())); await render(formula, { ...report, evidence: { version: 1, links: [{ memoId: 'memo1', recordId: 'rec1' }], confirmations: [] } });
  vi.spyOn(console, 'error').mockImplementation(() => {}); localStorage.setItem(STORAGE_KEY, '{broken'); await click('保存済み根拠を再取得'); expect(host.textContent).toContain('安全に取得できません'); expect(host.textContent).not.toContain('当時の内部結果'); expect(saved).not.toHaveBeenCalled();
});
it('old expression-only confirmation is unknown and retains the historical expression without fabricated date', async () => {
  await render(formula, { ...report, confirmedExpression: formula.expression });
  expect(host.querySelector('p[role="status"]')?.textContent).toBe('根拠不足または判定不能'); expect(host.textContent).toContain('互換用に保持した確認式（この項目単独では日時・変数情報なし）');
});
it('editing explanation does not remove the previously confirmed body or formula snapshot', async () => {
  await render(formula, confirmedReport()); await click('Markdownを編集'); await input('formula-report-body', 'new body');
  expect(host.querySelector('p[role="status"]')?.textContent).toContain('未確認・未保存'); expect(host.textContent).toContain('確認時の式・本文・根拠の履歴（1件）'); expect(host.textContent).toContain(report.body);
});
it('storage event requires explicit refresh before confirming and does not refresh silently', async () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(evidenceStorage())); await render(formula, confirmedReport());
  await act(async () => window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, newValue: JSON.stringify(defaultData) })));
  expect(host.textContent).toContain('表示は取得時点の内容'); expect(button('現在の式に対する内容を確認して保存').disabled).toBe(true); expect(saved).not.toHaveBeenCalled();
});
it('same-ID replaced record is never presented as the old confirmation evidence', async () => {
  const data = evidenceStorage(), links = [{ memoId: 'memo1', recordId: 'rec1' }];
  const confirmed = confirmedReport(); confirmed.evidence!.links = links; confirmed.evidence!.confirmations[0].links = links;
  confirmed.evidence!.confirmations[0].evidenceSignature = reportEvidenceSignature(data.notes as Memo[], links);
  data.notes[0].calculationEvidence.records[0].blocks[0].resultText = 'replacement';
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); await render(formula, confirmed);
  expect(host.querySelector('p[role="status"]')?.textContent).toBe('根拠不足または判定不能');
  expect(host.textContent).toContain('以前の確認根拠として詳細を表示しません'); expect(host.textContent).not.toContain('当時の内部結果');
  await click('現在取得した記録として表示'); expect(host.textContent).toContain('未確認・現在取得した計算記録の詳細'); expect(host.textContent).toContain('replacement'); expect(saved).not.toHaveBeenCalled();
});
it('past confirmation links remain inspectable after current links are removed, without editing or saving', async () => {
  const data = evidenceStorage(), links = [{ memoId: 'memo1', recordId: 'rec1' }], historical = confirmedReport();
  historical.evidence!.confirmations[0].links = links;
  historical.evidence!.confirmations[0].evidenceSignature = reportEvidenceSignature(data.notes as Memo[], links);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); await render(formula, historical);
  const details = [...host.querySelectorAll('details')].find(element => element.firstElementChild?.textContent === 'この確認時に参照した記録の詳細')!;
  await act(async () => { details.open = true; details.dispatchEvent(new Event('toggle')); });
  expect(host.textContent).toContain('実使用内部値'); expect(host.textContent).toContain('-0'); expect(saved).not.toHaveBeenCalled(); expect(historical.evidence!.links).toEqual([]);
});

it('keeps remarks through normal save, failure, cancel and clears only confirmed success', async () => {
  saved.mockResolvedValue(report); await render(); await input('formula-report-remarks', '照合\n😀');
  await click('レポートを保存'); expect(saved).toHaveBeenLastCalledWith(expect.not.objectContaining({ confirmationRemarks: expect.anything() }));
  const value = () => (host.querySelector('#formula-report-remarks') as HTMLTextAreaElement).value;
  expect(value()).toBe('照合\n😀'); await click('レポートを閉じる'); await click('編集に戻る'); expect(value()).toBe('照合\n😀');
  saved.mockResolvedValue('保存・読戻し失敗'); await click('現在の式に対する内容を確認して保存'); expect(value()).toBe('照合\n😀');
  saved.mockResolvedValue(report); await click('現在の式に対する内容を確認して保存');
  expect(saved).toHaveBeenLastCalledWith(expect.objectContaining({ confirmationRemarks: '照合\n😀', confirm: true })); expect(value()).toBe('');
});
it('blocks overflow confirmation without truncation but allows ordinary report save', async () => {
  await render(); await input('formula-report-remarks', '😀'.repeat(250) + 'a');
  expect((host.querySelector('#formula-report-remarks') as HTMLTextAreaElement).value.length).toBe(501);
  expect(button('現在の式に対する内容を確認して保存').disabled).toBe(true); expect(button('レポートを保存').disabled).toBe(false);
  expect(host.textContent).toContain('501/500 UTF-16');
  await input('formula-report-remarks', '😀'.repeat(250)); expect(button('現在の式に対する内容を確認して保存').disabled).toBe(false);
});
it('freezes pending remarks and does not publish success until save/readback resolves', async () => {
  let finish!: (value: string) => void; saved.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  await render(); await input('formula-report-remarks', 'captured'); await click('現在の式に対する内容を確認して保存');
  expect((host.querySelector('#formula-report-remarks') as HTMLTextAreaElement).disabled).toBe(true);
  await input('formula-report-remarks', 'late'); expect(saved).toHaveBeenLastCalledWith(expect.objectContaining({ confirmationRemarks: 'captured' }));
  await act(async () => finish('競合')); expect((host.querySelector('#formula-report-remarks') as HTMLTextAreaElement).value).toBe('captured');
  expect(host.textContent).not.toContain('内容の確認と保存が完了');
});
