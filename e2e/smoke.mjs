// Synthetic-only PR GUI regression harness. Run from the repository root.
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { once } from "node:events";
import { fileURLToPath } from "node:url";

process.chdir(fileURLToPath(new URL("../", import.meta.url)));

const output = "gui-evidence";
await mkdir(output, { recursive: true });
const metadata = {
  schemaVersion: 1, status: "running", stage: "provenance", checks: [], errors: [],
  expectedSha: process.env.EXPECTED_SHA || null,
  branch: process.env.PR_BRANCH || null, pr: process.env.PR_NUMBER || null,
  run: process.env.GITHUB_RUN_ID || "local", attempt: process.env.GITHUB_RUN_ATTEMPT || "1",
  startedAt: new Date().toISOString(), node: process.version,
  runner: { os: process.env.RUNNER_OS, image: process.env.ImageOS, version: process.env.ImageVersion },
  syntheticDataOnly: true, productionDeployed: false,
  method: "Playwright Chromium on loopback-only Vite Pages preview; not interactive Cloud Browser",
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
async function stage(name) { metadata.stage = name; await persist(); }
async function passed(name) { metadata.checks.push(name); console.log("PASS:", name); await persist(); }
async function screenshot(name) {
  // Test-only visual label, removed immediately after capture; not an app feature.
  await page.evaluate((identity) => {
    const banner = document.createElement("div");
    banner.id = "gui-test-overlay";
    banner.textContent = "TEST OVERLAY | " + identity;
    banner.style.cssText = "position:fixed;bottom:0;left:0;right:0;z-index:99999;background:#101820;color:#fff;font:11px monospace;padding:8px;overflow-wrap:anywhere;pointer-events:none";
    document.body.append(banner);
  }, metadata.branch + " | SHA " + metadata.sha + " | run " + metadata.run + "/" + metadata.attempt);
  try { await page.screenshot({ path: output + "/" + name + ".png", fullPage: true }); }
  finally { await page.locator("#gui-test-overlay").evaluate((element) => element.remove()); }
}
const button = (name) => page.getByRole("button", { name, exact: true });
async function selectPanel(panel) {
  const tab = page.getByRole("tab", { name: panel === "notes" ? /^メモ/ : /^履歴/ });
  if (await tab.isVisible()) {
    await tab.click();
    await expect(tab).toHaveAttribute("aria-selected", "true");
  }
  await expect(page.locator("#" + panel + "-panel")).toBeVisible();
}
async function storage() { return page.evaluate(() => JSON.parse(localStorage.getItem("calculation-memo:data"))); }
async function exercise(width) {
  assertOwnedServer();
  const prefix = width + "px";
  await stage(prefix + ": browser-context");
  browserErrors = [];
  context = await browser.newContext({ viewport: { width, height: 1000 }, locale: "ja-JP", timezoneId: "Asia/Tokyo", colorScheme: "light", serviceWorkers: "block" });
  await context.route("**/*", (route) => {
    if (new URL(route.request().url()).origin !== origin) {
      browserErrors.push({ type: "blocked-external-request", url: route.request().url() });
      return route.abort();
    }
    return route.continue();
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
  await stage(prefix + ": arithmetic-history-error-recovery");
  const cases = [
    { keys: ["1", "2", "足す", "3", "4"], expression: "12 ＋ 34", result: "46" },
    { keys: ["9", "引く", "4"], expression: "9 − 4", result: "5" },
    { keys: ["7", "掛ける", "6"], expression: "7 × 6", result: "42" },
    { keys: ["8", "割る", "2"], expression: "8 ÷ 2", result: "4" },
  ];
  for (const [index, sample] of cases.entries()) {
    await button("すべて消去").click();
    for (const key of sample.keys) await button(key).click();
    await button("計算する").click();
    await expect(page.locator(".lcd-result")).toHaveText(sample.result);
    await expect(page.locator(".lcd-expression")).toHaveText(sample.expression);
    await selectPanel("history");
    await expect(page.locator(".history-item")).toHaveCount(index + 1);
    await expect(page.locator(".history-item").first()).toContainText("= " + sample.result);
  }
  await button("すべて消去").click();
  for (const key of ["1", "割る", "0", "計算する"]) await button(key).click();
  await expect(page.locator(".lcd-result")).toHaveText("Error");
  await expect(page.locator(".history-item")).toHaveCount(4);
  await expect(button("単独計算メモを作成")).toBeDisabled();
  await button("すべて消去").click();
  await expect(page.locator(".lcd-result")).toHaveText("0");
  const history = page.locator(".history-item").filter({ has: page.locator(".history-formula span", { hasText: "12 ＋ 34" }) });
  await history.getByRole("button", { name: "戻す", exact: true }).click();
  await expect(page.locator(".lcd-expression")).toHaveText("12 ＋ 34");
  await expect(page.locator(".lcd-result")).toHaveText("34"); // Editing state, not recomputation.
  await expect(button("単独計算メモを作成")).toBeDisabled();
  await passed(prefix + ": all four arithmetic operations, four history entries, error recovery, editable history restore");
  await screenshot(prefix + "-arithmetic-history");
  await stage(prefix + ": single-memo-save-cancel-edit");
  await history.getByRole("button", { name: "単独計算メモ", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("タイトル", { exact: false }).fill("Synthetic single memo");
  await dialog.getByLabel("前提・補足", { exact: false }).fill("Synthetic data only.");
  await dialog.getByRole("button", { name: "保存する", exact: true }).click();
  await selectPanel("notes");
  const single = page.locator(".note-card").filter({ hasText: "Synthetic single memo" });
  await expect(single).toBeVisible();
  await expect(single).toContainText("= 46");
  await single.getByRole("button", { name: "編集", exact: true }).click();
  await dialog.getByLabel("タイトル", { exact: false }).fill("Discard this synthetic edit");
  await dialog.getByRole("button", { name: "キャンセル", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(single).toBeVisible();
  await expect(page.getByText("Discard this synthetic edit")).toHaveCount(0);
  await single.getByRole("button", { name: "編集", exact: true }).click();
  await dialog.getByLabel("タイトル", { exact: false }).fill("Synthetic single memo edited");
  await dialog.getByRole("button", { name: "保存する", exact: true }).click();
  await expect(single).toContainText("Synthetic single memo edited");
  await passed(prefix + ": single memo saved, cancelled edit discarded, subsequent edit saved");
  await stage(prefix + ": block-memo-save");
  await page.locator("#notes-panel").getByRole("button", { name: "＋ 新規作成", exact: true }).click();
  await dialog.getByRole("button").filter({ hasText: "BLOCKS / MARKDOWN" }).click();
  await dialog.getByLabel("タイトル", { exact: false }).fill("Synthetic block memo");
  await dialog.getByRole("button", { name: "＋ 文章", exact: true }).click();
  await dialog.getByLabel("Markdown文章").fill("Synthetic block text.");
  await dialog.getByRole("button", { name: "＋ 計算", exact: true }).click();
  await dialog.getByLabel("計算式", { exact: true }).fill("2*(5+3)");
  await expect(dialog.locator(".calculation-live-result strong")).toHaveText("2 × (5 ＋ 3) = 16");
  await dialog.getByRole("button", { name: "保存する", exact: true }).click();
  await expect(page.locator(".note-card")).toHaveCount(2);
  await expect(page.locator(".note-card").filter({ hasText: "Synthetic block memo" })).toBeVisible();
  await passed(prefix + ": block memo text and calculation saved");
  await stage(prefix + ": reload-persistence-visible-panels");
  await expect.poll(storage).toMatchObject({ notes: [{ title: "Synthetic block memo" }, { title: "Synthetic single memo edited" }] });
  const before = await storage();
  await page.reload();
  await selectPanel("notes");
  await expect(page.locator(".note-card")).toHaveCount(2);
  await expect(single).toBeVisible();
  await expect(page.locator(".note-card").filter({ hasText: "Synthetic block memo" })).toBeVisible();
  const after = await storage();
  assert.deepEqual(after.notes, before.notes);
  assert.deepEqual(after.history, before.history);
  await screenshot(prefix + "-persisted-memos");
  await single.getByRole("button", { name: "詳細", exact: true }).click();
  await expect(dialog).toContainText("= 46");
  await dialog.getByRole("button", { name: "閉じる", exact: true }).last().click();
  await expect(dialog).toHaveCount(0);
  await selectPanel("history");
  await expect(page.locator(".history-item")).toHaveCount(4);
  await expect(page.locator(".history-item").first()).toBeVisible();
  await screenshot(prefix + "-persisted-history");
  await passed(prefix + ": both memos/history preserved across reload; panels and detail modal actively exercised");
  assert.deepEqual(browserErrors, [], "Browser errors, HTTP errors, or unexpected external requests");
  await passed(prefix + ": zero browser/runtime/network errors");
  await context.tracing.stop({ path: output + "/" + prefix + "-trace.zip" });
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
    if (startupOutput.includes(base)) serverReady = true;
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
  browser = await playwright.chromium.launch();
  metadata.browserVersion = browser.version();
  for (const width of [1365, 390]) await exercise(width);
  assertOwnedServer();
  metadata.status = "passed"; metadata.stage = "complete";
} catch (error) {
  metadata.status = "failed";
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
