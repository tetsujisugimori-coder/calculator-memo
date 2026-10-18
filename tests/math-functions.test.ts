import { describe, expect, it } from "vitest";
import { appendInput, calculateExpression, clearEntry, EXPRESSION_LIMITS, toggleSign, trailingNumber } from "../lib/calculator";
import { transitionInput, type InputState } from "../lib/calculator-input";
import { createHistoryEntry } from "../lib/history";
import { calculateMemoBlock, recalculateMemoBlocks } from "../lib/memo-blocks";
import { loadData, STORAGE_KEY } from "../lib/storage";
import { expressionFromSearch } from "../lib/url-expression";

describe("bounded basic mathematics", () => {
  it.each([
    ["2^8", 256], ["3^2+4^2", 25], ["2^3^2", 512], ["(2^3)^2", 64],
    ["-2^2", -4], ["(-2)^2", 4], ["2^-2", .25], ["2^(-2)", .25],
    ["2*3^2", 18], ["(-2)^3", -8], ["0^0", 1],
    ["sqrt(144)", 12], ["sqrt(2)", Math.sqrt(2)], ["sqrt(0)", 0],
    ["abs(-15)", 15], ["abs(3-8)", 5], ["sqrt(abs(-9))", 3],
    ["pi", Math.PI], ["e", Math.E], ["2*pi", 2*Math.PI], ["e^2", Math.E**2],
    ["sqrt(3^2+4^2)+abs(-2)+2*pi", 7+2*Math.PI],
    ["1^10000", 1], ["1^(-10000)", 1], ["2^-1074", Number.MIN_VALUE],
    ["2(3+4)", 14], ["2(3)(4)", 24], ["200*(5%+5%)", 20], ["(50+50)%", 1],
  ])("evaluates %s with mathjs precedence", (expression, expected) => {
    expect(calculateExpression(expression).value).toBe(expected);
  });
  it.each([
    "sin(0)", "log(e)", "factorial(3)", "import(1)", "evaluate(1)", "constructor(1)",
    "x=2", "f(x)=x", "a", "PI", "E", "pi(2)", "sqrt()", "sqrt(1,2)", "abs()", "abs(1,2)",
    "[1,2]", "{a:1}", "pi.foo", "pi[0]", "1:3", "1;2", "1<2", "true", "1?2:3", '"2"',
    "3!", "2 mod 1", "2cm", "2pi", "sqrt(4)abs(-2)", "1e-7", "2e3", "1E3", "e2",
    "sqrt(-1)", "(-1)^0.5", "0^-1", "2^1024", "999999999999999999999", "2^10001", "1^(-10001)",
    "2^(10^10)", "1^(10^10)", "2^2^2^2^2", "1/(1/0)", "sqrt(-1)^2", "abs(sqrt(-1))",
  ])("rejects unsupported, non-real or excessive %s", (expression) => {
    expect(() => calculateExpression(expression)).toThrow();
  });
  it.each(["sqrt(100)%", "sqrt(100%)", "abs(-100)%", "2^3%", "2%^3", "pi%", "e+10%"])("rejects new/legacy percent mixing explicitly: %s", (expression) => {
    expect(() => calculateExpression(expression)).toThrow("%の組合せ");
  });
  it("retains Issue 19 as known behavior, not an incidental fix", () => {
    expect(() => calculateExpression("((1+2))%")).toThrow();
    expect(() => calculateExpression(".5%")).toThrow();
  });
  it("bounds unnormalized length, parentheses and AST complexity before evaluation", () => {
    expect(() => calculateExpression(" ".repeat(EXPRESSION_LIMITS.length) + "1")).toThrow("2000文字");
    expect(() => calculateExpression("(".repeat(33) + "1" + ")".repeat(33))).toThrow("深すぎ");
    expect(() => calculateExpression("-".repeat(40) + "1")).toThrow("複雑");
    const balanced = (n: number): string => n === 0 ? "1" : `(${balanced(n-1)}+${balanced(n-1)})`;
    expect(() => calculateExpression(balanced(7))).toThrow("複雑");
  });
  it("keeps raw precision separate from formatted display", () => {
    const result = calculateExpression("sqrt(2)");
    expect(result.value).toBe(Math.sqrt(2));
    expect(result.resultText).toBe("1.414213562373");
    expect(result.value).not.toBe(Number(result.resultText));
  });
});

