// @vitest-environment jsdom
import { act, createElement, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CalculatorApp } from '../components/CalculatorApp';
import { FormulaAuditRecordComparison } from '../components/FormulaAuditRecordComparison';
import { createAuditRecordMarkdown } from '../lib/formula-report-audit-record';
import { captureAuditComparison } from '../lib/formula-report-audit-comparison';
import { parseReportAudit, assessReportAudit } from '../lib/formula-report-audit';
import { createQuoteMarkdown, type QuoteSnapshot } from '../lib/formula-report-quotes';
import { defaultData, STORAGE_KEY } from '../lib/storage';
import type { EvidenceRecord } from '../lib/calculation-evidence';
import type { FormulaReport, StoredData } from '../lib/types';

const at = '2026-10-25T00:00:00.000Z';
const formula = { id: 'f', title: '2時点比較', expression: 'a+1', createdAt: at, updatedAt: at };
const record: EvidenceRecord = { id: 'source', evaluator: 'calculator-memo-v1', status: 'confirmed', calculatedAt: at, persistedAt: at, blocks: [{ blockId: 'b', position: 1, expression: '1+1', inputs: [], result: '2', resultText: '2', status: 'success' }] };
const quote: QuoteSnapshot = { version: 1, quoteId: 'q', formulaId: 'f', memoId: 'm', blockId: 'b', citedAt: at, record };
const info = (recordId: string) => ({ recordId, formulaId: 'f', reportId: 'r', generatedAt: at, bodySha256: 'a'.repeat(64), bodyLength: 10 });
function fixed(id: string, expression = '1+1') {
  const q = structuredClone(quote); q.record.blocks[0].expression = expression;
  const body = createQuoteMarkdown(q), inventory = parseReportAudit(body, 'f');
  const notes = [{ id: 'm', type: 'plain-calculation' as const, title: 'Synthetic', content: expression, createdAt: at, updatedAt: at, calculationEvidence: { version: 1 as const, records: [q.record] } }];
  const items = assessReportAudit(inventory, { notes, links: [{ memoId: 'm', recordId: 'source' }] });
  return createAuditRecordMarkdown('点検当時の固定記録', { ...info(id), comparison: captureAuditComparison(inventory, items, 'checked', at, 'ok', { editing: false, unsavedChanges: false, savedContextChanged: false }) });
}
const old = createAuditRecordMarkdown('旧形式の固定記録', info('legacy'));
const report: FormulaReport = { id: 'r', formulaId: 'f', title: '比較する説明', body: `${fixed('audit-a')}\n\n${fixed('audit-b', '2')}\n\n${old}`, createdAt: at, updatedAt: at, confirmedExpression: null, evidence: { version: 1, links: [{ memoId: 'm', recordId: 'source' }], confirmations: [{ id: 'confirmation', formulaId: 'f', confirmedAt: at, definition: { version: 1, expression: 'a+1', variables: ['a'] }, title: 'earlier confirmation', body: 'earlier body', links: [], evidenceSignature: '[]' }] } };
const original: StoredData = { ...defaultData, notes: [{ id: 'm', type: 'plain-calculation', title: 'Synthetic source', content: '1+1', createdAt: at, updatedAt: at, calculationEvidence: { version: 1, records: [record] } }], formulaLibrary: { version: 1, selectedId: 'f', entries: [formula] }, formulaReports: { version: 1, entries: [report] } };
let host: HTMLDivElement, root: Root;
const button = (label: string) => [...host.querySelectorAll('button')].find(node => node.textContent === label)!;
const click = async (label: string) => act(async () => { expect(button(label), label).toBeTruthy(); button(label).click(); });
const area = () => host.querySelector<HTMLElement>('[aria-label="固定点検記録の2時点比較"]')!;
const result = () => host.querySelector('[aria-label="2時点比較結果"]');
async function open() {
  await act(async () => root.render(createElement(CalculatorApp)));
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
  await click('登録式ライブラリ'); await click('関連レポートを閲覧・編集'); await click('根拠点検');
}
async function choose(which: 0 | 1, id: string) {
  const select = area().querySelectorAll('select')[which];
  const option = [...select.options].find(option => option.textContent?.includes(`：${id}（`))!;
  expect(option, id).toBeTruthy(); expect(option.disabled).toBe(false);
  await act(async () => { select.value = option.value; select.dispatchEvent(new Event('change', { bubbles: true })); });
}
async function compare() { await choose(0, 'audit-a'); await choose(1, 'audit-b'); await click('選択した2記録を比較'); expect(result()).not.toBeNull(); }
async function external(kind: 'changed' | 'deleted' | 'unrelated') {
  const next = structuredClone(original);
  if (kind === 'changed') next.formulaReports!.entries[0].body = 'external body';
  if (kind === 'deleted') next.formulaReports!.entries = [];
  if (kind === 'unrelated') next.notes.push({ id: 'other', type: 'plain-calculation', title: 'Other', content: '3', createdAt: at, updatedAt: at });
  const raw = JSON.stringify(next), oldValue = localStorage.getItem(STORAGE_KEY);
  localStorage.setItem(STORAGE_KEY, raw);
  await act(async () => window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, newValue: raw, oldValue, storageArea: localStorage })));
  return raw;
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  HTMLElement.prototype.scrollIntoView = vi.fn();
  localStorage.clear(); localStorage.setItem(STORAGE_KEY, JSON.stringify(original));
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });


