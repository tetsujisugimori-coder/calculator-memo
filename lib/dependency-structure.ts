import { inspectCalculatorExpression } from './calculator';
import { inspectBlockReferenceExpression, MAX_GRAPH_BLOCKS, REFERENCE_MODE, validReferenceFields } from './reference-syntax';
import { inspectIdentification } from './identification';
import type { CalculationMemoBlock, MemoBlock } from './types';

export type DependencyDiagnostic = {
  code: string;
  severity: 'error' | 'uncertain';
  message: string;
  blockId?: string;
  variable?: string;
  relatedIds?: string[];
};
export type DependencyEdge = {
  source: string;
  target: string;
  kind: 'reference' | 'variable';
  certainty: 'definite' | 'uncertain';
  variable?: string;
};
export type VariableBinding = { variable: string; candidates: string[]; possiblyUndefined: boolean };
export type DependencyNode = {
  id: string;
  expression: string;
  pending: boolean;
  diagnostics: DependencyDiagnostic[];
  bindings: VariableBinding[];
  assignment?: { variable: string; previousCandidates: string[]; maySucceed: boolean };
};
export type DependencyGraph = {
  nodes: DependencyNode[];
  edges: DependencyEdge[];
  diagnostics: DependencyDiagnostic[];
  /** False means some dependencies could not be inspected, not numerical failure. */
  complete: boolean;
  unresolvedIds: string[];
};
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const calculations = (blocks: readonly MemoBlock[]) => blocks.filter((b): b is CalculationMemoBlock => b.type === 'calculation');

