import { describe, expect, it } from 'vitest';
import { evaluateReferenceMemo, markCalculationsStale } from '../lib/block-references';
import { calculateMemoBlock, recalculateMemoBlocks } from '../lib/memo-blocks';
import { appendCalculationEvidence, evaluateLegacyMemoWithEvidence, evidenceNumber, makeEvidenceCandidate, validCalculationEvidence, verifyCalculationEvidence, type EvidenceHistory } from '../lib/calculation-evidence';
import { applyCalculationTrial, createCalculationTrial, trialSnapshot } from '../lib/calculation-trial';
import type { CalculationMemoBlock, MemoBlock } from '../lib/types';
const legacy = (id: string, expression: string) => calculateMemoBlock(id, expression, 'note-variables');
const ref = (id: string, expression: string, ids: string[] = []): CalculationMemoBlock => ({ id, type: 'calculation', evaluationMode: 'block-references', references: { version: 1, entries: ids.map((blockId, index) => ({ slot: index + 1, blockId })) }, expression, displayExpression: expression, result: null, resultText: '', error: null });
const at = '2026-10-21T23:00:00.000Z';
function record(blocks: MemoBlock[]) { const evaluated = evaluateReferenceMemo(blocks); expect(evaluated.success).toBe(true); return appendCalculationEvidence(undefined, [makeEvidenceCandidate(evaluated.blocks, evaluated.evidence!, at)], at); }

