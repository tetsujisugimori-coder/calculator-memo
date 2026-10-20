import { describe, expect, it, vi } from 'vitest';
import { createMemoExecutionPlan } from '../lib/execution-plan';
import { analyzeMemoDependencies } from '../lib/dependency-analysis';
import { recalculateReferenceMemo, staleBlockIds } from '../lib/block-references';
import { calculateMemoBlock } from '../lib/memo-blocks';
import * as calculator from '../lib/calculator';
import type { CalculationMemoBlock, MemoBlock } from '../lib/types';

const ref = (id: string, expression: string, sources: string[] = []): CalculationMemoBlock => ({
  id, type: 'calculation', expression, displayExpression: expression, evaluationMode: 'block-references',
  references: { version: 1, entries: sources.map((blockId, i) => ({ slot: i + 1, blockId })) }, result: null, resultText: '', error: null,
});
const variable = (id: string, expression: string) => calculateMemoBlock(id, expression, 'note-variables');
const value = (blocks: MemoBlock[], id: string) => (blocks.find(b => b.id === id) as CalculationMemoBlock).result;
const permutations = <T,>(items: T[]): T[][] => items.length ? items.flatMap((item, i) => permutations(items.filter((_, j) => i !== j)).map(tail => [item, ...tail])) : [[]];

