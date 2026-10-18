import { parse, type MathNode } from "mathjs";
import { formatExpression, formatNumber } from "./format";

const ALLOWED_EXPRESSION = /^(?:[0-9+\-*/^().%]|sqrt|abs|pi|e)+$/;
export const EXPRESSION_LIMITS = { length: 2000, depth: 32, nodes: 256, exponent: 10000 } as const;

export type CalculationResult = {
  value: number;
  resultText: string;
  displayExpression: string;
};

export function normalizeExpression(expression: string): string {
  return expression
    .replace(/[＋+]/g, "+")
    .replace(/[−–—]/g, "-")
    .replace(/[×xX]/g, "*")
    .replace(/[÷]/g, "/")
    .replace(/\s+/g, "");
}

export function validateExpression(expression: string): string {
  if (expression.length > EXPRESSION_LIMITS.length) throw new Error("式は2000文字以内で入力してください");
  const normalized = normalizeExpression(expression);
  if (!normalized) throw new Error("式を入力してください");
  if (!ALLOWED_EXPRESSION.test(normalized)) throw new Error("使用できない文字が含まれています");
  // e is a named constant, not an opt-in to scientific notation.
  if (/[\d.]e[+\-]?\d/i.test(normalized)) throw new Error("指数表記は使用できない文字形式です");
  // The legacy postfix-% rewrite is intentionally unchanged (Issue #19).
  // It cannot safely interpret new function/power syntax, so fail explicitly.
  if (normalized.includes("%") && /[a-z^]/.test(normalized)) {
    throw new Error("数学関数・定数・累乗と%の組合せにはまだ対応していません");
  }
  let depth = 0;
  for (const char of normalized) {
    if (char === "(") depth += 1;
    if (depth > EXPRESSION_LIMITS.depth) throw new Error("式の入れ子が深すぎます");
    if (char === ")") depth -= 1;
    if (depth < 0) throw new Error("括弧の位置を確認してください");
  }
  if (depth !== 0) throw new Error("括弧が閉じていません");
  if (/[+\-*/^.(]$/.test(normalized)) throw new Error("式が不完全です");
  return normalized;
}

function expandPercent(expression: string): string {
  let previous: string;
  let next = expression;
  do {
    previous = next;
    next = previous
      .replace(/(\d+(?:\.\d+)?)%/g, "($1/100)")
      .replace(/(\([^()]+\))%/g, "($1/100)");
  } while (next !== previous);
  if (next.includes("%")) throw new Error("% の位置を確認してください");
  return next;
}

// Validate the complete tree before evaluating any subtree. No assignments,
// accessors, arrays, units, user variables or arbitrary calls. Legacy numeric
// implicit products remain compatible; new mathematics requires explicit *.
function allowedTree(root: MathNode, allowLegacyImplicit: boolean): MathNode[] {
  const postorder: MathNode[] = [];
  let count = 0;
  const visit = (node: MathNode, depth: number) => {
    if (++count > EXPRESSION_LIMITS.nodes || depth > EXPRESSION_LIMITS.depth) {
      throw new Error("式が複雑すぎます");
    }
    if (node.type === "ConstantNode") {
      const value = (node as import("mathjs").ConstantNode).value;
      if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("数値を確認してください");
    } else if (node.type === "SymbolNode") {
      if (!["pi", "e"].includes((node as import("mathjs").SymbolNode).name)) throw new Error("使用できない定数です");
    } else if (node.type === "ParenthesisNode") {
      visit((node as import("mathjs").ParenthesisNode).content, depth + 1);
    } else if (node.type === "OperatorNode") {
      const operator = node as import("mathjs").OperatorNode;
      const signatures = ["+:add:2", "-:subtract:2", "*:multiply:2", "/:divide:2", "^:pow:2", "+:unaryPlus:1", "-:unaryMinus:1"];
      if ((operator.implicit && !allowLegacyImplicit) || !signatures.includes(`${operator.op}:${operator.fn}:${operator.args.length}`)) {
        throw new Error("使用できない演算です。掛け算には*を入力してください");
      }
      operator.args.forEach((arg) => visit(arg, depth + 1));
    } else if (node.type === "FunctionNode") {
      const call = node as import("mathjs").FunctionNode;
      if (call.fn.type !== "SymbolNode" || !["sqrt", "abs"].includes(call.fn.name) || call.args.length !== 1) {
        throw new Error("sqrt・absは引数を1つ指定してください");
      }
      call.args.forEach((arg) => visit(arg, depth + 1));
    } else {
      throw new Error("使用できない構文です");
    }
    postorder.push(node);
  };
  visit(root, 1);
  return postorder;
}

export function calculateExpression(expression: string): CalculationResult {
  const normalized = validateExpression(expression);
  let root: MathNode;
  try {
    root = parse(expandPercent(normalized));
  } catch {
    throw new Error("式が不完全か、計算できない内容です");
  }
  const nodes = allowedTree(root, !/[a-z^]/.test(normalized));
  const values = new Map<MathNode, number>();
  // Keep mathjs's parser, precedence and numerical evaluation. Bounded trees
  // are checked bottom-up so a bad intermediate or exponent never reaches its
  // parent. Re-evaluation is bounded by 256 nodes / 32 levels, not user code.
  for (const node of nodes) {
    if (node.type === "OperatorNode") {
      const operator = node as import("mathjs").OperatorNode;
      if (operator.fn === "divide" && values.get(operator.args[1]) === 0) throw new Error("0では割れません");
      if (operator.fn === "pow" && Math.abs(values.get(operator.args[1])!) > EXPRESSION_LIMITS.exponent) {
        throw new Error("指数の絶対値は10000以下にしてください");
      }
    }
    let raw: unknown;
    try { raw = node.evaluate(); }
    catch { throw new Error("式が不完全か、計算できない内容です"); }
    if (typeof raw !== "number" || !Number.isFinite(raw)) throw new Error("有限の実数として計算できません");
    values.set(node, raw);
  }
  const value = values.get(root)!;
  if (Math.abs(value) > Number.MAX_SAFE_INTEGER) throw new Error("扱える桁数を超えました");
  return { value, resultText: formatNumber(value), displayExpression: formatExpression(normalized) };
}

export function appendInput(expression: string, input: string): string {
  const last = expression.at(-1) ?? "";
  const isOperator = /^[+*/^]$/.test(input);
  if (isOperator && !expression) return expression;
  if (isOperator && /^[+\-*/^.]$/.test(last)) return expression.slice(0, -1) + input;
  if (input === "-" && last === "-") return expression;
  if (input === ".") {
    const segment = expression.split(/[+\-*/^()%]/).at(-1) ?? "";
    if (segment.includes(".")) return expression;
    if (!segment) return `${expression}0.`;
  }
  if (input === ")" && (!expression || /[+\-*/^.(]$/.test(last))) return expression;
  if (input === "%" && (!expression || /[+\-*/^.(%]$/.test(last))) return expression;
  return expression + input;
}

// A minus belongs to the trailing number only in a unary position.
// In `12-34` it is the binary operator; in `12--34` only the last minus is unary.
export function trailingNumber(expression: string): { start: number; text: string } | null {
  const match = expression.trimEnd().match(/(?:\d+(?:\.\d*)?|\.\d+)(?:\s*%)?$/);
  if (!match || match.index === undefined) return null;
  let start = match.index;
  const prefix = expression.slice(0, start).trimEnd();
  if (normalizeExpression(prefix).endsWith("-")) {
    const beforeMinus = normalizeExpression(prefix.slice(0, -1));
    if (!beforeMinus || /[+\-*/^(]$/.test(beforeMinus)) start = prefix.length - 1;
  }
  return { start, text: normalizeExpression(expression.slice(start)) };
}

export function clearEntry(expression: string): string {
  const number = trailingNumber(expression);
  return number ? expression.slice(0, number.start) : expression;
}

export function toggleSign(expression: string): string {
  const number = trailingNumber(expression);
  if (!number) return expression ? `${expression}(-` : "-";
  const replacement = number.text.startsWith("-") ? number.text.slice(1) : `-${number.text}`;
  return expression.slice(0, number.start) + replacement;
}
