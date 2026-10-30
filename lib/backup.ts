import { loadData, STORAGE_KEY } from "./storage";

// At most 2 Mi UTF-16 code units; keep allocation bounded before JSON parsing/stringifying.
export const MAX_RAW_CODE_UNITS = 2 * 1024 * 1024;
export type Backup = {
  format: "calculator-memo-backup";
  formatVersion: 1;
  acquiredAt: string;
  acquisition: "captured";
  appStorageVersion: number | null;
  entries: { key: string; raw: string; utf16CodeUnits: number; validation: string; counts: { history: number; notes: number; formulas: number; reports: number; executions: number } | null }[];
};
export type BackupResult = { status: "ready"; backup: Backup } | { status: "missing" | "unavailable" | "too-large" | "changed" };
type Reader = Pick<Storage, "getItem">;

/** Read only the one owned key, preserving its exact UTF-16 source string. */
export function collectBackup(storage: Reader): BackupResult {
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw === null) return { status: "missing" };
    if (raw.length > MAX_RAW_CODE_UNITS) return { status: "too-large" };
    const checked = loadData({ getItem: () => raw });
    let version: number | null = null;
    let parsed: Record<string, unknown> | null = null;
    try {
      const value: unknown = JSON.parse(raw);
      if (value !== null && typeof value === "object" && !Array.isArray(value)) {
        parsed = value as Record<string, unknown>;
        if (typeof parsed.version === "number" && Number.isSafeInteger(parsed.version)) version = parsed.version;
      }
    } catch { /* original remains exportable */ }
    const entries = (value: unknown) => value !== null && typeof value === "object" && "entries" in value && Array.isArray(value.entries) ? value.entries.length : 0;
    // Count the actual source arrays, never the normalized loadData result.
    const counts = checked.status === "ok" && parsed ? {
      history: Array.isArray(parsed.history) ? parsed.history.length : 0,
      notes: Array.isArray(parsed.notes) ? parsed.notes.length : 0,
      formulas: entries(parsed.formulaLibrary), reports: entries(parsed.formulaReports),
      executions: Array.isArray(parsed.formulaExecutions) ? parsed.formulaExecutions.length : 0,
    } : null;
    if (storage.getItem(STORAGE_KEY) !== raw) return { status: "changed" };
    return { status: "ready", backup: { format: "calculator-memo-backup", formatVersion: 1, acquiredAt: new Date().toISOString(), acquisition: "captured", appStorageVersion: version, entries: [{ key: STORAGE_KEY, raw, utf16CodeUnits: raw.length, validation: checked.status === "error" ? checked.reason : checked.status, counts }] } };
  } catch { return { status: "unavailable" }; }
}

export function serializeBackup(backup: Backup): string {
  return JSON.stringify({ ...backup, createdAt: new Date().toISOString() }, null, 2);
}
