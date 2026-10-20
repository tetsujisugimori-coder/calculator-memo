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
  await activate(dialog.getByRole("button", { name: "＋ 旧変数計算", exact: true }));
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
    await activate(dialog.getByRole("button", { name: "＋ 旧変数計算", exact: true }));
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

async function exerciseBlockExtraFields(prefix) {
  await stage(prefix + ": block-extra-field-preservation");
  const original = await storage();
  const extras = (id) => ({ proofRef: "proof-" + id, sourceId: "source-" + id, metadata: { tags: ["synthetic", { revision: 1 }], verified: false }, futureAnnotation: { text: "opaque data" } });
  const calc = (id, expression, mode) => ({ ...extras(id), id, type: "calculation", expression, displayExpression: expression, result: 0, resultText: "0", error: null, ...(mode ? { evaluationMode: mode } : {}) });
  const blocks = [{ id: "text-extra", type: "text", content: "Synthetic explanatory text", ...extras("text-extra") }, calc("legacy-extra", "2+3"), calc("define-extra", "x=4", "note-variables"), calc("use-extra", "x*2", "note-variables")];
  const note = { id: "extra-note", type: "plain-calculation", title: "Synthetic metadata memo", content: "fallback", createdAt: "2026-10-19T00:00:00Z", updatedAt: "2026-10-19T00:00:00Z", blocks };
  await page.evaluate((data) => localStorage.setItem("calculation-memo:data", JSON.stringify(data)), { ...original, notes: [note] });
  await page.reload();
  await selectPanel("notes");
  const open = async () => {
    await activate(page.locator(".note-card").filter({ hasText: note.title }).getByRole("button", { name: "編集", exact: true }));
    return page.getByRole("dialog");
  };
  const save = async () => {
    await activate(page.getByRole("dialog").getByRole("button", { name: "保存する", exact: true }));
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect.poll(async () => (await storage()).notes[0].blocks.length).toBe(4);
  };
  const checkExtras = async () => {
    const saved = (await storage()).notes[0].blocks;
    for (const block of saved) for (const [key, value] of Object.entries(extras(block.id))) assert.deepEqual(block[key], value, "Opaque extra field survives: " + block.id + "." + key);
    assert.equal(Object.hasOwn(saved.find((block) => block.id === "legacy-extra"), "evaluationMode"), false);
    assert.equal(saved.find((block) => block.id === "use-extra").evaluationMode, "note-variables");
    return saved;
  };
  await open(); await save();
  let saved = await checkExtras();
  assert.deepEqual(saved.filter((block) => block.type === "calculation").map((block) => block.result), [5, 4, 8]);
  await page.reload(); await selectPanel("notes"); await checkExtras();
  await passed(prefix + ": legacy/variable calculation extras survive unchanged edit, recalculation, save and reload");
  let dialog = await open();
  await dialog.getByLabel("Markdown文章").fill("Changed explanatory text");
  await activate(dialog.getByRole("button", { name: "＋ 文章", exact: true }));
  await activate(dialog.locator(".block-editor-card").last().getByRole("button", { name: "文章ブロックを削除", exact: true }));
  const legacy = dialog.locator(".block-editor-card.calculation").filter({ hasText: "従来の計算モード" });
  await activate(legacy.getByRole("button", { name: "計算ブロックを下へ移動", exact: true }));
  await activate(legacy.getByRole("button", { name: "計算ブロックを上へ移動", exact: true }));
  await save(); saved = await checkExtras();
  assert.deepEqual(saved.map((block) => block.id), blocks.map((block) => block.id));
  assert.equal(saved[0].content, "Changed explanatory text");
  assert.equal(saved[3].result, 8);
  await passed(prefix + ": other-block edit, add/delete and move down/up preserve calculation extras and order");
  dialog = await open();
  await dialog.getByLabel("計算式", { exact: true }).nth(2).fill("x/0");
  await save(); saved = await checkExtras();
  assert.equal(saved[3].result, null); assert.equal(saved[3].resultText, ""); assert.ok(saved[3].error); assert.equal(saved[3].displayExpression, "x/0");
  await page.reload(); await selectPanel("notes"); await checkExtras();
  dialog = await open();
  await dialog.getByLabel("計算式", { exact: true }).nth(2).fill("x*3");
  await save(); saved = await checkExtras();
  assert.equal(saved[3].result, 12); assert.equal(saved[3].error, null); assert.equal(saved[3].resultText, "12");
  await page.reload(); await selectPanel("notes"); saved = await checkExtras(); assert.equal(saved[3].result, 12);
  await screenshot(prefix + "-block-extra-fields-restored");
  await passed(prefix + ": expression error/recovery refreshes engine fields while opaque extras survive JSON save/reload");
}

