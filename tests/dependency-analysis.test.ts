import { describe, expect, it, vi } from 'vitest';
import * as calculator from '../lib/calculator';
import { analyzeDependencyImpact, analyzeMemoDependencies } from '../lib/dependency-analysis';
import { recalculateReferenceMemo, staleBlockIds } from '../lib/block-references';
import { defaultData, loadData, saveData } from '../lib/storage';
import type { CalculationMemoBlock, MemoBlock, StoredData } from '../lib/types';
const block = (id: string, expression: string, evaluationMode?: string): CalculationMemoBlock => ({ id, type: 'calculation', expression, displayExpression: expression, result: null, resultText: '', error: null, ...(evaluationMode ? { evaluationMode } : {}) });
const variable = (id: string, expression: string) => block(id, expression, 'note-variables');
const ref = (id: string, expression: string, ids: string[]): CalculationMemoBlock => ({ ...block(id, expression, 'block-references'), references: { version: 1, entries: ids.map((blockId, i) => ({ slot: i + 1, blockId })) } });
const links = (blocks: MemoBlock[]) => analyzeMemoDependencies(blocks).edges.map(e => `${e.source}->${e.target}`).sort();
const change = (blocks: MemoBlock[], id: string, patch: Partial<CalculationMemoBlock>) => blocks.map(b => b.id === id ? { ...b, ...patch } as MemoBlock : b);
const freeze = (value: unknown) => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } };

