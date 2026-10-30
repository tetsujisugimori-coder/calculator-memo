import { MAX_RAW_CODE_UNITS } from "./backup";
import { loadData, STORAGE_KEY } from "./storage";
import type { StoredData } from "./types";

export const MAX_RESTORE_FILE_BYTES = 16 * 1024 * 1024;
const MAX_JSON_DEPTH = 128;
export type RestoreCounts = { history: number; notes: number; formulas: number; reports: number; executions: number };
export type RestoreValidation = { ok: true; raw: string; data: StoredData; createdAt: string; acquiredAt: string; counts: RestoreCounts; utf16CodeUnits: number } | { ok: false; reason: string; message: string };
const record = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const date = (v: unknown): v is string => typeof v === "string" && Number.isFinite(Date.parse(v));

/** Syntax scan adds duplicate decoded-key rejection, including opaque future fields.
 * No parsed value is ever used to reconstruct the source being restored. */
export function parseStrictJson(text: string): unknown {
  if (text.length > MAX_RESTORE_FILE_BYTES) throw Error("JSONが読込上限を超えています。");
  let i = 0;
  const whitespace = () => { while (i < text.length && /[\x20\t\r\n]/.test(text[i])) i++; };
  const string = (): string => {
    const start = i;
    if (text[i++] !== '"') throw Error("JSON文字列が必要です。");
    while (i < text.length) {
      const c = text[i++];
      if (c === '"') return JSON.parse(text.slice(start, i)) as string;
      if (c === "\\") i++;
    }
    throw Error("JSON文字列が閉じていません。");
  };
  const value = (depth: number): void => {
    if (depth > MAX_JSON_DEPTH) throw Error("JSONの階層が深すぎるため検証できません。");
    whitespace();
    if (text[i] === '"') { string(); return; }
    if (text[i] === "{" || text[i] === "[") {
      const object = text[i++] === "{";
      const end = object ? "}" : "]";
      const keys = new Set<string>();
      whitespace();
      if (text[i] === end) { i++; return; }
      for (;;) {
        whitespace();
        if (object) {
          const key = string();
          if (keys.has(key)) throw Error("JSONに重複フィールドがあります。");
          keys.add(key); whitespace();
          if (text[i++] !== ":") throw Error("JSONの区切りが不正です。");
        }
        value(depth + 1); whitespace();
        if (text[i] === end) { i++; return; }
        if (text[i++] !== ",") throw Error("JSONの区切りが不正です。");
      }
    }
    const match = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(text.slice(i));
    if (!match) throw Error("JSON値が不正です。");
    i += match[0].length;
  };
  value(0); whitespace();
  if (i !== text.length) throw Error("JSON末尾が不正です。");
  return JSON.parse(text) as unknown;
}

/** Compare structure, not serialized order. Preserves unknown values and -0. */
function sameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a)) return Array.isArray(b) && a.length === b.length && a.every((v, i) => sameValue(v, b[i]));
  if (!record(a) || !record(b)) return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every(key => Object.hasOwn(b, key) && sameValue(a[key], b[key]));
}

/** loadData is intentionally permissive for legacy browsing; restoration additionally
 * refuses normalization and fields that would make existing renderers throw. */
