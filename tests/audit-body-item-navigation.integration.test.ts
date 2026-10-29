// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { FormulaReportAudit } from '../components/FormulaReportAudit';
import { createQuoteMarkdown, type QuoteSnapshot } from '../lib/formula-report-quotes';
import { createTrackedDifferenceMarkdown } from '../lib/formula-report-diff-tracking';
import { buildQuoteDifferenceMarkdown } from '../lib/formula-report-diff';
import { parseReportAudit } from '../lib/formula-report-audit';
import * as evidenceComparison from '../lib/evidence-comparison';
import { defaultData, STORAGE_KEY } from '../lib/storage';
import type { Memo } from '../lib/types';

const at = '2026-10-28T00:00:00.000Z';
const snapshot: QuoteSnapshot = { version: 1, quoteId: 'q1', formulaId: 'f', memoId: 'm', blockId: 'b', citedAt: at, record: { id: 'r1', evaluator: 'calculator-memo-v1', status: 'confirmed', calculatedAt: at, persistedAt: at, blocks: [{ blockId: 'b', position: 1, expression: '1', result: '1', resultText: '1', status: 'success', inputs: [] }] } };
const secondRecord = { ...structuredClone(snapshot.record), id: 'r2', blocks: [{ ...snapshot.record.blocks[0], expression: '2', result: '2', resultText: '2' }] };
const links = [{ memoId: 'm', recordId: 'r1' }, { memoId: 'm', recordId: 'r2' }];
const notes: Memo[] = [{ id: 'm', type: 'plain-calculation', title: 'synthetic', content: '1', createdAt: at, updatedAt: at, calculationEvidence: { version: 1, records: [snapshot.record, secondRecord] } }];
const quote = (id: string) => createQuoteMarkdown({ ...snapshot, quoteId: id });
const difference = createTrackedDifferenceMarkdown(buildQuoteDifferenceMarkdown({ status: 'matched', reason: '', snapshot, start: 0, end: 0 }, 'f', notes, links, JSON.stringify(['m', 'r2'])), snapshot, secondRecord, 'd1', at);
const body = [quote('q1'), difference, quote('q3')].join('\n\n');
let host: HTMLDivElement, root: Root;
const navigate = vi.fn<(start: number, end: number, arrived?: () => void, rejected?: () => void) => void>();
const cancel = vi.fn();
const button = (name: string, scope: ParentNode = host) => [...scope.querySelectorAll<HTMLButtonElement>('button')].find(node => node.textContent === name);
const away = () => host.querySelector<HTMLElement>('[aria-label="点検からの本文移動先"]');
const position = (scope: Element | null = away()) => scope?.textContent?.match(/対象\s*\d+件中\s*\d+件目/)?.[0].replaceAll(' ', '');
async function click(name: string, scope: ParentNode = host) { await act(async () => { const node = button(name, scope); expect(node, name).toBeTruthy(); node!.focus(); node!.click(); }); }
async function arrive(call = navigate.mock.calls.length - 1) { const callback = navigate.mock.calls[call]?.[2]; expect(callback).toBeTypeOf('function'); await act(async () => callback?.()); }
async function render(text = body, extra: { disabled?: boolean; reportId?: string; context?: string } = {}) { await act(async () => root.render(createElement(FormulaReportAudit, { body: text, formulaId: 'f', reportId: 'report', editing: true, onNavigate: navigate, onCancelNavigation: cancel, ...extra }))); }
async function open(text = body, order = 1) { await render(text); await click('根拠点検'); await click(`根拠${order}の詳細`); await click('この項目の本文へ移動'); await arrive(); }
async function step(direction = '次の項目') { await click(direction, away()!); }
const excerpt = () => away()?.querySelector('mark')?.textContent;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); HTMLElement.prototype.scrollIntoView = vi.fn();
  localStorage.clear(); localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...defaultData, notes, formulaReports: { version: 1, entries: [{ id: 'report', formulaId: 'f', title: 'report', body, createdAt: at, updatedAt: at, confirmedExpression: null, evidence: { version: 1, links, confirmations: [] } }] } }));
  navigate.mockReset(); cancel.mockReset(); host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); });

