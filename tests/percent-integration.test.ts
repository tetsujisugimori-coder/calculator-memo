import { describe, expect, it } from 'vitest';
import { markCalculationsStale, recalculateReferenceMemo, staleBlockIds } from '../lib/block-references';
import { applyCalculationTrial, createCalculationTrial, trialSnapshot } from '../lib/calculation-trial';
import { calculateMemoBlock, recalculateMemoBlocks } from '../lib/memo-blocks';
import { defaultData, loadData, saveData, STORAGE_KEY } from '../lib/storage';
import type { CalculationMemoBlock, MemoBlock, PlainCalculationNote } from '../lib/types';

const reference = (id: string, expression: string, targets: string[] = []): CalculationMemoBlock => ({
  id, type: 'calculation', expression, displayExpression: expression,
  result: null, resultText: '', error: null, evaluationMode: 'block-references',
  references: { version: 1, entries: targets.map((blockId, index) => ({ slot: index + 1, blockId })) },
});
const block = (blocks: MemoBlock[], id: string) => blocks.find(value => value.id === id) as CalculationMemoBlock;
const values = (blocks: MemoBlock[]) => blocks.filter(value => value.type === 'calculation').map(value => value.result);
const preview = (blocks: MemoBlock[], baseline?: MemoBlock[]) => createCalculationTrial(blocks,
  { memoKey: 'percent-memo', revision: 1, snapshot: trialSnapshot(blocks) }, { baseline, baselineKnown: true });
const freezeDeep = <T>(value: T): T => {
  if (value !== null && typeof value === 'object') {
    Object.values(value).forEach(freezeDeep);
    Object.freeze(value);
  }
  return value;
};

