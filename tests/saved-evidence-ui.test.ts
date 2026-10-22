// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { SavedEvidenceModal } from '../components/SavedEvidenceModal';
import * as evidence from '../lib/calculation-evidence';
import * as report from '../lib/markdown-report';
import * as comparison from '../lib/evidence-comparison';
import * as impactAnalysis from '../lib/evidence-impact';
import { STORAGE_KEY } from '../lib/storage';
import type { PlainCalculationNote } from '../lib/types';
const record = (id: string, value = 100): evidence.EvidenceRecord => ({ id, calculatedAt: '2026-10-21T01:00:00.000Z', persistedAt: '2026-10-21T01:01:00.000Z', evaluator: 'calculator-memo-v1', status: 'confirmed', blocks: [
  { blockId: 'A', position: 1, expression: String(value), inputs: [], result: String(value), resultText: String(value), status: 'success' },
  { blockId: 'B', position: 2, expression: '@{1}+50', evaluationMode: 'block-references', references: { version: 1, entries: [{ slot: 1, blockId: 'A' }] }, inputs: [{ kind: 'id', name: 'ReferenceValue1', sourceBlockId: 'A', value: String(value) }], result: String(value + 50), resultText: String(value + 50), status: 'success' },
  { blockId: 'C', position: 3, expression: '@{1}*2', evaluationMode: 'block-references', references: { version: 1, entries: [{ slot: 1, blockId: 'B' }] }, inputs: [{ kind: 'id', name: 'ReferenceValue1', sourceBlockId: 'B', value: String(value + 50) }], result: String((value + 50) * 2), resultText: String((value + 50) * 2), status: 'success' },
] });
const note = (records = [record('old'), record('new', 120)]): PlainCalculationNote => ({ id: 'memo', type: 'plain-calculation', title: '保存済みタイトル', content: '現本文', blocks: [{ id: 'A', type: 'calculation', expression: '999', displayExpression: '999', result: 999, resultText: '999', error: null }], createdAt: '2026-10-21T00:00:00.000Z', updatedAt: '2026-10-21T02:00:00.000Z', calculationEvidence: { version: 1, records } });
const save = (n = note()) => localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, notes: [n], history: [], settings: { theme: 'light', activePanel: 'notes' } }));
let host: HTMLDivElement, root: Root;
const copy = vi.fn(), close = vi.fn();
const button = (label: string) => [...host.querySelectorAll('button')].find(item => item.textContent === label)!;
const click = async (label: string) => act(async () => button(label).click());
const select = (label: string) => host.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`)!;
const change = async (label: string, value: string) => act(async () => { select(label).value = value; select(label).dispatchEvent(new Event('change', { bubbles: true })); });
const show = async () => act(async () => root.render(createElement(SavedEvidenceModal, { memoId: 'memo', onClose: close })));
const md = () => host.querySelector('textarea')?.value;
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.spyOn(console, 'error').mockImplementation(() => {}); localStorage.clear(); save(); host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  copy.mockReset().mockResolvedValue(undefined); close.mockReset(); vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText: copy } });
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it('lists immutable saved records and compares A/B/C actual inputs without current values or evaluation/writes', async () => {
  const raw = localStorage.getItem(STORAGE_KEY), writes = vi.spyOn(Storage.prototype, 'setItem'), verify = vi.spyOn(evidence, 'verifyCalculationEvidence');
  const download = vi.spyOn(report, 'downloadMarkdownReport').mockImplementation(() => {});
  await show(); expect(select('変更前の記録').value).toBe('old'); expect(select('変更後の記録').value).toBe('new');
  expect(host.textContent).toContain('保存要求時刻'); expect(host.textContent).toContain('実際の保存完了時刻ではありません');
  await act(async () => { const row = host.querySelector<HTMLDetailsElement>('.evidence-diff-row[data-block-id="C"]')!; row.open = true; row.dispatchEvent(new Event('toggle')); }); expect(host.textContent).toContain('実使用内部値'); expect(host.textContent).toContain('340'); expect(md()).toContain('150'); expect(md()).toContain('170'); expect(md()).not.toContain('999');
  const markdown = md(); await click('比較Markdown全文をコピー'); await click('比較.mdをダウンロード');
  expect(copy).toHaveBeenCalledWith(markdown); expect(download.mock.calls[0][0].markdown).toBe(markdown);
  expect(host.textContent).toContain('実際の保存先と完了はブラウザで確認'); expect(writes).not.toHaveBeenCalled(); expect(verify).not.toHaveBeenCalled(); expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
});
it('chooses append order despite clock inversion and supports swapping', async () => {
  const first = record('first'), second = record('second'), last = record('last');
  first.calculatedAt = '2030-01-01T00:00:00.000Z'; last.calculatedAt = '2000-01-01T00:00:00.000Z'; save(note([first, second, last]));
  await show(); expect(select('変更前の記録').value).toBe('second'); expect(select('変更後の記録').value).toBe('last');
  await click('前後を入れ替える'); expect(select('変更前の記録').value).toBe('last'); expect(select('変更後の記録').value).toBe('second');
});
it('requires distinct selections, and leaves detail viewing available', async () => {
  await show(); await change('変更前の記録', 'new'); expect(md()).toBeUndefined(); expect(host.textContent).toContain('異なる2件'); expect(select('記録の詳細').value).toBe('new');
});
it('explains absent old-data history without inventing prior values', async () => {
  const n = note(); delete n.calculationEvidence; save(n); await show(); expect(host.textContent).toContain('0件'); expect(host.textContent).toContain('過去の使用値は確認不能'); expect(md()).toBeUndefined();
});
it('shows empty history as non-comparable', async () => { save(note([])); await show(); expect(host.textContent).toContain('履歴がないため比較できません'); expect(md()).toBeUndefined(); });
it('one record provides detail only, without comparing it to itself', async () => { save(note([record('one')])); await show(); expect(select('記録の詳細').value).toBe('one'); expect(host.textContent).toContain('現在は1件の詳細のみ'); expect(md()).toBeUndefined(); });
it('does not substitute current storage for a frozen opened snapshot until refresh', async () => {
  await show(); const old = md(); save(note([record('old'), record('new', 500)]));
  await act(async () => window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, newValue: localStorage.getItem(STORAGE_KEY) })));
  expect(host.textContent).toContain('外部更新を検知'); expect(md()).toBe(old); await click('比較Markdown全文をコピー'); expect(copy).toHaveBeenCalledWith(old);
  await click('最新の保存内容を再取得'); expect(md()).not.toBe(old); expect(md()).toContain('1100'); expect(select('変更後の記録').value).toBe('new');
});
it('clears vanished selected records on refresh without silently replacing by latest pair', async () => {
  await show(); save(note([record('replacement1'), record('replacement2')])); await click('最新の保存内容を再取得');
  expect(select('変更前の記録').value).toBe(''); expect(select('変更後の記録').value).toBe(''); expect(select('記録の詳細').value).toBe(''); expect(md()).toBeUndefined(); expect(host.textContent).toContain('別の記録で代用せず');
});
it('failed refresh removes export rather than mixing new damaged data with old selection', async () => {
  await show(); localStorage.setItem(STORAGE_KEY, '{broken'); const raw = localStorage.getItem(STORAGE_KEY), writes = vi.spyOn(Storage.prototype, 'setItem'); await click('最新の保存内容を再取得');
  expect(md()).toBeUndefined(); expect(host.textContent).toContain('比較不可'); expect(localStorage.getItem(STORAGE_KEY)).toBe(raw); expect(writes).not.toHaveBeenCalled();
});
it('missing saved memo does not fall back to a draft', async () => { localStorage.clear(); await show(); expect(host.textContent).toContain('原本を安全に読み取れません'); expect(md()).toBeUndefined(); });
it.each(['unknown-version', 'invalid-result'])('fails closed for %s without altering protected bytes', async variant => {
  const n = note(); if (variant === 'unknown-version') (n.calculationEvidence as unknown as { version: number }).version = 2; else n.calculationEvidence!.records[0].blocks[0].result = 'NaN';
  save(n); const raw = localStorage.getItem(STORAGE_KEY), writes = vi.spyOn(Storage.prototype, 'setItem'); await show(); expect(md()).toBeUndefined(); expect(host.textContent).toContain('比較不可'); expect(localStorage.getItem(STORAGE_KEY)).toBe(raw); expect(writes).not.toHaveBeenCalled();
});
it('unknown extra fields remain in original bytes and are explicitly not compared', async () => {
  const n = note(); Object.assign(n.calculationEvidence!.records[0], { future: { a: true } }); save(n); const raw = localStorage.getItem(STORAGE_KEY); await show(); expect(md()).toContain('未知の付随フィールド'); expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
});
it('same-content distinct records are unchanged and can be expanded by request', async () => {
  save(note([record('a'), record('b')])); await show(); expect(host.querySelectorAll('.evidence-diff-row')).toHaveLength(0);
  await act(async () => host.querySelector<HTMLInputElement>('input[type=checkbox]')!.click()); expect(host.querySelectorAll('.evidence-diff-row')).toHaveLength(3); expect(md()).toContain('比較対象項目に変更なし');
});
it('reports clipboard rejection without claiming success', async () => {
  copy.mockRejectedValue(new Error('denied')); await show(); await click('比較Markdown全文をコピー'); expect(host.querySelector('[role=alert]')?.textContent).toContain('コピーに失敗'); expect(host.textContent).not.toContain('コピーしました'); expect(md()).toBeTruthy();
});
it('reports download rejection without claiming OS save completion', async () => {
  vi.spyOn(report, 'downloadMarkdownReport').mockImplementation(() => { throw new Error('blocked'); }); await show(); await click('比較.mdをダウンロード'); expect(host.querySelector('[role=alert]')?.textContent).toContain('ダウンロードを開始できません'); expect(md()).toBeTruthy();
});
it('keeps selection and snapshot fixed while asynchronous copy is pending', async () => {
  let resolve!: () => void; copy.mockImplementation(() => new Promise<void>(done => { resolve = done; })); await show(); await act(async () => button('比較Markdown全文をコピー').click());
  expect(select('変更前の記録').disabled).toBe(true); expect(button('最新の保存内容を再取得').disabled).toBe(true); await act(async () => resolve()); expect(select('変更前の記録').disabled).toBe(false);
});
it('output limit failures retain readable comparison and do not offer truncated export', async () => {
  vi.spyOn(comparison, 'buildEvidenceComparisonMarkdown').mockImplementation(() => { throw new Error('出力上限のため停止'); }); await show(); expect(host.textContent).toContain('出力上限のため停止'); expect(host.querySelector('[aria-label="保存記録の比較結果"]')).not.toBeNull(); expect(md()).toBeUndefined();
});
it('renders hostile strings as inert text and preserves stored source', async () => {
  const n = note(); n.title = '<img src=x onerror=alert(1)>'; n.calculationEvidence!.records[0].blocks[0].expression = '```\n<script>bad</script>'; save(n); const raw = localStorage.getItem(STORAGE_KEY); await show(); expect(host.querySelector('img,script')).toBeNull(); expect(md()).toContain('<script>bad</script>'); expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
});
it('traps keyboard focus at modal boundaries and restores entry focus on unmount', async () => {
  const entry = document.createElement('button'); document.body.append(entry); entry.focus(); await show();
  const buttons = host.querySelectorAll('button'); expect(document.activeElement).toBe(buttons[0]);
  await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }))); expect(document.activeElement).toBe(buttons[buttons.length - 1]);
  await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))); expect(close).toHaveBeenCalledOnce();
  await act(async () => root.render(null)); expect(document.activeElement).toBe(entry); entry.remove();
});