it('commits name, position, selection and complete highlight together only after arrival across different item kinds', async () => {
  await open(); expect(position()).toBe('対象3件中1件目'); expect(away()?.textContent).toContain('固定引用');
  const raw = localStorage.getItem(STORAGE_KEY), reads = vi.spyOn(Storage.prototype, 'getItem'), writes = vi.spyOn(Storage.prototype, 'setItem'), compare = vi.spyOn(evidenceComparison, 'compareEvidenceRecords');
  const original = excerpt(); const next = button('次の項目', away()!)!;
  await step(); expect(position()).toBe('対象3件中1件目'); expect(excerpt()).toBe(original);
  expect(next.getAttribute('aria-disabled') === 'true' || next.disabled).toBe(true);
  const pendingCount = navigate.mock.calls.length; await step(); expect(navigate).toHaveBeenCalledTimes(pendingCount);
  await arrive(); expect(position()).toBe('対象3件中2件目'); expect(away()?.textContent).toContain('比較差分'); expect(excerpt()).toBe(difference);
  await step(); await arrive(); expect(position()).toBe('対象3件中3件目'); expect(excerpt()).toBe(quote('q3'));
  await click('点検へ戻る'); expect(position(host)).toBe('対象3件中3件目');
  expect(reads).not.toHaveBeenCalled(); expect(writes).not.toHaveBeenCalled(); expect(compare).not.toHaveBeenCalled(); reads.mockRestore(); writes.mockRestore(); expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
});
it('retains non-cycling endpoint focus and returns the current detail rather than the departure item', async () => {
  await open(); const previous = button('前の項目', away()!)!; expect(previous.getAttribute('aria-disabled') === 'true' || previous.disabled).toBe(true);
  await step('前の項目'); expect(navigate).toHaveBeenCalledTimes(1); expect(position()).toBe('対象3件中1件目'); expect(document.activeElement).toBe(previous);
  await step(); await arrive(); await step(); await arrive(); const next = button('次の項目', away()!)!;
  await step(); expect(navigate).toHaveBeenCalledTimes(3); expect(position()).toBe('対象3件中3件目'); expect(document.activeElement).toBe(next);
  await click('点検へ戻る'); expect(away()).toBeNull(); expect(host.textContent).toContain('対象3件中3件目'); expect(host.textContent).toContain('q3');
  expect(document.activeElement?.isConnected).toBe(true); expect(document.activeElement).not.toBe(document.body);
});
it('one item disables both directions without cycling', async () => {
  await open(quote('only')); expect(position()).toBe('対象1件中1件目');
  for (const name of ['前の項目', '次の項目']) { const node = button(name, away()!)!; expect(node.getAttribute('aria-disabled') === 'true' || node.disabled).toBe(true); await step(name); }
  expect(navigate).toHaveBeenCalledTimes(1); expect(position()).toBe('対象1件中1件目');
});
it('empty and unselected audits do not create a body navigation position', async () => {
  await render('empty'); await click('根拠点検'); expect(away()).toBeNull(); expect(position(host)).toBeUndefined();
  await render(body); await click('保存記録と照合'); expect(away()).toBeNull(); expect(position(host)).toBeUndefined();
});
it('a direct list body move establishes the actual reached item, not a stale detail selection', async () => {
  await render(); await click('根拠点検'); await click('根拠2の本文へ移動'); await arrive(); expect(position()).toBe('対象3件中2件目'); expect(excerpt()).toBe(difference);
  await step(); await arrive(); await click('点検へ戻る'); expect(position(host)).toBe('対象3件中3件目');
});
it.each(['duplicate', 'unknown', 'incomplete'] as const)('refuses adjacent %s occurrence without silently skipping or changing current state', async kind => {
  const invalid = kind === 'duplicate' ? `${quote('same')}\n\n${quote('same')}` : kind === 'unknown' ? quote('future').replaceAll('calculator-memo-evidence-v1', 'calculator-memo-evidence-v99') : '```calculator-memo-difference-start-v1\n{"version":1,"differenceId":"broken"}\n```\n\n';
  const text = `${quote('valid')}\n\n${invalid}\n\n${quote('later')}`;
  await open(text); const count = parseReportAudit(text, 'f').items.length, prior = excerpt(); expect(position()).toBe(`対象${count}件中1件目`);
  await step(); expect(navigate).toHaveBeenCalledTimes(1); expect(position()).toBe(`対象${count}件中1件目`); expect(excerpt()).toBe(prior); expect(away()?.textContent).toMatch(/できません|移動しません|拒否|不完全|未知/);
  await click('点検へ戻る'); expect(position(host)).toBe(`対象${count}件中1件目`);
});
it('uses filtered occurrence order and keeps the filter when returning', async () => {
  const text = `${quote('same')}\n\n${quote('same')}\n\n${quote('valid')}`;
  await render(text); await click('根拠点検'); await click('保存記録と照合');
  const select = host.querySelector<HTMLSelectElement>('[aria-label="表示する状態"]')!;
  await act(async () => { select.value = 'review'; select.dispatchEvent(new Event('change', { bubbles: true })); });
  // Duplicate occurrences stay in the filtered list and are not navigable.
  expect(host.querySelector('[aria-label="本文順の根拠一覧"]')?.children.length).toBe(2); expect(away()).toBeNull();
  await act(async () => { select.value = 'all'; select.dispatchEvent(new Event('change', { bubbles: true })); });
  await click('根拠3の詳細'); await click('この項目の本文へ移動'); await arrive(); expect(position()).toBe('対象3件中3件目'); await step('前の項目'); expect(position()).toBe('対象3件中3件目'); expect(navigate).toHaveBeenCalledTimes(1);
  await click('点検へ戻る'); expect(host.querySelector<HTMLSelectElement>('[aria-label="表示する状態"]')?.value).toBe('all');
});
it.each(['same-value', 'changed'] as const)('storage %s invalidates an outstanding step and never commits its later callback', async kind => {
  await open(); await step(); const pending = navigate.mock.calls.at(-1)![2];
  await act(async () => window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, newValue: kind === 'same-value' ? localStorage.getItem(STORAGE_KEY) : 'changed' })));
  await act(async () => pending?.()); expect(position()).toBeUndefined(); expect(excerpt()).toBeUndefined(); expect(away()?.textContent).toContain('失効');
  if (button('次の項目', away()!)) await step(); expect(navigate).toHaveBeenCalledTimes(2);
  await click('点検へ戻る'); expect(position(host)).toBeUndefined(); await click('保存記録と照合'); expect(position(host)).toBeUndefined();
});
it('body ABA and report change reject pending callbacks and never revive old positions', async () => {
  await open(); await step(); const pending = navigate.mock.calls.at(-1)![2];
  await render(`prefix\n${body}`); await render(body); await act(async () => pending?.()); expect(position()).toBeUndefined(); expect(excerpt()).toBeUndefined();
  await render(body, { reportId: 'another' }); expect(position()).toBeUndefined();
});
it('saving blocks body stepping; ending and reopening discards pending callbacks and selection', async () => {
  await open(); await render(body, { disabled: true }); await step(); expect(navigate).toHaveBeenCalledTimes(1); expect(position()).toBe('対象3件中1件目');
  await render(); await step(); const pending = navigate.mock.calls.at(-1)![2]; await click('往復ナビゲーションを終了'); await act(async () => pending?.()); expect(away()).toBeNull(); await click('根拠点検'); expect(position(host)).toBeUndefined();
});

