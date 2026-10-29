// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { FormulaReportAudit } from '../components/FormulaReportAudit';
import { createQuoteMarkdown, type QuoteSnapshot } from '../lib/formula-report-quotes';
import { createTrackedDifferenceMarkdown } from '../lib/formula-report-diff-tracking';
import { buildQuoteDifferenceMarkdown } from '../lib/formula-report-diff';
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
async function step(direction = '次の項目') { await click(direction, away()!); }
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); HTMLElement.prototype.scrollIntoView = vi.fn();
  localStorage.clear(); localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...defaultData, notes, formulaReports: { version: 1, entries: [{ id: 'report', formulaId: 'f', title: 'report', body, createdAt: at, updatedAt: at, confirmedExpression: null, evidence: { version: 1, links, confirmations: [] } }] } }));
  navigate.mockReset(); cancel.mockReset(); host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); });

it('independent regression: direct list roundtrip preserves unselected list and originating focus until a body step succeeds', async () => {
  await render(); await click('根拠点検');
  for (const order of [1, 3]) {
    const origin = button(`根拠${order}の本文へ移動`)!;
    await click(`根拠${order}の本文へ移動`); await arrive();
    expect(position()).toBe(`対象3件中${order}件目`);
    await click('点検へ戻る');
    expect(host.querySelector('[aria-label="点検項目の前後移動"]')).toBeNull();
    expect(document.activeElement).toBe(origin);
  }
  await click('根拠1の本文へ移動'); await arrive(); await step(); await arrive(); await click('点検へ戻る');
  expect(position(host)).toBe('対象3件中2件目');
  expect(document.activeElement).toBe(button('この項目の本文へ移動'));
});
