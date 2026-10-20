import { describe, expect, it } from 'vitest';
import { buildDependencyComparison } from '../lib/dependency-comparison';
import { buildCalculationStatus } from '../lib/calculation-status';
import { createCalculationTrial, trialSnapshot } from '../lib/calculation-trial';
import { markCalculationsStale, recalculateReferenceMemo } from '../lib/block-references';
import type { CalculationMemoBlock, MemoBlock } from '../lib/types';
const ref = (id: string, expression: string, targets: string[] = []): CalculationMemoBlock => ({ id, type: 'calculation', expression, displayExpression: expression, result: null, resultText: '', error: null, evaluationMode: 'block-references', references: { version: 1, entries: targets.map((blockId, i) => ({ slot: i + 1, blockId })) } });
const legacy = (id: string, expression: string): CalculationMemoBlock => ({ ...ref(id, expression), evaluationMode: 'note-variables', references: undefined });
const model = (before: MemoBlock[], after: MemoBlock[], preview = false, known = true) => {
  const report = buildCalculationStatus(after, { baseline: before, baselineKnown: known });
  const trial = preview ? createCalculationTrial(after, { memoKey: 'memo', revision: 1, snapshot: trialSnapshot(after) }, { baseline: before, baselineKnown: known }) : undefined;
  return buildDependencyComparison(report, known, trial);
};
const encoded = (value: string) => Array.from(value, char => `#${char.codePointAt(0)};`).join('');

