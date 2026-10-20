import { EXPRESSION_LIMITS, inspectFormulaDefinition } from './calculator';
import type { CalculationMemoBlock } from './types';

export const REFERENCE_MODE = 'block-references';
export const MAX_GRAPH_BLOCKS = 128;
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