async function exerciseBlockReferences(prefix) {
  await stage(prefix + ": manual-block-references");
  const original = await storage();
  const block = (id, expression) => ({ id, type: "calculation", expression, displayExpression: expression, result: 0, resultText: "0", error: null, metadata: { proofRef: id } });
  const note = { id: "reference-note", type: "plain-calculation", title: "Synthetic reference memo", content: "fallback", createdAt: "2026-10-19T00:00:00Z", updatedAt: "2026-10-19T00:00:00Z", blocks: [block("target", ""), block("source", "sqrt(2)")] };
  await page.evaluate(data => localStorage.setItem("calculation-memo:data", JSON.stringify(data)), { ...original, notes: [note] });
  await page.reload(); await selectPanel("notes");
  const open = async () => { await activate(page.locator(".note-card").filter({hasText:note.title}).getByRole("button",{name:"編集",exact:true})); return page.getByRole("dialog"); };
  const save = async () => { await activate(page.getByRole("dialog").getByRole("button",{name:"保存する",exact:true})); await expect(page.getByRole("dialog")).toHaveCount(0); await expect.poll(async()=>(await storage()).notes[0].calculationPolicy?.mode).toBe("manual"); };
  const values = async()=>(await storage()).notes[0].blocks;
  let dialog = await open();
  await activate(dialog.locator(".block-editor-card").first().getByRole("button",{name:"参照モードに切替（メモを手動再計算にする）",exact:true}));
  const select = dialog.getByLabel("参照先を選んで式に挿入"); await activate(select); await select.selectOption("source");
  await expect(dialog.getByLabel("計算式",{exact:true}).first()).toHaveValue("@{1}");
  await dialog.getByLabel("計算式",{exact:true}).first().fill("@{1} * @{1}");
  await expect(dialog).toContainText("再計算待ち");
  await activate(dialog.getByRole("button",{name:"メモ全体を再計算",exact:true}));
  await expect(dialog.locator(".calculation-live-result").first()).toContainText("= 2");
  await save();
  let saved = await values(); assert.equal(saved[0].result,Math.sqrt(2)*Math.sqrt(2)); assert.equal(saved[0].resultText,"2"); assert.equal(saved[0].references.entries[0].blockId,"source");
  await passed(prefix+": GUI selects forward reference by ID and manual evaluation preserves raw precision");
  await page.reload(); await selectPanel("notes"); dialog = await open();
  await dialog.getByLabel("計算式",{exact:true}).nth(1).fill("sqrt(3)");
  await expect(dialog.locator(".calculation-live-result").first()).toContainText("旧結果");
  await save(); saved = await values(); assert.equal(saved[0].result,Math.sqrt(2)*Math.sqrt(2)); assert.equal(saved[1].result,Math.sqrt(2));
  await page.reload(); await selectPanel("notes"); await expect(page.locator(".note-card")).toContainText("再計算待ち");
  await passed(prefix+": edit/save/reload do not recalculate or mislabel old results");
  dialog=await open(); await activate(dialog.getByRole("button",{name:"メモ全体を再計算",exact:true}));
  await activate(dialog.locator(".block-editor-card").first().getByRole("button",{name:"計算ブロックを下へ移動",exact:true}));
  await activate(dialog.getByRole("button",{name:"メモ全体を再計算",exact:true})); await save();
  saved=await values(); assert.equal(saved[1].id,"target"); assert.equal(saved[1].result,Math.sqrt(3)*Math.sqrt(3)); assert.equal(saved[1].resultText,"3"); assert.deepEqual(saved[1].metadata,{proofRef:"target"});
  await passed(prefix+": backward reference after reorder keeps ID binding and opaque metadata");
  dialog=await open(); await dialog.getByLabel("計算式",{exact:true}).first().fill("1/0"); await activate(dialog.getByRole("button",{name:"メモ全体を再計算",exact:true}));
  await expect(dialog).toContainText("一括確定を停止"); await save(); saved=await values(); assert.equal(saved[0].result,Math.sqrt(3)); assert.equal(saved[1].result,Math.sqrt(3)*Math.sqrt(3));
  dialog=await open(); await dialog.getByLabel("計算式",{exact:true}).first().fill("4"); await activate(dialog.getByRole("button",{name:"メモ全体を再計算",exact:true})); await save(); saved=await values(); assert.equal(saved[1].result,16);
  await passed(prefix+": source error rolls back every result, then corrected input recovers");
  dialog=await open(); const target=dialog.locator(".block-editor-card").nth(1); const picker=target.getByLabel("参照先を選んで式に挿入"); await activate(picker); await picker.selectOption("target"); await dialog.getByLabel("計算式",{exact:true}).nth(1).fill("@{2}");
  await activate(dialog.getByRole("button",{name:"メモ全体を再計算",exact:true})); await expect(dialog).toContainText("自己参照");
  await dialog.getByLabel("計算式",{exact:true}).nth(1).fill("@{1}"); await activate(dialog.locator(".block-editor-card").first().getByRole("button",{name:"計算ブロックを削除",exact:true}));
  await activate(dialog.getByRole("button",{name:"メモ全体を再計算",exact:true})); await expect(dialog).toContainText("参照切れ"); await expect(dialog).toContainText("参照先削除済み");
  await screenshot(prefix+"-reference-missing"); await save();
  await passed(prefix+": self and deleted references remain explicit errors, without positional rebinding");
  for(const theme of ["light","dark"]) {
    await page.evaluate(theme=>{const d=JSON.parse(localStorage.getItem("calculation-memo:data"));d.settings.theme=theme;localStorage.setItem("calculation-memo:data",JSON.stringify(d));},theme);
    await page.reload(); await selectPanel("notes"); dialog=await open();
    await page.evaluate(()=>document.documentElement.style.fontSize="200%");
    await screenshot(prefix+"-reference-"+theme+"-enlarged");
    const themedPicker = dialog.getByLabel("参照先を選んで式に挿入");
    await expect(themedPicker).toHaveCSS("background-color", theme === "dark" ? "rgb(35, 38, 35)" : "rgb(251, 250, 246)");
    await expect(themedPicker).toHaveCSS("color", theme === "dark" ? "rgb(240, 239, 233)" : "rgb(32, 35, 31)");
    await expect(themedPicker).toHaveCSS("appearance", "none");
    await themedPicker.scrollIntoViewIfNeeded();
    // Computed colors do not expose WebKit's native light bezel. Inspect actual
    // rasterized pixels, without snapshots/platform-specific font expectations.
    const pickerPng = await themedPicker.screenshot();
    const painted = await page.evaluate(async ({ png, dark }) => {
      const image = new Image();
      image.src = "data:image/png;base64," + png;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.width; canvas.height = image.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(image, 0, 0);
      const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      const background = dark ? [35, 38, 35] : [251, 250, 246];
      const foreground = dark ? [240, 239, 233] : [32, 35, 31];
      let backgroundPixels = 0, backgroundSamples = 0, foregroundPixels = 0;
      const matches = (offset, rgb) => rgb.every((value, channel) => Math.abs(pixels[offset + channel] - value) <= 3);
      for (let i = 0; i < pixels.length; i += 4) {
        const x = (i / 4) % canvas.width, y = Math.floor(i / 4 / canvas.width);
        // Top padding, away from the border, text, and right-hand arrow.
        if (x > canvas.width * 0.15 && x < canvas.width * 0.75 && y > canvas.height * 0.06 && y < canvas.height * 0.12) {
          backgroundSamples++;
          if (matches(i, background)) backgroundPixels++;
        }
        if (matches(i, foreground)) foregroundPixels++;
      }
      return { background: backgroundPixels / backgroundSamples, foreground: foregroundPixels / (pixels.length / 4) };
    }, { png: pickerPng.toString("base64"), dark: theme === "dark" });
    assert.ok(painted.background > 0.9, `${prefix} ${theme}: painted select background missing: ${JSON.stringify(painted)}`);
    assert.ok(painted.foreground > 0.005, `${prefix} ${theme}: painted select text missing: ${JSON.stringify(painted)}`);
    activeScenarioRecord.referencePickerPixels ??= [];
    activeScenarioRecord.referencePickerPixels.push({ theme, ...painted });
    await screenshot(prefix+"-reference-"+theme+"-enlarged-picker");
    await dialog.locator(".calculation-live-result").last().scrollIntoViewIfNeeded();
    await screenshot(prefix+"-reference-"+theme+"-enlarged-result");
    assert.ok(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+2),"Reference dialog must not overflow horizontally");
    await page.evaluate(()=>document.documentElement.style.fontSize=""); await activate(dialog.getByRole("button",{name:"キャンセル",exact:true}));
  }
  await passed(prefix+": reference controls and stale/error captions fit both enlarged themes");
  await page.evaluate(data=>localStorage.setItem("calculation-memo:data",JSON.stringify(data)),original); await page.reload(); await selectPanel("notes");
}

