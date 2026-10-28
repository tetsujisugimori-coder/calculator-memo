// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { FormulaReportAudit } from '../components/FormulaReportAudit';
import { createQuoteMarkdown, type QuoteSnapshot } from '../lib/formula-report-quotes';
import { createTrackedDifferenceMarkdown } from '../lib/formula-report-diff-tracking';
import { buildQuoteDifferenceMarkdown } from '../lib/formula-report-diff';
import * as reportAudit from '../lib/formula-report-audit';
import * as evidenceComparison from '../lib/evidence-comparison';
import { defaultData, STORAGE_KEY } from '../lib/storage';
import type { Memo } from '../lib/types';

const at = '2026-10-28T00:00:00.000Z';
const snapshot: QuoteSnapshot = { version: 1, quoteId: 'q1', formulaId: 'f', memoId: 'm', blockId: 'b', citedAt: at, record: { id: 'r1', evaluator: 'calculator-memo-v1', status: 'confirmed', calculatedAt: at, persistedAt: at, blocks: [{ blockId: 'b', position: 1, expression: '1', result: '1', resultText: '1', status: 'success', inputs: [] }] } };
const secondRecord = { ...structuredClone(snapshot.record), id: 'r2', blocks: [{ ...snapshot.record.blocks[0], expression: '2', result: '2', resultText: '2' }] };
const links = [{ memoId: 'm', recordId: 'r1' }, { memoId: 'm', recordId: 'r2' }];
const notes: Memo[] = [{ id: 'm', type: 'plain-calculation', title: 'original', content: '1', createdAt: at, updatedAt: at, calculationEvidence: { version: 1, records: [snapshot.record, secondRecord] } }];
const quote = (id: string) => createQuoteMarkdown({ ...snapshot, quoteId: id });
const difference = createTrackedDifferenceMarkdown(buildQuoteDifferenceMarkdown({ status: 'matched', reason: '', snapshot, start: 0, end: 0 }, 'f', notes, links, JSON.stringify(['m', 'r2'])), snapshot, secondRecord, 'd1', at);
const mixed = `${quote('q1')}\n\n${difference}\n\n${quote('q3').replace('当時の表示結果：', '改稿：')}`;
let host: HTMLDivElement, root: Root;
const navigate = vi.fn();
const button = (name: string) => [...host.querySelectorAll<HTMLButtonElement>('button')].find(node => node.textContent === name);
async function click(name: string) { await act(async () => { const node = button(name); expect(node, name).toBeTruthy(); node!.focus(); node!.click(); }); }
async function filter(value: string) { await act(async () => { const node = (host.querySelector<HTMLSelectElement>('[aria-label="詳細で表示する状態"]') ?? host.querySelector<HTMLSelectElement>('[aria-label="表示する状態"]'))!; node.value = value; node.dispatchEvent(new Event('change', { bubbles: true })); }); }
const position = () => host.textContent!.match(/対象\s*\d+件中\s*\d+件目/)?.[0].replaceAll(' ', '');
const list = () => host.querySelector<HTMLOListElement>('[aria-label="本文順の根拠一覧"]')!;
async function render(body = mixed, extra: { disabled?: boolean; reportId?: string } = {}) { await act(async () => root.render(createElement(FormulaReportAudit, { body, formulaId: 'f', reportId: 'report', editing: true, onNavigate: navigate, ...extra }))); }
async function open(body = mixed) { await render(body); await click('根拠点検'); }
async function storage(raw: string) { await act(async () => window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, newValue: raw }))); }
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); HTMLElement.prototype.scrollIntoView = vi.fn();
  localStorage.clear(); localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...defaultData, notes, formulaReports: { version: 1, entries: [{ id: 'report', formulaId: 'f', title: 'report', body: mixed, createdAt: at, updatedAt: at, confirmedExpression: null, evidence: { version: 1, links, confirmations: [] } }] } }));
  navigate.mockReset(); host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); });

