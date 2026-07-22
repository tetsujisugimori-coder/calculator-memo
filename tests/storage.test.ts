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
});