it('parent rejection keeps the original item and clears pending state for a later explicit retry', async () => {
  await open(); const before = excerpt(); await step(); const rejected = navigate.mock.calls.at(-1)![3];
  expect(rejected).toBeTypeOf('function'); await act(async () => rejected?.());
  expect(position()).toBe('対象3件中1件目'); expect(excerpt()).toBe(before); expect(away()?.textContent).toMatch(/中止|移動できません/);
  await step(); expect(navigate).toHaveBeenCalledTimes(3); await arrive(); expect(position()).toBe('対象3件中2件目');
});
it('return during a pending body step cancels it and a late arrival cannot replace the restored detail', async () => {
  await open(); await step(); const pending = navigate.mock.calls.at(-1)![2]; await click('点検へ戻る');
  expect(position(host)).toBe('対象3件中1件目'); await act(async () => pending?.()); expect(away()).toBeNull(); expect(position(host)).toBe('対象3件中1件目');
});
it('body stepping follows a proper filtered subset and returns the matching list selection without old-index reuse', async () => {
  const text = [quote('first').replace('当時の表示結果：', '追記：'), quote('middle'), quote('last').replace('当時の表示結果：', '追記：')].join('\n\n');
  await render(text); await click('根拠点検'); await click('保存記録と照合');
  const select = host.querySelector<HTMLSelectElement>('[aria-label="表示する状態"]')!;
  await act(async () => { select.value = 'review'; select.dispatchEvent(new Event('change', { bubbles: true })); });
  expect(host.querySelector('[aria-label="本文順の根拠一覧"]')?.children).toHaveLength(2);
  await click('根拠1の詳細'); await click('この項目の本文へ移動'); await arrive(); expect(position()).toBe('対象2件中1件目');
  await step(); await arrive(); expect(position()).toBe('対象2件中2件目'); expect(away()?.textContent).toContain('根拠3');
  const entries = parseReportAudit(text, 'f').items; expect(navigate.mock.calls.at(-1)?.slice(0, 2)).toEqual([entries[2].start, entries[2].end]);
  await click('点検へ戻る'); expect(position(host)).toBe('対象2件中2件目'); expect(host.querySelector<HTMLSelectElement>('[aria-label="表示する状態"]')!.value).toBe('review');
});
it('source acquisition failure does not skip structurally complete entries or fabricate source agreement', async () => {
  const text = [quote('one'), quote('two')].join('\n\n'); await render(text); await click('根拠点検');
  localStorage.setItem(STORAGE_KEY, '{invalid'); await click('保存記録と照合'); await click('根拠1の詳細'); await click('この項目の本文へ移動'); await arrive();
  await step(); await arrive(); expect(position()).toBe('対象2件中2件目'); expect(away()?.textContent).toContain('保証しません');
  await click('点検へ戻る'); expect(host.textContent).toMatch(/取得.*失敗|未知・不正|取得・検証できません/); expect(position(host)).toBe('対象2件中2件目');
});
