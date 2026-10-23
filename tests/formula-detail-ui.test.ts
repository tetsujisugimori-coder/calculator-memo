// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { FormulaDetailView } from '../components/FormulaDetailView';
import { FormulaLibraryModal } from '../components/FormulaLibraryModal';
import { defaultData, STORAGE_KEY } from '../lib/storage';
import { reportEvidenceSignature } from '../lib/formula-report-evidence';
import * as calculator from '../lib/calculator';
import * as download from '../lib/markdown-report';
import type { FormulaReport, RegisteredFormula, StoredData } from '../lib/types';

let host: HTMLDivElement, root: Root;
const date = '2026-10-22T00:00:00Z';
const formula: RegisteredFormula = { id: 'f1', title: '保存済み登録式', expression: 'x*2', createdAt: date, updatedAt: date };
const report: FormulaReport = { id: 'r1', formulaId: 'f1', title: '保存済み説明', body: '# 数学\n\n$x^2$\n\n```html\n<img onerror=alert(1)>\n```\n<script>alert(1)</script>\n\n特殊文字 & < >\n改行', createdAt: date, updatedAt: date, confirmedExpression: null };
const confirmed = (): FormulaReport => ({ ...report, confirmedExpression: formula.expression, evidence: { version: 1, links: [], confirmations: [{ id: 'confirmation1', formulaId: formula.id, confirmedAt: date, definition: { version: 1, expression: formula.expression, variables: ['x'] }, title: report.title, body: report.body, links: [], evidenceSignature: '[]' }] } });
const data = (r: FormulaReport | undefined = report, f: RegisteredFormula = formula): StoredData => ({ ...defaultData, formulaLibrary: { version: 1, selectedId: f.id, entries: [f] }, formulaReports: { version: 1, entries: r ? [r] : [] } });
const seed = (value: unknown) => { const raw = JSON.stringify(value); localStorage.setItem(STORAGE_KEY, raw); return raw; };
const render = async (formulaId = 'f1', pendingSave = false) => act(async () => root.render(createElement(FormulaDetailView, { formulaId, pendingSave })));
const button = (name: string) => [...host.querySelectorAll('button')].find(item => item.textContent === name)!;
const click = async (name: string) => act(async () => button(name).click());
const status = () => host.querySelector('[data-testid="formula-detail-assessment"]')?.textContent ?? '';
beforeEach(() => { localStorage.clear(); Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); host = document.createElement('div'); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); });

