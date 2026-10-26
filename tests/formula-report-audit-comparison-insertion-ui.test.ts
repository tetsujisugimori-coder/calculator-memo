// @vitest-environment jsdom
import { act, createElement, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CalculatorApp } from '../components/CalculatorApp';
import { FormulaReportModal } from '../components/FormulaReportModal';
import { createAuditRecordMarkdown, scanAuditRecordEnvelopes } from '../lib/formula-report-audit-record';
import { scanAuditComparisonRecordEnvelopes } from '../lib/formula-report-audit-comparison-record';
import { captureAuditComparison } from '../lib/formula-report-audit-comparison';
import { parseReportAudit, assessReportAudit } from '../lib/formula-report-audit';
import { createQuoteMarkdown, type QuoteSnapshot } from '../lib/formula-report-quotes';
import { defaultData, STORAGE_KEY } from '../lib/storage';
import { readFormulaReports } from '../lib/formula-reports';
import type { EvidenceRecord } from '../lib/calculation-evidence';
import type { FormulaReport, StoredData } from '../lib/types';

const at = '2026-10-25T00:00:00.000Z';
const formula = { id: 'f', title: '比較資料の式', expression: 'a+1', createdAt: at, updatedAt: at };
const record: EvidenceRecord = { id: 'source', evaluator: 'calculator-memo-v1', status: 'confirmed', calculatedAt: at, persistedAt: at, blocks: [{ blockId: 'b', position: 1, expression: '1+1', inputs: [], result: '2', resultText: '2', status: 'success' }] };
const quote: QuoteSnapshot = { version: 1, quoteId: 'q', formulaId: 'f', memoId: 'm', blockId: 'b', citedAt: at, record };
const info = (recordId: string) => ({ recordId, formulaId: 'f', reportId: 'r', generatedAt: at, bodySha256: 'a'.repeat(64), bodyLength: 10 });
function fixed(id: string, expression: string | null = '1+1') {
  const q = structuredClone(quote); q.record.blocks[0].expression = expression ?? '1+1';
  const body = expression === null ? '' : createQuoteMarkdown(q), inventory = parseReportAudit(body, 'f');
  const notes = [{ id: 'm', type: 'plain-calculation' as const, title: 'Synthetic', content: '1+1', createdAt: at, updatedAt: at, calculationEvidence: { version: 1 as const, records: [q.record] } }];
  const items = assessReportAudit(inventory, { notes, links: [{ memoId: 'm', recordId: 'source' }] });
  return createAuditRecordMarkdown('点検当時の固定記録', { ...info(id), comparison: captureAuditComparison(inventory, items, 'checked', at, 'ok', { editing: false, unsavedChanges: false, savedContextChanged: false }) });
}
const prefix = '前文　日本語😀 e\u0301 | <tag>\n同じ文章\n';
const report: FormulaReport = { id: 'r', formulaId: 'f', title: '比較する説明', body: `${prefix}\n${fixed('audit-a')}\n\n${fixed('audit-b', '2')}\n\n${createQuoteMarkdown(quote)}\n\n同じ文章\n後文`, createdAt: at, updatedAt: at, confirmedExpression: null, evidence: { version: 1, links: [{ memoId: 'm', recordId: 'source' }], confirmations: [{ id: 'confirmation', formulaId: 'f', confirmedAt: at, definition: { version: 1, expression: 'a+1', variables: ['a'] }, title: 'earlier confirmation', body: 'earlier body', links: [], evidenceSignature: '[]' }] } };
const original: StoredData = { ...defaultData, notes: [{ id: 'm', type: 'plain-calculation', title: 'Synthetic source', content: '1+1', createdAt: at, updatedAt: at, calculationEvidence: { version: 1, records: [record] } }], formulaLibrary: { version: 1, selectedId: 'f', entries: [formula] }, formulaReports: { version: 1, entries: [report] } };
let host: HTMLDivElement, root: Root, fixture: StoredData;
const button = (label: string) => [...host.querySelectorAll('button')].find(node => node.textContent === label)!;
const click = async (label: string) => act(async () => { expect(button(label), label).toBeTruthy(); button(label).click(); });
const area = () => host.querySelector<HTMLElement>('[aria-label="固定点検記録の2時点比較"]')!;
const material = () => host.querySelector<HTMLElement>('[aria-label="比較資料の固定挿入プレビュー"]');
const draft = () => material()?.querySelector<HTMLTextAreaElement>('textarea')?.value;
const editor = () => host.querySelector<HTMLTextAreaElement>('#formula-report-body')!;
const exportText = () => area().querySelector<HTMLTextAreaElement>('textarea')!.value;
const normalize = (text: string) => text.replace(/\r\n?/g, '\n');
function seed(value = structuredClone(original)) { fixture = value; localStorage.setItem(STORAGE_KEY, JSON.stringify(value)); }
async function change(value: string) { await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(editor(), value); editor().dispatchEvent(new Event('input', { bubbles: true })); }); }
async function position(start: number, end = start) { await act(async () => { editor().setSelectionRange(start, end); editor().dispatchEvent(new Event('select', { bubbles: true })); }); }
async function open(strict = false, start = 0, end = start) {
  await act(async () => root.render(strict ? createElement(StrictMode, null, createElement(CalculatorApp)) : createElement(CalculatorApp)));
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
  await click('登録式ライブラリ'); await click('関連レポートを閲覧・編集'); await click('Markdownを編集'); await position(start, end); await click('根拠点検');
}
async function choose(which: 0 | 1, id: string) {
  const select = area().querySelectorAll('select')[which];
  const option = [...select.options].find(option => option.textContent?.includes(`：${id}（`))!;
  expect(option, id).toBeTruthy(); expect(option.disabled).toBe(false);
  await act(async () => { select.value = option.value; select.dispatchEvent(new Event('change', { bubbles: true })); });
}
async function compare(reverse = false) { await choose(0, reverse ? 'audit-b' : 'audit-a'); await choose(1, reverse ? 'audit-a' : 'audit-b'); await click('選択した2記録を比較'); }
async function prepare() { await compare(); await click('比較結果をレポートに挿入'); expect(material(), host.textContent ?? '').toBeTruthy(); }
async function external(kind: 'changed' | 'deleted' | 'unrelated') {
  const next = structuredClone(fixture);
  if (kind === 'changed') next.formulaReports!.entries[0].body = 'external body';
  if (kind === 'deleted') next.formulaReports!.entries = [];
  if (kind === 'unrelated') next.notes.push({ id: 'other', type: 'plain-calculation', title: 'Other', content: '3', createdAt: at, updatedAt: at });
  const raw = JSON.stringify(next), oldValue = localStorage.getItem(STORAGE_KEY); localStorage.setItem(STORAGE_KEY, raw);
  await act(async () => window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, newValue: raw, oldValue, storageArea: localStorage })));
  return raw;
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  HTMLElement.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1)); vi.stubGlobal('cancelAnimationFrame', vi.fn());
  localStorage.clear(); seed(); host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('real app previews the exact existing export bytes and cancels without reading/writing data', async () => {
  await open(); await compare(); await click('比較結果Markdownをプレビュー'); const output = exportText();
  const reads = vi.spyOn(Storage.prototype, 'getItem'), writes = vi.spyOn(Storage.prototype, 'setItem');
  await click('比較結果をレポートに挿入'); expect(draft()).toContain(output); expect(draft()!.split(output)).toHaveLength(2);
  expect(material()!.textContent).toContain('A audit-a → B audit-b'); expect(material()!.textContent).toContain('挿入完了時刻ではありません');
  expect(exportText()).toBe(output); await click('比較資料の挿入をやめる'); expect(material()).toBeNull(); expect(document.activeElement).toBe(button('比較結果をレポートに挿入'));
  expect(reads).not.toHaveBeenCalled(); expect(writes).not.toHaveBeenCalled(); reads.mockRestore(); writes.mockRestore();
  expect(editor().value).toBe(report.body); expect(localStorage.getItem(STORAGE_KEY)).toBe(JSON.stringify(fixture));
});
it.each([['start', 0, 0], ['selection', 3, 8], ['end', report.body.length, report.body.length]] as const)('real app %s insertion keeps selected/full old body and exact dedicated undo', async (_, start, end) => {
  await open(false, start, end); await prepare(); const markdown = draft()!, raw = localStorage.getItem(STORAGE_KEY), oldRecords = scanAuditRecordEnvelopes(report.body).map(x => report.body.slice(x.start, x.end));
  const reads = vi.spyOn(Storage.prototype, 'getItem'), writes = vi.spyOn(Storage.prototype, 'setItem');
  await click('比較資料を本文へ固定挿入'); const inserted = editor().value;
  expect(inserted).toBe(report.body.slice(0, start) + (start ? '\n\n' : '') + markdown + '\n\n' + report.body.slice(start));
  expect(scanAuditRecordEnvelopes(inserted).map(x => inserted.slice(x.start, x.end))).toEqual(oldRecords);
  expect(parseReportAudit(inserted, 'f').items).toHaveLength(1); expect(scanAuditComparisonRecordEnvelopes(inserted)).toHaveLength(1);
  await click('直前の比較資料挿入を取り消す'); expect(editor().value).toBe(report.body); expect(reads).not.toHaveBeenCalled(); expect(writes).not.toHaveBeenCalled(); reads.mockRestore(); writes.mockRestore();
  expect(localStorage.getItem(STORAGE_KEY)).toBe(raw); expect(JSON.parse(raw!).formulaReports.entries[0].evidence).toEqual(report.evidence);
});
it('CRLF source, Unicode, duplicate prose and untouched original records survive insertion and undo', async () => {
  const next = structuredClone(original); next.formulaReports!.entries[0].body = report.body.replace(/\n/g, '\r\n'); seed(next);
  await open(false, 0, 2); await prepare(); const markdown = draft()!; await click('比較資料を本文へ固定挿入');
  expect(editor().value).toContain(normalize(markdown)); expect(editor().value.split('同じ文章')).toHaveLength(3); expect(editor().value).toContain('日本語😀 e\u0301');
  await click('直前の比較資料挿入を取り消す'); expect(editor().value).toBe(report.body); expect(localStorage.getItem(STORAGE_KEY)).toBe(JSON.stringify(next));
});
it.each([false, true])('changed%s body rejects dedicated undo even if old bytes are restored', async restored => {
  await open(); await prepare(); await click('比較資料を本文へ固定挿入'); const inserted = editor().value, staleUndo = button('直前の比較資料挿入を取り消す');
  await change(inserted + '\n別編集'); if (restored) await change(inserted); const before = editor().value;
  expect(button('直前の比較資料挿入を取り消す')).toBeUndefined(); expect(host.textContent).toContain('安全な取消を確認できません'); await act(async () => staleUndo.click()); expect(editor().value).toBe(before); expect(host.textContent).toContain('安全な取消を確認できません'); expect(localStorage.getItem(STORAGE_KEY)).toBe(JSON.stringify(fixture));
});
it.each(['changed', 'deleted', 'unrelated'] as const)('real CalculatorApp storage %s invalidates prepared material and preserves held body/history', async kind => {
  await open(); await prepare(); const staleConfirm = button('比較資料を本文へ固定挿入'); const raw = await external(kind);
  await act(async () => staleConfirm.click()); expect(material()).toBeNull(); expect(editor().value).toBe(report.body);
  if (!area()) await click('根拠点検'); await compare(); expect(button('比較結果をレポートに挿入').disabled).toBe(true); await click('比較結果Markdownをプレビュー'); expect(exportText()).toContain('一致'); expect(exportText()).toContain('未確認');
  await click('保存記録と照合'); expect(material()).toBeNull(); await compare(); expect(button('比較結果をレポートに挿入').disabled).toBe(true); await click('比較結果Markdownをプレビュー'); expect(exportText()).toContain('未確認'); expect(editor().value).toBe(report.body); expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
});
it.each(['changed', 'deleted', 'unrelated'] as const)('storage %s after insertion rejects undo rather than deleting by text search', async kind => {
  await open(); await prepare(); await click('比較資料を本文へ固定挿入'); const inserted = editor().value, staleUndo = button('直前の比較資料挿入を取り消す'); await act(async () => staleUndo.focus()); expect(document.activeElement).toBe(staleUndo); const raw = await external(kind);
  expect(document.activeElement?.getAttribute('tabindex')).toBe('-1'); expect(document.activeElement?.textContent).toContain('安全な取消を確認できません'); expect(button('直前の比較資料挿入を取り消す')).toBeUndefined(); expect(host.textContent).toContain('安全な取消を確認できません'); await act(async () => staleUndo.click()); expect(editor().value).toBe(inserted); expect(host.textContent).toContain('安全な取消を確認できません'); expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
});
it.each(['select', 'swap', 'recompare', 'refresh', 'close'] as const)('%s invalidates insertion preview and detached confirm does nothing', async action => {
  await open(); await prepare(); const confirm = button('比較資料を本文へ固定挿入');
  if (action === 'select') await choose(1, 'audit-a');
  if (action === 'swap') await click('比較元Aと比較先Bを入れ替える');
  if (action === 'recompare') await click('選択した2記録を比較');
  if (action === 'refresh') await click('保存記録と照合');
  if (action === 'close') await click('根拠点検を閉じる');
  await act(async () => confirm.click()); expect(material()).toBeNull(); expect(editor().value).toBe(report.body); expect(localStorage.getItem(STORAGE_KEY)).toBe(JSON.stringify(fixture));
});
it('same-turn notification rejects an old live confirm before React redraw', async () => {
  await open(); await prepare(); const confirm = button('比較資料を本文へ固定挿入');
  await act(async () => { window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, newValue: 'changed' })); confirm.click(); });
  expect(editor().value).toBe(report.body); expect(material()).toBeNull();
});
it('selection movement away and back invalidates preview, while unrelated focus movement does not', async () => {
  // End 8 is after the complete emoji; end 7 splits its UTF-16 pair and is independently rejected by R3.
  await open(false, 3, 8); await prepare(); await act(async () => material()!.querySelector('textarea')!.focus()); expect(material()).not.toBeNull();
  await position(1); await position(3, 8); expect(material()).toBeNull(); expect(editor().value).toBe(report.body);
});
it('unreported position change is caught at confirm and preserves body', async () => {
  await open(); await prepare(); const confirm = button('比較資料を本文へ固定挿入');
  await act(async () => { editor().setSelectionRange(2, 2); confirm.click(); }); expect(editor().value).toBe(report.body); expect(material()).toBeNull();
});
it('unexecuted comparison and same-record comparison cannot start insertion', async () => {
  await open(); expect(button('比較結果をレポートに挿入')).toBeUndefined(); await choose(0, 'audit-a'); await choose(1, 'audit-a'); await click('選択した2記録を比較');
  expect(button('比較結果をレポートに挿入')).toBeUndefined(); expect(editor().value).toBe(report.body);
});
it.each([['match', '1+1', '1+1', '一致'], ['changed', '1+1', '2', '変更あり'], ['empty', null, null, '比較不能'], ['added', null, '1+1', '追加'], ['removed', '1+1', null, '削除']] as const)('%s state is retained in inserted material without independent classification', async (_, a, b, expected) => {
  const next = structuredClone(original); next.formulaReports!.entries[0].body = `${fixed('audit-a', a)}\n\n${fixed('audit-b', b)}`; seed(next); await open(); await prepare(); const markdown = draft()!;
  expect(markdown).toContain(expected); if (a === null && b === null) { expect(markdown).toContain('両記録に比較可能な根拠項目がありません'); expect(markdown).toContain('取得成功は根拠の一致を意味しません'); }
  await click('比較資料を本文へ固定挿入'); expect(editor().value).toContain(markdown); expect(localStorage.getItem(STORAGE_KEY)).toBe(JSON.stringify(next));
});
it('reverse direction keeps exact B-to-A identifiers in wrapper and visible Markdown', async () => {
  await open(); await compare(true); await click('比較結果をレポートに挿入'); const markdown = draft()!, range = scanAuditComparisonRecordEnvelopes(markdown)[0];
  expect(range.metadata?.beforeRecordId).toBe('audit-b'); expect(range.metadata?.afterRecordId).toBe('audit-a'); expect(material()!.textContent).toContain('A audit-b → B audit-a');
});
it('inside a fixed record is refused, at its exact boundary remains allowed', async () => {
  const range = scanAuditRecordEnvelopes(report.body)[0]; await open(false, range.start + 5); await compare(); await click('比較結果をレポートに挿入');
  expect(material()).toBeNull(); expect(editor().value).toBe(report.body); await click('根拠点検を閉じる'); await position(range.start); await click('根拠点検'); await prepare(); expect(material()).not.toBeNull();
});
it('body-capacity refusal is whole-output non-destructive and not a partial insert', async () => {
  const next = structuredClone(original); next.formulaReports!.entries[0].body += 'x'.repeat(100_000 - report.body.length); seed(next);
  await open(); await compare(); await click('比較結果をレポートに挿入'); expect(material()).toBeNull(); expect(host.textContent).toContain('100,000'); expect(editor().value).toBe(next.formulaReports!.entries[0].body); expect(localStorage.getItem(STORAGE_KEY)).toBe(JSON.stringify(next));
});
it('StrictMode app remains usable and explicit save/reload retains material but not new roots/history', async () => {
  await open(true); await prepare(); await click('比較資料を本文へ固定挿入'); const inserted = editor().value;
  expect(localStorage.getItem(STORAGE_KEY)).toBe(JSON.stringify(fixture)); await click('レポートを保存');
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!) as StoredData; expect(saved.formulaReports!.entries[0].body).toBe(inserted); expect(saved.formulaReports!.entries[0].evidence).toEqual(report.evidence); expect(saved.notes).toEqual(fixture.notes); expect(saved.history).toEqual(fixture.history);
  expect(button('直前の比較資料挿入を取り消す')).toBeUndefined();
  await act(async () => root.unmount()); root = createRoot(host); await open();
  expect(scanAuditComparisonRecordEnvelopes(editor().value)).toHaveLength(1); expect(scanAuditRecordEnvelopes(editor().value)).toHaveLength(2); expect(parseReportAudit(editor().value, 'f').items).toHaveLength(1);
});
it.each(['target', 'protected'] as const)('parent %s change invalidates old preview without waiting for storage notification', async kind => {
  const save = vi.fn(), close = vi.fn();
  const render = (changed = false) => act(async () => root.render(createElement(FormulaReportModal, { formulaId: 'f', formula, report: changed && kind === 'target' ? { ...report, id: 'other' } : report, writable: !(changed && kind === 'protected'), onSave: save, onClose: close })));
  await render(); await click('Markdownを編集'); await position(0); await click('根拠点検'); await prepare(); await render(true);
  expect(material()).toBeNull(); expect(editor().value).toBe(report.body); expect(save).not.toHaveBeenCalled();
});

