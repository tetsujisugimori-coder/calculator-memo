import { EXPRESSION_LIMITS, inspectCalculatorExpression } from './calculator';
import { inspectBlockReferenceExpression, MAX_GRAPH_BLOCKS, REFERENCE_MODE, staleBlockIds, validReferenceFields } from './block-references';
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
export function analyzeMemoDependencies(blocks: readonly MemoBlock[]): DependencyGraph {
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
  const pending = calcs.every(b => validReferenceFields(b as unknown as Record<string, unknown>))
    ? staleBlockIds([...blocks]) : new Set(calcs.map(b => b.id));
  const scope = new Map<string, string[]>();
  for (const block of calcs) {
    const node: DependencyNode = { id: block.id, expression: block.expression, pending: pending.has(block.id), diagnostics: [], bindings: [] };
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

export type DependencyImpact = {
  before: DependencyGraph;
  after: DependencyGraph;
  /** Directly edited/added/deleted calculation sources (including raw value edits). */
  changedIds: string[];
  /** Moved relative to surviving calculations; not automatically numerical impact. */
  reorderedIds: string[];
  bindingChangedIds: string[];
  /** Includes sources, binding changes, and potential transitive consumers. */
  affectedIds: string[];
  uncertainIds: string[];
  reasons: Record<string, string[]>;
};
function inputSignature(block: CalculationMemoBlock): string {
  let references: unknown = null;
  if (block.evaluationMode === REFERENCE_MODE) {
    let used: Set<number> | undefined;
    try { used = new Set(inspectBlockReferenceExpression(block).slots); } catch { /* Invalid syntax remains explicitly diagnosed. */ }
    const entries = block.references?.entries;
    references = [validReferenceFields(block as unknown as Record<string, unknown>), block.references?.version ?? null, Array.isArray(entries) ? entries
      .filter(entry => !used || !entry || used.has(entry.slot))
      .map(entry => entry ? [entry.slot, entry.blockId] : null).sort((a, b) => compare(JSON.stringify(a), JSON.stringify(b))) : 'invalid-entries'];
  }
  return JSON.stringify([block.evaluationMode ?? null, block.expression, references,
    Object.is(block.result, -0) ? '-0' : block.result, block.error]);
}
/** Compare snapshots; traverse BOTH graphs so removed/rebound links are not lost. */
export function analyzeDependencyImpact(beforeBlocks: readonly MemoBlock[], afterBlocks: readonly MemoBlock[]): DependencyImpact {
  const before = analyzeMemoDependencies(beforeBlocks), after = analyzeMemoDependencies(afterBlocks);
  const old = new Map(calculations(beforeBlocks).map(b => [b.id, b]));
  const next = new Map(calculations(afterBlocks).map(b => [b.id, b]));
  const all = [...new Set([...old.keys(), ...next.keys()])].sort(compare);
  const changedIds = all.filter(id => !old.has(id) || !next.has(id) || inputSignature(old.get(id)!) !== inputSignature(next.get(id)!));
  const oldOrder = [...old.keys()].filter(id => next.has(id));
  const newOrder = [...next.keys()].filter(id => old.has(id));
  const reordered = new Set<string>();
  for (let i = 0; i < oldOrder.length; i++) for (let j = i + 1; j < oldOrder.length; j++) {
    if (newOrder.indexOf(oldOrder[i]) > newOrder.indexOf(oldOrder[j])) { reordered.add(oldOrder[i]); reordered.add(oldOrder[j]); }
  }
  const bindingSignature = (graph: DependencyGraph, id: string) => JSON.stringify(graph.nodes.find(n => n.id === id)?.bindings ?? []);
  const bindingChangedIds = all.filter(id => old.has(id) && next.has(id) && bindingSignature(before, id) !== bindingSignature(after, id));
  const reasons: Record<string, string[]> = Object.create(null);
  const affected = new Set<string>(); const uncertain = new Set<string>();
  const add = (id: string, reason: string) => { affected.add(id); (reasons[id] ??= []).push(reason); };
  changedIds.forEach(id => add(id, 'source-changed'));
  bindingChangedIds.forEach(id => { add(id, 'binding-changed'); uncertain.add(id); });
  const edges = [...before.edges, ...after.edges];
  // Analysis-incomplete blocks could read changed sources. Do not silently report
  // a precise closure when their semantics are unknown; the reason is explicit.
  if (affected.size || reordered.size) for (const id of new Set([...before.unresolvedIds, ...after.unresolvedIds])) {
    add(id, 'analysis-incomplete'); uncertain.add(id);
  }
  let changed = true;
  while (changed) {
    changed = false;
    for (const edge of edges) if (affected.has(edge.source)) {
      if (!affected.has(edge.target)) { add(edge.target, 'dependent'); changed = true; }
      if ((edge.certainty === 'uncertain' || uncertain.has(edge.source)) && !uncertain.has(edge.target)) { uncertain.add(edge.target); changed = true; }
    }
  }
  return { before, after, changedIds, reorderedIds: [...reordered].sort(compare), bindingChangedIds,
    affectedIds: [...affected].sort(compare), uncertainIds: [...uncertain].sort(compare), reasons };
}

// Public bounds are inherited from the execution engine, not a second grammar.
export const DEPENDENCY_EXPRESSION_LIMIT = EXPRESSION_LIMITS.length;
