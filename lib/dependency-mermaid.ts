import type { DependencyGraph } from './dependency-analysis';

export type MermaidNodeState = { labels: string[]; classes: ('normal' | 'changed' | 'affected' | 'unknown' | 'error' | 'blocked')[] };

export interface MermaidOptions {
  /** Explicit evidence-aware presentation; omitted keeps the original export. */
  nodeStates?: ReadonlyMap<string, MermaidNodeState>;
  /** Changed sources, including those explicitly selected by a caller. */
  changedIds?: ReadonlySet<string>;
  /** Potential transitive dependents. This does not mark stored results stale. */
  affectedIds?: ReadonlySet<string>;
}

/** Injective UTF-16 encoding: IDs never depend on position, expression or label. */
export function mermaidBlockId(id: string): string {
  let encoded = 'block_';
  for (let index = 0; index < id.length; index++) {
    encoded += id.charCodeAt(index).toString(16).padStart(4, '0');
  }
  return encoded;
}

/** Mermaid's documented decimal entity notation keeps user text out of syntax. */
function label(text: string): string {
  return Array.from(text, character => `#${character.codePointAt(0)};`).join('');
}

function compare(a: string, b: string): number { return a < b ? -1 : a > b ? 1 : 0; }

/** Pure export. No rendering, calculation, persistence, or mutation of input. */
export function toMermaid(graph: DependencyGraph, options: MermaidOptions = {}): string {
  const lines = ['flowchart TD'];
  const globalErrors = graph.diagnostics.filter(diagnostic => !diagnostic.blockId && diagnostic.severity === 'error');
  for (const diagnostic of globalErrors) lines.push(`  %% ${label(diagnostic.message)}`);
  const nodes = [...graph.nodes].sort((a, b) => compare(a.id, b.id));
  const ids = new Set(nodes.map(node => node.id));
  for (const node of nodes) {
    const states: string[] = [];
    const classes: string[] = [];
    const explicit = options.nodeStates?.get(node.id);
    if (explicit) { states.push(...explicit.labels); classes.push(...explicit.classes); }
    if (!explicit) {
    if (options.changedIds?.has(node.id)) { states.push('変更元'); classes.push('changed'); }
    if (options.affectedIds?.has(node.id)) { states.push('影響候補'); classes.push('affected'); }
    if (node.pending) { states.push('再計算待ち'); classes.push('pending'); }
    if (node.diagnostics.some(diagnostic => diagnostic.code === 'saved-error')) { states.push('保存済みエラー'); classes.push('error'); }
    if (node.diagnostics.some(diagnostic => diagnostic.severity === 'error' && diagnostic.code !== 'saved-error') || globalErrors.length) {
      states.push('解析エラー'); classes.push('error');
    }
    if (node.diagnostics.some(diagnostic => diagnostic.severity === 'uncertain') || graph.edges.some(edge => edge.target === node.id && edge.certainty === 'uncertain')) {
      states.push('依存不確定'); classes.push('uncertain');
    }
    if (!states.length) { states.push('通常'); classes.push('normal'); }
    }
    const id = mermaidBlockId(node.id);
    lines.push(`  ${id}["${label(`${node.expression} [${states.join('・')}]`)}"]`);
    lines.push(`  class ${id} ${[...new Set(classes)].join(',')};`);
  }
  // Coalesce repeated dependencies while preserving distinct definite/potential
  // paths and all variable names. Sort without locale-sensitive collation.
  const edges = new Map<string, { source: string; target: string; certainty: string; labels: Set<string> }>();
  for (const edge of graph.edges) {
    if (!ids.has(edge.source) || !ids.has(edge.target)) continue;
    const key = JSON.stringify([edge.source, edge.target, edge.certainty]);
    const existing = edges.get(key) ?? { source: edge.source, target: edge.target, certainty: edge.certainty, labels: new Set<string>() };
    existing.labels.add(edge.kind === 'reference' ? 'ID参照' : `変数 ${edge.variable ?? ''}`.trim());
    edges.set(key, existing);
  }
  for (const [, edge] of [...edges].sort(([a], [b]) => compare(a, b))) {
    const text = [...edge.labels].sort(compare).join(' / ') + (edge.certainty === 'uncertain' ? '（不確定）' : '');
    const arrow = edge.certainty === 'uncertain' ? '-.->' : '-->';
    lines.push(`  ${mermaidBlockId(edge.source)} ${arrow}|"${label(text)}"| ${mermaidBlockId(edge.target)}`);
  }
  lines.push(
    '  classDef normal fill:#f8fafc,stroke:#475569,color:#0f172a;',
    '  classDef changed fill:#fef3c7,stroke:#92400e,color:#451a03,stroke-width:3px;',
    '  classDef affected fill:#ede9fe,stroke:#6d28d9,color:#2e1065;',
    '  classDef pending stroke:#b45309,stroke-dasharray:5 3;',
    '  classDef uncertain stroke:#7c3aed,stroke-dasharray:2 3;',
    '  classDef error fill:#fee2e2,stroke:#b91c1c,color:#450a0a,stroke-width:3px;',
  );
  if (options.nodeStates) lines.push('  classDef unknown fill:#f1f5f9,stroke:#64748b,color:#0f172a,stroke-dasharray:3 3;', '  classDef blocked fill:#ffedd5,stroke:#c2410c,color:#431407;');
  return lines.join('\n') + '\n';
}
