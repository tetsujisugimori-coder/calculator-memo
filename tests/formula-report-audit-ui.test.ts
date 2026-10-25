// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
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
const save = vi.fn<(request: FormulaReportSaveRequest) => Promise<FormulaReport | string>>();
const button = (name: string) => [...host.querySelectorAll('button')].find(node => node.textContent === name)!;
const click = async (name: string) => act(async () => { expect(button(name), name).toBeTruthy(); button(name).click(); });
const editor = () => host.querySelector<HTMLTextAreaElement>('#formula-report-body')!;
const seed = (r = report(), records = notes()) => { const raw = JSON.stringify({ ...defaultData, notes: records, formulaLibrary: { version: 1, selectedId: 'f', entries: [formula] }, formulaReports: { version: 1, entries: [r] } }); localStorage.setItem(STORAGE_KEY, raw); return raw; };
const renderEditor = async (r = report()) => act(async () => root.render(createElement(FormulaReportModal, { formulaId: r.formulaId, formula, report: r, writable: true, onClose: close, onSave: save })));
beforeEach(() => { HTMLElement.prototype.scrollIntoView = vi.fn(); localStorage.clear(); Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); host = document.createElement('div'); document.body.append(host); root = createRoot(host); refresh.mockReset(); close.mockReset(); save.mockReset(); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); });

