// @vitest-environment jsdom
import { act, createElement } from 'react';
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

it('real app requires explicit A/B and compares changed expression even with equal results without persistence', async () => {
  await open(); expect(result()).toBeNull();
  expect([...area().querySelectorAll('select')].every(select => select.value === '')).toBe(true);
  expect([...area().querySelectorAll('select')].map(select => select.labels![0].textContent)).toEqual(['比較元A', '比較先B']);
  const legacyOption = [...area().querySelector('select')!.options].find(option => option.text.includes('legacy'))!;
  expect(legacyOption.disabled).toBe(true); expect(area().textContent).toContain('旧記録');
  const raw = localStorage.getItem(STORAGE_KEY);
  const reads = vi.spyOn(Storage.prototype, 'getItem'), writes = vi.spyOn(Storage.prototype, 'setItem');
  await compare(); expect(result()!.textContent).toContain('変更あり'); expect(result()!.textContent).toContain('入力式');
  expect(reads).not.toHaveBeenCalled(); expect(writes).not.toHaveBeenCalled(); reads.mockRestore(); writes.mockRestore();
  expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
  expect(JSON.parse(raw!).formulaReports.entries[0].evidence.confirmations).toEqual(report.evidence!.confirmations);
});
it('selection changes and swap clear old result; same record is not certified as a match', async () => {
  await open(); await compare(); await choose(1, 'audit-a'); expect(result()).toBeNull();
  await click('選択した2記録を比較'); expect(result()!.textContent).toContain('比較不能'); expect(result()!.textContent).toContain('異なる固定点検記録');
  await choose(1, 'audit-b'); await click('選択した2記録を比較'); await click('比較元Aと比較先Bを入れ替える'); expect(result()).toBeNull();
  await click('選択した2記録を比較'); expect(result()!.textContent).toContain('比較元A：audit-b → 比較先B：audit-a');
});
it.each(['changed', 'deleted', 'unrelated'] as const)('real retained-data storage %s invalidates and preserves uncertainty through refresh and reopen', async kind => {
  await open(); await compare(); const raw = await external(kind);
  if (!area()) await click('根拠点検'); expect(result()).toBeNull();
  expect(area().textContent).toContain('現在の保存本文との一致は未確認');
  expect(area().textContent).toContain('変更・削除を断定しません');
  await compare(); expect(result()!.textContent).toContain('入力式');
  await click('保存記録と照合'); expect(result()).toBeNull(); expect(area().textContent).toContain('現在の保存本文との一致は未確認');
  await compare(); await click('根拠点検を閉じる'); await click('根拠点検'); expect(result()).toBeNull();
  expect(area().textContent).toContain('現在の保存本文との一致は未確認');
  await click('根拠点検を閉じる'); await click('Markdownを編集');
  expect(host.querySelector<HTMLTextAreaElement>('#formula-report-body')!.value).toBe(report.body);
  expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
});
it('editor changes remove a record and cannot resurrect a previous comparison', async () => {
  await open(); await compare(); await click('根拠点検を閉じる'); await click('Markdownを編集');
  const editor = host.querySelector<HTMLTextAreaElement>('#formula-report-body')!;
  const changed = fixed('audit-a') + '\n利用者の未保存編集';
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(editor, changed); editor.dispatchEvent(new Event('input', { bubbles: true })); });
  await click('根拠点検'); expect(result()).toBeNull(); expect(area().textContent).not.toContain('audit-b');
  expect(editor.value).toBe(changed); expect(localStorage.getItem(STORAGE_KEY)).toBe(JSON.stringify(original));
});
it('failed explicit source acquisition clears old comparison without rewriting fixed records', async () => {
  await open(); await compare();
  const read = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('synthetic unavailable'); });
  await click('保存記録と照合'); expect(result()).toBeNull(); expect(host.textContent).toContain('保存原本の取得に失敗'); read.mockRestore();
  await compare(); expect(result()!.textContent).toContain('入力式');
  expect(localStorage.getItem(STORAGE_KEY)).toBe(JSON.stringify(original));
});
it('same-turn storage followed by stale compare cannot reinstate old result', async () => {
  await open(); await compare(); const compareButton = button('選択した2記録を比較');
  await act(async () => { window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, newValue: 'different' })); compareButton.click(); });
  expect(result()).toBeNull(); expect(localStorage.getItem(STORAGE_KEY)).toBe(JSON.stringify(original));
});
it('untrusted legacy, foreign and malformed envelopes stay listed without unsafe navigation or selection', async () => {
  const foreign = createAuditRecordMarkdown('foreign', { ...info('foreign'), formulaId: 'other' });
  const malformed = old.replace('calculator-memo-audit-record-start-v1', 'calculator-memo-audit-record-start-v99');
  const navigate = vi.fn();
  await act(async () => root.render(createElement(FormulaAuditRecordComparison, { body: `${old}\n\n${foreign}\n\n${malformed}`, formulaId: 'f', reportId: 'r', onNavigate: navigate })));
  expect(area().textContent).toContain('日時不明'); expect(area().textContent).toContain('対象登録式・レポートが異なる');
  expect(button('点検記録2の本文へ移動').disabled).toBe(true); expect(button('点検記録3の本文へ移動').disabled).toBe(true);
  expect([...area().querySelector('select')!.options].filter(option => option.value).every(option => option.disabled)).toBe(true);
  await click('点検記録1の本文へ移動'); expect(navigate).toHaveBeenCalledWith(0, old.length);
});
it('direct context generation, target and body changes discard selected result synchronously', async () => {
  const navigate = vi.fn();
  const render = async (generation: number, body = report.body, formulaId = 'f') => act(async () => root.render(createElement(FormulaAuditRecordComparison, { body, formulaId, reportId: 'r', generation, onNavigate: navigate })));
  await render(0); await compare(); await render(1); expect(result()).toBeNull();
  await compare(); await render(1, report.body + '\nedit'); expect(result()).toBeNull();
  await compare(); await render(1, report.body, 'other'); expect(result()).toBeNull();
});