describe('actual calculation evidence', () => {
  it('captures latest successful legacy assignment and self reassignment before replacing the origin', () => {
    const history = record([legacy('a', 'x=2'), legacy('b', 'x=x+3'), legacy('c', 'x*2'), ref('d', '@{1}+@{2}', ['a', 'c'])]);
    const b = history.records[0].blocks;
    expect(b[1].inputs).toEqual([{ kind: 'variable', name: 'x', sourceBlockId: 'a', value: '2' }]);
    expect(b[2].inputs).toEqual([{ kind: 'variable', name: 'x', sourceBlockId: 'b', value: '5' }]);
    expect(b[3].inputs.map(i => [i.sourceBlockId, i.value])).toEqual([['a', '2'], ['c', '10']]);
    expect(verifyCalculationEvidence(history.records[0]).success).toBe(true);
  });
  it('does not label unused mappings, constants, or repeated variable reads as extra input', () => {
    const h = record([legacy('a','x=2'), legacy('b','x+x+pi'), ref('c','@{1}+@{1}', ['b','a'])]);
    expect(h.records[0].blocks[1].inputs).toHaveLength(1);
    expect(h.records[0].blocks[2].inputs).toHaveLength(1);
    expect(h.records[0].blocks[2].inputs[0].sourceBlockId).toBe('b');
  });
  it('keeps display position separate from dependency execution order', () => {
    const h = record([ref('c','@{1}+1',['b']), { id:'text',type:'text',content:'description' },ref('b','@{1}+1',['a']),ref('a','2')]);
    expect(h.records[0].blocks.map(b => [b.blockId,b.position])).toEqual([['a',4],['b',3],['c',1]]);
    expect(verifyCalculationEvidence(h.records[0]).success).toBe(true);
  });
  it('preserves internal precision distinct from display and signed zero through JSON', () => {
    const h = record([ref('a','sqrt(2)^2'),ref('b','-0'),ref('c','@{1}',['b'])]);
    expect(h.records[0].blocks.find(b=>b.blockId==='a')?.result).toBe('2.0000000000000004');
    expect(h.records[0].blocks.find(b=>b.blockId==='a')?.resultText).toBe('2');
    expect(h.records[0].blocks.find(b=>b.blockId==='b')?.result).toBe('-0');
    expect(h.records[0].blocks.find(b=>b.blockId==='c')?.inputs[0].value).toBe('-0');
    const roundtrip=JSON.parse(JSON.stringify(h)); expect(validCalculationEvidence(roundtrip)).toBe(true);
    expect(verifyCalculationEvidence(roundtrip.records[0]).success).toBe(true);
  });
  it('appends new IDs for repeated execution without mutating previous records', () => {
    const original=record([ref('a','10')]); const before=JSON.stringify(original);
    const result=evaluateReferenceMemo([ref('a','20')]); const candidate=makeEvidenceCandidate(result.blocks,result.evidence!,at);
    const next=appendCalculationEvidence(original,[candidate,candidate],at);
    expect(new Set(next.records.map(r=>r.id)).size).toBe(3); expect(next.records[0].blocks[0].result).toBe('10');
    expect(JSON.stringify(original)).toBe(before); expect(next.records[0]).toBe(original.records[0]);
    candidate.blocks[0].result='999'; expect(next.records[1].blocks[0].result).toBe('20');
  });
  it.each([
    [ref('a','@{1}',['missing'])], [ref('a','@{1}',['a'])], [ref('a','@{1}',['b']),ref('b','@{1}',['a'])],
    [legacy('a','x=2'),legacy('b','x=1/0'),legacy('c','x*2')], [ref('a','2'),ref('b','1/0')],
  ])('does not return successful evidence for a failed batch %j', (...input) => {
    const result=evaluateReferenceMemo(input as MemoBlock[]); expect(result.success).toBe(false); expect(result.evidence).toBeUndefined();
  });
  it('legacy save pass is value-identical including failure reassignment and partial results', () => {
    const blocks=[legacy('a','x=2'),legacy('b','x=1/0'),legacy('c','x*2')];
    const result=evaluateLegacyMemoWithEvidence(blocks);
    expect(result.blocks).toEqual(recalculateMemoBlocks(blocks)); expect(result.evidence).toBeUndefined();
    expect((result.blocks[2] as CalculationMemoBlock).result).toBe(4);
  });
  it('legacy success gathers same-pass actual inputs without changing originals', () => {
    const blocks=[legacy('a','x=2'),legacy('b','x+1')]; const before=JSON.stringify(blocks);
    const result=evaluateLegacyMemoWithEvidence(blocks); expect(result.blocks).toEqual(recalculateMemoBlocks(blocks));
    expect(result.evidence?.[1].inputs[0].value).toBe('2'); expect(JSON.stringify(blocks)).toBe(before);
  });
  it('trial previews and stale draft edits cannot append records themselves', () => {
    const blocks=[ref('a','2'),ref('b','@{1}+1',['a'])]; const before=JSON.stringify(blocks);
    const context={memoKey:'memo',revision:1,snapshot:trialSnapshot(blocks)};
    const trial=createCalculationTrial(blocks,context); expect(trial.evaluation.success).toBe(true);
    expect(JSON.stringify(blocks)).toBe(before); expect(blocks).not.toHaveProperty('calculationEvidence');
    const changed=markCalculationsStale(blocks.map(b=>({...b,expression:b.id==='a'?'4':b.expression})));
    expect(applyCalculationTrial(trial,changed,'memo',2).success).toBe(false);
  });
  it('rejects empty candidates rather than fabricating an empty calculation record', () => {
    expect(()=>makeEvidenceCandidate([],[],at)).toThrow(); expect(evaluateLegacyMemoWithEvidence([]).evidence).toBeUndefined();
  });
  it('fails closed at history count, retaining every original record', () => {
    const first=record([ref('a','1')]); const history:EvidenceHistory={version:1,records:Array.from({length:100},(_,i)=>({...first.records[0],id:`id-${i}`}))};
    expect(validCalculationEvidence(history)).toBe(true); const before=JSON.stringify(history);
    expect(()=>appendCalculationEvidence(history,[first.records[0]],at)).toThrow('上限100件');
    expect(JSON.stringify(history)).toBe(before); expect(appendCalculationEvidence(history,[],at).records).toHaveLength(100);
  });
  it('fails closed at byte limit without trimming any history', () => {
    const first=record([ref('a','1')]); const candidate=structuredClone(first.records[0]); candidate.blocks[0].resultText='x'.repeat(500_000);
    expect(()=>appendCalculationEvidence(first,[candidate],at)).toThrow('容量上限'); expect(first.records).toHaveLength(1);
  });
  it.each([NaN,Infinity,-Infinity])('does not accept nonfinite encoding %s', value => {
    const h=record([ref('a','1')]); h.records[0].blocks[0].result=evidenceNumber(value); expect(validCalculationEvidence(h)).toBe(false);
  });
  it('preserves unknown history and record fields while appending', () => {
    const h={...record([ref('a','1')]),extra:{opaque:true}}; Object.assign(h.records[0],{futureNote:'kept'});
    const next=appendCalculationEvidence(h,[],at); expect(next).toHaveProperty('extra',{opaque:true}); expect(next.records[0]).toHaveProperty('futureNote','kept');
  });
});
