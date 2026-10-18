// Synthetic-only PR GUI regression harness. Run from the repository root.
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { stripVTControlCharacters } from "node:util";

process.chdir(fileURLToPath(new URL("../", import.meta.url)));

const output = "gui-evidence";
await mkdir(output, { recursive: true });
const metadata = {
  schemaVersion: 2, scenarios: [], status: "running", stage: "provenance", checks: [], errors: [],
  expectedSha: process.env.EXPECTED_SHA || null,
  branch: process.env.PR_BRANCH || null, pr: process.env.PR_NUMBER || null,
  run: process.env.GITHUB_RUN_ID || "local", attempt: process.env.GITHUB_RUN_ATTEMPT || "1",
  startedAt: new Date().toISOString(), node: process.version,
  runner: { os: process.env.RUNNER_OS, image: process.env.ImageOS, version: process.env.ImageVersion },
  syntheticDataOnly: true, productionDeployed: false,
  method: "Playwright Chromium and WebKit on loopback-only Pages preview; mobile/touch emulation, not physical iPhone Safari",
};
const persist = () => writeFile(output + "/provenance.json", JSON.stringify(metadata, null, 2) + "\n");
await persist();
const origin = "http://127.0.0.1:4183";
const base = origin + "/calculator-memo/";
let server, log, browser, context, page, expect;
let serverReady = false;
function assertOwnedServer() {
  assert.ok(server && serverReady && server.exitCode === null && server.signalCode === null && !metadata.serverError, "The preview started by this harness must still be alive");
}
let browserErrors = [];
let currentScenario;
let activeScenarioRecord;
// Locator.tap emits touch input; desktop retains mouse clicks. No forced clicks.
async function activate(locator) {
  if (currentScenario.hasTouch) {
    const before = await page.evaluate(() => window.__guiTouchStarts);
    await locator.tap();
    await expect.poll(() => page.evaluate(() => window.__guiTouchStarts)).toBeGreaterThan(before);
    activeScenarioRecord.touchActivations = (activeScenarioRecord.touchActivations || 0) + 1;
  } else await locator.click();
}
async function assertHorizontalFit() {
  const dimensions = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
  assert.equal(dimensions.viewport, currentScenario.width, "CSS viewport must remain configured width");
  assert.ok(dimensions.document <= dimensions.viewport + 1 && dimensions.body <= dimensions.viewport + 1, JSON.stringify(dimensions));
  for (const modal of await page.getByRole("dialog").all()) {
    if (!(await modal.isVisible())) continue;
    const bounds = await modal.boundingBox();
    assert.ok(bounds && bounds.x >= -1 && bounds.x + bounds.width <= currentScenario.width + 1, "Dialog must fit horizontal viewport");
    const content = modal.locator(".modal-content");
    for (const scrollArea of await content.all()) {
      const size = await scrollArea.evaluate((element) => ({ scroll: element.scrollWidth, client: element.clientWidth }));
      assert.ok(size.scroll <= size.client + 1, "Synthetic modal content must not be horizontally clipped: " + JSON.stringify(size));
    }
  }
}
async function assertHeaderFit(label) {
  const geometry = await page.evaluate(() => {
    const rect = (element) => {
      const { x, y, width, height, top, right, bottom, left } = element.getBoundingClientRect();
      return { x, y, width, height, top, right, bottom, left };
    };
    const header = document.querySelector(".topbar");
    const guide = document.querySelector(".header-actions > button");
    const range = document.createRange(); range.selectNodeContents(guide);
    return {
      viewport: innerWidth, header: rect(header), documentWidth: document.documentElement.scrollWidth,
      guideLines: [...range.getClientRects()].map((item) => ({ top: item.top, bottom: item.bottom, left: item.left, right: item.right })),
      controls: [".wordmark", ".header-actions > button", ".theme-select"].map((selector) => {
        const element = document.querySelector(selector), bounds = rect(element);
        const target = document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
        return { selector, ...bounds, hit: element === target || element.contains(target) };
      }),
      select: rect(document.querySelector(".theme-select select")),
    };
  });
  assert.ok(Math.abs(geometry.header.top) <= 1, label + ": sticky header stays at viewport top");
  assert.ok(geometry.documentWidth <= geometry.viewport + 1, label + ": no document overflow");
  for (const control of geometry.controls) {
    assert.ok(control.left >= 0 && control.right <= geometry.viewport + 1 && control.top >= geometry.header.top && control.bottom <= geometry.header.bottom + 1,
      label + ": header contains " + JSON.stringify(control));
    assert.ok(control.hit, label + ": control center is not covered: " + control.selector);
    if (control.selector !== ".wordmark") assert.ok(control.height >= 44, label + ": header actions have 44px touch height");
  }
  assert.ok(geometry.select.height >= 44, label + ": native theme select has 44px touch height");
  for (let i = 0; i < geometry.controls.length; i += 1) {
    for (const other of geometry.controls.slice(i + 1)) {
      const control = geometry.controls[i];
      assert.ok(control.right <= other.left || other.right <= control.left || control.bottom <= other.top || other.bottom <= control.top,
        label + ": header controls must not overlap");
    }
  }
  assert.equal(geometry.guideLines.length, 1, label + ": 数式ガイド remains a single line");
  const line = geometry.guideLines[0], guide = geometry.controls[1];
  assert.ok(line.top >= guide.top && line.bottom <= guide.bottom && line.left >= guide.left && line.right <= guide.right,
    label + ": guide text is fully contained");
  activeScenarioRecord.headerGeometry ||= [];
  activeScenarioRecord.headerGeometry.push({ label, ...geometry });
}
async function exerciseHeader(prefix) {
  await stage(prefix + ": responsive-header-guide-theme-scroll");
  await page.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
  await assertHeaderFit("initial");
  await screenshot(prefix + "-header");
  const guideButton = page.locator(".header-actions > button");
  await activate(guideButton);
  const guide = page.getByRole("dialog", { name: "KaTeX 数式ガイド", exact: true });
  await expect(guide).toBeVisible();
  await expect(guide.getByRole("heading", { name: "数式ブロック", exact: true })).toBeVisible();
  await screenshot(prefix + "-guide");
  await guide.getByRole("textbox").fill("分数");
  await expect(guide.getByRole("heading", { name: "分数", exact: true })).toBeVisible();
  await activate(guide.getByRole("button", { name: "よく使う公式", exact: true }));
  await expect(guide.locator(".guide-card")).not.toHaveCount(0);
  const content = guide.locator(".modal-content");
  await content.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await expect(guide.getByRole("button", { name: "閉じる", exact: true })).toBeInViewport();
  await activate(guide.getByRole("button", { name: "閉じる", exact: true }));
  await expect(guide).toHaveCount(0);
  const theme = page.getByRole("combobox", { name: "テーマ", exact: true });
  await activate(theme);
  await theme.selectOption("dark");
  await page.keyboard.press("Escape"); // dismiss a native select popup where present
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect.poll(storage).toMatchObject({ settings: { theme: "dark" } });
  await page.reload();
  await expect(theme).toHaveValue("dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await assertHeaderFit("dark-theme");
  await theme.selectOption("system");
  await expect.poll(storage).toMatchObject({ settings: { theme: "system" } });
  await theme.selectOption("light");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.evaluate(() => scrollTo({ top: document.body.scrollHeight, behavior: "instant" }));
  await assertHeaderFit("page-scrolled");
  await activate(guideButton);
  await expect(guide).toBeVisible();
  await activate(guide.getByRole("button", { name: "閉じる", exact: true }));
  await assertHeaderFit("closed-after-scroll");
  await page.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
  if (currentScenario.id === "chromium-desktop-1365px" || currentScenario.id === "webkit-mobile-375px") {
    for (const width of [320, 360, 414, 540, 720, 721]) {
      await page.setViewportSize({ width, height: currentScenario.height });
      await assertHeaderFit("width-" + width);
    }
    await page.setViewportSize({ width: currentScenario.width, height: currentScenario.height });
  }
  await passed(prefix + ": header text/targets contained, guide open/category/scroll/close, theme change, sticky reopen");
}
async function stage(name) { metadata.stage = name; await persist(); }
async function passed(name) { metadata.checks.push(name); console.log("PASS:", name); await persist(); }
async function screenshot(name) {
  await assertHorizontalFit();
  // Test-only visual label, removed immediately after capture; not an app feature.
  await page.evaluate((identity) => {
    const banner = document.createElement("div");
    banner.id = "gui-test-overlay";
    banner.textContent = "TEST OVERLAY | " + identity;
    banner.style.cssText = "position:fixed;bottom:0;left:0;right:0;z-index:99999;background:#101820;color:#fff;font:11px monospace;padding:8px;overflow-wrap:anywhere;pointer-events:none";
    document.body.append(banner);
  }, currentScenario.id + " | " + metadata.branch + " | SHA " + metadata.sha + " | run " + metadata.run + "/" + metadata.attempt);
  try { await page.screenshot({ path: output + "/" + name + ".png", fullPage: true }); }
  finally { await page.locator("#gui-test-overlay").evaluate((element) => element.remove()); }
}
const button = (name) => page.getByRole("button", { name, exact: true });
async function selectPanel(panel) {
  const tab = page.getByRole("tab", { name: panel === "notes" ? /^メモ/ : /^履歴/ });
  if (await tab.isVisible()) {
    await activate(tab);
    await expect(tab).toHaveAttribute("aria-selected", "true");
  }
  await expect(page.locator("#" + panel + "-panel")).toBeVisible();
}
async function storage() { return page.evaluate(() => JSON.parse(localStorage.getItem("calculation-memo:data"))); }
async function exercise(scenario) {
  assertOwnedServer();
  currentScenario = scenario;
  const { width, height, isMobile, hasTouch, deviceScaleFactor } = scenario;
  const prefix = scenario.id;
  const record = { ...scenario, browserVersion: browser.version(), startedAt: new Date().toISOString(), status: "running" };
  activeScenarioRecord = record;
  metadata.scenarios.push(record);
  await stage(prefix + ": browser-context");
  browserErrors = [];
  context = await browser.newContext({ viewport: { width, height }, isMobile, hasTouch, deviceScaleFactor, locale: "ja-JP", timezoneId: "Asia/Tokyo", colorScheme: "light", serviceWorkers: "block" });
  await context.route("**/*", (route) => {
    if (new URL(route.request().url()).origin !== origin) {
      browserErrors.push({ type: "blocked-external-request", url: route.request().url() });
      return route.abort();
    }
    return route.continue();
  });
  await context.addInitScript(() => {
    window.__guiTouchStarts = 0;
    document.addEventListener("touchstart", () => { window.__guiTouchStarts += 1; }, { passive: true });
  });
  await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
  page = await context.newPage();
  page.setDefaultTimeout(10000);
  page.on("pageerror", (error) => browserErrors.push({ type: "pageerror", message: error.message }));
  page.on("console", (message) => { if (message.type() === "error") browserErrors.push({ type: "console", message: message.text() }); });
  page.on("response", (response) => { if (response.status() >= 400) browserErrors.push({ type: "http", status: response.status(), url: response.url() }); });
  await stage(prefix + ": served-provenance");
  await page.goto(base);
  const served = await page.evaluate(async () => {
    const response = await fetch("./__gui_provenance.json", { cache: "no-store" });
    if (!response.ok) throw new Error("GUI provenance not served");
    return response.json();
  });
  assert.deepEqual(served, metadata.servedIdentity);
  await passed(prefix + ": browser fetched exact SHA/branch/run provenance from built output");
  await expect.poll(storage).toMatchObject({ notes: [], history: [] });
  await assertHorizontalFit();
  record.environment = await page.evaluate(() => ({ userAgent: navigator.userAgent, maxTouchPoints: navigator.maxTouchPoints, coarsePointer: matchMedia("(pointer: coarse)").matches, innerWidth, devicePixelRatio }));
  assert.equal(record.environment.innerWidth, width, "Viewport meta must preserve CSS width");
  if (hasTouch) {
    // Linux Playwright WebKit 26 reports maxTouchPoints=0 even with touch
    // emulation enabled. Record it without spoofing; actual tap delivery is required.
    assert.ok(record.environment.coarsePointer, "Mobile context must expose a coarse pointer");
    await activate(button("1"));
    await expect(page.locator(".lcd-result")).toHaveText("1");
    record.touchStarts = await page.evaluate(() => window.__guiTouchStarts);
    assert.ok(record.touchStarts > 0, "Mobile activation must deliver real browser touch events");
    await passed(prefix + ": mobile viewport/coarse pointer and touch event delivery confirmed");
  }
  await exerciseHeader(prefix);
  await stage(prefix + ": arithmetic-history-error-recovery");
  const cases = [
    { keys: ["1", "2", "足す", "3", "4"], expression: "12 ＋ 34", result: "46" },
    { keys: ["9", "引く", "4"], expression: "9 − 4", result: "5" },
    { keys: ["7", "掛ける", "6"], expression: "7 × 6", result: "42" },
    { keys: ["8", "割る", "2"], expression: "8 ÷ 2", result: "4" },
  ];
  for (const [index, sample] of cases.entries()) {
    await activate(button("すべて消去"));
    for (const key of sample.keys) await activate(button(key));
    await activate(button("計算する"));
    await expect(page.locator(".lcd-result")).toHaveText(sample.result);
    await expect(page.locator(".lcd-expression")).toHaveText(sample.expression);
    await selectPanel("history");
    await expect(page.locator(".history-item")).toHaveCount(index + 1);
    await expect(page.locator(".history-item").first()).toContainText("= " + sample.result);
  }
  await activate(button("すべて消去"));
  for (const key of ["1", "割る", "0", "計算する"]) await activate(button(key));
  await expect(page.locator(".lcd-result")).toHaveText("Error");
  await expect(page.locator(".history-item")).toHaveCount(4);
  await expect(button("単独計算メモを作成")).toBeDisabled();
  await activate(button("すべて消去"));
  await expect(page.locator(".lcd-result")).toHaveText("0");
  const history = page.locator(".history-item").filter({ has: page.locator(".history-formula span", { hasText: "12 ＋ 34" }) });
  await activate(history.getByRole("button", { name: "戻す", exact: true }));
  await expect(page.locator(".lcd-expression")).toHaveText("12 ＋ 34");
  await expect(page.locator(".lcd-result")).toHaveText("34"); // Editing state, not recomputation.
  await expect(button("単独計算メモを作成")).toBeDisabled();
  await passed(prefix + ": all four arithmetic operations, four history entries, error recovery, editable history restore");
  await screenshot(prefix + "-arithmetic-history");
  await stage(prefix + ": single-memo-save-cancel-edit");
  await activate(history.getByRole("button", { name: "単独計算メモ", exact: true }));
  const dialog = page.getByRole("dialog");
  await assertHorizontalFit();
  await dialog.getByLabel("タイトル", { exact: false }).fill("Synthetic single memo");
  await dialog.getByLabel("前提・補足", { exact: false }).fill("Synthetic data only.");
  await activate(dialog.getByRole("button", { name: "保存する", exact: true }));
  await selectPanel("notes");
  const single = page.locator(".note-card").filter({ hasText: "Synthetic single memo" });
  await expect(single).toBeVisible();
  await expect(single).toContainText("= 46");
  await activate(single.getByRole("button", { name: "編集", exact: true }));
  await dialog.getByLabel("タイトル", { exact: false }).fill("Discard this synthetic edit");
  await activate(dialog.getByRole("button", { name: "キャンセル", exact: true }));
  await expect(dialog).toHaveCount(0);
  await expect(single).toBeVisible();
  await expect(page.getByText("Discard this synthetic edit")).toHaveCount(0);
  await activate(single.getByRole("button", { name: "編集", exact: true }));
  await dialog.getByLabel("タイトル", { exact: false }).fill("Synthetic single memo edited");
  await activate(dialog.getByRole("button", { name: "保存する", exact: true }));
  await expect(single).toContainText("Synthetic single memo edited");
  await passed(prefix + ": single memo saved, cancelled edit discarded, subsequent edit saved");
  await stage(prefix + ": block-memo-save");
  await activate(page.locator("#notes-panel").getByRole("button", { name: "＋ 新規作成", exact: true }));
  await activate(dialog.getByRole("button").filter({ hasText: "BLOCKS / MARKDOWN" }));
  await dialog.getByLabel("タイトル", { exact: false }).fill("Synthetic block memo");
  await activate(dialog.getByRole("button", { name: "＋ 文章", exact: true }));
  await dialog.getByLabel("Markdown文章").fill("Synthetic block text.");
  await activate(dialog.getByRole("button", { name: "＋ 計算", exact: true }));
  await assertHorizontalFit();
  await dialog.getByLabel("計算式", { exact: true }).fill("2*(5+3)");
  await expect(dialog.locator(".calculation-live-result strong")).toHaveText("2 × (5 ＋ 3) = 16");
  await activate(dialog.getByRole("button", { name: "保存する", exact: true }));
  await expect(page.locator(".note-card")).toHaveCount(2);
  await assertSavedMemoContents();
  async function assertSavedMemoContents() {
    const block = page.locator(".note-card").filter({ hasText: "Synthetic block memo" });
    await expect(block).toBeVisible();
    await expect(block.locator(".text-block")).toHaveText("Synthetic block text.");
    await expect(block.locator(".calculation-block code")).toHaveText("2 × (5 ＋ 3)");
    await expect(block.locator(".calculation-block strong")).toHaveText("= 16");
    await expect(single).toContainText("Synthetic data only.");
    await expect.poll(storage).toMatchObject({ notes: [
      { type: "plain-calculation", title: "Synthetic block memo", blocks: [
        { type: "text", content: "Synthetic block text." },
        { type: "calculation", expression: "2*(5+3)", displayExpression: "2 × (5 ＋ 3)", result: 16, resultText: "16", error: null },
      ] },
      { type: "calculation", title: "Synthetic single memo edited", expression: "12+34", result: 46, resultText: "46", note: "Synthetic data only." },
    ] });
  }
  await passed(prefix + ": block memo text and calculation saved");
  await stage(prefix + ": reload-persistence-visible-panels");
  await expect.poll(storage).toMatchObject({ notes: [{ title: "Synthetic block memo" }, { title: "Synthetic single memo edited" }] });
  const before = await storage();
  await page.reload();
  await selectPanel("notes");
  await expect(page.locator(".note-card")).toHaveCount(2);
  await expect(single).toBeVisible();
  await assertSavedMemoContents();
  const after = await storage();
  assert.deepEqual(after.notes, before.notes);
  assert.deepEqual(after.history, before.history);
  await screenshot(prefix + "-persisted-memos");
  await activate(single.getByRole("button", { name: "詳細", exact: true }));
  await expect(dialog).toContainText("= 46");
  await activate(dialog.getByRole("button", { name: "閉じる", exact: true }).last());
  await expect(dialog).toHaveCount(0);
  await selectPanel("history");
  await expect(page.locator(".history-item")).toHaveCount(4);
  await expect(page.locator(".history-item").first()).toBeVisible();
  await screenshot(prefix + "-persisted-history");
  await passed(prefix + ": both memos/history preserved across reload; panels and detail modal actively exercised");
  await stage(prefix + ": trailing-number-edit-regression");
  await activate(button("すべて消去"));
  for (const key of ["1", "2", "引く", "3", "4"]) await activate(button(key));
  await expect(page.locator(".lcd-result")).toHaveText("34");
  await activate(button("符号反転"));
  await expect(page.locator(".lcd-result")).toHaveText("-34");
  await activate(button("符号反転"));
  await expect(page.locator(".lcd-result")).toHaveText("34");
  await activate(button("現在の数値を消去"));
  await expect(page.locator(".lcd-expression")).toHaveText("12 −");
  for (const key of ["5", "計算する"]) await activate(button(key));
  await expect(page.locator(".lcd-result")).toHaveText("7");
  await expect.poll(async () => (await storage()).history[0]).toMatchObject({ expression: "12-5", result: 7 });
  // Existing post-equals numeric re-entry and chained calculation remain supported.
  for (const key of ["掛ける", "2", "計算する"]) await activate(button(key));
  await expect(page.locator(".lcd-result")).toHaveText("14");
  await activate(button("3"));
  await expect(page.locator(".lcd-expression")).toHaveText("3");
  await activate(button("すべて消去"));
  // Keyboard input shares the same trailing-number display and CE behavior.
  await page.keyboard.type("12-3.");
  await activate(button("符号反転"));
  await expect(page.locator(".lcd-result")).toHaveText("-3");
  await activate(button("現在の数値を消去"));
  await page.keyboard.type("0.5");
  await page.keyboard.press("Enter");
  await expect(page.locator(".lcd-result")).toHaveText("11.5");
  await screenshot(prefix + "-trailing-number-edit");
  // Memo-Nexus URL input is still editable and does not evaluate/store automatically.
  const beforeUrl = await storage();
  await page.goto(base + "?expr=" + encodeURIComponent("12--34"));
  await expect(page.locator(".lcd-result")).toHaveText("-34");
  assert.deepEqual((await storage()).history, beforeUrl.history);
  await expect(button("単独計算メモを作成")).toBeDisabled();
  await activate(button("符号反転"));
  await activate(button("計算する"));
  await expect(page.locator(".lcd-result")).toHaveText("-22");
  await expect.poll(async () => (await storage()).history[0]).toMatchObject({ expression: "12-34", result: -22 });
  await passed(prefix + ": binary subtraction preserved by sign/CE, decimal keyboard replacement, chained/re-entry and URL history checks");
  await stage(prefix + ": after-equals-state-transitions");
  async function confirmed15() {
    await activate(button("すべて消去"));
    await page.keyboard.type("12+3");
    await activate(button("計算する"));
    await expect(page.locator(".lcd-result")).toHaveText("15");
    await expect(button("単独計算メモを作成")).toBeEnabled();
  }
  async function noteDisabled() {
    await expect(button("単独計算メモを作成")).toBeDisabled();
    await selectPanel("notes");
    await activate(page.locator("#notes-panel").getByRole("button", { name: "＋ 新規作成", exact: true }));
    await expect(page.getByRole("dialog").getByRole("button", { name: /SINGLE RESULT/ })).toBeDisabled();
    await page.keyboard.press("Escape");
  }
  for (const edit of ["1文字削除", "現在の数値を消去"]) {
    await confirmed15();
    const historyBeforeEdit = (await storage()).history;
    await activate(button(edit));
    await expect(page.locator(".lcd-expression")).toHaveText("12 ＋");
    await expect(page.locator(".lcd-result")).toHaveText("0");
    await noteDisabled();
    await activate(button("4"));
    assert.deepEqual((await storage()).history, historyBeforeEdit);
    await expect(page.locator(".lcd-expression")).toHaveText("12 ＋ 4");
    await activate(button("計算する"));
    await expect(page.locator(".lcd-result")).toHaveText("16");
    await expect.poll(async () => (await storage()).history[0]).toMatchObject({ expression: "12+4", result: 16 });
  }
  await confirmed15();
  await page.keyboard.press("Backspace");
  await page.keyboard.type("4");
  await page.keyboard.press("Enter");
  await expect(page.locator(".lcd-result")).toHaveText("16");
  await confirmed15();
  await activate(button("符号反転"));
  await expect(page.locator(".lcd-result")).toHaveText("-3");
  await noteDisabled();
  await activate(button("符号反転"));
  await noteDisabled();
  await activate(button("符号反転"));
  await activate(button("計算する"));
  await expect(page.locator(".lcd-result")).toHaveText("9");
  await activate(button("単独計算メモを作成"));
  await dialog.getByLabel("タイトル", { exact: false }).fill("Synthetic edited result");
  await activate(dialog.getByRole("button", { name: "保存する", exact: true }));
  await expect.poll(async () => (await storage()).notes.find((note) => note.title === "Synthetic edited result")).toMatchObject({ expression: "12+-3", result: 9, resultText: "9" });
  await passed(prefix + ": BS/CE/sign/keyboard edits invalidate confirmation and both memo entrances; recalculated memo stores new result");
  await confirmed15();
  await page.keyboard.type("+2=");
  await expect(page.locator(".lcd-result")).toHaveText("17");
  await page.keyboard.type("=");
  await expect(page.locator(".lcd-result")).toHaveText("17");
  await activate(button("."));
  await expect(page.locator(".lcd-expression")).toHaveText("0.");
  await activate(button("5"));
  await activate(button("計算する"));
  await expect(page.locator(".lcd-result")).toHaveText("0.5");
  await activate(button("7"));
  await expect(page.locator(".lcd-expression")).toHaveText("7");
  await activate(button("計算する"));
  await activate(button("現在の数値を消去"));
  await expect(page.locator(".lcd-expression")).toHaveText("0");
  await expect(page.locator(".lcd-result")).toHaveText("0");
  await activate(button("足す"));
  await expect(page.locator(".lcd-expression")).toHaveText("0");
  await noteDisabled();
  for (const repair of ["現在の数値を消去", "1文字削除", "fresh-digit"]) {
    await activate(button("すべて消去"));
    await page.keyboard.type("8/0=");
    await expect(page.locator(".lcd-result")).toHaveText("Error");
    await noteDisabled();
    if (repair !== "fresh-digit") await activate(button(repair));
    await activate(button("2"));
    await activate(button("計算する"));
    await expect(page.locator(".lcd-result")).toHaveText(repair === "fresh-digit" ? "2" : "4");
  }
  await screenshot(prefix + "-after-equals-recovery");
  await passed(prefix + ": chained/repeated equals, decimal/digit re-entry, empty CE, and zero-division CE/BS/digit recovery");
  assert.deepEqual(browserErrors, [], "Browser errors, HTTP errors, or unexpected external requests");
  await passed(prefix + ": zero browser/runtime/network errors");
  await context.tracing.stop({ path: output + "/" + prefix + "-trace.zip" });
  record.status = "passed"; record.finishedAt = new Date().toISOString();
  await context.close(); context = null; page = null;
}
try {
  metadata.sha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  if (process.env.CI) assert.ok(metadata.expectedSha, "CI requires exact PR head SHA");
  if (metadata.expectedSha) assert.equal(metadata.sha, metadata.expectedSha, "Checkout must equal PR head");
  metadata.branch ||= execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { encoding: "utf8" }).trim();
  metadata.servedIdentity = { sha: metadata.sha, branch: metadata.branch, run: metadata.run, attempt: metadata.attempt };
  // Generated only into the already-built local test output, never public/ or application source.
  await writeFile("dist-pages/__gui_provenance.json", JSON.stringify(metadata.servedIdentity) + "\n");
  await stage("browser-tool-import");
  const playwright = await import("@playwright/test");
  expect = playwright.expect;
  metadata.playwright = JSON.parse(await readFile(new URL("./node_modules/@playwright/test/package.json", import.meta.url), "utf8")).version;
  await stage("preview-startup");
  log = createWriteStream(output + "/preview.log");
  server = spawn(process.execPath, ["node_modules/vite/bin/vite.js", "preview", "--config", "vite.pages.config.ts", "--host", "127.0.0.1", "--port", "4183", "--strictPort"], { stdio: ["ignore", "pipe", "pipe"] });
  server.stdout.pipe(log); server.stderr.pipe(log);
  let startupOutput = "";
  server.stdout.on("data", (chunk) => {
    startupOutput = (startupOutput + chunk.toString()).slice(-4096);
    if (stripVTControlCharacters(startupOutput).includes(base)) serverReady = true;
  });
  server.on("error", (error) => { metadata.serverError = String(error); });
  await expect.poll(async () => {
    assert.equal(server.exitCode, null, "Preview exited before readiness; inspect preview.log");
    assert.equal(server.signalCode, null, "Preview terminated before readiness");
    assert.equal(metadata.serverError, undefined);
    if (!serverReady) return 0; // Only this child can supply the ready signal.
    try { return (await fetch(base)).status; } catch { return 0; }
  }, { timeout: 30000 }).toBe(200);
  assertOwnedServer();
  await stage("browser-launch");
  const scenarios = [
    { id: "chromium-desktop-1365px", engine: "chromium", width: 1365, height: 1000, isMobile: false, hasTouch: false, deviceScaleFactor: 1 },
    { id: "chromium-narrow-390px", engine: "chromium", width: 390, height: 1000, isMobile: false, hasTouch: false, deviceScaleFactor: 1 },
    { id: "chromium-mobile-390px", engine: "chromium", width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 3 },
    { id: "chromium-mobile-375px", engine: "chromium", width: 375, height: 667, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
    { id: "webkit-mobile-390px", engine: "webkit", width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 3 },
    { id: "webkit-mobile-375px", engine: "webkit", width: 375, height: 667, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  ];
  for (const scenario of scenarios) {
    await stage(scenario.id + "-launch");
    browser = await playwright[scenario.engine].launch();
    await exercise(scenario);
    await browser.close(); browser = null;
  }
  assertOwnedServer();
  metadata.status = "passed"; metadata.stage = "complete";
} catch (error) {
  metadata.status = "failed";
  if (activeScenarioRecord?.status === "running") {
    activeScenarioRecord.status = "failed";
    activeScenarioRecord.finishedAt = new Date().toISOString();
    activeScenarioRecord.failureStage = metadata.stage;
  }
  metadata.failure = { message: String(error.message || error), stack: String(error.stack || error), stage: metadata.stage,
    classification: metadata.stage.includes(":") ? "test-or-application: requires diagnosis" : "environment-or-configuration: requires diagnosis" };
  metadata.errors = browserErrors;
  if (page) await page.screenshot({ path: output + "/failure.png", fullPage: true }).catch((cause) => { metadata.screenshotError = String(cause); });
  process.exitCode = 1;
  console.error(error);
} finally {
  if (context) await context.tracing.stop({ path: output + "/failure-trace.zip" }).catch((error) => { metadata.traceError = String(error); });
  if (browser) await browser.close().catch((error) => { metadata.closeError = String(error); });
  if (server && server.exitCode === null) {
    const exited = once(server, "exit"); server.kill("SIGTERM");
    await Promise.race([exited, new Promise((resolve) => { const timer = setTimeout(resolve, 3000); timer.unref(); })]);
    if (server.exitCode === null) server.kill("SIGKILL");
  }
  if (log) log.end();
  metadata.finishedAt = new Date().toISOString();
  await persist();
}
