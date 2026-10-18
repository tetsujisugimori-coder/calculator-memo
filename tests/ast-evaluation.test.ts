import { beforeEach, describe, expect, it, vi } from "vitest";

const calls = vi.hoisted(() => new Map<string, number>());
vi.mock("mathjs", async (importOriginal) => {
  const math = await importOriginal<typeof import("mathjs")>();
  const wrapped = Object.fromEntries(["add", "subtract", "multiply", "divide", "pow", "unaryPlus", "unaryMinus", "sqrt", "abs"].map((name) => [name, (...args: number[]) => {
    calls.set(name, (calls.get(name) ?? 0) + 1);
    return (math[name as keyof typeof math] as (...values: number[]) => unknown)(...args);
  }]));
  return { ...math, ...wrapped };
});
import { calculateExpression, calculateVariableExpression } from "../lib/calculator";
import { Node } from "mathjs";

beforeEach(() => calls.clear());

describe("validated single-pass AST evaluation", () => {
  it("evaluates each arithmetic/function node once without subtree compilation", () => {
    const subtree = vi.spyOn(Node.prototype, "evaluate").mockImplementation(() => { throw new Error("subtree reevaluation"); });
    try {
      expect(calculateExpression("abs(-2)+sqrt(9)*2^3-+pi/e").value).toBe(26 - Math.PI / Math.E);
      expect(Object.fromEntries(calls)).toEqual({ unaryMinus: 1, abs: 1, sqrt: 1, pow: 1, multiply: 1, add: 1, unaryPlus: 1, divide: 1, subtract: 1 });
      expect(subtree).not.toHaveBeenCalled();
    } finally { subtree.mockRestore(); }
  });
  it("evaluates variable references without recursively reevaluating definitions", () => {
    const scope = new Map([["x", 3]]);
    expect(calculateVariableExpression("x*x+x", scope).value).toBe(12);
    expect(Object.fromEntries(calls)).toEqual({ multiply: 1, add: 1 });
    calls.clear();
    expect(() => calculateVariableExpression("1/0+missing", scope)).toThrow("未定義");
    expect(calls.size).toBe(0);
  });
  it("does not repeat operations on deep allowed trees", () => {
    expect(calculateExpression(Array(31).fill("1").join("+")).value).toBe(31);
    expect(calls.get("add")).toBe(30);
    calls.clear();
    expect(calculateExpression("sqrt(".repeat(15) + "4" + ")".repeat(15)).value).toBeGreaterThan(1);
    expect(calls.get("sqrt")).toBe(15);
  });
  it.each([
    ["1/0+sqrt()", "sqrt・absは引数を1つ指定してください"],
    ["sqrt(-1)+pi(2)", "sqrt・absは引数を1つ指定してください"],
    ["1/0+2pi", "使用できない演算です。掛け算には*を入力してください"],
  ])("finishes validating before evaluating %s", (expression, message) => {
    expect(() => calculateExpression(expression)).toThrow(message);
    expect(calls.size).toBe(0);
  });
  it.each([
    ["1/0+1^10001", "0では割れません"], ["1^10001+1/0", "指数の絶対値は10000以下にしてください"],
    ["sqrt(-1)+1/0", "有限の実数として計算できません"], ["1/0+sqrt(-1)", "0では割れません"],
    ["0^(1/0)", "0では割れません"], ["2^10001/0", "指数の絶対値は10000以下にしてください"],
  ])("preserves left-to-right runtime error precedence for %s", (expression, message) => {
    expect(() => calculateExpression(expression)).toThrow(message);
  });
  it("applies safe magnitude only to the final result", () => {
    expect(calculateExpression("9007199254740992-9007199254740992").value).toBe(0);
    expect(() => calculateExpression("9007199254740992")).toThrow("扱える桁数を超えました");
  });
  it.each(["-0", "sqrt(-0)", "(-0)^3"])("preserves signed zero in %s", (expression) => {
    expect(Object.is(calculateExpression(expression).value, -0)).toBe(true);
    expect(calculateExpression(expression).resultText).toBe("0");
  });
  it("preserves absolute zero and exponent boundaries", () => {
    expect(Object.is(calculateExpression("abs(-0)").value, 0)).toBe(true);
    expect(calculateExpression("1^10000").value).toBe(1);
    expect(calculateExpression("1^(-10000)").value).toBe(1);
    expect(() => calculateExpression("1^10001")).toThrow("指数の絶対値");
    expect(() => calculateExpression("1^(-10001)")).toThrow("指数の絶対値");
  });
  it("preserves exact length, depth and node count limits", () => {
    expect(calculateExpression(" ".repeat(1999)+"1").value).toBe(1);
    expect(() => calculateExpression(" ".repeat(2000)+"1")).toThrow("2000文字");
    expect(calculateExpression("(".repeat(31)+"1"+")".repeat(31)).value).toBe(1);
    expect(() => calculateExpression("(".repeat(32)+"1"+")".repeat(32))).toThrow("複雑");
    const tree = (leaves: number): string => leaves === 1 ? "1" : `(${tree(Math.floor(leaves/2))}+${tree(Math.ceil(leaves/2))})`;
    // 85 leaves + 84 additions + 84 parentheses = 253 nodes.
    expect(calculateExpression("---" + tree(85)).value).toBe(-85); // 256
    expect(() => calculateExpression("----"+tree(85))).toThrow("複雑"); // 257
  });
});
