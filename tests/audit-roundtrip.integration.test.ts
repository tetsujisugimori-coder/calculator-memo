// @vitest-environment jsdom
import { act, createElement, StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CalculatorApp } from '../components/CalculatorApp';
import { createAuditRecordMarkdown, scanAuditRecordEnvelopes } from '../lib/formula-report-audit-record';
import { createAuditComparisonRecordMarkdown } from '../lib/formula-report-audit-comparison-record';
import { createQuoteMarkdown, type QuoteSnapshot } from '../lib/formula-report-quotes';
import { parseReportAudit } from '../lib/formula-report-audit';
import { defaultData, STORAGE_KEY } from '../lib/storage';
import type { FormulaReport, StoredData } from '../lib/types';

const at = '2026-10-27T00:00:00.000Z';
const fixed = (recordId: string) => createAuditRecordMarkdown(`点検記録 ${recordId} 日本語😀`, { recordId, formulaId: 'f', reportId: 'r', generatedAt: at, bodySha256: 'a'.repeat(64), bodyLength: 10 });
const material = createAuditComparisonRecordMarkdown('## 固定比較の本文\n当時の比較結果は変更あり\n同じ文章😀', { materialId: 'm', formulaId: 'f', reportId: 'r', beforeRecordId: 'a', afterRecordId: 'b', preparedAt: at });
const body = `前文😀 e\u0301\n\n${fixed('a')}\n\n${material}\n\n${fixed('b')}\n\n同じ文章😀\n後文`;
const report: FormulaReport = { id: 'r', formulaId: 'f', title: '出典追跡の説明', body, createdAt: at, updatedAt: at, confirmedExpression: null, evidence: { version: 1, links: [], confirmations: [{ id: 'confirmation', formulaId: 'f', confirmedAt: at, definition: { version: 1, expression: '1+1', variables: [] }, title: 'earlier confirmation', body: 'unchanged historical body', links: [], evidenceSignature: '[]' }] } };
const original: StoredData = { ...defaultData, formulaLibrary: { version: 1, selectedId: 'f', entries: [{ id: 'f', title: '追跡する式', expression: '1+1', createdAt: at, updatedAt: at }] }, formulaReports: { version: 1, entries: [report] } };
let host: HTMLDivElement, root: Root, fixture: StoredData, frames: FrameRequestCallback[];
const button = (name: string) => [...host.querySelectorAll('button')].find(node => node.textContent === name)!;
const click = async (name: string) => act(async () => { expect(button(name), name).toBeTruthy(); button(name).focus(); button(name).click(); });
const editor = () => host.querySelector<HTMLTextAreaElement>('#formula-report-body')!;
const position = async (start: number, end = start) => act(async () => { editor().setSelectionRange(start, end); editor().dispatchEvent(new Event('select', { bubbles: true })); });
const flush = async () => act(async () => { const pending = frames.splice(0); pending.forEach(callback => callback(1)); });
async function open(editing = true) {
  await act(async () => root.render(createElement(StrictMode, null, createElement(CalculatorApp))));
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
  await click('登録式ライブラリ'); await click('関連レポートを閲覧・編集');
  if (editing) { await click('Markdownを編集'); await position(0); }
  await click('根拠点検'); await click('比較資料1の詳細'); frames = [];
}
async function change(text: string) { await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(editor(), text); editor().dispatchEvent(new Event('input', { bubbles: true })); }); }
async function external(kind: 'changed' | 'deleted') {
  const next = structuredClone(fixture);
  if (kind === 'changed') next.formulaReports!.entries[0].body = 'another page saved this body'; else next.formulaReports!.entries = [];
  const oldValue = localStorage.getItem(STORAGE_KEY), raw = JSON.stringify(next); localStorage.setItem(STORAGE_KEY, raw);
  await act(async () => window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, oldValue, newValue: raw, storageArea: localStorage })));
  return raw;
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); frames = [];
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} }); HTMLElement.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => { frames.push(callback); return frames.length; })); vi.stubGlobal('cancelAnimationFrame', vi.fn());
  localStorage.clear(); fixture = structuredClone(original); localStorage.setItem(STORAGE_KEY, JSON.stringify(fixture));
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

