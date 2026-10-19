import { describe, expect, it } from "vitest";
import { executeFormula, executionHistory, executionMemo, executionNumber, inputNumber, noteVariableInputs, readExecutionDrafts } from "../lib/formula-execution";
import { calculateExpression, calculateVariableExpression } from "../lib/calculator";
import { calculateMemoBlock } from "../lib/memo-blocks";
import { defaultData, loadData } from "../lib/storage";
import type { RegisteredFormula, PlainCalculationNote } from "../lib/types";
const formula = (expression = "price * quantity", title = "price"): RegisteredFormula => ({ id: "stable-id", title, expression, createdAt: "2026-10-19T04:00:00Z", updatedAt: "2026-10-19T04:00:00Z" });
const load = (value: unknown) => loadData({ getItem: () => JSON.stringify(value) });

describe("registered formula execution", () => {
  it("binds AST variables only, snapshots only used values and leaves definition unchanged", () => {
    const f = formula(); const before = structuredClone(f); const inputs = { price: "1200", quantity: "5", irrelevant: "9" };
    const run = executeFormula(f, inputs); inputs.price = "3";
    expect(run.value).toBe(6000); expect(run.inputs).toEqual({ price: "1200", quantity: "5" }); expect(f).toEqual(before);
    expect(executeFormula(f, { price: "10", quantity: "2" }).value).toBe(20);
    expect(run.value).toBe(6000);
  });
  it("distinguishes identifiers, constants and registered names; no implicit call or assignment", () => {
    expect(executeFormula(formula("x + x1 + pi + e", "x"), { x: "2", x1: "4" }).value).toBe(6 + Math.PI + Math.E);
    expect(() => executeFormula(formula("price(2)"), { price: "3" })).toThrow();
    expect(() => executeFormula(formula("x = 2"), {})).toThrow();
  });
  it.each(["", " "])("rejects missing input %j", text => expect(() => executeFormula(formula("x"), { x: text })).toThrow("未入力"));
  it.each(["2+3", "1e3", "0x10", "Infinity", "NaN", "1,200", "１２", "--2", "2x"])("rejects invalid input %s", text => expect(() => inputNumber(text, "x")).toThrow("数値を入力"));
  it("rejects inherited inputs and preserves sign and ordinary decimals", () => {
    expect(() => executeFormula(formula("x"), Object.create({ x: "3" }))).toThrow("未入力");
    expect(Object.is(inputNumber("-0", "x"), -0)).toBe(true);
    expect(inputNumber(" +.25 ", "x")).toBe(.25);
  });
  it("handles runtime failures and recovers with new values", () => {
    expect(() => executeFormula(formula("x / y"), { x: "1", y: "0" })).toThrow();
    expect(executeFormula(formula("x / y"), { x: "1", y: "4" }).value).toBe(.25);
    expect(() => executeFormula(formula("sqrt(x)"), { x: "-1" })).toThrow();
    expect(() => executeFormula(formula("x ^ y"), { x: "2", y: "10001" })).toThrow();
    expect(() => executeFormula(formula("x ^ y"), { x: "2", y: "1024" })).toThrow();
    expect(() => executeFormula(formula("x * 2"), { x: String(Number.MAX_SAFE_INTEGER) })).toThrow("桁数");
    expect(() => inputNumber("9".repeat(309), "x")).toThrow("有限");
    expect(() => inputNumber("1".repeat(2001), "x")).toThrow("長すぎ");
  });
  it("maintains parser resource limits", () => {
    expect(() => executeFormula(formula("x" + " ".repeat(2000)), { x: "1" })).toThrow();
    expect(() => executeFormula(formula("(".repeat(33) + "x" + ")".repeat(33)), { x: "1" })).toThrow();
    expect(() => executeFormula(formula(Array(130).fill("x").join("+")), { x: "1" })).toThrow();
    expect(() => executeFormula(formula("sin(x)"), { x: "1" })).toThrow();
  });
  it("keeps display rounding separate from raw value and transfer's legacy display", () => {
    const run = executeFormula(formula("subtotal*(1+tax)"), { subtotal: "6000", tax: ".1" });
    expect(run.value).toBe(6600.000000000001); expect(run.resultText).toBe("6,600");
    const history = executionHistory(run, "h", "now");
    expect(Object.is(history.result, run.value)).toBe(true);
    expect(history.resultText).toBe(calculateExpression(history.expression).resultText);
    expect(history.formulaExecution?.formulaId).toBe("stable-id");
    expect(executionMemo(run).note).toContain("元の式: subtotal*(1+tax)");
  });
  it.each([-0, Number.MIN_VALUE, -Number.MIN_VALUE, 1e-7, -1e-7, Math.PI, Number.MAX_SAFE_INTEGER])("preserves exact operand %s including -0 and tiny values", value => {
    const text = executionNumber(value); expect(text).not.toMatch(/[eE]/); expect(Object.is(Number(text), value)).toBe(true);
    const run = executeFormula(formula("x"), { x: text });
    expect(Object.is(run.value, value)).toBe(true);
    expect(Object.is(executionHistory(run, "h", "now").result, value)).toBe(true);
  });
  it("keeps completed result but blocks handoff when expansion exceeds safety limits", () => {
    const run = executeFormula(formula(Array(8).fill("x").join("+")), { x: executionNumber(Number.MIN_VALUE) });
    expect(run.value).toBe(Number.MIN_VALUE * 8); expect(run.boundExpression).toBeNull(); expect(run.transferError).toContain("渡せません");
    expect(() => executionHistory(run, "h", "now")).toThrow();
  });
  it("re-evaluates at transfer and refuses a mismatched result", () => {
    const run = executeFormula(formula("x+1"), { x: "2" });
    expect(() => executionHistory({ ...run, value: 9 }, "h", "now")).toThrow("同一");
  });
  it("supports no-variable definitions and preserves old percent limitation", () => {
    expect(executeFormula(formula("2*pi"), {}).value).toBe(2 * Math.PI);
    expect(executeFormula(formula("50%"), {}).value).toBe(.5);
    expect(() => executeFormula(formula("x%"), { x: "50" })).toThrow();
    expect(() => executeFormula(formula("((50+50))%"), {})).toThrow();
  });
  it("recomputes only selected note's final scope, ignoring cached values and text", () => {
    const note: PlainCalculationNote = { id: "n", type: "plain-calculation", title: "n", content: "x=999", createdAt: "now", updatedAt: "now", blocks: [
      calculateMemoBlock("1", "x=10", "note-variables"), calculateMemoBlock("2", "y=x*2", "note-variables"), calculateMemoBlock("3", "x=20", "note-variables"), calculateMemoBlock("4", "x=1/0", "note-variables"),
      { id: "5", type: "text", content: "z=42" }, calculateMemoBlock("6", "2*4"),
    ] };
    note.blocks![0] = { ...note.blocks![0], result: 999 } as NonNullable<typeof note.blocks>[number];
    expect(noteVariableInputs(note)).toEqual({ x: "20", y: "20" });
    expect(noteVariableInputs({ ...note, id: "other", blocks: [] })).toEqual({});
  });
  it("matches an independently computed 500-case arithmetic corpus", () => {
    for (let i = 1; i <= 500; i++) {
      const a = (i - 251) / 8, b = i % 13 + 1;
      const run = executeFormula(formula("abs(a)*b+sqrt(b^2)"), { a: String(a), b: String(b) });
      expect(run.value).toBe(Math.abs(a) * b + Math.sqrt(b ** 2));
      expect(Object.is(executionHistory(run, "h", "now").result, run.value)).toBe(true);
    }
  });
  it("does not mutate the existing variable evaluation contract", () => {
    expect(executeFormula(formula("2^3^2 + x"), { x: "-1" }).value).toBe(511);
    expect(executeFormula(formula("-x^2"), { x: "-3" }).value).toBe(calculateVariableExpression("-x^2", new Map([["x", -3]])).value);
  });
});

