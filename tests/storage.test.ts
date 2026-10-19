import { describe, expect, it, vi } from "vitest";
import { defaultData, loadData, saveData, resetStoredData, STORAGE_KEY } from "../lib/storage";

function storageWith(value: string | null): Pick<Storage, "getItem"> {
  return { getItem: (key) => key === STORAGE_KEY ? value : null };
}

describe("loadData", () => {
  it("distinguishes missing data", () => {
    expect(loadData(storageWith(null)).status).toBe("empty");
  });

  it("keeps invalid JSON available for recovery", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const raw = "{broken-json";
    expect(loadData(storageWith(raw))).toEqual(expect.objectContaining({ status: "error", reason: "invalid-json", raw }));
    consoleError.mockRestore();
  });

  it("distinguishes unsupported versions", () => {
    const raw = JSON.stringify({ version: 99, history: [], notes: [], settings: {} });
    expect(loadData(storageWith(raw))).toEqual(expect.objectContaining({ status: "error", reason: "unsupported-version", raw }));
  });

  it("loads supported data", () => {
    const raw = JSON.stringify({ version: 1, history: [], notes: [], settings: { theme: "dark", activePanel: "notes" } });
    const result = loadData(storageWith(raw));
    expect(result.status).toBe("ok");
    if (result.status === "ok") expect(result.data.settings).toEqual({ theme: "dark", activePanel: "notes" });
  });

  it("keeps existing calculation notes and new plain calculation notes together", () => {
    const calculation = {
      id: "calc-note-existing", schemaVersion: 1, type: "calculation", title: "既存メモ",
      expression: "2+3", displayExpression: "2 ＋ 3", latexExpression: null,
      result: 5, resultText: "5", unit: "", note: "", tags: [], relatedMemoName: "",
      displayMode: "plain", createdAt: "2026-07-22T00:00:00.000Z", updatedAt: "2026-07-22T00:00:00.000Z",
    };
    const plain = {
      id: "plain-note-new", type: "plain-calculation", title: "証明",
      content: "## 結論\n\n$x^2$",
      createdAt: "2026-07-23T00:00:00.000Z", updatedAt: "2026-07-23T00:00:00.000Z",
    };
    const raw = JSON.stringify({ version: 1, history: [], notes: [calculation, plain], settings: { theme: "system", activePanel: "notes" } });
    const result = loadData(storageWith(raw));
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.data.version).toBe(1);
      expect(result.data.notes).toEqual([calculation, plain]);
    }
  });

  it("rejects malformed plain notes without dropping original data", () => {
    const raw = JSON.stringify({
      version: 1,
      history: [],
      notes: [{ id: "broken", type: "plain-calculation", title: "本文なし" }],
      settings: { theme: "system", activePanel: "notes" },
    });
    const result = loadData(storageWith(raw));
    expect(result).toMatchObject({ status: "error", raw });
  });

  it("restores mixed memo blocks with their order and calculated results", () => {
    const blocks = [
      { id: "text", type: "text", content: "説明" },
      { id: "formula", type: "formula", latex: "x^2" },
      { id: "calc", type: "calculation", expression: "2+3", displayExpression: "2 ＋ 3", result: 5, resultText: "5", error: null },
    ];
    const raw = JSON.stringify({
      version: 1,
      history: [],
      notes: [{
        id: "plain-blocks", type: "plain-calculation", title: "混在",
        content: "fallback", blocks,
        createdAt: "2026-07-23T00:00:00.000Z", updatedAt: "2026-07-23T00:00:00.000Z",
      }],
      settings: { theme: "system", activePanel: "notes" },
    });
    const result = loadData(storageWith(raw));
    expect(result.status).toBe("ok");
    if (result.status === "ok" && result.data.notes[0]?.type === "plain-calculation") {
      expect(result.data.notes[0].blocks).toEqual(blocks);
    }
  });

  it("protects original blocks rather than degrading to Markdown when an array is malformed", () => {
    const raw = JSON.stringify({
      version: 1,
      history: [],
      notes: [{
        id: "plain-fallback", type: "plain-calculation", title: "既存本文",
        content: "消してはいけない本文",
        blocks: [{ id: "broken", type: "calculation", expression: "2+3" }],
        createdAt: "2026-07-23T00:00:00.000Z", updatedAt: "2026-07-23T00:00:00.000Z",
      }],
      settings: { theme: "system", activePanel: "notes" },
    });
    const result = loadData(storageWith(raw));
    expect(result).toMatchObject({ status: "error", raw });
  });
});


