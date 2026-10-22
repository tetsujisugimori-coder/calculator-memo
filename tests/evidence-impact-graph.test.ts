import { describe, expect, it } from 'vitest';
import type { EvidenceBlock, EvidenceRecord } from '../lib/calculation-evidence';
import { compareEvidenceRecords } from '../lib/evidence-comparison';
import { analyzeEvidenceImpact, type EvidenceImpact } from '../lib/evidence-impact';
import { buildEvidenceImpactGraph, impactLabels } from '../lib/evidence-impact-graph';
import { mermaidBlockId } from '../lib/dependency-mermaid';

const block = (blockId = 'A', position = 1, result = '100'): EvidenceBlock => ({ blockId, position, expression: result, inputs: [], result, resultText: result, status: 'success' });
const record = (id: string, blocks: EvidenceBlock[]): EvidenceRecord => ({ id, blocks, calculatedAt: '2026-10-22T01:00:00.000Z', persistedAt: '2026-10-22T01:01:00.000Z', evaluator: 'calculator-memo-v1', status: 'confirmed' });
const consumer = (id = 'B', position = 2, source = 'A', value = '100', result = '150'): EvidenceBlock => ({ ...block(id, position, result), expression: '@{1}+50', evaluationMode: 'block-references', references: { version: 1, entries: [{ slot: 1, blockId: source }] }, inputs: [{ kind: 'id', name: 'ReferenceValue1', sourceBlockId: source, value }] });
const analyze = (before: EvidenceBlock[], after: EvidenceBlock[]) => analyzeEvidenceImpact(compareEvidenceRecords(record('before', before), record('after', after)));
const chain = () => analyze([block(), consumer(), consumer('C', 3, 'B', '150', '300')], [block('A', 1, '120'), consumer('B', 2, 'A', '120', '170'), consumer('C', 3, 'B', '170', '340')]);
const draw = (impact: EvidenceImpact, selectedId = 'C', rootId = 'A', mode: 'all' | 'path' = 'all', side: 'before' | 'after' = 'after') => buildEvidenceImpactGraph(impact, side, selectedId, rootId, mode);

