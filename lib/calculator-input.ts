import { appendInput, clearEntry, toggleSign } from "./calculator";

export type InputState = { expression: string; afterEquals: boolean; error: string; resultValue: number };
export type InputAction = { type: "input"; value: string } | { type: "backspace" | "clear-entry" | "sign" | "clear" };

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
    else if (state.afterEquals && /^[+\-*/]$/.test(action.value)) expression = String(state.resultValue);
    expression = appendInput(expression, action.value);
  }
  return { expression, afterEquals: false as const, error: "" };
}