it('lazily mounts per-block details for a capacity-valid large history', async () => {
  const a = record('large-before'), b = record('large-after');
  a.blocks = Array.from({ length: 1500 }, (_, i) => ({ blockId: `b${i}`, position: i + 1, expression: '1', inputs: [], result: '1', resultText: '1', status: 'success' }));
  b.blocks = a.blocks.map(block => ({ ...block, expression: '2', result: '2', resultText: '2' }));
  expect(evidence.validCalculationEvidence({ version: 1, records: [a, b] })).toBe(true); save(note([a, b]));
  await show(); expect(host.querySelectorAll('.evidence-block-values')).toHaveLength(0); expect(host.querySelectorAll('.evidence-diff-row')).toHaveLength(1500);
  await act(async () => { const row = host.querySelector<HTMLDetailsElement>('.evidence-diff-row')!; row.open = true; row.dispatchEvent(new Event('toggle')); });
  expect(host.querySelectorAll('.evidence-block-values')).toHaveLength(2); expect(md()).toContain('b1499');
});


it('uses compact unique append-order options while preserving complete IDs and metadata', async () => {
  const prefix = 'same-prefix-'.repeat(4);
  const records = Array.from({ length: 100 }, (_, i) => record(`${prefix}${i}`));
  save(note(records)); const raw = localStorage.getItem(STORAGE_KEY); await show();
  for (const label of ['記録の詳細', '変更前の記録', '変更後の記録']) {
    const control = select(label);
    expect([...control.options].slice(1).map(option => option.textContent)).toEqual(records.map((_, i) => `記録 ${i + 1}`));
    expect([...control.options].slice(1).map(option => option.value)).toEqual(records.map(record => record.id));
    expect(document.getElementById(control.getAttribute('aria-describedby')!)?.textContent).toContain('追記順');
  }
  expect(host.querySelector('.evidence-record-list')?.textContent).toContain(records[0].id);
  expect(host.textContent).toContain(records[99].id); expect(host.textContent).toContain(records[99].persistedAt);
  await change('記録の詳細', records[0].id); expect(select('記録の詳細').value).toBe(records[0].id);
  const info = host.querySelector('section[aria-label="選択した記録の情報"]')!;
  expect(info.textContent).toContain(records[0].id); expect(info.textContent).toContain(records[0].calculatedAt);
  expect(info.textContent).toContain('保存要求時刻'); expect(info.textContent).toContain('計算ブロック数3');
  expect(info.closest('details')).toBeNull();
  await click('前後を入れ替える'); expect(select('変更前の記録').value).toBe(records[99].id);
  expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
});