/** Read-only structural analysis. Never calculates, trusts saved results, or commits scope. */
export function analyzeMemoDependencyStructure(blocks: readonly MemoBlock[]): DependencyGraph {
  const graph: DependencyGraph = { nodes: [], edges: [], diagnostics: [], complete: true, unresolvedIds: [] };
  const calcs = calculations(blocks);
  const ids = new Set(blocks.map(b => b.id));
  const report = (node: DependencyNode | undefined, code: string, severity: DependencyDiagnostic['severity'], message: string, extra: Partial<DependencyDiagnostic> = {}) => {
    const diagnostic: DependencyDiagnostic = { code, severity, message, ...(node ? { blockId: node.id } : {}), ...extra };
    graph.diagnostics.push(diagnostic); node?.diagnostics.push(diagnostic);
  };
  // Ambiguous IDs cannot identify nodes safely. Fail closed, with explicit incompleteness.
  if (ids.size !== blocks.length || blocks.some(b => !b.id.trim()) || calcs.length > MAX_GRAPH_BLOCKS) {
    graph.complete = false;
    graph.unresolvedIds = [...new Set(calcs.map(b => b.id))].sort(compare);
    report(undefined, calcs.length > MAX_GRAPH_BLOCKS ? 'limit' : 'invalid-ids', 'error', '一意で空でないID、128計算ブロック以内が必要です');
    return graph;
  }
  const byId = new Map(calcs.map(b => [b.id, b]));
  const scope = new Map<string, string[]>();
  for (const block of calcs) {
    const node: DependencyNode = { id: block.id, expression: block.expression, pending: false, diagnostics: [], bindings: [] };
    graph.nodes.push(node);
    if (block.error) report(node, 'saved-error', 'error', `保存済み結果のエラー（現在の式の再評価ではありません）: ${block.error}`);
    try {
      if (block.evaluationMode === REFERENCE_MODE) {
        if (!validReferenceFields(block as unknown as Record<string, unknown>)) {
          report(node, 'invalid-reference', 'error', '未対応または不正な参照形式です');
          graph.complete = false; graph.unresolvedIds.push(block.id); continue;
        }
        const { slots } = inspectBlockReferenceExpression(block);
        for (const slot of slots) {
          const entry = block.references!.entries.find(e => e.slot === slot);
          if (!entry || !byId.has(entry.blockId)) {
            report(node, 'missing-reference', 'error', `参照切れ: @{${slot}} の計算ブロックがありません`, { relatedIds: entry ? [entry.blockId] : [] });
          } else if (!graph.edges.some(e => e.kind === 'reference' && e.source === entry.blockId && e.target === block.id)) {
            graph.edges.push({ source: entry.blockId, target: block.id, kind: 'reference', certainty: 'definite' });
          }
        }
      } else if (block.evaluationMode === 'note-variables') {
        const info = inspectIdentification(block.expression, true);
        if (info.error) { report(node, 'invalid-expression', 'error', info.error); continue; }
        let maySucceed = true;
        for (const variable of info.variables) {
          const candidates = [...(scope.get(variable) ?? [])];
          node.bindings.push({ variable, candidates, possiblyUndefined: true });
          if (!candidates.length) {
            maySucceed = false;
            report(node, 'undefined-variable', 'error', `先行する定義がありません: ${variable}`, { variable });
          } else {
            report(node, 'uncertain-binding', 'uncertain', `代入の計算成功は未検証です。参照先と未定義の可能性があります: ${variable}`, { variable, relatedIds: candidates });
            for (const source of candidates) graph.edges.push({ source, target: block.id, kind: 'variable', certainty: 'uncertain', variable });
          }
        }
        if (info.target) {
          const previousCandidates = [...(scope.get(info.target) ?? [])];
          node.assignment = { variable: info.target, previousCandidates, maySucceed };
          // Read-before-write: x=x+1 refers only to preceding providers. Invalid or
          // definitely unbound assignments cannot replace any earlier definition.
          if (maySucceed) scope.set(info.target, [...previousCandidates, block.id]);
        }
      } else if (block.evaluationMode === undefined) {
        inspectCalculatorExpression(block.expression);
      } else {
        graph.complete = false; graph.unresolvedIds.push(block.id);
        report(node, 'unsupported-mode', 'uncertain', '未対応モードの依存関係は解析できません');
      }
    } catch (cause) {
      // Known syntax is rejected by the exact execution parser. No speculative
      // token edges are recovered from rejected expressions.
      report(node, cause instanceof Error ? 'invalid-expression' : 'analysis-failure', 'error', cause instanceof Error ? cause.message : '依存関係を解析できません');
      if (!(cause instanceof Error)) { graph.complete = false; graph.unresolvedIds.push(block.id); }
    }
  }
  // Reachability identifies actual SCC members, separately from their dependents.
  // Bounded to 128 nodes; iterative traversal avoids recursive graph stack growth.
  const children = new Map(graph.nodes.map(n => [n.id, graph.edges.filter(e => e.source === n.id).map(e => e.target)]));
  const reachable = (start: string) => {
    const found = new Set<string>(); const queue = [...(children.get(start) ?? [])];
    for (let i = 0; i < queue.length; i++) if (!found.has(queue[i])) {
      found.add(queue[i]); queue.push(...(children.get(queue[i]) ?? []));
    }
    return found;
  };
  const reach = new Map(graph.nodes.map(n => [n.id, reachable(n.id)]));
  const cyclic = new Set(graph.nodes.filter(n => reach.get(n.id)!.has(n.id)).map(n => n.id));
  for (const node of graph.nodes) {
    if (cyclic.has(node.id)) {
      const self = graph.edges.some(e => e.source === node.id && e.target === node.id);
      report(node, self ? 'self-reference' : 'cycle', 'error', self ? '自己参照です' : '循環参照です', { relatedIds: [...cyclic].filter(id => reach.get(node.id)!.has(id) && reach.get(id)!.has(node.id)).sort(compare) });
    } else if ([...cyclic].some(id => reach.get(id)!.has(node.id))) {
      report(node, 'cycle-dependent', 'error', '循環参照に依存しています');
    }
  }
  graph.edges.sort((a, b) => compare(JSON.stringify(a), JSON.stringify(b)));
  return graph;
}