it('zero items and unselected lists never fabricate a current position', async () => {
  await open('plain text'); expect(position()).toBeUndefined(); expect(host.textContent).toMatch(/項目がありません|対象.*ありません/);
  await render(mixed); await click('保存記録と照合'); expect(position()).toBeUndefined(); expect(host.textContent).toMatch(/一覧から.*選/);
});
it('one item has accessible non-operating boundaries without native focus loss', async () => {
  await open(quote('only')); await click('根拠1の詳細'); expect(position()).toBe('対象1件中1件目');
  for (const name of ['前の項目', '次の項目']) {
    const node = button(name)!; expect(node).toBeTruthy(); expect(node.getAttribute('aria-disabled')).toBe('true'); expect(node.disabled).toBe(false);
    await click(name); expect(document.activeElement).toBe(node); expect(position()).toBe('対象1件中1件目');
  }
});
it('steps existing body order across quote/difference/edited items, retains the button at endpoints, and has no persistence/acquisition effects', async () => {
  await open(); await click('保存記録と照合'); const raw = localStorage.getItem(STORAGE_KEY);
  const read = vi.spyOn(Storage.prototype, 'getItem'), write = vi.spyOn(Storage.prototype, 'setItem');
  const assess = vi.spyOn(reportAudit, 'assessReportAudit'), parse = vi.spyOn(reportAudit, 'parseReportAudit'), compare = vi.spyOn(evidenceComparison, 'compareEvidenceRecords');
  await click('根拠1の詳細'); expect(position()).toBe('対象3件中1件目');
  await click('次の項目'); expect(position()).toBe('対象3件中2件目'); expect(host.textContent).toContain('差分ID：d1');
  await click('次の項目'); const next = button('次の項目')!; expect(position()).toBe('対象3件中3件目'); expect(document.activeElement).toBe(next); expect(next.getAttribute('aria-disabled')).toBe('true');
  await click('次の項目'); expect(position()).toBe('対象3件中3件目');
  await click('前の項目'); expect(position()).toBe('対象3件中2件目'); await click('前の項目'); const previous = button('前の項目')!;
  expect(position()).toBe('対象3件中1件目'); expect(document.activeElement).toBe(previous); expect(previous.getAttribute('aria-disabled')).toBe('true');
  expect(read).not.toHaveBeenCalled(); expect(write).not.toHaveBeenCalled(); expect(navigate).not.toHaveBeenCalled(); expect(assess).not.toHaveBeenCalled(); expect(parse).not.toHaveBeenCalled(); expect(compare).not.toHaveBeenCalled(); read.mockRestore(); write.mockRestore(); expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
});
it('filter retention uses occurrence key not old index; exclusion clears details with a reason and never selects a neighbor', async () => {
  await open(); await click('保存記録と照合'); await click('根拠3の詳細'); expect(position()).toBe('対象3件中3件目');
  await filter('review'); expect(list().children).toHaveLength(1); expect(position()).toBe('対象1件中1件目');
  await filter('all'); expect(position()).toBe('対象3件中3件目'); await click('前の項目'); expect(position()).toBe('対象3件中2件目');
  await filter('review'); expect(position()).toBeUndefined(); expect(host.textContent).toMatch(/絞り込み.*(対象外|含まれ|解除)/); expect(host.textContent).not.toContain('差分ID：d1');
  await filter('all'); expect(position()).toBeUndefined();
});
it.each(['duplicate', 'unknown', 'incomplete'] as const)('does not skip %s occurrences just because body jump is unsafe', async kind => {
  const text = kind === 'duplicate' ? `${quote('same')}\n\n${quote('same')}` : kind === 'unknown' ? quote('future').replaceAll('calculator-memo-evidence-v1', 'calculator-memo-evidence-v99') : '```calculator-memo-difference-start-v1\n{"version":1,"differenceId":"broken"}\n```\n\n';
  await open(text); const count = list().children.length; expect(count).toBeGreaterThan(0); await click('根拠1の詳細'); expect(position()).toBe(`対象${count}件中1件目`);
  if (count > 1) { await click('次の項目'); expect(position()).toBe(`対象${count}件中2件目`); }
  expect(navigate).not.toHaveBeenCalled(); expect(host.textContent).toMatch(/検証でき|不正|未知|不完全/);
});
it.each(['changed', 'same-value'] as const)('storage %s invalidation stops old stepping and refresh requires explicit selection', async mode => {
  await open(); await click('保存記録と照合'); await click('根拠1の詳細'); const raw = localStorage.getItem(STORAGE_KEY)!; const read = vi.spyOn(Storage.prototype, 'getItem');
  await storage(mode === 'same-value' ? raw : 'changed-generation'); expect(position()).toBeUndefined(); expect(host.textContent).toContain('失効');
  if (button('次の項目')) { await click('次の項目'); expect(position()).toBeUndefined(); }
  expect(read).not.toHaveBeenCalled(); await click('保存記録と照合'); expect(read).toHaveBeenCalledTimes(1); expect(position()).toBeUndefined(); await click('根拠2の詳細'); expect(position()).toBe('対象3件中2件目');
});
it('body ABA and report identity changes never revive old count/position/selection', async () => {
  await open(); await click('根拠2の詳細'); await render(`prefix\n${mixed}`); await render(mixed); expect(position()).toBeUndefined(); expect(host.textContent).toContain('失効');
  await click('保存記録と照合'); expect(position()).toBeUndefined(); await click('根拠1の詳細'); await render(mixed, { reportId: 'other' }); expect(position()).toBeUndefined();
});
it('closing and reopening clears navigation and does not silently restore selected occurrence', async () => {
  await open(); await click('根拠1の詳細'); await click('次の項目'); await click('次の項目'); await click('根拠一覧に戻る'); await click('根拠点検を閉じる'); await click('根拠点検'); expect(position()).toBeUndefined(); expect(navigate).not.toHaveBeenCalled();
});
it('selected unsafe item rejects body navigation without dropping selection or breaking next/previous', async () => {
  await open(`${quote('same')}\n\n${quote('same')}\n\n${quote('valid')}`); await click('根拠1の詳細');
  expect(button('この項目の本文へ移動')!.disabled).toBe(true); await click('この項目の本文へ移動'); expect(position()).toBe('対象3件中1件目'); expect(navigate).not.toHaveBeenCalled();
  await click('次の項目'); expect(position()).toBe('対象3件中2件目'); await click('次の項目'); expect(position()).toBe('対象3件中3件目'); expect(button('この項目の本文へ移動')!.disabled).toBe(false);
});
it('saving disables sequential operations and body jump without changing the current selection', async () => {
  await open(); await click('根拠2の詳細'); await render(mixed, { disabled: true });
  const before = position(); await click('次の項目'); expect(position()).toBe(before); await click('前の項目'); expect(position()).toBe(before);
  await click('この項目の本文へ移動'); expect(navigate).not.toHaveBeenCalled();
});