it('renders persisted formula, safe Markdown, and unconfirmed state without writes or calculation', async () => {
  const raw = seed(data()); const write = vi.spyOn(Storage.prototype, 'setItem'); const calculate = vi.spyOn(calculator, 'calculateExpression'); const variableCalculate = vi.spyOn(calculator, 'calculateVariableExpression');
  await render(); expect(host.textContent).toContain(formula.title); expect(host.textContent).toContain(formula.expression); expect(host.textContent).toContain(report.title); expect(host.querySelector('.katex')).toBeTruthy(); expect(host.querySelector('script,img')).toBeNull(); expect(host.textContent).toContain('<script>alert(1)</script>'); expect(status()).toContain('未確認'); expect(write).not.toHaveBeenCalled(); expect(calculate).not.toHaveBeenCalled(); expect(variableCalculate).not.toHaveBeenCalled(); expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
});
it('shows a matching explicit confirmation and its exact identity/date without creating another history', async () => {
  const raw = seed(data(confirmed())); await render(); expect(status()).toContain('確認済み'); expect(status()).not.toContain('判定不能'); expect(host.textContent).toContain('confirmation1'); expect(host.textContent).toContain(date); expect(host.textContent).toContain('数学的'); expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
});
it.each(['x*3', 'y*2'])('detects expression or variable changes (%s) but retains historical snapshot', async expression => {
  const raw = seed(data(confirmed(), { ...formula, expression })); await render(); expect(status()).toContain('要再確認'); expect(host.textContent).toContain('x*2'); expect(host.textContent).toContain(expression); expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
});
it('does not interpret an old confirmation as confirmation of a subsequently edited report', async () => {
  const old = confirmed(); seed(data({ ...old, body: '新しい未確認の説明' })); await render(); expect(status()).toContain('未確認'); expect(host.textContent).toContain('confirmation1'); expect(host.textContent).toContain(report.body); expect(host.textContent).toContain('新しい未確認の説明');
});
it('preserves legacy expression-only confirmation without inventing a timestamp', async () => {
  const raw = seed(data({ ...report, confirmedExpression: formula.expression })); await render(); expect(status()).toContain('判定不能'); expect(host.textContent).toContain('確認日時'); expect(host.textContent).not.toContain('confirmation1'); expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
});
it('reads saved data rather than caller drafts when unsaved editing exists', async () => {
  const raw = seed(data(confirmed())); await render('f1', true); expect(host.textContent).toContain('未保存'); expect(host.textContent).toContain(formula.expression); expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
});
it('distinguishes same-name formula and report by stable IDs', async () => {
  const value = data(); value.formulaLibrary!.entries.push({ ...formula, id: 'f2', expression: 'y+9' }); value.formulaReports!.entries.push({ ...report, id: 'r2', formulaId: 'f2', title: '別の説明', body: 'f2 only' }); seed(value); await render('f2'); expect(host.textContent).toContain('y+9'); expect(host.textContent).toContain('別の説明'); expect(host.textContent).not.toContain('保存済み説明');
});
it('does not substitute another formula when the requested saved ID is absent', async () => {
  const raw = seed(data()); await render('missing'); expect(host.textContent).toMatch(/見つかりません|ありません|取得でき/); expect(status()).not.toContain('確認済み'); expect(host.textContent).not.toContain(report.body); expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
});
it('states that a report is not registered without generating explanation content', async () => {
  const value = data(); value.formulaReports!.entries = []; const raw = seed(value); await render(); expect(host.textContent).toMatch(/未登録|登録されていません|ありません/); expect(host.textContent).not.toContain('## 証明'); expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
});
it.each(['{broken', JSON.stringify({ ...defaultData, version: 999 })])('fails closed for unreadable or unsupported saved data', async raw => {
  localStorage.setItem(STORAGE_KEY, raw); vi.spyOn(console, 'error').mockImplementation(() => {}); const write = vi.spyOn(Storage.prototype, 'setItem'); await render(); expect(host.textContent).toMatch(/取得でき|読み取|読込|確認でき/); expect(status()).not.toContain('確認済み'); expect(write).not.toHaveBeenCalled(); expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
});
it('preserves unknown nested evidence JSON without rendering it as a verified confirmation', async () => {
  const r = confirmed(); Object.assign(r.evidence!.confirmations[0], { futureProof: { unsupported: true } }); const raw = seed(data(r)); const write = vi.spyOn(Storage.prototype, 'setItem'); await render(); expect(status()).not.toContain('確認済み'); expect(host.textContent).toMatch(/取得でき|読み取|確認でき|判定不能/); expect(write).not.toHaveBeenCalled(); expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
});
it('treats missing saved evidence as unknown rather than confirmed', async () => {
  const r = confirmed(); r.evidence!.links = [{ memoId: 'missing-memo', recordId: 'missing-record' }]; r.evidence!.confirmations[0].links = [...r.evidence!.links]; r.evidence!.confirmations[0].evidenceSignature = reportEvidenceSignature([], r.evidence!.links); seed(data(r)); await render(); expect(status()).toContain('判定不能'); expect(host.textContent).toContain('根拠不足');
});
it('exports exact saved raw Markdown without changing the source', async () => {
  const raw = seed(data()); const copy = vi.fn().mockResolvedValue(undefined); Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: copy } }); const output = vi.spyOn(download, 'downloadMarkdownReport').mockImplementation(() => {}); await render(); await click('保存済みレポート本文をコピー'); await click('保存済みレポート.mdをダウンロード'); expect(copy).toHaveBeenCalledWith(report.body); expect(output).toHaveBeenCalledWith(expect.objectContaining({ markdown: report.body })); expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
});
it('invalidates current correspondence after another-tab change and requires explicit refresh', async () => {
  seed(data(confirmed())); await render(); expect(status()).toContain('確認済み'); const changed = seed(data(confirmed(), { ...formula, expression: 'x*3' })); await act(async () => window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, newValue: changed }))); expect(status()).not.toContain('確認済み'); expect(host.textContent).toContain('再取得'); await click('保存済み詳細を再取得'); expect(status()).toContain('要再確認'); expect(localStorage.getItem(STORAGE_KEY)).toBe(changed);
});
it('clears old details when explicit refresh cannot read the saved original', async () => {
  seed(data(confirmed())); await render(); localStorage.setItem(STORAGE_KEY, '{broken'); vi.spyOn(console, 'error').mockImplementation(() => {}); await click('保存済み詳細を再取得'); expect(status()).not.toContain('確認済み'); expect(host.textContent).not.toContain('confirmation1'); expect(localStorage.getItem(STORAGE_KEY)).toBe('{broken');
});
it('library selection is local and remains available when persistence is protected', async () => {
  const value = data(); value.formulaLibrary!.entries.push({ ...formula, id: 'f2', title: '別の登録式', expression: 'y+9' }); const raw = seed(value); const onChange = vi.fn(), onExecute = vi.fn(); await act(async () => root.render(createElement(FormulaLibraryModal, { library: value.formulaLibrary!, reports: value.formulaReports, onChange, onExecute, onClose: vi.fn(), writable: false }))); const choose = host.querySelector<HTMLButtonElement>('button[aria-label="別の登録式"]')!; expect(choose.disabled).toBe(false); await act(async () => choose.click()); expect(host.textContent).toContain('y+9'); expect(onChange).not.toHaveBeenCalled(); expect(onExecute).not.toHaveBeenCalled(); expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
});

