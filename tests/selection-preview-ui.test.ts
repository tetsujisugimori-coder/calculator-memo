// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CalculatorApp } from "../components/CalculatorApp";
import { SelectionPreviewModal } from "../components/SelectionPreviewModal";
import { collectBackup, serializeBackup } from "../lib/backup";
import { STORAGE_KEY } from "../lib/storage";
import { RECOVERY_KEYS } from "../lib/restore-storage";
const date = "2026-10-31T00:00:00.000Z";
const data = { version: 1, history: [{ id: "h1", expression: "1+2", displayExpression: "1+2", result: 3, resultText: "3", createdAt: date }], notes: [], settings: { theme: "light", activePanel: "history" } };
const source = ` ${JSON.stringify(data)} `;
function backup(raw = source) { const result = collectBackup({ getItem: () => raw }); if (result.status !== "ready") throw Error("fixture"); return serializeBackup(result.backup); }
let host: HTMLDivElement; let root: ReturnType<typeof createRoot>;
const pause = () => new Promise(resolve => setTimeout(resolve, 20));
function button(label: string, scope: ParentNode = host) { const found = [...scope.querySelectorAll("button")].find(item => item.textContent === label); expect(found, label).toBeTruthy(); return found!; }
async function click(label: string, scope: ParentNode = host) { await act(async () => button(label, scope).click()); }
async function mount() { await act(async () => root.render(createElement(CalculatorApp))); await act(pause); await click("選択復元プレビュー"); }
async function upload(text = backup(), size = new TextEncoder().encode(text).length, deferred?: Promise<string>) { const input = host.querySelector<HTMLInputElement>('input[type="file"]')!; const file = { name: "synthetic.json", size, text: () => deferred ?? Promise.resolve(text) }; await act(async () => { Object.defineProperty(input, "files", { configurable: true, value: [file] }); input.dispatchEvent(new Event("change", { bubbles: true })); }); }
const compareLabel = "現在データを明示的に再取得して比較";
beforeEach(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} }); Object.defineProperty(navigator, "locks", { configurable: true, value: { request: vi.fn(async (_name: string, callback: () => unknown) => callback()) } }); localStorage.clear(); localStorage.setItem(STORAGE_KEY, source); localStorage.setItem(RECOVERY_KEYS[0], "synthetic protected recovery raw"); host = document.createElement("div"); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); Object.defineProperty(navigator, "locks", { configurable: true, value: undefined }); });
describe("read-only selection preview UI", () => {
 it("opens, reads, compares, inspects, selects and closes without any storage mutations", async () => { const write = vi.spyOn(Storage.prototype, "setItem"); const remove = vi.spyOn(Storage.prototype, "removeItem"); const clear = vi.spyOn(Storage.prototype, "clear"); await mount(); await upload(); expect(host.textContent).toContain("第1段階・読み取り専用"); await click(compareLabel); const article = host.querySelector("[data-preview-key]")!; expect(article.textContent).toContain("h1"); await click("個別詳細", article); expect(host.querySelector("pre")?.textContent).toContain("1+2"); await click("復元候補に選択", article); expect(host.textContent).toContain("復元候補 1件"); await click("候補から解除", article); await click("プレビューを閉じる"); await act(pause); expect(write).not.toHaveBeenCalled(); expect(remove).not.toHaveBeenCalled(); expect(clear).not.toHaveBeenCalled(); expect(localStorage.getItem(STORAGE_KEY)).toBe(source); expect(localStorage.getItem(RECOVERY_KEYS[0])).toBe("synthetic protected recovery raw"); });
 it("opening and closing revokes already queued autosave without flushing unsaved data", async () => {
  const queued: (() => unknown)[] = [];
  Object.defineProperty(navigator, "locks", { configurable: true, value: { request: vi.fn(async (_name: string, callback: () => unknown) => { queued.push(callback); }) } });
  await act(async () => root.render(createElement(CalculatorApp))); await act(pause);
  const theme = host.querySelector<HTMLSelectElement>('select[aria-label="テーマ"]')!;
  await act(async () => { theme.value = "dark"; theme.dispatchEvent(new Event("change", { bubbles: true })); });
  const write = vi.spyOn(Storage.prototype, "setItem"); await click("選択復元プレビュー"); await click("プレビューを閉じる");
  await act(async () => { for (const callback of queued) callback(); });
  expect(write).not.toHaveBeenCalled(); expect(localStorage.getItem(STORAGE_KEY)).toBe(source);
 });
 it("rejects malformed files and clears old candidates at file change", async () => { await mount(); await upload(); await click("復元候補に選択", host.querySelector("[data-preview-key]")!); await upload("{broken"); expect(host.querySelector("[data-preview-key]")).toBeNull(); expect(host.textContent).not.toContain("復元候補 1件"); expect(host.querySelector('[role="alert"]')).toBeTruthy(); });
 it("revokes stale item actions synchronously on file replacement", async () => {
  await mount(); await upload(); const oldSelect = button("復元候補に選択", host.querySelector("[data-preview-key]")!);
  const input = host.querySelector<HTMLInputElement>('input[type="file"]')!; const text = backup();
  await act(async () => { Object.defineProperty(input, "files", { configurable: true, value: [{ name: "replacement.json", size: new TextEncoder().encode(text).length, text: () => Promise.resolve(text) }] }); input.dispatchEvent(new Event("change", { bubbles: true })); oldSelect.click(); });
  expect(host.textContent).toContain("復元候補 0件");
 });
 it("checks size before reading file text", async () => { await mount(); const text = vi.fn(); const input = host.querySelector<HTMLInputElement>('input[type="file"]')!; await act(async () => { Object.defineProperty(input, "files", { configurable: true, value: [{ name: "huge.json", size: 16 * 1024 * 1024 + 1, text }] }); input.dispatchEvent(new Event("change", { bubbles: true })); }); expect(text).not.toHaveBeenCalled(); expect(host.textContent).toContain("読み込んでいません"); });
 it("does not let an older asynchronous file replace the newer file", async () => { await mount(); let resolve!: (text: string) => void; const pending = new Promise<string>(done => { resolve = done; }); await upload(backup(), undefined, pending); await upload("{broken"); await act(async () => resolve(backup())); expect(host.querySelector("[data-preview-key]")).toBeNull(); expect(host.querySelector('[role="alert"]')).toBeTruthy(); });
 it("storage notification invalidates even equal bytes without automatic reacquisition", async () => { await mount(); await upload(); await click(compareLabel); await act(async () => window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY, newValue: source }))); expect(host.textContent).toContain("比較失効"); expect(host.querySelector('[data-comparison="same"]')).toBeNull(); await click(compareLabel); expect(host.textContent).toContain("取得時点の比較"); });
 it("same-tab raw change is caught before an item action", async () => { await mount(); await upload(); await click(compareLabel); localStorage.setItem(STORAGE_KEY, source + " "); await click("個別詳細", host.querySelector("[data-preview-key]")!); expect(host.textContent).toContain("比較失効"); expect(host.querySelector('[data-comparison="same"]')).toBeNull(); });
 it("read failure clears prior success and reports UNKNOWN", async () => { await mount(); await upload(); await click(compareLabel); vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw Error("denied"); }); await click(compareLabel); expect(host.textContent).toContain("読取失敗（UNKNOWN）"); expect(host.querySelector('[data-comparison="same"]')).toBeNull(); });
 it("distinguishes acquired but invalid current JSON from read failure", async () => { await mount(); await upload(); localStorage.setItem(STORAGE_KEY, "{broken"); await click(compareLabel); expect(host.textContent).toContain("検証不能（UNKNOWN）: 原文は取得しました"); expect(host.querySelector('[data-comparison="unknown"]')).toBeTruthy(); expect(host.querySelector('[data-comparison="read-error"]')).toBeNull(); });
 it("same-turn app generation change invalidates before selection", async () => { let generation = 0; await act(async () => root.render(createElement(SelectionPreviewModal, { generation: 0, getGeneration: () => generation, onClose: vi.fn() }))); await upload(); await click(compareLabel); generation++; await click("復元候補に選択", host.querySelector("[data-preview-key]")!); expect(host.textContent).toContain("比較失効"); });
 it("details escape HTML and never evaluate expressions", async () => { await mount(); const altered = { ...data, history: [{ ...data.history[0], expression: '<img src=x onerror="globalThis.injected=1">', displayExpression: "danger" }] }; await upload(backup(JSON.stringify(altered))); await click("個別詳細", host.querySelector("[data-preview-key]")!); expect(host.querySelector("pre")?.textContent).toContain("<img"); expect(host.querySelector("img")).toBeNull(); expect(localStorage.getItem(STORAGE_KEY)).toBe(source); });
 it("unmount clears transient selection and does not expose a restore execution control", async () => { await mount(); await upload(); await click("復元候補に選択", host.querySelector("[data-preview-key]")!); expect([...host.querySelectorAll('button')].some(item => item.textContent === "復元を実行する")).toBe(false); await click("プレビューを閉じる"); await click("選択復元プレビュー"); expect(host.querySelector("[data-preview-key]")).toBeNull(); });
});