const navigate = vi.fn();
const audit = async (body = `${createQuoteMarkdown(quote)}\n\n${tracked()}`, key = 'one') => act(async () => root.render(createElement(FormulaReportAudit, { key, body, formulaId: 'f', editing: true, onNavigate: navigate })));
const openAudit = async () => click('根拠点検');
const auditRegion = () => host.querySelector('[aria-label="本文順の根拠一覧"]')!;
it('starts unverified without reading storage; explicit checking reads exactly one original and never writes', async () => {
  const raw = seed(); const read = vi.spyOn(Storage.prototype, 'getItem'), write = vi.spyOn(Storage.prototype, 'setItem');
  await audit(); await openAudit(); expect(read).not.toHaveBeenCalled(); expect(auditRegion().textContent).toContain('未照合');
  await click('保存記録と照合'); expect(read).toHaveBeenCalledTimes(1); expect(write).not.toHaveBeenCalled();
  expect(auditRegion().textContent!.match(/保存記録と一致/g)).toHaveLength(3); expect(host.textContent).toContain('出現 2件／見直し対象 0件');
  expect(localStorage.getItem(STORAGE_KEY)).toBe(raw); expect(save).not.toHaveBeenCalled();
});
it('reads edited body only and separates edited text from matching source and unchanged frozen values', async () => {
  const body = createQuoteMarkdown(quote).replace('当時の表示結果：', '改稿：'); const raw = seed(); await audit(body); await openAudit(); await click('保存記録と照合');
  expect(host.textContent).toContain('編集中の本文が対象'); expect(auditRegion().textContent).toContain('本文編集・対応未保証'); expect(auditRegion().textContent).toContain('保存記録と一致');
  await click('根拠1の詳細'); expect(host.textContent).toContain('引用時点の固定記録'); expect(host.textContent).toContain('当時の内部結果-0'); expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
});
it('keeps both source states and association loss independent', async () => {
  const r = report(); r.evidence!.links = [links[0]]; seed(r, notes([before])); await audit(tracked()); await openAudit(); await click('保存記録と照合');
  expect(auditRegion().textContent).toContain('比較元：保存記録と一致'); expect(auditRegion().textContent).toContain('比較先：記録・ブロック欠落'); expect(auditRegion().textContent).toContain('関連付け解除'); expect(host.textContent).toContain('見直し対象 1件');
  await click('根拠1の詳細'); await click('引用時点の比較を再確認'); expect(host.querySelector('[aria-label="引用時点の比較差分"]')).not.toBeNull();
});
it.each(['invalid', 'failure'])('failed refresh %s replaces old success without changing original', async mode => {
  seed(); await audit(); await openAudit(); await click('保存記録と照合');
  const spy = vi.spyOn(Storage.prototype, 'getItem'); if (mode === 'failure') spy.mockImplementation(() => { throw new DOMException('blocked'); }); else spy.mockReturnValue('{bad');
  const error = vi.spyOn(console, 'error').mockImplementation(() => {}); await click('保存記録と照合');
  expect(auditRegion().textContent).not.toContain('保存記録と一致'); expect(host.textContent).toContain(mode === 'invalid' ? '未知・不正' : '取得失敗'); expect(auditRegion().textContent).not.toContain('記録・ブロック欠落');
  spy.mockRestore(); error.mockRestore(); await click('保存記録と照合'); expect(auditRegion().textContent).toContain('保存記録と一致');
});
it('storage change expires results/details without automatic re-read and explicit refresh recovers', async () => {
  seed(); await audit(); await openAudit(); await click('保存記録と照合'); await click('根拠1の詳細');
  const read = vi.spyOn(Storage.prototype, 'getItem'); await act(async () => window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, newValue: 'new-generation' })));
  expect(host.textContent).not.toContain('引用時点の固定記録'); expect(auditRegion().textContent).not.toContain('保存記録と一致'); expect(read).not.toHaveBeenCalled();
  await click('保存記録と照合'); expect(auditRegion().textContent).toContain('保存記録と一致');
});
it('identity generation change destroys prior detail, filter and results', async () => {
  seed(); await audit(); await openAudit(); await click('保存記録と照合'); await click('根拠1の詳細');
  await audit(tracked(), 'new-report-body-generation'); expect(host.textContent).not.toContain('引用時点の固定記録'); await openAudit(); expect(auditRegion().textContent).not.toContain('保存記録と一致');
});
it('filters per occurrence without changing body, and close returns focus', async () => {
  const body = `${createQuoteMarkdown(quote)}\n\n${tracked()}`, raw = seed(); await audit(body); const entry = button('根拠点検'); entry.focus(); await openAudit(); await click('保存記録と照合');
  const select = host.querySelector<HTMLSelectElement>('select[aria-label="表示する状態"]')!; await act(async () => { select.value = 'review'; select.dispatchEvent(new Event('change', { bubbles: true })); }); expect(auditRegion().children).toHaveLength(0); expect(host.textContent).toContain('該当する項目はありません');
  await click('根拠点検を閉じる'); expect(document.activeElement).toBe(entry); expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
});
it('invalid tracking has no exposed snapshot or enabled guessed jump', async () => {
  seed(); await audit(`${createQuoteMarkdown(quote)}\n\n${createQuoteMarkdown(quote)}`); await openAudit(); await click('保存記録と照合');
  expect(button('根拠1の本文へ移動').disabled).toBe(true); await click('根拠1の詳細'); expect(host.textContent).toContain('不正なsnapshotの詳細を推測して表示しません'); expect(host.textContent).not.toContain('引用時点の固定記録');
});
it.each(['', '```calculator-memo-difference-start-v1\n{"version":1,"differenceId":"broken"}\n```\n\n'])('empty or incomplete never claims all matched or complete', async body => {
  seed(); await audit(body); await openAudit(); await click('保存記録と照合'); expect(host.textContent).not.toContain('全件一致しました');
  expect(host.textContent).toContain(body ? '集計は不完全' : '列挙できる根拠項目がありません');
});
it.each(['\n', '\r\n'])('report jump selects exact UTF16 span after preview and preserves raw %j', async newline => {
  const body = `日本語😀${newline}${newline}${createQuoteMarkdown(quote).replaceAll('\n', newline)}`; const r = report(body), raw = seed(r); await renderEditor(r); await click('根拠点検'); await click('根拠1の本文へ移動');
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 25)); });
  expect(editor()).not.toBeNull(); expect(editor().selectionStart).toBe('日本語😀\n\n'.length); expect(editor().value.slice(editor().selectionStart, editor().selectionEnd)).toBe(createQuoteMarkdown(quote)); expect(localStorage.getItem(STORAGE_KEY)).toBe(raw); expect(save).not.toHaveBeenCalled();
});
it('same-tab original generation, edited links, and report identity invalidate report-level audit', async () => {
  const r = report(), raw = seed(r); let props = { formulaId: 'f', formula, report: r, writable: true, onClose: close, onSave: save, originalGeneration: raw };
  await act(async () => root.render(createElement(FormulaReportModal, props))); await click('根拠点検'); await click('保存記録と照合'); await click('根拠1の詳細');
  props = { ...props, originalGeneration: raw + ' ' }; await act(async () => root.render(createElement(FormulaReportModal, props)));
  expect(host.querySelector('[aria-label="比較元の出典"]')).toBeNull(); await click('根拠点検'); expect(auditRegion().textContent).toContain('未照合');
});
it.each(['initial', 'failure', 'stale'])('unverified links are not presented as absent in difference detail (%s)', async mode => {
  seed(); await audit(tracked()); await openAudit();
  if (mode !== 'initial') {
    if (mode === 'failure') vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    await click('保存記録と照合');
    if (mode === 'stale') await act(async () => window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, newValue: 'changed' })));
  }
  await click('根拠1の詳細'); expect(host.textContent).not.toContain('現在の保存済み根拠リンクにはありません');
});
it('does not navigate using old offsets after generation change before animation frame', async () => {
  const r = report(createQuoteMarkdown(quote)), raw = seed(r); let scheduled: FrameRequestCallback | undefined;
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => { scheduled = callback; return 1; });
  const props = { formulaId: 'f', formula, report: r, writable: true, onClose: close, onSave: save, originalGeneration: raw };
  await act(async () => root.render(createElement(FormulaReportModal, props))); await click('根拠点検'); await click('根拠1の本文へ移動');
  expect(scheduled).toBeDefined(); await act(async () => root.render(createElement(FormulaReportModal, { ...props, originalGeneration: raw + ' ' })));
  editor().setSelectionRange(2, 2); await act(async () => scheduled!(1)); expect(editor().selectionStart).toBe(2); expect(editor().selectionEnd).toBe(2);
});
it('does not navigate using old offsets after other-tab event before animation frame, including repeated invalidation', async () => {
  const r = report(createQuoteMarkdown(quote)); seed(r); let scheduled: FrameRequestCallback | undefined;
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation(callback => { scheduled = callback; return 1; }); await renderEditor(r);
  for (const value of ['first-update', 'second-update']) {
    await click('根拠点検'); await click('根拠1の本文へ移動'); editor().setSelectionRange(2, 2);
    await act(async () => window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, newValue: value })));
    await act(async () => scheduled!(1)); expect(editor().selectionStart).toBe(2); expect(editor().selectionEnd).toBe(2);
  }
});
