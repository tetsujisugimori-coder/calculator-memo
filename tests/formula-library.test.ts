import { describe, expect, it } from "vitest";
import { inspectFormulaDefinition, calculateVariableExpression } from "../lib/calculator";
import { emptyFormulaLibrary, readFormulaLibrary, saveFormula, removeFormula } from "../lib/formula-library";
import { loadData } from "../lib/storage";
const formula = { id: "f1", title: "料金", expression: "price * quantity", createdAt: "2026-10-19T01:00:00Z", updatedAt: "2026-10-19T01:00:00Z" };
describe("formula definition inspection", () => {
  it("extracts ordered distinct variables without binding or evaluating", () => {
    expect(inspectFormulaDefinition("price * quantity + price + sqrt(x) + abs(y) + pi + e")).toEqual(["price", "quantity", "x", "y"]);
    expect(inspectFormulaDefinition("ex2 + price1e2 + X")).toEqual(["ex2", "price1e2", "X"]);
  });
  it.each(["1/0", "sqrt(-1)", "2^10001", "99999999999999999"])("does not claim numeric success for %s", (expression) => {
    expect(inspectFormulaDefinition(expression)).toEqual([]);
    expect(() => calculateVariableExpression(expression, new Map())).toThrow();
  });
  it.each(["a=2", "a(2)", "constructor", "a.b", "[1,2]", "a;2", "a%", "2x", "sin(x)", "sqrt(x,2)", "1e2", "0xff", "_a", "a +", "(a"])("rejects %s", (expression) => expect(() => inspectFormulaDefinition(expression)).toThrow());
  it("keeps resource boundaries", () => {
    expect(inspectFormulaDefinition(" ".repeat(1999) + "x")).toEqual(["x"]);
    expect(() => inspectFormulaDefinition(" ".repeat(2000) + "x")).toThrow();
    expect(() => inspectFormulaDefinition("(".repeat(33) + "x" + ")".repeat(33))).toThrow();
    expect(() => inspectFormulaDefinition(Array(140).fill("x").join("+"))).toThrow();
  });
});
describe("formula library persistence", () => {
  it("registers, edits with stable identity, selects, removes, and can restore", () => {
    const empty = emptyFormulaLibrary();
    const first = saveFormula(empty, formula);
    expect(empty.entries).toEqual([]);
    expect(first.selectedId).toBe("f1");
    const edited = saveFormula(first, { ...formula, expression: "price * quantity * 2" });
    expect(edited.entries).toHaveLength(1);
    expect(first.entries[0].expression).toBe(formula.expression);
    const removed = removeFormula(edited, "f1");
    expect(removed).toEqual(empty);
    expect(saveFormula(removed, edited.entries[0])).toEqual(edited);
  });
  it("round trips without storing fake inputs/results and preserves old data", () => {
    const old = { version: 1, history: [], notes: [], settings: { theme: "dark", activePanel: "notes" } };
    const read = (value: unknown) => loadData({ getItem: () => JSON.stringify(value) });
    expect(read(old)).toMatchObject({ status: "ok", data: old });
    const library = saveFormula(emptyFormulaLibrary(), formula);
    const result = read({ ...old, formulaLibrary: library });
    expect(result).toMatchObject({ status: "ok", data: { ...old, formulaLibrary: library } });
    expect(Object.keys(library.entries[0]).sort()).toEqual(["createdAt", "expression", "id", "title", "updatedAt"]);
  });
  it.each([null, {}, { version: 2, entries: [], selectedId: null }, { version: 1, entries: [formula, formula], selectedId: null }, { version: 1, entries: [], selectedId: "missing" }, { version: 1, entries: [{ ...formula, expression: "x=2" }], selectedId: null }])("protects invalid library raw instead of overwriting %j", (library) => {
    const raw = JSON.stringify({ version: 1, history: [], notes: [], settings: {}, formulaLibrary: library });
    expect(loadData({ getItem: () => raw })).toMatchObject({ status: "error", raw });
  });
  it("preserves supported-version extra metadata", () => {
    const value = { version: 1, selectedId: "f1", entries: [{ ...formula, futureMetadata: "keep" }], metadata: "keep" };
    expect(readFormulaLibrary(value)).toEqual(value);
  });
  it("bounds count and titles", () => {
    expect(() => saveFormula(emptyFormulaLibrary(), { ...formula, title: " " })).toThrow();
    expect(() => saveFormula(emptyFormulaLibrary(), { ...formula, title: "x".repeat(121) })).toThrow();
    const full = { version: 1 as const, selectedId: null, entries: Array.from({ length: 200 }, (_, i) => ({ ...formula, id: `f${i}` })) };
    expect(() => saveFormula(full, { ...formula, id: "new" })).toThrow();
    expect(saveFormula(full, formula).entries).toHaveLength(200);
  });
});
