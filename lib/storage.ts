import type { StoredData } from "./types";

export const STORAGE_KEY = "calculation-memo:data";
export const defaultData: StoredData = {
  version: 1,
  history: [],
  notes: [],
  settings: { theme: "system", activePanel: "history" },
};

export type StorageLoadFailureReason =
  | "invalid-json"
  | "unsupported-version"
  | "invalid-data"
  | "storage-unavailable";

export type StorageLoadResult =
  | { status: "empty"; data: StoredData }
  | { status: "ok"; data: StoredData; raw: string }
  | { status: "error"; reason: StorageLoadFailureReason; raw: string | null; message: string };

type ReadableStorage = Pick<Storage, "getItem">;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cloneDefaultData(): StoredData {
  return { ...defaultData, history: [], notes: [], settings: { ...defaultData.settings } };
}

function isStoredMemo(item: unknown): boolean {
  if (!isRecord(item) || typeof item.id !== "string") return false;
  if (item.type === "plain-calculation") {
    return typeof item.title === "string"
      && typeof item.content === "string"
      && typeof item.createdAt === "string"
      && typeof item.updatedAt === "string";
  }
  return item.type === "calculation" && item.schemaVersion === 1;
}

export function loadData(storage?: ReadableStorage): StorageLoadResult {
  if (typeof window === "undefined" && !storage) return { status: "empty", data: cloneDefaultData() };
  let raw: string | null = null;
  try {
    const target = storage ?? window.localStorage;
    raw = target.getItem(STORAGE_KEY);
    if (raw === null) return { status: "empty", data: cloneDefaultData() };

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      console.error("保存データのJSONが壊れています", error);
      return { status: "error", reason: "invalid-json", raw, message: "保存データのJSONを読み取れませんでした。" };
    }

    if (!isRecord(parsed) || typeof parsed.version !== "number") {
      return { status: "error", reason: "invalid-data", raw, message: "保存データの形式を確認できませんでした。" };
    }
    if (parsed.version !== 1) {
      return { status: "error", reason: "unsupported-version", raw, message: `保存データのバージョン ${parsed.version} には対応していません。` };
    }
    if (!Array.isArray(parsed.history) || !Array.isArray(parsed.notes) || !isRecord(parsed.settings)) {
      return { status: "error", reason: "invalid-data", raw, message: "保存データの必須項目が壊れています。" };
    }

    const theme = ["light", "dark", "system"].includes(String(parsed.settings.theme))
      ? parsed.settings.theme as StoredData["settings"]["theme"]
      : defaultData.settings.theme;
    const activePanel = ["history", "notes"].includes(String(parsed.settings.activePanel))
      ? parsed.settings.activePanel as StoredData["settings"]["activePanel"]
      : defaultData.settings.activePanel;
    return { status: "ok", raw, data: {
      version: 1,
      history: Array.isArray(parsed.history) ? parsed.history.filter((item) => item?.id && item?.expression) : [],
      notes: Array.isArray(parsed.notes) ? parsed.notes.filter(isStoredMemo) as StoredData["notes"] : [],
      settings: { theme, activePanel },
    } };
  } catch (error) {
    console.error("ローカル保存領域へアクセスできませんでした", error);
    return { status: "error", reason: "storage-unavailable", raw, message: "ブラウザの保存領域へアクセスできませんでした。" };
  }
}

export function saveData(data: StoredData): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch (error) {
    console.error("保存データを保存できませんでした", error);
    return false;
  }
}