describe('shared ID execution plan', () => {
  const diamond = [ref('d', '@{1}+@{2}', ['b', 'c']), ref('b', '@{1}*2', ['a']), ref('c', '@{1}*3', ['a']), ref('a', '4')];
  it.each(permutations(diamond).map((blocks, i) => [i, blocks] as const))('canonical ID order for permutation %i', (_, blocks) => {
    const plan = createMemoExecutionPlan(blocks);
    expect(plan.order).toEqual(['a', 'b', 'c', 'd']);
    const result = recalculateReferenceMemo(blocks);
    expect(result.success).toBe(true); expect(result.evaluated).toEqual(plan.order);
    expect(value(result.blocks, 'd')).toBe(20);
    expect(result.blocks.map(b => b.id)).toEqual(blocks.map(b => b.id));
  });
  it('re-sorts newly ready nodes rather than freezing the initial queue', () => {
    const blocks = [ref('z', '7'), ref('b', '@{1}+1', ['a']), ref('a', '1')];
    expect(recalculateReferenceMemo(blocks).evaluated).toEqual(['a', 'b', 'z']);
  });
  it('uses canonical ID priority for independent reference failures, not display order', () => {
    const blocks = [ref('z', 'sqrt(-1)'), ref('a', '1/0')];
    for (const order of [blocks, [...blocks].reverse()]) {
      const result = recalculateReferenceMemo(order);
      expect(result.evaluated).toEqual(['a']);
      expect(result.diagnostics[0]).toMatchObject({ blockId: 'a', code: 'reference-evaluation', message: '0では割れません' });
    }
  });
  it('documents legacy sequence and phase separately from data edges', () => {
    const blocks = [ref('0', '@{1}+1', ['use']), variable('z', 'x=2'), variable('a', 'x=3'), variable('use', 'x*2'), ref('independent', '9')];
    const plan = createMemoExecutionPlan(blocks);
    expect(plan.legacyOrder).toEqual(['z', 'a', 'use']);
    expect(plan.order).toEqual(['z', 'a', 'use', '0', 'independent']);
    expect(plan.constraints).toContainEqual({ source: 'z', target: 'a', kind: 'legacy-sequence' });
    expect(plan.constraints).toContainEqual({ source: 'use', target: 'independent', kind: 'legacy-phase' });
    expect(plan.dependencies.get('use')).toEqual([]);
    expect(plan.graph.edges.filter(e => e.kind === 'variable').every(e => e.certainty === 'uncertain')).toBe(true);
    expect(value(recalculateReferenceMemo(blocks).blocks, '0')).toBe(7);
  });
  it('shares every definite ID edge with Mermaid analysis, without using saved errors', () => {
    const blocks = diamond.map(b => ({ ...b, error: 'old failed attempt' }));
    const diagram = analyzeMemoDependencies(blocks), plan = createMemoExecutionPlan(blocks);
    expect(plan.errors.size).toBe(0);
    expect(plan.graph.edges).toEqual(diagram.edges);
    for (const e of diagram.edges) expect(plan.order.indexOf(e.source)).toBeLessThan(plan.order.indexOf(e.target));
    expect(recalculateReferenceMemo(blocks).success).toBe(true);
  });
  it('distinguishes self, cycle members, downstream and unrelated blocks', () => {
    const blocks = [ref('self', '@{1}', ['self']), ref('a', '@{1}', ['b']), ref('b', '@{1}', ['a']), ref('down', '@{1}', ['a']), ref('ok', '5')];
    const result = recalculateReferenceMemo(blocks);
    expect(result.evaluated).toEqual([]);
    const codes = (id: string) => result.diagnostics.filter(d => d.blockId === id).map(d => d.code);
    expect(codes('self')).toContain('self-reference'); expect(codes('a')).toContain('cycle');
    expect(codes('b')).toContain('cycle'); expect(codes('down')).toContain('cycle-dependent');
    expect(codes('ok')).toEqual([]);
    // Transaction rollback notice is not a per-node numerical error.
    expect((result.blocks.at(-1) as CalculationMemoBlock).error).toBeNull();
  });
  it('distinguishes missing, malformed expression, malformed mappings and source analysis failure', () => {
    const blocks = [ref('missing', '@{1}', ['gone']), ref('syntax', '@{oops}'), ref('dependent', '@{1}', ['syntax']), { ...ref('format', '1'), references: { version: 2, entries: [] } }, ref('ok', '4')] as unknown as MemoBlock[];
    const result = recalculateReferenceMemo(blocks);
    expect(result.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ blockId: 'missing', code: 'missing-reference' }),
      expect.objectContaining({ blockId: 'syntax', code: 'invalid-expression' }),
      expect.objectContaining({ blockId: 'format', code: 'invalid-reference' }),
      expect.objectContaining({ blockId: 'dependent', code: 'blocked-reference' }),
    ]));
    expect(result.diagnostics.some(d => d.blockId === 'ok')).toBe(false);
  });
  it('does not interpret invalid cross-mode syntax as an invented scheduling conflict', () => {
    const wrongReference = recalculateReferenceMemo([variable('source', 'x=2'), ref('wrong', 'x+@{1}', ['source'])]);
    expect(wrongReference.evaluated).toEqual([]); expect(wrongReference.diagnostics[0].code).toBe('invalid-expression');
    const wrongLegacy = recalculateReferenceMemo([variable('wrong', 'x=@{1}'), ref('r', '2')]);
    expect(wrongLegacy.evaluated).toEqual(['wrong']); expect(wrongLegacy.diagnostics[0].code).toBe('legacy-evaluation');
  });
  it('retains legacy failure priority and scope, without propagating to uncertain fallback users', () => {
    const blocks = [variable('first', 'x=2'), variable('bad', 'x=1/0'), variable('use', 'x+1'), ref('down', '@{1}', ['bad']), ref('unrelated', '8')];
    const spy = vi.spyOn(calculator, 'calculateVariableExpression');
    try {
      const result = recalculateReferenceMemo(blocks);
      expect(result.evaluated).toEqual(['first', 'bad', 'use']);
      expect(spy.mock.results[2].value.value).toBe(3);
      expect(result.diagnostics.map(d => [d.blockId, d.code])).toEqual([['bad', 'legacy-evaluation'], ['down', 'blocked-reference']]);
    } finally { spy.mockRestore(); }
  });
  it('rejects old successful values as a substitute for a failing ID source and recovers', () => {
    const original = recalculateReferenceMemo([ref('a', 'sqrt(2)'), ref('b', '@{1}*2', ['a']), ref('z', '99')]).blocks;
    const edited = original.map(b => b.id === 'a' ? { ...b, expression: '1/0' } : b);
    const failed = recalculateReferenceMemo(edited);
    expect(failed.evaluated).toEqual(['a']); expect(failed.success).toBe(false);
    expect(failed.diagnostics.map(d => d.blockId)).toEqual(['a', 'b']);
    expect(value(failed.blocks, 'b')).toBe(Math.sqrt(2)*2);
    expect(staleBlockIds(failed.blocks).size).toBe(3);
    const restored = recalculateReferenceMemo(failed.blocks.map(b => b.id === 'a' ? { ...b, expression: 'sqrt(3)' } : b));
    expect(restored.success).toBe(true); expect(value(restored.blocks, 'b')).toBe(Math.sqrt(3)*2);
    expect(restored.diagnostics).toEqual([]);
  });
  it('preserves preflight-before-legacy error priority and existing frozen input', () => {
    const blocks = [variable('old', 'x=1/0'), ref('bad', '@{1}', ['deleted'])];
    blocks.forEach(Object.freeze); Object.freeze(blocks);
    const result = recalculateReferenceMemo(blocks);
    expect(result.evaluated).toEqual([]); expect(result.diagnostics[0].code).toBe('missing-reference');
    expect(blocks[0].error).toBe('0では割れません');
  });
});