// The standard add action is ID-based; legacy regression above explicitly uses
// the compatibility action, retaining its original arithmetic expectations.
async function exerciseDefaultIdCalculations(prefix) {
  await stage(prefix + ": default-id-calculations");
  const original = await storage();
  await selectPanel("notes");
  await activate(page.locator("#notes-panel").getByRole("button", { name: "＋ 新規作成", exact: true }));
  let dialog = page.getByRole("dialog");
  await activate(dialog.getByRole("button").filter({ hasText: "BLOCKS / MARKDOWN" }));
  const title = "Synthetic default ID calculations";
  await dialog.getByLabel("タイトル", { exact: false }).fill(title);
  const cards = () => dialog.locator(".block-editor-card.calculation");
  const add = async (expression, legacy = false) => {
    await activate(dialog.getByRole("button", { name: legacy ? "＋ 旧変数計算" : "＋ 計算", exact: true }));
    const card = cards().last();
    await card.getByLabel("計算式", { exact: true }).fill(expression);
    return card;
  };
  const save = async () => {
    await activate(dialog.getByRole("button", { name: "保存する", exact: true }));
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect.poll(async () => (await storage()).notes.find(n => n.title === title)?.calculationPolicy?.mode).toBe("manual");
  };
  const read = async () => (await storage()).notes.find(n => n.title === title);
  const open = async () => {
    await activate(page.locator(".note-card").filter({ hasText: title }).getByRole("button", { name: "編集", exact: true }));
    dialog = page.getByRole("dialog");
  };
  const recalculate = async () => activate(dialog.getByRole("button", { name: "メモ全体を再計算", exact: true }));
  await add("sqrt(2)");
  const target = await add("");
  // Selection uses the displayed label, never a typed/internal block ID.
  const picker = target.getByLabel("参照先を選んで式に挿入");
  await activate(picker); await picker.selectOption({ label: "ブロック 1: sqrt(2)" });
  await expect(target.getByLabel("計算式", { exact: true })).toHaveValue("@{1}");
  await target.getByLabel("計算式", { exact: true }).fill("@{1}*2");
  await expect(dialog).toContainText("再計算待ち");
  await assertHorizontalFit();
  await screenshot(prefix + "-default-id-editor", currentScenario.width, false);
  await save();
  let saved = (await read()).blocks;
  assert.deepEqual(saved.map(b => [b.evaluationMode, b.result, b.error, b.evaluationState.status]), [
    ["block-references", null, null, "stale"], ["block-references", null, null, "stale"],
  ]);
  const sourceId = saved[0].id, targetId = saved[1].id;
  assert.equal(saved[1].references.entries[0].blockId, sourceId);
  await page.reload(); await selectPanel("notes");
  assert.deepEqual((await read()).blocks, saved, "Saving and reloading new ID expressions must not evaluate them");
  await passed(prefix + ": standard add creates ID calculations; visible-label selection and save/reload never implicitly calculate");

  await open(); await recalculate(); await save();
  saved = (await read()).blocks;
  assert.equal(saved[0].result, Math.sqrt(2)); assert.equal(saved[1].result, Math.sqrt(2) * 2);
  assert.ok(saved.every(b => b.evaluationState.status === "current"));
  await open(); await cards().first().getByLabel("計算式", { exact: true }).fill("sqrt(3)"); await save();
  saved = (await read()).blocks;
  assert.equal(saved[0].result, Math.sqrt(2)); assert.equal(saved[1].result, Math.sqrt(2) * 2);
  await open(); await activate(cards().last().getByRole("button", { name: "計算ブロックを上へ移動", exact: true }));
  await recalculate(); await save();
  saved = (await read()).blocks;
  assert.equal(saved[0].id, targetId); assert.equal(saved[1].id, sourceId);
  assert.equal(saved[0].result, Math.sqrt(3) * 2); assert.equal(saved[1].result, Math.sqrt(3));
  assert.equal(saved[0].references.entries[0].blockId, sourceId);
  await passed(prefix + ": standard ID values retain raw precision and old results until manual recalculation after edit/reorder");

  await open(); await add("x=3", true); await add("x=x+1", true);
  const mixed = await add("");
  const mixedPicker = mixed.getByLabel("参照先を選んで式に挿入");
  await activate(mixedPicker); await mixedPicker.selectOption({ label: "ブロック 4: x=x+1" });
  await mixed.getByLabel("計算式", { exact: true }).fill("@{1}+1");
  await recalculate(); await save();
  saved = (await read()).blocks;
  assert.deepEqual(saved.slice(2).map(b => [b.evaluationMode, b.result]), [["note-variables", 3], ["note-variables", 4], ["block-references", 5]]);
  const confirmed = structuredClone(saved);
  await open(); await cards().nth(1).getByLabel("計算式", { exact: true }).fill("1/0"); await recalculate();
  await expect(cards().nth(1).locator(".block-attempt-diagnostic")).toContainText("今回の計算エラー");
  await expect(cards().nth(0).locator(".block-attempt-diagnostic")).toContainText("今回の依存エラー");
  for (const index of [2, 3, 4]) await expect(cards().nth(index).locator(".block-attempt-diagnostic")).toHaveCount(0);
  await cards().nth(1).locator(".block-attempt-diagnostic").scrollIntoViewIfNeeded();
  await screenshot(prefix + "-default-id-own-error", currentScenario.width, false);
  await dialog.getByText(/^一括確定を停止:/).scrollIntoViewIfNeeded();
  await screenshot(prefix + "-default-id-unrelated-rollback", currentScenario.width, false);
  await save();
  saved = (await read()).blocks;
  assert.deepEqual(saved.map(b => b.result), confirmed.map(b => b.result), "Any failed ID calculation must roll back all candidates");
  assert.ok(saved.every(b => b.evaluationState.status === "stale"));
  // A transaction rollback must not replace unrelated blocks' own error fields.
  assert.equal(saved[2].error, null); assert.equal(saved[3].error, null); assert.equal(saved[4].error, null);
  await open(); await expect(dialog.locator(".block-attempt-diagnostic")).toHaveCount(0);
  await cards().nth(1).getByLabel("計算式", { exact: true }).fill("sqrt(3)");
  await expect(dialog.locator(".block-attempt-diagnostic")).toHaveCount(0);
  await recalculate(); await expect(dialog.locator(".block-attempt-diagnostic")).toHaveCount(0); await save();
  assert.deepEqual((await read()).blocks.map(b => b.result), confirmed.map(b => b.result));
  await page.reload(); await selectPanel("notes");
  assert.deepEqual((await read()).blocks.map(b => b.result), confirmed.map(b => b.result));
  await passed(prefix + ": explicit legacy add preserves ordered reassignment within ID memo; ID failure rollback and corrected retry keep unrelated values/error fields");

  for (const theme of ["light", "dark"]) {
    await page.evaluate(theme => { const data = JSON.parse(localStorage.getItem("calculation-memo:data")); data.settings.theme = theme; localStorage.setItem("calculation-memo:data", JSON.stringify(data)); }, theme);
    await page.reload(); await selectPanel("notes"); await open();
    await page.evaluate(() => document.documentElement.style.fontSize = "200%");
    await dialog.getByRole("button", { name: "＋ 計算", exact: true }).scrollIntoViewIfNeeded();
    await expect(dialog.getByRole("button", { name: "＋ 旧変数計算", exact: true })).toBeVisible();
    await assertHorizontalFit(); await screenshot(prefix + "-default-id-" + theme + "-toolbar", currentScenario.width, false);
    await page.evaluate(() => document.documentElement.style.fontSize = "");
    await activate(dialog.getByRole("button", { name: "キャンセル", exact: true }));
  }
  await passed(prefix + ": standard/legacy add controls fit both themes with expanded text in each existing browser viewport");
  await page.evaluate(data => localStorage.setItem("calculation-memo:data", JSON.stringify(data)), original);
  await page.reload(); await selectPanel("notes");
}

