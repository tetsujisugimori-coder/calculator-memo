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
async function assertHorizontalFit(expectedWidth = currentScenario.width) {
  const dimensions = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth }));
  assert.equal(dimensions.viewport, expectedWidth, "CSS viewport must remain configured width");
  assert.ok(dimensions.document <= dimensions.viewport + 1 && dimensions.body <= dimensions.viewport + 1, JSON.stringify(dimensions));
  for (const modal of await page.getByRole("dialog").all()) {
    if (!(await modal.isVisible())) continue;
    const bounds = await modal.boundingBox();
    assert.ok(bounds && bounds.x >= -1 && bounds.x + bounds.width <= expectedWidth + 1, "Dialog must fit horizontal viewport");
    const content = modal.locator(".modal-content");
    for (const scrollArea of await content.all()) {
      const size = await scrollArea.evaluate((element) => ({ scroll: element.scrollWidth, client: element.clientWidth }));
      assert.ok(size.scroll <= size.client + 1, "Synthetic modal content must not be horizontally clipped: " + JSON.stringify(size));
    }
  }
}
async function exerciseFormulaLibrary(prefix) {
  await stage(prefix + ": formula-library-crud");
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem("calculation-memo:data")));
  const open = () => activate(page.getByRole("button", { name: "登録式ライブラリ", exact: true }));
  const dialog = () => page.getByRole("dialog", { name: "登録式ライブラリ", exact: true });
  await open();
  await activate(dialog().getByRole("button", { name: "計算式を登録", exact: true }));
  await dialog().getByLabel("登録名", { exact: true }).fill("Synthetic formula");
  await dialog().getByLabel("登録する計算式", { exact: true }).fill("price * quantity");
  await activate(dialog().getByRole("button", { name: "閉じる", exact: true }));
  await expect(dialog().getByRole("alert")).toContainText("編集中");
  await expect(dialog().getByLabel("登録する計算式", { exact: true })).toHaveValue("price * quantity");
  await activate(dialog().getByRole("button", { name: "登録する", exact: true }));
  await expect(dialog().getByRole("region", { name: "選択した登録式" })).toContainText("price、quantity");
  await expect(dialog()).toContainText("計算結果：未計算");
  const original = await page.evaluate(() => JSON.parse(localStorage.getItem("calculation-memo:data")).formulaLibrary.entries[0]);
  await activate(dialog().getByRole("button", { name: "登録式を編集", exact: true }));
  await dialog().getByLabel("登録する計算式", { exact: true }).fill("x=2");
  await activate(dialog().getByRole("button", { name: "登録する", exact: true }));
  await expect(dialog().getByRole("alert")).toBeVisible();
  await activate(dialog().getByRole("button", { name: "編集をキャンセル", exact: true }));
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem("calculation-memo:data")).formulaLibrary.entries[0]), original);
  await activate(dialog().getByRole("button", { name: "登録式を編集", exact: true }));
  await dialog().getByLabel("登録名", { exact: true }).fill("Synthetic renamed formula");
  await dialog().getByLabel("登録する計算式", { exact: true }).fill("price * quantity + tax");
  await activate(dialog().getByRole("button", { name: "登録する", exact: true }));
  await expect(dialog()).toContainText("price、quantity、tax");
  await expect(dialog().getByRole("button", { name: "Synthetic formula", exact: true })).toHaveCount(0);
  await expect(dialog().locator("h3.identity-registered")).toContainText("Synthetic renamed formula");
  await activate(dialog().getByRole("button", { name: "計算式を登録", exact: true }));
  await dialog().getByLabel("登録名", { exact: true }).fill("長い登録名".repeat(20));
  await dialog().getByLabel("登録する計算式", { exact: true }).fill("variable_with_a_very_long_name_123456789 * quantity");
  await activate(dialog().getByRole("button", { name: "登録する", exact: true }));
  await assertHorizontalFit();
  await screenshot(prefix + "-formula-library");
  await dialog().locator(".modal-content").evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await expect(dialog().getByRole("button", { name: "登録式を編集", exact: true })).toBeInViewport();
  await expect(dialog().getByRole("button", { name: "登録式を削除", exact: true })).toBeInViewport();
  await assertHorizontalFit();
  await screenshot(prefix + "-formula-library-controls", currentScenario.width, false, true);
  await activate(dialog().getByRole("button", { name: "Synthetic renamed formula", exact: true }));
  await activate(dialog().getByRole("button", { name: "登録式を削除", exact: true }));
  await activate(page.getByRole("dialog", { name: "登録式を削除しますか？", exact: true }).getByRole("button", { name: "キャンセル", exact: true }));
  await expect(dialog()).toContainText("price * quantity + tax");
  await activate(dialog().getByRole("button", { name: "登録式を削除", exact: true }));
  await activate(page.getByRole("dialog", { name: "登録式を削除しますか？", exact: true }).getByRole("button", { name: "削除する", exact: true }));
  await expect(dialog().getByRole("button", { name: "Synthetic renamed formula", exact: true })).toHaveCount(0);
  await activate(dialog().getByRole("button", { name: "直前の削除を取り消す", exact: true }));
  await expect(dialog()).toContainText("price * quantity + tax");
  await activate(dialog().getByRole("button", { name: "閉じる", exact: true }));
  await page.reload();
  await open();
  await expect(dialog()).toContainText("price * quantity + tax");
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem("calculation-memo:data")));
  assert.deepEqual(after.notes, before.notes); assert.deepEqual(after.history, before.history);
  assert.equal(after.formulaLibrary.entries.length, 2);
  assert.equal(after.formulaLibrary.selectedId, original.id);
  await assertHorizontalFit();
  await activate(dialog().getByRole("button", { name: "閉じる", exact: true }));
  for (const mode of ["dark", "light"]) {
    await page.getByRole("combobox", { name: "テーマ", exact: true }).selectOption(mode);
    await expect(page.locator("html")).toHaveAttribute("data-theme", mode);
    await open();
    await activate(dialog().getByRole("button", { name: "長い登録名".repeat(20), exact: true }));
    await dialog().locator(".formula-library-detail").evaluate((element) => {
      const elements = [element, ...element.querySelectorAll("*")];
      const sizes = elements.map((child) => parseFloat(getComputedStyle(child).fontSize) * 2);
      elements.forEach((child, index) => { child.style.fontSize = sizes[index] + "px"; });
    });
    await assertHorizontalFit();
    await dialog().locator(".modal-content").evaluate((element) => { element.scrollTop = element.scrollHeight; });
    await expect(dialog().getByRole("button", { name: "登録式を編集", exact: true })).toBeInViewport();
    await screenshot(prefix + "-formula-library-" + mode + "-text-stress", currentScenario.width, false, true);
    await activate(dialog().getByRole("button", { name: "閉じる", exact: true }));
  }
  await passed(prefix + ": formula registration, syntax rejection, cancel, selection, edit, delete/undo, reload and unchanged notes/history");
}
async function exerciseIdentification(prefix) {
  await stage(prefix + ": identification-modes-and-native-input");
  const shell = page.locator("main.app-shell");
  const settings = page.getByRole("combobox", { name: "識別表示", exact: true });
  const open = () => activate(page.getByRole("button", { name: "登録式ライブラリ", exact: true }));
  const dialog = () => page.getByRole("dialog", { name: "登録式ライブラリ", exact: true });
  await expect(shell).toHaveAttribute("data-identification", "auto");
  const before = await page.evaluate(() => JSON.parse(localStorage.getItem("calculation-memo:data")));
  assert.equal(before.settings.identificationMode, undefined);
  await open();
  const labelPosition = () => dialog().locator(".identity-label").first().evaluate((el) => getComputedStyle(el).position);
  assert.equal(await labelPosition(), currentScenario.width <= 720 ? "absolute" : "static");
  await page.setViewportSize({width: currentScenario.width <= 720 ? 1000 : 375, height: currentScenario.height});
  assert.equal(await labelPosition(), currentScenario.width <= 720 ? "static" : "absolute");
  await page.setViewportSize({width: currentScenario.width, height: currentScenario.height});
  await activate(dialog().getByRole("button", { name: "登録式を編集", exact: true }));
  const input = dialog().getByLabel("登録する計算式", {exact:true});
  await input.fill("price * quantity + 12 + pi");
  await expect(dialog().locator(".variable-identification")).toContainText("price、quantity");
  await input.press("Home"); await input.press("ArrowRight");
  assert.equal(await input.evaluate((el) => el.selectionStart), 1);
  await input.fill("price +");
  await expect(dialog().locator(".variable-identification")).toContainText("識別保留");
  await expect(dialog().locator(".variable-identification .identity-variable")).toHaveCount(0);
  await input.fill("unregistered + 2");
  await expect(dialog().locator(".variable-identification")).toContainText("unregistered");
  // It is a syntactic variable, never a registered-formula call.
  await expect(dialog().locator(".variable-identification .identity-registered")).toHaveCount(0);
  await activate(dialog().getByRole("button", { name: "編集をキャンセル", exact: true }));
  await activate(dialog().getByRole("button", { name: "閉じる", exact: true }));
  for (const mode of ["labels", "color", "none"]) {
    await activate(settings); await settings.selectOption(mode);
    await expect(shell).toHaveAttribute("data-identification", mode);
    await page.setViewportSize({width: currentScenario.width <= 720 ? 1000 : 375, height: currentScenario.height});
    await expect(shell).toHaveAttribute("data-identification", mode);
    await page.setViewportSize({width: currentScenario.width, height: currentScenario.height});
    await page.reload(); await expect(shell).toHaveAttribute("data-identification", mode);
    const variableColor = await page.locator(".calculation-variable").first().evaluate((el) => getComputedStyle(el).backgroundColor);
    assert.equal(variableColor === "rgba(0, 0, 0, 0)", mode === "none");
    for (const theme of ["light", "dark"]) {
      await page.getByRole("combobox", {name:"テーマ",exact:true}).selectOption(theme);
      await open();
      assert.equal(await labelPosition(), mode === "labels" ? "static" : "absolute");
      const color = await dialog().locator(".identity-registered").first().evaluate((el) => getComputedStyle(el).backgroundColor);
      assert.equal(color === "rgba(0, 0, 0, 0)", mode === "none");
      await assertHorizontalFit();
      await screenshot(prefix + "-identification-" + mode + "-" + theme);
      await activate(dialog().getByRole("button", {name:"閉じる",exact:true}));
    }
  }
  const expressionBefore = await page.locator(".lcd-expression").textContent();
  const resultBefore = await page.locator(".lcd-result").textContent();
  const info = page.getByRole("button", {name:"識別表示の説明",exact:true});
  await activate(info);
  const help = page.getByRole("dialog", {name:"変数・登録式の識別表示",exact:true});
  await expect(help).toContainText("登録名を式に書いても呼び出せません");
  await page.keyboard.type("123"); await page.keyboard.press("Backspace");
  assert.equal(await page.locator(".lcd-expression").textContent(), expressionBefore);
  assert.equal(await page.locator(".lcd-result").textContent(), resultBefore);
  await page.keyboard.press("Escape"); await expect(help).toHaveCount(0); await expect(info).toBeFocused();
  await activate(info); await page.keyboard.press("Enter"); await expect(help).toHaveCount(0);
  assert.equal(await page.locator(".lcd-result").textContent(), resultBefore);
  const after = await page.evaluate(() => JSON.parse(localStorage.getItem("calculation-memo:data")));
  assert.deepEqual(after.formulaLibrary,before.formulaLibrary); assert.deepEqual(after.notes,before.notes); assert.deepEqual(after.history,before.history);
  await passed(prefix + ": three display modes, responsive default/manual persistence, light/dark, safe input, syntax identification and help keyboard isolation");
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
    await exerciseStickyOffset(prefix);
  }
  await passed(prefix + ": header text/targets contained, guide open/category/scroll/close, theme change, sticky reopen");
}
async function exerciseStickyOffset(prefix) {
  // Text-size stress on the real app, not a claim about native browser text zoom.
  // Give the sticky element enough parent scroll range without changing app data.
  const fixture = await page.addStyleTag({ content: ".workspace { min-height: 2000px; }" });
  activeScenarioRecord.stickyGeometry = [];
  try {
    for (const width of [721, 800, 1365]) {
      await page.setViewportSize({ width, height: 667 });
      for (const scale of [2, 1]) {
        await page.locator(".topbar").evaluate((header, factor) => {
          const elements = [...header.querySelectorAll("*")];
          // Capture all original sizes before setting any parent styles.
          const sizes = elements.map((element) => {
            element.style.removeProperty("font-size");
            return element;
          }).map((element) => parseFloat(getComputedStyle(element).fontSize) * factor);
          elements.forEach((element, index) => { element.style.fontSize = sizes[index] + "px"; });
        }, scale);
        await page.evaluate(() => scrollTo({ top: 250, behavior: "instant" }));
        const measure = () => page.evaluate(() => {
          const header = document.querySelector(".topbar").getBoundingClientRect();
          const calculator = document.querySelector(".calculator-column").getBoundingClientRect();
          return { width: innerWidth, scrollY, headerBottom: header.bottom, calculatorTop: calculator.top, gap: calculator.top - header.bottom };
        });
        await expect.poll(async () => Math.abs((await measure()).gap - 28), { message: "Sticky gap must track both header growth and shrink" }).toBeLessThanOrEqual(1);
        const geometry = await measure();
        assert.equal(geometry.scrollY, 250, "Stress fixture must actually scroll");
        activeScenarioRecord.stickyGeometry.push({ scale, ...geometry });
        if (width === 721) await screenshot(prefix + "-sticky-721px-text-" + scale * 100 + "pct", width, false);
        await page.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
        assert.ok((await measure()).gap >= 27, "Calculator must also clear header before scrolling");
      }
    }
  } finally {
    await page.locator(".topbar *").evaluateAll((elements) => elements.forEach((element) => element.style.removeProperty("font-size")));
    await fixture.evaluate((element) => element.remove());
    await page.setViewportSize({ width: currentScenario.width, height: currentScenario.height });
    await page.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
  }
  await passed(prefix + ": real-app sticky offset follows header growth/shrink at 721/800/1365px and 200/100% text sizes");
}
async function stage(name) { metadata.stage = name; await persist(); }
async function passed(name) { metadata.checks.push(name); console.log("PASS:", name); await persist(); }
async function screenshot(name, expectedWidth = currentScenario.width, fullPage = true, overlayTop = false) {
  await assertHorizontalFit(expectedWidth);
  // Test-only visual label, removed immediately after capture; not an app feature.
  await page.evaluate(({ identity, overlayTop }) => {
    const banner = document.createElement("div");
    banner.id = "gui-test-overlay";
    banner.textContent = "TEST OVERLAY | " + identity;
    banner.style.cssText = "position:fixed;bottom:0;left:0;right:0;z-index:99999;background:#101820;color:#fff;font:11px monospace;padding:8px;overflow-wrap:anywhere;pointer-events:none";
    if (overlayTop) { banner.style.bottom = "auto"; banner.style.top = "0"; }
    document.body.append(banner);
  }, { overlayTop, identity: currentScenario.id + " | capture " + expectedWidth + "px | " + metadata.branch + " | SHA " + metadata.sha + " | run " + metadata.run + "/" + metadata.attempt });
  try { await page.screenshot({ path: output + "/" + name + ".png", fullPage }); }
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
// Run after the existing regressions so their fixed history/memo counts remain unchanged.
async function exerciseBasicMath(prefix) {
  const input = page.getByRole("textbox", { name: "計算式を入力", exact: true });
  const result = page.locator(".lcd-result");
  const dialog = page.getByRole("dialog");
  const near = (actual, expected, label) => assert.ok(
    typeof actual === "number" && Number.isFinite(actual) && Math.abs(actual - expected) <= 4 * Number.EPSILON * Math.max(1, Math.abs(expected)),
    `${label}: expected internal numeric value ${expected}, received ${actual}`,
  );
  async function calculate(expression, text, value) {
    const before = (await storage()).history;
    await input.fill(expression);
    await expect(button("単独計算メモを作成")).toBeDisabled();
    assert.deepEqual((await storage()).history, before, "Typing does not create history");
    await activate(button("計算する"));
    await expect(result).toHaveText(text);
    await expect.poll(async () => (await storage()).history[0]).toMatchObject({ expression, resultText: text });
    near((await storage()).history[0].result, value, expression);
    await expect(button("単独計算メモを作成")).toBeEnabled();
  }
  await stage(prefix + ": basic-math-expression-input-and-history");
  await activate(page.locator("details.expression-entry > summary"));
  await expect(input).toBeVisible();
  for (const [expression, text, value] of [
    ["2^3^2", "512", 512], ["-2^2", "-4", -4], ["(-2)^2", "4", 4],
    ["sqrt(2)", "1.414213562373", Math.sqrt(2)],
    ["2*pi", "6.28318530718", 2 * Math.PI],
    ["e", "2.718281828459", Math.E],
    ["sqrt(81)+abs(-7)+2^3+pi-pi+e-e", "24", 24],
  ]) await calculate(expression, text, value);
  await selectPanel("history");
  await expect(page.locator(".history-item").first()).toContainText("= 24");
  const historyBeforeRestore = (await storage()).history;
  await activate(page.locator(".history-item").first().getByRole("button", { name: "戻す", exact: true }));
  await expect(input).toHaveValue("sqrt(81)+abs(-7)+2^3+pi-pi+e-e");
  await expect(button("単独計算メモを作成")).toBeDisabled();
  assert.deepEqual((await storage()).history, historyBeforeRestore);
  await activate(button("計算する"));
  await expect(result).toHaveText("24");
  await screenshot(prefix + "-basic-math-history");
  // '^' outside the expression textbox must chain from the confirmed result.
  await activate(button("すべて消去"));
  await page.keyboard.type("2+1=");
  await expect(result).toHaveText("3");
  await page.keyboard.type("^");
  await expect(input).toHaveValue("3^");
  await expect(button("単独計算メモを作成")).toBeDisabled();
  await page.keyboard.type("2=");
  await expect(result).toHaveText("9");
  await expect.poll(async () => (await storage()).history[0]).toMatchObject({ expression: "3^2", result: 9 });
  await passed(prefix + ": power precedence, sqrt/abs/pi/e, full-precision history, editable restore and power continuation");

  await stage(prefix + ": basic-math-errors-and-recovery");
  for (const invalid of ["sin(0)", "sqrt(-1)", "sqrt(1,2)", "pi(2)", "2^53", "sqrt(100)%"]) {
    const before = await storage();
    await input.fill(invalid);
    await activate(button("計算する"));
    await expect(result).toHaveText("Error");
    await expect(button("単独計算メモを作成")).toBeDisabled();
    assert.deepEqual((await storage()).history, before.history);
    assert.deepEqual((await storage()).notes, before.notes);
    if (invalid === "sqrt(-1)") await screenshot(prefix + "-basic-math-domain-error");
    await calculate("sqrt(16)+abs(-2)", "6", 6);
  }
  await passed(prefix + ": disallowed function/arity/constant-call, negative sqrt, unsafe magnitude and unsupported math-percent mixing reject without stored side effects; corrected input recovers");

  await stage(prefix + ": basic-math-single-memo-edit");
  await calculate("sqrt(2)", "1.414213562373", Math.sqrt(2));
  await activate(button("単独計算メモを作成"));
  await dialog.getByLabel("タイトル", { exact: false }).fill("Synthetic math single");
  await activate(dialog.getByRole("button", { name: "保存する", exact: true }));
  await selectPanel("notes");
  const single = page.locator(".note-card").filter({ hasText: "Synthetic math single" });
  await expect(single.locator(".note-formula strong")).toHaveText("= 1.414213562373");
  near((await storage()).notes.find((note) => note.title === "Synthetic math single").result, Math.sqrt(2), "saved sqrt memo");
  await activate(single.getByRole("button", { name: "編集", exact: true }));
  await dialog.getByLabel("計算式", { exact: true }).fill("2*pi");
  await activate(dialog.getByRole("button", { name: "保存する", exact: true }));
  await expect(single.locator(".note-formula strong")).toHaveText("= 6.28318530718");
  await expect.poll(async () => (await storage()).notes.find((note) => note.title === "Synthetic math single")).toMatchObject({ expression: "2*pi", resultText: "6.28318530718" });
  near((await storage()).notes.find((note) => note.title === "Synthetic math single").result, 2 * Math.PI, "edited pi memo");

  await stage(prefix + ": basic-math-block-save-and-recalculate");
  await activate(page.locator("#notes-panel").getByRole("button", { name: "＋ 新規作成", exact: true }));
  await activate(dialog.getByRole("button").filter({ hasText: "BLOCKS / MARKDOWN" }));
  await dialog.getByLabel("タイトル", { exact: false }).fill("Synthetic math blocks");
  await activate(dialog.getByRole("button", { name: "＋ 計算", exact: true }));
  await dialog.getByLabel("計算式", { exact: true }).fill("sqrt(2)");
  await expect(dialog.locator(".calculation-live-result strong")).toContainText("= 1.414213562373");
  await screenshot(prefix + "-basic-math-block-editor");
  await activate(dialog.getByRole("button", { name: "保存する", exact: true }));
  const block = page.locator(".note-card").filter({ hasText: "Synthetic math blocks" });
  await expect(block.locator(".calculation-block strong")).toHaveText("= 1.414213562373");
  near((await storage()).notes.find((note) => note.title === "Synthetic math blocks").blocks[0].result, Math.sqrt(2), "saved sqrt block");
  await activate(block.getByRole("button", { name: "編集", exact: true }));
  await dialog.getByLabel("計算式", { exact: true }).fill("abs(-3)^2+sqrt(16)");
  await expect(dialog.locator(".calculation-live-result strong")).toContainText("= 13");
  await activate(dialog.getByRole("button", { name: "保存する", exact: true }));
  await expect(block.locator(".calculation-block strong")).toHaveText("= 13");
  await expect.poll(async () => (await storage()).notes.find((note) => note.title === "Synthetic math blocks").blocks[0]).toMatchObject({ expression: "abs(-3)^2+sqrt(16)", result: 13, resultText: "13", error: null });
  await passed(prefix + ": single memo retains internal precision and recalculates on edit; math block live preview/save/edit recalculates");

  await stage(prefix + ": basic-math-url-and-reload");
  const beforeUrl = await storage();
  const imported = "sqrt(81)+abs(-7)+2^3+pi-pi+e-e";
  await page.goto(base + "?expr=" + encodeURIComponent(imported));
  await activate(page.locator("details.expression-entry > summary"));
  await expect(input).toHaveValue(imported);
  await expect(button("単独計算メモを作成")).toBeDisabled();
  assert.deepEqual((await storage()).history, beforeUrl.history);
  assert.deepEqual((await storage()).notes, beforeUrl.notes);
  await activate(button("計算する"));
  await expect(result).toHaveText("24");
  await expect.poll(async () => (await storage()).history[0]).toMatchObject({ expression: imported, result: 24, resultText: "24" });
  const beforeReload = await storage();
  await page.reload();
  await activate(page.locator("details.expression-entry > summary"));
  await expect(input).toHaveValue(imported);
  await expect(button("単独計算メモを作成")).toBeDisabled();
  assert.deepEqual((await storage()).history, beforeReload.history);
  assert.deepEqual((await storage()).notes, beforeReload.notes);
  await selectPanel("notes");
  await expect(single.locator(".note-formula strong")).toHaveText("= 6.28318530718");
  await expect(block.locator(".calculation-block strong")).toHaveText("= 13");
  await screenshot(prefix + "-basic-math-persisted-memos");
  await selectPanel("history");
  await expect(page.locator(".history-item").first()).toContainText("= 24");
  await screenshot(prefix + "-basic-math-url-history");
  await passed(prefix + ": URL math remains editable until equals, and exact history/memo payloads plus rendered results survive reload");
}
async function exerciseFormulaExecution(prefix) {
  await stage(prefix + ": formula-execution-inputs-and-snapshots");
  // Synthetic fixture, after all existing regressions. Expected arithmetic uses
  // independent JavaScript arithmetic/Math, never the application's evaluator.
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem("calculation-memo:data"));
    const at = "2026-01-01T00:00:00.000Z";
    data.formulaLibrary = { version: 1, selectedId: "exec-product", entries: [
      ["exec-product", "price", "price * quantity"],
      ["exec-division", "Synthetic division", "amount / divisor"],
      ["exec-root", "Synthetic root", "sqrt(value)"],
      ["exec-power", "Synthetic power", "base ^ exponent"],
      ["exec-constant", "Synthetic constant", "2^8 + abs(-15)"],
    ].map(([id, title, expression]) => ({id, title, expression, createdAt: at, updatedAt: at})) };
    data.formulaExecutions = [];
    data.settings.identificationMode = "labels";
    data.notes.push({id:"exec-scope", type:"plain-calculation", title:"Synthetic execution scope", content:"", createdAt:at, updatedAt:at, blocks:[
      {id:"exec-p",type:"calculation",expression:"price = 1200",evaluationMode:"note-variables",displayExpression:"price = 1200",result:1200,resultText:"1,200",error:null},
      {id:"exec-q",type:"calculation",expression:"quantity = 9",evaluationMode:"note-variables",displayExpression:"quantity = 9",result:9,resultText:"9",error:null},
    ]});
    localStorage.setItem("calculation-memo:data", JSON.stringify(data));
  });
  await page.reload();
  const library = () => page.getByRole("dialog", {name:"登録式ライブラリ",exact:true});
  const execution = () => page.getByRole("dialog", {name:"登録式の実行",exact:true});
  const result = () => execution().getByRole("region", {name:"確定した計算結果",exact:true});
  const input = (name) => execution().getByRole("textbox", {name:`変数 ${name} の値`,exact:true});
  const closeExecution = () => activate(execution().getByRole("button", {name:"閉じる",exact:true}));
  const run = () => activate(execution().getByRole("button", {name:"計算する",exact:true}));
  async function open(name) {
    if (!(await library().count())) await activate(page.getByRole("button", {name:"登録式ライブラリ",exact:true}));
    await activate(library().getByRole("button", {name,exact:true}));
    await activate(library().getByRole("button", {name:"登録式を実行",exact:true}));
  }
  await open("price");
  const definition = (await storage()).formulaLibrary.entries[0];
  await expect(execution().getByRole("textbox")).toHaveCount(2);
  await expect(input("price")).toHaveValue("");
  await run(); await expect(execution().getByRole("alert")).toContainText("未入力");
  await input("price").fill("12oops"); await input("quantity").fill("5");
  await run(); await expect(execution().getByRole("alert")).toContainText("数値を入力");
  await input("price").fill("");
  await execution().getByLabel("初期値の取得元ノート", {exact:true}).selectOption("exec-scope");
  await activate(execution().getByRole("button", {name:"ノートの変数を取り込む",exact:true}));
  await expect(input("price")).toHaveValue("1200"); await expect(input("quantity")).toHaveValue("5");
  await run(); await expect(result().locator("strong")).toHaveText("6,000");
  await expect(result()).toContainText("price * quantity");
  await input("quantity").fill("6"); await expect(result()).toHaveCount(0);
  await run(); await expect(result().locator("strong")).toHaveText("7,200");
  await activate(execution().getByRole("button", {name:"履歴に追加",exact:true}));
  await expect.poll(async () => (await storage()).history[0].result).toBe(1200 * 6);
  const snapshot = (await storage()).history[0];
  assert.deepEqual(snapshot.formulaExecution, {formulaId:"exec-product",title:"price",expression:"price * quantity",inputs:{price:"1200",quantity:"6"}});
  assert.deepEqual((await storage()).formulaLibrary.entries[0], definition);
  await activate(execution().getByRole("button", {name:"単独計算メモを作成",exact:true}));
  const memo = page.getByRole("dialog", {name:"単独計算メモを編集",exact:true});
  await expect(memo).toBeVisible();
  await activate(memo.getByRole("button", {name:"保存する",exact:true}));
  await expect.poll(async () => (await storage()).notes.some((note) => note.type === "calculation" && note.result === 7200 && note.note.includes("exec-product"))).toBe(true);
  await screenshot(prefix + "-execution-confirmed");
  await closeExecution(); await activate(library().getByRole("button", {name:"閉じる",exact:true}));
  await selectPanel("history");
  await activate(page.locator(".history-item").first().getByRole("button", {name:"戻す",exact:true}));
  await activate(page.locator(".calculator-shell").getByRole("button", {name:"計算する",exact:true})); await expect(page.locator(".lcd-result")).toHaveText("7,200");
  await passed(prefix + ": execution AST inputs, explicit note scope, snapshot invalidation, definition isolation and safe history/memo transfer");

  await stage(prefix + ": formula-execution-errors-and-reload");
  await open("Synthetic division");
  await input("amount").fill("12"); await input("divisor").fill("0");
  await run(); await expect(execution().getByRole("alert")).toContainText("0では割れません");
  await input("divisor").fill("3"); await run(); await expect(result().locator("strong")).toHaveText("4");
  await input("amount").fill("9007199254740992"); await run();
  await expect(execution().getByRole("alert")).toContainText("桁数");
  await input("amount").fill("-"); await page.reload(); await open("Synthetic division");
  await expect(input("amount")).toHaveValue("-"); await expect(input("divisor")).toHaveValue("3");
  await expect(result()).toHaveCount(0); await expect(execution()).toContainText("未確定");
  await input("amount").fill("15"); await run(); await expect(result().locator("strong")).toHaveText("5");
  await closeExecution(); await open("Synthetic root"); await input("value").fill("-1");
  await run(); await expect(execution().getByRole("alert")).toBeVisible();
  await expect(result()).toHaveCount(0); await input("value").fill("144");
  await run(); await expect(result().locator("strong")).toHaveText(String(Math.sqrt(144)));
  await closeExecution(); await open("Synthetic power");
  await input("base").fill("10"); await input("exponent").fill("400"); await run();
  await expect(execution().getByRole("alert")).toBeVisible(); await expect(result()).toHaveCount(0);
  await input("base").fill("2"); await input("exponent").fill("8"); await run();
  await expect(result().locator("strong")).toHaveText(String(2 ** 8));
  await closeExecution(); await open("Synthetic constant");
  await expect(execution().getByRole("textbox")).toHaveCount(0); await run();
  await expect(result().locator("strong")).toHaveText(String(2 ** 8 + Math.abs(-15)));
  await closeExecution();
  await passed(prefix + ": missing/invalid/range/zero-division/non-real/non-finite errors recover; unfinished drafts restore without stale result");

  await stage(prefix + ": formula-execution-definition-lifecycle");
  await activate(library().getByRole("button", {name:"price",exact:true}));
  await activate(library().getByRole("button", {name:"登録式を編集",exact:true}));
  await library().getByLabel("登録名", {exact:true}).fill("Synthetic renamed execution");
  await library().getByLabel("登録する計算式", {exact:true}).fill("price * quantity + 1");
  await activate(library().getByRole("button", {name:"登録する",exact:true}));
  await open("Synthetic renamed execution");
  await expect(execution()).toContainText("保存時から式の定義が変わっています");
  await expect(result()).toHaveCount(0); await run(); await expect(result().locator("strong")).toHaveText("7,201");
  assert.deepEqual((await storage()).history.find((entry) => entry.id === snapshot.id), snapshot);
  await closeExecution();
  await activate(library().getByRole("button", {name:"登録式を削除",exact:true}));
  await activate(page.getByRole("dialog", {name:"登録式を削除しますか？",exact:true}).getByRole("button", {name:"削除する",exact:true}));
  await expect(library().getByRole("button", {name:"Synthetic renamed execution",exact:true})).toHaveCount(0);
  assert.deepEqual((await storage()).history.find((entry) => entry.id === snapshot.id), snapshot);
  await passed(prefix + ": renamed/changed definition requires fresh result and deletion leaves completed history immutable");

  await stage(prefix + ": formula-execution-help-and-layout");
  await activate(library().getByRole("button", {name:"閉じる",exact:true}));
  for (const theme of ["light", "dark"]) {
    await page.getByRole("combobox", {name:"テーマ",exact:true}).selectOption(theme);
    await open("Synthetic division");
    await input("amount").fill("15"); await input("divisor").fill("3"); await run();
    await activate(execution().getByRole("button", {name:"登録式の実行の説明",exact:true}));
    const help = page.getByRole("dialog", {name:"登録式の実行について",exact:true});
    await expect(help).toBeVisible(); await page.keyboard.press("Escape"); await expect(help).toHaveCount(0);
    await expect(execution()).toBeVisible(); await expect(input("amount")).toHaveValue("15");
    await execution().locator(".execution-heading, .execution-heading *, .execution-inputs label, .execution-inputs label *, .execution-confirmed, .execution-confirmed *").evaluateAll((elements) => {
      const sizes = elements.map((element) => parseFloat(getComputedStyle(element).fontSize) * 2);
      elements.forEach((element, index) => { element.style.fontSize = sizes[index] + "px"; });
    });
    await assertHorizontalFit(); await input("amount").scrollIntoViewIfNeeded();
    await screenshot(prefix + "-execution-" + theme + "-inputs");
    await result().scrollIntoViewIfNeeded(); await assertHorizontalFit();
    await screenshot(prefix + "-execution-" + theme + "-result");
    const memoButton = execution().getByRole("button", {name:"単独計算メモを作成",exact:true});
    await memoButton.scrollIntoViewIfNeeded(); await expect(memoButton).toBeInViewport();
    await assertHorizontalFit();
    await screenshot(prefix + "-execution-" + theme + "-controls", currentScenario.width, true, true);
    const historyCount = (await storage()).history.length;
    await activate(execution().getByRole("button", {name:"履歴に追加",exact:true}));
    await expect.poll(async () => (await storage()).history.length).toBe(historyCount + 1);
    const expandedTransfer = (await storage()).history[0];
    assert.equal(expandedTransfer.result, 15 / 3);
    assert.equal(expandedTransfer.resultText, "5");
    assert.deepEqual(expandedTransfer.formulaExecution, {formulaId:"exec-division",title:"Synthetic division",expression:"amount / divisor",inputs:{amount:"15",divisor:"3"}});
    await closeExecution(); await activate(library().getByRole("button", {name:"閉じる",exact:true}));
  }
  await passed(prefix + ": execution help preserves input; light/dark expanded text and touch controls fit each existing viewport");
}

