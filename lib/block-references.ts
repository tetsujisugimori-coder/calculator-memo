import { calculateVariableExpression, EXPRESSION_LIMITS, inspectFormulaDefinition } from './calculator';
import { calculateMemoBlock } from './memo-blocks';
import type { CalculationMemoBlock, MemoBlock } from './types';

export const REFERENCE_MODE = 'block-references';
export const MAX_GRAPH_BLOCKS = 128;
export function isManualMemo(blocks: MemoBlock[]): boolean {
  return blocks.some(b => b.type === 'calculation' && (b.evaluationMode === REFERENCE_MODE || b.evaluationState !== undefined));
}
export function validReferenceFields(b: Record<string, unknown>): boolean {
  if (b.evaluationState !== undefined) {
    const s = b.evaluationState as Record<string, unknown> | null;
    if (!s || typeof s !== 'object' || Array.isArray(s) || s.version !== 1 || (typeof s.status !== 'string' || !['stale', 'current'].includes(s.status)) || (s.signature !== undefined && typeof s.signature !== 'string') || (s.attemptError !== undefined && typeof s.attemptError !== 'string')) return false;
  }
  if (b.evaluationMode !== REFERENCE_MODE) return b.references === undefined;
  const r = b.references as Record<string, unknown> | null;
  if (!r || typeof r !== 'object' || Array.isArray(r) || r.version !== 1 || !Array.isArray(r.entries) || r.entries.length > MAX_GRAPH_BLOCKS) return false;
  const slots = new Set<number>();
  return r.entries.every((e: unknown) => {
    if (!e || typeof e !== 'object' || Array.isArray(e)) return false;
    const x = e as Record<string, unknown>;
    if (!Number.isSafeInteger(x.slot) || (x.slot as number) < 1 || (x.slot as number) > MAX_GRAPH_BLOCKS || typeof x.blockId !== 'string' || !x.blockId.trim() || slots.has(x.slot as number)) return false;
    slots.add(x.slot as number); return true;
  });
}
export function inspectBlockReferenceExpression(block: CalculationMemoBlock) {
  if (block.expression.length > EXPRESSION_LIMITS.length) throw new Error('式は2000文字以内で入力してください');
  // Only lexical reference tokens are replaced. All remaining syntax is validated
  // by the existing AST allowlist; internal binding names cannot be typed directly.
  if (/ReferenceValue\d+/.test(block.expression)) throw new Error('内部参照名は使用できません');
  const slots = new Set<number>();
  const expression = block.expression.replace(/@\{([1-9][0-9]*)\}/g, (_, digits) => {
    const slot = Number(digits); slots.add(slot); return `ReferenceValue${slot}`;
  });
  const names = inspectFormulaDefinition(expression);
  if (names.some(name => !/^ReferenceValue[1-9][0-9]*$/.test(name))) throw new Error('参照モードでは変数名を直接使わず、変数を計算したブロックを選択してください');
  return { expression, slots: [...slots] };
}
export function analyzeBlockDependencies(blocks: MemoBlock[]) {
  const calculations = blocks.filter((b): b is CalculationMemoBlock => b.type === 'calculation');
  const byId = new Map(calculations.map(b => [b.id, b]));
  const dependencies = new Map<string, string[]>();
  const errors = new Map<string, string>();
  if (calculations.length > MAX_GRAPH_BLOCKS) { errors.set('*', `手動再計算は${MAX_GRAPH_BLOCKS}計算ブロック以内です`); return { dependencies, errors, order: [] as string[] }; }
  if (new Set(blocks.map(b => b.id)).size !== blocks.length) errors.set('*', 'ブロックIDが重複しています');
  for (const b of calculations) {
    dependencies.set(b.id, []);
    if (b.evaluationMode !== REFERENCE_MODE) continue;
    try {
      if (!validReferenceFields(b as unknown as Record<string, unknown>)) throw new Error('未対応または不正な参照形式です');
      const { slots } = inspectBlockReferenceExpression(b);
      const ids = slots.map(slot => {
        const entry = b.references!.entries.find(e => e.slot === slot);
        if (!entry || !byId.has(entry.blockId)) throw new Error(`参照切れ: @{${slot}} の計算ブロックがありません`);
        return entry.blockId;
      });
      dependencies.set(b.id, [...new Set(ids)]);
    } catch (e) { errors.set(b.id, e instanceof Error ? e.message : '参照式を確認してください'); }
  }
  // Kahn's algorithm avoids recursive stack growth. Ordering ties do not affect values.
  const remaining = new Map([...dependencies].map(([id, deps]) => [id, deps.length]));
  const order: string[] = [];
  const queue = [...remaining].filter(([, n]) => n === 0).map(([id]) => id);
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i]; order.push(id);
    for (const [child, deps] of dependencies) if (deps.includes(id)) {
      const count = remaining.get(child)! - 1; remaining.set(child, count);
      if (count === 0) queue.push(child);
    }
  }
  for (const [id, n] of remaining) if (n > 0) errors.set(id, '循環参照、または循環参照に依存しています');
  return { dependencies, errors, order };
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
export function recalculateReferenceMemo(blocks: MemoBlock[]): { blocks: MemoBlock[]; success: boolean; evaluated: string[] } {
  const graph = analyzeBlockDependencies(blocks);
  const evaluated: string[] = [];
  const fail = (message: string) => ({ blocks: markCalculationsStale(blocks).map(b => b.type === 'calculation' ? { ...b, evaluationState: { ...b.evaluationState!, attemptError: message } } : b), success: false, evaluated });
  if (graph.errors.size) {
    const [id, message] = [...graph.errors][0];
    return fail(id === '*' ? message : `ブロック ${blocks.findIndex(b => b.id === id) + 1}: ${message}`);
  }
  const results = new Map<string, CalculationMemoBlock>();
  const scope = new Map<string, number>();
  // Preserve old assignment/reassignment semantics. This stage runs once and does
  // not commit any partial result. Reference blocks cannot define scoped variables.
  for (const b of blocks) if (b.type === 'calculation' && b.evaluationMode !== REFERENCE_MODE) {
    const result = { ...b, ...calculateMemoBlock(b.id, b.expression, b.evaluationMode, scope) };
    results.set(b.id, result); evaluated.push(b.id);
  }
  // Finish the legacy scope first (failed reassignment keeps its previous value),
  // then stop an already-failed transaction before any reference evaluation.
  const failed = [...results.values()].find(b => b.error);
  if (failed) return fail(`ブロック ${blocks.findIndex(b => b.id === failed.id) + 1} (${failed.expression}): ${failed.error}`);
  for (const id of graph.order) {
    const b = blocks.find(b => b.id === id)!;
    if (b.type !== 'calculation' || b.evaluationMode !== REFERENCE_MODE) continue;
    try {
      const { expression, slots } = inspectBlockReferenceExpression(b);
      const bindings = new Map<string, number>();
      for (const slot of slots) {
        const target = b.references!.entries.find(e => e.slot === slot)!.blockId;
        const source = results.get(target);
        if (!source || source.error || source.result === null) throw new Error(`参照元 @{${slot}} を計算できません`);
        bindings.set(`ReferenceValue${slot}`, source.result);
      }
      // Record actual numeric attempts, including calls that throw. Preflight and
      // missing-source failures above do not invoke the numeric evaluator.
      evaluated.push(id);
      const value = calculateVariableExpression(expression, bindings);
      results.set(id, { ...b, displayExpression: b.expression, result: value.value, resultText: value.resultText, error: null });
    } catch (e) { return fail(`ブロック ${blocks.indexOf(b) + 1} (${b.expression}): ${e instanceof Error ? e.message : '計算できません'}`); }
  }
  const next = blocks.map(b => b.type === 'calculation' ? results.get(b.id)! : { ...b });
  return { blocks: next.map(b => b.type === 'calculation' ? { ...b, evaluationState: { ...b.evaluationState, version: 1, status: 'current', signature: signature(b, next), attemptError: undefined } } : b), success: true, evaluated };
}
