import { calculateVariableExpression } from './calculator';
import { calculateMemoBlock, describeCalculationBlock } from './memo-blocks';
import { EvidenceScope, evidenceBlock, type EvidenceBlock } from './calculation-evidence';
import { inspectBlockReferenceExpression, REFERENCE_MODE } from './reference-syntax';
import { createMemoExecutionPlan, analyzeBlockDependencies, blockedReferenceDiagnostics } from './execution-plan';
import type { DependencyDiagnostic } from './dependency-structure';
import type { CalculationMemoBlock, MemoBlock } from './types';
export { inspectBlockReferenceExpression, REFERENCE_MODE, MAX_GRAPH_BLOCKS, validReferenceFields } from './reference-syntax';
export { analyzeBlockDependencies } from './execution-plan';

export function isManualMemo(blocks: MemoBlock[]): boolean {
  return blocks.some(b => b.type === 'calculation' && (b.evaluationMode === REFERENCE_MODE || b.evaluationState !== undefined));
}
function spec(b: CalculationMemoBlock) { return [b.id, b.evaluationMode ?? null, b.expression, b.references ?? null]; }
function signature(block: CalculationMemoBlock, blocks: MemoBlock[]): string {
  // Exact structural evidence, not a collision-prone hash. Legacy variable scope
  // retains its historical preceding-block semantics; graph references do not.
  const previous = block.evaluationMode === 'note-variables'
    ? blocks.slice(0, blocks.indexOf(block)).filter((b): b is CalculationMemoBlock => b.type === 'calculation' && b.evaluationMode === 'note-variables').map(spec) : [];
  const dependencies = block.evaluationMode === REFERENCE_MODE ? (block.references?.entries ?? []).map(e => {
    const target = blocks.find(b => b.id === e.blockId);
    return [e.slot, target?.type === 'calculation' ? [spec(target), target.result, target.resultText, target.error] : null];
  }) : [];
  return JSON.stringify([spec(block), previous, dependencies, block.result, block.resultText, block.error]);
}
export function staleBlockIds(blocks: MemoBlock[]): Set<string> {
  const stale = new Set<string>();
  if (!isManualMemo(blocks)) return stale;
  const graph = analyzeBlockDependencies(blocks);
  if (graph.errors.has("*")) return new Set(blocks.filter(b => b.type === "calculation").map(b => b.id));
  for (const b of blocks) if (b.type === 'calculation' && (b.evaluationState?.status !== 'current' || b.evaluationState.signature !== signature(b, blocks) || graph.errors.has(b.id) || graph.errors.has('*'))) stale.add(b.id);
  // Fixed point also covers cycles and invalid source snapshots loaded from JSON.
  let changed = true;
  while (changed) { changed = false; for (const [id, deps] of graph.dependencies) if (!stale.has(id) && deps.some(d => stale.has(d))) { stale.add(id); changed = true; } }
  return stale;
}
export function markCalculationsStale(blocks: MemoBlock[]): MemoBlock[] {
  return blocks.map(b => b.type === 'calculation' ? { ...b, evaluationState: { ...b.evaluationState, version: 1, status: 'stale', attemptError: undefined } } : { ...b });
}
export type CalculationObservation = { blockId: string; result: number | null; resultText: string; error: string | null };
/** Pure evaluation, including transient observations from a failed transaction.
 * observations are evidence only; blocks retains the historical atomic contract. */