async function exerciseVariables(prefix) {
  await stage(prefix + ": note-scoped-variables-order-and-editing");
  await selectPanel("notes");
  const dialog = page.getByRole("dialog");
  const title = "Synthetic scoped variables";
  async function createNote(name) {
    await activate(page.locator("#notes-panel").getByRole("button", { name: "＋ 新規作成", exact: true }));
    await activate(dialog.getByRole("button").filter({ hasText: "BLOCKS / MARKDOWN" }));
    await dialog.getByLabel("タイトル", { exact: false }).fill(name);
  }
  async function add(expression, expected) {
    await activate(dialog.getByRole("button", { name: "＋ 計算", exact: true }));
    const card = dialog.locator(".block-editor-card.calculation").last();
    await card.getByLabel("計算式", { exact: true }).fill(expression);
    if (expected !== null) await expect(card.locator(".calculation-live-result strong")).toHaveText("= " + expected);
    else await expect(card.locator(".calculation-live-result.has-error")).toBeVisible();
    return card;
  }
  await createNote(title);
  for (const [expression, expected] of [
    ["price = 1200", "1,200"], ["quantity = 5", "5"], ["subtotal = price * quantity", "6,000"],
    ["tax = 0.10", "0.1"], ["total = subtotal * (1 + tax)", "6,600"],
    ["x = 10", "10"], ["y = x * 2", "20"], ["x = 20", "20"],
  ]) await add(expression, expected);
  const cards = dialog.locator(".block-editor-card.calculation");
  await expect(cards.nth(6).locator(".calculation-live-result strong")).toHaveText("= 20");
  // Moving a dependency below its consumer must immediately invalidate/recover the consumer.
  await activate(cards.nth(1).getByRole("button", { name: "計算ブロックを下へ移動", exact: true }));
  await expect(cards.nth(1).locator(".calculation-live-result.has-error")).toBeVisible();
  await expect(cards.nth(4).locator(".calculation-live-result.has-error")).toBeVisible();
  await activate(cards.nth(2).getByRole("button", { name: "計算ブロックを上へ移動", exact: true }));
  await expect(cards.nth(2).locator(".calculation-live-result strong")).toHaveText("= 6,000");
  await expect(cards.nth(4).locator(".calculation-live-result strong")).toHaveText("= 6,600");
  await cards.nth(0).getByLabel("計算式", { exact: true }).fill("price = 100");
  await expect(cards.nth(2).locator(".calculation-live-result strong")).toHaveText("= 500");
  await cards.nth(0).getByLabel("計算式", { exact: true }).fill("price = 1200");
  await expect(cards.nth(4).locator(".calculation-live-result strong")).toHaveText("= 6,600");
  const extra = await add("missing + 1", null);
  await extra.getByLabel("計算式", { exact: true }).fill("x = sqrt(-1)");
  await expect(extra.locator(".calculation-live-result.has-error")).toBeVisible();
  await add("x", "20");
  await activate(dialog.locator(".block-editor-card.calculation").last().getByRole("button", { name: "計算ブロックを削除", exact: true }));
  await extra.getByLabel("計算式", { exact: true }).fill("pi = 3");
  await expect(extra.locator(".calculation-live-result.has-error")).toBeVisible();
  await activate(extra.getByRole("button", { name: "計算ブロックを削除", exact: true }));
  // Plain prose is never executed as a definition.
  await activate(dialog.getByRole("button", { name: "＋ 文章", exact: true }));
  await dialog.getByLabel("Markdown文章").fill("price = 9999 (plain text only)");
  await add("price", "1,200");
  await screenshot(prefix + "-variables-editor-light");
  await activate(dialog.getByRole("button", { name: "保存する", exact: true }));
  const saved = page.locator(".note-card").filter({ hasText: title });
  const readNote = async () => (await storage()).notes.find((note) => note.title === title);
  await expect.poll(async () => (await readNote()).blocks.filter((block) => block.type === "calculation").map((block) => block.result)).toEqual([1200, 5, 6000, 0.1, 6000 * (1 + 0.1), 10, 20, 20, 1200]);
  await expect(saved.locator(".calculation-variable").first()).toContainText("変数 price");
  await expect(saved.locator(".calculation-expression").nth(2)).toContainText("price * quantity");
  await passed(prefix + ": ordered definitions, reassignment snapshots, upstream edits/reorder/removal, errors and prose isolation");

  await stage(prefix + ": variable-scope-persistence-and-responsive-roles");
  await createNote("Synthetic isolated variables");
  await add("price", null);
  await activate(dialog.locator(".block-editor-card.calculation").first().getByRole("button", { name: "計算ブロックを削除", exact: true }));
  await add("price = 2", "2");
  await add("price * 5", "10");
  await activate(dialog.getByRole("button", { name: "保存する", exact: true }));
  const before = (await storage()).notes;
  await page.reload();
  await selectPanel("notes");
  assert.deepEqual((await storage()).notes, before, "Both variable scopes persist without changes");
  await expect(saved.locator(".calculation-block strong").nth(4)).toHaveText("= 6,600");
  const isolated = page.locator(".note-card").filter({ hasText: "Synthetic isolated variables" });
  await expect(isolated.locator(".calculation-block strong").nth(1)).toHaveText("= 10");
  // Check actual application light/dark styling and 200% text-size stress in the editor.
  const theme = page.getByRole("combobox", { name: "テーマ", exact: true });
  for (const mode of ["dark", "light"]) {
    await theme.selectOption(mode);
    await expect(page.locator("html")).toHaveAttribute("data-theme", mode);
    await activate(saved.getByRole("button", { name: "編集", exact: true }));
    await expect(dialog.locator(".calculation-variable").first()).toContainText("変数 price");
    const colors = await dialog.evaluate((element) => [".calculation-variable", ".calculation-expression", ".calculation-live-result"].map((selector) => getComputedStyle(element.querySelector(selector)).backgroundColor));
    assert.equal(new Set(colors).size, 3, "Variable, expression and result have distinct role backgrounds");
    await add("long_variable_name_for_wrapping = total + sqrt(144)", "6,612");
    await dialog.locator(".calculation-variable, .calculation-variable *, .calculation-expression, .calculation-expression *, .calculation-live-result, .calculation-live-result *").evaluateAll((elements) => {
      const sizes = elements.map((element) => parseFloat(getComputedStyle(element).fontSize) * 2);
      elements.forEach((element, index) => { element.style.fontSize = sizes[index] + "px"; });
    });
    await assertHorizontalFit();
    for (const role of await dialog.locator(".calculation-variable, .calculation-expression, .calculation-live-result").all()) {
      const size = await role.evaluate((element) => ({ scroll: element.scrollWidth, client: element.clientWidth }));
      assert.ok(size.scroll <= size.client + 1, "Calculation roles must wrap rather than clip horizontally: " + JSON.stringify(size));
    }
    await dialog.locator(".block-editor-card.calculation").last().locator(".calculation-variable").scrollIntoViewIfNeeded();
    await screenshot(prefix + "-variables-" + mode + "-text-stress");
    await dialog.locator(".block-editor-card.calculation").last().locator(".calculation-live-result").scrollIntoViewIfNeeded();
    await screenshot(prefix + "-variables-" + mode + "-result-stress");
    await activate(dialog.getByRole("button", { name: "キャンセル", exact: true }));
  }
  assert.deepEqual((await storage()).notes, before, "Cancelled styling probes do not alter notes");
  await passed(prefix + ": independent note scopes, reload values, labeled light/dark roles and narrow text wrapping");
  await stage(prefix + ": legacy-block-opt-in-compatibility");
  // A synthetic pre-variable saved block intentionally has no evaluationMode field.
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem("calculation-memo:data"));
    const note = data.notes.find((item) => item.title === "Synthetic isolated variables");
    note.blocks = [{ id: "legacy-variable-test", type: "calculation", expression: "2x3", displayExpression: "2×3", result: 6, resultText: "6", error: null }];
    localStorage.setItem("calculation-memo:data", JSON.stringify(data));
  });
  await page.reload();
  await selectPanel("notes");
  await expect(isolated.locator(".calculation-block strong")).toHaveText("= 6");
  await activate(isolated.getByRole("button", { name: "編集", exact: true }));
  await expect(dialog).toContainText("x/X は変数になり");
  await activate(dialog.getByRole("button", { name: "変数を使う", exact: true }));
  await expect(dialog.locator(".calculation-live-result.has-error")).toBeVisible();
  await dialog.getByLabel("計算式", { exact: true }).fill("2*3");
  await expect(dialog.locator(".calculation-live-result strong")).toHaveText("= 6");
  await activate(dialog.getByRole("button", { name: "保存する", exact: true }));
  await expect.poll(async () => (await storage()).notes.find((note) => note.title === "Synthetic isolated variables").blocks[0]).toMatchObject({ expression: "2*3", result: 6, evaluationMode: "note-variables" });
  await passed(prefix + ": old x multiplication preserved until explicit mode opt-in; corrected expression and mode saved");
}

