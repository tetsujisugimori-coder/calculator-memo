import { chromium, webkit } from "playwright";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const base = process.env.BACKUP_TEST_URL || "http://127.0.0.1:4173/calculator-memo/";
const key = "calculation-memo:data";
const output = [];
for (const [name, engine] of [["chromium", chromium], ["webkit", webkit]]) {
  const browser = await engine.launch({ headless: true });
  try {
    for (const width of [375, 390]) for (const theme of ["light", "dark"]) {
      const context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, acceptDownloads: true });
      try {
        const page = await context.newPage();
        const problems = []; page.on("pageerror", e => problems.push(String(e)));
        await page.goto(base); await page.waitForSelector('[aria-label="電卓"]');
        await page.waitForFunction(key => localStorage.getItem(key) !== null, key);
        const raw = JSON.stringify({ version: 1, history: [], notes: [], settings: { theme, activePanel: "history" }, future: { note: "日本語😀\n未変換" } });
        await page.evaluate(({ key, raw }) => localStorage.setItem(key, raw), { key, raw });
        await page.reload(); await page.waitForTimeout(250);
        const before = await page.evaluate(key => localStorage.getItem(key), key);
        await page.evaluate(() => document.documentElement.style.fontSize = "200%");
        await page.getByRole("button", { name: "データのバックアップ" }).tap();
        const dialog = page.getByRole("dialog", { name: "データのバックアップ" });
        await dialog.getByText("現行ローダーで受入可能", { exact: false }).waitFor();
        const geometry = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, page: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) }));
        assert.ok(geometry.page <= geometry.viewport, JSON.stringify(geometry));
        const action = dialog.getByRole("button", { name: "JSONを書き出す" });
        await action.scrollIntoViewIfNeeded();
        const box = await action.boundingBox(); assert.ok(box && box.height >= 44 && box.width >= 44);
        const [download] = await Promise.all([page.waitForEvent("download"), action.tap()]);
        assert.match(download.suggestedFilename(), /^calculator-memo-backup-\d{8}-\d{6}\.json$/);
        const json = JSON.parse(await readFile(await download.path(), "utf8"));
        assert.equal(json.entries.length, 1); assert.equal(json.entries[0].key, key); assert.equal(json.entries[0].raw, before);
        assert.equal(await page.evaluate(key => localStorage.getItem(key), key), before);
        assert.match(await dialog.innerText(), /保存完了は確認できません/);
        const other = await context.newPage(); await other.goto(base); await other.evaluate(key => localStorage.setItem(key, '{"version":999}'), key);
        await dialog.getByText("再取得してください", { exact: false }).waitFor();
        assert.equal(await action.isDisabled(), true); assert.deepEqual(problems, []);
        output.push({ engine: name, width, theme, font: "200%", download: "observed", source: "unchanged before independent writer" });
      } finally { await context.close(); }
    }
  } finally { await browser.close(); }
}
console.log(JSON.stringify(output, null, 2));
