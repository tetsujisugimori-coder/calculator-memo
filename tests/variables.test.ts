import { describe, expect, it } from "vitest";
import { calculateExpression, calculateVariableExpression, EXPRESSION_LIMITS } from "../lib/calculator";
import { calculateMemoBlock, recalculateMemoBlocks, sanitizeMemoBlocks } from "../lib/memo-blocks";
import type { CalculationMemoBlock, MemoBlock } from "../lib/types";

const block = (expression: string, id = expression) => calculateMemoBlock(id, expression, "note-variables");
const run = (...expressions: string[]) => recalculateMemoBlocks(expressions.map(expression => block(expression))) as CalculationMemoBlock[];

describe("explicit note-local variables", () => {
  it("evaluates the requested totals in source order", () => {
    const results = run("price = 1200", "quantity = 5", "subtotal = price * quantity", "tax = 0.10", "total = subtotal * (1 + tax)");
    expect(results.map(x => x.result)).toEqual([1200, 5, 6000, .1, calculateExpression("6000*(1+0.10)").value]);
    expect(results[4].resultText).toBe("6,600");
    expect(results[4].result).toBeCloseTo(6600, 10);
  });
  it("takes snapshots and permits previously defined self-reference", () => {
    expect(run("x=10", "y=x*2", "x=20", "x=x+1", "y").map(x => x.result)).toEqual([10,20,20,21,20]);
    expect(run("x=x+1")[0].error).toContain("未定義");
  });
  it("keeps a previous successful value after failed reassignment", () => {
    const result = run("x=10", "x=1/0", "x", "y=unknown", "2+3");
    expect(result.map(x => x.result)).toEqual([10,null,10,null,5]);
    expect(result[1].error).toContain("0では");
  });
  it("rebuilds scope after edits, deletion and movement", () => {
    const original = run("x=10", "y=x*2");
    expect((recalculateMemoBlocks([original[1]])[0] as CalculationMemoBlock).error).toContain("未定義");
    expect((recalculateMemoBlocks([original[1],original[0]])[0] as CalculationMemoBlock).error).toContain("未定義");
    expect((recalculateMemoBlocks([block("x=20"), original[1]])[1] as CalculationMemoBlock).result).toBe(40);
  });
  it("does not leak between notes, calculator, legacy blocks or text/formula", () => {
    run("price=3");
    expect(run("price")[0].error).toContain("未定義");
    expect(() => calculateExpression("price")).toThrow();
    const source: MemoBlock[] = [{id:"t",type:"text",content:"price=99"}, {id:"f",type:"formula",latex:"price=98"}, block("price")];
    expect((recalculateMemoBlocks(source)[2] as CalculationMemoBlock).error).toContain("未定義");
    expect((recalculateMemoBlocks([block("x=10"),calculateMemoBlock("legacy","x")])[1] as CalculationMemoBlock).error).not.toBeNull();
  });
  it("preserves raw precision, signed zero and identifier digits", () => {
    expect(run("third=1/3", "third*3")[1].result).toBe(1);
    expect(Object.is(run("z=-0", "z")[1].result,-0)).toBe(true);
    expect(run("price1234=2", "b1e2=3", "ex2=4", "price1234+b1e2+ex2")[3].result).toBe(9);
    expect(run("price1234=2")[0].displayExpression).toBe("price1234=2");
    expect(run("X=2", "x=3", "X+x")[2].result).toBe(5);
  });
  it.each(["pi=1","e=1","sqrt=1","abs=1","constructor=1","prototype=1","toString=1","__proto__=1","1x=1","a.b=1","a[0]=1","a=b=1","a==1","f(x)=1","[1,2]","a=1;2","a=1\nb=2","a b","1e2",".1e2","a=0x10","a=0b10","a=0o10","x%","sqrt(-1)","1/0","2^10001","2^1024"])("rejects %s", expression => {
    expect(block(expression).error).not.toBeNull();
  });
  it("maintains all resource limits including the assignment prefix", () => {
    expect(block("x="+" ".repeat(EXPRESSION_LIMITS.length)+"1").error).toContain("2000");
    expect(block("x="+"(".repeat(33)+"1"+")".repeat(33)).error).not.toBeNull();
    expect(block("x="+Array(130).fill("1").join("+")).error).not.toBeNull();
    expect(block("x=2^10001").error).toContain("10000");
    expect(block("x=9007199254740992").error).not.toBeNull();
    expect(calculateVariableExpression("sqrt(144)+abs(-3)+pi+e",new Map()).value).toBe(15+Math.PI+Math.E);
  });
  it("only cleans nonzero integer-near display noise without altering raw values", () => {
    for (const expression of ["1/3", "sqrt(2)", "1234567890123", "1/1000000000000000", "-0", "123.456"]) {
      const legacy = calculateExpression(expression);
      const current = block(expression);
      expect(Object.is(current.result, legacy.value)).toBe(true);
      expect(current.resultText).toBe(legacy.resultText);
    }
    const results = run("total=6000*(1+0.1)", "total-6600");
    expect(results[0].resultText).toBe("6,600");
    expect(results[1].result).toBe(6000*(1+0.1)-6600);
    expect(results[1].result).not.toBe(0);
  });
  it("rejects corrupt scope values and never executes arbitrary calls", () => {
    expect(() => calculateVariableExpression("bad",new Map([["bad",Infinity]]))).toThrow();
    expect(block("import(1)").error).not.toBeNull();
    expect(block("sqrt(1,2)").error).not.toBeNull();
  });
  it("retains legacy x multiplication and requires an explicit opt-in", () => {
    for (const expression of ["2x3", "2 X 3", "ex2", "pix2", "200*10%", "2(3+4)"]) {
      expect(calculateMemoBlock("old",expression).result).toBe(calculateExpression(expression).value);
      expect(calculateMemoBlock("old",expression)).not.toHaveProperty("evaluationMode");
    }
    expect(run("ex2=9","ex2")[1].result).toBe(9);
    expect(block("2x3").error).not.toBeNull();
    expect(block("200*10%").result).toBe(20);
    expect(calculateMemoBlock("future","2+3","future-mode").error).toContain("未対応");
  });
  it("round-trips old and new markers without a schema migration", () => {
    const old = calculateMemoBlock("old","ex2");
    const current = run("x=10","x*2");
    const restored = sanitizeMemoBlocks(JSON.parse(JSON.stringify([old,...current])))!;
    expect(restored[0]).not.toHaveProperty("evaluationMode");
    expect(restored).toEqual([old,...current]);
    expect(recalculateMemoBlocks(restored)).toEqual(restored);
    expect(sanitizeMemoBlocks([{...old,evaluationMode:3}])).toBeUndefined();
    const unknown = sanitizeMemoBlocks(JSON.parse(JSON.stringify([{...old,evaluationMode:"future-mode"}])))!;
    expect(unknown[0]).toMatchObject({evaluationMode:"future-mode",expression:"ex2"});
    expect((recalculateMemoBlocks(unknown)[0] as CalculationMemoBlock).error).toContain("未対応");
  });
});