it("preserves variable mode and legacy mode across version-one load/save", () => {
  const base = { type: "calculation", displayExpression: "x", result: 10, resultText: "10", error: null };
  const blocks = [{ ...base, id: "old", expression: "2x3" }, { ...base, id: "new", expression: "x=10", evaluationMode: "note-variables" }];
  const source = { version: 1, history: [], settings: { theme: "system", activePanel: "notes" }, notes: [{ id: "n", type: "plain-calculation", title: "test", content: "", blocks, createdAt: "2026-10-19T00:00:00Z", updatedAt: "2026-10-19T00:00:00Z" }] };
  const loaded = loadData(storageWith(JSON.stringify(source)));
  expect(loaded.status).toBe("ok");
  if (loaded.status === "ok") {
    expect(loaded.data).toEqual(source);
    expect(loadData(storageWith(JSON.stringify(loaded.data)))).toMatchObject({ status: "ok", data: source });
  }
});


const validNote = { id: "note", type: "plain-calculation", title: "", content: "原文", createdAt: "", updatedAt: "" };
const textBlock = { id: "text", type: "text", content: "保存すべき文章" };
function store(raw: string | null) {
  let value = raw;
  return { getItem: vi.fn(() => value), setItem: vi.fn((_key: string, next: string) => { value = next; }) };
}
function documentWith(notes: unknown[]) { return JSON.stringify({ ...defaultData, notes }); }

const invalidNotes = [
  ["unknown block", { ...validNote, blocks: [{ id: "future", type: "geometry", points: [1, 2] }] }],
  ["mixed blocks", { ...validNote, blocks: [textBlock, { id: "future", type: "graph", source: "x" }] }],
  ["null blocks", { ...validNote, blocks: null }],
  ["object blocks", { ...validNote, blocks: {} }],
  ["malformed known block", { ...validNote, blocks: [{ id: "text", type: "text", content: 3 }] }],
  ["empty block id", { ...validNote, blocks: [{ ...textBlock, id: "  " }] }],
  ["duplicate block id", { ...validNote, blocks: [textBlock, { ...textBlock, content: "別内容" }] }],
  ["unknown note", { ...validNote, type: "future-note" }],
  ["future note schema", { ...validNote, schemaVersion: 2 }],
  ["empty note id", { ...validNote, id: "" }],
  ["malformed note", { ...validNote, title: null }],
  ["null note", null],
  ["unknown evaluation mode", { ...validNote, blocks: [{ id: "c", type: "calculation", expression: "x", displayExpression: "x", result: 1, resultText: "1", error: null, evaluationMode: "future" }] }],
  ["malformed calculation note", { id: "c", type: "calculation", schemaVersion: 1 }],
] as const;

it.each(invalidNotes)("protects %s at load and ordinary-save boundaries", (_label, note) => {
  const raw = documentWith([{ ...validNote, id: "normal-sibling" }, note]);
  const storage = store(raw);
  expect(loadData(storage)).toMatchObject({ status: "error", raw });
  expect(saveData(defaultData, storage)).toBe(false);
  expect(storage.setItem).not.toHaveBeenCalled();
  expect(storage.getItem()).toBe(raw);
  expect(loadData(storage)).toMatchObject({ status: "error", raw });
});

it("rejects duplicate memo ids in the dataset", () => {
  const raw = documentWith([validNote, validNote]);
  expect(loadData(store(raw))).toMatchObject({ status: "error", raw, message: "メモIDが重複しています。" });
});