describe("math editing preserves original-expression contracts", () => {
  const state: InputState = { expression: "12+3", resultValue: 15, afterEquals: true, error: "" };
  it("continues from the exact result with a power", () => {
    const next = transitionInput(state, { type: "input", value: "^" });
    expect(next).toEqual({ expression: "15^", afterEquals: false, error: "" });
    expect(calculateExpression(next.expression+"2").value).toBe(225);
  });
  it("squares a negative confirmed result as a signed operand", () => {
    const chained = transitionInput({ ...state, expression: "1-4", resultValue: -3 }, { type: "input", value: "^" });
    expect(chained.expression).toBe("(-3)^");
    expect(calculateExpression(chained.expression + "2").value).toBe(9);
  });
  it("replaces the expression, invalidating old results or errors", () => {
    for (const previous of [state, { ...state, error: "invalid", afterEquals: false }]) {
      expect(transitionInput(previous, { type: "replace", value: "sqrt(2)" })).toEqual({ expression: "sqrt(2)", afterEquals: false, error: "" });
    }
  });
  it("treats power as an operator for input and trailing signed numbers", () => {
    expect(appendInput("2^", ".")).toBe("2^0.");
    expect(appendInput("2^", ")")).toBe("2^");
    expect(appendInput("2^", "%")).toBe("2^");
    expect(trailingNumber("2^-3")).toEqual({ start: 2, text: "-3" });
    expect(clearEntry("2^-3")).toBe("2^");
    expect(toggleSign("2^-3")).toBe("2^3");
  });
  it.each(["sqrt(4)", "abs(-2)", "pi", "e"])("preserves no trailing numeric-entry behavior for %s", (expression) => {
    const completed = { ...state, expression, resultValue: calculateExpression(expression).value };
    expect(transitionInput(completed, { type: "clear-entry" }).expression).toBe(expression);
    expect(transitionInput(completed, { type: "sign" }).expression).toBe(expression+"(-");
    expect(transitionInput(completed, { type: "backspace" }).expression).toBe(expression.slice(0,-1));
    expect(transitionInput(completed, { type: "input", value: "2" }).expression).toBe("2");
  });
});

describe("shared history, memo, storage and URL math contract", () => {
  it("round-trips unrounded results and original expressions without schema changes", () => {
    const expression = "sqrt(2)+2*pi";
    const entry = createHistoryEntry(expression, "synthetic-history", "2026-10-18T00:00:00Z");
    const single = { ...entry, id: "synthetic-single", type: "calculation", schemaVersion: 1, title: "test", latexExpression: null, unit: "", note: "", tags: [], relatedMemoName: "", displayMode: "plain", updatedAt: entry.createdAt };
    const block = calculateMemoBlock("synthetic-block", expression);
    const note = { id: "synthetic-note", type: "plain-calculation", title: "test", content: "", createdAt: entry.createdAt, updatedAt: entry.createdAt, blocks: [{ id: "text", type: "text", content: "keep" }, block] };
    const raw = JSON.stringify({ version: 1, history: [entry], notes: [single, note], settings: { theme: "system", activePanel: "history" } });
    const loaded = loadData({ getItem: (key) => key === STORAGE_KEY ? raw : null });
    expect(loaded.status).toBe("ok");
    if (loaded.status !== "ok") throw new Error("storage fixture failed");
    expect(loaded.data.history[0]).toEqual(entry);
    expect(loaded.data.notes[0]).toEqual(single);
    expect(loaded.data.notes[1]).toEqual(note);
    expect(recalculateMemoBlocks(note.blocks as Parameters<typeof recalculateMemoBlocks>[0])).toEqual(note.blocks);
    expect(block.result).toBe(entry.result);
    expect(entry.result).toBe(Math.sqrt(2)+2*Math.PI);
    const fromURL = expressionFromSearch("?" + new URLSearchParams({ expr: expression }));
    expect(fromURL).toBe(expression);
    expect(calculateExpression(fromURL!).value).toBe(entry.result);
  });
});