const preview = () => area().querySelector<HTMLTextAreaElement>('textarea');
async function prepare() { await compare(); await click('比較結果Markdownをプレビュー'); expect(preview()).toBeTruthy(); }
function clipboard(writeText = vi.fn().mockResolvedValue(undefined)) { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } }); return writeText; }
it('real app previews, copies and downloads identical bytes without reading or modifying original data/history', async () => {
  const copy = clipboard();
  const create = vi.fn((blob: Blob) => { expect(blob.type).toBe('text/markdown;charset=utf-8'); return 'blob:synthetic'; }), revoke = vi.fn();
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: create }); Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revoke });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  await open(); expect(button('比較結果Markdownをプレビュー')).toBeUndefined(); await prepare();
  const markdown = preview()!.value; expect(markdown).toContain('audit-a'); expect(markdown).toContain('audit-b'); expect(markdown).toContain('変更あり');
  const raw = localStorage.getItem(STORAGE_KEY), reads = vi.spyOn(Storage.prototype, 'getItem'), writes = vi.spyOn(Storage.prototype, 'setItem');
  await click('比較結果Markdownをコピー'); expect(copy).toHaveBeenCalledWith(markdown); expect(area().textContent).toContain('比較結果をコピーしました');
  await click('比較結果を.md出力'); expect(create).toHaveBeenCalledOnce();
  const blobText = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsText(create.mock.calls[0][0]); }); expect(blobText).toBe(markdown);
  expect(area().textContent).toContain('保存完了はブラウザで確認');
  expect(preview()!.value).toBe(markdown); expect(reads).not.toHaveBeenCalled(); expect(writes).not.toHaveBeenCalled(); reads.mockRestore(); writes.mockRestore();
  expect(localStorage.getItem(STORAGE_KEY)).toBe(raw); expect(JSON.parse(raw!).formulaReports.entries[0].evidence).toEqual(report.evidence);
});
it('copy failure retains full preview for manual copy and permits retry; download failure is not success', async () => {
  const copy = clipboard(vi.fn().mockRejectedValueOnce(new Error('clipboard denied')).mockResolvedValue(undefined));
  await open(); await prepare(); const markdown = preview()!.value;
  await click('比較結果Markdownをコピー'); expect(area().textContent).toContain('コピーに失敗'); expect(preview()!.labels![0].textContent).toContain('手動コピー用'); expect(preview()!.value).toBe(markdown);
  await click('比較結果Markdownをコピー'); expect(copy).toHaveBeenCalledTimes(2); expect(area().textContent).toContain('比較結果をコピーしました');
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: () => { throw new Error('synthetic file failure'); } });
  await click('比較結果を.md出力'); expect(area().textContent).toContain('ファイル出力に失敗'); expect(area().textContent).not.toContain('ダウンロードを要求'); expect(preview()!.value).toBe(markdown);
});
it.each(['changed', 'deleted', 'unrelated'] as const)('real app storage %s invalidates output and late clipboard completion, keeps held-body constraint after recompare', async kind => {
  let done!: () => void; const copy = clipboard(vi.fn(() => new Promise<void>(resolve => { done = resolve; })));
  await open(); await prepare(); await click('比較結果Markdownをコピー'); expect(copy).toHaveBeenCalledOnce();
  const raw = await external(kind); await act(async () => done());
  if (!area()) await click('根拠点検'); expect(preview()).toBeNull(); expect(area().textContent).not.toContain('比較結果をコピーしました');
  await prepare(); expect(preview()!.value).toContain('一致'); expect(preview()!.value).toContain('未確認'); expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
});
it('same-turn storage event prevents stale download action before React commits', async () => {
  clipboard(); const create = vi.fn(() => 'blob:synthetic'); Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: create });
  await open(); await prepare(); const download = button('比較結果を.md出力');
  await act(async () => { window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, newValue: 'changed' })); download.click(); });
  expect(create).not.toHaveBeenCalled(); expect(preview()).toBeNull();
});
it.each(['select', 'swap', 'recompare', 'refresh', 'close'] as const)('%s invalidates old preview and pending copy rejection cannot restore manual field', async action => {
  let reject!: (reason: Error) => void; clipboard(vi.fn(() => new Promise<void>((_, fail) => { reject = fail; })));
  await open(); await prepare(); await click('比較結果Markdownをコピー');
  if (action === 'select') await choose(1, 'audit-a');
  if (action === 'swap') await click('比較元Aと比較先Bを入れ替える');
  if (action === 'recompare') await click('選択した2記録を比較');
  if (action === 'refresh') await click('保存記録と照合');
  if (action === 'close') { await click('根拠点検を閉じる'); await click('根拠点検'); }
  await act(async () => reject(new Error('late failure'))); expect(preview()).toBeNull(); expect(area().textContent).not.toContain('手動コピー用'); expect(area().textContent).not.toContain('late failure');
});
it('StrictMode replays remain usable and body/target/generation changes invalidate', async () => {
  clipboard();
  const render = async (generation = 0, body = report.body, formulaId = 'f') => act(async () => root.render(createElement(StrictMode, null, createElement(FormulaAuditRecordComparison, { body, formulaId, reportId: 'r', generation, onNavigate: vi.fn() }))));
  await render(); await prepare(); await click('比較結果Markdownをコピー'); expect(area().textContent).toContain('比較結果をコピーしました');
  await render(1); expect(preview()).toBeNull(); await prepare(); await render(1, report.body + '\nedit'); expect(preview()).toBeNull(); await prepare(); await render(1, report.body, 'other'); expect(preview()).toBeNull();
});
it('same selected record does not expose export despite displaying its comparison refusal', async () => {
  await open(); await choose(0, 'audit-a'); await choose(1, 'audit-a'); await click('選択した2記録を比較');
  expect(result()!.textContent).toContain('異なる固定点検記録'); expect(button('比較結果Markdownをプレビュー')).toBeUndefined();
});
it('both empty acquired records export the existing incomparable reason rather than upgrading to match', async () => {
  const inventory = { items: [], complete: true, reason: '認識できた項目なし' };
  const fixedEmpty = (recordId: string) => createAuditRecordMarkdown('0件', { ...info(recordId), comparison: captureAuditComparison(inventory, [], 'checked', at, 'ok') });
  const fixture = structuredClone(original); fixture.formulaReports!.entries[0].body = fixedEmpty('audit-a') + '\n\n' + fixedEmpty('audit-b'); localStorage.setItem(STORAGE_KEY, JSON.stringify(fixture));
  await open(); await prepare(); expect(preview()!.value).toContain('比較不能'); expect(preview()!.value).toContain('両記録に比較可能な根拠項目がありません'); expect(preview()!.value).toContain('取得成功は根拠の一致を意味しません');
});
it('failed explicit retrieval and unsaved editor edits both invalidate output without changing fixed bytes', async () => {
  clipboard(); await open(); await prepare();
  const read = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('synthetic acquisition failure'); });
  await click('保存記録と照合'); expect(preview()).toBeNull(); read.mockRestore();
  await prepare(); await click('根拠点検を閉じる'); await click('Markdownを編集');
  const editor = host.querySelector<HTMLTextAreaElement>('#formula-report-body')!, changed = report.body + '\n未保存の追記';
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(editor, changed); editor.dispatchEvent(new Event('input', { bubbles: true })); });
  await click('根拠点検'); expect(preview()).toBeNull(); await prepare();
  expect(editor.value).toBe(changed); expect(localStorage.getItem(STORAGE_KEY)).toBe(JSON.stringify(original));
});
it('same-turn reselection cannot export an old preview before the next render', async () => {
  const copy = clipboard(); await open(); await prepare(); const oldButton = button('比較結果Markdownをコピー');
  const select = area().querySelectorAll('select')[1]; const option = [...select.options].find(option => option.textContent?.includes('：audit-a（'))!;
  await act(async () => { select.value = option.value; select.dispatchEvent(new Event('change', { bubbles: true })); oldButton.click(); });
  expect(copy).not.toHaveBeenCalled(); expect(preview()).toBeNull();
});
