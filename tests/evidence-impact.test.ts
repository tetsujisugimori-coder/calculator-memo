import { describe, expect, it } from 'vitest';
import type { EvidenceBlock, EvidenceRecord } from '../lib/calculation-evidence';
import { compareEvidenceRecords } from '../lib/evidence-comparison';
import { analyzeEvidenceImpact, IMPACT_LIMITS } from '../lib/evidence-impact';

const block = (blockId = 'A', position = 1, result = '100'): EvidenceBlock => ({ blockId, position, expression: result, inputs: [], result, resultText: result, status: 'success' });
const record = (id: string, blocks: EvidenceBlock[]): EvidenceRecord => ({ id, blocks, calculatedAt: '2026-10-22T01:00:00.000Z', persistedAt: '2026-10-22T01:01:00.000Z', evaluator: 'calculator-memo-v1', status: 'confirmed' });
const consumer = (id = 'B', position = 2, source = 'A', value = '100', result = '150'): EvidenceBlock => ({ ...block(id, position, result), expression: '@{1}+50', evaluationMode: 'block-references', references: { version: 1, entries: [{ slot: 1, blockId: source }] }, inputs: [{ kind: 'id', name: 'ReferenceValue1', sourceBlockId: source, value }] });
const analyze = (before: EvidenceBlock[], after: EvidenceBlock[]) => analyzeEvidenceImpact(compareEvidenceRecords(record('before', before), record('after', after)));
const row = (value: ReturnType<typeof analyze>, id: string) => value.rows.find(item => item.blockId === id)!;

