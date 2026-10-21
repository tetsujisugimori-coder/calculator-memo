// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { graphRenderLimit, sanitizeDependencySvg } from '../lib/dependency-svg';
import { mermaidBlockId } from '../lib/dependency-mermaid';
const doc = () => document;
const svg = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 900">${body}</svg>`;
const node = (id: string, label = 'same') => `<g class="node" id="flowchart-${mermaidBlockId(id)}-0"><rect width="100" height="44"/><text>${label}</text></g>`;
describe('read-only dependency SVG boundary', () => {
  it('maps duplicate labels using exact encoded IDs, preserving dimensions', () => {
    const result = sanitizeDependencySvg(svg(node('a') + node('日本語 " b')), ['a', '日本語 " b'], doc());
    expect(Array.from(result.querySelectorAll('[data-block-id]'), el => el.getAttribute('data-block-id'))).toEqual(['a', '日本語 " b']);
    expect(result.getAttribute('width')).toBe('500'); expect(result.getAttribute('height')).toBe('900');
  });
  it('reconstructs only SVG geometry/text and safe local markers, stripping active content', () => {
    const dirty = svg(`<script>alert(1)</script><style>@import 'https://bad';</style><foreignObject><div xmlns="http://www.w3.org/1999/xhtml">evil</div></foreignObject><a href="javascript:alert(1)"><text>link</text></a><defs><marker id="arrow"><path d="M 0 0 L 5 5"/></marker></defs><path marker-end="url(#arrow)" style="fill:url(https://bad)" onclick="alert(1)"/><image href="https://bad"/>` + node('a', '&lt;img src=x onerror=alert(1)&gt;'));
    const result = sanitizeDependencySvg(dirty, ['a'], doc());
    expect(result.querySelector('script,style,foreignObject,a,image')).toBeNull();
    expect(result.querySelector('[onclick],[style],[href]')).toBeNull();
    expect(result.style.width).toBe('31.25rem');
    expect(result.querySelector('path[marker-end]')?.getAttribute('marker-end')).toBe('url(#arrow)');
    expect(result.textContent).toContain('<img src=x onerror=alert(1)>');
  });
  it.each([
    [svg(node('bad')), ['a']], [svg(node('a') + node('a')), ['a']], [svg(''), ['a']], ['<svg', ['a']],
  ] as [string,string[]][])('rejects unmapped, duplicate, absent or malformed nodes', (source, ids) => {
    expect(() => sanitizeDependencySvg(source, ids, doc())).toThrow();
  });
  it('rejects unbounded geometry and external resource attributes', () => {
    expect(() => sanitizeDependencySvg(svg(node('a')).replace('500 900', '500 900000'), ['a'], doc())).toThrow();
    const result = sanitizeDependencySvg(svg(node('a') + '<path marker-end="url(https://bad/#a)" fill="url(#a)"/>'), ['a'], doc());
    expect(result.querySelector('[marker-end],[fill]')).toBeNull();
  });
  it('bounds nodes, edges and source before invoking renderer', () => {
    expect(graphRenderLimit(128,256,'ok')).toBeNull();
    expect(graphRenderLimit(129,0,'')).toBeTruthy(); expect(graphRenderLimit(1,257,'')).toBeTruthy();
    expect(graphRenderLimit(1,0,'x'.repeat(250001))).toBeTruthy();
  });
});

describe('layout/text separation', () => {
  it('keeps untrusted labels out of Mermaid grammar and restores literal SVG text', async () => {
    const { prepareDependencyLayout, applyDependencyLabels } = await import('../lib/dependency-svg');
    const raw = '<img onerror="evil"> 日本語 & ` ] --> hack';
    const encoded = Array.from(raw, char => `#${char.codePointAt(0)};`).join('');
    const layout = prepareDependencyLayout(`flowchart TD\n${mermaidBlockId('a')}["${encoded}"]`);
    expect(layout.text).not.toContain('onerror'); expect(layout.text).not.toContain('hack');
    const result = sanitizeDependencySvg(svg(`<g class="node" id="flowchart-${mermaidBlockId('a')}-0"><rect/><g class="label"/></g>`), ['a'], doc());
    applyDependencyLabels(result, layout.labels, doc());
    expect(result.textContent).toBe(raw); expect(result.querySelector('img,[onerror]')).toBeNull();
  });
  it('bounds displayed expression but preserves state suffix and full export input', async () => {
    const { prepareDependencyLayout } = await import('../lib/dependency-svg');
    const raw = 'x'.repeat(2000) + ' [変更あり・未再計算 / 参照先エラー]';
    const encoded = Array.from(raw, char => `#${char.codePointAt(0)};`).join('');
    const source = `flowchart TD\n${mermaidBlockId('a')}["${encoded}"]`;
    const layout = prepareDependencyLayout(source);
    expect(layout.labels.get(mermaidBlockId('a'))?.join('')).toBe('x'.repeat(80) + '… [変更あり・未再計算 / 参照先エラー]');
    expect(source).toContain(encoded);
  });
});

it('parses the display projection of actual exported node/edge syntax', async () => {
  const { default: mermaid } = await import('mermaid');
  const { toMermaid } = await import('../lib/dependency-mermaid');
  const { prepareDependencyLayout } = await import('../lib/dependency-svg');
  const source = toMermaid({ nodes: ['a','b'].map(id => ({ id, expression: id === 'a' ? '<script>日本語"' : 'x+1', pending: false, diagnostics: [], bindings: [] })), edges: [{ source: 'a', target: 'b', certainty: 'uncertain', kind: 'variable', variable: 'x' }], diagnostics: [], complete: true, unresolvedIds: [] });
  const projected = prepareDependencyLayout(source);
  expect(projected.text).toContain('|旧変数候補|'); expect(projected.text).not.toMatch(/#\d+;/);
  mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', htmlLabels: false });
  await expect(mermaid.parse(projected.text)).resolves.toMatchObject({ diagramType: 'flowchart-v2' });
});

it('retains delta and uncertain-change labels in the safe display projection', async () => {
  const { prepareDependencyLayout } = await import('../lib/dependency-svg');
  for (const change of ['＋追加', '−削除', '変更不明']) {
    const encoded = Array.from(`${change} ID参照`, char => `#${char.codePointAt(0)};`).join('');
    expect(prepareDependencyLayout(`flowchart TD\na -->|"${encoded}"| b`).text).toContain(`|${change} ID参照|`);
  }
});