describe("execution draft persistence", () => {
  const draft = { formulaId: "stable-id", expression: "x+1", inputs: { x: "-" } };
  it("preserves partial invalid input and old format compatibility without saving results", () => {
    const old = load(defaultData); expect(old.status).toBe("ok");
    const loaded = load({ ...defaultData, formulaExecutions: [draft] });
    expect(loaded.status).toBe("ok"); if (loaded.status === "ok") expect(loaded.data.formulaExecutions).toEqual([draft]);
    expect(readExecutionDrafts([draft])[0]).not.toHaveProperty("value");
  });
  it.each([null, {}, [{ ...draft, inputs: { x: 2 } }], [{ ...draft, inputs: { constructor: "2" } }], [draft, draft], [{ ...draft, inputs: { x: "1".repeat(2001) } }], [{ ...draft, expression: " ".repeat(2001) }]])("retains raw malformed data for recovery", value => {
    const input = { ...defaultData, formulaExecutions: value }; const loaded = load(input);
    expect(loaded.status).toBe("error"); if (loaded.status === "error") expect(loaded.raw).toBe(JSON.stringify(input));
  });
  it("retains stable IDs and inputs even if definition was changed or deleted", () => {
    expect(readExecutionDrafts([draft])[0]).toEqual(draft);
  });
});
