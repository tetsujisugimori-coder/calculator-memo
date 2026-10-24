// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { FormulaDifferenceSources } from '../components/FormulaDifferenceSources';
import { FormulaReportModal } from '../components/FormulaReportModal';
import { createTrackedDifferenceMarkdown, readDifferenceAssessments } from '../lib/formula-report-diff-tracking';
import { buildQuoteDifferenceMarkdown } from '../lib/formula-report-diff';
import { createQuoteMarkdown, type QuoteSnapshot } from '../lib/formula-report-quotes';
import type { QuoteSource } from '../components/FormulaQuoteComparison';
import type { EvidenceRecord } from '../lib/calculation-evidence';
import type { FormulaReport, Memo, RegisteredFormula } from '../lib/types';
import type { FormulaReportSaveRequest } from '../lib/formula-reports';
import { defaultData, STORAGE_KEY } from '../lib/storage';
import * as download from '../lib/markdown-report';

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
const region = (name: string) => host.querySelector(`[aria-label="${name}"]`);
const editor = () => host.querySelector<HTMLTextAreaElement>('#formula-report-body')!;
const source = (records = notes()): QuoteSource => ({ notes: records, fetchedAt: at });
const render = async (body = tracked(), acquired = source(), reportId = 'report', savedLinks = links) => act(async () => root.render(createElement(FormulaDifferenceSources, { body, source: acquired, formulaId: 'f', reportId, links: savedLinks, onRefresh: refresh })));
const open = async () => click('比較差分1の出典を確認');
const seed = (r = report(), records = notes()) => { const raw = JSON.stringify({ ...defaultData, notes: records, formulaLibrary: { version: 1, selectedId: 'f', entries: [formula] }, formulaReports: { version: 1, entries: [r] } }); localStorage.setItem(STORAGE_KEY, raw); return raw; };
const renderEditor = async (r = report()) => act(async () => root.render(createElement(FormulaReportModal, { formulaId: r.formulaId, formula, report: r, writable: true, onClose: close, onSave: save })));
const edit = async (text: string) => act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(editor(), text); editor().dispatchEvent(new Event('input', { bubbles: true })); });
beforeEach(() => { localStorage.clear(); Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); host = document.createElement('div'); document.body.append(host); root = createRoot(host); refresh.mockReset(); close.mockReset(); save.mockReset(); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); });

