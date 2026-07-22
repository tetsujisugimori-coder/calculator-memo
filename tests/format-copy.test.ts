import { describe, expect, it } from "vitest";
import { formatExpression, formatNumber } from "../lib/format";
import { historyText, noteToJson, noteToMarkdown, noteToPlainText } from "../lib/copy";
import type { CalculationNote } from "../lib/types";

const note: CalculationNote = {
  id: "calc-note-001", schemaVersion: 1, type: "calculation", title: "交通費",
  expression: "14000*2+3000", displayExpression: "14,000 × 2 ＋ 3,000",
  latexExpression: "\\frac{a}{b}", result: 31000, resultText: "31,000", unit: "円",
  note: "往復と現地交通費", tags: ["出張"], relatedMemoName: "大阪出張", displayMode: "katex",
  createdAt: "2026-07-22T00:00:00.000Z", updatedAt: "2026-07-22T00:00:00.000Z",
};

describe("formatting", () => {
  it("formats numbers", () => expect(formatNumber(12500.5)).toBe("12,500.5"));
  it("formats expressions independently from internal syntax", () => expect(formatExpression("12500*3+800")).toBe("12,500 × 3 ＋ 800"));
});

describe("copy formats", () => {
  it("keeps the mathematical percent interpretation in history copy", () => {
    expect(historyText({ id: "percent", expression: "200+10%", displayExpression: "200 ＋ 10%", result: 200.1, resultText: "200.1", createdAt: "2026-07-22T00:00:00.000Z" })).toBe("200 ＋ 10% = 200.1");
  });
  it("builds plain text", () => expect(noteToPlainText(note)).toContain("31,000円"));
  it("includes latex in Markdown", () => expect(noteToMarkdown(note)).toContain("\\frac{a}{b}"));
  it("serializes schema without generated HTML", () => {
    const json = noteToJson(note);
    expect(JSON.parse(json).schemaVersion).toBe(1);
    expect(json).not.toContain("<span");
  });
});
