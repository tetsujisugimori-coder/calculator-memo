// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { FormulaReportModal } from '../components/FormulaReportModal';
import {
  appendFormulaReportTemplate,
  FORMULA_REPORT_BODY_LIMIT,
  FORMULA_REPORT_TEMPLATE,
  formulaReportSignature,
  type FormulaReportSaveRequest,
} from '../lib/formula-reports';
import { defaultData, STORAGE_KEY } from '../lib/storage';
import type { FormulaReport, RegisteredFormula } from '../lib/types';

const formula: RegisteredFormula = {
  id: 'template-formula', title: 'テンプレート試験', expression: 'x*2',
  createdAt: '2026-10-23T00:00:00Z', updatedAt: '2026-10-23T00:00:00Z',
};
const originalReport: FormulaReport = {
  id: 'template-report', formulaId: formula.id, title: '説明', body: '## 元本文\n\n変更しない本文😀\n',
  createdAt: formula.createdAt, updatedAt: formula.updatedAt, confirmedExpression: null,
};
const insertLabel = 'テンプレートを挿入（末尾に追加）';
const undoLabel = '直前のテンプレート追加を取り消す';
let host: HTMLDivElement;
let root: Root;
const closed = vi.fn();
const saved = vi.fn<(request: FormulaReportSaveRequest) => Promise<FormulaReport | string>>();
const scrollIntoView = vi.fn();

