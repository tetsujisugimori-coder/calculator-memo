// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BackupModal } from "../components/BackupModal";
import { STORAGE_KEY } from "../lib/storage";

const raw = '{ "version":1, "history":[], "notes":[], "settings":{"theme":"light","activePanel":"history"}, "future":"日本語\\n😀" }';
let host: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
let createUrl: ReturnType<typeof vi.fn>;
async function open() {
  await act(async () => { root.render(createElement(BackupModal, { onClose: () => {} })); });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
}
function button(text: string) { return [...host.querySelectorAll("button")].find(b => b.textContent === text)!; }
async function click(text: string) { await act(async () => button(text).click()); }

describe("backup modal", () => {
  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    localStorage.clear(); localStorage.setItem(STORAGE_KEY, raw); localStorage.setItem("other-app", "private");
    createUrl = vi.fn(() => "blob:test"); vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: createUrl, revokeObjectURL: vi.fn() }));
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  });
  afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
  it("exports exact saved source only without writes and distinguishes request from saved file", async () => {
    const write = vi.spyOn(Storage.prototype, "setItem");
    await open(); expect(host.textContent).toContain("未保存の編集内容は含まれません");
    await click("JSONを書き出す");
    const blob = createUrl.mock.calls[0][0] as Blob;
    const text = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsText(blob); });
    const payload = JSON.parse(text);
    expect(payload.entries).toHaveLength(1); expect(payload.entries[0].key).toBe(STORAGE_KEY); expect(payload.entries[0].raw).toBe(raw);
    expect(write).not.toHaveBeenCalled(); expect(localStorage.getItem(STORAGE_KEY)).toBe(raw); expect(localStorage.getItem("other-app")).toBe("private");
    expect(host.textContent).toContain("保存完了は確認できません");
  });
  it("invalidates immediately on even same-value storage events before a React render", async () => {
    await open();
    await act(async () => { window.dispatchEvent(new StorageEvent("storage", { key: STORAGE_KEY, oldValue: raw, newValue: raw })); button("JSONを書き出す").click(); });
    expect(createUrl).not.toHaveBeenCalled(); expect(host.textContent).toContain("再取得してください");
  });
  it("refuses changed source without writing", async () => {
    await open(); localStorage.setItem(STORAGE_KEY, "changed"); const write = vi.spyOn(Storage.prototype, "setItem");
    await click("JSONを書き出す"); expect(createUrl).not.toHaveBeenCalled(); expect(write).not.toHaveBeenCalled(); expect(localStorage.getItem(STORAGE_KEY)).toBe("changed");
  });
  it("does not revive a detected mismatch after same-turn ABA", async () => {
    await open();
    await act(async () => {
      localStorage.setItem(STORAGE_KEY, "changed"); button("JSONを書き出す").click();
      localStorage.setItem(STORAGE_KEY, raw); button("JSONを書き出す").click();
    });
    expect(createUrl).not.toHaveBeenCalled();
  });
  it("does not export old state during same-turn refresh", async () => {
    await open();
    await act(async () => { button("再取得").click(); button("JSONを書き出す").click(); });
    expect(createUrl).not.toHaveBeenCalled();
    await click("JSONを書き出す"); expect(createUrl).toHaveBeenCalledOnce();
  });
  it("reports download failures and preserves original", async () => {
    await open(); createUrl.mockImplementation(() => { throw Error("blocked"); }); await click("JSONを書き出す");
    expect(host.textContent).toContain("書き出しを開始できませんでした"); expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
  });
});