describe('postfix percent across protected memo boundaries', () => {
  it('evaluates a numeric percent ID source and ordinary downstream ID expressions', () => {
    const result = recalculateReferenceMemo([
      reference('source', '((50+50))%'),
      reference('double', '@{1}*2', ['source']),
      reference('sum', '@{1}+@{2}', ['source', 'double']),
    ]);
    expect(result.success).toBe(true);
    expect(result.evaluated).toEqual(['source', 'double', 'sum']);
    expect(values(result.blocks)).toEqual([1, 2, 3]);
    expect(staleBlockIds(result.blocks).size).toBe(0);
    expect(block(result.blocks, 'source').expression).toBe('((50+50))%');
    expect(block(result.blocks, 'sum').references?.entries).toEqual([
      { slot: 1, blockId: 'source' }, { slot: 2, blockId: 'double' },
    ]);
  });

  it('keeps old results during a percent trial and commits all new results atomically', () => {
    const baseline = recalculateReferenceMemo([
      reference('source', '100'), reference('double', '@{1}*2', ['source']),
      reference('tail', '@{1}+3', ['double']), reference('unrelated', '7'),
    ]).blocks;
    const edited = freezeDeep(markCalculationsStale(baseline.map(value => value.id === 'source'
      ? { ...value, expression: '((50+50))%' } : value)));
    const snapshot = trialSnapshot(edited);
    const trial = preview(edited, baseline);

    expect(trial.evaluation.success).toBe(true);
    expect(trial.rows.map(row => [row.previous, row.result, row.difference])).toEqual([
      [100, 1, -99], [200, 2, -198], [203, 5, -198], [7, 7, 0],
    ]);
    expect(values(edited)).toEqual([100, 200, 203, 7]);
    expect(trialSnapshot(edited)).toBe(snapshot);
    expect(trial.evaluation.blocks).toEqual(recalculateReferenceMemo(edited).blocks);

    const applied = applyCalculationTrial(trial, edited, 'percent-memo', 1);
    expect(applied.success).toBe(true);
    if (!applied.success) throw new Error(applied.message);
    expect(values(applied.evaluation.blocks)).toEqual([1, 2, 5, 7]);
    expect(staleBlockIds(applied.evaluation.blocks).size).toBe(0);
    expect(applied.evaluation.blocks).toEqual(trial.evaluation.blocks);
    expect(trialSnapshot(edited)).toBe(snapshot);
  });

  it.each(['expression', 'reference', 'metadata', 'revision'])('rejects a percent trial after a %s change', kind => {
    const input = [reference('source', '((50+50))%'), reference('target', '@{1}+1', ['source']), reference('other', '7')];
    const trial = preview(input);
    expect(trial.evaluation.success).toBe(true);
    const current = structuredClone(input);
    if (kind === 'expression') current[0].expression = '((50+150))%';
    if (kind === 'reference') current[1].references!.entries[0].blockId = 'other';
    if (kind === 'metadata') Object.assign(current[0], { future: { proofRef: 'changed' } });
    const snapshot = trialSnapshot(current);
    expect(applyCalculationTrial(trial, current, 'percent-memo', kind === 'revision' ? 2 : 1).success).toBe(false);
    expect(trialSnapshot(current)).toBe(snapshot);
    expect(values(current)).toEqual([null, null, null]);
    if (kind !== 'revision') expect(() => createCalculationTrial(current, trial.context)).toThrow('入力が変わりました');
  });

  it('rolls back every result when a percent operand fails after an earlier successful evaluation', () => {
    const baseline = recalculateReferenceMemo([
      reference('a-first', '10'), reference('b-bad', '100'),
      reference('c-dependent', '@{1}+1', ['b-bad']), reference('z-unrelated', '7'),
    ]).blocks;
    const input = freezeDeep(baseline.map(value => value.id === 'a-first' ? { ...value, expression: '((50+50))%' }
      : value.id === 'b-bad' ? { ...value, expression: '(1/0)%' } : value));
    const snapshot = trialSnapshot(input);
    const trial = preview(input, baseline);
    expect(trial.evaluation.success).toBe(false);
    expect(trial.evaluation.evaluated).toEqual(['a-first', 'b-bad']);
    expect(trial.rows.map(row => [row.state, row.result])).toEqual([
      ['success', 1], ['failed', null], ['unattempted', null], ['unattempted', null],
    ]);
    expect(trial.rows[1].error).toContain('0では割れません');
    expect(values(trial.evaluation.blocks)).toEqual([10, 100, 101, 7]);
    for (const previous of baseline) {
      const old = block(baseline, previous.id);
      expect(block(trial.evaluation.blocks, previous.id)).toMatchObject({
        result: old.result, resultText: old.resultText, error: old.error,
        evaluationState: { status: 'stale' },
      });
    }
    expect(trial.evaluation.blocks).toEqual(recalculateReferenceMemo(input).blocks);
    expect(applyCalculationTrial(trial, input, 'percent-memo', 1).success).toBe(false);
    expect(trialSnapshot(input)).toBe(snapshot);
  });

  it('preserves legacy assignment order and scope after numeric percent and failed reassignment', () => {
    const input = freezeDeep([
      'x=((50+50))%', 'first=x*2', 'x=(1/0)%', 'afterFailure=x+1', 'x=.5%', 'last=x*200',
    ].map((expression, index) => calculateMemoBlock(`legacy-${index}`, expression, 'note-variables')));
    const snapshot = trialSnapshot(input);
    const result = recalculateMemoBlocks(input) as CalculationMemoBlock[];
    expect(values(result)).toEqual([1, 2, null, 2, 0.005, 1]);
    expect(result[2].error).toContain('0では割れません');
    expect(result.filter((_, index) => index !== 2).every(value => value.error === null)).toBe(true);
    expect(result.every(value => value.evaluationMode === 'note-variables')).toBe(true);
    expect(trialSnapshot(input)).toBe(snapshot);
  });

  it('does not expand percent support to variables or ID operands', () => {
    const legacy = recalculateMemoBlocks([
      calculateMemoBlock('source', 'x=((50+50))%', 'note-variables'),
      calculateMemoBlock('mixed', 'x%', 'note-variables'),
      calculateMemoBlock('later', 'x+1', 'note-variables'),
    ]) as CalculationMemoBlock[];
    expect(values(legacy)).toEqual([1, null, 2]);
    expect(legacy[1].error).toContain('%');

    const input = [reference('source', '((50+50))%'), reference('mixed', '@{1}%', ['source'])];
    const trial = preview(input);
    expect(trial.evaluation.success).toBe(false);
    expect(trial.evaluation.evaluated).toEqual([]);
    expect(trial.rows.every(row => row.state === 'unattempted')).toBe(true);
    expect(applyCalculationTrial(trial, input, 'percent-memo', 1).success).toBe(false);
  });

  it('preserves unknown metadata and saved JSON without persisting unapplied trial results', () => {
    const source = { ...reference('source', '100'), proofRef: 'synthetic-proof', metadata: { tags: ['percent', '日本語'], future: { page: 3 } } };
    const target = {
      ...reference('target', '@{1}*2', ['source']), sourceId: 'synthetic-source',
      references: { version: 1 as const, future: 'reference metadata', entries: [{ slot: 1, blockId: 'source', future: ['entry metadata'] }] },
      evaluationState: { version: 1 as const, status: 'stale' as const, future: { retained: true } },
    };
    const baseline = recalculateReferenceMemo([source, target]).blocks;
    const edited = freezeDeep(markCalculationsStale(baseline.map(value => value.id === 'source'
      ? { ...value, expression: '((50+50))%' } : value)));
    const snapshot = trialSnapshot(edited);
    const note: PlainCalculationNote = {
      id: 'percent-memo', type: 'plain-calculation', title: 'Synthetic percent regression', content: '',
      createdAt: '2026-10-21T00:00:00Z', updatedAt: '2026-10-21T00:00:00Z', blocks: edited,
      calculationPolicy: { version: 1, mode: 'manual' },
    };
    let raw = '';
    const storage = {
      getItem: (key: string) => key === STORAGE_KEY ? raw || null : null,
      setItem: (key: string, value: string) => { expect(key).toBe(STORAGE_KEY); raw = value; },
    };
    const data = { ...structuredClone(defaultData), notes: [note] };
    expect(saveData(data, storage)).toBe(true);
    const beforeTrial = raw;
    const trial = preview(edited, baseline);
    expect(raw).toBe(beforeTrial);
    expect(saveData(data, storage)).toBe(true);
    expect(values(JSON.parse(raw).notes[0].blocks)).toEqual([100, 200]);

    const applied = applyCalculationTrial(trial, edited, 'percent-memo', 1);
    expect(applied.success).toBe(true);
    if (!applied.success) throw new Error(applied.message);
    expect(saveData({ ...data, notes: [{ ...note, blocks: applied.evaluation.blocks }] }, storage)).toBe(true);
    const restored = loadData(storage);
    expect(restored.status).toBe('ok');
    if (restored.status !== 'ok') throw new Error('Saved percent memo did not reload');
    const restoredNote = restored.data.notes[0] as PlainCalculationNote;
    expect(restored.data.version).toBe(1);
    expect(restoredNote.calculationPolicy).toEqual({ version: 1, mode: 'manual' });
    expect(restoredNote.blocks).toEqual(JSON.parse(JSON.stringify(applied.evaluation.blocks)));
    expect(values(restoredNote.blocks!)).toEqual([1, 2]);
    expect(block(restoredNote.blocks!, 'source')).toMatchObject({ expression: '((50+50))%', proofRef: source.proofRef, metadata: source.metadata });
    expect(block(restoredNote.blocks!, 'target')).toMatchObject({
      sourceId: target.sourceId, references: target.references,
      evaluationState: { status: 'current', future: { retained: true } },
    });
    expect(staleBlockIds(restoredNote.blocks!).size).toBe(0);
    expect(recalculateReferenceMemo(restoredNote.blocks!).blocks).toEqual(applied.evaluation.blocks);
    expect(raw).not.toMatch(/observations|differenceState|memoKey/);
    expect(trialSnapshot(edited)).toBe(snapshot);
  });
});
