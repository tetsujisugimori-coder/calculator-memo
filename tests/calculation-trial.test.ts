import { describe, expect, it } from 'vitest';
import { applyCalculationTrial, createCalculationTrial, trialSnapshot, type TrialContext } from '../lib/calculation-trial';
import { markCalculationsStale, recalculateReferenceMemo } from '../lib/block-references';
import type { CalculationMemoBlock, MemoBlock } from '../lib/types';
const ref = (id: string, expression: string, targets: string[] = []): CalculationMemoBlock => ({ id, type: 'calculation', expression, displayExpression: expression, result: null, resultText: '', error: null, evaluationMode: 'block-references', references: { version: 1, entries: targets.map((blockId, i) => ({ slot: i + 1, blockId })) } });
const legacy = (id: string, expression: string): CalculationMemoBlock => ({ ...ref(id, expression), evaluationMode: 'note-variables', references: undefined });
const context = (blocks: MemoBlock[], revision = 1): TrialContext => ({ memoKey: 'note', revision, snapshot: trialSnapshot(blocks) });
const trial = (blocks: MemoBlock[], baseline?: MemoBlock[]) => createCalculationTrial(blocks, context(blocks), { baseline, baselineKnown: true });
const frozen = <T>(value: T): T => { if (value && typeof value === 'object') { Object.freeze(value); Object.values(value).forEach(frozen); } return value; };
describe('non-destructive trial and atomic apply', () => {
  it('retains old values and unknown nested metadata while evaluating the same engine', () => {
    const before = recalculateReferenceMemo([ref('a', '100'), ref('b', '@{1}+50', ['a']), ref('c', '@{1}*2', ['b']), ref('u', '7')]).blocks;
    const edited = markCalculationsStale(before.map(b => b.id === 'a' ? { ...b, expression: '120', custom: { annotation: [1, '日本語'] } } : b));
    frozen(edited); const snapshot = trialSnapshot(edited); const preview = trial(edited, before);
    expect(trialSnapshot(edited)).toBe(snapshot);
    expect(preview.rows.map(r => [r.previous, r.result, r.difference])).toEqual([[100,120,20],[150,170,20],[300,340,40],[7,7,0]]);
    expect(preview.report.states.get('u')?.change).toBe('none');
    expect(preview.report.states.get('a')?.change).toBe('changed'); expect(preview.report.states.get('c')?.change).toBe('affected');
    expect(preview.evaluation.blocks).toEqual(recalculateReferenceMemo(edited).blocks);
    const applied = applyCalculationTrial(preview, edited, 'note', 1); expect(applied.success).toBe(true);
    if (applied.success) { expect(applied.evaluation.blocks).toEqual(preview.evaluation.blocks); expect(applied.evaluation.blocks[0]).toHaveProperty('custom.annotation', [1,'日本語']); }
    expect(trialSnapshot(edited)).toBe(snapshot);
  });
  it('uses unrounded numbers even when display strings match', () => {
    const blocks = [ { ...ref('a','1 / 10000000000000'), result: 2e-13, resultText: '0' } ];
    const p = trial(blocks); expect(p.rows[0].difference).toBe(-1e-13); expect(p.rows[0].differenceState).toBe('changed');
  });
  it('does not fabricate comparison for saved errors or missing results', () => {
    const p = trial([{...ref('a','2'), result: 99, error: 'old error'}, ref('b','3')]);
    expect(p.rows.map(r=>r.previousEvidence)).toEqual(['saved-error','missing']);
    expect(p.rows.every(r=>r.differenceState === 'unavailable')).toBe(true);
    expect(p.evaluation.success).toBe(true); expect(p.report.coverage).toContain('まだ結果は確定していません');
  });
  it('does not emit nonfinite deltas for otherwise finite recorded values', () => {
    const p = trial([{...ref('a','1'), result: -Number.MAX_VALUE, resultText: 'old'}]);
    expect(Number.isFinite(p.rows[0].difference!)).toBe(true);
  });
  it('preserves legacy reassignment failure scope and stops before ID evaluation', () => {
    const blocks = [legacy('x','x=10'), legacy('fail','x=1/0'), legacy('after','x+2'), ref('id','@{1}', ['after'])];
    const p = trial(blocks);
    expect(p.evaluation.evaluated).toEqual(['x','fail','after']);
    expect(p.rows.map(r=>[r.state,r.result])).toEqual([['success',10],['failed',null],['success',12],['unattempted',null]]);
    expect(applyCalculationTrial(p, blocks,'note',1).success).toBe(false);
    expect(blocks.every(b=>b.type !== 'calculation' || b.result === null)).toBe(true);
  });
  it('captures numeric ID failure without claiming downstream or unrelated evaluation', () => {
    const p = trial([ref('a','2'),ref('b','1/0'),ref('c','@{1}', ['b']),ref('z','4')]);
    expect(p.evaluation.evaluated).toEqual(['a','b']);
    expect(p.rows.map(r=>r.state)).toEqual(['success','failed','unattempted','unattempted']);
    expect(p.report.states.get('c')?.kind).toBe('blocked');
    expect(p.report.states.get('z')?.kind).not.toBe('error');
  });
  it.each([
    [ref('a','@{1}', ['a'])],
    [ref('a','@{1}', ['b']), ref('b','@{1}', ['a']), ref('c','@{1}', ['a'])],
    [ref('a','@{1}', ['missing'])],
    [ref('a','@{bad}')],
    [ref('a','2+*3')],
  ])('structural failure keeps all numerical results unattempted (%#)', (...blocks) => {
    const p = trial(blocks as MemoBlock[]); expect(p.evaluation.success).toBe(false);
    expect(p.rows.every(r=>r.state === 'unattempted' && r.differenceState === 'unavailable')).toBe(true);
  });
  it('handles mixed legacy and forward/backward ID diamond deterministically', () => {
    const p = trial([ref('d','@{1}+@{2}', ['b','c']),legacy('x','x=5'),ref('b','@{1}*2',['x']),ref('c','@{1}+1',['x']), ref('a','8')]);
    expect(p.evaluation.evaluated).toEqual(['x','a','b','c','d']);
    expect(p.rows.find(r=>r.blockId==='d')?.result).toBe(16);
  });
  it.each(['edit','reference','add','delete','reorder','unknown','old-result','note','generation'])('rejects changed input at apply: %s', kind => {
    const blocks: MemoBlock[] = [ref('a','2'),ref('b','@{1}', ['a'])]; const p = trial(blocks);
    const current = structuredClone(blocks);
    if (kind === 'edit') (current[0] as CalculationMemoBlock).expression = '3';
    if (kind === 'reference') (current[1] as CalculationMemoBlock).references!.entries[0].blockId = 'b';
    if (kind === 'add') current.push(ref('c','5'));
    if (kind === 'delete') current.pop();
    if (kind === 'reorder') current.reverse();
    if (kind === 'unknown') Object.assign(current[0], {future: true});
    if (kind === 'old-result') (current[0] as CalculationMemoBlock).result = 5;
    const before = trialSnapshot(current);
    expect(applyCalculationTrial(p, current, kind === 'note' ? 'other' : 'note', kind === 'generation' ? 2 : 1).success).toBe(false);
    expect(trialSnapshot(current)).toBe(before);
  });
  it('rejects tampered preview outputs rather than copying them', () => {
    const blocks=[ref('a','2')], p=trial(blocks); (p.evaluation.blocks[0] as CalculationMemoBlock).result=100;
    expect(applyCalculationTrial(p,blocks,'note',1).success).toBe(false);
  });
  it('can recover after failure, and temporary observations never enter JSON blocks', () => {
    const blocks = [ref('a','1/0')]; expect(trial(blocks).evaluation.success).toBe(false);
    blocks[0].expression='sqrt(2)'; const p=trial(blocks), result=applyCalculationTrial(p,blocks,'note',1);
    expect(result.success).toBe(true);
    if (result.success) { const restored=JSON.parse(JSON.stringify(result.evaluation.blocks)); expect(restored[0].result).toBe(Math.sqrt(2)); expect(JSON.stringify(restored)).not.toMatch(/observations|differenceState|memoKey/); expect(recalculateReferenceMemo(restored).blocks).toEqual(result.evaluation.blocks); }
  });
  it('captures full unknown metadata and distinguishes undefined, null and negative zero', () => {
    const blocks = [ref('a','2')];
    expect(trialSnapshot([{...blocks[0],extra:undefined} as MemoBlock])).not.toBe(trialSnapshot([{...blocks[0],extra:null} as MemoBlock]));
    expect(trialSnapshot([{...blocks[0],result:-0}])).not.toBe(trialSnapshot([{...blocks[0],result:0}]));
  });
});
