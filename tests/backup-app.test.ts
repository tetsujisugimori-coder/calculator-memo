// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { CalculatorApp } from "../components/CalculatorApp";
import { defaultData, STORAGE_KEY } from "../lib/storage";

it("backs up saved bytes while unsaved calculation state remains in the app", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  const raw = JSON.stringify({ ...defaultData, future: "保存原本" });
  localStorage.clear(); localStorage.setItem(STORAGE_KEY, raw);
  const url = vi.fn((blob: Blob) => { void blob; return "blob:test"; }); vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: url, revokeObjectURL: vi.fn() }));
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  const click = async (label: string) => { const b = [...host.querySelectorAll("button")].find(x => x.textContent === label); expect(b, label).toBeTruthy(); await act(async () => b!.click()); };
  try {
    await act(async () => root.render(createElement(CalculatorApp)));
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
    expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
    vi.stubGlobal("navigator", { locks: { request: () => Promise.reject(new Error("test lock denied")) } });
    await click("1"); await click("=");
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
    expect(host.textContent).toContain("未保存");
    const write = vi.spyOn(Storage.prototype, "setItem");
    await click("データのバックアップ"); await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
    await click("JSONを書き出す");
    const blob = url.mock.calls[0][0] as Blob;
    const text = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsText(blob); });
    expect(JSON.parse(text).entries[0].raw).toBe(raw);
    expect(JSON.parse(JSON.parse(text).entries[0].raw).history).toHaveLength(0);
    expect(host.textContent).toContain("未保存"); expect(write).not.toHaveBeenCalled(); expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
  } finally { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); }
});

it("does not calculate or save when Enter originates outside an open backup dialog", async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  const raw = JSON.stringify(defaultData); localStorage.clear(); localStorage.setItem(STORAGE_KEY, raw);
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  const click = async (label: string) => { const b = [...host.querySelectorAll("button")].find(x => x.textContent === label); expect(b, label).toBeTruthy(); await act(async () => b!.click()); };
  try {
    await act(async () => root.render(createElement(CalculatorApp)));
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
    await click("1"); await click("データのバックアップ");
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
    const before = localStorage.getItem(STORAGE_KEY); const write = vi.spyOn(Storage.prototype, "setItem");
    await act(async () => { document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); });
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 20)); });
    expect(write).not.toHaveBeenCalled(); expect(localStorage.getItem(STORAGE_KEY)).toBe(before);
    expect(host.querySelector(".history-panel")?.textContent).not.toContain("= 1");
  } finally { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); }
});