// State/diagnostic display is derived from snapshots; this scenario separately
// asserts retained numerical results and the UI's claims about their validity.
async function exerciseCalculationDiagnostics(prefix) {
  await stage(prefix + ": calculation-state-diagnostics");
  const original = await storage();
  const title = "Synthetic state diagnostics";
  await selectPanel("notes");
  await activate(page.locator("#notes-panel").getByRole("button", { name: "＋ 新規作成", exact: true }));
  let dialog = page.getByRole("dialog");
  await activate(dialog.getByRole("button").filter({ hasText: "BLOCKS / MARKDOWN" }));
  await dialog.getByLabel("タイトル", { exact: false }).fill(title);
  const cards = () => dialog.locator(".block-editor-card.calculation");
  const expression = index => cards().nth(index).getByLabel("計算式", { exact: true });
  const state = index => cards().nth(index).locator(".block-status");
  const recalculate = async () => activate(dialog.getByRole("button", { name: "メモ全体を再計算", exact: true }));
  const add = async text => {
    await activate(dialog.getByRole("button", { name: "＋ 計算", exact: true }));
    await cards().last().getByLabel("計算式", { exact: true }).fill(text);
  };
  const reference = async (index, label, suffix) => {
    const picker = cards().nth(index).getByLabel("参照先を選んで式に挿入");
    await activate(picker); await picker.selectOption({ label });
    await expression(index).fill("@{1}" + suffix);
  };
  const save = async () => {
    await activate(dialog.getByRole("button", { name: "保存する", exact: true }));
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect.poll(async () => (await storage()).notes.some(n => n.title === title)).toBe(true);
  };
  const open = async () => {
    await activate(page.locator(".note-card").filter({ hasText: title }).getByRole("button", { name: "編集", exact: true }));
    dialog = page.getByRole("dialog");
  };
  const read = async () => (await storage()).notes.find(n => n.title === title);
  const detailButton = index => cards().nth(index).getByRole("button", { name: `ブロック ${index + 1} の状態とエラー詳細`, exact: true });
  await add("3"); await add(""); await reference(1, "ブロック 1: 3", "*2");
  await add(""); await reference(2, "ブロック 2: @{1}*2", "+1"); await add("99");
  await recalculate(); await save();
  const confirmed = (await read()).blocks;
  assert.deepEqual(confirmed.map(b => b.result), [3, 6, 7, 99]);
  await open();
  await expression(0).fill("4");
  await expect(state(0)).toHaveAttribute("data-state-kind", "changed");
  await expect(state(1)).toHaveAttribute("data-state-kind", "affected");
  await expect(state(2)).toHaveAttribute("data-state-kind", "affected");
  await expect(state(3)).toHaveAttribute("data-state-kind", "normal");
  await expect(cards().nth(0).locator(".calculation-live-result")).toContainText("3");
  await expect(cards().nth(1).locator(".calculation-live-result")).toContainText("6");
  await expect(dialog.locator(".block-attempt-diagnostic")).toHaveCount(0);
  await activate(detailButton(0));
  await expect(detailButton(0)).toHaveAttribute("aria-expanded", "true");
  await expect(cards().nth(0).locator(".block-diagnostic-details")).toBeVisible();
  await assertHorizontalFit(); await screenshot(prefix + "-diagnostics-change-detail", currentScenario.width, false);
  await activate(detailButton(0));
  await expect(detailButton(0)).toHaveAttribute("aria-expanded", "false");
  await passed(prefix + ": direct edits and multistage dependents are distinct from unrelated blocks, retained old values and unexecuted numeric errors");

  // The parser can know this structure is invalid before execution, but must not
  // claim that an untried numeric calculation has already failed.
  await expression(0).fill("(");
  await expect(state(0)).toHaveAttribute("data-state-kind", "error");
  await expect(dialog.locator(".block-attempt-diagnostic")).toHaveCount(0);
  await activate(detailButton(0));
  await expect(cards().nth(0).locator(".block-diagnostic-details")).toContainText("未");
  await cards().nth(0).locator(".block-diagnostic-details h4").evaluate(element => element.scrollIntoView({ block: "center" }));
  await screenshot(prefix + "-diagnostics-structural-before", currentScenario.width, false);
  await activate(detailButton(0));
  await expression(0).fill("1/0");
  await expect(state(0)).toHaveAttribute("data-state-kind", "changed");
  await recalculate();
  await expect(state(0)).toHaveAttribute("data-state-kind", "error");
  await expect(state(1)).toHaveAttribute("data-state-kind", "blocked");
  await expect(state(2)).toHaveAttribute("data-state-kind", "blocked");
  await expect(state(3)).toHaveAttribute("data-state-kind", "normal");
  await expect(cards().nth(3).locator(".block-attempt-diagnostic")).toHaveCount(0);
  await expect(dialog.getByText(/^一括確定を停止:/)).toHaveCount(1);
  await activate(detailButton(1));
  await expect(cards().nth(1).locator(".block-diagnostic-details")).toBeVisible();
  await cards().nth(1).locator(".block-diagnostic-details h4").evaluate(element => element.scrollIntoView({ block: "center" }));
  await screenshot(prefix + "-diagnostics-blocked-detail", currentScenario.width, false);
  await activate(cards().nth(1).locator(".block-diagnostic-details").getByRole("button", { name: /^ブロック 1:.*へ移動$/ }).first());
  await expect(cards().nth(0)).toBeFocused();
  await activate(detailButton(1));
  await activate(dialog.getByText("依存関係をMermaidで取り出す", { exact: true }));
  const mermaid = dialog.getByLabel("Mermaid依存関係図", { exact: true });
  await expect(mermaid).toHaveAttribute("readonly", "");
  const graphText = await mermaid.inputValue();
  assert.ok(graphText.startsWith("flowchart TD\n"));
  assert.ok(graphText.includes("classDef") && graphText.includes("-->"));
  const rawBeforeExport = await read();
  await activate(dialog.getByRole("button", { name: "Mermaid文字列をコピー", exact: true }));
  assert.deepEqual(await read(), rawBeforeExport, "Export/copy must not commit or recalculate the draft");
  await mermaid.scrollIntoViewIfNeeded();
  await screenshot(prefix + "-diagnostics-mermaid", currentScenario.width, false);
  await activate(dialog.getByText("依存関係をMermaidで取り出す", { exact: true }));
  await passed(prefix + ": static syntax errors are distinguished from actual numeric failure and downstream blockage without unrelated error propagation");

  await save(); const failed = (await read()).blocks;
  assert.deepEqual(failed.map(b => [b.result, b.resultText, b.error]), confirmed.map(b => [b.result, b.resultText, b.error]));
  await page.reload(); await selectPanel("notes"); await open();
  await expect(dialog.locator(".block-attempt-diagnostic")).toHaveCount(0);
  await expect(state(0)).toHaveAttribute("data-state-kind", "unknown");
  await expect(state(3)).toHaveAttribute("data-state-kind", "unknown");
  await activate(detailButton(0));
  await expect(cards().nth(0).locator(".block-diagnostic-details")).toContainText("不明");
  await activate(detailButton(0));
  await expression(0).fill("4"); await recalculate();
  for (let index = 0; index < 4; index++) await expect(state(index)).toHaveAttribute("data-state-kind", "normal");
  await expect(dialog.getByText(/^一括確定を停止:/)).toHaveCount(0);
  await save(); assert.deepEqual((await read()).blocks.map(b => b.result), [4, 8, 9, 99]);
  await passed(prefix + ": failed recalculation preserves every saved result; reload reports missing change evidence, and successful correction clears pending state");

  await open();
  // Reordering only ID calculations does not change reference meaning or warn
  // an unrelated source. The previous/next graph comparison is exercised here.
  await activate(cards().nth(3).getByRole("button", { name: "計算ブロックを上へ移動", exact: true }));
  for (let index = 0; index < 4; index++) await expect(state(index)).toHaveAttribute("data-state-kind", "normal");
  await activate(cards().nth(2).getByRole("button", { name: "計算ブロックを下へ移動", exact: true }));
  // Independent structural causes must both remain visible, rather than being
  // folded into the transaction's first-error summary.
  await expression(0).fill("("); await expression(3).fill("@{127}");
  await expect(state(0)).toHaveAttribute("data-state-kind", "error");
  await expect(state(3)).toHaveAttribute("data-state-kind", "error");
  await activate(detailButton(3));
  await expect(cards().nth(3).locator(".block-diagnostic-details")).toContainText("参照先");
  await expect(dialog.locator(".block-attempt-diagnostic")).toHaveCount(0);
  await cards().nth(3).locator(".block-diagnostic-details h4").evaluate(element => element.scrollIntoView({ block: "center" }));
  await screenshot(prefix + "-diagnostics-independent-causes", currentScenario.width, false);
  await activate(dialog.getByRole("button", { name: "キャンセル", exact: true }));
  assert.deepEqual((await read()).blocks.map(b => b.result), [4, 8, 9, 99]);
  await passed(prefix + ": ID-only reorder does not invent impact; independent parser and missing-reference causes remain separately inspectable without committing edits");

  for (const theme of ["light", "dark"]) {
    await page.getByLabel("テーマ", { exact: true }).selectOption(theme);
    await open(); await expression(0).fill("5");
    await activate(detailButton(0));
    await page.evaluate(() => document.documentElement.style.fontSize = "200%");
    await detailButton(0).scrollIntoViewIfNeeded();
    await expect(detailButton(0)).toBeInViewport();
    const size = await detailButton(0).boundingBox();
    assert.ok(size && size.height >= 44 && size.width >= 44, "State detail i control retains accessible touch size");
    await assertHorizontalFit();
    await screenshot(prefix + "-diagnostics-" + theme + "-enlarged", currentScenario.width, false);
    await page.evaluate(() => document.documentElement.style.fontSize = "");
    await activate(dialog.getByRole("button", { name: "キャンセル", exact: true }));
  }
  await passed(prefix + ": state labels and accessible detail controls fit both enlarged themes across each browser viewport");
  await page.evaluate(data => localStorage.setItem("calculation-memo:data", JSON.stringify(data)), original);
  await page.reload(); await selectPanel("notes");
}

