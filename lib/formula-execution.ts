import { parse, type MathNode } from "mathjs";
import { assertVariableName, calculateExpression, calculateVariableExpression, inspectFormulaDefinition, EXPRESSION_LIMITS } from "./calculator";
import { calculateMemoBlock, resolveMemoBlocks } from "./memo-blocks";
import { createHistoryEntry } from "./history";
import type { HistoryEntry, NoteDraft, PlainCalculationNote, RegisteredFormula } from "./types";

export type ExecutionDraft = { formulaId: string; expression: string; inputs: Record<string, string> };
export type ExecutionResult = ExecutionDraft & { title: string; value: number; resultText: string; boundExpression: string | null; transferError: string | null };

/** Exact, editable decimal spelling; never use the rounded display as an operand. */
export function executionNumber(value: number): string {
  if (!Number.isFinite(value)) throw new Error("有限の数値を入力してください");
  if (Object.is(value, -0)) return "-0";
  const text = String(value);
  if (!text.includes("e")) return text;
  const [mantissa, exponent] = text.split("e");
  const sign = mantissa.startsWith("-") ? "-" : "";
  const [whole, fraction = ""] = mantissa.replace(/^-/, "").split(".");
  const digits = whole + fraction;
  const position = whole.length + Number(exponent);
  if (position <= 0) return `${sign}0.${"0".repeat(-position)}${digits}`;
  if (position >= digits.length) return sign + digits + "0".repeat(position - digits.length);
  return `${sign}${digits.slice(0, position)}.${digits.slice(position)}`;
}

export function inputNumber(text: string, name: string): number {
  if (!text.trim()) throw new Error(`未入力の変数です: ${name}`);
  if (text.length > EXPRESSION_LIMITS.length) throw new Error(`入力値が長すぎます: ${name}`);
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(text.trim())) throw new Error(`数値を入力してください（十進数・符号・小数点）: ${name}`);
  const value = Number(text);
  if (!Number.isFinite(value)) throw new Error(`有限の数値を入力してください: ${name}`);
  if (Math.abs(value) > Number.MAX_SAFE_INTEGER) throw new Error(`扱える桁数を超えました: ${name}`);
  return value;
}

export function executeFormula(formula: RegisteredFormula, inputs: Record<string, string>): ExecutionResult {
  const names = inspectFormulaDefinition(formula.expression);
  const scope = new Map<string, number>();
  const used: Record<string, string> = {};
  for (const name of names) {
    const text = Object.hasOwn(inputs, name) ? inputs[name] : "";
    scope.set(name, inputNumber(text, name));
    used[name] = text;
  }
  const calculated = calculateVariableExpression(formula.expression, scope);
  let boundExpression: string | null = null;
  let transferError: string | null = null;
  try {
    // Only approved SymbolNodes are replaced. Function names/constants and names
    // embedded within other identifiers are never treated as variable matches.
    const normalized = formula.expression.replace(/＋/g, "+").replace(/[−–—]/g, "-").replace(/×/g, "*").replace(/÷/g, "/").trim();
    const bound = names.length ? parse(normalized).transform((node) => {
      if (node.type === "SymbolNode") {
        const name = (node as unknown as { name: string }).name;
        if (scope.has(name)) return parse(`(${executionNumber(scope.get(name)!)})`);
      }
      return node;
    }).toString({ parenthesis: "keep", implicit: "show", handler: (node: MathNode) => node.type === "ConstantNode"
      ? executionNumber((node as unknown as { value: number }).value) : undefined }) : formula.expression;
    const checked = calculateExpression(bound);
    if (!Object.is(checked.value, calculated.value)) throw new Error("内部値を同一に再現できません");
    boundExpression = bound;
  } catch (cause) {
    transferError = `計算は完了しましたが、数値を展開した式を安全に再編集できないため履歴・メモへ渡せません: ${cause instanceof Error ? cause.message : "式を確認してください"}`;
  }
  return { formulaId: formula.id, title: formula.title, expression: formula.expression, inputs: used, value: calculated.value, resultText: calculated.resultText, boundExpression, transferError };
}

/** Explicitly chosen note only. Recompute in order rather than trusting cached results. */
export function noteVariableInputs(note: PlainCalculationNote): Record<string, string> {
  const scope = new Map<string, number>();
  for (const block of resolveMemoBlocks(note)) {
    if (block.type === "calculation") calculateMemoBlock(block.id, block.expression, block.evaluationMode, scope);
  }
  return Object.fromEntries([...scope].map(([name, value]) => [name, executionNumber(value)]));
}

export function executionHistory(result: ExecutionResult, id: string, createdAt: string): HistoryEntry {
  if (result.boundExpression === null) throw new Error(result.transferError ?? "先に計算してください");
  const entry = createHistoryEntry(result.boundExpression, id, createdAt);
  if (!Object.is(entry.result, result.value)) throw new Error("内部値を同一に再現できません");
  return { ...entry, formulaExecution: { formulaId: result.formulaId, title: result.title, expression: result.expression, inputs: { ...result.inputs } } };
}

export function executionMemo(result: ExecutionResult): NoteDraft {
  const entry = executionHistory(result, "preview", "");
  return { title: result.title, expression: entry.expression, displayExpression: entry.displayExpression, result: entry.result, resultText: entry.resultText, latexExpression: null, unit: "", tags: [], relatedMemoName: "", displayMode: "plain", note: `登録式の実行記録\n登録式ID: ${result.formulaId}\n元の式: ${result.expression}\n入力値:\n${Object.entries(result.inputs).map(([name, text]) => `${name} = ${text}`).join("\n") || "変数なし"}\nこの記録は実行時点のものです。上の計算式を編集しても元の登録式は変わりません。` };
}

/** Invalid new data fails closed, retaining the complete raw storage for recovery. */
export function readExecutionDrafts(value: unknown): ExecutionDraft[] {
  if (!Array.isArray(value) || value.length > 200) throw new Error("実行入力の保存形式が不正です");
  const ids = new Set<string>();
  return value.map((item: unknown) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("実行入力が不正です");
    const v = item as Record<string, unknown>;
    if (typeof v.formulaId !== "string" || !v.formulaId || v.formulaId.length > 120 || ids.has(v.formulaId)
      || typeof v.expression !== "string" || v.expression.length > EXPRESSION_LIMITS.length
      || !v.inputs || typeof v.inputs !== "object" || Array.isArray(v.inputs)) throw new Error("実行入力が不正です");
    const entries = Object.entries(v.inputs);
    if (entries.length > EXPRESSION_LIMITS.nodes) throw new Error("実行入力が多すぎます");
    for (const [name, text] of entries) {
      assertVariableName(name);
      if (typeof text !== "string" || text.length > EXPRESSION_LIMITS.length) throw new Error("実行入力値が不正です");
    }
    ids.add(v.formulaId);
    return { ...v, formulaId: v.formulaId, expression: v.expression, inputs: Object.fromEntries(entries) as Record<string, string> };
  });
}