describe('read-only dependency analysis', () => {
  it('directs actual ID dependencies source to consumer, independently of order', () => {
    const a = block('a', 'sqrt(2)'), b = ref('b', '@{1} + @{1}', ['a']);
    expect(links([b, a])).toEqual(['a->b']);
    expect(links([a, b])).toEqual(['a->b']);
  });
  it('tracks multi-source, multi-stage, fork/join without disconnected nodes', () => {
    const input = [block('a', '2'), block('b', '3'), ref('c', '@{1}+@{2}', ['a', 'b']), ref('d', '@{1}*2', ['c']), ref('e', '@{1}*3', ['c']), ref('f', '@{1}+@{2}', ['d', 'e']), block('unrelated', '9')];
    expect(links(input)).toEqual(['a->c', 'b->c', 'c->d', 'c->e', 'd->f', 'e->f']);
    expect(analyzeDependencyImpact(input, change(input, 'a', { expression: '4' })).affectedIds).toEqual(['a', 'c', 'd', 'e', 'f']);
  });
  it('retains prior candidates after possibly failing reassignment without trusting saved errors/values', () => {
    const input = [variable('a', 'x=2'), { ...variable('r', 'x=1/0'), result: 12, error: null }, variable('c', 'x+1')];
    const graph = analyzeMemoDependencies(input);
    expect(graph.edges).toEqual(expect.arrayContaining([
      { source: 'a', target: 'c', kind: 'variable', certainty: 'uncertain', variable: 'x' },
      { source: 'r', target: 'c', kind: 'variable', certainty: 'uncertain', variable: 'x' },
    ]));
    expect(graph.nodes[2].bindings).toEqual([{ variable: 'x', candidates: ['a', 'r'], possiblyUndefined: true }]);
    expect(graph.nodes[1].assignment?.previousCandidates).toEqual(['a']);
    expect(graph.nodes[2].diagnostics.some(d => d.code === 'undefined-variable')).toBe(false);
  });
  it('resolves reads before writes, never binds forwards or self-links assignment', () => {
    const input = [variable('first', 'x'), variable('a', 'x=2'), variable('r', 'x=x+1'), variable('c', 'x')];
    expect(links(input)).toEqual(['a->c', 'a->r', 'r->c']);
    expect(analyzeMemoDependencies(input).nodes[0].diagnostics[0].code).toBe('undefined-variable');
  });
  it('invalid/definitely-unbound assignments cannot bind or remove the previous scope', () => {
    const input = [variable('a', 'x=2'), variable('r', 'x=missing'), variable('bad', 'x=sin(2)'), variable('c', 'x')];
    expect(links(input)).toEqual(['a->c']);
    const graph = analyzeMemoDependencies(input);
    expect(graph.nodes[1].assignment?.maySucceed).toBe(false);
    expect(graph.nodes[2].diagnostics[0].code).toBe('invalid-expression');
    expect(links([variable('a', 'x=missing'), variable('c', 'x')])).toEqual([]);
  });
  it('combines ID edges and legacy variables, excluding text, functions, constants and library-like names', () => {
    const input: MemoBlock[] = [variable('a', 'price=2'), variable('b', 'subtotal=price*sqrt(4)+pi+e'), ref('c', '@{1}', ['b']), { id: 'text', type: 'text', content: 'other=2' }];
    expect(links(input)).toEqual(['a->b', 'b->c']);
    expect(analyzeMemoDependencies(input).nodes).toHaveLength(3);
  });
  it('keeps valid slots alongside missing targets and ignores unused mappings', () => {
    const input = [block('a', '2'), ref('b', '@{1}+@{2}', ['a', 'gone', 'unused'])];
    expect(links(input)).toEqual(['a->b']);
    expect(analyzeMemoDependencies(input).nodes[1].diagnostics).toEqual([expect.objectContaining({ code: 'missing-reference', relatedIds: ['gone'] })]);
    expect(links([ref('bad', '@{1}+ReferenceValue2', ['a']), block('a', '2')])).toEqual([]);
  });
  it('reports actual cycles, self-reference and cycle descendants separately', () => {
    const graph = analyzeMemoDependencies([ref('a', '@{1}', ['b']), ref('b', '@{1}', ['a']), ref('c', '@{1}', ['b']), ref('self', '@{1}', ['self'])]);
    expect(graph.nodes.map(n => [n.id, n.diagnostics[0].code])).toEqual([['a', 'cycle'], ['b', 'cycle'], ['c', 'cycle-dependent'], ['self', 'self-reference']]);
  });
  it('rejects unsupported/invalid structures explicitly rather than guessing an assignment', () => {
    const graph = analyzeMemoDependencies([variable('a', 'x=2'), block('b', 'x=5', 'future'), variable('c', 'x')]);
    expect(graph.complete).toBe(false); expect(graph.unresolvedIds).toEqual(['b']);
    expect(graph.edges.map(e => e.source)).toEqual(['a']);
    expect(analyzeMemoDependencies([block('a', '2'), block('a', '3')])).toMatchObject({ complete: false, nodes: [], unresolvedIds: ['a'] });
    expect(analyzeMemoDependencies(Array.from({ length: 129 }, (_, i) => block(String(i), '1'))).diagnostics[0].code).toBe('limit');
    const invalid = { ...ref('bad', '@{1}', ['a']), references: { version: 9, entries: [] } } as unknown as CalculationMemoBlock;
    expect(analyzeMemoDependencies([invalid]).complete).toBe(false);
    const malformed = { ...invalid, references: { version: 1, entries: 'broken' }, evaluationState: { version: 1, status: 'current', signature: 'old' } } as unknown as CalculationMemoBlock;
    expect(analyzeMemoDependencies([malformed]).complete).toBe(false);
    expect(analyzeDependencyImpact([malformed], [malformed]).affectedIds).toEqual([]);
  });
  it.each([undefined, null, {}, [null], [{}]])('handles malformed entries with current signatures: %j', entries => {
    const a = block('a', '2');
    const bad = { ...ref('bad', '@{1}', ['a']), references: { version: 1, entries }, evaluationState: { version: 1, status: 'current', signature: 'untrusted' } } as unknown as CalculationMemoBlock;
    const before = JSON.stringify(bad); freeze(bad);
    expect(analyzeMemoDependencies([a, bad])).toMatchObject({ complete: false, unresolvedIds: ['bad'] });
    expect(analyzeDependencyImpact([a, bad], [{ ...a, expression: '3' }, bad]).affectedIds).toEqual(['a', 'bad']);
    expect(analyzeDependencyImpact([a, bad], [a, ref('bad', '@{1}', ['a'])]).changedIds).toEqual(['bad']);
    expect(JSON.stringify(bad)).toBe(before);
  });
  it('uses legacy calculator grammar (x multiplication) without numerical evaluation', () => {
    expect(analyzeMemoDependencies([block('a', '2x3')]).diagnostics).toEqual([]);
    expect(analyzeMemoDependencies([variable('a', '2x3')]).diagnostics[0].code).toBe('invalid-expression');
    expect(analyzeMemoDependencies([block('a', '1/0'), block('b', 'sqrt(-1)'), variable('c', 'x=2^10001')]).diagnostics).toEqual([]);
  });
  it('never evaluates or mutates, even with stale metadata, numerical failures and invalid AST', () => {
    const input = [variable('a', 'x=1/0'), ref('b', '@{1}', ['a']), variable('bad', 'x=foo(1)')];
    const raw = JSON.stringify(input); freeze(input);
    const legacySpy = vi.spyOn(calculator, 'calculateExpression');
    const variableSpy = vi.spyOn(calculator, 'calculateVariableExpression');
    analyzeMemoDependencies(input); analyzeDependencyImpact(input, input);
    expect(legacySpy).not.toHaveBeenCalled(); expect(variableSpy).not.toHaveBeenCalled();
    expect(JSON.stringify(input)).toBe(raw); vi.restoreAllMocks();
  });
});

