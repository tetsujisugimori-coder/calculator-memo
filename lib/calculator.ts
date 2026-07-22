import { evaluate } from "mathjs";
import { formatExpression, formatNumber } from "./format";

const ALLOWED_EXPRESSION = /^[0-9+\-*/().%\s]+$/;

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
  const normalized = normalizeExpression(expression);
  if (!normalized) throw new Error("式を入力してください");
  if (!ALLOWED_EXPRESSION.test(normalized)) throw new Error("使用できない文字が含まれています");
  let depth = 0;
  for (const char of normalized) {
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (depth < 0) throw new Error("括弧の位置を確認してください");
  }
  if (depth !== 0) throw new Error("括弧が閉じていません");
  if (/[+\-*/.(]$/.test(normalized)) throw new Error("式が不完全です");
  return normalized;
}

function expandPercent(expression: string): string {
  let previous = expression;
  let next = previous.replace(/(\d+(?:\.\d+)?)%/g, "($1/100)");
  while (next !== previous) {
    previous = next;
    next = previous.replace(/(\([^()]+\))%/g, "($1/100)");
  }
  if (next.includes("%")) throw new Error("% の位置を確認してください");
  return next;
}

export function calculateExpression(expression: string): CalculationResult {
  const normalized = validateExpression(expression);
  let raw: unknown;
  try {
    raw = evaluate(expandPercent(normalized));
  } catch {
    throw new Error("式が不完全か、計算できない内容です");
  }
  const value = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(value)) {
    if (normalized.includes("/0")) throw new Error("0では割れません");
    throw new Error("計算結果を求められません");
  }
  if (Math.abs(value) > Number.MAX_SAFE_INTEGER) throw new Error("扱える桁数を超えました");
  return { value, resultText: formatNumber(value), displayExpression: formatExpression(normalized) };
}

export function appendInput(expression: string, input: string): string {
  const last = expression.at(-1) ?? "";
  const isOperator = /^[+*/]$/.test(input);
  if (isOperator && !expression) return expression;
  if (isOperator && /^[+\-*/.]$/.test(last)) return expression.slice(0, -1) + input;
  if (input === "-" && last === "-") return expression;
  if (input === ".") {
    const segment = expression.split(/[+\-*/()%]/).at(-1) ?? "";
    if (segment.includes(".")) return expression;
    if (!segment) return `${expression}0.`;
  }
  if (input === ")" && (!expression || /[+\-*/.(]$/.test(last))) return expression;
  if (input === "%" && (!expression || /[+\-*/.(%]$/.test(last))) return expression;
  return expression + input;
}

export function clearEntry(expression: string): string {
  return expression.replace(/-?\d*\.?\d+%?$/, "") || "";
}

export function toggleSign(expression: string): string {
  const match = expression.match(/(-?\d*\.?\d+)%?$/);
  if (!match || match.index === undefined) return expression ? `${expression}(-` : "-";
  const token = match[0];
  const replacement = token.startsWith("-") ? token.slice(1) : `-${token}`;
  return expression.slice(0, match.index) + replacement;
}