const evidenceData = () => {
  const value = data(confirmed());
  value.notes = [{ id: 'memo1', type: 'plain-calculation', title: '保存記録のメモ', content: '現在の未保存試算を代用しない', createdAt: date, updatedAt: date, calculationEvidence: { version: 1, records: [{ id: 'rec1', calculatedAt: '2026-10-22T00:00:00.000Z', persistedAt: '2026-10-22T00:00:00.000Z', evaluator: 'calculator-memo-v1', status: 'confirmed', blocks: [{ blockId: 'b1', position: 1, expression: '-0', inputs: [], result: '-0', resultText: '0', status: 'success' }] }] } }];
  const r = value.formulaReports!.entries[0];
  r.evidence!.links = [{ memoId: 'memo1', recordId: 'rec1' }];
  r.evidence!.confirmations[0].links = [...r.evidence!.links];
  r.evidence!.confirmations[0].evidenceSignature = reportEvidenceSignature(value.notes, r.evidence!.links);
  return value;
};
it('uses valid saved linked evidence for confirmation without changing its records', async () => {
  const value = evidenceData(), raw = seed(value); await render(); expect(status()).toBe('確認済み・式一致'); expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
});
it('does not confirm a same-ID record replaced after the stored confirmation', async () => {
  const value = evidenceData(); const note = value.notes[0]; if (note.type !== 'plain-calculation') throw new Error('invalid fixture'); note.calculationEvidence!.records[0].blocks[0].result = '456'; note.calculationEvidence!.records[0].blocks[0].resultText = '456'; const raw = seed(value); await render(); expect(status()).toContain('判定不能'); expect(host.textContent).toContain('同じID'); expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
});
it('does not substitute empty notes when localStorage access is denied', async () => {
  seed(evidenceData()); vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('denied', 'SecurityError'); }); vi.spyOn(console, 'error').mockImplementation(() => {}); const write = vi.spyOn(Storage.prototype, 'setItem'); await render(); expect(status()).not.toContain('確認済み'); expect(host.textContent).toContain('安全に取得できません'); expect(write).not.toHaveBeenCalled();
});
it('shows all 20 retained confirmation IDs without mutating or truncating history', async () => {
  const r = confirmed(); r.evidence!.confirmations = Array.from({ length: 20 }, (_, index) => ({ ...r.evidence!.confirmations[0], id: `confirmation-${index}` })); const raw = seed(data(r)); await render(); expect(host.textContent).toContain('確認履歴（20件）'); for (let i = 0; i < 20; i++) expect(host.textContent).toContain(`確認ID：confirmation-${i}`); expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
});
it('keeps an oversized report source intact while stopping unsafe reading', async () => {
  const raw = seed(data({ ...report, body: 'x'.repeat(100001) })); const write = vi.spyOn(Storage.prototype, 'setItem'); await render(); expect(host.textContent).toContain('安全に取得できません'); expect(status()).not.toContain('確認済み'); expect(write).not.toHaveBeenCalled(); expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
});

it('timeline suppresses comparisons while stale and displays shared acquisition time without writes', async () => {
  const raw = seed(data(confirmed())); await render();
  const timeline = () => host.querySelector('[aria-label="根拠・確認履歴タイムライン"]')!;
  expect(timeline().textContent).toContain('比較対象の原本取得日時');
  expect(timeline().textContent).toContain('式定義：一致');
  expect(timeline().textContent).toContain('当時の判定結果そのものは記録なし');
  await act(async () => window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY })));
  expect(timeline().textContent).toContain('根拠未照合');
  expect(timeline().textContent).not.toContain('式定義：一致');
  expect(timeline().textContent).not.toContain('取得原本と一致');
  expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
  await click('保存済み詳細を再取得'); expect(timeline().textContent).toContain('式定義：一致');
});