it('late clipboard resolution after fixed insertion cannot revive success or old insertion controls', async () => {
  let finish!: () => void;
  const copy = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: copy } });
  await open(); await compare(); await click('比較結果Markdownをプレビュー'); const output = exportText();
  await click('比較結果をレポートに挿入'); await click('比較結果Markdownをコピー'); expect(copy).toHaveBeenCalledWith(output);
  await click('比較資料を本文へ固定挿入'); const inserted = editor().value;
  await act(async () => finish()); expect(editor().value).toBe(inserted); expect(material()).toBeNull(); expect(host.textContent).not.toContain('比較結果をコピーしました');
  expect(button('比較資料を本文へ固定挿入')).toBeUndefined(); expect(localStorage.getItem(STORAGE_KEY)).toBe(JSON.stringify(fixture));
});
it('old v1 record without comparison metadata stays ineligible instead of reconstructing evidence', async () => {
  const next = structuredClone(original); next.formulaReports!.entries[0].body = `${createAuditRecordMarkdown('旧記録', info('audit-a'))}\n\n${fixed('audit-b')}`; seed(next);
  await open(); const option = [...area().querySelector('select')!.options].find(option => option.textContent?.includes('：audit-a（'))!;
  expect(option.disabled).toBe(true); expect(button('比較結果をレポートに挿入')).toBeUndefined(); expect(editor().value).toBe(next.formulaReports!.entries[0].body); expect(localStorage.getItem(STORAGE_KEY)).toBe(JSON.stringify(next));
});
it('body edit invalidates prepared material and stale confirm preserves every new character', async () => {
  await open(); await prepare(); const confirm = button('比較資料を本文へ固定挿入'); await change(report.body + '\n追加😀');
  await act(async () => confirm.click()); expect(material()).toBeNull(); expect(editor().value).toBe(report.body + '\n追加😀'); expect(localStorage.getItem(STORAGE_KEY)).toBe(JSON.stringify(fixture));
});
it('CRLF editor offsets map to the correct raw-body line boundary without rewriting old ranges on save', async () => {
  const next = structuredClone(original), rawBody = report.body.replace(/\n/g, '\r\n'); next.formulaReports!.entries[0].body = rawBody; seed(next);
  const start = report.body.indexOf('同じ文章'); await open(false, start, start + '同じ文章'.length); await prepare(); const markdown = draft()!;
  await click('比較資料を本文へ固定挿入'); const rawStart = rawBody.indexOf('同じ文章'); const expected = rawBody.slice(0, rawStart) + '\n\n' + markdown + '\n\n' + rawBody.slice(rawStart);
  expect(editor().value).toBe(normalize(expected)); await click('レポートを保存');
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY)!) as StoredData; expect(saved.formulaReports!.entries[0].body).toBe(expected); expect(saved.formulaReports!.entries[0].evidence).toEqual(report.evidence);
});
it('uncertain saved-body flag alone remains distinct from writable protection and is retained in fixed material', async () => {
  const save = vi.fn(); await act(async () => root.render(createElement(FormulaReportModal, { formulaId: 'f', formula, report, writable: true, savedContextUncertain: true, onSave: save, onClose: vi.fn() })));
  await click('Markdownを編集'); await position(0); await click('根拠点検'); await prepare(); expect(draft()).toContain('未確認'); const markdown = draft()!;
  await click('比較資料を本文へ固定挿入'); expect(editor().value).toContain(markdown); expect(save).not.toHaveBeenCalled(); expect(localStorage.getItem(STORAGE_KEY)).toBe(JSON.stringify(fixture));
});
it.each(['unavailable', 'invalid', 'unrecorded', 'incomplete', 'stale'] as const)('%s comparison limitations survive material insertion without upgrading to matched', async kind => {
  const metadata = scanAuditRecordEnvelopes(fixed('audit-a', null))[0].metadata!;
  const comparison = { ...metadata.comparison! };
  if (kind === 'unavailable' || kind === 'invalid') comparison.acquisitionStatus = kind;
  if (kind === 'unrecorded') delete comparison.acquisitionStatus;
  if (kind === 'incomplete') { comparison.complete = false; comparison.reason = '集計が不完全です'; }
  if (kind === 'stale') { comparison.state = 'stale'; delete comparison.acquisitionStatus; delete comparison.fetchedAt; }
  const next = structuredClone(original); next.formulaReports!.entries[0].body = `${createAuditRecordMarkdown('当時の制約', { ...metadata, comparison })}\n\n${fixed('audit-b', null)}`; seed(next);
  await open(); await prepare(); const markdown = draft()!; expect(markdown).toContain('比較不能');
  const expected = { unavailable: '取得不能', invalid: '未知', unrecorded: '原本取得の成否が記録されていません', incomplete: '不完全', stale: '失効' }[kind]; expect(markdown).toContain(expected);
  await click('比較資料を本文へ固定挿入'); expect(editor().value).toContain(markdown); expect(localStorage.getItem(STORAGE_KEY)).toBe(JSON.stringify(next));
});