describe('dependency comparison presentation', () => {
  it('separates direct, indirect, unchanged numerical impact and unrelated nodes without mutating data', () => {
    const before = recalculateReferenceMemo([ref('a', '100'), ref('b', '@{1}+50', ['a']), ref('c', '@{1}*2', ['b']), ref('z', '@{1}*0', ['a']), ref('u', '80')]).blocks;
    const after = markCalculationsStale(before.map(block => block.id === 'a' ? { ...block, expression: '200', future: { note: '保護' } } : block));
    const snapshot = trialSnapshot(after);
    const result = model(before, after, true);
    expect(result.nodes.get('a')?.labels).toEqual(['変更元', '数値変化あり']);
    expect(result.nodes.get('c')?.labels).toEqual(['変更の影響対象', '数値変化あり']);
    expect(result.nodes.get('z')?.labels).toEqual(['変更の影響対象', '数値変化なし']);
    expect(result.nodes.get('u')?.labels).toEqual(['依存関係上の影響なし', '数値変化なし']);
    expect(result.nodes.get('c')?.trialRow?.result).toBe(500);
    expect(trialSnapshot(after)).toBe(snapshot);
    expect(result.addedCount + result.removedCount).toBe(0);
  });
  it('shows reference replacement as removed and added edges and propagates old as well as new paths', () => {
    const before = [ref('a', '1'), ref('b', '2'), ref('c', '@{1}', ['a']), ref('d', '@{1}', ['c'])];
    const after = before.map(block => block.id === 'c' ? ref('c', '@{1}', ['b']) : block);
    const result = model(before, after);
    expect(result.addedCount).toBe(1); expect(result.removedCount).toBe(1);
    expect(result.graph.edges).toHaveLength(3);
    expect(result.mermaid).toContain(encoded('＋追加 ID参照'));
    expect(result.mermaid).toContain(encoded('−削除 ID参照'));
    expect(result.nodes.get('d')?.labels).toContain('変更の影響対象');
  });
  it('retains deleted historical nodes but never attaches current trial rows', () => {
    const before = [ref('a', '1'), ref('b', '@{1}', ['a'])];
    const result = model(before, before.slice(1), true);
    expect(result.nodes.get('a')).toEqual({ labels: ['削除済み（変更前）'], deleted: true });
    expect(result.nodes.get('b')?.labels).toContain('数値比較不可');
    expect(result.nodes.get('b')?.labels).toContain('式・参照の問題（未実行）');
  });
  it('does not turn ID-only reordering or metadata changes into new dependencies', () => {
    const before = [ref('a', '1'), ref('b', '@{1}', ['a'])];
    const result = model(before, [...before].reverse().map(block => ({ ...block, unknown: '保護' })));
    expect(result.addedCount + result.removedCount).toBe(0);
    expect([...result.nodes.values()].every(node => node.labels.includes('依存関係上の影響なし'))).toBe(true);
    expect(result.mermaid).toBe(model(before, before).mermaid);
  });
  it('keeps legacy candidate changes and uncertainty separate from definite ID paths', () => {
    const before = [legacy('a', 'x=1'), legacy('b', 'x=2'), legacy('c', 'x+1'), ref('d', '@{1}', ['c'])];
    const after = [before[1], before[2], before[0], before[3]];
    const result = model(before, after);
    expect(result.removedCount).toBeGreaterThan(0);
    expect(result.nodes.get('c')?.labels).toContain('影響は候補');
    expect(result.nodes.get('d')?.labels).toContain('変更の影響対象');
    expect(result.mermaid).toContain(encoded('不確定'));
  });
  it('does not claim historical unknown baseline or uninspectable expressions are unaffected', () => {
    const before = [ref('a', '1'), ref('b', '@{1}', ['a']), ref('u', '2')];
    const unknown = model(before, before, false, false);
    expect(unknown.nodes.get('u')?.labels).toContain('影響範囲不明');
    const broken = model(before, [before[0], ref('b', '@{1}+*', ['a']), before[2]]);
    expect(broken.removedCount).toBe(0);
    expect(broken.mermaid).toContain(encoded('変更不明 ID参照'));
    expect(broken.nodes.get('u')?.labels).toContain('影響範囲不明');
  });
  it('uses only trial evidence for numerical labels and preserves raw precision', () => {
    const before = [{ ...ref('a', '2/10000000000000'), result: 2e-13, resultText: '0' }];
    const after = [{ ...before[0], expression: '1/10000000000000' }];
    expect(model(before, after).nodes.get('a')?.labels).not.toContain('数値変化あり');
    const result = model(before, after, true);
    expect(result.nodes.get('a')?.trialRow?.difference).toBe(-1e-13);
    expect(result.nodes.get('a')?.labels).toContain('数値変化あり');
  });
  it.each([
    [ref('a', '@{1}', ['a']), ref('d', '@{1}', ['a'])],
    [ref('a', '@{1}', ['b']), ref('b', '@{1}', ['a']), ref('d', '@{1}', ['a'])],
    [legacy('a', 'x=10'), legacy('b', 'x=1/0'), legacy('c', 'x+1'), ref('d', '@{1}', ['c'])],
    [ref('a', '1/0'), ref('d', '@{1}', ['a'])],
  ])('does not claim failed or unattempted values are numerical equality (%#)', (...blocks) => {
    const input = blocks as MemoBlock[];
    const result = model(input, input, true);
    expect(result.nodes.get('d')?.labels).toContain('数値比較不可');
    expect(result.nodes.get('d')?.labels).not.toContain('数値変化なし');
  });
  it('does not label retained blocks deleted when a global graph limit suppresses nodes', () => {
    const before = [ref('a', '1')];
    const after = [...before, ...Array.from({ length: 128 }, (_, i) => ref(`extra-${i}`, '2'))];
    const result = model(before, after);
    expect(result.nodes.get('a')?.deleted).toBe(false);
    expect(result.nodes.get('a')?.labels).toContain('変更前の式・現在は解析不能');
    expect(result.nodes.get('a')?.labels).not.toContain('削除済み（変更前）');
  });
  it('does not invent baseline additions when no baseline was supplied', () => {
    const report = buildCalculationStatus([ref('a', '1'), ref('b', '@{1}', ['a'])]);
    const result = buildDependencyComparison(report, false);
    expect(result.addedCount + result.removedCount).toBe(0);
    expect(result.nodes.get('b')?.labels).toContain('影響範囲不明');
  });
});
