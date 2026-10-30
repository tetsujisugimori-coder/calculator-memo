import { describe, expect, it } from "vitest";
import { collectBackup, serializeBackup, MAX_RAW_CODE_UNITS } from "../lib/backup";
import { STORAGE_KEY } from "../lib/storage";

describe("backup source protection", () => {
  it("round trips exact source including unknown fields, unicode and lone surrogates", () => {
    const raw = '{"version":99,"future":123456789012345678901,"text":"日本語\\n\\uD800"}';
    const storage = { getItem: (key: string) => key === STORAGE_KEY ? raw : "other" };
    const result = collectBackup(storage);
    expect(result.status).toBe("ready");
    if (result.status !== "ready") return;
    expect(result.backup.entries[0].validation).toBe("unsupported-version");
    expect(JSON.parse(serializeBackup(result.backup)).entries[0].raw).toBe(raw);
    expect(storage.getItem(STORAGE_KEY)).toBe(raw);
  });
  it("preserves real newline, lone surrogate and unrounded number characters", () => {
    const source = '{\n "version":99, "number":900719925474099312345, "broken":"' + String.fromCharCode(0xd800) + '"\n}';
    const r = collectBackup({ getItem: () => source });
    expect(r.status).toBe("ready");
    if (r.status === "ready") expect(JSON.parse(serializeBackup(r.backup)).entries[0].raw).toBe(source);
  });
  it("accepts valid empty data and counts source arrays without touching foreign keys", () => {
    const source = '{"version":1,"history":[],"notes":[],"settings":{"theme":"system","activePanel":"history"}}';
    const reads: string[] = [];
    const r = collectBackup({ getItem: (key: string) => { reads.push(key); return source; } });
    expect(reads).toEqual([STORAGE_KEY, STORAGE_KEY]);
    expect(r.status).toBe("ready");
    if (r.status === "ready") expect(r.backup.entries[0].counts).toEqual({ history: 0, notes: 0, formulas: 0, reports: 0, executions: 0 });
  });
  it("preserves all nested app data and future fields without reconstruction", () => {
    const source = JSON.stringify({ version: 1, history: [], notes: [{ id: "n", type: "plain-calculation", title: "題", content: "引用と比較", createdAt: "", updatedAt: "", futureEvidence: { snapshot: "原文", confirmations: ["確認"] } }], settings: { theme: "dark", activePanel: "notes", future: true }, futureReport: { body: "固定引用\n点検", number: "900719925474099312345" } }, null, 2);
    const r = collectBackup({ getItem: () => source });
    expect(r.status).toBe("ready");
    if (r.status === "ready") {
      const parsed = JSON.parse(serializeBackup(r.backup));
      expect(parsed.format).toBe("calculator-memo-backup"); expect(parsed.formatVersion).toBe(1);
      expect(parsed.acquisition).toBe("captured"); expect(parsed.acquiredAt).toBeTruthy(); expect(parsed.createdAt).toBeTruthy();
      expect(parsed.entries[0].raw).toBe(source); expect(parsed.entries[0].counts.notes).toBe(1);
    }
  });
  it("distinguishes missing, corrupt and inaccessible data", () => {
    expect(collectBackup({ getItem: () => null }).status).toBe("missing");
    const broken = collectBackup({ getItem: () => "{" });
    expect(broken.status === "ready" && broken.backup.entries[0].validation).toBe("invalid-json");
    expect(collectBackup({ getItem: () => { throw Error(); } }).status).toBe("unavailable");
  });
  it("refuses oversized data and changing source", () => {
    expect(collectBackup({ getItem: () => "a".repeat(MAX_RAW_CODE_UNITS + 1) }).status).toBe("too-large");
    let reads = 0;
    expect(collectBackup({ getItem: () => ++reads === 1 ? "{}" : "changed" }).status).toBe("changed");
  });
});
