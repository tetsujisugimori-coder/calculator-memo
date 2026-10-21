// @vitest-environment jsdom
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MemoBlockEditor } from '../components/MemoBlockEditor';
import { PlainNoteModal } from '../components/PlainNoteModal';
import { mermaidBlockId } from '../lib/dependency-mermaid';
import type { MemoBlock, PlainNoteDraft } from '../lib/types';

// Only layout is mocked: the actual editor, comparison model, SVG safety and
// selection handlers are exercised. The real renderer is covered by six GUI contexts.
vi.mock('mermaid', () => ({ default: { initialize: vi.fn(), render: vi.fn(async (_id: string, text: string) => {
  const ids = [...text.matchAll(/^\s*(block_[a-f0-9]+)\[/gm)].map(match => match[1]);
  return { svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 100">${ids.map(id => `<g class="node" id="flowchart-${id}-0"><rect width="100" height="50"/><g class="label"/></g>`).join('')}</svg>` };
}) } }));
const calc = (id: string, expression: string, result: number, target?: string): MemoBlock => ({
  id, type: 'calculation', evaluationMode: 'block-references', expression, displayExpression: expression,
  references: { version: 1, entries: target ? [{ slot: 1, blockId: target }] : [] }, result, resultText: String(result), error: null,
});
const chain = () => [calc('a', '100', 100), calc('b', '@{1}+50', 150, 'a')];
let root: Root, host: HTMLDivElement;
const changed = vi.fn();
function Editor({ initial }: { initial: MemoBlock[] }) {
  const [blocks, setBlocks] = useState(initial);
  return createElement(MemoBlockEditor, { blocks, manual: true, onChange: next => { changed(next); setBlocks(next); }, onOpenGuide: vi.fn() });
}
const button = (text: string) => [...host.querySelectorAll('button')].find(node => node.textContent === text)!;
const row = (id: string) => host.querySelector(`[data-comparison-block-id="${id}"]`)!;
async function click(text: string) { await act(async () => button(text).click()); }
async function remove(id: string) {
  await act(async () => host.querySelector<HTMLButtonElement>(`.block-editor-card[data-block-id="${id}"] [aria-label="計算ブロックを削除"]`)!.click());
}
async function openComparison() {
  const panel = host.querySelector<HTMLDetailsElement>('.dependency-graph-panel');
  expect(panel).not.toBeNull();
  await act(async () => { panel!.open = true; panel!.dispatchEvent(new Event('toggle')); });
  await click('変更前後・試算');
}
async function select(id: string) {
  const node = host.querySelector(`.dependency-graph-svg [data-block-id="${id}"]`);
  expect(node, `SVG node ${mermaidBlockId(id)}`).not.toBeNull();
  await act(async () => node!.dispatchEvent(new MouseEvent('click', { bubbles: true })));
}
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div'); document.body.append(host); root = createRoot(host); changed.mockReset();
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { callback(0); return 0; });
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('A: opens historical nodes and edge after deleting every calculation without calculating or saving', async () => {
  const initial: PlainNoteDraft = { title: 'A → B', content: '', blocks: chain(), calculationPolicy: { version: 1, mode: 'manual' } };
  const original = JSON.stringify(initial), save = vi.fn(), writes = vi.spyOn(Storage.prototype, 'setItem');
  await act(async () => root.render(createElement(PlainNoteModal, { initial, onSave: save, onClose: vi.fn(), onOpenGuide: vi.fn() })));
  await remove('a'); await remove('b'); await openComparison();
  for (const id of ['a', 'b']) {
    expect(row(id).textContent).toContain('削除済み（変更前）'); expect(row(id).querySelector('button')).toBeNull();
    await select(id);
    expect(host.querySelector('.block-graph-location')).toBeNull();
    expect(host.querySelector('.dependency-graph-selection')).toBeNull();
  }
  const text = host.querySelector<HTMLTextAreaElement>('[aria-label="Mermaid変更比較図"]')!.value;
  expect(text).toContain(`${mermaidBlockId('a')} -.->`); expect(text).toContain(mermaidBlockId('b'));
  expect(host.querySelector('.dependency-comparison-summary')?.textContent).toContain('−削除 1件');
  await click('現在の依存関係'); expect(host.querySelector('[data-comparison-block-id]')).toBeNull();
  await click('変更前後・試算'); expect(row('a').textContent).toContain('削除済み（変更前）');
  expect(host.querySelectorAll('.block-editor-card.calculation')).toHaveLength(0);
  expect(save).not.toHaveBeenCalled(); expect(writes).not.toHaveBeenCalled(); expect(JSON.stringify(initial)).toBe(original);
});
it('B: keeps both historical edges and only navigates to still-present IDs after partial deletion', async () => {
  const initial = [...chain(), calc('c', '@{1}+1', 151, 'b')];
  await act(async () => root.render(createElement(Editor, { initial })));
  await remove('b'); changed.mockClear(); await openComparison();
  expect(row('b').textContent).toContain('削除済み（変更前）'); expect(row('b').querySelector('button')).toBeNull();
  const text = host.querySelector<HTMLTextAreaElement>('[aria-label="Mermaid変更比較図"]')!.value;
  expect(text).toContain(`${mermaidBlockId('a')} -.->`); expect(text).toContain(`${mermaidBlockId('b')} -.->`);
  for (const id of ['a', 'c']) {
    await select(id); expect(host.querySelector('.block-graph-selected')?.getAttribute('data-block-id')).toBe(id);
    await click('選択ブロックの計算式を編集'); expect(document.activeElement).toBe(host.querySelector(`.block-editor-card[data-block-id="${id}"] input.code-input`));
  }
  expect(changed).not.toHaveBeenCalled();
});
it('C: omits the graph when neither baseline nor current state has calculations', async () => {
  await act(async () => root.render(createElement(Editor, { initial: [{ id: 'text', type: 'text', content: '説明のみ' }] })));
  expect(host.querySelector('.dependency-graph-panel')).toBeNull();
  await click('＋ 文章'); expect(host.querySelector('.dependency-graph-panel')).toBeNull();
});
it('D: distinguishes new stable IDs from deleted historical nodes after adding again', async () => {
  await act(async () => root.render(createElement(Editor, { initial: chain() })));
  await remove('a'); await remove('b'); await click('＋ 計算');
  const id = host.querySelector('.block-editor-card.calculation')!.getAttribute('data-block-id')!;
  expect(['a', 'b']).not.toContain(id); changed.mockClear(); await openComparison();
  expect(host.querySelectorAll('[data-comparison-block-id]')).toHaveLength(3);
  for (const old of ['a', 'b']) expect(row(old).textContent).toContain('削除済み（変更前）');
  expect(row(id).textContent).not.toContain('削除済み'); await select(id);
  expect(host.querySelector('.block-graph-selected')?.getAttribute('data-block-id')).toBe(id);
  expect(changed).not.toHaveBeenCalled();
});
it('E: never revives an unapplied trial through all-delete graph toggling or selection', async () => {
  const initial = chain(); initial[0] = { ...calc('a', '200', 100) };
  await act(async () => root.render(createElement(Editor, { initial })));
  await click('試算する'); expect(button('結果を反映').disabled).toBe(false);
  await remove('a'); await remove('b'); changed.mockClear(); await openComparison();
  expect(button('結果を反映').disabled).toBe(true);
  expect(host.querySelector('[data-comparison-trial]')?.getAttribute('data-comparison-trial')).toBe('none');
  await select('a'); await click('現在の依存関係'); await click('変更前後・試算');
  expect(button('結果を反映').disabled).toBe(true);
  expect(row('a').textContent).not.toContain('→ 試算:');
  expect(host.querySelector('[data-comparison-trial]')?.getAttribute('data-comparison-trial')).toBe('none');
  expect(changed).not.toHaveBeenCalled();
});
