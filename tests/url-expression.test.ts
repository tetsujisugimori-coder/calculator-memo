import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { expressionFromSearch, MAX_URL_EXPRESSION_LENGTH } from "../lib/url-expression";

describe("expressionFromSearch", () => {
  it("returns a decoded expr value", () => {
    expect(expressionFromSearch("?expr=2%20*%20%285%20%2B%203%29")).toBe("2 * (5 + 3)");
  });

  it("preserves Japanese and unsupported symbols without evaluating them", () => {
    const search = new URLSearchParams({ expr: "日本語 + <script> & √" }).toString();
    expect(expressionFromSearch(`?${search}`)).toBe("日本語 + <script> & √");
  });

  it("does not throw for malformed percent encoding", () => {
    expect(() => expressionFromSearch("?expr=%E0%A4%A")).not.toThrow();
  });

  it("distinguishes a missing expr from an empty expr", () => {
    expect(expressionFromSearch("?theme=dark")).toBeNull();
    expect(expressionFromSearch("?expr=")).toBe("");
  });

  it("limits extremely long values before placing them in calculator state", () => {
    expect(expressionFromSearch(`?expr=${"1".repeat(MAX_URL_EXPRESSION_LENGTH + 50)}`)).toHaveLength(MAX_URL_EXPRESSION_LENGTH);
  });
});

describe("CalculatorApp URL initialization", () => {
  it("places the shared expression in existing state without calculating or creating history", () => {
    const source = readFileSync("components/CalculatorApp.tsx", "utf8");
    const initialization = source.match(/useEffect\(\(\) => \{\s*const sharedExpression = expressionFromSearch\(window\.location\.search\);[\s\S]*?clearTimeout\(timer\);[\s\S]*?\}, \[\]\);/)?.[0] ?? "";
    expect(initialization).toContain("setExpression(sharedExpression)");
    expect(initialization).not.toContain("calculate(");
    expect(initialization).not.toContain("createHistoryEntry");
  });
});
