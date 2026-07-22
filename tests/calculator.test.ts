import { describe, expect, it } from "vitest";
import { appendInput, calculateExpression, clearEntry, normalizeExpression, toggleSign } from "../lib/calculator";

describe("calculateExpression", () => {
  it.each([
    ["2+3", 5],
    ["2+3*4", 14],
    ["(2+3)*4", 20],
    ["10/4", 2.5],
    ["-3+1", -2],
    ["0.1+0.2", 0.30000000000000004],
    ["200*10%", 20],
  ])("calculates %s", (expression, expected) => {
    expect(calculateExpression(expression).value).toBe(expected);
  });

  it("rejects division by zero", () => expect(() => calculateExpression("1/0")).toThrow("0では割れません"));
  it("rejects incomplete expressions", () => expect(() => calculateExpression("2+")).toThrow("式が不完全です"));
  it("rejects unclosed parentheses", () => expect(() => calculateExpression("(2+3")).toThrow("括弧が閉じていません"));
  it("rejects executable or named input", () => expect(() => calculateExpression("import(1)")).toThrow("使用できない文字"));
});

describe("calculator input helpers", () => {
  it("normalizes display operators", () => expect(normalizeExpression("2 × 3 ＋ 1")).toBe("2*3+1"));
  it("replaces consecutive operators", () => expect(appendInput("2+", "*")).toBe("2*"));
  it("prevents duplicate decimals", () => expect(appendInput("1.2", ".")).toBe("1.2"));
  it("clears the current number", () => expect(clearEntry("12+34")).toBe("12+"));
  it("toggles the last number sign", () => expect(toggleSign("12+34")).toBe("12+-34"));
});
