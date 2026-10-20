import { EXPRESSION_LIMITS } from './calculator';
import { inspectBlockReferenceExpression, REFERENCE_MODE, validReferenceFields } from './reference-syntax';
import { staleBlockIds } from './block-references';
import { analyzeMemoDependencyStructure, type DependencyGraph } from './dependency-structure';
import type { CalculationMemoBlock, MemoBlock } from './types';
export type { DependencyDiagnostic, DependencyEdge, VariableBinding, DependencyNode, DependencyGraph } from './dependency-structure';
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const calculations = (blocks: readonly MemoBlock[]) => blocks.filter((b): b is CalculationMemoBlock => b.type === 'calculation');

/** Read-only graph plus snapshot status; execution uses the same structural core. */
export function analyzeMemoDependencies(blocks: readonly MemoBlock[]): DependencyGraph {
  const graph = analyzeMemoDependencyStructure(blocks);
  const calcs = calculations(blocks);
  const pending = calcs.every(b => validReferenceFields(b as unknown as Record<string, unknown>))
    ? staleBlockIds([...blocks]) : new Set(calcs.map(b => b.id));
  graph.nodes.forEach(node => { node.pending = pending.has(node.id); });
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