it('actual editor keeps unsaved edits and fixed bytes while external change only adds uncertainty', async () => {
  await open(); await click('根拠点検を閉じる'); await click('Markdownを編集');
  const editor = host.querySelector<HTMLTextAreaElement>('#formula-report-body')!;
  const changed = report.body + '\n未保存の追記';
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(editor, changed); editor.dispatchEvent(new Event('input', { bubbles: true })); });
  await click('根拠点検'); await compare(); const raw = await external('changed');
  if (!area()) await click('根拠点検'); await compare();
  expect(area().textContent).toContain('現在の保存本文との一致は未確認');
  expect(editor.value).toBe(changed); expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
});
it('details distinguish each historical frozen source and acquired original with explicit internal/display fields', async () => {
  await open(); await compare();
  const details = [...result()!.querySelectorAll('details')].filter(detail => ['比較元Aの固定情報', '比較先Bの固定情報'].includes(detail.querySelector('summary')!.textContent!));
  expect(details).toHaveLength(2);
  for (const detail of details) await act(async () => { detail.open = true; detail.dispatchEvent(new Event('toggle')); });
  expect(details[0].textContent).toContain('1+1'); expect(details[1].textContent).toContain('当時の入力式2');
  for (const detail of details) { expect(detail.textContent).toContain('引用・差分に固定したsnapshot'); expect(detail.textContent).toContain('当時取得した保存原本'); expect(detail.textContent).toContain('当時の表示結果2'); expect(detail.textContent).toContain('当時の内部結果2'); }
});

it.each(['unavailable', 'invalid', undefined] as const)('zero-item acquisition %s is not presented as successful retrieval', async status => {
  const inventory = { items: [], complete: true, reason: '認識できた項目なし' };
  const before = createAuditRecordMarkdown('0件の点検', { ...info('audit-a'), comparison: captureAuditComparison(inventory, [], 'checked', at, status, { editing: true, unsavedChanges: true, savedContextChanged: true }) });
  const after = createAuditRecordMarkdown('0件の点検', { ...info('audit-b'), comparison: captureAuditComparison(inventory, [], 'checked', at, status) });
  await act(async () => root.render(createElement(FormulaAuditRecordComparison, { body: before + '\n\n' + after, formulaId: 'f', reportId: 'r', onNavigate: vi.fn() })));
  expect(area().textContent).toContain('原本取得試行日時'); expect(area().textContent).not.toContain('原本取得日時（UTC）');
  expect(area().textContent).toContain('未保存変更（本文以外も含む）：あり');
  expect(area().textContent).toContain('当時、保持本文と保存本文の一致は未確認');
  expect(area().textContent).toContain('当時の保持本文・未保存編集の状態は未記録');
  await compare(); expect(result()!.textContent).toContain('比較不能');
  expect(result()!.querySelector('h4')!.textContent).not.toContain('一致');
});