it.each([undefined, []])("retains compatible legacy/empty blocks: %j", (blocks) => {
  const note = { ...validNote, ...(blocks ? { blocks } : {}), extraMetadata: { keep: true } };
  const storage = store(documentWith([note]));
  const loaded = loadData(storage);
  expect(loaded.status).toBe("ok");
  if (loaded.status !== "ok") throw Error("expected supported data");
  expect(saveData(loaded.data, storage)).toBe(true);
  expect(loadData(storage)).toMatchObject({ status: "ok", data: { notes: [note] } });
});

it("accepts identical block ids in different notes and preserves extra fields/order/raw precision", () => {
  const block = { id: "c", type: "calculation", expression: "sqrt(2)", displayExpression: "sqrt(2)", result: Math.SQRT2, resultText: "1.41421356237", error: null, extra: { source: "kept" } };
  const notes = [{ ...validNote, blocks: [textBlock, block] }, { ...validNote, id: "second", blocks: [block] }];
  const storage = store(documentWith(notes));
  const loaded = loadData(storage);
  expect(loaded.status).toBe("ok");
  if (loaded.status !== "ok") throw Error("expected supported data");
  expect(saveData(loaded.data, storage)).toBe(true);
  expect(loadData(storage)).toMatchObject({ status: "ok", data: { notes } });
});

it("rejects a JSON number which overflows to infinity without rewriting to null", () => {
  const raw = documentWith([{ ...validNote, blocks: [{ id: "c", type: "calculation", expression: "1", displayExpression: "1", result: 999, resultText: "999", error: null }] }]).replace('"result":999', '"result":1e999');
  const storage = store(raw);
  expect(loadData(storage)).toMatchObject({ status: "error", raw });
  expect(saveData(defaultData, storage)).toBe(false);
  expect(storage.getItem()).toBe(raw);
});

it("validates candidate notes before JSON serialization can lose nonfinite data", () => {
  const storage = store(null);
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
  for (const result of [Infinity, NaN]) {
    const data = { ...defaultData, notes: [{ ...validNote, blocks: [{ id: "c", type: "calculation", expression: "1", displayExpression: "1", result, resultText: "", error: null }] }] };
    expect(saveData(data as typeof defaultData, storage)).toBe(false);
  }
  expect(storage.setItem).not.toHaveBeenCalled();
  consoleError.mockRestore();
});

it("rejects newly corrupted destination even after a successful load", () => {
  const storage = store(documentWith([validNote]));
  const loaded = loadData(storage);
  if (loaded.status !== "ok") throw Error("expected supported data");
  const raw = documentWith([{ ...validNote, blocks: [{ type: "future", id: "x" }] }]);
  storage.setItem(STORAGE_KEY, raw);
  storage.setItem.mockClear();
  expect(saveData(loaded.data, storage)).toBe(false);
  expect(storage.getItem()).toBe(raw);
  expect(storage.setItem).not.toHaveBeenCalled();
});

it("can load and save normal data after repair without a sticky global block", () => {
  const storage = store(documentWith([null]));
  expect(loadData(storage).status).toBe("error");
  storage.setItem(STORAGE_KEY, documentWith([validNote]));
  const loaded = loadData(storage);
  if (loaded.status !== "ok") throw Error("repair must load");
  expect(saveData(loaded.data, storage)).toBe(true);
});

it("only explicit reset with matching original bytes can replace an invalid dataset", () => {
  const storage = store("{broken");
  const silence = vi.spyOn(console, "error").mockImplementation(() => undefined);
  expect(saveData(defaultData, storage)).toBe(false);
  expect(resetStoredData("stale original", storage)).toBe(false);
  expect(storage.getItem()).toBe("{broken");
  expect(resetStoredData("{broken", storage)).toBe(true);
  expect(loadData(storage)).toMatchObject({ status: "ok", data: defaultData });
  silence.mockRestore();
});


it("contains storage getter failures inside both persistence boundaries", () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const silence = vi.spyOn(console, "error").mockImplementation(() => undefined);
  Object.defineProperty(globalThis, "localStorage", { configurable: true, get: () => { throw new Error("SecurityError"); } });
  try {
    expect(saveData(defaultData)).toBe(false);
    expect(resetStoredData(null)).toBe(false);
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "localStorage", descriptor);
    else Reflect.deleteProperty(globalThis, "localStorage");
    silence.mockRestore();
  }
});