async function exerciseDependencyGraphNavigation(prefix) {
  await stage(prefix + ": dependency-graph-navigation");
  const original = await storage();
  const ids = ["graph-source:one", "graph-source:two", "graph-middle", "graph-end", "graph-unrelated", "graph-legacy-source", "graph-legacy-use"];
  const calculation = (id, expression, references = []) => ({
    id, type: "calculation", expression, displayExpression: expression, result: null, resultText: "", error: null,
    evaluationMode: "block-references", references: { version: 1, entries: references.map((blockId, index) => ({ slot: index + 1, blockId })) },
  });
  const note = {
    id: "graph-navigation-note", type: "plain-calculation", title: "Synthetic graph navigation",
    content: "Synthetic graph navigation", createdAt: "2026-10-20T00:00:00Z", updatedAt: "2026-10-20T00:00:00Z",
    calculationPolicy: { version: 1, mode: "manual" },
    blocks: [
      calculation(ids[0], "3"), calculation(ids[1], "3"),
      calculation(ids[2], "@{1}*2", [ids[0]]), calculation(ids[3], "@{1}+1", [ids[2]]),
      calculation(ids[4], "99"),
      { ...calculation(ids[5], "x=2"), evaluationMode: "note-variables", references: undefined },
      { ...calculation(ids[6], "x*2"), evaluationMode: "note-variables", references: undefined },
      { id: "graph-text-only", type: "text", content: "Not a calculation node" },
    ],
  };
  const seed = async value => {
    await page.evaluate(data => localStorage.setItem("calculation-memo:data", JSON.stringify(data)), { ...original, notes: [value] });
    await page.reload(); await selectPanel("notes");
  };
  await seed(note);
  let dialog;
  const open = async title => {
    await activate(page.locator(".note-card").filter({ hasText: title || note.title }).getByRole("button", { name: "編集", exact: true }));
    dialog = page.getByRole("dialog");
  };
  const cards = () => dialog.locator(".block-editor-card.calculation");
  const card = id => dialog.locator(`.block-editor-card[data-block-id=${JSON.stringify(id)}]`);
  const panel = () => dialog.getByRole("region", { name: "依存関係図パネル", exact: true });
  const graphToggle = () => dialog.getByText("依存関係の図を開く", { exact: true });
  const nodes = () => panel().locator('svg g.node[role="button"]');
  const node = id => panel().locator(`svg g.node[role="button"][data-block-id=${JSON.stringify(id)}]`);
  const source = () => dialog.getByLabel("Mermaid依存関係図", { exact: true });
  const exportToggle = () => dialog.getByText("依存関係をMermaidで取り出す", { exact: true });
  const detailButton = (scope, number) => scope.getByRole("button", { name: `ブロック ${number} の状態とエラー詳細`, exact: true });
  const snapshot = async () => ({
    stored: await storage(),
    cards: await cards().evaluateAll(elements => elements.map(element => ({
      id: element.getAttribute("data-block-id"),
      expression: element.querySelector("input.code-input").value,
      result: element.querySelector(".calculation-live-result").textContent,
      state: element.querySelector(".block-status").getAttribute("data-state-kind"),
      diagnostics: [...element.querySelectorAll(".block-attempt-diagnostic")].map(item => item.textContent),
    }))),
  });
  const assertNodeIds = async expected => {
    await expect(nodes()).toHaveCount(expected.length);
    assert.deepEqual((await nodes().evaluateAll(elements => elements.map(element => element.getAttribute("data-block-id")))).sort(), [...expected].sort());
  };
  const assertLocated = async id => {
    await expect(card(id)).toBeFocused();
    await expect(card(id)).toHaveClass(/block-graph-selected/);
    await expect(card(id).getByLabel("計算式", { exact: true })).not.toBeFocused();
    await expect(dialog.locator(".block-graph-selected")).toHaveCount(1);
    let geometry;
    // Do not scroll in the test: the app's navigation must expose its destination
    // after the selected-details layout change, not merely focus an offscreen card.
    try {
      await expect.poll(async () => {
        geometry = await card(id).locator(".block-graph-location").evaluate(element => {
          const rect = value => {
            const { left, right, top, bottom, width, height } = value.getBoundingClientRect();
            return { left, right, top, bottom, width, height };
          };
          const target = rect(element), content = rect(element.closest(".modal-content"));
          const header = rect(element.closest('[role="dialog"]').querySelector(".modal-header"));
          const hit = document.elementFromPoint((target.left + target.right) / 2, (target.top + target.bottom) / 2);
          return {
            target, content, header,
            visible: target.left >= Math.max(0, content.left) - 1 && target.right <= Math.min(innerWidth, content.right) + 1
              && target.top >= Math.max(0, content.top, header.bottom) - 1 && target.bottom <= Math.min(innerHeight, content.bottom) + 1,
            hit: hit === element || element.contains(hit),
          };
        });
        return geometry.visible && geometry.hit;
      }, { message: "The selected card's navigation/edit controls must be visible and unobstructed inside the modal" }).toBe(true);
    } finally {
      activeScenarioRecord.graphSelectionGeometry ||= [];
      activeScenarioRecord.graphSelectionGeometry.push({ id, ...geometry });
    }
  };
  const selectNode = async id => {
    await activate(node(id));
    await assertLocated(id);
    await expect(panel().locator(".dependency-graph-selection")).toContainText(`ID: ${id}`);
  };
  const assertSourceAndSvg = async expectedIds => {
    const text = await source().inputValue();
    const encodedId = id => "block_" + Array.from({ length: id.length }, (_, index) => id.charCodeAt(index).toString(16).padStart(4, "0")).join("");
    for (const id of expectedIds) {
      const line = text.split("\n").find(value => value.startsWith(`  ${encodedId(id)}["`));
      assert.ok(line, "Source includes the exact ID-backed node: " + id);
      const encodedLabel = line.slice(line.indexOf('["') + 2, -2);
      const expected = encodedLabel.replace(/#(\d+);/g, (_, code) => String.fromCodePoint(Number(code))).replace(/\s+/g, " ").trim();
      await expect.poll(async () => (await node(id).textContent()).replace(/\s+/g, " ").trim()).toBe(expected);
      const classLine = text.split("\n").find(value => value.startsWith(`  class ${encodedId(id)} `));
      assert.ok(classLine, "Source includes a state class for " + id);
      const stateClasses = classLine.slice(classLine.lastIndexOf(" ") + 1, -1).split(",");
      const svgClasses = (await node(id).getAttribute("class")).split(/\s+/);
      for (const stateClass of stateClasses) assert.ok(svgClasses.includes(stateClass), "SVG and source state agree for " + id);
    }
    assert.equal(await panel().locator("svg .flowchart-link").count(), text.split("\n").filter(line => / -->| -\.->/.test(line)).length, "SVG and Mermaid have the same dependency edge count");
    await expect(panel().locator("svg")).toContainText("ID参照");
    await expect(panel().locator("svg")).toContainText("旧変数候補");
    const dashedEdges = panel().locator("svg .flowchart-link.edge-pattern-dotted");
    assert.equal(await dashedEdges.count(), text.split("\n").filter(line => line.includes(" -.->")).length, "Every uncertain edge retains its dotted distinction");
    for (const dash of await dashedEdges.evaluateAll(elements => elements.map(element => getComputedStyle(element).strokeDasharray))) {
      assert.ok(dash.split(/[ ,]+/).some(value => parseFloat(value) > 0), "Uncertain edge is actually dashed after sanitization, not only class-named: " + dash);
    }
    // Mermaid also adds its default "solid" class to dotted paths; exclude the
    // more-specific patterns rather than mistaking a legacy edge for an ID edge.
    const solidEdges = panel().locator("svg .flowchart-link.edge-pattern-solid:not(.edge-pattern-dotted):not(.edge-pattern-dashed)");
    assert.equal(await solidEdges.count(), text.split("\n").filter(line => line.includes(" -->")).length);
    for (const dash of await solidEdges.evaluateAll(elements => elements.map(element => getComputedStyle(element).strokeDasharray))) {
      assert.ok(dash === "none" || dash.split(/[ ,]+/).every(value => parseFloat(value) === 0), "Definite ID edge remains visually solid: " + dash);
    }
    return text;
  };
  const copySource = async () => {
    // A test clipboard sink verifies exact payload, not OS/iOS clipboard access.
    await page.evaluate(() => Object.defineProperty(navigator, "clipboard", {
      configurable: true, value: { writeText: async text => { window.__graphCopiedText = text; } },
    }));
    await activate(dialog.getByRole("button", { name: "Mermaid文字列をコピー", exact: true }));
    assert.equal(await page.evaluate(() => window.__graphCopiedText), await source().inputValue());
    await expect(dialog.getByText("Mermaid文字列をコピーしました。", { exact: true })).toBeVisible();
  };

  await open();
  await activate(dialog.getByRole("button", { name: "メモ全体を再計算", exact: true }));
  await activate(dialog.getByRole("button", { name: "保存する", exact: true }));
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect.poll(async () => (await storage()).notes[0].blocks.filter(block => block.type === "calculation").map(block => block.result)).toEqual([3, 3, 6, 7, 99, 2, 4]);
  const storedBaseline = await storage();
  await open();
  await page.evaluate(() => {
    window.__graphStorageWrites = [];
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (this === localStorage) window.__graphStorageWrites.push(key);
      return originalSetItem.call(this, key, value);
    };
    window.__restoreGraphStorage = () => { Storage.prototype.setItem = originalSetItem; };
  });
  const beforeOpen = await snapshot();
  await activate(graphToggle()); await assertNodeIds(ids);
  assert.equal(await node(ids[0]).textContent(), await node(ids[1]).textContent(), "Duplicate expressions have the same visual label");
  await expect(node(ids[0])).toHaveAttribute("aria-label", `ブロック 1: 3（ID: ${ids[0]}）へ移動`);
  await expect(node(ids[1])).toHaveAttribute("aria-label", `ブロック 2: 3（ID: ${ids[1]}）へ移動`);
  await selectNode(ids[1]);
  await node(ids[0]).press("Enter"); await assertLocated(ids[0]);
  await node(ids[1]).press("Space"); await assertLocated(ids[1]);
  assert.deepEqual(await snapshot(), beforeOpen, "Open, same-label selection, Enter and Space cannot calculate or persist");
  await screenshot(prefix + "-graph-selected-card", currentScenario.width, false);
  await activate(card(ids[1]).getByRole("button", { name: "選択ブロックの計算式を編集", exact: true }));
  await expect(card(ids[1]).getByLabel("計算式", { exact: true })).toBeFocused();

  await card(ids[0]).getByLabel("計算式", { exact: true }).fill("4");
  await expect(card(ids[0]).locator(".block-status")).toHaveAttribute("data-state-kind", "changed");
  await expect(card(ids[2]).locator(".block-status")).toHaveAttribute("data-state-kind", "affected");
  await expect(card(ids[3]).locator(".block-status")).toHaveAttribute("data-state-kind", "affected");
  const beforeNavigation = await snapshot();
  await activate(panel().getByRole("button", { name: "図を拡大", exact: true }));
  await expect(panel().locator(".dependency-graph-tools")).toContainText("125%");
  await activate(panel().getByRole("button", { name: "図を縮小", exact: true }));
  await expect(panel().locator(".dependency-graph-tools")).toContainText("100%");
  await activate(graphToggle()); await expect(panel()).toHaveCount(0);
  await activate(graphToggle()); await assertNodeIds(ids);
  await selectNode(ids[3]); await activate(detailButton(panel(), 4));
  await expect(panel().locator(".block-diagnostic-details")).toContainText("変更の影響");
  await activate(exportToggle()); await expect(source()).toHaveAttribute("readonly", "");
  await assertSourceAndSvg(ids); await copySource();
  assert.deepEqual(await snapshot(), beforeNavigation, "Graph open/close, zoom, node/detail selection and export cannot calculate, change validity or save");
  assert.deepEqual(await page.evaluate(() => window.__graphStorageWrites), [], "Graph operations must not write even an unchanged storage payload");
  await activate(exportToggle());
  await passed(prefix + ": real SVG maps duplicate labels to raw IDs; mouse/touch and keyboard selection focus cards, explicit edit alone focuses input, and graph operations leave results/history/storage untouched");

  await card(ids[0]).getByLabel("計算式", { exact: true }).fill("1/0");
  await activate(dialog.getByRole("button", { name: "メモ全体を再計算", exact: true }));
  await expect(card(ids[0]).locator(".block-status")).toHaveAttribute("data-state-kind", "error");
  await expect(card(ids[3]).locator(".block-status")).toHaveAttribute("data-state-kind", "blocked");
  await expect(card(ids[4]).locator(".block-status")).toHaveAttribute("data-state-kind", "normal");
  const failedSnapshot = await snapshot();
  await selectNode(ids[3]);
  await expect(panel().locator(".block-status")).toHaveAttribute("data-state-kind", "blocked");
  if (await detailButton(panel(), 4).getAttribute("aria-expanded") !== "true") await activate(detailButton(panel(), 4));
  await activate(detailButton(card(ids[3]), 4));
  assert.equal(await panel().locator(".block-diagnostic-details").textContent(), await card(ids[3]).locator(".block-diagnostic-details").textContent(), "Graph selection reuses the complete existing card diagnosis");
  await activate(exportToggle()); await assertSourceAndSvg(ids); await copySource(); await activate(exportToggle());
  await panel().locator(".block-diagnostic-details h4").scrollIntoViewIfNeeded();
  await screenshot(prefix + "-graph-error-detail", currentScenario.width, false);
  await activate(panel().locator(".block-diagnostic-details").getByRole("button", { name: "ブロック 1: 1/0へ移動", exact: true }).first());
  await assertLocated(ids[0]);
  assert.deepEqual(await snapshot(), failedSnapshot, "Error detail/source navigation cannot retry calculations or change retained results");
  assert.deepEqual(await storage(), storedBaseline, "Failed draft and all graph actions remain unsaved");
  await activate(dialog.getByRole("button", { name: "キャンセル", exact: true }));

  await open(); await activate(graphToggle()); await assertNodeIds(ids); await selectNode(ids[1]);
  await activate(card(ids[1]).getByRole("button", { name: "計算ブロックを上へ移動", exact: true }));
  await expect(cards().first()).toHaveAttribute("data-block-id", ids[1]);
  await assertNodeIds(ids); await selectNode(ids[1]);
  await expect(node(ids[1])).toHaveAttribute("aria-label", `ブロック 1: 3（ID: ${ids[1]}）へ移動`);
  await expect(panel().locator(".dependency-graph-selection")).toContainText("選択中: ブロック 1");
  await activate(card(ids[1]).getByRole("button", { name: "計算ブロックを削除", exact: true }));
  await assertNodeIds(ids.filter(id => id !== ids[1]));
  await expect(panel().getByText("選択したブロックは削除されています。", { exact: true })).toBeVisible();
  await expect(panel().locator(".dependency-graph-selection")).toHaveCount(0);
  await expect(dialog.locator(".block-graph-selected")).toHaveCount(0);
  await selectNode(ids[0]); await expect(card(ids[0]).getByLabel("計算式", { exact: true })).toHaveValue("3");
  await activate(dialog.getByRole("button", { name: "キャンセル", exact: true }));
  assert.deepEqual(await storage(), storedBaseline);
  assert.deepEqual(await page.evaluate(() => window.__graphStorageWrites), []);
  await page.evaluate(() => window.__restoreGraphStorage());
  await passed(prefix + ": raw-ID selection survives same-label reorder and selected-node deletion fails safely without selecting another block or saving the draft");

  for (const theme of ["light", "dark"]) {
    await page.getByLabel("テーマ", { exact: true }).selectOption(theme);
    await open(); await page.evaluate(() => document.documentElement.style.fontSize = "200%");
    await activate(graphToggle()); await assertNodeIds(ids);
    await expect(panel().getByRole("button", { name: "図を拡大", exact: true })).toBeVisible();
    for (const name of ["図を縮小", "図を拡大"]) {
      const size = await panel().getByRole("button", { name, exact: true }).boundingBox();
      assert.ok(size && size.width >= 44 && size.height >= 44, "Graph zoom retains 44px touch targets");
    }
    const scroll = panel().getByLabel("図のスクロール領域", { exact: true });
    await scroll.scrollIntoViewIfNeeded();
    const bounds = await scroll.boundingBox();
    assert.ok(bounds && bounds.width <= currentScenario.width && bounds.height <= currentScenario.height * .65 + 2, "Large diagram is bounded by its own scroll viewport");
    await scroll.evaluate(element => { element.scrollLeft = element.scrollWidth; element.scrollTop = element.scrollHeight; });
    await assertHorizontalFit();
    await scroll.evaluate(element => { element.scrollLeft = 0; element.scrollTop = 0; });
    await screenshot(prefix + "-graph-" + theme + "-enlarged", currentScenario.width, false);
    await selectNode(ids[2]);
    await screenshot(prefix + "-graph-" + theme + "-enlarged-selection", currentScenario.width, false);
    await activate(detailButton(panel(), 3));
    await expect(panel().locator(".block-diagnostic-details")).toBeVisible();
    await assertHorizontalFit();
    await page.evaluate(() => document.documentElement.style.fontSize = "");
    await activate(dialog.getByRole("button", { name: "キャンセル", exact: true }));
  }
  await passed(prefix + ": graph, bounded scrolling, labels, zoom and selected diagnostics fit both themes at 200% root text size in each configured viewport");

  await stage(prefix + ": dependency-graph-limit-fallback");
  // 24-node DAG has 276 definite edges: valid analysis, beyond the 256-edge
  // drawing budget. This is a deterministic fallback, not a network failure.
  const denseIds = Array.from({ length: 24 }, (_, index) => `dense-graph-${index}`);
  const dense = { ...note, id: "dense-graph-note", title: "Synthetic graph drawing limit",
    blocks: denseIds.map((id, index) => calculation(id, index ? Array.from({ length: index }, (_, slot) => `@{${slot + 1}}`).join("+") : "1", denseIds.slice(0, index))) };
  await seed(dense); await open(dense.title);
  const beforeFallback = await snapshot();
  await activate(graphToggle());
  await expect(panel()).toContainText("図の表示上限");
  await expect(panel().locator("svg")).toHaveCount(0);
  await activate(panel().getByText("ブロック一覧から選ぶ", { exact: true }));
  await expect(panel().locator(".dependency-graph-list button")).toHaveCount(24);
  await activate(panel().locator(".dependency-graph-list button").last());
  await assertLocated(denseIds[23]);
  await activate(exportToggle()); await expect(source()).toHaveAttribute("readonly", "");
  assert.equal((await source().inputValue()).split("\n").filter(line => line.includes(" -->")).length, 276);
  await copySource();
  assert.deepEqual(await snapshot(), beforeFallback, "Drawing fallback/list/copy cannot evaluate or save an oversized graph");
  await panel().getByText(/図の表示上限/).scrollIntoViewIfNeeded();
  await assertHorizontalFit(); await screenshot(prefix + "-graph-limit-fallback", currentScenario.width, false);
  await activate(dialog.getByRole("button", { name: "キャンセル", exact: true }));
  await passed(prefix + ": graph drawing limit retains accessible block-list navigation and exact Mermaid copy without numerical or persistence side effects");
  await page.evaluate(data => localStorage.setItem("calculation-memo:data", JSON.stringify(data)), original);
  await page.reload(); await selectPanel("notes");
}

