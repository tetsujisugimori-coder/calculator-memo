import { inspectFormulaDefinition } from "./calculator";
import type { FormulaLibrary, RegisteredFormula } from "./types";

export const FORMULA_LIBRARY_LIMIT = 200;
export function emptyFormulaLibrary(): FormulaLibrary { return { version: 1, entries: [], selectedId: null }; }
export function validateFormula(title: string, expression: string): string[] {
  if (!title.trim() || title.length > 120) throw new Error("登録名は1〜120文字で入力してください");
  return inspectFormulaDefinition(expression);
}
// Fail closed rather than silently discarding library definitions on load.
export function readFormulaLibrary(value: unknown): FormulaLibrary {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("登録式の保存形式が不正です");
  const v = value as Record<string, unknown>;
  if (v.version !== 1 || !Array.isArray(v.entries) || v.entries.length > FORMULA_LIBRARY_LIMIT) throw new Error("未対応または不正な登録式ライブラリです");
  const ids = new Set<string>();
  for (const item of v.entries) {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("登録式が不正です");
    const f = item as RegisteredFormula;
    if (typeof f.id !== "string" || !f.id || f.id.length > 120 || ids.has(f.id)
      || typeof f.title !== "string" || typeof f.expression !== "string"
      || typeof f.createdAt !== "string" || !Number.isFinite(Date.parse(f.createdAt))
      || typeof f.updatedAt !== "string" || !Number.isFinite(Date.parse(f.updatedAt))) throw new Error("登録式の項目が不正です");
    validateFormula(f.title, f.expression); ids.add(f.id);
  }
  if (v.selectedId !== null && (typeof v.selectedId !== "string" || !ids.has(v.selectedId))) throw new Error("登録式の選択が不正です");
  // Preserve extra fields on supported version records for forward-compatible round trips.
  return { ...v, version: 1, entries: v.entries.map((f: RegisteredFormula) => ({ ...f })), selectedId: v.selectedId as string | null };
}
export function saveFormula(library: FormulaLibrary, formula: RegisteredFormula): FormulaLibrary {
  validateFormula(formula.title, formula.expression);
  const exists = library.entries.some((entry) => entry.id === formula.id);
  if (!exists && library.entries.length >= FORMULA_LIBRARY_LIMIT) throw new Error("登録式は200件までです");
  return readFormulaLibrary({ ...library, selectedId: formula.id, entries: exists
    ? library.entries.map((entry) => entry.id === formula.id ? { ...entry, ...formula } : entry)
    : [...library.entries, formula] });
}
export function removeFormula(library: FormulaLibrary, id: string): FormulaLibrary {
  return { ...library, entries: library.entries.filter((entry) => entry.id !== id), selectedId: library.selectedId === id ? null : library.selectedId };
}
