import type { StoredData } from "./types";

export const STORAGE_KEY = "calculation-memo:data";
export const defaultData: StoredData = {
  version: 1,
  history: [],
  notes: [],
  settings: { theme: "system", activePanel: "history" },
};

export function loadData(): StoredData {
  if (typeof window === "undefined") return defaultData;
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<StoredData> | null;
    if (!parsed || parsed.version !== 1) return defaultData;
    return {
      version: 1,
      history: Array.isArray(parsed.history) ? parsed.history.filter((item) => item?.id && item?.expression) : [],
      notes: Array.isArray(parsed.notes) ? parsed.notes.filter((item) => item?.id && item?.schemaVersion === 1) : [],
      settings: { ...defaultData.settings, ...parsed.settings },
    };
  } catch (error) {
    console.error("保存データを読み込めませんでした", error);
    return defaultData;
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