function checkedData(raw: string): StoredData {
  const parsed = parseStrictJson(raw);
  if (!record(parsed) || parsed.version !== 1) throw Error("対応する保存形式version 1ではありません。");
  const settings = parsed.settings;
  if (!record(settings) || typeof settings.theme !== "string" || !["light", "dark", "system"].includes(settings.theme)
    || typeof settings.activePanel !== "string" || !["history", "notes"].includes(settings.activePanel)
    || (settings.identificationMode !== undefined && (typeof settings.identificationMode !== "string" || !["labels", "color", "none"].includes(settings.identificationMode))))
    throw Error("設定の既知項目の型・値が不正です。文字列への暗黙変換は行いません。");
  if (Array.isArray(parsed.notes)) for (const note of parsed.notes) {
    if (record(note) && note.type === "calculation" && (typeof note.displayMode !== "string" || !["plain", "katex"].includes(note.displayMode)))
      throw Error("単独計算メモの表示方式の型・値が不正です。");
  }
  const loaded = loadData({ getItem: () => raw });
  if (loaded.status !== "ok") throw Error("保存原文を現行形式として検証できません。");
  if (!sameValue(parsed, loaded.data)) throw Error("ローダーによる補正・除外が必要な原文は復元できません。");
  const ids = new Set<string>();
  for (const item of loaded.data.history) {
    if (!record(item) || typeof item.id !== "string" || !item.id.trim() || ids.has(item.id)
      || !(["expression", "displayExpression", "resultText"] as const).every(key => typeof item[key] === "string")
      || !item.expression || typeof item.result !== "number" || !Number.isFinite(item.result) || !date(item.createdAt)) throw Error("履歴の構造・ID・日時を検証できません。");
    ids.add(item.id);
    if (item.formulaExecution !== undefined) {
      const f = item.formulaExecution;
      if (!record(f) || !(["formulaId", "title", "expression"] as const).every(key => typeof f[key] === "string") || !record(f.inputs) || !Object.values(f.inputs).every(v => typeof v === "string")) throw Error("履歴の登録式記録を検証できません。");
    }
  }
  for (const note of loaded.data.notes) if (!date(note.createdAt) || !date(note.updatedAt)) throw Error("メモの日時を表示可能な形式として検証できません。");
  return loaded.data;
}

export function validateRestoreRaw(raw: string): { ok: true; data: StoredData; counts: RestoreCounts } | { ok: false; reason: string; message: string } {
  try {
    if (raw.length > MAX_RAW_CODE_UNITS) throw Error("保存原文が上限を超えています。");
    const data = checkedData(raw);
    const counts: RestoreCounts = { history: data.history.length, notes: data.notes.length, formulas: data.formulaLibrary?.entries.length ?? 0, reports: data.formulaReports?.entries.length ?? 0, executions: data.formulaExecutions?.length ?? 0 };
    return { ok: true, data, counts };
  } catch (cause) {
    return { ok: false, reason: "invalid-data", message: cause instanceof Error ? cause.message : "保存原文を安全に検証できません。" };
  }
}

export function validateRestoreBackup(text: string, fileBytes?: number): RestoreValidation {
  try {
    // Bound before encoding/parsing as both allocate additional memory.
    if (text.length > MAX_RESTORE_FILE_BYTES || (fileBytes !== undefined && (!Number.isSafeInteger(fileBytes) || fileBytes < 0 || fileBytes > MAX_RESTORE_FILE_BYTES))) throw Error("ファイルが読込上限（16 MiB）を超えるか、容量を確認できません。");
    const measured = new TextEncoder().encode(text).byteLength;
    if (measured > MAX_RESTORE_FILE_BYTES || (fileBytes !== undefined && measured !== fileBytes)) throw Error("ファイル容量が上限を超えるか、読込内容と一致しません。");
    const v = parseStrictJson(text);
    if (!record(v) || v.format !== "calculator-memo-backup" || v.formatVersion !== 1 || v.appStorageVersion !== 1 || v.acquisition !== "captured") throw Error("対応するバックアップ形式version 1・保存形式version 1ではありません。");
    if (!date(v.createdAt) || !date(v.acquiredAt) || Date.parse(v.createdAt) < Date.parse(v.acquiredAt)) throw Error("バックアップの作成・取得日時を確認できません。");
    if (!Array.isArray(v.entries) || v.entries.length !== 1 || !record(v.entries[0])) throw Error("復元対象は保存キー1件だけです。");
    const entry = v.entries[0];
    if (entry.key !== STORAGE_KEY || typeof entry.raw !== "string" || entry.raw.length > MAX_RAW_CODE_UNITS || entry.utf16CodeUnits !== entry.raw.length || entry.validation !== "ok") throw Error("対象キー・保存原文・原文長・検証状態が不正です。");
    const checked = validateRestoreRaw(entry.raw);
    if (!checked.ok) return checked;
    const { data, counts } = checked;
    if (!record(entry.counts) || !Object.entries(counts).every(([key, count]) => entry.counts && record(entry.counts) && entry.counts[key] === count)) throw Error("バックアップの件数と保存原文が一致しません。");
    return { ok: true, raw: entry.raw, data, createdAt: v.createdAt, acquiredAt: v.acquiredAt, counts, utf16CodeUnits: entry.raw.length };
  } catch (cause) {
    return { ok: false, reason: "invalid-backup", message: cause instanceof Error ? cause.message : "バックアップを安全に検証できません。" };
  }
}
