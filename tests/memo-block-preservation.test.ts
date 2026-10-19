import { describe, expect, it } from "vitest";
import { calculateMemoBlock, recalculateMemoBlocks, resolveMemoBlocks } from "../lib/memo-blocks";
import { loadData, saveData, STORAGE_KEY } from "../lib/storage";
import type { CalculationMemoBlock, MemoBlock, PlainCalculationNote } from "../lib/types";

const extras = {
  proofRef: "proof-12",
  sourceId: "source-7",
  metadata: { citation: { page: 3 }, tags: ["synthetic", "regression"] },
  futureDescription: "A descriptive field unknown to this version",
};

function enriched(expression: string, evaluationMode?: string) {
  return {
    ...calculateMemoBlock("target", expression, evaluationMode),
    ...structuredClone(extras),
    displayExpression: "stale display",
    result: 999,
    resultText: "stale result",
    error: "stale error",
  };
}

function freezeDeep<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    Object.values(value).forEach(freezeDeep);
    Object.freeze(value);
  }
  return value;
}

const cases = [
  { name: "legacy success", expression: "2+3", mode: undefined, result: 5 },
  { name: "legacy error", expression: "1/0", mode: undefined, result: null },
  { name: "variable success", expression: "x=5", mode: "note-variables", result: 5 },
  { name: "variable error", expression: "x=missing", mode: "note-variables", result: null },
];

function payload(blocks: unknown[]) {
  return {
    version: 1, history: [], settings: { theme: "system", activePanel: "notes" },
    notes: [{ id: "note", type: "plain-calculation", title: "Synthetic regression", content: "fallback", blocks,
      createdAt: "2026-10-19T00:00:00Z", updatedAt: "2026-10-19T00:00:00Z" }],
  };
}

function read(raw: string) {
  return loadData({ getItem: key => key === STORAGE_KEY ? raw : null });
}

describe("calculation block extra-field preservation", () => {
  it.each(cases)("retains extras immutably for $name", ({ expression, mode }) => {
    const source = freezeDeep(enriched(expression, mode));
    const snapshot = structuredClone(source);
    const input = freezeDeep([source]);
    const actual = recalculateMemoBlocks(input)[0];
    expect(actual).toMatchObject(extras);
    expect(actual).not.toBe(source);
    expect(source).toEqual(snapshot);
    expect(input).toEqual([snapshot]);
    expect(actual.id).toBe(source.id);
    expect(actual.type).toBe(source.type);
    if (mode === undefined) expect(actual).not.toHaveProperty("evaluationMode");
    else expect(actual).toHaveProperty("evaluationMode", mode);
  });

  it.each(cases)("refreshes engine-owned fields for $name", ({ expression, mode, result }) => {
    const actual = recalculateMemoBlocks([enriched(expression, mode)])[0] as CalculationMemoBlock;
    const expected = calculateMemoBlock("target", expression, mode);
    expect(actual.result).toBe(result);
    expect(actual.displayExpression).toBe(expected.displayExpression);
    expect(actual.resultText).toBe(expected.resultText);
    expect(actual.error).toBe(expected.error);
    expect(actual.expression).toBe(expression);
    if (result === null) expect(actual.error).toBeTruthy();
    else expect(actual.error).toBeNull();
  });
});

describe("loaded calculation block lifecycle", () => {
  it.each(cases)("preserves extras through load, resolve, recalculate, JSON save and reload for $name", ({ expression, mode }) => {
    const original = enriched(expression, mode);
    let raw = JSON.stringify(payload([original]));
    const storage = {
      getItem: (key: string) => key === STORAGE_KEY ? raw : null,
      setItem: (key: string, value: string) => { expect(key).toBe(STORAGE_KEY); raw = value; },
    };
    const loaded = loadData(storage);
    expect(loaded.status).toBe("ok");
    if (loaded.status !== "ok") throw new Error("Fixture did not load");
    const note = loaded.data.notes[0] as PlainCalculationNote;
    expect(note.blocks).toEqual([original]);
    const before = structuredClone(note);
    const blocks = recalculateMemoBlocks(resolveMemoBlocks(note));
    const updated = { ...loaded.data, notes: [{ ...note, blocks }] };
    expect(saveData(updated, storage)).toBe(true);
    const reloaded = loadData(storage);
    expect(reloaded.status).toBe("ok");
    if (reloaded.status !== "ok") throw new Error("Saved document did not reload");
    const restored = (reloaded.data.notes[0] as PlainCalculationNote).blocks!;
    // Numerical/display correctness is independent of descriptive-field preservation.
    expect(restored[0]).toMatchObject(calculateMemoBlock("target", expression, mode));
    expect(restored[0]).toMatchObject(extras);
    expect(note).toEqual(before);
  });

  it.each(["edit", "add", "delete", "reorder"])("retains untouched calculation extras after another block's %s", operation => {
    const target = enriched("x*2", "note-variables");
    const definition = calculateMemoBlock("definition", "x=5", "note-variables");
    const text = { id: "text", type: "text" as const, content: "Before", sourceId: "text-source" };
    const original: MemoBlock[] = [definition, text, target];
    const snapshot = structuredClone(original);
    freezeDeep(original);
    let changed: MemoBlock[];
    switch (operation) {
      case "edit": changed = original.map(block => block.id === "definition" ? { ...definition, expression: "x=7" } : block); break;
      case "add": changed = [definition, calculateMemoBlock("override", "x=9", "note-variables"), text, target]; break;
      case "delete": changed = original.filter(block => block.id !== "definition"); break;
      default: changed = [target, text, definition]; break;
    }
    const result = recalculateMemoBlocks(changed);
    const actual = result.find(block => block.id === "target") as CalculationMemoBlock;
    // Check scope updates independently, including failures from deleted/moved definitions.
    if (operation === "edit" || operation === "add") {
      expect(actual.result).toBe(operation === "edit" ? 14 : 18);
      expect(actual.error).toBeNull();
    } else {
      expect(actual.result).toBeNull();
      expect(actual.error).toContain("未定義");
      expect(actual.resultText).toBe("");
    }
    expect(actual).toMatchObject(extras);
    expect(result.map(block => block.id)).toEqual(changed.map(block => block.id));
    expect(result.find(block => block.id === "text")).toEqual(text);
    expect(original).toEqual(snapshot);
    expect(actual).not.toBe(target);
  });

  it.each([
    { name: "unknown type", block: { ...enriched("2+3"), type: "future-type" } },
    { name: "unknown mode", block: { ...enriched("2+3"), evaluationMode: "future-mode" } },
    { name: "invalid known field", block: { ...enriched("2+3"), result: "five" } },
    { name: "invalid mode type", block: { ...enriched("2+3"), evaluationMode: 7 } },
  ])("still rejects $name without losing recoverable raw data", ({ block }) => {
    const raw = JSON.stringify(payload([{ id: "text", type: "text", content: "keep" }, block]));
    expect(read(raw)).toMatchObject({ status: "error", reason: "invalid-data", raw });
  });
});
