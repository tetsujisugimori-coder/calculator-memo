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

describe("result chaining retains an editable decimal operand", () => {
  it.each([1e-7, -1e-7, 1.2345678901234567e-8, -1.2345678901234567e-8, 5e-324, -5e-324, 0, -0, 0.30000000000000004, Number.MAX_SAFE_INTEGER])("round-trips %s without display rounding", (value) => {
    const state = { ...confirmed, resultValue: value };
    const chained = next(state, { type: "input", value: "+" });
    const operand = chained.expression.slice(0, -1);
    expect(operand).toMatch(/^-?\d+(\.\d+)?$/);
    expect(Number(operand)).toBe(value === 0 ? 0 : value);
    expect(calculateExpression(chained.expression + "0").value).toBe(value === 0 ? 0 : value);
  });
  it.each([["+", 2.0000001], ["-", -1.9999999], ["*", 2e-7], ["/", 5e-8]] as const)("chains a small result through %s", (operator, expected) => {
    const value = calculateExpression("1/10000000").value;
    const chained = next({ ...confirmed, expression: "1/10000000", resultValue: value }, { type: "input", value: operator });
    expect(calculateExpression(chained.expression + "2").value).toBe(expected);
  });
  it("allows BS/CE/sign edits on the chained operand and preserves PR13 original-expression edits", () => {
    const small = { ...confirmed, expression: "1/10000000", resultValue: 1e-7 };
    expect(next(small, { type: "backspace" }).expression).toBe("1/1000000");
    let state = next(small, { type: "input", value: "*" });
    state = next(state, { type: "backspace" });
    expect(next(state, { type: "sign" }).expression).toBe("-0.0000001");
    expect(next(state, { type: "clear-entry" }).expression).toBe("");
    expect(calculateExpression(next(state, { type: "sign" }).expression).value).toBe(-1e-7);
  });
});

describe("state transition audit boundaries", () => {
  it.each([
    ["12+3%", "input", "%", "12+3%"],
    ["(12+3)", "clear-entry", "", "(12+3)"],
    ["12+3", "input", ")", "12+3)"],
  ] as const)("even unchanged edits reopen %s conservatively", (expression, type, value, expected) => {
    const action: InputAction = type === "input" ? { type, value } : { type };
    expect(next({ ...confirmed, expression }, action)).toEqual({ expression: expected, resultValue: 0, afterEquals: false, error: "" });
  });
  it.each([
    ["(2+3", ")", "(2+3)", 5],
    ["12+", "*", "12*", 24],
  ] as const)("repairs error %s without stale result chaining", (expression, input, expected, value) => {
    let state = next({ ...confirmed, expression, afterEquals: false, error: "invalid" }, { type: "input", value: input });
    expect(state.expression).toBe(expected);
    if (expression === "12+") state = next(state, { type: "input", value: "2" });
    expect(calculateExpression(state.expression).value).toBe(value);
  });
  it("edits a restored or confirmed spaced negative operand", () => {
    for (const afterEquals of [false, true]) {
      const state = { ...confirmed, expression: "12 * - 34 ", resultValue: -408, afterEquals };
      expect(next(state, { type: "sign" }).expression).toBe("12 * 34");
      expect(next(state, { type: "clear-entry" }).expression).toBe("12 * ");
    }
  });
  it.each([NaN, Infinity, -Infinity, 1e21, -1e21, Number.MAX_VALUE])("does not expand evaluator limits for unreachable result %s", (value) => {
    const expression = next({ ...confirmed, resultValue: value }, { type: "input", value: "+" }).expression + "0";
    expect(expression.length).toBeLessThanOrEqual(312);
    expect(() => calculateExpression(expression)).toThrow();
    if (Number.isFinite(value)) expect(expression).not.toContain("e");
  });
  it("keeps external exponent syntax rejected", () => {
    expect(() => calculateExpression("1e-7*2")).toThrow("使用できない文字");
  });
});