describe('saved evidence impact: independent observations and historic paths', () => {
  it('keeps identical records unchanged despite distinct IDs and dates', () => {
    const value = analyze([block()], [block()]);
    expect(value.counts).toEqual({ direct: 0, propagation: 0, result: 0, order: 0, unknown: 0, unchanged: 1 });
    expect(value.complete).toBe(true);
  });
  it('classifies expression-only edits even when results are equal', () => {
    const next = { ...block(), expression: '50+50' };
    const value = analyze([block()], [next]);
    expect(row(value, 'A').directChanges).toEqual(['入力式']);
    expect(row(value, 'A').resultChanges).toEqual([]);
  });
  it('classifies mode-only edits without claiming a result change', () => {
    const value = analyze([block()], [{ ...block(), evaluationMode: 'note-variables' }]);
    expect(row(value, 'A').directChanges).toEqual(['計算モード']);
    expect(value.counts.result).toBe(0);
  });
  it('does not turn result-only change into an initiating root', () => {
    const value = analyze([block(), consumer()], [{ ...block(), resultText: '約100' }, consumer()]);
    expect(row(value, 'A').directChanges).toEqual([]);
    expect(row(value, 'A').resultChanges).toEqual(['表示結果']);
    expect(row(value, 'B').propagationCandidate).toBe(false);
  });
  it('preserves differing internal precision beneath an identical display', () => {
    const a = { ...block(), result: '0.3333333333333333', resultText: '0.33' };
    const b = { ...a, result: '0.33333333333333337' };
    expect(row(analyze([a], [b]), 'A').resultChanges).toEqual(['内部結果']);
  });
  it('preserves negative-zero result identity', () => {
    expect(row(analyze([{ ...block(), result: '0', resultText: '0' }], [{ ...block(), result: '-0', resultText: '0' }]), 'A').resultChanges).toEqual(['内部結果']);
  });
  it('keeps order-only changes separate from calculation content and propagation', () => {
    const value = analyze([block('A', 1), block('B', 2)], [block('B', 1), block('A', 2)]);
    expect(value.counts.direct).toBe(0); expect(value.counts.propagation).toBe(0);
    expect(row(value, 'A').orderChanges).toEqual(['本文順', '実行順']);
  });
  it('distinguishes body order alone', () => {
    const value = analyze([block('A', 1), block('B', 2)], [block('A', 2), block('B', 1)]);
    expect(row(value, 'A').orderChanges).toEqual(['本文順']);
  });
  it('distinguishes execution order alone', () => {
    const value = analyze([block('A', 1), block('B', 2)], [block('B', 2), block('A', 1)]);
    expect(row(value, 'A').orderChanges).toEqual(['実行順']);
  });
  it('traces a recorded A→B→C chain on each side independently', () => {
    const old = [block(), consumer(), consumer('C', 3, 'B', '150', '300')];
    const next = [block('A', 1, '120'), consumer('B', 2, 'A', '120', '170'), consumer('C', 3, 'B', '170', '340')];
    const value = analyze(old, next);
    expect(row(value, 'C').beforePaths).toEqual([{ rootId: 'A', blockIds: ['A', 'B', 'C'] }, { rootId: 'B', blockIds: ['B', 'C'] }]);
    expect(row(value, 'C').afterPaths).toEqual(row(value, 'C').beforePaths);
    expect(row(value, 'B').directChanges).toContain('実使用内部値');
    expect(row(value, 'B').propagationCandidate).toBe(true);
    expect(row(value, 'B').resultChanges).toEqual(['表示結果', '内部結果']);
  });
  it('allows propagation candidates whose results and inputs remain equal', () => {
    const value = analyze([block(), consumer()], [{ ...block(), expression: '50+50' }, consumer()]);
    expect(row(value, 'B').propagationCandidate).toBe(true);
    expect(row(value, 'B').resultChanges).toEqual([]);
    expect(row(value, 'B').directChanges).toEqual([]);
  });
  it('shows equal-value retargeting and separates old/new routes', () => {
    const value = analyze([block(), block('X', 2), consumer('B', 3)], [{ ...block(), expression: '50+50' }, block('X', 2), consumer('B', 3, 'X')]);
    expect(row(value, 'B').directChanges).toContain('実使用参照元');
    expect(row(value, 'B').directChanges).not.toContain('実使用内部値');
    expect(row(value, 'B').beforePaths.map(path => path.rootId)).toEqual(['A']);
    expect(row(value, 'B').afterPaths).toEqual([]);
    expect(value.edgeChanges.changed.map(change => [change.before.source, change.after.source])).toEqual([['A', 'X']]);
    expect(value.edgeChanges.added.map(edge => edge.source)).toEqual(['X']);
    expect(value.edgeChanges.removed.map(edge => edge.source)).toEqual(['A']);
  });
  it('retains multiple upstream roots without asserting a single cause', () => {
    const c = { ...consumer('C', 3), inputs: [...consumer().inputs, { kind: 'id' as const, name: 'ReferenceValue2', sourceBlockId: 'B', value: '100' }], references: { version: 1 as const, entries: [{ slot: 1, blockId: 'A' }, { slot: 2, blockId: 'B' }] } };
    const value = analyze([block(), block('B', 2), c], [{ ...block(), expression: '50+50' }, { ...block('B', 2), expression: '20+80' }, c]);
    expect(row(value, 'C').afterPaths.map(path => path.rootId)).toEqual(['A', 'B']);
  });
  it('distinguishes record-only additions/removals and before-only propagation', () => {
    const value = analyze([block(), consumer()], [block('X', 1), block('B', 2, '150')]);
    expect(row(value, 'A').directChanges).toContain('比較対象の記録間で削除');
    expect(row(value, 'X').directChanges).toContain('比較対象の記録間で追加');
    expect(row(value, 'B').beforePaths).toEqual([{ rootId: 'A', blockIds: ['A', 'B'] }]);
    expect(row(value, 'B').afterPaths).toEqual([]);
  });
  it('uses captured legacy variable binding rather than reassignment candidates', () => {
    const b = { ...block('B', 2), expression: 'x=100', evaluationMode: 'note-variables' }, c = { ...block('C', 3), expression: 'x+50', evaluationMode: 'note-variables', inputs: [{ kind: 'variable' as const, name: 'x', sourceBlockId: 'B', value: '100' }] };
    const value = analyze([{ ...block(), expression: 'x=100', evaluationMode: 'note-variables' }, b, c], [{ ...block(), expression: 'x=50+50', evaluationMode: 'note-variables' }, b, c]);
    expect(value.after.edges.map(edge => [edge.source, edge.target, edge.certainty])).toEqual([['B', 'C', 'definite']]);
    expect(row(value, 'C').propagationCandidate).toBe(false);
  });
  it('does not insert unused reference candidates into paths', () => {
    const b = consumer(); b.references!.entries.push({ slot: 2, blockId: 'missing-unused' });
    const value = analyze([block(), b], [{ ...block(), expression: '50+50' }, b]);
    expect(value.before.edges).toHaveLength(1); expect(value.complete).toBe(true);
  });
  it('reports changed unused configuration separately without claiming it was used', () => {
    const next = consumer(); next.references!.entries.push({ slot: 2, blockId: 'unused' });
    const value = analyze([block(), consumer()], [block(), next]);
    expect(row(value, 'B').directChanges).toContain('保存された参照枠設定（未使用枠を含む）');
    expect(value.edgeChanges.added).toEqual([]);
  });
});

