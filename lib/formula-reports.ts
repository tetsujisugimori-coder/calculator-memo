import { formulaDefinitionSignature, formulaDefinitionSnapshot, formulaReportAssessment, hasUnknownFormulaDefinition, readReportEvidence, readReportEvidenceLinks, reportEvidenceSignature, resolveReportEvidence, validateConfirmationRemarks } from "./formula-report-evidence";
import type { FormulaLibrary, FormulaReport, FormulaReports, FormulaReportEvidenceLink, Memo, RegisteredFormula } from "./types";

export const FORMULA_REPORT_LIMIT = 200;
export const FORMULA_REPORT_TITLE_LIMIT = 120;
export const FORMULA_REPORT_BODY_LIMIT = 100_000;
export const FORMULA_REPORT_BYTES_LIMIT = 1_000_000;
export const FORMULA_REPORT_TEMPLATE = "## 概要\n\nこの式の目的と説明の範囲を記述します。\n\n## 定義・前提条件\n\n記号の定義、適用条件、仮定を記述します。\n\n## 導出・証明\n\n導出の手順や証明を記述します。未検証の点は区別してください。\n\n## 計算例\n\n入力例、計算手順、結果と解釈を記述します。\n\n## 由緒・歴史\n\n確認できた背景や歴史を記述します。不明な事項は不明とします。\n\n## 参考文献・出典\n\n参照した資料と該当箇所を記述します。\n";

/** Append without normalizing or replacing any existing byte of the draft. */
export function appendFormulaReportTemplate(body: string): string {
  const next = body + (body ? (body.endsWith("\n\n") ? "" : body.endsWith("\n") ? "\n" : "\n\n") : "") + FORMULA_REPORT_TEMPLATE;
  if (next.length > FORMULA_REPORT_BODY_LIMIT) throw new Error("テンプレート追加後の本文が100,000文字を超えるため追加しませんでした。元の本文は保持しています。");
  return next;
}

export function emptyFormulaReports(): FormulaReports { return { version: 1, entries: [] }; }
function object(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }
function id(value: unknown): value is string { return typeof value === "string" && !!value.trim() && value.length <= 120; }
function date(value: unknown): value is string { return typeof value === "string" && Number.isFinite(Date.parse(value)); }
export function validateFormulaReportContent(title: string, body: string): void {
  if (typeof title !== "string" || !title.trim() || title.length > FORMULA_REPORT_TITLE_LIMIT) throw new Error("レポートのタイトルは1〜120文字で入力してください。");
  if (typeof body !== "string" || body.length > FORMULA_REPORT_BODY_LIMIT) throw new Error("レポート本文は100,000文字以内で入力してください。");
}
/** Validate without executing Markdown, expressions or altering unknown metadata. */
export function readFormulaReports(value: unknown): FormulaReports {
  if (!object(value) || value.version !== 1 || !Array.isArray(value.entries) || value.entries.length > FORMULA_REPORT_LIMIT) throw new Error("未対応または不正な関連レポート形式です。");
  const ids = new Set<string>(), formulaIds = new Set<string>();
  const entries = value.entries.map((item): FormulaReport => {
    if (!object(item) || !id(item.id) || !id(item.formulaId) || ids.has(item.id) || formulaIds.has(item.formulaId)
      || !date(item.createdAt) || !date(item.updatedAt)
      || !(item.confirmedExpression === null || (typeof item.confirmedExpression === "string" && !!item.confirmedExpression.trim() && item.confirmedExpression.length <= 2000))) throw new Error("関連レポートの項目またはIDが不正です。");
    validateFormulaReportContent(item.title as string, item.body as string);
    if (item.evidence !== undefined) readReportEvidence(item.evidence, item.formulaId);
    ids.add(item.id); formulaIds.add(item.formulaId);
    return { ...item } as FormulaReport;
  });
  const result = { ...value, version: 1 as const, entries };
  if (new TextEncoder().encode(JSON.stringify(result)).byteLength > FORMULA_REPORT_BYTES_LIMIT) throw new Error("関連レポート全体はUTF-8 JSON 1,000,000バイト以内です。内容を削除せず保存を停止しました。");
  return result;
}
/** Full captured supported record, including unknown fields; not a security signature. */
export function formulaReportSignature(report: FormulaReport | undefined): string | null { return report ? JSON.stringify(report) : null; }
export type FormulaReportSaveRequest = {
  id: string;
  formulaId: string;
  title: string;
  body: string;
  expectedReport: string | null;
  expectedExpression: string | null;
  confirm: boolean;
  confirmationRemarks?: string;
  expectedDefinition?: string | null;
  links?: FormulaReportEvidenceLink[];
  expectedEvidence?: string;
};
/** Pure candidate creation. Caller must check current storage under its shared write lock,
 * persist with expected bytes and read back successfully before showing confirmation. */
