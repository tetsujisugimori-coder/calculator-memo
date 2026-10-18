import { appendInput, clearEntry, toggleSign } from "./calculator";

export type InputState = { expression: string; afterEquals: boolean; error: string; resultValue: number };
export type InputAction = { type: "input"; value: string } | { type: "backspace" | "clear-entry" | "sign" | "clear" };

// Number#toString switches small results to e-notation, which the expression
// grammar and trailing-number editor do not accept. Expand that exact numeric
// string instead of reusing the rounded/localized display result.
function resultOperand(value: number): string {
  const text = String(value);
  if (!text.includes("e")) return text;
  const [mantissa, exponent] = text.split("e");
  const sign = mantissa.startsWith("-") ? "-" : "";
  const unsigned = mantissa.replace(/^-/, "");
  const [whole, fraction = ""] = unsigned.split(".");
  const digits = whole + fraction;
  const position = whole.length + Number(exponent);
  if (position <= 0) return `${sign}0.${"0".repeat(-position)}${digits}`;
  if (position >= digits.length) return sign + digits + "0".repeat(position - digits.length);
  return `${sign}${digits.slice(0, position)}.${digits.slice(position)}`;
}

// Editing reopens the original expression and invalidates its confirmed result.
export function transitionInput(state: InputState, action: InputAction) {
  let expression = state.expression;
  if (action.type === "clear") expression = "";
  else if (action.type === "backspace") expression = expression.slice(0, -1);
  else if (action.type === "clear-entry") expression = clearEntry(expression);
  else if (action.type === "sign") expression = toggleSign(expression);
  else if (action.type === "input") {
    const fresh = (state.afterEquals || Boolean(state.error)) && /^[0-9.(]$/.test(action.value);
    if (fresh) expression = "";
    else if (state.afterEquals && /^[+\-*/]$/.test(action.value)) expression = resultOperand(state.resultValue);
    expression = appendInput(expression, action.value);
  }
  return { expression, afterEquals: false as const, error: "" };
}