describe('saved impact incomplete and invalid evidence', () => {
  it.each(['value', 'mode', 'name', 'slotTarget'] as const)('flags %s inconsistency without changing observed comparison', kind => {
    const b = consumer();
    if (kind === 'value') b.inputs[0].value = '99';
    if (kind === 'mode') b.evaluationMode = 'note-variables';
    if (kind === 'name') b.inputs[0].name = 'ReferenceValue2';
    if (kind === 'slotTarget') b.references!.entries[0].blockId = 'elsewhere';
    const value = analyze([block(), consumer()], [{ ...block(), expression: '50+50' }, b]);
    expect(row(value, 'B').unknown.length).toBeGreaterThan(0);
    expect(value.after.edges[0].valid).toBe(false);
    expect(row(value, 'B').afterPaths).toEqual([]);
    expect(value.complete).toBe(false);
  });
  it('does not mislabel changed edge validity as a dependency addition/removal', () => {
    const invalid = consumer(); invalid.inputs[0].value = '99';
    const value = analyze([block(), consumer()], [block(), invalid]);
    expect(value.edgeChanges.added).toEqual([]); expect(value.edgeChanges.removed).toEqual([]);
    expect(value.edgeChanges.unchanged).toHaveLength(1);
    expect(value.edgeChanges.unchanged[0].valid).toBe(false);
  });
  it('does not accept variable reads in the legacy mode without an evaluationMode', () => {
    const legacy = { ...block('B', 2), expression: 'x+50', inputs: [{ kind: 'variable' as const, name: 'x', sourceBlockId: 'A', value: '100' }] };
    const value = analyze([block(), legacy], [{ ...block(), expression: '50+50' }, legacy]);
    expect(value.after.edges[0].valid).toBe(false);
    expect(row(value, 'B').unknown.join()).toContain('計算モード');
    expect(row(value, 'B').afterPaths).toEqual([]);
  });
  it('rejects a captured variable origin in a mode that cannot define variables', () => {
    const invalid = { ...block('B', 2), expression: 'x+50', evaluationMode: 'note-variables', inputs: [{ kind: 'variable' as const, name: 'x', sourceBlockId: 'A', value: '100' }] };
    const value = analyze([block(), invalid], [block(), invalid]);
    expect(value.after.edges[0].valid).toBe(false);
    expect(row(value, 'B').unknown.join()).toContain('変数を定義できる計算モード');
  });
  it('does not propagate through an inconsistent intermediate record', () => {
    const b = consumer(); b.inputs[0].value = '99';
    const old = [block(), b, consumer('C', 3, 'B', '150')];
    const value = analyze(old, [{ ...block(), expression: '50+50' }, b, consumer('C', 3, 'B', '150')]);
    expect(row(value, 'C').unknown.join()).toContain('上流');
    expect(row(value, 'C').afterPaths).toEqual([]);
  });
  it('compares negative zero in input consistency without coercion', () => {
    const a = { ...block(), result: '-0' }, b = consumer('B', 2, 'A', '0');
    expect(analyze([a, b], [a, b]).complete).toBe(false);
  });
  it.each(['cycle', 'missing', 'duplicate', 'error', 'noResult', 'version', 'empty'] as const)('fails closed for %s', kind => {
    const before = record('before', [block(), consumer()]), after = record('after', [block(), consumer()]);
    if (kind === 'cycle') after.blocks[0].inputs = [{ kind: 'variable', name: 'x', sourceBlockId: 'B', value: '150' }];
    if (kind === 'missing') after.blocks[1].inputs[0].sourceBlockId = 'missing';
    if (kind === 'duplicate') after.blocks[1].blockId = 'A';
    if (kind === 'error') Object.assign(after.blocks[1], { status: 'error' });
    if (kind === 'noResult') Object.assign(after.blocks[1], { result: null });
    if (kind === 'version') Object.assign(after, { evaluator: 'future-v2' });
    if (kind === 'empty') after.blocks = [];
    expect(() => analyzeEvidenceImpact({ before, after } as ReturnType<typeof compareEvidenceRecords>)).toThrow('比較不可');
  });
  it('ignores forged comparison rows and recomputes only the validated structural comparison', () => {
    const comparison = compareEvidenceRecords(record('before', [block()]), record('after', [{ ...block(), expression: '50+50' }]));
    expect(analyzeEvidenceImpact({ ...comparison, rows: [] }).counts.direct).toBe(1);
  });
  it('retains unknown-field warnings without mutating or filling from current state', () => {
    const old = record('before', [block()]), next = record('after', [block()]);
    Object.assign(next.blocks[0], { future: { note: 'untouched' } });
    const original = JSON.stringify([old, next]);
    const value = analyzeEvidenceImpact(compareEvidenceRecords(old, next));
    expect(value.warnings.join()).toContain('未知');
    expect(JSON.stringify([old, next])).toBe(original);
  });
  it('handles arbitrary IDs without prototype collisions', () => {
    const a = block('__proto__'), b = consumer('constructor', 2, '__proto__'); b.inputs[0].value = '99';
    const value = analyze([a, b], [a, b]);
    expect(row(value, 'constructor').unknown.length).toBeGreaterThan(0);
  });
  it('does not impose the current-memo 128-node limit on valid stored records', () => {
    const blocks = Array.from({ length: 1500 }, (_, index) => block(`N${index}`, index + 1));
    const value = analyze(blocks, blocks);
    expect(value.complete).toBe(true); expect(value.counts.unchanged).toBe(1500);
  });
  it('bounds dense paths explicitly instead of exponential enumeration or false unchanged', () => {
    const old: EvidenceBlock[] = [], next: EvidenceBlock[] = [];
    for (let i = 0; i < 180; i++) {
      const b = i ? consumer(`N${i}`, i + 1, `N${i - 1}`, '100', '100') : block('N0');
      old.push(b); next.push({ ...b, expression: `${b.expression}+0` });
    }
    const value = analyze(old, next);
    expect(value.complete).toBe(false); expect(value.warnings.join()).toContain('処理上限');
    expect(value.counts.unknown).toBe(180); expect(value.counts.unchanged).toBe(0);
    expect(value.rows.flatMap(item => item.afterPaths).reduce((sum, path) => sum + path.blockIds.length, 0)).toBeLessThanOrEqual(IMPACT_LIMITS.pathNodes);
  });
  it('produces deterministic representative paths in a diamond', () => {
    const c = consumer('C', 3), d = { ...consumer('D', 4, 'B', '150'), references: { version: 1 as const, entries: [{ slot: 1, blockId: 'B' }, { slot: 2, blockId: 'C' }] }, inputs: [{ kind: 'id' as const, name: 'ReferenceValue1', sourceBlockId: 'B', value: '150' }, { kind: 'id' as const, name: 'ReferenceValue2', sourceBlockId: 'C', value: '150' }] };
    const value = analyze([block(), consumer(), c, d], [{ ...block(), expression: '50+50' }, consumer(), c, d]);
    expect(row(value, 'D').afterPaths).toEqual([{ rootId: 'A', blockIds: ['A', 'B', 'D'] }]);
    expect(value.complete).toBe(true);
  });
});