describe('saved impact graph presentation only', () => {
  it('uses exact A and B representative paths and side-specific used values', () => {
    const impact = chain(), a = draw(impact), b = draw(impact, 'C', 'B', 'path');
    expect(a.path).toBe(impact.rows.find(row => row.blockId === 'C')!.afterPaths[0]);
    expect(a.path!.blockIds).toEqual(['A', 'B', 'C']);
    expect(b.nodeIds).toEqual(['B', 'C']);
    expect(b.graph.edges.map(edge => [edge.source, edge.target, 'value' in edge ? edge.value : null])).toEqual([['B', 'C', '170']]);
    expect(draw(impact, 'C', 'B', 'path', 'before').graph.edges[0]).toMatchObject({ value: '150' });
    expect(a.mermaid).toContain(`${mermaidBlockId('A')} ==>|`);
    expect(a.mermaid).not.toContain('＋追加');
  });
  it('keeps independent simultaneous labels rather than one exclusive category', () => {
    const row = chain().rows.find(row => row.blockId === 'B')!;
    expect(impactLabels(row)).toEqual(['直接変更', '波及変更候補', '結果差分']);
  });
  it('does not synthesize a root from result-only or order-only changes', () => {
    const impact = analyze([block(), block('X', 2)], [{ ...block(), result: '-0', resultText: '100', position: 2 }, { ...block('X', 1) }]);
    expect(draw(impact, 'A', '', 'path').path).toBeUndefined();
    expect(draw(impact, 'A', '', 'path').message).toContain('完全な分析');
    expect(impactLabels(impact.rows.find(row => row.blockId === 'A')!)).toEqual(['結果差分', '順序差分']);
  });
  it('does not merge before/after edges and reports absent selected roots', () => {
    const impact = analyze([block(), block('X', 2), consumer('C', 3)], [{ ...block(), expression: '50+50' }, block('X', 2), consumer('C', 3, 'X')]);
    expect(draw(impact, 'C', 'A', 'path', 'before').nodeIds).toEqual(['A', 'C']);
    expect(draw(impact, 'C', 'A', 'path').nodeIds).toEqual([]);
    expect(draw(impact, 'C', 'A', 'path').message).toContain('この記録にありません');
    expect(draw(impact).graph.edges.map(edge => edge.source)).toEqual(['X']);
  });
  it('does not replace a block absent on one side', () => {
    const impact = analyze([block(), consumer()], [block('X')]);
    const view = draw(impact, 'B', 'A', 'path');
    expect(view.nodeIds).toEqual([]); expect(view.message).toContain('ブロックはこの記録に存在しません');
  });
  it('keeps multiple actual inputs for a shared pair without selecting a single cause', () => {
    const b = consumer(); b.references!.entries.push({ slot: 2, blockId: 'A' }); b.inputs.push({ ...b.inputs[0], name: 'ReferenceValue2' });
    const impact = analyze([block(), b], [{ ...block(), expression: '50+50' }, b]);
    const view = draw(impact, 'B', 'A', 'path');
    expect(view.graph.edges).toHaveLength(2); expect(view.edgeCount).toBe(2);
    expect(view.graph.edges.map(edge => edge.variable)).toEqual(['ReferenceValue1', 'ReferenceValue2']);
    expect(view.highlightedPairs).toEqual([{ source: 'A', target: 'B' }]);
    expect(view.mermaid.match(/==>/g)).toHaveLength(1);
  });
  it('path filter includes only consecutive pairs, not chords or alternative branches', () => {
    const b = consumer(), c = consumer('C', 3, 'B', '150', '300');
    c.references!.entries.push({ slot: 2, blockId: 'A' }); c.inputs.push({ kind: 'id', name: 'ReferenceValue2', sourceBlockId: 'A', value: '100' });
    const impact = analyze([block(), b, c], [{ ...block(), expression: '50+50' }, b, c]);
    const view = draw(impact, 'C', 'A', 'path');
    expect(view.path!.blockIds).toEqual(['A', 'C']);
    expect(view.nodeIds).toEqual(['A', 'C']); expect(view.graph.edges).toHaveLength(1);
    expect(view.graph.edges[0]).toMatchObject({ source: 'A', target: 'C', variable: 'ReferenceValue2' });
  });
  it('uses recorded legacy binding, never unused reassignment candidates', () => {
    const a = { ...block(), evaluationMode: 'note-variables', expression: 'x=100' };
    const b = { ...block('B', 2), evaluationMode: 'note-variables', expression: 'x=100' };
    const c = { ...block('C', 3), evaluationMode: 'note-variables', expression: 'x+50', inputs: [{ kind: 'variable' as const, name: 'x', sourceBlockId: 'B', value: '100' }] };
    const impact = analyze([a, b, c], [{ ...a, expression: 'x=50+50' }, b, c]);
    expect(draw(impact).graph.edges.map(edge => [edge.source, edge.target])).toEqual([['B', 'C']]);
    expect(draw(impact).path).toBeUndefined();
  });
  it('keeps inconsistent and downstream edges uncertain without highlighting', () => {
    const bad = consumer(); bad.inputs[0].value = '99';
    const impact = analyze([block(), consumer(), consumer('C', 3, 'B', '150', '300')], [{ ...block(), expression: '50+50' }, bad, consumer('C', 3, 'B', '150', '300')]);
    const view = draw(impact);
    expect(view.path).toBeUndefined(); expect(view.highlightedPairs).toEqual([]);
    expect(view.graph.edges.every(edge => edge.certainty === 'uncertain')).toBe(true);
    expect(view.message).toContain('判定不能'); expect(view.mermaid).not.toContain('==>');
  });
  it('does not trust an inconsistent path even if supplied erroneously', () => {
    const impact = chain(); impact.after.edges[0].valid = false;
    expect(draw(impact).path).toBeUndefined(); expect(draw(impact).message).toContain('根拠として表示できません');
  });
  it('separates rendering limits from valid analysis and permits a small selected path', () => {
    const before = [block(), consumer(), consumer('C', 3, 'B', '150', '300'), ...Array.from({ length: 130 }, (_, index) => block(`X${index}`, index + 4))];
    const after = structuredClone(before); after[0].expression = '50+50';
    const impact = analyze(before, after), full = draw(impact), path = draw(impact, 'C', 'A', 'path');
    expect(impact.complete).toBe(true); expect(full.limit).toContain('保存記録は不正ではありません');
    expect(full.totalNodeCount).toBe(133); expect(path.limit).toBeNull(); expect(path.nodeCount).toBe(3); expect(path.totalNodeCount).toBe(133);
  });
  it('marks bounded analysis incomplete but keeps its already reported valid paths', () => {
    const impact = chain(); impact.after.complete = false;
    impact.after.graph.nodes.forEach(node => node.diagnostics.push({ code: 'saved-impact-limit', severity: 'uncertain', message: 'limit', blockId: node.id }));
    const view = draw(impact); expect(view.analysisComplete).toBe(false); expect(view.path!.blockIds).toEqual(['A', 'B', 'C']);
    expect(draw(impact, 'C', 'missing').message).toContain('判定不能');
  });
  it('preserves internal values including signed zero without numeric coercion', () => {
    const a = block('A', 1, '-0'), b = consumer('B', 2, 'A', '-0', '0');
    const impact = analyze([a, b], [{ ...a, expression: '-(0)' }, b]);
    expect(draw(impact, 'B', 'A').graph.edges[0]).toMatchObject({ value: '-0' });
  });
  it('encodes hostile IDs and expressions without inserting Mermaid grammar', () => {
    const id = 'A\n"<script>```'; const a = { ...block(id), expression: '<img src=x>\n```' };
    const impact = analyze([a], [{ ...a, expression: 'changed\n"' }]); const view = draw(impact, id, '');
    expect(view.nodeIds).toEqual([id]); expect(view.mermaid).not.toContain('<img'); expect(view.mermaid).not.toContain('<script>');
  });
  it('rejects invalid empty records and presents an empty path selection without fabrication', () => {
    expect(() => analyze([], [])).toThrow('比較不可');
    const view = draw(chain(), '', '', 'path'); expect(view.nodeCount).toBe(0); expect(view.edgeCount).toBe(0); expect(view.limit).toBeNull();
  });
  it('does not mutate the impact model or captured inputs in any view', () => {
    const impact = chain(), before = JSON.stringify(impact);
    for (const side of ['before', 'after'] as const) for (const mode of ['all', 'path'] as const) buildEvidenceImpactGraph(impact, side, 'C', 'A', mode);
    expect(JSON.stringify(impact)).toBe(before);
  });
  it('keeps unchanged and equal-result direct changes distinct', () => {
    const impact = analyze([block(), block('X', 2)], [{ ...block(), expression: '50+50' }, block('X', 2)]);
    const view = draw(impact, 'A', '');
    expect(view.labels.get('A')).toEqual(['直接変更']);
    expect(view.labels.get('X')).toEqual(['変更なし（既知項目）']);
  });
  it('enforces the input-edge drawing cap independently of coalesced SVG lines', () => {
    const sources = Array.from({ length: 24 }, (_, index) => block(`N${index}`, index + 1));
    const consumers = sources.map((source, index) => ({ ...source, evaluationMode: 'block-references',
      references: { version: 1 as const, entries: sources.slice(0, index).map((item, slot) => ({ slot: slot + 1, blockId: item.blockId })) },
      inputs: sources.slice(0, index).map((item, slot) => ({ kind: 'id' as const, name: `ReferenceValue${slot + 1}`, sourceBlockId: item.blockId, value: '100' })) }));
    const impact = analyze(consumers, structuredClone(consumers));
    expect(draw(impact).edgeCount).toBe(276); expect(draw(impact).limit).toContain('256入力辺');
    expect(impact.complete).toBe(true);
  });
  it('enforces the drawing text cap without changing captured long expressions', () => {
    const values = Array.from({ length: 70 }, (_, index) => ({ ...block(`N${index}`, index + 1), expression: 'a'.repeat(1000) }));
    const impact = analyze(values, structuredClone(values));
    const view = draw(impact, 'A', '');
    expect(view.limit).toContain('250000文字');
    expect(impact.before.graph.nodes[0].expression).toBe(values[0].expression);
  });
  it('retains precise round-equal values in the actual input edges', () => {
    const a = { ...block(), result: '0.33333333333333337', resultText: '0.33' };
    const b = consumer('B', 2, 'A', a.result, '1');
    const impact = analyze([a, b], [{ ...a, expression: 'changed' }, b]);
    expect(draw(impact, 'B', 'A').graph.edges[0]).toMatchObject({ value: a.result });
  });

});
