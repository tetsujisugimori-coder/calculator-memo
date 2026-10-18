import { describe, expect, it } from "vitest";
import { calculateExpression } from "../lib/calculator";
import { transitionInput, type InputState, type InputAction } from "../lib/calculator-input";
const confirmed: InputState = { expression: "12+3", resultValue: 15, afterEquals: true, error: "" };
const next = (state: InputState, action: InputAction): InputState => ({ ...state, ...transitionInput(state, action), resultValue: 0 });
describe("confirmed and error input transitions", () => {
  it.each([ ["backspace", "12+", 16], ["clear-entry", "12+", 16], ["sign", "12+-3", 9] ] as const)("%s reopens original expression", (type, expression, value) => {
    let state = next(confirmed, { type });
    expect(state).toEqual({ expression, afterEquals: false, error: "", resultValue: 0 });
    if (type !== "sign") state = next(state, { type: "input", value: "4" });
    expect(calculateExpression(state.expression).value).toBe(value);
  });
  it.each([["4", "4"], [".", "0."], ["(", "("], ["+", "15+"], ["-", "15-"], ["*", "15*"], ["/", "15/"]])("confirmed input %s", (value, expression) => {
    expect(next(confirmed, { type: "input", value })).toEqual({ expression, afterEquals: false, error: "", resultValue: 0 });
  });
  it("chains from confirmed result", () => {
    const state = next(next(confirmed, { type: "input", value: "+" }), { type: "input", value: "2" });
    expect(calculateExpression(state.expression).value).toBe(17);
  });
  it("two sign edits remain unconfirmed", () => {
    expect(next(next(confirmed, { type: "sign" }), { type: "sign" })).toEqual({ ...confirmed, afterEquals: false, resultValue: 0 });
  });
  it.each(["+", "*", "/"])("empty CE cannot resurrect result via %s", (value) => {
    const state = next({ ...confirmed, expression: "3", resultValue: 3 }, { type: "clear-entry" });
    expect(next(state, { type: "input", value }).expression).toBe("");
    expect(next(state, { type: "input", value: "." }).expression).toBe("0.");
  });
  it("clear/backspace/CE empty boundary and negative start", () => {
    let state = next(confirmed, { type: "clear" });
    state = next(next(state, { type: "backspace" }), { type: "clear-entry" });
    expect(state.expression).toBe("");
    expect(next(state, { type: "input", value: "-" }).expression).toBe("-");
  });
  const error = { ...confirmed, expression: "8/0", afterEquals: false, error: "division by zero" };
  it.each([["4", "4"], [".", "0."], ["(", "("]])("error fresh input %s", (value, expression) => {
    expect(next(error, { type: "input", value })).toEqual({ expression, afterEquals: false, error: "", resultValue: 0 });
  });
  it.each(["backspace", "clear-entry"] as const)("error %s repairs failed expression", (type) => {
    expect(calculateExpression(next(next(error, { type }), { type: "input", value: "2" }).expression).value).toBe(4);
  });
  it("error sign/operator edit failed expression and clear resets", () => {
    expect(next(error, { type: "sign" }).expression).toBe("8/-0");
    expect(next(error, { type: "input", value: "+" }).expression).toBe("8/0+");
    expect(next(error, { type: "clear" }).expression).toBe("");
  });
});