export function saveFormulaReport(reports: FormulaReports, library: FormulaLibrary, request: FormulaReportSaveRequest, now: string, notes: Memo[] = []): FormulaReports {
  const checked = readFormulaReports(reports);
  const original = checked.entries.find(item => item.formulaId === request.formulaId);
  const formula = library.entries.find(item => item.id === request.formulaId);
  if (formulaReportSignature(original) !== request.expectedReport || (formula?.expression ?? null) !== request.expectedExpression
    || (request.expectedDefinition !== undefined && formulaDefinitionSignature(formula) !== request.expectedDefinition))
    throw new Error("式または関連レポートが変更されています。再取得して内容を確認してください。");
  if (original && original.id !== request.id) throw new Error("レポートIDを変更できません。");
  if (!original && !formula) throw new Error("登録式が見つからないためレポートを作成できません。");
  if (request.confirm && !formula) throw new Error("登録式が見つからないため式との対応を確認できません。");
  validateFormulaReportContent(request.title, request.body);
  const links = readReportEvidenceLinks(request.links ?? original?.evidence?.links ?? []);
  if (request.expectedEvidence !== undefined && reportEvidenceSignature(notes, links) !== request.expectedEvidence) throw new Error("保存済み根拠が変更されています。再取得して確認してください。");
  const previousLinks = original?.evidence?.links ?? [];
  const added = links.filter(link => !previousLinks.some(item => item.memoId === link.memoId && item.recordId === link.recordId));
  if (resolveReportEvidence(notes, request.confirm ? links : added).some(item => item.status !== "available")) throw new Error("根拠参照が欠落または不正です。確認済みとして保存できません。");
  if (request.confirm && original?.evidence && Object.keys(original.evidence).some(key => !["version", "links", "confirmations"].includes(key))) throw new Error("未対応の根拠情報があるため確認できません。");
  if (request.confirm && hasUnknownFormulaDefinition(formula!)) throw new Error("未対応の式定義があるため確認できません。");
  let evidence = original?.evidence;
  if (evidence || request.links !== undefined || request.confirm) {
    evidence = { ...evidence, version: 1, links, confirmations: [...(evidence?.confirmations ?? [])] };
    if (request.confirm) {
      const remarks = request.confirmationRemarks === undefined ? "" : request.confirmationRemarks;
      validateConfirmationRemarks(remarks);
      evidence.confirmations.push({ remarks, id: crypto.randomUUID(), formulaId: request.formulaId, confirmedAt: now, evidenceSignature: reportEvidenceSignature(notes, links), definition: formulaDefinitionSnapshot(formula!), title: request.title, body: request.body, links: structuredClone(links) });
    }
    evidence = readReportEvidence(evidence, request.formulaId);
  }
  const entry: FormulaReport = {
    ...original, id: request.id, formulaId: request.formulaId, title: request.title, body: request.body,
    createdAt: original?.createdAt ?? now, updatedAt: now,
    confirmedExpression: original?.confirmedExpression ?? (request.confirm ? formula!.expression : null),
    ...(evidence ? { evidence } : {}),
  };
  return readFormulaReports({ ...checked, entries: original ? checked.entries.map(item => item.id === original.id ? entry : item) : [...checked.entries, entry] });
}
export type FormulaReportCorrespondence = "confirmed" | "unconfirmed" | "changed" | "orphan" | "unknown";
/** Compatibility status-only helper. Pass an explicitly loaded saved snapshot, never editor drafts.
 * Linked evidence without that snapshot remains unknown; use assessment for the reason. */
export function formulaReportCorrespondence(report: FormulaReport, formula: RegisteredFormula | undefined, savedNotes?: Memo[]): FormulaReportCorrespondence {
  return formulaReportAssessment(report, formula, savedNotes).status;
}
