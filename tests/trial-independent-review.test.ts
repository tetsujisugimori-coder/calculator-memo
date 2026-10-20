// @vitest-environment jsdom
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createCalculationTrial, applyCalculationTrial, trialSnapshot } from '../lib/calculation-trial';
import { evaluateReferenceMemo, recalculateReferenceMemo, markCalculationsStale } from '../lib/block-references';
import { MemoBlockEditor } from '../components/MemoBlockEditor';
import { useCalculationTrial } from '../components/useCalculationTrial';
import type { CalculationMemoBlock, MemoBlock } from '../lib/types';
const ref = (id: string, expression: string, ids: string[] = []): CalculationMemoBlock => ({ id, type: 'calculation', evaluationMode: 'block-references', references: { version: 1, entries: ids.map((blockId, index) => ({ slot: index + 1, blockId })) }, expression, displayExpression: expression, result: 999, resultText: '999', error: null });
const legacy = (id: string, expression: string): CalculationMemoBlock => { const block = ref(id, expression); delete block.references; return { ...block, evaluationMode: 'note-variables' }; };
const make = (blocks: MemoBlock[], revision = 0) => createCalculationTrial(blocks, { memoKey: 'memo', revision, snapshot: trialSnapshot(blocks) });
let root: Root | undefined, host: HTMLDivElement | undefined;
afterEach(async () => { if (root) await act(async () => root!.unmount()); root = undefined; host?.remove(); vi.restoreAllMocks(); });
describe('independent trial safety review', () => {
  it('records successful later legacy old-scope use without partially committing', () => {
    const blocks = [legacy('x', 'x=7'), legacy('bad', 'x=1/0'), legacy('use', 'x+2'), ref('id', '@{1}+1', ['use'])];
    const before = structuredClone(blocks); const trial = make(blocks);
    expect(trial.rows.map(r => [r.blockId, r.state, r.result])).toEqual([['x','success',7], ['bad','failed',null], ['use','success',9], ['id','unattempted',null]]);
    expect(trial.evaluation.blocks.map(b => b.type === 'calculation' && b.result)).toEqual([999,999,999,999]);
    expect(applyCalculationTrial(trial, blocks, 'memo', 0).success).toBe(false); expect(blocks).toEqual(before);
  });
  it('does not invent numerical success for independent blocks when preflight stops all', () => {
    const trial = make([ref('missing','@{1}',['gone']),ref('independent','1+1')]);
    expect(trial.rows.every(r => r.state === 'unattempted' && r.result === null && r.differenceState === 'unavailable')).toBe(true);
    expect(trial.evaluation.evaluated).toEqual([]);
  });
  it('preserves exact legacy recalc return contract despite additional evaluator evidence', () => {
    const blocks = [ref('a','2'),ref('b','1/0'),ref('c','3')];
    const { observations, ...evaluation } = evaluateReferenceMemo(blocks);
    expect(recalculateReferenceMemo(blocks)).toEqual(evaluation);
    expect(observations.map(v => v.blockId)).toEqual(['a','b']);
  });
  it('compares internal numbers when display rounding is identical', () => {
    const block = { ...ref('a','1+0.0000000000001'), result: 1, resultText: '1' };
    const row = make([block]).rows[0]; expect(row.resultText).toBe('1'); expect(row.differenceState).toBe('changed'); expect(row.difference).toBe((1 + 0.0000000000001) - 1);
  });
  it('does not compare a retained numerical payload with a saved error', () => {
    const row = make([{ ...ref('a','3'), error:'old error' }]).rows[0];
    expect(row.previousEvidence).toBe('saved-error'); expect(row.previous).toBeNull(); expect(row.differenceState).toBe('unavailable'); expect(row.result).toBe(3);
  });
  it('rejects metadata-only source changes rather than overwriting them', () => {
    const blocks = [{ ...ref('a','2'), unknown: { preserved: [1,2] } }]; const trial = make(blocks);
    blocks[0].unknown.preserved.push(3);
    expect(applyCalculationTrial(trial, blocks, 'memo', 0).success).toBe(false); expect(blocks[0].unknown.preserved).toEqual([1,2,3]);
  });
  it('reevaluates and rejects tampered candidate results', () => {
    const blocks = [ref('a','2')]; const trial = make(blocks);
    (trial.evaluation.blocks[0] as CalculationMemoBlock).result = 9999;
    expect(applyCalculationTrial(trial, blocks, 'memo', 0).success).toBe(false); expect(blocks[0].result).toBe(999);
  });
  it.each(['memo', 'revision', 'order', 'addition', 'deletion'])('rejects changed %s before apply', kind => {
    const blocks = [ref('a','2'),ref('b','@{1}+2',['a'])]; const trial = make(blocks);
    const current = kind === 'order' ? [...blocks].reverse() : kind === 'addition' ? [...blocks,ref('c','5')] : kind === 'deletion' ? blocks.slice(0,1) : blocks;
    expect(applyCalculationTrial(trial,current,kind === 'memo' ? 'different' : 'memo',kind === 'revision' ? 1 : 0).success).toBe(false);
  });
  it('maintains original inputs and unknown fields through successful preview and apply', () => {
    const withUnknownMetadata = { ...ref('a','sqrt(2)'), extra: { x: [1,2] } };
    const blocks = markCalculationsStale([withUnknownMetadata, ref('b','@{1}*2',['a'])]);
    const original = JSON.stringify(blocks); blocks.forEach(Object.freeze); Object.freeze(blocks);
    const trial = make(blocks); const applied = applyCalculationTrial(trial,blocks,'memo',0);
    expect(applied.success).toBe(true); expect(JSON.stringify(blocks)).toBe(original);
    if (applied.success) { expect(applied.evaluation.blocks).toEqual(recalculateReferenceMemo(blocks).blocks); expect((applied.evaluation.blocks[0] as CalculationMemoBlock).result).toBe(Math.sqrt(2)); expect(JSON.stringify(applied.evaluation.blocks)).not.toContain('observations'); }
  });
  it('keeps source revision round trips visibly invalid, not just apply-rejected', async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const blocks = [ref('a','2')]; const onApply = vi.fn(); let current!: ReturnType<typeof useCalculationTrial>;
    function Harness({ sourceRevision }: { sourceRevision: string }) { current = useCalculationTrial({ blocks, memoKey:'memo',sourceRevision,baseline:blocks,baselineKnown:false,onApply }); return createElement('p',null,String(current.validTrial)); }
    host = document.createElement('div'); document.body.append(host); root = createRoot(host);
    await act(async () => root!.render(createElement(Harness,{sourceRevision:'A'})));
    await act(async () => current.preview()); expect(current.validTrial).toBe(true);
    await act(async () => root!.render(createElement(Harness,{sourceRevision:'B'}))); expect(current.validTrial).toBe(false);
    await act(async () => root!.render(createElement(Harness,{sourceRevision:'A'}))); expect(current.validTrial).toBe(false);
    await act(async () => current.applyTrial()); expect(onApply).not.toHaveBeenCalled();
  });
  it('does not resurrect cancelled pending work after a source revision round trip', async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const blocks = [ref('a','2')]; let current!: ReturnType<typeof useCalculationTrial>;
    function Harness({ sourceRevision }: { sourceRevision: string }) { current = useCalculationTrial({ blocks, memoKey:'memo',sourceRevision,baseline:blocks,baselineKnown:false,onApply:vi.fn() }); return null; }
    host = document.createElement('div'); document.body.append(host); root = createRoot(host);
    await act(async () => root!.render(createElement(Harness,{sourceRevision:'A'})));
    await act(async () => {
      const completion = current.preview();
      flushSync(() => root!.render(createElement(Harness,{sourceRevision:'B'})));
      flushSync(() => root!.render(createElement(Harness,{sourceRevision:'A'})));
      await completion;
    });
    expect(current.pendingTrial).toBe(false); expect(current.trial).toBeUndefined();
  });
  it('restores keyboard focus to a surviving control after explicit application', async () => {
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const changed = vi.fn();
    function Harness() { const [blocks,setBlocks] = useState<MemoBlock[]>([ref('a','2')]); return createElement(MemoBlockEditor,{ blocks,manual:true,onOpenGuide:vi.fn(),onChange:(next: MemoBlock[]) => { changed(next); setBlocks(next); } }); }
    host = document.createElement('div'); document.body.append(host); root = createRoot(host);
    await act(async () => root!.render(createElement(Harness)));
    const button = (label: string) => [...host!.querySelectorAll('button')].find(b => b.textContent === label)!;
    await act(async () => button('試算する').click()); expect(changed).not.toHaveBeenCalled();
    button('結果を反映').focus(); expect(document.activeElement).toBe(button('結果を反映'));
    await act(async () => button('結果を反映').click());
    expect(changed).toHaveBeenCalledTimes(1); expect(document.activeElement).toBe(button('試算する'));
    expect(host.querySelector('.calculation-trial')).toBeNull();
  });

});
