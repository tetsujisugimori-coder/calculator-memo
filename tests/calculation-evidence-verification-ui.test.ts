// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MarkdownReportModal } from '../components/MarkdownReportModal';
import * as evidence from '../lib/calculation-evidence';
import * as report from '../lib/markdown-report';
import { STORAGE_KEY } from '../lib/storage';
import type { PlainCalculationNote } from '../lib/types';

const record = (id = 'record-1'): evidence.EvidenceRecord => ({
  id, calculatedAt: '2026-10-21T01:00:00.000Z', persistedAt: '2026-10-21T01:01:00.000Z', evaluator: 'calculator-memo-v1', status: 'confirmed',
  blocks: [
    { blockId: 'A', position: 1, expression: '100', inputs: [], result: '100', resultText: '100', status: 'success' },
    { blockId: 'B', position: 2, expression: '@{1}+50', evaluationMode: 'block-references', references: { version: 1, entries: [{ slot: 1, blockId: 'A' }] }, inputs: [{ kind: 'id', name: 'ReferenceValue1', sourceBlockId: 'A', value: '100' }], result: '150', resultText: '150', status: 'success' },
  ],
});
const note = (records: evidence.EvidenceRecord[] = [record()]): PlainCalculationNote => ({
  id: 'memo', type: 'plain-calculation', title: '記録付き原本', content: '', blocks: [], createdAt: '2026-10-21T00:00:00.000Z', updatedAt: '2026-10-21T02:00:00.000Z', calculationEvidence: { version: 1, records },
});
const store = (saved = note()) => localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, history: [], notes: [saved], settings: { theme: 'light', activePanel: 'notes' } }));
let host: HTMLDivElement, root: Root;
const copy = vi.fn();
const button = (label: string) => [...host.querySelectorAll('button')].find(node => node.textContent === label);
const click = async (label: string) => act(async () => button(label)!.click());
const show = async () => act(async () => root.render(createElement(MarkdownReportModal, { memoId: 'memo', onClose: vi.fn() })));
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear(); store(); host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  copy.mockReset().mockResolvedValue(undefined);
  vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: copy } });
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('only evaluates saved evidence after the explicit verification button, not opening or copying/downloading', async () => {
  const verify = vi.spyOn(evidence, 'verifyCalculationEvidence');
  vi.spyOn(report, 'downloadMarkdownReport').mockImplementation(() => {});
  const writes = vi.spyOn(Storage.prototype, 'setItem'), raw = localStorage.getItem(STORAGE_KEY);
  await show(); expect(verify).not.toHaveBeenCalled();
  const markdown = host.querySelector('textarea')!.value;
  await click('Markdown全文をコピー'); await click('.mdをダウンロード'); expect(verify).not.toHaveBeenCalled();
  await click('保存記録を再現検証');
  expect(verify).toHaveBeenCalledExactlyOnceWith(record());
  expect(host.textContent).toContain('1件の保存記録を再現できました');
  expect(host.textContent).toContain('暗号学的な真正性や数学的証明の保証ではありません');
  expect(writes).not.toHaveBeenCalled(); expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
  expect(host.querySelector('textarea')!.value).toBe(markdown);
});
it('verifies every record and reports all outcomes without hiding a failed record', async () => {
  const second = record('second'); second.blocks[1].result = second.blocks[1].resultText = '999';
  store(note([record(), second])); const raw = localStorage.getItem(STORAGE_KEY);
  const verify = vi.spyOn(evidence, 'verifyCalculationEvidence');
  await show(); await click('保存記録を再現検証');
  expect(verify).toHaveBeenCalledTimes(2); expect(host.querySelector('[role="alert"]')?.textContent).toContain('1件の保存記録を再現できませんでした');
  expect(host.textContent).toContain('記録 second:'); expect(host.textContent).not.toContain('2件の保存記録を再現できました');
  expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
});
it('does not use later storage changes as a fallback for the opened snapshot', async () => {
  await show(); store(note([record('later-record')])); const raw = localStorage.getItem(STORAGE_KEY);
  const verify = vi.spyOn(evidence, 'verifyCalculationEvidence');
  await click('保存記録を再現検証');
  expect(verify).toHaveBeenCalledExactlyOnceWith(record()); expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
});
it('shows a safe failure if verification unexpectedly throws and keeps the report accessible', async () => {
  vi.spyOn(evidence, 'verifyCalculationEvidence').mockImplementation(() => { throw new Error('unexpected'); });
  await show(); const markdown = host.querySelector('textarea')!.value;
  await click('保存記録を再現検証');
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('記録を再現検証できませんでした');
  expect(host.querySelector('textarea')!.value).toBe(markdown); await click('Markdown全文をコピー'); expect(copy).toHaveBeenCalledWith(markdown);
});
it('does not offer verification or infer past values for records without history', async () => {
  const saved = note(); delete saved.calculationEvidence; store(saved);
  await show(); expect(button('保存記録を再現検証')).toBeUndefined(); expect(host.textContent).toContain('過去の計算時の使用値は確認不能');
});
it('does not offer verification for an empty history', async () => {
  store(note([])); await show(); expect(button('保存記録を再現検証')).toBeUndefined(); expect(host.textContent).toContain('根拠記録はありません');
});
it('renders hostile record IDs as text in validation errors', async () => {
  const saved = record('<img src=x onerror=alert(1)>'); saved.blocks[0].result = '999'; store(note([saved]));
  await show(); await click('保存記録を再現検証');
  expect(host.querySelector('img')).toBeNull(); expect(host.querySelector('[role="alert"]')?.textContent).toContain('<img src=x onerror=alert(1)>');
});
