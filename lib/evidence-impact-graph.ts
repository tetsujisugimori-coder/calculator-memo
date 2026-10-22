import type { EvidenceImpact, EvidenceImpactRow, ImpactPath } from './evidence-impact';
import type { DependencyGraph } from './dependency-structure';
import { mermaidBlockId, toMermaid, type MermaidNodeState } from './dependency-mermaid';
import { GRAPH_EDGE_LIMIT, GRAPH_NODE_LIMIT, GRAPH_TEXT_LIMIT } from './dependency-svg';

export type EvidenceGraphSide = 'before' | 'after';
export type EvidenceGraphMode = 'all' | 'path';
export type EvidenceGraphPair = { source: string; target: string };
export function impactLabels(row: EvidenceImpactRow): string[] {
  return [row.directChanges.length ? '直接変更' : '', row.propagationCandidate ? '波及変更候補' : '',
    row.resultChanges.length ? '結果差分' : '', row.orderChanges.length ? '順序差分' : '',
    row.unknown.length ? '判定不能' : '', row.unchanged ? '変更なし（既知項目）' : ''].filter(Boolean);
}
const pairKey = (source: string, target: string) => JSON.stringify([source, target]);

/** Presentation only: selects an existing side/path, never searches or classifies. */
export function buildEvidenceImpactGraph(impact: EvidenceImpact, sideName: EvidenceGraphSide, selectedId: string, rootId: string, mode: EvidenceGraphMode) {
  const side = impact[sideName];
  const selected = impact.rows.find(row => row.blockId === selectedId);
  const exists = side.graph.nodes.some(node => node.id === selectedId);
  const suppliedPath = selected?.[sideName === 'before' ? 'beforePaths' : 'afterPaths'].find(path => path.rootId === rootId);
  // Retained paths from a bounded analysis are usable. Inconsistent paths are not.
  // This checks the supplied path only; it does not discover substitute paths.
  const inconsistent = new Set(side.graph.nodes.filter(node => node.diagnostics.some(diagnostic => diagnostic.code === 'saved-evidence-inconsistent')).map(node => node.id));
  const safePath = suppliedPath && suppliedPath.blockIds.every(id => !inconsistent.has(id)) && suppliedPath.blockIds.every((id, index, ids) => index === 0 || side.edges.some(edge => edge.source === ids[index - 1] && edge.target === id && edge.valid));
  const path: ImpactPath | undefined = safePath ? suppliedPath : undefined;
  const highlightedPairs: EvidenceGraphPair[] = path ? path.blockIds.slice(1).map((target, index) => ({ source: path.blockIds[index], target })) : [];
  const pathPairs = new Set(highlightedPairs.map(pair => pairKey(pair.source, pair.target)));
  const pathIds = new Set(path?.blockIds ?? []);
  const nodes = mode === 'all' ? side.graph.nodes : side.graph.nodes.filter(node => pathIds.has(node.id));
  const edges = mode === 'all' ? side.edges : side.edges.filter(edge => edge.valid && pathPairs.has(pairKey(edge.source, edge.target)));
  // Uncertain upstream relationships stay dotted, never visually certified.
  const graph: DependencyGraph = { ...side.graph, nodes, edges: edges.map(edge => ({ ...edge,
    certainty: edge.valid && !inconsistent.has(edge.source) && !inconsistent.has(edge.target) ? edge.certainty : 'uncertain' })),
    diagnostics: side.graph.diagnostics, unresolvedIds: side.graph.unresolvedIds };
  const labels = new Map(impact.rows.map(row => [row.blockId, impactLabels(row)]));
  const nodeStates = new Map<string, MermaidNodeState>(nodes.map(node => {
    const row = impact.rows.find(item => item.blockId === node.id)!;
    const classes: MermaidNodeState['classes'] = [];
    if (row.directChanges.length) classes.push('changed');
    if (row.propagationCandidate) classes.push('affected');
    if (row.unknown.length) classes.push('unknown');
    if (!classes.length) classes.push('normal');
    return [node.id, { labels: labels.get(node.id) ?? [], classes }];
  }));
  // Only renderer-generated lines are reformatted. No user expression or input
  // is parsed, and no relation is added. ID encoding is the shared injective map.
  const encodedPairs = new Set(highlightedPairs.map(pair => pairKey(mermaidBlockId(pair.source), mermaidBlockId(pair.target))));
  const mermaid = toMermaid(graph, { nodeStates }).split('\n').map(line => {
    const match = /^  (block_[0-9a-f]+) (-->|-\.->)\|"(?:#\d+;)*"\| (block_[0-9a-f]+)$/.exec(line);
    if (!match) return line;
    const highlighted = match[2] === '-->' && encodedPairs.has(pairKey(match[1], match[3]));
    return highlighted ? line.replace(' -->|', ' ==>|') : line;
  }).join('\n');
  const limit = nodes.length > GRAPH_NODE_LIMIT || edges.length > GRAPH_EDGE_LIMIT || mermaid.length > GRAPH_TEXT_LIMIT
    ? `図の描画上限（${GRAPH_NODE_LIMIT}ブロック・${GRAPH_EDGE_LIMIT}入力辺・${GRAPH_TEXT_LIMIT}文字）を超えたため、この図を省略しました。保存記録は不正ではありません。経路に絞るか、既存の一覧・絞り込み前の比較Markdownを利用してください。` : null;
  let message = '';
  if (!selectedId) message = '結果のブロックを選択すると、記録された起点別の代表経路を確認できます。';
  else if (!exists) message = '選択したブロックはこの記録に存在しません。別のブロックで代用しません。';
  else if (!rootId) message = selected && (selected.beforePaths.length || selected.afterPaths.length) ? '起点を選択してください。' : !side.complete || !!side.unknown[selectedId]?.length ? '不整合または分析上限のため、代表経路の有無は判定不能です。' : 'この側の完全な分析で、直接変更の起点からの代表経路は確認されていません。';
  else if (!path) message = !side.complete || !!side.unknown[selectedId]?.length || !!suppliedPath ? '判定不能：不整合または分析上限のため、選択した起点の代表経路を根拠として表示できません。' : '選択した起点の代表経路はこの記録にありません。完全な分析で到達関係が確認されていません。';
  else message = '選択した起点の代表経路です。全経路や単独の原因を示すものではありません。';
  return { graph, mermaid, nodeIds: nodes.map(node => node.id), path, labels, highlightedPairs,
    nodeCount: nodes.length, totalNodeCount: side.graph.nodes.length, edgeCount: edges.length, totalEdgeCount: side.edges.length,
    limit, message, analysisComplete: side.complete };
}
