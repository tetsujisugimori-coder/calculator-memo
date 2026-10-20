import type { CalculationStatusReport } from './calculation-status';
import type { CalculationTrial } from './calculation-trial';
import type { DependencyGraph } from './dependency-analysis';
import { dependencyEdgeKey, toMermaid, type DependencyEdgeChange, type MermaidNodeState } from './dependency-mermaid';

export type DependencyComparisonNode = {
  labels: string[];
  deleted: boolean;
  trialRow?: CalculationTrial['rows'][number];
};
export type DependencyComparison = {
  graph: DependencyGraph;
  mermaid: string;
  nodes: Map<string, DependencyComparisonNode>;
  addedCount: number;
  removedCount: number;
};
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
// A rejected expression is complete for the evaluator's fail-closed decision,
// but does not establish a before/after dependency difference.
const uninspectable = (graph: DependencyGraph, id?: string) =>
  graph.unresolvedIds.some(value => id === undefined || value === id) ||
  graph.diagnostics.some(diagnostic => (id === undefined || diagnostic.blockId === id || !diagnostic.blockId) && ['invalid-expression', 'analysis-failure', 'invalid-reference', 'invalid-ids', 'limit', 'unsupported-mode'].includes(diagnostic.code));

/** Read-only presentation. The caller supplies only a currently valid trial.
 * Never evaluates expressions or changes persisted/committed values. The before
 * snapshot is the editor opening/last commit, not necessarily a saved version.
 * A changed relationship is shown as its removed and added semantic edges.
 */
export function buildDependencyComparison(report: CalculationStatusReport, baselineKnown: boolean, trial?: CalculationTrial): DependencyComparison {
  const impact = report.impact;
  const before = impact?.before;
  const after = report.graph;
  const oldEdges = new Map((before?.edges ?? []).map(edge => [dependencyEdgeKey(edge), edge]));
  const newEdges = new Map(after.edges.map(edge => [dependencyEdgeKey(edge), edge]));
  const edgeChanges = new Map<string, DependencyEdgeChange>();
  // Without an opening snapshot absence is unknown, not a proven addition.
  if (before) {
    for (const [key, edge] of newEdges) if (!oldEdges.has(key)) edgeChanges.set(key, uninspectable(before, edge.target) ? 'unknown' : 'added');
    for (const [key, edge] of oldEdges) if (!newEdges.has(key)) edgeChanges.set(key, uninspectable(after, edge.target) ? 'unknown' : 'removed');
  }
  const nodeMap = new Map([...(before?.nodes ?? []), ...after.nodes].map(node => [node.id, node]));
  const graph: DependencyGraph = {
    ...after,
    nodes: [...nodeMap.values()].sort((a, b) => compare(a.id, b.id)),
    edges: [...new Map([...oldEdges, ...newEdges]).entries()].sort(([a], [b]) => compare(a, b)).map(([, edge]) => edge),
  };
  // Global limits/invalid IDs can suppress graph nodes even when blocks remain.
  const currentIds = new Set(report.states.keys());
  const inspectedIds = new Set(after.nodes.map(node => node.id));
  const direct = new Set(impact?.changedIds);
  const affected = new Set(impact?.affectedIds);
  const uncertain = new Set(impact?.uncertainIds);
  const diagnostics = trial?.report ?? report;
  const trialRows = new Map(trial?.rows.map(row => [row.blockId, row]));
  const nodes = new Map<string, DependencyComparisonNode>();
  const nodeStates = new Map<string, MermaidNodeState>();
  for (const node of graph.nodes) {
    const deleted = !currentIds.has(node.id);
    const labels: string[] = [];
    const classes: MermaidNodeState['classes'] = [];
    if (deleted) { labels.push('削除済み（変更前）'); classes.push('unknown'); }
    else if (direct.has(node.id)) { labels.push('変更元'); classes.push('changed'); }
    else if (affected.has(node.id)) { labels.push('変更の影響対象'); classes.push('affected'); }
    else if (!baselineKnown || !before || !before.complete || !after.complete || uninspectable(before) || uninspectable(after)) { labels.push('影響範囲不明'); classes.push('unknown'); }
    else { labels.push('依存関係上の影響なし'); classes.push('normal'); }
    if (!deleted && !inspectedIds.has(node.id)) labels.push('変更前の式・現在は解析不能');
    if (uncertain.has(node.id)) labels.push('影響は候補');
    const status = diagnostics.states.get(node.id);
    if (!deleted && status && (status.kind === 'error' || status.kind === 'blocked')) {
      labels.push(status.label); classes.push(status.kind);
    }
    const trialRow = deleted ? undefined : trialRows.get(node.id);
    if (trialRow) labels.push(trialRow.differenceState === 'changed' ? '数値変化あり' : trialRow.differenceState === 'same' ? '数値変化なし' : '数値比較不可');
    nodes.set(node.id, { labels, deleted, ...(trialRow ? { trialRow } : {}) });
    nodeStates.set(node.id, { labels, classes });
  }
  return {
    graph, nodes, mermaid: toMermaid(graph, { nodeStates, edgeChanges }),
    addedCount: [...edgeChanges.values()].filter(change => change === 'added').length,
    removedCount: [...edgeChanges.values()].filter(change => change === 'removed').length,
  };
}
