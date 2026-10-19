import { readExecutionDrafts } from "./formula-execution";
import { identificationMode } from "./identification";
import type { StoredData } from "./types";
import { readFormulaLibrary } from "./formula-library";
import { sanitizeMemoBlocks } from "./memo-blocks";

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

/** Validate structure only: expressions and stored results are not recalculated. */
function readStoredNotes(value: unknown): StoredData["notes"] {
  if (!Array.isArray(value)) throw new Error("メモ一覧の形式が不正です。");
  const ids = new Set<string>();
  return value.map((item) => {
    if (!isRecord(item) || typeof item.id !== "string" || !item.id.trim()) throw new Error("メモIDが不正です。");
    if (ids.has(item.id)) throw new Error("メモIDが重複しています。");
    ids.add(item.id);
    if (!["title", "createdAt", "updatedAt"].every((key) => typeof item[key] === "string")) throw new Error("メモの必須項目が不正です。");
    if (item.type === "plain-calculation") {
      if (item.schemaVersion !== undefined && item.schemaVersion !== 1) throw new Error("未対応のメモ形式です。");
      if (typeof item.content !== "string") throw new Error("メモ本文が不正です。");
      const blocks = sanitizeMemoBlocks(item.blocks);
      if (item.blocks !== undefined && blocks === undefined) throw new Error("未対応または不正なブロック、空または重複したブロックIDがあります。");
      if (blocks?.some((block) => block.type === "calculation" && block.evaluationMode !== undefined && block.evaluationMode !== "note-variables")) throw new Error("未対応のブロック計算モードです。");
      // Preserve extra fields; never reconstruct a lossy Markdown-only fallback.
      return { ...item, ...(blocks !== undefined ? { blocks } : {}) } as StoredData["notes"][number];
    }
    if (item.type !== "calculation" || item.schemaVersion !== 1) throw new Error("未対応のメモ種類または形式です。");
    if (!["expression", "displayExpression", "resultText", "unit", "note", "relatedMemoName"].every((key) => typeof item[key] === "string")
      || !(item.latexExpression === null || typeof item.latexExpression === "string")
      || typeof item.result !== "number" || !Number.isFinite(item.result)
      || !Array.isArray(item.tags) || !item.tags.every((tag) => typeof tag === "string")
      || !["plain", "katex"].includes(String(item.displayMode))) throw new Error("単独計算メモの構造が不正です。");
    return { ...item } as StoredData["notes"][number];
  });
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

    let notes: StoredData["notes"];
    try { notes = readStoredNotes(parsed.notes); }
    catch (cause) { return { status: "error", reason: "invalid-data", raw, message: cause instanceof Error ? cause.message : "メモを安全に読み取れませんでした。" }; }

    let formulaLibrary: StoredData["formulaLibrary"];
    if (parsed.formulaLibrary !== undefined) {
      try { formulaLibrary = readFormulaLibrary(parsed.formulaLibrary); }
      catch { return { status: "error", reason: "invalid-data", raw, message: "登録式ライブラリを読み取れませんでした。元データを保護するため自動保存を停止しました。" }; }
    }
    let formulaExecutions: StoredData["formulaExecutions"];
    if (parsed.formulaExecutions !== undefined) {
      try { formulaExecutions = readExecutionDrafts(parsed.formulaExecutions); }
      catch { return { status: "error", reason: "invalid-data", raw, message: "登録式の実行入力を読み取れませんでした。元データを保護するため自動保存を停止しました。" }; }
    }
    const theme = ["light", "dark", "system"].includes(String(parsed.settings.theme))
      ? parsed.settings.theme as StoredData["settings"]["theme"]
      : defaultData.settings.theme;
    const activePanel = ["history", "notes"].includes(String(parsed.settings.activePanel))
      ? parsed.settings.activePanel as StoredData["settings"]["activePanel"]
      : defaultData.settings.activePanel;
    return { status: "ok", raw, data: {
      version: 1,
      ...(formulaLibrary ? { formulaLibrary } : {}),
      ...(formulaExecutions ? { formulaExecutions } : {}),
      history: Array.isArray(parsed.history) ? parsed.history.filter((item) => item?.id && item?.expression) : [],
      notes,
      settings: { theme, activePanel, ...(identificationMode(parsed.settings.identificationMode) ? { identificationMode: identificationMode(parsed.settings.identificationMode) } : {}) },
    } };
  } catch (error) {
    console.error("ローカル保存領域へアクセスできませんでした", error);
    return { status: "error", reason: "storage-unavailable", raw, message: "ブラウザの保存領域へアクセスできませんでした。" };
  }
}

type WritableStorage = Pick<Storage, "getItem" | "setItem">;

/** Every ordinary save checks both destination and candidate before touching bytes. */
export function saveData(data: StoredData, storage?: WritableStorage): boolean {
  try {
    const target = storage ?? localStorage;
    if (loadData(target).status === "error") return false;
    readStoredNotes(data.notes);
    const raw = JSON.stringify(data);
    if (loadData({ getItem: () => raw }).status !== "ok") return false;
    target.setItem(STORAGE_KEY, raw);
    return true;
  } catch (error) {
    console.error("保存データを保存できませんでした", error);
    return false;
  }
}

/** Only the existing destructive-confirmation UI uses this explicit reset boundary.
 * Refuse if another tab changed the original bytes while confirmation was open.
 */
export function resetStoredData(expectedRaw: string | null, storage?: WritableStorage): boolean {
  try {
    const target = storage ?? localStorage;
    if (target.getItem(STORAGE_KEY) !== expectedRaw) return false;
    target.setItem(STORAGE_KEY, JSON.stringify(cloneDefaultData()));
    return true;
  } catch { return false; }
}
