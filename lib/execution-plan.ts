import { analyzeMemoDependencyStructure, type DependencyDiagnostic, type DependencyGraph } from './dependency-structure';
import { REFERENCE_MODE } from './reference-syntax';
import type { CalculationMemoBlock, MemoBlock } from './types';

export type ExecutionConstraint = { source: string; target: string; kind: 'legacy-sequence' | 'legacy-phase' };
export type MemoExecutionPlan = {
  graph: DependencyGraph;
  /** Actual ID data dependencies, never speculative legacy binding candidates. */
  dependencies: Map<string, string[]>;
  /** Compatibility scheduling only; these are not Mermaid data edges. */
  constraints: ExecutionConstraint[];
  legacyOrder: string[];
  referenceOrder: string[];
  order: string[];
  errors: Map<string, string>;
  diagnostics: DependencyDiagnostic[];
};
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;

/** One shared structural graph; variable candidates are NOT execution edges.
 * Legacy statements must complete in display order before any ID calculation,
 * including independent ones, to preserve failed-reassignment scope and priority.
 */
export function createMemoExecutionPlan(blocks: readonly MemoBlock[]): MemoExecutionPlan {
  const graph = analyzeMemoDependencyStructure(blocks);
  const calcs = blocks.filter((b): b is CalculationMemoBlock => b.type === 'calculation');
  const byId = new Map(calcs.map(b => [b.id, b]));
  const legacyOrder = calcs.filter(b => b.evaluationMode !== REFERENCE_MODE).map(b => b.id);
  const referenceIds = calcs.filter(b => b.evaluationMode === REFERENCE_MODE).map(b => b.id).sort(compare);
  const dependencies = new Map(calcs.map(b => [b.id, graph.edges.filter(e => e.kind === 'reference' && e.target === b.id).map(e => e.source)]));
  // Preserve original preflight priority: reference syntax/target errors in
  // display order, then cycle diagnostics. Legacy syntax fails in legacy phase.
  const diagnostics = graph.diagnostics.filter(d => d.code !== 'saved-error' && d.severity === 'error'
    && (!d.blockId || byId.get(d.blockId)?.evaluationMode === REFERENCE_MODE));
  const errors = new Map<string, string>();
  for (const d of diagnostics) if (!errors.has(d.blockId ?? '*')) errors.set(d.blockId ?? '*', d.message);
  const constraints: ExecutionConstraint[] = legacyOrder.slice(1).map((target, i) => ({ source: legacyOrder[i], target, kind: 'legacy-sequence' }));
  if (legacyOrder.length) for (const target of referenceIds) constraints.push({ source: legacyOrder.at(-1)!, target, kind: 'legacy-phase' });
  const referenceOrder: string[] = [];
  const remaining = new Set(referenceIds);
  // Canonical ID tie-break at EACH step, not just the initial ready queue.
  while (remaining.size) {
    const id = [...remaining].find(id => dependencies.get(id)!.every(source => !remaining.has(source)));
    if (id === undefined) break;
    remaining.delete(id); referenceOrder.push(id);
  }
  return { graph, dependencies, constraints, legacyOrder, referenceOrder,
    order: [...legacyOrder, ...referenceOrder], errors, diagnostics };
}

/** Compatibility facade used by editing/snapshot validation; no evaluation. */
export function analyzeBlockDependencies(blocks: MemoBlock[]) {
  const { dependencies, errors, order } = createMemoExecutionPlan(blocks);
  return { dependencies, errors, order };
}

/** Definite ID consumers of failed sources, not unrelated or uncertain bindings. */
export function blockedReferenceDiagnostics(plan: MemoExecutionPlan, failures: DependencyDiagnostic[]): DependencyDiagnostic[] {
  const result = [...failures];
  const failed = new Set(failures.flatMap(d => d.blockId ? [d.blockId] : []));
  let changed = true;
  while (changed) {
    changed = false;
    for (const [id, deps] of plan.dependencies) if (!failed.has(id)) {
      const sources = deps.filter(source => failed.has(source));
      if (sources.length) {
        failed.add(id); changed = true;
        result.push({ blockId: id, code: 'blocked-reference', severity: 'error', message: '参照先を計算できないため未評価です', relatedIds: sources });
      }
    }
  }
  return result;
}