async function exerciseStorageProtection(prefix) {
  await stage(prefix + ": nondestructive-storage-protection");
  const original = await storage();
  const good = { id: "safe", type: "plain-calculation", title: "Synthetic safe memo", content: "fallback", createdAt: "2026-10-19T00:00:00Z", updatedAt: "2026-10-19T00:00:00Z", blocks: [{ id: "t", type: "text", content: "Safe text" }] };
  const variants = [
    ["unknown", { ...good, id: "bad", blocks: [{ id: "future", type: "geometry", payload: { untouched: [1, 2, 3] } }] }],
    ["mixed", { ...good, id: "bad", blocks: [...good.blocks, { id: "future", type: "graph", points: [1, 2] }] }],
    ["duplicate", { ...good, id: "bad", blocks: [...good.blocks, ...good.blocks] }],
    ["malformed", { ...good, id: "bad", blocks: { source: "keep me" } }],
  ];
  const readRaw = () => page.evaluate(() => localStorage.getItem("calculation-memo:data"));
  for (const [name, bad] of variants) {
    const raw = JSON.stringify({ ...original, notes: [good, bad] }, null, 2);
    await page.evaluate((raw) => localStorage.setItem("calculation-memo:data", raw), raw);
    await page.reload();
    const banner = page.getByRole("alert");
    await expect(banner).toContainText("保存データを読み込めませんでした");
    await expect(page.locator("#calculator")).toHaveAttribute("inert", "");
    await expect(banner).toContainText("保存とメモの編集を停止");
    // Header setting changes and keyboard input used to reach save effects.
    await page.getByLabel("テーマ", { exact: true }).selectOption("dark");
    await page.keyboard.type("12+3");
    await page.keyboard.press("Enter");
    assert.equal(await readRaw(), raw, "Invalid sibling must protect entire original dataset");
    await page.evaluate(() => {
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async (text) => { window.__recoveryCopy = text; } } });
    });
    await activate(banner.getByRole("button", { name: "元データをコピー", exact: true }));
    assert.equal(await page.evaluate(() => window.__recoveryCopy), raw, "Recovery copy passes exact raw bytes (test clipboard sink, not OS clipboard)");
    await activate(banner.getByRole("button", { name: "保存データを初期化", exact: true }));
    await expect(page.getByRole("dialog")).toContainText("この操作は取り消せません");
    await activate(page.getByRole("dialog").getByRole("button", { name: "キャンセル", exact: true }));
    assert.equal(await readRaw(), raw, "Cancel reset cannot overwrite");
    if (name === "mixed") await screenshot(prefix + "-protected-mixed-blocks");
    await page.reload();
    await expect(banner).toBeVisible();
    assert.equal(await readRaw(), raw, "Reload cannot normalize/drop original blocks");
    await passed(prefix + ": " + name + " blocks protected across header/keyboard/reset-cancel/copy/reload");
  }
  // Synthetic repair, not an app import feature or partial editing of an unsafe dataset.
  await page.evaluate((data) => localStorage.setItem("calculation-memo:data", JSON.stringify(data)), { ...original, notes: [good, { ...good, id: "safe-2", title: "Synthetic second safe memo" }] });
  await page.reload();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.locator("#calculator")).not.toHaveAttribute("inert", "");
  await selectPanel("notes");
  const card = page.locator(".note-card").filter({ hasText: "Synthetic safe memo" });
  await activate(card.getByRole("button", { name: "編集", exact: true }));
  await page.getByRole("dialog").getByLabel(/^タイトル/).fill("Synthetic repaired memo");
  await activate(page.getByRole("dialog").getByRole("button", { name: "保存する", exact: true }));
  await expect.poll(async () => (await storage()).notes[0].title).toBe("Synthetic repaired memo");
  await page.reload();
  await selectPanel("notes");
  await expect(page.locator(".note-card").filter({ hasText: "Synthetic repaired memo" })).toBeVisible();
  await screenshot(prefix + "-normal-memos-after-repair");
  await passed(prefix + ": repaired normal dataset supports editing/saving/reload; sibling preserved");
  assert.equal((await storage()).notes[1].title, "Synthetic second safe memo");
  // Protect the save boundary if storage changes after a successful boot.
  const changedRaw = JSON.stringify({ ...original, notes: [good, variants[0][1]] }, null, 2);
  await page.evaluate((raw) => localStorage.setItem("calculation-memo:data", raw), changedRaw);
  const theme = page.getByLabel("テーマ", { exact: true });
  await theme.selectOption((await theme.inputValue()) === "dark" ? "light" : "dark");
  await expect(page.getByRole("alert")).toContainText("保存データを読み込めませんでした");
  assert.equal(await readRaw(), changedRaw);
  await expect(page.locator("#calculator")).toHaveAttribute("inert", "");
  await passed(prefix + ": post-ready storage corruption blocks autosave and enters protection");
  // Confirm the separate existing reset path against synthetic data only.
  const raw = JSON.stringify({ ...original, notes: [variants[0][1]] });
  await page.evaluate((raw) => localStorage.setItem("calculation-memo:data", raw), raw);
  await page.reload();
  await activate(page.getByRole("button", { name: "保存データを初期化", exact: true }));
  await activate(page.getByRole("dialog").getByRole("button", { name: "初期化する", exact: true }));
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect.poll(storage).toMatchObject({ notes: [], history: [] });
  await expect(page.locator("#calculator")).not.toHaveAttribute("inert", "");
  await passed(prefix + ": explicit confirmed reset alone clears protected synthetic data");
}

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
  await expect(dialog.locator(".calculation-expression code")).toHaveText("2*(5+3)");
  await expect(dialog.locator(".calculation-live-result strong")).toHaveText("= 16");
  await activate(dialog.getByRole("button", { name: "保存する", exact: true }));
  await expect(page.locator(".note-card")).toHaveCount(2);
  await assertSavedMemoContents();
  async function assertSavedMemoContents() {
    const block = page.locator(".note-card").filter({ hasText: "Synthetic block memo" });
    await expect(block).toBeVisible();
    await expect(block.locator(".text-block")).toHaveText("Synthetic block text.");
    await expect(block.locator(".calculation-block code")).toHaveText("2*(5+3)");
    await expect(block.locator(".calculation-block strong")).toHaveText("= 16");
    await expect(single).toContainText("Synthetic data only.");
    await expect.poll(storage).toMatchObject({ notes: [
      { type: "plain-calculation", title: "Synthetic block memo", blocks: [
        { type: "text", content: "Synthetic block text." },
        { type: "calculation", expression: "2*(5+3)", displayExpression: "2*(5+3)", evaluationMode: "note-variables", result: 16, resultText: "16", error: null },
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
  await stage(prefix + ": small-result-chain-and-imported-editing");
  const notesBeforeChains = (await storage()).notes;
  for (const negative of [false, true]) {
    await activate(button("すべて消去"));
    await page.keyboard.type((negative ? "-" : "") + "1/10000000=");
    await expect(page.locator(".lcd-result")).toHaveText(negative ? "-0.0000001" : "0.0000001");
    const historyBeforeChain = (await storage()).history;
    await activate(button("掛ける"));
    await noteDisabled();
    await expect(page.locator(".lcd-expression")).not.toContainText("e");
    assert.deepEqual((await storage()).history, historyBeforeChain);
    await activate(button("2"));
    await activate(button("計算する"));
    await expect(page.locator(".lcd-result")).toHaveText(negative ? "-0.0000002" : "0.0000002");
    await expect.poll(async () => (await storage()).history[0]).toMatchObject({
      expression: (negative ? "-" : "") + "0.0000001*2", result: negative ? -2e-7 : 2e-7,
    });
  }
  // The generated decimal remains editable; sign and CE must not target an exponent.
  await activate(button("足す"));
  await activate(button("1文字削除"));
  await activate(button("符号反転"));
  await expect(page.locator(".lcd-result")).toHaveText("0.0000002");
  await noteDisabled();
  await activate(button("計算する"));
  await activate(button("単独計算メモを作成"));
  await dialog.getByLabel("タイトル", { exact: false }).fill("Synthetic tiny result");
  await activate(dialog.getByRole("button", { name: "保存する", exact: true }));
  await expect.poll(async () => (await storage()).notes[0]).toMatchObject({
    expression: "0.0000002", result: 2e-7, resultText: "0.0000002", title: "Synthetic tiny result",
  });
  assert.deepEqual((await storage()).notes.slice(1), notesBeforeChains);
  await page.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
  await assertHeaderFit("small-result-chain-capture");
  await screenshot(prefix + "-small-result-chain");
  await activate(button("足す"));
  await activate(button("1文字削除"));
  await activate(button("現在の数値を消去"));
  await expect(page.locator(".lcd-expression")).toHaveText("0");
  await noteDisabled();
  const beforeImported = await storage();
  for (const imported of ["12 * - 34 ", "12 × − 34 "]) {
    await page.goto(base + "?expr=" + encodeURIComponent(imported));
    await expect(page.locator(".lcd-result")).toHaveText("-34");
    assert.deepEqual((await storage()).history, beforeImported.history);
    await noteDisabled();
    await activate(button("計算する"));
    await expect(page.locator(".lcd-result")).toHaveText("-408");
    await activate(button("符号反転"));
    await expect(page.locator(".lcd-result")).toHaveText("34");
    await noteDisabled();
    await activate(button("現在の数値を消去"));
    await activate(button("2"));
    await activate(button("計算する"));
    await expect(page.locator(".lcd-result")).toHaveText("24");
    // A new URL navigation must preserve all stored items, with no automatic history.
    beforeImported.history = (await storage()).history;
  }
  assert.deepEqual((await storage()).notes, beforeImported.notes);
  await page.evaluate(() => scrollTo({ top: 0, behavior: "instant" }));
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
  await assertHeaderFit("imported-negative-edit-capture");
  await screenshot(prefix + "-imported-negative-edit");
  await passed(prefix + ": positive/negative tiny result chain, editable decimal, exact history/memo payload and imported whitespace/Unicode signs");
  await stage(prefix + ": parentheses-percent-and-error-boundaries");
  for (const sample of [
    { expression: "(2+3", correction: ")", result: "5" },
    { expression: "12+", correction: "*2", result: "24" },
  ]) {
    await activate(button("すべて消去"));
    const snapshot = await storage();
    await page.keyboard.type(sample.expression + "=");
    await expect(page.locator(".lcd-result")).toHaveText("Error");
    await noteDisabled();
    assert.deepEqual((await storage()).history, snapshot.history);
    await page.keyboard.type(sample.correction + "=");
    await expect(page.locator(".lcd-result")).toHaveText(sample.result);
  }
  await page.keyboard.type("(50+50)="); // Left parenthesis starts fresh after equals.
  await expect(page.locator(".lcd-result")).toHaveText("100");
  await page.keyboard.type("%"); // Postfix percent edits the original expression.
  await noteDisabled();
  await page.keyboard.type("=");
  await expect(page.locator(".lcd-result")).toHaveText("1");
  await activate(button("現在の数値を消去")); // Closed parentheses retain existing conservative editing contract.
  await noteDisabled();
  await page.keyboard.type("=");
  await expect(page.locator(".lcd-result")).toHaveText("1");
  await page.keyboard.type("+2=");
  await expect(page.locator(".lcd-result")).toHaveText("3");
  const beforeFinalReload = await storage();
  await page.goto(base);
  await selectPanel("notes");
  await expect(page.locator(".note-card").filter({ hasText: "Synthetic tiny result" })).toContainText("0.0000002");
  assert.deepEqual((await storage()).history, beforeFinalReload.history);
  assert.deepEqual((await storage()).notes, beforeFinalReload.notes);
  await passed(prefix + ": failed expressions corrected without history side effects, fresh parentheses, postfix percent and final persistence");
  await exerciseBasicMath(prefix);
  await exerciseVariables(prefix);
  await exerciseFormulaLibrary(prefix);
  await exerciseIdentification(prefix);
  await exerciseFormulaExecution(prefix);
  await exerciseStorageProtection(prefix);
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