it('retains record identity when explicit refresh changes append-index labels', async () => {
  save(note([record('a'), record('b'), record('c')])); await show();
  expect(select('変更前の記録').selectedOptions[0].textContent).toBe('記録 2');
  save(note([record('b'), record('c')])); await click('最新の保存内容を再取得');
  expect(select('変更前の記録').value).toBe('b'); expect(select('変更前の記録').selectedOptions[0].textContent).toBe('記録 1');
  expect(select('変更後の記録').value).toBe('c'); expect(select('変更後の記録').selectedOptions[0].textContent).toBe('記録 2');
  save(note([record('c')])); await click('最新の保存内容を再取得');
  expect(host.textContent).toContain('選択していた記録が再取得した原本にありません'); expect(md()).toBeUndefined();
});

it('shares frozen impact paths and independent labels with exported Markdown', async () => {
  await show(); const raw = localStorage.getItem(STORAGE_KEY); const writes = vi.spyOn(Storage.prototype, 'setItem');
  const region = host.querySelector('[aria-label="保存記録の変更影響分析"]')!;
  await act(async () => { const detail = region.querySelector('details')!; detail.open = true; detail.dispatchEvent(new Event('toggle')); });
  const row = region.querySelector<HTMLDetailsElement>('[data-impact-block-id="C"]')!;
  expect(row.textContent).toContain('波及変更候補'); expect(row.textContent).toContain('結果差分');
  await act(async () => { row.open = true; row.dispatchEvent(new Event('toggle')); });
  expect(row.textContent).toContain('A → B → C'); expect(row.textContent).toContain('150'); expect(row.textContent).toContain('170');
  expect(md()).toContain('A → B → C'); expect(md()).toContain('変更後の経路');
  expect(writes).not.toHaveBeenCalled(); expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
});

it('flags structurally valid inconsistent saved inputs without rewriting or repairing them', async () => {
  const n = note(); n.calculationEvidence!.records[1].blocks[1].inputs[0].value = '999'; save(n);
  const raw = localStorage.getItem(STORAGE_KEY); await show();
  expect(md()).toContain('判定不能'); expect(md()).toContain('一致しません'); expect(md()).toContain('999');
  expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
});

it('keeps existing comparison and blocks incomplete export if analysis alone fails', async () => {
  vi.spyOn(impactAnalysis, 'analyzeEvidenceImpact').mockImplementation(() => { throw new Error('analysis failed'); });
  const raw = localStorage.getItem(STORAGE_KEY); await show();
  expect(host.textContent).toContain('既存の記録比較は表示しています');
  expect(host.querySelector('.evidence-diff-row')).not.toBeNull();
  expect(button('比較Markdown全文をコピー')).toBeUndefined();
  expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
});
