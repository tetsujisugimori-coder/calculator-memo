import { afterEach, describe, expect, it, vi } from 'vitest';
import * as calculator from '../lib/calculator';
import { recalculateReferenceMemo, staleBlockIds } from '../lib/block-references';
import { calculateMemoBlock } from '../lib/memo-blocks';
import { defaultData, loadData, saveData } from '../lib/storage';
import type { CalculationMemoBlock, MemoBlock, PlainCalculationNote } from '../lib/types';

const variable = (id: string, expression: string) => calculateMemoBlock(id, expression, 'note-variables');
const reference = (id: string, expression: string, source: string): CalculationMemoBlock => ({
  id, type: 'calculation', expression, displayExpression: expression, evaluationMode: 'block-references',
  references: { version: 1, entries: [{ slot: 1, blockId: source }] }, result: null, resultText: '', error: null,
});
const block = (blocks: MemoBlock[], id: string) => blocks.find(b => b.id === id) as CalculationMemoBlock;
afterEach(() => vi.restoreAllMocks());

describe('manual transaction legacy/reference phase boundary', () => {
  it('keeps normal assignment order and evaluates each mixed block exactly once', () => {
    const input = [reference('r', '@{1}*2', 'use'), variable('first', 'x=2'), variable('second', 'x=3'), variable('use', 'x+1')];
    const evaluate = vi.spyOn(calculator, 'calculateVariableExpression');
    const result = recalculateReferenceMemo(input);
    expect(result.success).toBe(true);
    expect(evaluate.mock.calls.map(([expression]) => expression)).toEqual(['2', '3', 'x+1', 'ReferenceValue1*2']);
    expect(result.evaluated).toEqual(['first', 'second', 'use', 'r']);
    expect(block(result.blocks, 'r').result).toBe(8);
  });

  it.each(['x=1/0', 'x=sqrt(-1)', 'x=2^10001'])('finishes legacy scope after %s but never starts references', failedExpression => {
    const original = recalculateReferenceMemo([
      variable('first', 'x=2'), variable('second', 'x=3'), variable('use', 'x+1'),
      reference('independent', '4+5', 'first'), reference('dependent', '@{1}*2', 'use'),
    ]).blocks;
    const input = original.map(b => b.id === 'second' ? { ...b, expression: failedExpression } : b);
    const before = structuredClone(input);
    const evaluate = vi.spyOn(calculator, 'calculateVariableExpression');
    const result = recalculateReferenceMemo(input);
    expect(result.success).toBe(false);
    expect(result.evaluated).toEqual(['first', 'second', 'use']);
    expect(evaluate).toHaveBeenCalledTimes(3);
    expect(evaluate.mock.calls.map(([expression]) => expression)).toEqual(['2', failedExpression.slice(2), 'x+1']);
    // A failed reassignment must leave x=2 for the later legacy candidate.
    expect(evaluate.mock.results[2].value.value).toBe(3);
    expect(input).toEqual(before);
    for (const previous of original) {
      expect(block(result.blocks, previous.id)).toMatchObject({
        result: block(original, previous.id).result,
        resultText: block(original, previous.id).resultText,
        error: block(original, previous.id).error,
      });
      expect(block(result.blocks, previous.id).evaluationState?.status).toBe('stale');
    }
    expect(block(result.blocks, 'first').evaluationState?.attemptError).toContain(`ブロック 2 (${failedExpression})`);
  });

  it('records legacy helper attempts even when assignment validation prevents a numeric call', () => {
    const input = [variable('first', 'x=2'), variable('invalid', 'pi=2'), variable('use', 'x+1'), reference('r', '@{1}', 'use')];
    const evaluate = vi.spyOn(calculator, 'calculateVariableExpression');
    const result = recalculateReferenceMemo(input);
    expect(result.success).toBe(false);
    expect(result.evaluated).toEqual(['first', 'invalid', 'use']);
    expect(evaluate.mock.calls.map(([expression]) => expression)).toEqual(['2', 'x+1']);
    expect(evaluate.mock.results[1].value.value).toBe(3);
    expect(block(result.blocks, 'invalid').evaluationState?.attemptError).toContain('ブロック 2 (pi=2)');
  });

  it('reports the original legacy error instead of its indirect reference failure', () => {
    const input = [variable('bad', 'x=1/0'), reference('dependent', '@{1}+1', 'bad')];
    const evaluate = vi.spyOn(calculator, 'calculateVariableExpression');
    const result = recalculateReferenceMemo(input);
    expect(result.success).toBe(false);
    expect(result.evaluated).toEqual(['bad']);
    expect(evaluate).toHaveBeenCalledTimes(1);
    expect(block(result.blocks, 'dependent').evaluationState?.attemptError).toContain('ブロック 1 (x=1/0)');
    expect(block(result.blocks, 'dependent').evaluationState?.attemptError).not.toContain('参照元');
  });

  it('does not count graph preflight failures as numeric evaluation attempts', () => {
    const input = [variable('a', 'x=2'), reference('broken', '@{1}', 'missing')];
    const evaluate = vi.spyOn(calculator, 'calculateVariableExpression');
    const result = recalculateReferenceMemo(input);
    expect(result.success).toBe(false);
    expect(result.evaluated).toEqual([]);
    expect(evaluate).not.toHaveBeenCalled();
  });

  it('counts a throwing reference evaluator, but not a later unattempted reference', () => {
    const input = [variable('first', 'x=2'), reference('bad', '@{1}/0', 'first'), reference('later', '@{1}+1', 'bad')];
    const evaluate = vi.spyOn(calculator, 'calculateVariableExpression');
    const result = recalculateReferenceMemo(input);
    expect(result.success).toBe(false);
    expect(evaluate.mock.calls.map(([expression]) => expression)).toEqual(['2', 'ReferenceValue1/0']);
    expect(result.evaluated).toEqual(['first', 'bad']);
    expect(evaluate.mock.results[1].type).toBe('throw');
  });

  it('rolls back, saves stale metadata losslessly, then recovers raw precision after reload', () => {
    const source = { ...variable('a', 'x=sqrt(2)'), proof: { source: 'synthetic' } };
    const target = { ...reference('b', '@{1}*2', 'a'), metadata: { proofRef: ['p'] },
      references: { version: 1 as const, extra: 'reference metadata', entries: [{ slot: 1, blockId: 'a', extra: 'entry metadata' }] },
      evaluationState: { version: 1 as const, status: 'stale' as const, extra: 'state metadata' } };
    const initial = recalculateReferenceMemo([source, target]).blocks;
    const failed = recalculateReferenceMemo(initial.map(b => b.id === 'a' ? { ...b, expression: 'x=1/0' } : b));
    expect(failed.success).toBe(false);
    expect(block(failed.blocks, 'b').result).toBe(Math.sqrt(2) * 2);
    let raw = '';
    const memory = { getItem: () => raw || null, setItem: (_key: string, value: string) => { raw = value; } };
    const note: PlainCalculationNote = { id: 'memo', type: 'plain-calculation', title: '', content: '', createdAt: '', updatedAt: '',
      blocks: failed.blocks, calculationPolicy: { version: 1, mode: 'manual' } };
    const stored = { ...structuredClone(defaultData), notes: [note] };
    expect(saveData(stored, memory)).toBe(true);
    const loaded = loadData(memory);
    expect(loaded.status).toBe('ok');
    if (loaded.status !== 'ok') throw new Error('load failed');
    const restored = loaded.data.notes[0] as PlainCalculationNote;
    expect(staleBlockIds(restored.blocks!).size).toBe(2);
    const corrected = recalculateReferenceMemo(restored.blocks!.map(b => b.id === 'a' ? { ...b, expression: 'x=sqrt(3)' } : b));
    expect(corrected.success).toBe(true);
    expect(block(corrected.blocks, 'b').result).toBe(Math.sqrt(3) * 2);
    expect(block(corrected.blocks, 'b')).toMatchObject({ metadata: { proofRef: ['p'] }, references: { extra: 'reference metadata', entries: [{ extra: 'entry metadata' }] }, evaluationState: { extra: 'state metadata' } });
    expect(block(corrected.blocks, 'a')).toMatchObject({ proof: { source: 'synthetic' } });
    expect(staleBlockIds(corrected.blocks).size).toBe(0);
    const malformed = { ...restored, blocks: corrected.blocks.map(b => b.id === 'b' ? { ...b, references: { version: 2, entries: [] } } : b) };
    raw = JSON.stringify({ ...stored, notes: [malformed] });
    const protectedRaw = raw;
    expect(loadData(memory).status).toBe('error');
    expect(saveData({ ...stored, notes: [malformed as unknown as PlainCalculationNote] }, memory)).toBe(false);
    expect(raw).toBe(protectedRaw);
  });
});