it('held aggregate report capacity rejects the full material without trimming another body or confirmation history', async () => {
  const next = structuredClone(original);
  for (let index = 0; index < 3; index++) next.formulaReports!.entries.push({ ...report, id: `other-${index}`, formulaId: `other-formula-${index}`, body: '文'.repeat(100_000), evidence: { version: 1, links: [], confirmations: [] } });
  const padding: FormulaReport = { ...report, id: 'padding', formulaId: 'padding-formula', body: '', evidence: { version: 1, links: [], confirmations: [] } };
  next.formulaReports!.entries.push(padding);
  const bytes = () => new TextEncoder().encode(JSON.stringify(next.formulaReports)).byteLength;
  padding.body = 'x'.repeat(999_500 - bytes());
  expect(bytes()).toBe(999_500); expect(padding.body.length).toBeLessThanOrEqual(100_000); expect(() => readFormulaReports(next.formulaReports)).not.toThrow();
  seed(next); await open(); await compare(); await click('比較結果Markdownをプレビュー'); const output = exportText(); expect(new TextEncoder().encode(output).byteLength).toBeGreaterThan(500);
  const raw = localStorage.getItem(STORAGE_KEY), reads = vi.spyOn(Storage.prototype, 'getItem'), writes = vi.spyOn(Storage.prototype, 'setItem');
  await click('比較結果をレポートに挿入'); expect(material()).toBeNull(); expect(area().textContent).toContain('1,000,000バイト'); expect(editor().value).toBe(report.body); expect(exportText()).toBe(output);
  expect(reads).not.toHaveBeenCalled(); expect(writes).not.toHaveBeenCalled(); reads.mockRestore(); writes.mockRestore();
  expect(localStorage.getItem(STORAGE_KEY)).toBe(raw); expect(JSON.parse(raw!).formulaReports).toEqual(next.formulaReports); expect(JSON.parse(raw!).formulaReports.entries[0].evidence.confirmations).toEqual(report.evidence!.confirmations);
});

it('same-turn storage event refuses the live undo before redraw without removing material', async () => {
  await open(); await prepare(); await click('比較資料を本文へ固定挿入'); const inserted = editor().value, undo = button('直前の比較資料挿入を取り消す');
  await act(async () => { window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, newValue: 'changed' })); undo.click(); });
  expect(editor().value).toBe(inserted); expect(button('直前の比較資料挿入を取り消す')).toBeUndefined(); expect(host.textContent).toContain('安全な取消を確認できません'); expect(localStorage.getItem(STORAGE_KEY)).toBe(JSON.stringify(fixture));
});
