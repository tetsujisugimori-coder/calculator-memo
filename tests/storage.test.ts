import { describe, expect, it, vi } from "vitest";
import { loadData, STORAGE_KEY } from "../lib/storage";

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

  it("ignores malformed plain notes without rejecting compatible saved data", () => {
    const raw = JSON.stringify({
      version: 1,
      history: [],
      notes: [{ id: "broken", type: "plain-calculation", title: "本文なし" }],
      settings: { theme: "system", activePanel: "notes" },
    });
    const result = loadData(storageWith(raw));
    expect(result.status).toBe("ok");
    if (result.status === "ok") expect(result.data.notes).toEqual([]);
  });
});
