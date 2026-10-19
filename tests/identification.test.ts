import { describe, expect, it } from "vitest";
import { identificationMode, inspectIdentification } from "../lib/identification";
import { loadData, STORAGE_KEY } from "../lib/storage";
describe("display-only identification", () => {
  it("keeps manual modes distinct from absent/invalid responsive default", () => {
    for (const value of ["labels", "color", "none"] as const) expect(identificationMode(value)).toBe(value);
    for (const value of [undefined, null, "auto", "bad", 1]) expect(identificationMode(value)).toBeUndefined();
  });
  it("extracts AST variable references, not constants/functions/numbers", () => {
    expect(inspectIdentification("subtotal = price * quantity + abs(-3) + pi + 12", true)).toEqual({ target: "subtotal", variables: ["price", "quantity"] });
    expect(inspectIdentification("2+sqrt(4)+e")).toEqual({variables: []});
  });
  it("does not confuse a possible library name with a callable registration", () => {
    expect(inspectIdentification("price + 2")).toEqual({variables:["price"]});
    expect(inspectIdentification("price(2)").error).toBeTruthy();
  });
  it.each(["pi = 2", "sqrt = 3", "price =", "price +", "a = b = 2", "sin(2)", "1e4", "0x12", "a.b", "a[2]"])("clears all identification on invalid %s", (expression) => {
    const result = inspectIdentification(expression, true);
    expect(result.error).toBeTruthy(); expect(result.variables).toEqual([]); expect(result.target).toBeUndefined();
  });
  it("rejects the full overlong assignment before splitting", () => {
    expect(inspectIdentification("a".repeat(2000) + " = 2", true)).toEqual({variables: [], error: "式は2000文字以内で入力してください"});
  });
  it("does not execute numeric failures during syntax inspection", () => {
    expect(inspectIdentification("x / 0 + sqrt(-1)")).toEqual({variables:["x"]});
  });
  it.each([undefined, "labels", "color", "none", "unknown"])("round trips optional setting %s without changing old data", (mode) => {
    const input = {version:1,history:[],notes:[],settings:{theme:"dark",activePanel:"notes",...(mode ? {identificationMode:mode}: {})}};
    const result=loadData({getItem:(key)=>key===STORAGE_KEY?JSON.stringify(input):null});
    expect(result.status).toBe("ok");
    if(result.status==="ok") {expect(result.data.settings).toEqual({theme:"dark",activePanel:"notes",...(identificationMode(mode)?{identificationMode:mode}:{})});expect(result.data.version).toBe(1);}
  });
});
