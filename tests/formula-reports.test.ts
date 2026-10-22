import { describe, expect, it, vi } from "vitest";
import { emptyFormulaReports, formulaReportCorrespondence, formulaReportSignature, readFormulaReports, saveFormulaReport, FORMULA_REPORT_BODY_LIMIT, FORMULA_REPORT_BYTES_LIMIT, type FormulaReportSaveRequest } from "../lib/formula-reports";
import { defaultData, loadData, saveDataChecked } from "../lib/storage";
import { removeFormula } from "../lib/formula-library";
import type { FormulaLibrary, FormulaReport, FormulaReports, StoredData } from "../lib/types";
const now = "2026-10-22T19:00:00.000Z";
const formula = { id: "f1", title: "同名", expression: "x+1", createdAt: now, updatedAt: now };
const library: FormulaLibrary = { version: 1, entries: [formula], selectedId: "f1" };
const report: FormulaReport = { id: "r1", formulaId: "f1", title: "説明", body: "本文\n\n$x+1$", createdAt: now, updatedAt: now, confirmedExpression: null };
const reports: FormulaReports = { version: 1, entries: [report] };
function request(overrides: Partial<FormulaReportSaveRequest> = {}): FormulaReportSaveRequest { return { id: "r1", formulaId: "f1", title: report.title, body: report.body, expectedExpression: formula.expression, expectedReport: formulaReportSignature(report), confirm: false, ...overrides }; }
const stored = (value: unknown) => loadData({ getItem: () => JSON.stringify(value) });
describe("formula reports", () => {
  it("creates a distinct stable report without automatic confirmation", () => {
    const result = saveFormulaReport(emptyFormulaReports(), library, request({ expectedReport: null }), now);
    expect(result).toEqual(reports); expect(emptyFormulaReports().entries).toEqual([]);
    expect(formulaReportCorrespondence(result.entries[0], formula)).toBe("unconfirmed");
  });
  it("explicitly confirms the exact expression, not the name or mathematical equivalence", () => {
    const result = saveFormulaReport(reports, library, request({ confirm: true }), now).entries[0];
    expect(result.confirmedExpression).toBe("x+1");
    const renamed = { ...formula, title: "別名" };
    expect(formulaReportCorrespondence(result, renamed)).toBe("confirmed");
    expect(formulaReportCorrespondence(result, { ...formula, expression: "1+x" })).toBe("changed");
    expect(formulaReportCorrespondence(result, undefined)).toBe("orphan");
  });
  it.each(["body", "title"] as const)("editing %s invalidates an old confirmation", field => {
    const confirmed = { ...report, confirmedExpression: "x+1" };
    const result = saveFormulaReport({ version: 1, entries: [confirmed] }, library, request({ [field]: "edited", expectedReport: formulaReportSignature(confirmed) }), now);
    expect(result.entries[0].confirmedExpression).toBe("x+1");
    expect(formulaReportCorrespondence(result.entries[0], formula)).toBe("unknown"); expect(confirmed.confirmedExpression).toBe("x+1");
  });
  it("preserves unchanged confirmation and createdAt on later edits", () => {
    const confirmed = { ...report, confirmedExpression: "x+1" };
    const later = "2026-10-23T01:00:00Z";
    expect(saveFormulaReport({ version: 1, entries: [confirmed] }, library, request({ expectedReport: formulaReportSignature(confirmed) }), later).entries[0]).toEqual({ ...confirmed, updatedAt: later });
  });
  it("can explicitly reconfirm changed content against a changed current expression", () => {
    const current = { ...library, entries: [{ ...formula, expression: "x+2" }] };
    const result = saveFormulaReport(reports, current, request({ body: "new", expectedExpression: "x+2", confirm: true }), now);
    expect(result.entries[0]).toMatchObject({ body: "new", confirmedExpression: "x+2" });
  });
  it("rejects same-ID expression changes before confirmation even when result might match", () => {
    expect(() => saveFormulaReport(reports, { ...library, entries: [{ ...formula, expression: "1+x" }] }, request({ confirm: true }), now)).toThrow("変更されています");
  });
  it.each(["title", "body", "updatedAt"] as const)("rejects a stale report after remote %s changes", field => {
    const current = { ...report, [field]: field === "updatedAt" ? "2026-10-23T00:00:00Z" : "remote" };
    expect(() => saveFormulaReport({ version: 1, entries: [current] }, library, request({ confirm: true }), now)).toThrow("変更されています");
  });
  it("does not collide on same-name formulas", () => {
    const second = { ...formula, id: "f2" };
    const next = saveFormulaReport(reports, { ...library, entries: [formula, second] }, request({ id: "r2", formulaId: "f2", expectedReport: null }), now);
    expect(next.entries.map(item => item.formulaId)).toEqual(["f1", "f2"]);
  });
  it("retains orphan reports after deletion, allows rescue edits but not confirmation or creation", () => {
    const deleted = removeFormula(library, formula.id);
    expect(readFormulaReports(reports)).toEqual(reports);
    const edited = saveFormulaReport(reports, deleted, request({ expectedExpression: null, body: "rescue" }), now);
    expect(edited.entries[0].body).toBe("rescue");
    expect(() => saveFormulaReport(reports, deleted, request({ expectedExpression: null, confirm: true }), now)).toThrow("登録式が見つからない");
    expect(() => saveFormulaReport(emptyFormulaReports(), deleted, request({ expectedExpression: null, expectedReport: null }), now)).toThrow("登録式が見つからない");
    expect(() => saveFormulaReport(reports, deleted, request(), now)).toThrow("変更されています");
  });
  it("does not permit changing the report ID or reassociating an existing ID", () => {
    expect(() => saveFormulaReport(reports, library, request({ id: "other" }), now)).toThrow("ID");
    expect(() => saveFormulaReport(reports, { ...library, entries: [formula, { ...formula, id: "f2" }] }, request({ formulaId: "f2", expectedReport: null }), now)).toThrow("ID");
  });
  it("preserves unknown wrapper and record fields through edit", () => {
    const value = { version: 1, future: { metadata: true }, entries: [{ ...report, future: ["keep"] }] };
    const input = readFormulaReports(value), original = JSON.stringify(input);
    const next = saveFormulaReport(input, library, request({ body: "edited", expectedReport: formulaReportSignature(input.entries[0]) }), now);
    expect(next).toMatchObject({ future: { metadata: true }, entries: [{ future: ["keep"] }] }); expect(JSON.stringify(input)).toBe(original);
  });
  it.each([null, {}, { version: 2, entries: [] }, { version: 1, entries: [report, report] }, { version: 1, entries: [report, { ...report, id: "r2" }] }, { version: 1, entries: [{ ...report, body: 1 }] }, { version: 1, entries: [{ ...report, confirmedExpression: undefined }] }, { version: 1, entries: [{ ...report, updatedAt: "bad" }] }, { version: 1, entries: [{ ...report, confirmedExpression: " " }] }])("rejects unknown/invalid structure without repairing %j", value => {
    expect(() => readFormulaReports(value)).toThrow();
    const raw = JSON.stringify({ ...defaultData, formulaReports: value });
    expect(loadData({ getItem: () => raw })).toMatchObject({ status: "error", raw });
  });
  it("bounds UTF-16 content without truncation and includes unknown fields in UTF-8 quota", () => {
    expect(readFormulaReports({ version: 1, entries: [{ ...report, body: "x".repeat(FORMULA_REPORT_BODY_LIMIT) }] }).entries[0].body).toHaveLength(FORMULA_REPORT_BODY_LIMIT);
    expect(() => readFormulaReports({ version: 1, entries: [{ ...report, body: "x".repeat(FORMULA_REPORT_BODY_LIMIT + 1) }] })).toThrow();
    expect(() => readFormulaReports({ ...reports, metadata: "あ".repeat(FORMULA_REPORT_BYTES_LIMIT / 3) })).toThrow("バイト");
    expect(() => readFormulaReports({ version: 1, entries: Array.from({ length: 201 }, (_, i) => ({ ...report, id: `r${i}`, formulaId: `f${i}` })) })).toThrow();
    expect(() => readFormulaReports({ version: 1, entries: [{ ...report, title: "x".repeat(121) }] })).toThrow();
  });
  it("accepts exactly the count and UTF-8 byte limits but rejects an additional byte", () => {
    expect(readFormulaReports({ version: 1, entries: Array.from({ length: 200 }, (_, i) => ({ ...report, id: `r${i}`, formulaId: `f${i}` })) }).entries).toHaveLength(200);
    const shell = { ...reports, metadata: "" };
    const budget = FORMULA_REPORT_BYTES_LIMIT - new TextEncoder().encode(JSON.stringify(shell)).byteLength;
    expect(readFormulaReports({ ...shell, metadata: "x".repeat(budget) })).toMatchObject(reports);
    expect(() => readFormulaReports({ ...shell, metadata: "x".repeat(budget + 1) })).toThrow("バイト");
  });
  it("preserves Markdown, HTML, fences and special characters verbatim without running them", () => {
    const body = "# 数式\n$x^2$\n```js\nthrow Error('never run');\n```\n<script>window.reportExecuted=true</script>\n& < > | \\\n";
    expect(saveFormulaReport(reports, library, request({ body }), now).entries[0].body).toBe(body);
  });
});
describe("formula report storage boundary", () => {
  it("loads old data without inventing reports and preserves root/settings/record unknown fields", () => {
    expect(stored(defaultData)).toMatchObject({ status: "ok", data: defaultData });
    const value = { ...defaultData, future: { keep: true }, settings: { ...defaultData.settings, future: "keep" }, formulaLibrary: library, formulaReports: { ...reports, entries: [{ ...report, future: "keep" }] } };
    const loaded = stored(value); expect(loaded).toMatchObject({ status: "ok", data: value });
    if (loaded.status !== "ok") throw Error("load failed");
    let raw = JSON.stringify(value); const storage = { getItem: () => raw, setItem: (_key: string, value: string) => { raw = value; } };
    expect(saveDataChecked(loaded.data, raw, storage).ok).toBe(true); expect(JSON.parse(raw)).toEqual(value);
  });
  it("normalizes known settings without dropping unknown settings", () => {
    const result = stored({ ...defaultData, settings: { theme: "unknown", activePanel: "unknown", identificationMode: "future", customSetting: "keep" } });
    expect(result).toMatchObject({ status: "ok", data: { settings: { theme: "system", activePanel: "history", customSetting: "keep" } } });
    if (result.status === "ok") expect(result.data.settings).not.toHaveProperty("identificationMode");
  });
  it("never writes malformed report candidates over good data", () => {
    const raw = JSON.stringify(defaultData), setItem = vi.fn();
    const invalid = { ...defaultData, formulaReports: { version: 2, entries: [] } } as unknown as StoredData;
    expect(saveDataChecked(invalid, raw, { getItem: () => raw, setItem })).toEqual({ ok: false, reason: "invalid" }); expect(setItem).not.toHaveBeenCalled();
  });
  it("does not conflate failed persistence or cross-tab conflict with success", () => {
    const raw = JSON.stringify(defaultData), candidate = { ...defaultData, formulaReports: reports };
    expect(saveDataChecked(candidate, raw, { getItem: () => raw, setItem: () => { throw Error("quota"); } })).toEqual({ ok: false, reason: "unavailable" });
    const setItem = vi.fn(); expect(saveDataChecked(candidate, raw, { getItem: () => JSON.stringify({ ...defaultData, future: 1 }), setItem })).toEqual({ ok: false, reason: "conflict" }); expect(setItem).not.toHaveBeenCalled();
  });
});