describe('change impact and compatibility', () => {
  const input = [block('a', '2'), block('b', '3'), ref('c', '@{1}', ['a']), ref('d', '@{1}', ['c'])];
  it.each([{ expression: '4' }, { result: 1 / 3 }])('includes source and transitive closure for value/expression edits %j', patch => {
    const impact = analyzeDependencyImpact(input, change(input, 'a', patch));
    expect(impact.changedIds).toEqual(['a']); expect(impact.affectedIds).toEqual(['a', 'c', 'd']);
  });
  it('uses old and new edges for deletion and reference replacement', () => {
    expect(analyzeDependencyImpact(input, input.filter(b => b.id !== 'a')).affectedIds).toEqual(['a', 'c', 'd']);
    const next = change(input, 'c', { references: { version: 1, entries: [{ slot: 1, blockId: 'b' }] } });
    expect(analyzeDependencyImpact(input, next).affectedIds).toEqual(['c', 'd']);
  });
  it('addition, deletion, rename and reorder detect changed binding, including formerly undefined reads', () => {
    const a = variable('a', 'x=2'), b = variable('b', 'x=3'), c = variable('c', 'x'), other = block('other', '99');
    expect(analyzeDependencyImpact([c, other], [a, c, other]).affectedIds).toEqual(['a', 'c']);
    expect(analyzeDependencyImpact([a, c, other], [c, other]).affectedIds).toEqual(['a', 'c']);
    expect(analyzeDependencyImpact([a, b, c, other], [b, a, c, other]).bindingChangedIds).toEqual(['c']);
    expect(analyzeDependencyImpact([a, c, other], [c, a, other]).affectedIds).toEqual(['c']);
    expect(analyzeDependencyImpact([a, c, other], [variable('a', 'y=2'), c, other]).affectedIds).toEqual(['a', 'c']);
  });
  it('does not turn unrelated insertion, text edit or ID-only reorder into global impact', () => {
    expect(analyzeDependencyImpact(input, [block('new', '7'), ...input]).affectedIds).toEqual(['new']);
    const reordered = analyzeDependencyImpact(input, [...input].reverse());
    expect(reordered.reorderedIds).toEqual(['a', 'b', 'c', 'd']); expect(reordered.affectedIds).toEqual([]);
    expect(analyzeDependencyImpact([...input, { id: 'text', type: 'text', content: 'x' }], [...input, { id: 'text', type: 'text', content: 'y' }]).affectedIds).toEqual([]);
  });
  it('ignores opaque metadata, unused slots and entry order in impact', () => {
    const source = block('a', '2'), target = ref('b', '@{1}', ['a', 'unused']);
    const extra = { ...target, references: { ...target.references!, proof: 'opaque', entries: [...target.references!.entries].reverse().map(e => e.slot === 2 ? { ...e, blockId: 'other' } : e) } };
    expect(analyzeDependencyImpact([source, target], [source, extra]).affectedIds).toEqual([]);
  });
  it.each(['unused-slot', 'state'])('includes invalid→valid structural repair and descendants: %s', kind => {
    const a = block('a', '2'), good = ref('b', '@{1}', ['a']), c = ref('c', '@{1}', ['b']);
    const bad = (kind === 'unused-slot'
      ? { ...good, references: { version: 1, entries: [...good.references!.entries, { slot: 0, blockId: 'unused' }] } }
      : { ...good, evaluationState: { version: 9, status: 'current' } }) as unknown as CalculationMemoBlock;
    const impact = analyzeDependencyImpact([a, bad, c], [a, good, c]);
    expect(impact.changedIds).toEqual(['b']); expect(impact.affectedIds).toEqual(['b', 'c']);
  });
  it('labels saved errors as historical observations, not recomputation or binding proof', () => {
    const failed = { ...variable('a', 'x=1/0'), error: '0では割れません' };
    const graph = analyzeMemoDependencies([failed, variable('b', 'x')]);
    expect(graph.nodes[0].diagnostics[0]).toMatchObject({ code: 'saved-error', severity: 'error' });
    expect(graph.nodes[1].bindings[0].candidates).toEqual(['a']);
    expect(graph.nodes[1].diagnostics[0].severity).toBe('uncertain');
  });
  it('propagates uncertainty transitively and exposes the limited unknown-analysis fallback', () => {
    const a = variable('a', 'x=2'), b = variable('b', 'x'), c = ref('c', '@{1}', ['b']), other = block('other', '3');
    const impact = analyzeDependencyImpact([a,b,c,other], [{...a, expression:'x=4'},b,c,other]);
    expect(impact.affectedIds).toEqual(['a', 'b', 'c']); expect(impact.uncertainIds).toEqual(['b', 'c']);
    const unknown = block('unknown', 'future', 'future');
    const incomplete = analyzeDependencyImpact([a, unknown, other], [{...a, expression:'x=4'}, unknown, other]);
    expect(incomplete.affectedIds).toEqual(['a', 'unknown']); expect(incomplete.reasons.unknown).toContain('analysis-incomplete');
  });
  it('does not change serialized input, unknown metadata, JSON roundtrip or storage schema', () => {
    const blocks = [{ ...block('a', '2'), provenance: { proof: 'opaque' } }, ref('b', '@{1}', ['a'])];
    const data: StoredData = { ...structuredClone(defaultData), notes: [{ id:'memo', type:'plain-calculation', title:'Synthetic', content:'', blocks, createdAt:'', updatedAt:'' }] };
    let raw = JSON.stringify(data); const original = raw;
    const storage = { getItem: () => raw, setItem: (_: string, value: string) => { raw = value; } };
    const loaded = loadData(storage); expect(loaded.status).toBe('ok');
    if (loaded.status !== 'ok') throw Error('load failed');
    analyzeMemoDependencies(blocks); analyzeDependencyImpact(blocks, JSON.parse(JSON.stringify(blocks)));
    saveData(loaded.data, storage); expect(JSON.parse(raw)).toEqual(JSON.parse(original));
    expect(raw).not.toContain('dependency');
  });
  it('preserves raw precision, conservative stale state, manual failure priority and atomic rollback', () => {
    const base = recalculateReferenceMemo([variable('a', 'x=sqrt(2)'), variable('b', 'x*x'), ref('c', '@{1}', ['b'])]);
    expect(base.success).toBe(true); const original = JSON.stringify(base.blocks);
    analyzeMemoDependencies(base.blocks);
    expect(JSON.stringify(base.blocks)).toBe(original); expect(staleBlockIds(base.blocks).size).toBe(0);
    expect((base.blocks[0] as CalculationMemoBlock).result).toBe(Math.sqrt(2));
    const bad = change(base.blocks, 'a', { expression:'x=1/0' });
    analyzeDependencyImpact(base.blocks, bad);
    const failed = recalculateReferenceMemo(bad);
    expect(failed.success).toBe(false); expect(failed.evaluated).toEqual(['a', 'b']);
    expect((failed.blocks[0] as CalculationMemoBlock).evaluationState?.attemptError).toContain('0では割れません');
    expect(failed.blocks.map(b => (b as CalculationMemoBlock).result)).toEqual(base.blocks.map(b => (b as CalculationMemoBlock).result));
  });
});
