// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from 'vitest';
import mermaid from 'mermaid';
import type { DependencyGraph } from '../lib/dependency-analysis';
import { mermaidBlockId, toMermaid } from '../lib/dependency-mermaid';

const node = (id: string, expression = id): DependencyGraph['nodes'][number] => ({ id, expression, pending: false, diagnostics: [], bindings: [] });
const edge = (source: string, target: string, certainty: 'definite' | 'uncertain' = 'definite'): DependencyGraph['edges'][number] => ({ source, target, kind: 'reference', certainty });
const graph = (nodes: DependencyGraph['nodes'], edges: DependencyGraph['edges'] = []): DependencyGraph => ({ nodes, edges, diagnostics: [], complete: true, unresolvedIds: [] });
const encoded = (value: string) => Array.from(value, char => `#${char.codePointAt(0)};`).join('');

beforeAll(() => mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', flowchart: { htmlLabels: false } }));

describe('dependency Mermaid export', () => {
  it('parses directed multi-source, multistage, fork and join edges in Mermaid itself', async () => {
    const input = graph(['a', 'b', 'c', 'd', 'e'].map(id => node(id)), [edge('a', 'c'), edge('b', 'c'), edge('c', 'd'), edge('c', 'e'), edge('d', 'e')]);
    const result = toMermaid(input);
    expect(await mermaid.parse(result)).toMatchObject({ diagramType: 'flowchart-v2' });
    expect(result).toContain(`${mermaidBlockId('a')} -->`);
    expect(result.match(/ -->/g)).toHaveLength(5);
  });

  it('keeps block identity distinct from labels, ordering, and duplicate expressions', async () => {
    const input = graph([node('same-1', '同じ式'), node('same-2', '同じ式'), node('日本語😀', '同じ式')]);
    const output = toMermaid(input);
    expect(toMermaid({ ...input, nodes: [...input.nodes].reverse() })).toBe(output);
    expect(new Set(input.nodes.map(n => mermaidBlockId(n.id))).size).toBe(3);
    expect(mermaidBlockId('😀')).not.toBe(mermaidBlockId('\ud83d'));
    expect(mermaidBlockId('a-b')).not.toBe(mermaidBlockId('a_b'));
    expect(await mermaid.parse(output)).toBeTruthy();
  });

  it('escapes Japanese, quotes, arrows, brackets, HTML, newlines and Mermaid directives as label data', async () => {
    const text = '日本語 " ] --> injected[攻撃]\n%%{init: {securityLevel:"loose"}}%%\n<script>alert(1)</script> & # 😀';
    const input = graph([node('end"\n --> malicious', text), node('b', 'safe')], [edge('end"\n --> malicious', 'b')]);
    const output = toMermaid(input);
    expect(output).toContain(encoded(text));
    expect(output).not.toContain('injected[');
    expect(output).not.toContain('%%{init:');
    expect(output).not.toContain('<script>');
    const parsed = await mermaid.mermaidAPI.getDiagramFromText(output);
    const db = parsed.db as { getVertices: () => Map<string, unknown>; getEdges: () => unknown[] };
    expect([...db.getVertices().keys()].sort()).toEqual(input.nodes.map(n => mermaidBlockId(n.id)).sort());
    expect(db.getEdges()).toHaveLength(1);
  });

  it('deduplicates edges with stable order and keeps potential paths dashed', async () => {
    const a = edge('a', 'b');
    const b = { ...edge('a', 'b', 'uncertain'), kind: 'variable' as const, variable: 'x' };
    const c = { ...b, variable: 'y' };
    const input = graph([node('b'), node('a')], [a, b, a, c, b]);
    const output = toMermaid(input);
    expect(output.match(/ -->/g)).toHaveLength(1);
    expect(output.match(/ -\.->/g)).toHaveLength(1);
    expect(output).toContain(encoded('変数 x / 変数 y（不確定）'));
    expect(toMermaid({ ...input, edges: [...input.edges].reverse() })).toBe(output);
    expect(await mermaid.parse(output)).toBeTruthy();
  });

  it('retains all applicable changed, affected, pending, error and uncertain text states', async () => {
    const a = { ...node('a'), pending: true, diagnostics: [{ code: 'test', severity: 'error' as const, message: 'エラー' }, { code: 'test2', severity: 'uncertain' as const, message: '不確定' }] };
    const input = graph([a, node('b')]);
    const output = toMermaid(input, { changedIds: new Set(['a']), affectedIds: new Set(['a']) });
    for (const state of ['変更元', '影響候補', '再計算待ち', '解析エラー', '依存不確定', '通常']) expect(output).toContain(encoded(state));
    expect(output).toContain(`class ${mermaidBlockId('a')} changed,affected,pending,error,uncertain;`);
    expect(await mermaid.parse(output)).toBeTruthy();
  });

  it('distinguishes saved calculation errors from static analysis errors', async () => {
    const saved = { ...node('saved', '1 / 0'), diagnostics: [{ code: 'saved-error', severity: 'error' as const, message: '保存済みのゼロ除算' }] };
    const invalid = { ...node('invalid', '1 +'), diagnostics: [{ code: 'invalid-expression', severity: 'error' as const, message: '式が未完成です' }] };
    const both = { ...node('both', '1 +'), diagnostics: [...saved.diagnostics, ...invalid.diagnostics] };
    const output = toMermaid(graph([saved, invalid, both]));
    const lines = output.split('\n');
    const labelFor = (id: string) => lines.find(line => line.startsWith(`  ${mermaidBlockId(id)}[`))!;
    expect(labelFor('saved')).toContain(encoded('保存済みエラー'));
    expect(labelFor('saved')).not.toContain(encoded('解析エラー'));
    expect(labelFor('invalid')).toContain(encoded('解析エラー'));
    expect(labelFor('invalid')).not.toContain(encoded('保存済みエラー'));
    expect(labelFor('both')).toContain(encoded('保存済みエラー・解析エラー'));
    expect(output).toContain(`class ${mermaidBlockId('both')} error;`);
    expect(output).not.toContain('error,error');
    expect(await mermaid.parse(output)).toBeTruthy();
  });

  it('parses cycles, self references, empty graphs, global analysis errors and absent endpoints', async () => {
    const input = graph([node('a'), node('b')], [edge('a', 'a'), edge('a', 'b'), edge('b', 'a'), edge('deleted', 'a')]);
    input.diagnostics.push({ code: 'limit', severity: 'error', message: '解析上限\n%%{init: invalid}%%' });
    const output = toMermaid(input);
    expect(output.match(/ -->/g)).toHaveLength(3);
    expect(output).not.toContain(mermaidBlockId('deleted'));
    expect(await mermaid.parse(output)).toBeTruthy();
    expect(await mermaid.parse(toMermaid(graph([])))).toBeTruthy();
  });

  it('never changes inputs, including frozen diagnostics, edges, nodes and option sets', () => {
    const input = graph([node('a'), node('b')], [edge('a', 'b')]);
    const before = JSON.stringify(input);
    input.nodes.forEach(n => { Object.freeze(n.diagnostics); Object.freeze(n); });
    input.edges.forEach(Object.freeze);
    Object.freeze(input.nodes); Object.freeze(input.edges); Object.freeze(input.diagnostics); Object.freeze(input);
    const changedIds = new Set(['a']);
    const affectedIds = new Set(['b']);
    toMermaid(input, { changedIds, affectedIds });
    expect(JSON.stringify(input)).toBe(before);
    expect([...changedIds]).toEqual(['a']);
    expect([...affectedIds]).toEqual(['b']);
  });
});