it('shows both record identities and their observed dates without pretending preparation is confirmation', async () => {
  const raw = seed(); await render(); await open();
  expect(region('比較元の出典')!.textContent).toContain('original'); expect(region('比較先の出典')!.textContent).toContain('target');
  expect(host.textContent).toContain('元引用ID：q1'); expect(host.textContent).toContain('差分ID：difference1');
  expect(host.textContent).toContain('確認日時：計算記録には記録なし'); expect(host.textContent).toContain('保存完了・確認日時ではありません');
  expect(region('引用時点の比較差分')).toBeNull(); expect(region('現在の出典の比較差分')).toBeNull();
  expect(localStorage.getItem(STORAGE_KEY)).toBe(raw); expect(save).not.toHaveBeenCalled();
});
it('historical and current comparisons require separate explicit actions and show internal negative zero', async () => {
  await render(); await open(); await click('引用時点の比較を再確認');
  expect(region('引用時点の比較差分')!.textContent).toContain('-0'); expect(region('引用時点の比較差分')!.textContent).toContain('内部結果');
  await click('出典の比較を閉じる'); expect(region('現在の出典の比較差分')).toBeNull();
  await click('現在の出典同士を比較'); expect(region('現在の出典の比較差分')).not.toBeNull(); expect(region('引用時点の比較差分')).toBeNull();
});
it('same-ID changed sources never replace either frozen record or historical comparison', async () => {
  const changed = structuredClone(before); changed.blocks[0].result = '12345'; changed.blocks[0].resultText = '12345';
  const body = tracked(); const raw = seed(report(body), notes([changed, after])); await render(body, source(notes([changed, after]))); await open();
  expect(region('比較元の出典')!.textContent).toContain('変更'); await click('引用時点の比較を再確認');
  expect(region('引用時点の比較差分')!.textContent).not.toContain('12345'); expect(region('引用時点の比較差分')!.textContent).toContain('-0');
  await click('出典の比較を閉じる'); await click('現在の出典同士を比較'); expect(region('現在の出典の比較差分')!.textContent).toContain('12345');
  expect(readDifferenceAssessments(body, 'f', notes([changed, after]))[0].snapshot!.quote.record).toEqual(before);
  expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
});
it.each(['before', 'after'] as const)('missing %s source blocks current comparison but keeps historical evidence usable', async side => {
  await render(tracked(), source(notes(side === 'before' ? [after] : [before]))); await open();
  expect(region(side === 'before' ? '比較元の出典' : '比較先の出典')!.textContent).toContain('欠落');
  expect(button('現在の出典同士を比較').disabled).toBe(true); expect(button(side === 'before' ? '比較元の保存記録を開く' : '比較先の保存記録を開く').disabled).toBe(true);
  await click('引用時点の比較を再確認'); expect(region('引用時点の比較差分')!.textContent).toContain('-0');
});
it('failed acquisition is not called missing and historical evidence remains explicit', async () => {
  await render(tracked(), { ...source([]), error: 'read failed' }); await open();
  expect(region('比較元の出典')!.textContent).toContain('取得失敗'); expect(region('比較元の出典')!.textContent).toContain('欠落とは断定しません');
  expect(button('現在の出典同士を比較').disabled).toBe(true); await click('引用時点の比較を再確認'); expect(region('引用時点の比較差分')).not.toBeNull();
});
it('unknown source fields are unavailable rather than matched and are preserved', async () => {
  const unknown = { ...structuredClone(after), futureField: 'keep' }; const raw = seed(report(), notes([before, unknown]));
  await render(tracked(), source(notes([before, unknown]))); await open(); expect(region('比較先の出典')!.textContent).toContain('未知・不正');
  expect(button('比較先の保存記録を開く').disabled).toBe(true); expect(button('現在の出典同士を比較').disabled).toBe(true); expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
});
it.each(['future', 'broken', 'foreign'] as const)('invalid %s tracking cannot be used as a guessed source', async kind => {
  let body = tracked();
  if (kind === 'future') body = body.replace('calculator-memo-difference-v1', 'calculator-memo-difference-v9');
  if (kind === 'broken') body = body.replace('"quote":{', '"quote":null,"discard":{');
  if (kind === 'foreign') body = body.replace('"formulaId":"f"', '"formulaId":"another-formula"');
  const raw = seed(report(body)); await render(body); await open(); expect(host.textContent).toContain('検証できる追跡情報がありません');
  expect(button('引用時点の比較を再確認')).toBeUndefined(); expect(button('現在の出典同士を比較')).toBeUndefined(); expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
});
it('legacy plain difference is disclosed as untracked and never gets inferred metadata', async () => {
  const raw = seed(report(visible)); await render(visible); await open(); expect(host.textContent).toContain('追跡情報なし'); expect(host.textContent).toContain('推測せず');
  expect(button('引用時点の比較を再確認')).toBeUndefined(); expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
});
it('edited visible prose is separated from valid source states and frozen comparison', async () => {
  const body = tracked().replace('### 観測された変更', '### 利用者が書き直した説明'); await render(body); await open();
  expect(host.textContent).toContain('本文が編集されています'); expect(region('比較元の出典')!.textContent).toContain('一致');
  await click('引用時点の比較を再確認'); expect(region('引用時点の比較差分')!.textContent).toContain('本文編集後の文章そのものを比較していません');
});
it('unlinked sources remain distinguishable without attaching links or discarding their snapshots', async () => {
  await render(tracked(), source(), 'report', []); await open(); expect(host.textContent).toContain('現在の保存済み根拠リンクにはありません');
  expect(button('現在の出典同士を比較').disabled).toBe(false); expect(refresh).not.toHaveBeenCalled();
});
it('multiple differences are selected by structural identity and switching clears previous views', async () => {
  await render(`${tracked('first')}\n\n${tracked('second')}`); await open(); await click('引用時点の比較を再確認');
  await click('出典の比較を閉じる'); await click('出典確認を閉じる'); await click('比較差分2の出典を確認');
  expect(host.querySelector('[role="dialog"]')!.textContent).toContain('差分ID：second'); expect(region('引用時点の比較差分')).toBeNull();
});
it.each(['report', 'body'] as const)('%s changes close old tracking and comparison rather than mixing contexts', async change => {
  const acquired = source(); const body = tracked(); await render(body, acquired); await open(); await click('現在の出典同士を比較');
  await render(change === 'body' ? body + '\n未保存追記' : body, acquired, change === 'report' ? 'other-report' : 'report');
  expect(host.querySelector('[role="dialog"]')).toBeNull(); expect(region('現在の出典の比較差分')).toBeNull();
});
it.each(['notes', 'time', 'stale', 'error'] as const)('%s changes invalidate an open current comparison immediately', async change => {
  const acquired = source(); const body = tracked(); await render(body, acquired); await open(); await click('現在の出典同士を比較');
  const next = change === 'notes' ? { ...acquired, notes: notes() } : change === 'time' ? { ...acquired, fetchedAt: '2026-10-24T00:00:01.000Z' } : change === 'stale' ? { ...acquired, stale: true } : { ...acquired, error: 'read failed' };
  await render(body, next); expect(region('現在の出典の比較差分')).toBeNull();
  if (change === 'stale' || change === 'error') expect(button('現在の出典同士を比較').disabled).toBe(true);
});
it('explicit refresh discards current view and invokes only acquisition', async () => {
  const raw = seed(); await render(); await open(); await click('現在の出典同士を比較'); await click('差分出典の保存原本を再取得');
  expect(region('現在の出典の比較差分')).toBeNull(); expect(refresh).toHaveBeenCalledOnce(); expect(localStorage.getItem(STORAGE_KEY)).toBe(raw); expect(save).not.toHaveBeenCalled();
});
it('detail and comparison Escape return focus to the corresponding trigger', async () => {
  await render(); const outer = button('比較差分1の出典を確認'); outer.focus(); await open();
  for (const name of ['比較元の保存記録を開く', '比較先の保存記録を開く', '引用時点の比較を再確認', '現在の出典同士を比較']) {
    const trigger = button(name); trigger.focus(); await click(name);
    await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    expect(document.activeElement).toBe(trigger); expect(host.querySelectorAll('[role="dialog"]')).toHaveLength(1);
  }
  await click('出典確認を閉じる'); expect(document.activeElement).toBe(outer);
});
it('new insertion carries both frozen records through explicit save and reload', async () => {
  const r = report(`本文\n\n${createQuoteMarkdown(quote)}`); const raw = seed(r); await renderEditor(r); await click('Markdownを編集'); editor().setSelectionRange(0, 0);
  await click('別の保存記録と比較'); const select = host.querySelector<HTMLSelectElement>('[aria-label="比較先の保存記録"]')!;
  await act(async () => { select.value = JSON.stringify(['m', 'target']); select.dispatchEvent(new Event('change', { bubbles: true })); });
  await click('差分をレポートに挿入'); await click('この差分を本文へ挿入'); const added = editor().value;
  expect(readDifferenceAssessments(added, 'f', notes())[0].snapshot!.quote).toEqual(quote); expect(readDifferenceAssessments(added, 'f', notes())[0].snapshot!.after).toEqual(after);
  expect(localStorage.getItem(STORAGE_KEY)).toBe(raw); expect(save).not.toHaveBeenCalled();
  let persisted = r; save.mockImplementation(async request => { persisted = { ...r, body: request.body }; seed(persisted); return persisted; });
  await click('レポートを保存'); expect(save).toHaveBeenCalledWith(expect.objectContaining({ body: added, confirm: false }));
  await act(async () => root.unmount()); root = createRoot(host); await renderEditor(persisted); await open();
  expect(region('比較元の出典')!.textContent).toContain('original'); expect(region('比較先の出典')!.textContent).toContain('target'); expect(persisted.evidence!.confirmations).toEqual([]);
});
it('storage update and failed refresh preserve unsaved editor body, raw data, and history', async () => {
  const r = report(); seed(r); await renderEditor(r); await click('Markdownを編集'); const draft = r.body + '\n未保存説明'; await edit(draft); await open(); await click('現在の出典同士を比較');
  const bad = '{broken'; localStorage.setItem(STORAGE_KEY, bad);
  await act(async () => window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, newValue: bad })));
  expect(region('現在の出典の比較差分')).toBeNull(); expect(button('現在の出典同士を比較').disabled).toBe(true);
  vi.spyOn(console, 'error').mockImplementation(() => {}); await click('差分出典の保存原本を再取得');
  expect(host.textContent).toContain('保存データが未知・不正な形式'); expect(editor().value).toBe(draft); expect(localStorage.getItem(STORAGE_KEY)).toBe(bad); expect(save).not.toHaveBeenCalled();
  seed(r); await click('差分出典の保存原本を再取得'); expect(region('現在の出典の比較差分')).toBeNull(); expect(editor().value).toBe(draft); expect(r.evidence!.confirmations).toEqual([]);
});
it('failed save keeps source metadata and draft; copying and exporting do not reserialize it', async () => {
  const r = report(); const raw = seed(r); const copied = vi.fn().mockResolvedValue(undefined); Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: copied } });
  const output = vi.spyOn(download, 'downloadMarkdownReport').mockImplementation(() => {}); save.mockResolvedValue('保存失敗');
  await renderEditor(r); await click('Markdownを編集'); const draft = r.body + '\n追加'; await edit(draft); await open(); await click('引用時点の比較を再確認'); await click('出典の比較を閉じる'); await click('出典確認を閉じる');
  await click('レポートを保存'); expect(host.textContent).toContain('保存失敗'); expect(editor().value).toBe(draft); expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
  await click('レポート本文をコピー'); await click('レポート.mdをダウンロード'); expect(copied).toHaveBeenCalledWith(draft); expect(output).toHaveBeenCalledWith(expect.objectContaining({ markdown: draft }));
  expect(readDifferenceAssessments(draft, 'f', notes())[0].snapshot!.quote).toEqual(quote); expect(r.evidence!.confirmations).toEqual([]);
});
it('duplicate difference identities are rejected instead of selecting an arbitrary matching section', async () => {
  const body = `${tracked()}\n\n${tracked()}`; const raw = seed(report(body)); await render(body); await open();
  expect(host.textContent).toContain('差分IDが重複'); expect(button('引用時点の比較を再確認')).toBeUndefined(); expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
});
it('malformed current record remains distinct from missing source and does not erase frozen evidence', async () => {
  const broken = structuredClone(after); broken.blocks[0].result = 'not-a-number'; const raw = seed(report(), notes([before, broken]));
  await render(tracked(), source(notes([before, broken]))); await open();
  expect(region('比較先の出典')!.textContent).toContain('未知・不正'); expect(button('現在の出典同士を比較').disabled).toBe(true);
  await click('引用時点の比較を再確認'); expect(region('引用時点の比較差分')!.textContent).toContain('-0'); expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
});
it('source switching drops an already-open comparison even when the outer body is unchanged', async () => {
  const body = `${tracked('one')}\n\n${tracked('two')}`; await render(body); await open(); await click('現在の出典同士を比較');
  await click('比較差分2の出典を確認'); expect(region('現在の出典の比較差分')).toBeNull();
  expect(host.querySelector('[role="dialog"]')!.textContent).toContain('差分ID：two');
});
it('same-formula report identity change closes the previous report source and comparison dialogs', async () => {
  const r = report(); const raw = seed(r); await renderEditor(r); await click('Markdownを編集'); const draft = `${r.body}\n未保存の前レポート本文`; await edit(draft);
  await open(); await click('現在の出典同士を比較'); expect(region('現在の出典の比較差分')).not.toBeNull();
  await renderEditor({ ...r, id: 'another-report', body: '別レポート本文' });
  expect(region('現在の出典の比較差分')).toBeNull(); expect(button('出典確認を閉じる')).toBeUndefined();
  expect(host.querySelectorAll('[role="dialog"]')).toHaveLength(1); expect(editor().value).toBe(draft); expect(localStorage.getItem(STORAGE_KEY)).toBe(raw); expect(save).not.toHaveBeenCalled();
});
it.each([
  ['invalid JSON', '{broken'],
  ['unsupported version', JSON.stringify({ ...defaultData, version: 999 })],
  ['invalid required data', JSON.stringify({ ...defaultData, notes: 'broken' })],
])('explicit refresh identifies %s as invalid data, not an absent record or access failure', async (_, brokenRaw) => {
  const r = report(); seed(r); await renderEditor(r); await click('Markdownを編集'); const draft = `${r.body}\n未保存説明`; await edit(draft); await open(); await click('現在の出典同士を比較');
  localStorage.setItem(STORAGE_KEY, brokenRaw); vi.spyOn(console, 'error').mockImplementation(() => {}); await click('差分出典の保存原本を再取得');
  expect(region('現在の出典の比較差分')).toBeNull(); expect(region('比較元の出典')!.textContent).toContain('保存データが未知・不正');
  expect(region('比較先の出典')!.textContent).toContain('保存データが未知・不正'); expect(region('比較先の出典')!.textContent).not.toContain('原本取得失敗');
  expect(button('現在の出典同士を比較').disabled).toBe(true); await click('引用時点の比較を再確認');
  expect(region('引用時点の比較差分')!.textContent).toContain('original'); expect(region('引用時点の比較差分')!.textContent).toContain('target');
  expect(editor().value).toBe(draft); expect(localStorage.getItem(STORAGE_KEY)).toBe(brokenRaw); expect(save).not.toHaveBeenCalled();
});
it('storage access throwing on refresh is a fetch failure rather than invalid data, with both frozen records intact', async () => {
  const r = report(); const raw = seed(r); await renderEditor(r); await click('Markdownを編集'); const draft = `${r.body}\n未保存説明`; await edit(draft); await open(); await click('現在の出典同士を比較');
  const get = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('storage unavailable'); }); vi.spyOn(console, 'error').mockImplementation(() => {});
  await click('差分出典の保存原本を再取得');
  expect(region('現在の出典の比較差分')).toBeNull(); expect(region('比較元の出典')!.textContent).toContain('原本取得失敗');
  expect(region('比較先の出典')!.textContent).toContain('原本取得失敗'); expect(region('比較先の出典')!.textContent).not.toContain('保存データが未知・不正');
  expect(button('現在の出典同士を比較').disabled).toBe(true); await click('引用時点の比較を再確認');
  expect(region('引用時点の比較差分')!.textContent).toContain('original'); expect(region('引用時点の比較差分')!.textContent).toContain('target'); expect(editor().value).toBe(draft);
  get.mockRestore(); expect(localStorage.getItem(STORAGE_KEY)).toBe(raw); expect(save).not.toHaveBeenCalled();
});
it('when both current records lack the cited block, another block requires explicit selection and remains reachable', async () => {
  const changedBefore = structuredClone(before), changedAfter = structuredClone(after);
  changedBefore.blocks[0] = { ...changedBefore.blocks[0], blockId: 'remaining', expression: '4', result: '4', resultText: '4' };
  changedAfter.blocks[0] = { ...changedAfter.blocks[0], blockId: 'remaining', expression: '5', result: '5', resultText: '5' };
  const raw = seed(report(), notes([changedBefore, changedAfter])); await render(tracked(), source(notes([changedBefore, changedAfter]))); await open(); await click('現在の出典同士を比較');
  const current = region('現在の出典の比較差分')!; expect(current.textContent).toContain('両記録に存在しません');
  const select = current.querySelector<HTMLSelectElement>('select')!; expect(select.value).toBe(''); expect(current.querySelector('[aria-label="選択ブロックの差分"]')).toBeNull();
  expect([...select.options].some(option => option.value === 'remaining')).toBe(true);
  await act(async () => { select.value = 'remaining'; select.dispatchEvent(new Event('change', { bubbles: true })); });
  expect(current.querySelector('[aria-label="選択ブロックの差分"]')!.textContent).toContain('ブロックID：remaining'); expect(select.value).toBe('remaining'); expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
});