const auditRoot = () => host.querySelector<HTMLElement>('[aria-label="レポート全体の根拠点検"]')!;
const auditContent = () => auditRoot().querySelector<HTMLElement>('.modal-content')!;
const detail = () => host.querySelector<HTMLTextAreaElement>('[aria-label="固定比較資料の詳細"] textarea');
const jump = '比較元Aの出典本文へ移動';
const repeat = '本文の対象へもう一度移動';
const roundtrip = () => host.querySelector<HTMLElement>('[aria-label="点検からの本文移動先"]');
async function filter(value: string) { await act(async () => { const select = host.querySelector<HTMLSelectElement>('[aria-label="表示する状態"]')!; select.value = value; select.dispatchEvent(new Event('change', { bubbles: true })); }); }

it('repeated real-app roundtrips preserve detail, filter, list scroll and focus without reads or writes', async () => {
  await open(); await click('保存記録と照合'); await click('比較資料1の詳細'); await filter('review'); auditContent().scrollTop = 217;
  const raw = localStorage.getItem(STORAGE_KEY), read = vi.spyOn(Storage.prototype, 'getItem'), write = vi.spyOn(Storage.prototype, 'setItem');
  const originalDetail = detail(), origin = button(jump);
  for (let i = 0; i < 3; i++) {
    await click(jump); await flush(); expect(roundtrip()).toBeTruthy();
    expect(roundtrip()!.querySelector('mark')!.textContent).toBe(fixed('a'));
    expect(editor().value).toBe(body); expect(document.activeElement).toBe(editor());
    await click('点検へ戻る'); await flush(); expect(roundtrip()).toBeNull();
    expect(detail()).toBe(originalDetail); expect(detail()!.value).toContain('当時の比較結果');
    expect(host.querySelector<HTMLSelectElement>('[aria-label="表示する状態"]')!.value).toBe('review');
    expect(auditContent().scrollTop).toBe(217); expect(document.activeElement).toBe(origin);
    expect(auditContent().textContent).toContain('原本の観測取得日時：');
  }
  expect(read).not.toHaveBeenCalled(); expect(write).not.toHaveBeenCalled(); read.mockRestore(); write.mockRestore();
  expect(localStorage.getItem(STORAGE_KEY)).toBe(raw); expect(JSON.parse(raw!).formulaReports.entries[0].evidence).toEqual(report.evidence);
});
it('editing outside target permits structural relocation, then returns to current material without original acquisition', async () => {
  await open(); await click(jump); await flush(); const raw = localStorage.getItem(STORAGE_KEY);
  const updated = `追加の前文😀\n\n${body}\n\n追加の後文`;
  const read = vi.spyOn(Storage.prototype, 'getItem'), write = vi.spyOn(Storage.prototype, 'setItem');
  await change(updated); expect(roundtrip()!.querySelector('mark')).toBeNull();
  await click(repeat); await flush(); const range = scanAuditRecordEnvelopes(updated)[0];
  expect([editor().selectionStart, editor().selectionEnd]).toEqual([range.start, range.end]);
  await click('点検へ戻る'); await flush();
  expect(detail()?.value).toContain('当時の比較結果'); expect(host.textContent).toContain('旧照合・比較結果は失効');
  expect(read).not.toHaveBeenCalled(); expect(write).not.toHaveBeenCalled(); read.mockRestore(); write.mockRestore();
  expect(editor().value).toBe(updated); expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
});
it.each(['deleted', 'changed', 'duplicate', 'incomplete'] as const)('refuses %s target after edit without moving selection or restoring stale detail', async mode => {
  await open(); await click(jump); await flush();
  const updated = mode === 'deleted' ? body.replace(fixed('a'), '') : mode === 'changed' ? body.replace('点検記録 a 日本語😀', '変わった本文') : mode === 'duplicate' ? `${body}\n\n${fixed('a')}` : body.replace('calculator-memo-audit-record-end-v1', 'calculator-memo-audit-record-end-v99');
  await change(updated); await position(3, 5); const before = [editor().selectionStart, editor().selectionEnd];
  await click(repeat); await flush(); expect([editor().selectionStart, editor().selectionEnd]).toEqual(before);
  expect(roundtrip()!.querySelector('mark')).toBeNull(); expect(roundtrip()!.textContent).toMatch(/確認できません|変更され/);
  await click('点検へ戻る'); await flush(); expect(detail()).toBeNull();
  expect(editor().value).toBe(updated); expect(localStorage.getItem(STORAGE_KEY)).toBe(JSON.stringify(fixture));
});
it.each(['changed', 'deleted'] as const)('storage %s preserves held draft but refuses revisit and does not revive old detail', async kind => {
  await open(); await click(jump); await flush(); const raw = await external(kind);
  await position(3, 5); const before = [editor().selectionStart, editor().selectionEnd];
  await click(repeat); await flush(); expect([editor().selectionStart, editor().selectionEnd]).toEqual(before);
  expect(roundtrip()!.querySelector('mark')).toBeNull(); expect(roundtrip()!.textContent).toContain('失効');
  await click('点検へ戻る'); await flush(); expect(detail()).toBeNull(); expect(host.textContent).toContain('旧詳細を復元せず');
  expect(editor().value).toBe(body); expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
});
it.each(['点検へ戻る', '往復ナビゲーションを終了', 'レポートを閉じる'])('delayed navigation is cancelled by %s', async action => {
  await open(); await position(3, 5); await click(jump); const pending = frames.splice(0); const oldEditor = editor();
  await click(action); const focus = document.activeElement;
  await act(async () => pending.forEach(callback => callback(1)));
  expect([oldEditor.selectionStart, oldEditor.selectionEnd]).toEqual([3, 5]); expect(document.activeElement).toBe(focus);
  expect(oldEditor.value).toBe(body); expect(roundtrip()).toBeNull(); expect(localStorage.getItem(STORAGE_KEY)).toBe(JSON.stringify(fixture));
});
it('explicit ending and fresh reopening do not inherit comparison detail or return target', async () => {
  await open(); await click(jump); await flush(); await click('往復ナビゲーションを終了');
  expect(roundtrip()).toBeNull(); expect(detail()).toBeNull(); await click('根拠点検');
  expect(detail()).toBeNull(); expect(button('点検へ戻る')).toBeUndefined();
  await click('比較資料1の詳細'); await click('比較先Bの出典本文へ移動'); await flush();
  expect(roundtrip()!.querySelector('mark')!.textContent).toBe(fixed('b')); await click('点検へ戻る'); expect(detail()).not.toBeNull();
});
it('changing body then restoring bytes still cancels old deferred navigation while explicit revisit revalidates', async () => {
  await open(); await click(jump); const pending = frames.splice(0);
  await change(`追加\n${body}`); await change(body); await position(3, 5);
  await act(async () => pending.forEach(callback => callback(1))); expect([editor().selectionStart, editor().selectionEnd]).toEqual([3, 5]);
  expect(roundtrip()!.querySelector('mark')).toBeNull(); await click(repeat); await flush();
  const range = scanAuditRecordEnvelopes(body)[0]; expect([editor().selectionStart, editor().selectionEnd]).toEqual([range.start, range.end]);
  expect(localStorage.getItem(STORAGE_KEY)).toBe(JSON.stringify(fixture));
});
it('body edit and exact restore returns to revalidated origin, not a silently lost selection', async () => {
  await open(); await click(jump); await flush();
  await change(`追加\n${body}`); await change(body);
  await click('点検へ戻る'); await flush();
  expect(detail()?.value).toContain('当時の比較結果');
  expect(localStorage.getItem(STORAGE_KEY)).toBe(JSON.stringify(fixture));
});
it('separate quote occurrences sharing one source restore their own focus and filter without body changes', async () => {
  const snapshot: QuoteSnapshot = { version: 1, quoteId: 'first', formulaId: 'f', memoId: 'memo', blockId: 'block', citedAt: at, record: { id: 'evidence', evaluator: 'calculator-memo-v1', status: 'confirmed', calculatedAt: at, persistedAt: at, blocks: [{ blockId: 'block', position: 1, expression: '1', result: '1', resultText: '1', status: 'success', inputs: [] }] } };
  const text = `${createQuoteMarkdown(snapshot)}\n\n${body}\n\n${createQuoteMarkdown({ ...snapshot, quoteId: 'second' })}`;
  fixture.formulaReports!.entries[0].body = text; localStorage.setItem(STORAGE_KEY, JSON.stringify(fixture));
  await open(); await filter('unverified'); auditContent().scrollTop = 333;
  const raw = localStorage.getItem(STORAGE_KEY), write = vi.spyOn(Storage.prototype, 'setItem'), read = vi.spyOn(Storage.prototype, 'getItem');
  const items = parseReportAudit(text, 'f').items;
  for (const item of items) {
    const name = `根拠${item.order}の本文へ移動`, origin = button(name);
    await click(name); await flush(); expect([editor().selectionStart, editor().selectionEnd]).toEqual([item.start, item.end]);
    expect(roundtrip()!.querySelector('mark')!.textContent).toBe(text.slice(item.start, item.end));
    await click('点検へ戻る'); await flush(); expect(document.activeElement).toBe(origin);
    expect(auditContent().scrollTop).toBe(333); expect(host.querySelector<HTMLSelectElement>('[aria-label="表示する状態"]')!.value).toBe('unverified');
  }
  expect(items).toHaveLength(2); expect(editor().value).toBe(text); expect(read).not.toHaveBeenCalled(); expect(write).not.toHaveBeenCalled(); read.mockRestore(); write.mockRestore();
  expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
});
it.each(['title', 'body', 'storage-and-title'] as const)('first audit export remains unverified after %s editing before audit was ever opened', async mode => {
  await act(async () => root.render(createElement(StrictMode, null, createElement(CalculatorApp))));
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
  await click('登録式ライブラリ'); await click('関連レポートを閲覧・編集'); await click('Markdownを編集');
  if (mode === 'body') await change(`前方の追加\n\n${body}`);
  else {
    if (mode === 'storage-and-title') await external('changed');
    await act(async () => { const input = host.querySelector<HTMLInputElement>('#formula-report-title')!; expect(input).toBeTruthy(); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '点検前のタイトル変更'); input.dispatchEvent(new Event('input', { bubbles: true })); });
  }
  const raw = localStorage.getItem(STORAGE_KEY), copy = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: copy } });
  const read = vi.spyOn(Storage.prototype, 'getItem'), write = vi.spyOn(Storage.prototype, 'setItem');
  await click('根拠点検'); await click('点検結果をコピー');
  expect(copy).toHaveBeenCalledTimes(1); const markdown = copy.mock.calls[0][0] as string;
  expect(markdown).toContain('点検状態：未照合。');
  expect(markdown).not.toContain('保存記録と一致');
  if (mode === 'storage-and-title') expect(host.textContent).toContain('保存本文との一致は未確認');
  expect(read).not.toHaveBeenCalled(); expect(write).not.toHaveBeenCalled(); read.mockRestore(); write.mockRestore();
  expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
});
it('an already acquired active session stays invalid after body edit while returning without implicit refresh', async () => {
  await open(); await click('保存記録と照合'); await click('比較資料1の詳細'); await click(jump); await flush();
  await change(`新しい前文\n\n${body}`); await click('点検へ戻る'); await flush();
  const copy = vi.fn().mockResolvedValue(undefined); Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: copy } });
  const read = vi.spyOn(Storage.prototype, 'getItem'), write = vi.spyOn(Storage.prototype, 'setItem');
  await click('点検結果をコピー');
  expect(copy.mock.calls[0][0]).toContain('点検状態：結果失効・未照合。');
  expect(copy.mock.calls[0][0]).toContain('原本の観測取得日時：有効な取得情報なし');
  expect(read).not.toHaveBeenCalled(); expect(write).not.toHaveBeenCalled();
});
