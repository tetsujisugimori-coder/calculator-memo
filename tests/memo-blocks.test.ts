import { describe, expect, it } from "vitest";
import { blocksToMarkdown, calculateMemoBlock, recalculateMemoBlocks, resolveMemoBlocks, sanitizeMemoBlocks } from "../lib/memo-blocks";
import type { MemoBlock } from "../lib/types";

describe("calculation memo blocks", () => {
  it("calculates supported expressions independently", () => {
    expect(calculateMemoBlock("calc-1", "200*(5%+5%)")).toEqual(expect.objectContaining({
      result: 20,
      resultText: "20",
      error: null,
    }));
  });

  it("keeps an invalid expression as a local block error", () => {
    const valid = calculateMemoBlock("calc-valid", "2+3");
    const invalid = calculateMemoBlock("calc-invalid", "2+");
    expect(valid.result).toBe(5);
    expect(invalid).toEqual(expect.objectContaining({ result: null, error: "式が不完全です" }));
  });

  it("recalculates multiple calculation blocks without changing text or formula blocks", () => {
    const blocks: MemoBlock[] = [
      { id: "text-1", type: "text", content: "途中式" },
      { id: "calc-1", type: "calculation", expression: "10/4", displayExpression: "", result: null, resultText: "", error: null },
      { id: "formula-1", type: "formula", latex: "\\frac{a}{b}" },
      { id: "calc-2", type: "calculation", expression: "1/0", displayExpression: "", result: null, resultText: "", error: null },
    ];
    const calculated = recalculateMemoBlocks(blocks);
    expect(calculated[0]).toEqual(blocks[0]);
    expect(calculated[1]).toEqual(expect.objectContaining({ result: 2.5, resultText: "2.5", error: null }));
    expect(calculated[2]).toEqual(blocks[2]);
    expect(calculated[3]).toEqual(expect.objectContaining({ result: null, error: "0では割れません" }));
  });

  it("turns legacy Markdown content into one text block without modifying it", () => {
    const content = "## 既存メモ\n\n$x^2$";
    expect(resolveMemoBlocks({ id: "legacy", content })).toEqual([
      { id: "legacy-text-legacy", type: "text", content },
    ]);
  });

  it("serializes mixed blocks to a Markdown-compatible content fallback", () => {
    const markdown = blocksToMarkdown([
      { id: "text", type: "text", content: "## 証明" },
      { id: "formula", type: "formula", latex: "x^2+y^2" },
      calculateMemoBlock("calc", "2+3"),
    ]);
    expect(markdown).toContain("## 証明");
    expect(markdown).toContain("$$\nx^2+y^2\n$$");
    expect(markdown).toContain("`2+3` = **5**");
  });

  it("rejects a partially malformed stored block array as a unit", () => {
    expect(sanitizeMemoBlocks([
      { id: "text", type: "text", content: "保持" },
      { id: "broken", type: "calculation", expression: "2+3" },
    ])).toBeUndefined();
  });
});
