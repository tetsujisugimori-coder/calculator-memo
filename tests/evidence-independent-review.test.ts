import { describe, expect, it } from 'vitest';
import { evaluateReferenceMemo } from '../lib/block-references';
import { calculateMemoBlock } from '../lib/memo-blocks';
import { appendCalculationEvidence, evaluateLegacyMemoWithEvidence, evidenceNumber, makeEvidenceCandidate, validCalculationEvidence, verifyCalculationEvidence, type EvidenceRecord } from '../lib/calculation-evidence';
import type { CalculationMemoBlock } from '../lib/types';

const at = '2026-10-21T23:00:00.000Z';
const variable = (id: string, expression: string): CalculationMemoBlock => ({ id, type: 'calculation', evaluationMode: 'note-variables', expression, displayExpression: expression, result: null, resultText: '', error: null });
const reference = (id: string, expression: string, entries: { slot: number; blockId: string }[] = []): CalculationMemoBlock => ({ ...variable(id, expression), evaluationMode: 'block-references', references: { version: 1, entries } });
const legacyRecord = (blocks: CalculationMemoBlock[]) => {
  const result = evaluateLegacyMemoWithEvidence(blocks);
  return appendCalculationEvidence(undefined, [makeEvidenceCandidate(result.blocks, result.evidence!, at)], at).records[0];
};

describe('independent evidence adversarial review', () => {
  it('captures the previous successful reassignment origin, not future candidates', () => {
    const record = legacyRecord([variable('a', 'x = 2'), variable('b', 'x = x + 1'), variable('c', 'x + x'), variable('d', 'x = 99')]);
    expect(record.blocks[1].inputs).toEqual([{ kind: 'variable', name: 'x', sourceBlockId: 'a', value: '2' }]);
    expect(record.blocks[2].inputs).toEqual([{ kind: 'variable', name: 'x', sourceBlockId: 'b', value: '3' }]);
    expect(verifyCalculationEvidence(record).success).toBe(true);
  });
  it('never supplies a confirmed candidate after a partially failed legacy pass', () => {
    const result = evaluateLegacyMemoWithEvidence([variable('a', 'x = 2'), variable('b', 'x = 1 / 0'), variable('c', 'x + 1')]);
    expect((result.blocks[2] as CalculationMemoBlock).result).toBe(3);
    expect(result.evidence).toBeUndefined();
  });
  it('captures only used ID slots and distinguishes document order from execution order', () => {
    const result = evaluateReferenceMemo([reference('use', '@{1} + @{1}', [{ slot: 1, blockId: 'source' }, { slot: 2, blockId: 'unused' }]), reference('unused', '99'), reference('source', '0.1 + 0.2')]);
    expect(result.success).toBe(true);
    const record = appendCalculationEvidence(undefined, [makeEvidenceCandidate(result.blocks, result.evidence!, at)], at).records[0];
    const use = record.blocks.find(block => block.blockId === 'use')!;
    expect(use.position).toBe(1);
    expect(use.inputs).toEqual([{ kind: 'id', name: 'ReferenceValue1', sourceBlockId: 'source', value: '0.30000000000000004' }]);
    expect(verifyCalculationEvidence(record).success).toBe(true);
  });
  it('preserves negative zero through JSON and replay', () => {
    const record = legacyRecord([variable('a', 'x = -0'), variable('b', 'x')]);
    expect(record.blocks[0].result).toBe('-0');
    expect(record.blocks[1].inputs[0].value).toBe('-0');
    expect(verifyCalculationEvidence(JSON.parse(JSON.stringify(record))).success).toBe(true);
  });
  it.each(['', ' ', '00', '01', '1.0', 'Infinity', 'NaN', '-0.0'])('rejects noncanonical numeric encoding %j', value => {
    const record = legacyRecord([variable('a', '1')]);
    record.blocks[0].result = value;
    expect(validCalculationEvidence({ version: 1, records: [record] })).toBe(false);
  });
  it.each(['pi', 'e', 'sqrt', 'abs'])('rejects a record containing forbidden assignment to %s', name => {
    expect(calculateMemoBlock('a', `${name} = 1`, 'note-variables').error).not.toBeNull();
    const record = legacyRecord([variable('a', 'x = 1')]);
    record.blocks[0].expression = `${name} = 1`;
    expect(verifyCalculationEvidence(record).success).toBe(false);
  });
  it('rejects a fabricated legacy origin even when source values match', () => {
    const record = legacyRecord([variable('a', 'x = 2'), variable('b', 'x = 2'), variable('c', 'x + 1')]);
    record.blocks[2].inputs[0].sourceBlockId = 'a';
    expect(verifyCalculationEvidence(record).success).toBe(false);
  });
  it('rejects extra unused read inputs', () => {
    const record = legacyRecord([variable('a', 'x = 2'), variable('b', '1')]);
    record.blocks[1].inputs.push({ kind: 'variable', name: 'x', sourceBlockId: 'a', value: '2' });
    expect(verifyCalculationEvidence(record).success).toBe(false);
  });
  it('rejects altered results and preserves the source during verification', () => {
    const record = legacyRecord([variable('a', '0.1 + 0.2')]);
    const original = JSON.stringify(record);
    expect(evidenceNumber(Number(record.blocks[0].result))).toBe('0.30000000000000004');
    expect(verifyCalculationEvidence(record).success).toBe(true);
    expect(JSON.stringify(record)).toBe(original);
    record.blocks[0].result = '0.3';
    expect(verifyCalculationEvidence(record).success).toBe(false);
  });
  it.each(['references', 'evaluationMode', 'resultText'] as const)('rejects candidate mismatch in %s even if its numerical result matches', field => {
    const evaluated = evaluateReferenceMemo([reference('a', '1'), reference('b', '1'), reference('c', '@{1}', [{ slot: 1, blockId: 'a' }])]);
    const blocks = structuredClone(evaluated.blocks);
    const block = blocks.find(item => item.id === 'c') as CalculationMemoBlock;
    if (field === 'references') block.references!.entries[0].blockId = 'b';
    if (field === 'evaluationMode') block.evaluationMode = 'note-variables';
    if (field === 'resultText') block.resultText = 'fabricated';
    expect(() => makeEvidenceCandidate(blocks, evaluated.evidence!, at)).toThrow();
  });
  it.each([129, 1001])('replays %i successfully captured legacy blocks within the byte limit', count => {
    const record = legacyRecord(Array.from({ length: count }, (_, index) => variable(`block-${index}`, String(index))));
    expect(record.blocks).toHaveLength(count);
    expect(validCalculationEvidence({ version: 1, records: [record] })).toBe(true);
    expect(verifyCalculationEvidence(record).success).toBe(true);
  });
  it('rejects unsupported evaluator versions without executing them', () => {
    const record = legacyRecord([variable('a', '1')]);
    (record as unknown as { evaluator: string }).evaluator = 'calculator-memo-v99';
    expect(verifyCalculationEvidence(record as EvidenceRecord).success).toBe(false);
  });
});