async function exerciseCalculationTrials(prefix) {
  await stage(prefix + ": calculation-trial-preview");
  const original = await storage();
  const calculation = (id, expression, references = []) => ({
    id, type: "calculation", expression, displayExpression: expression, result: null, resultText: "", error: null,
    evaluationMode: "block-references", references: { version: 1, entries: references.map((blockId, index) => ({ slot: index + 1, blockId })) },
    syntheticExtra: { preserved: [id, 42] },
  });
  const note = {
    id: "trial-preview-note", type: "plain-calculation", title: "Synthetic trial preview", content: "Synthetic trial preview",
    createdAt: "2026-10-20T00:00:00Z", updatedAt: "2026-10-20T00:00:00Z", calculationPolicy: { version: 1, mode: "manual" },
    blocks: [calculation("a", "100"), calculation("b", "@{1}+50", ["a"]), calculation("c", "@{1}*2", ["b"]),
      calculation("u", "99"), calculation("tiny", "sqrt(2)"),
      { ...calculation("legacy", "x=2"), evaluationMode: "note-variables", references: undefined }],
  };
  await page.evaluate(data => localStorage.setItem("calculation-memo:data", JSON.stringify(data)), { ...original, notes: [note] });
  await page.reload(); await selectPanel("notes");
  let dialog;
  const open = async () => {
    await activate(page.locator(".note-card").filter({ hasText: note.title }).getByRole("button", { name: "編集", exact: true }));
    dialog = page.getByRole("dialog");
  };
  const card = id => dialog.locator(`.block-editor-card[data-block-id=${JSON.stringify(id)}]`);
  const input = id => card(id).getByLabel("計算式", { exact: true });
  const panel = () => dialog.getByRole("region", { name: "試算・差分プレビュー", exact: true });
  const row = id => panel().locator(`[data-trial-block-id=${JSON.stringify(id)}]`);
  const trial = async () => {
    await activate(dialog.getByRole("button", { name: "試算する", exact: true }));
    await expect(panel()).toContainText("試算は未反映です");
  };
  const apply = () => panel().getByRole("button", { name: "結果を反映", exact: true });
  const save = async () => {
    await activate(dialog.getByRole("button", { name: "保存する", exact: true }));
    await expect(page.getByRole("dialog")).toHaveCount(0);
  };
  const read = async () => (await storage()).notes.find(value => value.id === note.id);
  const visibleResults = () => dialog.locator(".block-editor-card.calculation .calculation-live-result").allTextContents();
  await open();
  await activate(dialog.getByRole("button", { name: "メモ全体を再計算", exact: true }));
  await save();
  await expect.poll(async () => (await read()).blocks.map(block => block.result)).toEqual([100, 150, 300, 99, Math.sqrt(2), 2]);
  const confirmed = await read();
  await open(); await input("a").fill("120"); await input("tiny").fill("sqrt(2)+0.00000000000001");
  const held = await visibleResults();
  const storedBefore = await storage();
  await page.evaluate(() => {
    const originalSet = Storage.prototype.setItem;
    window.__trialOriginalSetItem = originalSet;
    window.__trialStorageWrites = 0;
    Storage.prototype.setItem = function(key, value) { if (key === "calculation-memo:data") window.__trialStorageWrites++; return originalSet.call(this, key, value); };
  });
  await trial();
  assert.deepEqual(await visibleResults(), held, "Trial must not change retained draft results");
  assert.deepEqual(await storage(), storedBefore, "Trial must not modify persistent data");
  assert.equal(await page.evaluate(() => window.__trialStorageWrites), 0, "Trial must not even invoke the data save write");
  await expect(row("a")).toContainText("+20"); await expect(row("b")).toContainText("+20"); await expect(row("c")).toContainText("+40");
  await expect(row("u")).toContainText("0（内部値が同じ）");
  await expect(row("a").locator(".block-status")).toHaveAttribute("data-state-kind", "changed");
  await expect(row("b").locator(".block-status")).toHaveAttribute("data-state-kind", "affected");
  await expect(row("c").locator(".block-status")).toHaveAttribute("data-state-kind", "affected");
  await expect(row("u").locator(".block-status")).toHaveAttribute("data-state-kind", "normal");
  const tinyDelta = (Math.sqrt(2) + 0.00000000000001) - Math.sqrt(2);
  assert.ok(tinyDelta > 0);
  await expect(row("tiny")).toContainText("+" + String(tinyDelta));
  await expect(row("tiny")).toContainText(String(Math.sqrt(2) + 0.00000000000001));
  await expect(apply()).toBeEnabled();
  await row("a").scrollIntoViewIfNeeded();
  await screenshot(prefix + "-trial-success", currentScenario.width, false);
  await passed(prefix + ": trial preserves held results and makes zero storage writes; internal-value deltas and direct/affected/unrelated states stay distinct");

  await activate(row("b").getByRole("button", { name: "ブロック 2 の状態とエラー詳細", exact: true }));
  await expect(row("b").locator(".block-diagnostic-details")).toContainText("未反映");
  await activate(row("b").locator(".block-diagnostic-details").getByRole("button", { name: /^ブロック 1:.*へ移動$/ }).first());
  await expect(card("a")).toBeFocused();
  await expect(card("a")).toHaveClass(/block-graph-selected/);
  await input("a").fill("121");
  await expect(panel()).toContainText("失効"); await expect(apply()).toBeDisabled();
  await input("a").fill("120"); await trial();
  await activate(card("u").getByRole("button", { name: "計算ブロックを上へ移動", exact: true }));
  await expect(apply()).toBeDisabled();
  await activate(card("u").getByRole("button", { name: "計算ブロックを下へ移動", exact: true })); await trial();
  await activate(dialog.getByRole("button", { name: "＋ 文章", exact: true }));
  await expect(apply()).toBeDisabled();
  await activate(dialog.locator(".block-editor-card.text").getByRole("button", { name: "文章ブロックを削除", exact: true }));
  await expect(apply()).toBeDisabled(); await trial();
  assert.deepEqual(await visibleResults(), held);
  assert.equal(await page.evaluate(() => window.__trialStorageWrites), 0);
  await activate(apply());
  await expect(panel()).toHaveCount(0);
  await expect(dialog.getByRole("button", { name: "試算する", exact: true })).toBeFocused();
  await expect(card("a").locator(".calculation-live-result")).toContainText("120");
  await expect(card("b").locator(".calculation-live-result")).toContainText("170");
  await expect(card("c").locator(".calculation-live-result")).toContainText("340");
  assert.deepEqual(await storage(), storedBefore, "Explicit result apply affects only the editor draft until Save");
  assert.equal(await page.evaluate(() => window.__trialStorageWrites), 0);
  await save();
  await expect.poll(async () => (await read()).blocks[0].result).toBe(120);
  const saved = await read();
  assert.deepEqual(saved.blocks.map(block => block.result), [120, 170, 340, 99, Math.sqrt(2) + 0.00000000000001, 2]);
  assert.deepEqual(saved.blocks.map(block => block.syntheticExtra), confirmed.blocks.map(block => block.syntheticExtra));
  assert.ok(await page.evaluate(() => window.__trialStorageWrites) > 0, "The separate Save operation writes data");
  await page.evaluate(() => { Storage.prototype.setItem = window.__trialOriginalSetItem; delete window.__trialOriginalSetItem; });
  await page.reload(); await selectPanel("notes"); await open();
  await expect(panel()).toHaveCount(0);
  assert.deepEqual((await read()).blocks, saved.blocks);
  await passed(prefix + ": edit/reorder/add/delete invalidate trial; shared i navigation is safe; explicit apply and later save preserve precision/extras and reload discards trial state");

  // A failed legacy phase still runs its remaining scope statements, but prevents
  // all ID numeric attempts. A separate ID failure must not become a success.
  await input("legacy").fill("x=1/0"); const beforeFailure = await visibleResults();
  await trial(); await expect(apply()).toBeDisabled();
  await expect(row("legacy")).toContainText("試算失敗");
  for (const id of ["a", "b", "c", "u", "tiny"]) await expect(row(id)).toContainText("数値評価は未試行");
  assert.deepEqual(await visibleResults(), beforeFailure); assert.deepEqual((await read()).blocks, saved.blocks);
  await input("legacy").fill("x=2"); await input("a").fill("1/0"); await trial();
  await expect(apply()).toBeDisabled(); await expect(row("a")).toContainText("試算失敗");
  await expect(row("b")).toContainText("数値評価は未試行"); await expect(row("c")).toContainText("数値評価は未試行");
  await activate(row("a").getByRole("button", { name: "ブロック 1 の状態とエラー詳細", exact: true }));
  await expect(row("a").locator(".block-diagnostic-details")).toContainText("今回の試算で確認（未反映）");
  await row("a").locator(".block-diagnostic-details h4").evaluate(element => element.scrollIntoView({ block: "center" }));
  await screenshot(prefix + "-trial-failure", currentScenario.width, false);
  assert.deepEqual((await read()).blocks, saved.blocks);
  await activate(dialog.getByRole("button", { name: "キャンセル", exact: true }));
  await passed(prefix + ": legacy and ID numeric failure keep all existing values and distinguish failed versus unattempted work with shared trial diagnostics");

  for (const theme of ["light", "dark"]) {
    await page.getByLabel("テーマ", { exact: true }).selectOption(theme);
    await open(); await input("a").fill("130"); await trial();
    await page.evaluate(() => document.documentElement.style.fontSize = "200%");
    await row("a").scrollIntoViewIfNeeded();
    await assertHorizontalFit();
    const geometry = await panel().evaluate(element => ({ width: element.clientWidth, scroll: element.scrollWidth, cards: [...element.querySelectorAll("[data-trial-block-id]")].map(card => ({ width: card.clientWidth, scroll: card.scrollWidth })) }));
    assert.ok(geometry.scroll <= geometry.width + 1, "Trial panel must not overflow horizontally");
    assert.ok(geometry.cards.every(card => card.scroll <= card.width + 1), "Trial comparison cards must wrap long values/text");
    await screenshot(prefix + "-trial-" + theme + "-enlarged", currentScenario.width, false);
    await row("a").getByText("数値差分", { exact: true }).evaluate(element => element.scrollIntoView({ block: "center" }));
    await screenshot(prefix + "-trial-" + theme + "-enlarged-delta", currentScenario.width, false);
    const info = row("a").getByRole("button", { name: "ブロック 1 の状態とエラー詳細", exact: true });
    await activate(info); await expect(info).toHaveAttribute("aria-expanded", "true");
    await info.focus(); await page.keyboard.press("Enter"); await expect(info).toHaveAttribute("aria-expanded", "false");
    await page.evaluate(() => document.documentElement.style.fontSize = "");
    await activate(dialog.getByRole("button", { name: "キャンセル", exact: true }));
  }
  await passed(prefix + ": trial cards fit light/dark at 200% text with mobile touch and keyboard-accessible diagnostics");
  await page.evaluate(data => localStorage.setItem("calculation-memo:data", JSON.stringify(data)), original);
  await page.reload(); await selectPanel("notes");
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
    ["mode", { ...good, id: "bad", blocks: [{ id: "c", type: "calculation", expression: "2+3", evaluationMode: "future" }] }],
    ["missing", { ...good, id: "bad", blocks: [{ id: "t", type: "text" }] }],
    ["multiple", { ...good, id: "bad", blocks: [{ id: "f", type: "geometry" }, { id: "t", type: "text" }, { id: "t", type: "text" }] }],
  ];
  const readRaw = () => page.evaluate(() => localStorage.getItem("calculation-memo:data"));
  for (const [name, bad] of variants) {
    const raw = JSON.stringify({ ...original, notes: [good, bad] }, null, 2);
    await page.evaluate((raw) => localStorage.setItem("calculation-memo:data", raw), raw);
    await page.reload();
    const banner = page.getByRole("alert");
    await expect(banner.getByRole("heading")).toHaveText("このメモは保護されています");
    await expect(page.locator("#calculator")).toHaveAttribute("inert", "");
    await expect(banner).toContainText("保存とメモの編集を停止");
    const expectedReason = name === "duplicate" ? "メモまたはブロックIDの重複" : name === "mode" ? "対応していない計算モード" : ["malformed", "missing"].includes(name) ? "保存データの構造異常" : "対応していないブロック形式";
    await expect(banner.locator(".protection-caption")).toHaveText(expectedReason);
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
    const downloaded = page.waitForEvent("download");
    await activate(banner.getByRole("button", { name: "原本JSONをエクスポート", exact: true }));
    const download = await downloaded;
    assert.equal(download.suggestedFilename(), "calculator-memo-original.json");
    assert.deepEqual(await readFile(await download.path()), Buffer.from(raw, "utf8"), "Downloaded original JSON must match captured UTF-8 bytes");
    assert.equal(await readRaw(), raw, "Export cannot change storage");
    await activate(banner.getByRole("button", { name: "保存データを初期化", exact: true }));
    await expect(page.getByRole("dialog")).toContainText("この操作は取り消せません");
    await activate(page.getByRole("dialog").getByRole("button", { name: "キャンセル", exact: true }));
    assert.equal(await readRaw(), raw, "Cancel reset cannot overwrite");
    if (name === "mixed") {
      await activate(banner.locator("summary"));
      for (const theme of ["light", "dark"]) {
        await page.getByLabel("テーマ", { exact: true }).selectOption(theme);
        await screenshot(prefix + "-protected-" + theme);
        const stress = await page.addStyleTag({ content: ".storage-recovery h2 { font-size: 36px !important; } .storage-recovery p, .storage-recovery summary, .storage-recovery button { font-size: 24px !important; }" });
        await screenshot(prefix + "-protected-" + theme + "-large-text");
        await stress.evaluate((element) => element.remove());
      }
      assert.equal(await readRaw(), raw, "Theme and enlarged-text checks cannot persist unsafe data");
    }
    await page.reload();
    await expect(banner).toBeVisible();
    assert.equal(await readRaw(), raw, "Reload cannot normalize/drop original blocks");
    await passed(prefix + ": " + name + " blocks protected across header/keyboard/reset-cancel/copy/exact-file-export/reload");
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
  await activate(dialog.getByRole("button", { name: "＋ 旧変数計算", exact: true }));
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
  await exerciseBlockExtraFields(prefix);
  await exerciseBlockReferences(prefix);
  await exerciseDefaultIdCalculations(prefix);
  await exerciseCalculationDiagnostics(prefix);
  await exerciseDependencyGraphNavigation(prefix);
  await exerciseCalculationTrials(prefix);
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
