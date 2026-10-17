// Temporary, synthetic-only GUI proof. Never starts a public server or deploys.
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import path from "node:path";

const requireTool = createRequire(path.join(process.env.GUI_TOOLS, "package.json"));
const { chromium, expect } = requireTool("@playwright/test");
const output = "gui-evidence";
await mkdir(output, { recursive: true });
const sha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
assert.equal(sha, process.env.EXPECTED_SHA, "Checkout must equal the exact PR head");
const origin = "http://127.0.0.1:4183";
const base = origin + "/calculator-memo/";
const metadata = {
  sha, branch: process.env.PR_BRANCH, pr: process.env.PR_NUMBER,
  run: process.env.GITHUB_RUN_ID, startedAt: new Date().toISOString(),
  method: "Automated Playwright Chromium, same-runner loopback-only Vite Pages preview",
  syntheticDataOnly: true, productionDeployed: false, checks: [], status: "running",
};
const log = createWriteStream(output + "/preview.log");
const server = spawn(process.execPath, [
  "node_modules/vite/bin/vite.js", "preview", "--config", "vite.pages.config.ts",
  "--host", "127.0.0.1", "--port", "4183", "--strictPort",
], { stdio: ["ignore", "pipe", "pipe"] });
server.stdout.pipe(log);
server.stderr.pipe(log);
let browser;
let context;
let page;
const errors = [];
async function record(check) {
  metadata.checks.push(check);
  console.log("PASS:", check);
}
async function screenshot(name) {
  await page.evaluate(({ branch, sha, marker }) => {
    document.getElementById("verification-overlay")?.remove();
    const banner = document.createElement("div");
    banner.id = "verification-overlay";
    banner.textContent = "TEST OVERLAY | " + branch + " | SHA " + sha + " | served marker: " + marker;
    banner.style.cssText = "position:fixed;bottom:0;left:0;right:0;z-index:99999;background:#101820;color:#fff;font:11px monospace;padding:8px;overflow-wrap:anywhere;pointer-events:none";
    document.body.append(banner);
  }, { branch: metadata.branch, sha, marker: metadata.servedMarker.marker });
  await page.screenshot({ path: output + "/" + name + ".png", fullPage: true });
}
try {
  await expect.poll(async () => {
    try { return (await fetch(base)).status; } catch { return 0; }
  }, { timeout: 30000 }).toBe(200);
  browser = await chromium.launch();
  context = await browser.newContext({ viewport: { width: 1365, height: 1000 }, locale: "ja-JP" });
  await context.route("**/*", (route) =>
    new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
  page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  await page.goto(base);
  const marker = await page.evaluate(async () => {
    const response = await fetch("./pr-gui-verification.json", { cache: "no-store" });
    if (!response.ok) throw new Error("Branch marker not served");
    return response.json();
  });
  assert.equal(marker.branch, process.env.PR_BRANCH);
  assert.equal(marker.marker, "calculator-memo-pr-gui-20261017-a7f31c");
  metadata.servedMarker = marker;
  await record("Browser fetched exact branch-only marker from running static preview");
  await expect(page.getByRole("button", { name: "計算する", exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("calculation-memo:data"))).not.toBeNull();
  const button = (name) => page.getByRole("button", { name, exact: true });
  for (const name of ["1", "2", "足す", "3", "4", "計算する"]) await button(name).click();
  await expect(page.locator(".lcd-result")).toHaveText("46");
  await expect(page.locator(".history-item")).toHaveCount(1);
  await expect(page.locator(".history-formula")).toContainText("46");
  await record("GUI arithmetic 12 + 34 = 46 and history entry");
  await screenshot("01-arithmetic-history-desktop");
  await button("すべて消去").click();
  await page.locator(".history-item").getByRole("button", { name: "戻す", exact: true }).click();
  await expect(page.locator(".lcd-result")).toHaveText("46");
  await record("History restore");
  await button("単独計算メモを作成").click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("タイトル", { exact: false }).fill("Synthetic PR GUI memo");
  await dialog.getByLabel("前提・補足", { exact: false }).fill("Synthetic data only. No real user data.");
  await dialog.getByRole("button", { name: "保存する", exact: true }).click();
  await expect(page.locator(".note-card")).toHaveCount(1);
  await expect(page.locator(".note-card")).toContainText("Synthetic PR GUI memo");
  await record("Create and save synthetic single-calculation memo");
  await page.locator("#notes-panel").getByRole("button", { name: "＋ 新規作成", exact: true }).click();
  await dialog.getByRole("button").filter({ hasText: "BLOCKS / MARKDOWN" }).click();
  await dialog.getByLabel("タイトル", { exact: false }).fill("Synthetic block memo");
  await dialog.getByRole("button", { name: "＋ 文章", exact: true }).click();
  await dialog.getByLabel("Markdown文章").fill("Synthetic block text for PR verification.");
  await dialog.getByRole("button", { name: "保存する", exact: true }).click();
  await expect(page.locator(".note-card")).toHaveCount(2);
  await expect.poll(() => page.evaluate(() =>
    JSON.parse(localStorage.getItem("calculation-memo:data")).notes.length)).toBe(2);
  const beforeReload = await page.evaluate(() => JSON.parse(localStorage.getItem("calculation-memo:data")));
  await page.reload();
  await expect(page.locator(".note-card")).toHaveCount(2);
  await expect(page.locator(".history-item")).toHaveCount(1);
  const afterReload = await page.evaluate(() => JSON.parse(localStorage.getItem("calculation-memo:data")));
  assert.deepEqual(afterReload.notes, beforeReload.notes);
  assert.deepEqual(afterReload.history, beforeReload.history);
  await expect(page.locator(".note-list")).toContainText("Synthetic PR GUI memo");
  await expect(page.locator(".note-list")).toContainText("Synthetic block memo");
  await record("Block memo creation and both memos/history survive reload unchanged");
  await screenshot("02-persisted-memos-desktop");
  for (const width of [768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await expect(page.locator(".calculator-shell")).toBeVisible();
    await screenshot("03-persisted-" + width);
  }
  await record("Rendered evidence captured at desktop, 768px, and 390px; not full mobile acceptance");
  assert.deepEqual(errors, [], "No browser page or console errors");
  await record("Zero browser page/console errors");
  metadata.status = "passed";
} catch (error) {
  metadata.status = "failed";
  metadata.failure = String(error.stack || error);
  if (page) await page.screenshot({ path: output + "/failure.png", fullPage: true }).catch(() => {});
  throw error;
} finally {
  metadata.errors = errors;
  metadata.finishedAt = new Date().toISOString();
  await writeFile(output + "/provenance.json", JSON.stringify(metadata, null, 2) + "\n");
  if (context) await context.tracing.stop({ path: output + "/trace.zip" }).catch(() => {});
  if (browser) await browser.close();
  server.kill("SIGTERM");
  log.end();
}
