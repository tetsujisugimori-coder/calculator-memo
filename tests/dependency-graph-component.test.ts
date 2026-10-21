// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DependencyGraph } from '../components/DependencyGraph';
import { buildCalculationStatus } from '../lib/calculation-status';
import { mermaidBlockId } from '../lib/dependency-mermaid';
import type { MemoBlock } from '../lib/types';
const mocks = vi.hoisted(() => ({ render: vi.fn(), initialize: vi.fn() }));
vi.mock('mermaid', () => ({ default: mocks }));
let root: Root, host: HTMLDivElement;
const blocks: MemoBlock[] = [{ id: 'a', type: 'calculation', evaluationMode: 'block-references', references: { version: 1, entries: [] }, expression: '3', displayExpression: '3', result: 3, resultText: '3', error: null }];
const source = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 100"><g class="node" id="flowchart-${mermaidBlockId('a')}-0"><rect width="200" height="60"/><g class="label"/></g></svg>`;
async function mount(current = blocks, locate = vi.fn()) {
  await act(async () => { root.render(createElement(DependencyGraph, { blocks: current, report: buildCalculationStatus(current), onLocate: locate })); });
}
async function open() {
  await act(async () => { const details = host.querySelector('details')!; details.open = true; details.dispatchEvent(new Event('toggle')); });
}
beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  mocks.render.mockReset(); mocks.initialize.mockReset();
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); });
describe('diagram failure and asynchronous selection boundary', () => {
  it('keeps data untouched and exposes fallback on rendering failure', async () => {
    mocks.render.mockRejectedValue(new Error('renderer failed'));
    const before = JSON.stringify(blocks); await mount(); await open();
    expect(host.textContent).toContain('図を表示できません');
    expect(host.querySelectorAll('.dependency-graph-list button')).toHaveLength(1);
    expect(JSON.stringify(blocks)).toBe(before); expect(document.querySelector('[aria-hidden="true"]')).toBeNull();
  });
  it('does not insert a stale async render after closing', async () => {
    let resolve!: (value: { svg: string }) => void;
    mocks.render.mockImplementation(() => new Promise(value => { resolve = value; }));
    await mount(); await open();
    await act(async () => { const details = host.querySelector('details')!; details.open = false; details.dispatchEvent(new Event('toggle')); });
    await act(async () => resolve({ svg: source }));
    expect(host.querySelector('svg')).toBeNull();
    expect(document.querySelector('[aria-hidden="true"]')).toBeNull();
  });
  it('navigation returns the exact ID without changing the block snapshot', async () => {
    mocks.render.mockResolvedValue({ svg: source });
    const locate = vi.fn(); const before = JSON.stringify(blocks);
    await mount(blocks, locate); await open();
    await act(async () => host.querySelector('[data-block-id]')!.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(locate).toHaveBeenCalledWith('a'); expect(JSON.stringify(blocks)).toBe(before);
    expect(host.textContent).toContain('選択中: ブロック 1');
  });
});

describe('comparison and trial are presentation only', () => {
  async function compare() {
    await act(async () => [...host.querySelectorAll('button')].find(button => button.textContent === '変更前後・試算')!.click());
  }
  it('keeps removed nodes as historical records without navigating', async () => {
    mocks.render.mockResolvedValue({ svg: source });
    const locate = vi.fn();
    const current: MemoBlock[] = [];
    await act(async () => root.render(createElement(DependencyGraph, { blocks: current, report: buildCalculationStatus(current, { baseline: blocks }), onLocate: locate })));
    await open(); await compare();
    expect(host.querySelector('[data-comparison-block-id="a"]')?.textContent).toContain('削除済み');
    expect(host.querySelector('[data-comparison-block-id="a"] button')).toBeNull();
    await act(async () => host.querySelector('[data-block-id]')!.dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(locate).not.toHaveBeenCalled();
    expect(host.textContent).toContain('対象ブロックは削除されています');
  });
  it('removes numeric evidence when a trial is no longer supplied, preserving normal export', async () => {
    const { createCalculationTrial, trialSnapshot } = await import('../lib/calculation-trial');
    mocks.render.mockResolvedValue({ svg: source });
    const current = blocks.map(block => ({ ...block, expression: '4' })) as MemoBlock[];
    const report = buildCalculationStatus(current, { baseline: blocks });
    const trial = createCalculationTrial(current, { memoKey: 'm', revision: 1, snapshot: trialSnapshot(current) }, { baseline: blocks });
    const locate = vi.fn();
    const before = JSON.stringify(current);
    await act(async () => root.render(createElement(DependencyGraph, { blocks: current, report, trial, onLocate: locate })));
    await open(); await compare();
    expect(host.querySelector('[data-comparison-trial]')?.getAttribute('data-comparison-trial')).toBe('valid');
    expect(host.querySelector('[data-comparison-block-id="a"]')?.textContent).toContain('数値変化あり');
    await act(async () => root.render(createElement(DependencyGraph, { blocks: current, report, onLocate: locate })));
    expect(host.querySelector('[data-comparison-trial]')?.getAttribute('data-comparison-trial')).toBe('none');
    expect(host.querySelector('[data-comparison-block-id="a"]')?.textContent).not.toContain('数値変化あり');
    expect(JSON.stringify(current)).toBe(before); expect(locate).not.toHaveBeenCalled();
    await act(async () => [...host.querySelectorAll('button')].find(button => button.textContent === '現在の依存関係')!.click());
    expect(host.querySelector('[data-comparison-block-id]')).toBeNull();
    expect(host.querySelector('[aria-label="Mermaid変更比較図"]')).toBeNull();
  });
});