function button(label: string): HTMLButtonElement {
  const found = [...host.querySelectorAll('button')].find(element => element.textContent === label);
  expect(found, `button: ${label}`).toBeTruthy();
  return found!;
}
function editor(): HTMLTextAreaElement {
  const found = host.querySelector<HTMLTextAreaElement>('#formula-report-body');
  expect(found).toBeTruthy();
  return found!;
}
function navigationButtons(): HTMLButtonElement[] {
  return [...host.querySelectorAll<HTMLButtonElement>('nav[aria-label="レポートの章一覧"] button')];
}
async function click(label: string) { await act(async () => button(label).click()); }
async function render(report: FormulaReport = originalReport, writable = true) {
  await act(async () => root.render(createElement(FormulaReportModal, {
    formulaId: formula.id, formula, report, writable, onClose: closed, onSave: saved,
  })));
}
async function input(id: string, value: string) {
  await act(async () => {
    const field = host.querySelector<HTMLInputElement | HTMLTextAreaElement>('#' + id)!;
    const prototype = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(field, value);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

beforeEach(() => {
  localStorage.clear();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  saved.mockReset();
  closed.mockReset();
  scrollIntoView.mockReset();
  vi.stubGlobal('scrollTo', vi.fn());
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scrollIntoView });
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
});

it('appends the six-section template to empty text without generating extra content', () => {
  expect(appendFormulaReportTemplate('')).toBe(FORMULA_REPORT_TEMPLATE);
  expect(FORMULA_REPORT_TEMPLATE.match(/^## /gm)).toHaveLength(6);
});

it.each([
  ['original', '\n\n'],
  ['original\n', '\n'],
  ['original\n\n', ''],
  ['  original😀\r\n\t  ', '\n\n'],
])('preserves the exact original prefix %j and adds only the needed separator', (body, separator) => {
  const result = appendFormulaReportTemplate(body);
  expect(result).toBe(body + separator + FORMULA_REPORT_TEMPLATE);
  expect(result.slice(0, body.length)).toBe(body);
});

it('accepts the exact body limit and rejects overflow without returning truncated content', () => {
  const prefix = 'a'.repeat(FORMULA_REPORT_BODY_LIMIT - FORMULA_REPORT_TEMPLATE.length - 2);
  const result = appendFormulaReportTemplate(prefix);
  expect(result).toHaveLength(FORMULA_REPORT_BODY_LIMIT);
  expect(result).toBe(prefix + '\n\n' + FORMULA_REPORT_TEMPLATE);
  const overflow = prefix + '😀';
  expect(() => appendFormulaReportTemplate(overflow)).toThrow('元の本文は保持');
  expect(overflow).toBe(prefix + '😀');
});

it('inserts into an empty existing report only on explicit activation and does not save', async () => {
  await render({ ...originalReport, body: '' });
  await click('Markdownを編集');
  expect(editor().value).toBe('');
  expect(button(undoLabel).disabled).toBe(true);
  await click(insertLabel);
  expect(editor().value).toBe(FORMULA_REPORT_TEMPLATE);
  expect(navigationButtons()).toHaveLength(6);
  expect(host.querySelector('p[role="status"]')?.textContent).toContain('未確認・未保存');
  expect(saved).not.toHaveBeenCalled();
});

it('appends without replacing existing text and immediate explicit undo restores the exact draft', async () => {
  const report = { ...originalReport, body: '  手入力した本文😀\n\n末尾の空白  ' };
  const original = JSON.stringify(report);
  await render(report);
  await click('Markdownを編集');
  await click(insertLabel);
  expect(editor().value).toBe(appendFormulaReportTemplate(report.body));
  expect(button(undoLabel).disabled).toBe(false);
  await click(undoLabel);
  expect(editor().value).toBe(report.body);
  expect(button(undoLabel).disabled).toBe(true);
  expect(JSON.stringify(report)).toBe(original);
  expect(saved).not.toHaveBeenCalled();
  await click('レポートを閉じる');
  expect(closed).toHaveBeenCalledOnce();
});

it('ends template undo after subsequent body edits rather than discarding user text', async () => {
  await render();
  await click('Markdownを編集');
  await click(insertLabel);
  const edited = editor().value + '\n追加後に書いた説明😀';
  await input('formula-report-body', edited);
  expect(button(undoLabel).disabled).toBe(true);
  await click(undoLabel);
  expect(editor().value).toBe(edited);
  expect(saved).not.toHaveBeenCalled();
});

it('retires template undo after a successful explicit save rather than reverting persisted content', async () => {
  await render();
  await click('Markdownを編集');
  await click(insertLabel);
  const appended = editor().value;
  const persisted = { ...originalReport, body: appended, updatedAt: '2026-10-23T01:00:00Z' };
  saved.mockResolvedValue(persisted);
  await click('レポートを保存');
  await render(persisted);
  expect(button(undoLabel).disabled).toBe(true);
  await click(undoLabel);
  expect(editor().value).toBe(appended);
  expect(saved).toHaveBeenCalledOnce();
  expect(saved).toHaveBeenCalledWith(expect.objectContaining({ body: appended, confirm: false }));
});

it('rejects an overflowing template insertion while retaining every existing character', async () => {
  const body = 'x'.repeat(FORMULA_REPORT_BODY_LIMIT - 10) + '😀';
  await render({ ...originalReport, body });
  await click('Markdownを編集');
  await click(insertLabel);
  expect(editor().value).toBe(body);
  expect(host.textContent).toContain('元の本文は保持');
  expect(button(undoLabel).disabled).toBe(true);
  expect(saved).not.toHaveBeenCalled();
});

it('navigates a read-only report without modifying storage, draft, or save state', async () => {
  const report = { ...originalReport, body: '# 最初\n\n## 次の章' };
  const raw = JSON.stringify({ ...defaultData, formulaReports: { version: 1, entries: [report] } });
  localStorage.setItem(STORAGE_KEY, raw);
  const write = vi.spyOn(Storage.prototype, 'setItem');
  await render(report, false);
  const target = host.querySelector<HTMLElement>('.formula-report-preview h2')!;
  await act(async () => navigationButtons()[1].click());
  expect(document.activeElement).toBe(target);
  expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
  await click('Markdownを編集');
  expect(button(insertLabel).disabled).toBe(true);
  expect(button('レポートを保存').disabled).toBe(true);
  await act(async () => navigationButtons()[1].click());
  expect(editor().value.slice(editor().selectionStart, editor().selectionEnd)).toBe('## 次の章');
  expect(editor().value).toBe(report.body);
  expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
  expect(write).not.toHaveBeenCalled();
  expect(saved).not.toHaveBeenCalled();
  await click('レポートを閉じる');
  expect(closed).toHaveBeenCalledOnce();
});

it('selects the exact duplicate heading line in the editor without editing or saving', async () => {
  const body = '前書き😀\n\n## 同名\n最初の本文\n\n## 同名\n最後の本文';
  await render({ ...originalReport, body });
  await click('Markdownを編集');
  await act(async () => navigationButtons()[1].click());
  expect(document.activeElement).toBe(editor());
  expect(editor().selectionStart).toBe(body.lastIndexOf('## 同名'));
  expect(editor().selectionEnd).toBe(body.lastIndexOf('## 同名') + '## 同名'.length);
  expect(editor().value).toBe(body);
  expect(saved).not.toHaveBeenCalled();
});

it.each(['\r\n', '\r'])('selects headings correctly after textarea normalization of %j line endings', async (newline) => {
  const body = ['前書き😀', '', '## 第一章', '本文', '', '### 選択する章', '末尾'].join(newline);
  await render({ ...originalReport, body });
  await click('Markdownを編集');
  await act(async () => navigationButtons()[1].click());
  const field = editor();
  expect(field.value.slice(field.selectionStart, field.selectionEnd)).toBe('### 選択する章');
  expect(field.selectionStart).toBe(field.value.indexOf('### 選択する章'));
  saved.mockResolvedValue('保存の試験');
  await click('レポートを保存');
  expect(saved).toHaveBeenCalledWith(expect.objectContaining({ body, confirm: false }));
});

it('focuses the correct duplicate preview heading and excludes fenced pseudo-headings', async () => {
  const body = '## 同名\n\n```md\n# コード内は対象外\n```\n\n## 同名\n\n~~~\n### 別のコード内\n~~~\n';
  await render({ ...originalReport, body });
  const targets = [...host.querySelectorAll<HTMLElement>('.formula-report-preview h2')];
  expect(navigationButtons().map(element => element.textContent)).toEqual(['H2：同名', 'H2：同名']);
  expect(targets).toHaveLength(2);
  expect(targets[0].id).not.toBe(targets[1].id);
  expect(targets.every(target => target.tabIndex === -1)).toBe(true);
  await act(async () => navigationButtons()[1].click());
  expect(document.activeElement).toBe(targets[1]);
  await act(async () => navigationButtons()[0].click());
  expect(document.activeElement).toBe(targets[0]);
  expect(saved).not.toHaveBeenCalled();
});

it('rebuilds chapter order, labels, and targets after arbitrary edits, deletion and reordering', async () => {
  await render({ ...originalReport, body: '# 最初\n\n## 二番目\n\n### 削除対象' });
  await click('Markdownを編集');
  const body = '## 二番目を先頭へ\n\n本文\n\n# 最初を末尾へ';
  await input('formula-report-body', body);
  expect(navigationButtons().map(element => element.textContent)).toEqual(['H2：二番目を先頭へ', 'H1：最初を末尾へ']);
  await act(async () => navigationButtons()[1].click());
  expect(editor().selectionStart).toBe(body.indexOf('# 最初を末尾へ'));
  await click('レポートをプレビュー');
  const target = host.querySelector<HTMLElement>('.formula-report-preview h1')!;
  await act(async () => navigationButtons()[1].click());
  expect(document.activeElement).toBe(target);
  expect(target.textContent).toBe('最初を末尾へ');
  expect(saved).not.toHaveBeenCalled();
});

it('navigation alone leaves an ordinary explicit save payload unchanged and unconfirmed', async () => {
  saved.mockResolvedValue(originalReport);
  await render();
  await act(async () => navigationButtons()[0].click());
  await click('Markdownを編集');
  await act(async () => navigationButtons()[0].click());
  expect(saved).not.toHaveBeenCalled();
  await click('レポートを保存');
  expect(saved).toHaveBeenCalledOnce();
  expect(saved).toHaveBeenCalledWith(expect.objectContaining({
    body: originalReport.body, title: originalReport.title,
    expectedReport: formulaReportSignature(originalReport), confirm: false,
  }));
});

it('disables insertion, undo and heading navigation while save/readback is pending', async () => {
  let finish!: (result: string) => void;
  saved.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  await render();
  await click('Markdownを編集');
  await click(insertLabel);
  const appended = editor().value;
  await click('レポートを保存');
  expect(button(insertLabel).disabled).toBe(true);
  expect(button(undoLabel).disabled).toBe(true);
  expect(navigationButtons().every(element => element.disabled)).toBe(true);
  expect(editor().disabled).toBe(true);
  await click(insertLabel);
  await click(undoLabel);
  expect(editor().value).toBe(appended);
  expect(saved).toHaveBeenCalledOnce();
  await act(async () => finish('読戻し失敗'));
  expect(editor().value).toBe(appended);
  expect(button(insertLabel).disabled).toBe(false);
  expect(host.textContent).toContain('読戻し失敗');
});

it('preserves draft remarks and past confirmation history through insertion and undo', async () => {
  const report: FormulaReport = {
    ...originalReport, confirmedExpression: formula.expression,
    evidence: { version: 1, links: [], confirmations: [{
      id: 'past-confirmation', formulaId: formula.id, confirmedAt: formula.createdAt,
      definition: { version: 1, expression: formula.expression, variables: ['x'] },
      title: originalReport.title, body: originalReport.body, links: [], evidenceSignature: '[]', remarks: '過去の備考😀',
    }] },
  };
  const original = JSON.stringify(report);
  await render(report);
  await input('formula-report-remarks', '次回の備考\n😀');
  await click('Markdownを編集');
  await click(insertLabel);
  await act(async () => navigationButtons()[1].click());
  await click(undoLabel);
  expect((host.querySelector('#formula-report-remarks') as HTMLTextAreaElement).value).toBe('次回の備考\n😀');
  expect(host.textContent).toContain('過去の備考😀');
  expect(host.textContent).toContain('確認時の式・本文・根拠の履歴（1件）');
  expect(JSON.stringify(report)).toBe(original);
  expect(saved).not.toHaveBeenCalled();
  saved.mockResolvedValue('保存失敗');
  await click('現在の式に対する内容を確認して保存');
  expect(saved).toHaveBeenCalledWith(expect.objectContaining({
    body: originalReport.body, confirmationRemarks: '次回の備考\n😀',
    expectedReport: original, confirm: true,
  }));
  expect((host.querySelector('#formula-report-remarks') as HTMLTextAreaElement).value).toBe('次回の備考\n😀');
});
