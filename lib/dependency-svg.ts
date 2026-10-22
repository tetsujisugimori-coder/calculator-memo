import { mermaidBlockId } from './dependency-mermaid';

export const GRAPH_NODE_LIMIT = 128;
export const GRAPH_EDGE_LIMIT = 256;
export const GRAPH_TEXT_LIMIT = 250_000;
export function graphRenderLimit(nodes: number, edges: number, text: string): string | null {
  return nodes > GRAPH_NODE_LIMIT || edges > GRAPH_EDGE_LIMIT || text.length > GRAPH_TEXT_LIMIT
    ? '図の表示上限（128ブロック・256辺・25万文字）を超えています。一覧とMermaidコピーで確認してください。' : null;
}
const ns = 'http://www.w3.org/2000/svg';
const tags = new Set(['svg', 'g', 'defs', 'marker', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon', 'text', 'tspan', 'title', 'desc']);
const geometry = new Set(['viewBox','width','height','x','y','x1','x2','y1','y2','cx','cy','r','rx','ry','dx','dy','d','points','transform','markerWidth','markerHeight','refX','refY','orient','markerUnits','text-anchor','dominant-baseline','stroke-width','stroke-dasharray','font-size']);
/** Rebuild, never insert renderer markup. CSS, HTML, links, events and external
 * resources are not copied. Node identity is checked against a trusted ID map. */
export function sanitizeDependencySvg(source: string, ids: readonly string[], document: Document): SVGSVGElement {
  if (source.length > 4_000_000) throw new Error('図の描画結果が大きすぎます');
  const parsed = new document.defaultView!.DOMParser().parseFromString(source, 'image/svg+xml');
  if (parsed.querySelector('parsererror') || parsed.documentElement.localName !== 'svg') throw new Error('図のSVGを確認できません');
  const known = new Map(ids.map(id => [mermaidBlockId(id), id]));
  const found = new Set<string>();
  const safeIds = new Set(Array.from(parsed.querySelectorAll('[id]'), el => el.id).filter(id => /^[A-Za-z][\w-]*$/.test(id)));
  const copy = (input: Element): Element | null => {
    if (input.namespaceURI !== ns || !tags.has(input.localName)) return null;
    const output = document.createElementNS(ns, input.localName);
    for (const attr of Array.from(input.attributes)) {
      const { name, value } = attr;
      if (geometry.has(name) && /^[\d\s.,+eE()A-Za-z%\-]*$/.test(value) && !/url|http|javascript/i.test(value)) output.setAttribute(name, value);
      if (name === 'id' && safeIds.has(value)) output.id = value;
      if (name === 'class' && /^[\w\s-]+$/.test(value)) output.setAttribute('class', value);
      if ((name === 'fill' || name === 'stroke') && /^(none|currentColor|#[\da-fA-F]{3,8})$/.test(value)) output.setAttribute(name, value);
      if (name.startsWith('marker-')) {
        const match = /^url\(#([A-Za-z][\w-]*)\)$/.exec(value);
        if (match && safeIds.has(match[1])) output.setAttribute(name, value);
      }
    }
    // Mermaid flowchart uses a generated DOM id with an exact encoded logical id.
    // No label matching, substring matching or selector interpolation is used.
    if (input.localName === 'g' && input.classList.contains('node')) {
      const match = /^flowchart-(block_[0-9a-f]*)-\d+$/.exec(input.id);
      const id = match ? known.get(match[1]) : undefined;
      if (id === undefined || found.has(id)) throw new Error('図とブロックIDの対応を確認できません');
      found.add(id);
      output.setAttribute('data-block-id', id);
      output.setAttribute('role', 'button');
      output.setAttribute('tabindex', '0');
    }
    for (const child of Array.from(input.childNodes)) {
      if (child.nodeType === 3) output.appendChild(document.createTextNode(child.textContent ?? ''));
      else if (child.nodeType === 1) { const clean = copy(child as Element); if (clean) output.appendChild(clean); }
    }
    return output;
  };
  const result = copy(parsed.documentElement) as SVGSVGElement;
  if (found.size !== known.size) throw new Error('一部のブロックを図に対応付けられません。一覧を利用してください。');
  const box = result.getAttribute('viewBox')?.trim().split(/[ ,]+/).map(Number);
  if (!box || box.length !== 4 || box.some(value => !Number.isFinite(value)) || box[2] <= 0 || box[3] <= 0 || box[2] > 50_000 || box[3] > 50_000) throw new Error('図の表示寸法が上限を超えています');
  result.setAttribute('width', String(Math.max(320, box[2])));
  result.setAttribute('height', String(box[3] * Math.max(1, 320 / box[2])));
  // Scale the whole coordinate system with root text enlargement, so labels and
  // their rectangles grow together rather than overflowing fixed geometry.
  result.style.width = `${Math.max(320, box[2]) / 16}rem`;
  result.style.height = `${box[3] * Math.max(1, 320 / box[2]) / 16}rem`;
  result.setAttribute('role', 'group'); result.setAttribute('aria-label', '計算ブロックの依存関係');
  return result;
}

/** Only fixed placeholders enter the layout grammar. User text is restored with
 * textContent after sanitization, never interpreted as Mermaid, Markdown or HTML. */
export function prepareDependencyLayout(source: string, historical = false): { text: string; labels: Map<string, string[]> } {
  const labels = new Map<string, string[]>();
  const decode = (encoded: string) => encoded.replace(/#(\d+);/g, (_, number) => String.fromCodePoint(Number(number)));
  const text = source.replace(/(block_[0-9a-f]+)\["((?:#\d+;)*)"\]/g, (_, id: string, encoded: string) => {
    const original = decode(encoded);
    const stateAt = original.lastIndexOf(' [');
    const expression = stateAt >= 0 ? original.slice(0, stateAt) : original;
    const state = stateAt >= 0 ? original.slice(stateAt) : '';
    const display = Array.from(expression).length > 80 ? Array.from(expression).slice(0, 80).join('') + '…' + state : original;
    const chars = Array.from(display.replace(/[\r\n\t]/g, ' '));
    const lines = Array.from({ length: Math.max(1, Math.ceil(chars.length / 18)) }, (_, index) => chars.slice(index * 18, index * 18 + 18).join(''));
    labels.set(id, lines);
    return `${id}["\`${lines.map(line => '田'.repeat(Math.max(1, Array.from(line).length) + 6)).join('\n')}\`"]`;
  }).replace(/\|"((?:#\d+;)*)"\|/g, (_, encoded: string) => {
    // Edge labels are generated kind/name descriptions, but keep their user text
    // out of layout too. Their full meaning remains in the export and legend.
    const text = decode(encoded);
    const change = text.includes('＋追加') ? '＋追加 ' : text.includes('−削除') ? '−削除 ' : text.includes('変更不明') ? '変更不明 ' : '';
    if (historical) return `|${text.includes('ID参照') ? 'ID参照（実使用）' : '旧変数（実使用）'}${text.includes('不確定') ? '・不整合' : ''}|`;
    return `|${change}${text.includes('ID参照') ? 'ID参照' : '旧変数候補'}|`;
  });
  return { text, labels };
}
export function applyDependencyLabels(svg: SVGSVGElement, labels: ReadonlyMap<string, string[]>, document: Document): void {
  for (const node of svg.querySelectorAll('[data-block-id]')) {
    const lines = labels.get(mermaidBlockId(node.getAttribute('data-block-id')!));
    const group = node.querySelector('g.label');
    if (!lines || !group) throw new Error('図のラベルを確認できません');
    group.replaceChildren(); group.removeAttribute('transform');
    const text = document.createElementNS(ns, 'text');
    text.setAttribute('text-anchor', 'middle');
    lines.forEach((line, index) => {
      const span = document.createElementNS(ns, 'tspan'); span.setAttribute('x', '0');
      span.setAttribute('y', String((index - (lines.length - 1) / 2) * 22 + 6));
      span.textContent = line; text.append(span);
    });
    group.append(text);
  }
}
