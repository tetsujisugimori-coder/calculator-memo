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

// A minus belongs to the trailing number only in a unary position.
// In `12-34` it is the binary operator; in `12--34` only the last minus is unary.
export function trailingNumber(expression: string): { start: number; text: string } | null {
  const match = expression.trimEnd().match(/(?:\d+(?:\.\d*)?|\.\d+)(?:\s*%)?$/);
  if (!match || match.index === undefined) return null;
  let start = match.index;
  const prefix = expression.slice(0, start).trimEnd();
  if (normalizeExpression(prefix).endsWith("-")) {
    const beforeMinus = normalizeExpression(prefix.slice(0, -1));
    if (!beforeMinus || /[+\-*/(]$/.test(beforeMinus)) start = prefix.length - 1;
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