export function evaluateReferenceMemo(blocks: MemoBlock[]): { blocks: MemoBlock[]; success: boolean; evaluated: string[]; observations: CalculationObservation[]; evidence?: EvidenceBlock[]; diagnostics: DependencyDiagnostic[] } {
  const graph = createMemoExecutionPlan(blocks);
  const evaluated: string[] = [];
  const observations: CalculationObservation[] = [];
  const fail = (message: string, failures: DependencyDiagnostic[]) => ({ blocks: markCalculationsStale(blocks).map(b => b.type === 'calculation' ? { ...b, evaluationState: { ...b.evaluationState!, attemptError: message } } : b), success: false, evaluated, observations, diagnostics: blockedReferenceDiagnostics(graph, failures) });
  if (graph.errors.size) {
    const [id, message] = [...graph.errors][0];
    return fail(id === '*' ? message : `ブロック ${blocks.findIndex(b => b.id === id) + 1}: ${message}`, graph.diagnostics);
  }
  const results = new Map<string, CalculationMemoBlock>();
  const scope = new EvidenceScope('variable');
  const evidence: EvidenceBlock[] = [];
  // Preserve old assignment/reassignment semantics. This stage runs once and does
  // not commit any partial result. Reference blocks cannot define scoped variables.
  for (const id of graph.legacyOrder) {
    const b = blocks.find(b => b.id === id) as CalculationMemoBlock;
    scope.reads.length = 0;
    const result = { ...b, ...calculateMemoBlock(b.id, b.expression, b.evaluationMode, scope) };
    results.set(b.id, result); evaluated.push(b.id);
    if (result.error === null && result.result !== null) {
      evidence.push(evidenceBlock(result, blocks.indexOf(b) + 1, scope.reads));
      const variableName = b.evaluationMode === 'note-variables' ? describeCalculationBlock(b.expression).variableName : undefined;
      if (variableName) scope.origins.set(variableName, b.id);
    }
    observations.push({ blockId: b.id, result: result.result, resultText: result.resultText, error: result.error });
  }
  // Finish the legacy scope first (failed reassignment keeps its previous value),
  // then stop an already-failed transaction before any reference evaluation.
  const failed = [...results.values()].find(b => b.error);
  if (failed) return fail(`ブロック ${blocks.findIndex(b => b.id === failed.id) + 1} (${failed.expression}): ${failed.error}`,
    [...results.values()].filter(b => b.error).map(b => ({ blockId: b.id, code: 'legacy-evaluation', severity: 'error', message: b.error! })));
  for (const id of graph.referenceOrder) {
    const b = blocks.find(b => b.id === id)!;
    if (b.type !== 'calculation' || b.evaluationMode !== REFERENCE_MODE) continue;
    try {
      const { expression, slots } = inspectBlockReferenceExpression(b);
      const bindings = new EvidenceScope('id');
      for (const slot of slots) {
        const target = b.references!.entries.find(e => e.slot === slot)!.blockId;
        const source = results.get(target);
        if (!source || source.error || source.result === null) throw new Error(`参照元 @{${slot}} を計算できません`);
        bindings.set(`ReferenceValue${slot}`, source.result);
        bindings.origins.set(`ReferenceValue${slot}`, target);
      }
      // Record actual numeric attempts, including calls that throw. Preflight and
      // missing-source failures above do not invoke the numeric evaluator.
      evaluated.push(id);
      const value = calculateVariableExpression(expression, bindings);
      observations.push({ blockId: id, result: value.value, resultText: value.resultText, error: null });
      results.set(id, { ...b, displayExpression: b.expression, result: value.value, resultText: value.resultText, error: null });
      evidence.push(evidenceBlock(results.get(id)!, blocks.indexOf(b) + 1, bindings.reads));
    } catch (e) {
      const message = e instanceof Error ? e.message : '計算できません';
      if (evaluated.includes(id)) observations.push({ blockId: id, result: null, resultText: "", error: message });
      return fail(`ブロック ${blocks.indexOf(b) + 1} (${b.expression}): ${message}`, [{ blockId: id, code: 'reference-evaluation', severity: 'error', message }]);
    }
  }
  const next = blocks.map(b => b.type === 'calculation' ? results.get(b.id)! : { ...b });
  return { blocks: next.map(b => b.type === 'calculation' ? { ...b, evaluationState: { ...b.evaluationState, version: 1, status: 'current', signature: signature(b, next), attemptError: undefined } } : b), success: true, evaluated, observations, evidence, diagnostics: [] };
}

/** Existing callers see exactly the original result shape and rollback behavior. */
export function recalculateReferenceMemo(blocks: MemoBlock[]) {
  const { blocks: next, success, evaluated, diagnostics } = evaluateReferenceMemo(blocks);
  return { blocks: next, success, evaluated, diagnostics };
}
