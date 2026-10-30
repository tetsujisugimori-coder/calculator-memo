import { chromium, webkit } from "playwright";
import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";

const base = process.env.BACKUP_TEST_URL || "http://127.0.0.1:4173/calculator-memo/";
const key = "calculation-memo:data";
const output = [];
await mkdir("gui-evidence", { recursive: true });
const record = { expectedSha: process.env.EXPECTED_SHA || null, run: process.env.GITHUB_RUN_ID || "local", attempt: process.env.GITHUB_RUN_ATTEMPT || "local", expectedCases: 8, status: "running", cases: output };
const save = () => writeFile("gui-evidence/backup-results.json", JSON.stringify(record, null, 2) + "\n");
await save();
async function checkLayout(page, dialog, phase) {
  const geometry = await page.evaluate(() => ({ viewport: document.documentElement.clientWidth, page: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) }));
  assert.ok(geometry.page <= geometry.viewport, `${phase}: ${JSON.stringify(geometry)}`);
  const overflow = await dialog.locator(".modal-content").evaluate(content => [content, ...content.querySelectorAll("p, button")].filter(element => element.scrollWidth > element.clientWidth + 1).map(element => ({ tag: element.tagName, text: element.textContent, scroll: element.scrollWidth, client: element.clientWidth })));
  assert.deepEqual(overflow, [], phase);
  for (const label of ["再取得", "JSONを書き出す"]) {
    const control = dialog.getByRole("button", { name: label, exact: true });
    await control.scrollIntoViewIfNeeded();
    const box = await control.boundingBox();
    assert.ok(box && box.height >= 44 && box.width >= 44 && box.x >= 0 && box.x + box.width <= geometry.viewport, `${phase}: ${label}`);
    assert.equal(await control.evaluate(el => { const r = el.getBoundingClientRect(); return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); }), true, `${phase}: reachable ${label}`);
  }
  return geometry;
}
try {
for (const [name, engine] of [["chromium", chromium], ["webkit", webkit]]) {
  const browser = await engine.launch({ headless: true });
  try {
    for (const width of [375, 390]) for (const theme of ["light", "dark"]) {
      const context = await browser.newContext({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2, acceptDownloads: true });
      const current = { engine: name, width, theme, font: "200%", status: "running", startedAt: new Date().toISOString() };
      output.push(current); await save();
      try {
        const page = await context.newPage();
        const problems = []; page.on("pageerror", e => problems.push(String(e)));
        await page.goto(base); await page.waitForSelector('[aria-label="電卓"]');
        await page.waitForFunction(key => localStorage.getItem(key) !== null, key);
        const raw = JSON.stringify({ version: 1, history: [], notes: [], settings: { theme, activePanel: "history" }, future: { note: "日本語😀\n未変換" } });
        await page.evaluate(({ key, raw }) => localStorage.setItem(key, raw), { key, raw });
        await page.reload();
        await page.getByRole("button", { name: "データのバックアップ" }).waitFor();
        await page.waitForFunction(theme => document.documentElement.dataset.theme === theme || document.documentElement.classList.contains(theme), theme);
        const provenance = await page.evaluate(async () => (await fetch("./__backup_provenance.json")).json());
        assert.equal(provenance.sha, process.env.EXPECTED_SHA);
        current.provenance = provenance;
        const before = await page.evaluate(key => localStorage.getItem(key), key);
        await page.evaluate(() => document.documentElement.style.fontSize = "200%");
        await page.getByRole("button", { name: "データのバックアップ" }).tap();
        const dialog = page.getByRole("dialog", { name: "データのバックアップ" });
        await dialog.getByText("現行ローダーで受入可能", { exact: false }).waitFor();
        current.before = await checkLayout(page, dialog, "before-download");
        const action = dialog.getByRole("button", { name: "JSONを書き出す" });
        await action.scrollIntoViewIfNeeded();
        const box = await action.boundingBox(); assert.ok(box && box.height >= 44 && box.width >= 44);
        const [download] = await Promise.all([page.waitForEvent("download"), action.tap()]);
        assert.match(download.suggestedFilename(), /^calculator-memo-backup-\d{8}-\d{6}\.json$/);
        const json = JSON.parse(await readFile(await download.path(), "utf8"));
        assert.equal(json.entries.length, 1); assert.equal(json.entries[0].key, key); assert.equal(json.entries[0].raw, before);
        assert.equal(await page.evaluate(key => localStorage.getItem(key), key), before);
        await dialog.getByRole("status").filter({ hasText: download.suggestedFilename() }).waitFor();
        assert.match(await dialog.innerText(), /保存完了は確認できません/);
        current.filename = download.suggestedFilename();
        current.after = await checkLayout(page, dialog, "after-download");
        await dialog.getByRole("status").scrollIntoViewIfNeeded();
        await page.screenshot({ path: `gui-evidence/backup-${name}-${width}-${theme}.png` });
        const other = await context.newPage(); await other.goto(base); await other.evaluate(key => localStorage.setItem(key, '{"version":999}'), key);
        await dialog.getByText("再取得してください", { exact: false }).waitFor();
        assert.equal(await action.isDisabled(), true); assert.deepEqual(problems, []);
        assert.equal(await dialog.getByRole("status").count(), 0, "changed source clears old success");
        Object.assign(current, { status: "passed", download: "observed", source: "unchanged before independent writer", finishedAt: new Date().toISOString() });
        await save();
      } catch (error) { Object.assign(current, { status: "failed", error: String(error), finishedAt: new Date().toISOString() }); await save(); throw error; }
      finally { await context.close(); }
    }
  } finally { await browser.close(); }
}
assert.equal(output.length, 8); assert.ok(output.every(c => c.status === "passed"));
record.status = "passed";
} catch (error) { record.status = "failed"; record.error = String(error); throw error; }
finally { record.finishedAt = new Date().toISOString(); await save(); }
console.log(JSON.stringify(record, null, 2));
