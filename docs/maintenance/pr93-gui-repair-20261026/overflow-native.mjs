// Targeted regression, not a replacement for the full six-condition formal GUI.
// Run from repository root after a Pages build. No product DOM/input is rewritten.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium, webkit, expect } from '../../../e2e/node_modules/@playwright/test/index.mjs';
import { scenarios } from '../../../e2e/scenario-config.mjs';
import { spawn } from 'node:child_process';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
const output = process.env.OVERFLOW_OUTPUT || '/tmp/pr93-overflow-native';
await mkdir(output, { recursive: true });
const fixtureBuild = await build({ entryPoints: ['docs/maintenance/pr93-gui-repair-20261026/overflow-fixture.ts'], bundle: true, platform: 'node', format: 'esm', write: false });
const { overflowFixture } = await import('data:text/javascript;base64,' + Buffer.from(fixtureBuild.outputFiles[0].text).toString('base64'));
const selected = scenarios.filter(s => !process.env.OVERFLOW_SCENARIO || s.id === process.env.OVERFLOW_SCENARIO);
assert.ok(selected.length > 0, 'At least one known scenario is required');
const port = Number(process.env.OVERFLOW_PORT || 4395), base = `http://127.0.0.1:${port}/calculator-memo/`;
const report = { method: 'Focused native synthetic App regression; working-tree source and served build identities are recorded separately', startedAt: new Date().toISOString(), workingTreeSourceSha256: createHash('sha256').update(await readFile('components/FormulaDifferenceSources.tsx')).digest('hex'), results: [], backdropChecks: [] };
const save = () => writeFile(`${output}/results.json`, JSON.stringify(report, null, 2));
const server = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--config', 'vite.pages.config.ts', '--host', '127.0.0.1', '--strictPort', '--port', String(port), ...(process.env.OVERFLOW_DIST ? ['--outDir', process.env.OVERFLOW_DIST] : [])], { stdio: ['ignore', 'ignore', 'inherit'] });
try {
  await expect.poll(async () => { if (server.exitCode !== null) throw new Error('Owned preview exited'); try { return (await fetch(base)).status; } catch { return 0; } }, { timeout: 30000 }).toBe(200);
  const html = await (await fetch(base)).text();
  report.servedAssets = [];
  for (const match of html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)) { const url = new URL(match[1], base).href; const bytes = Buffer.from(await (await fetch(url)).arrayBuffer()); report.servedAssets.push({url, sha256: createHash('sha256').update(bytes).digest('hex')}); }
  report.servedIdentity = await (await fetch(new URL('__gui_provenance.json', base))).json();
  for (const scenario of selected) {
    const executablePath = scenario.engine === 'chromium' ? process.env.CHROMIUM_EXECUTABLE : process.env.WEBKIT_EXECUTABLE;
    const browser = await ({ chromium, webkit }[scenario.engine]).launch(executablePath ? { executablePath } : {});
    try { for (const formulaId of ['quote-formula', '式😀e\u0301長いID_' + 'abc　日本語'.repeat(8)]) {
      const context = await browser.newContext({ viewport: { width: scenario.width, height: scenario.height }, isMobile: scenario.isMobile, hasTouch: scenario.hasTouch, deviceScaleFactor: scenario.deviceScaleFactor, locale: 'ja-JP', timezoneId: 'Asia/Tokyo' });
      try {
        const page = await context.newPage(), errors = [];
        page.on('pageerror', e => errors.push(e.message));
        await page.goto(base);
        // Seed a new synthetic context; all subsequent controls use real tap/click/key events.
        const fixture = overflowFixture(formulaId);
        await page.evaluate(data => localStorage.setItem('calculation-memo:data', JSON.stringify(data)), fixture);
        await page.reload();
        const activate = locator => scenario.hasTouch ? locator.tap() : locator.click();
        const raw = await page.evaluate(() => localStorage.getItem('calculation-memo:data'));
        const inspectBackdrops = async (phase, count, expectedFilter) => {
          const filters = await page.locator('.modal-backdrop').evaluateAll(nodes => nodes.map(node => ({ filter: getComputedStyle(node).backdropFilter, rect: node.getBoundingClientRect().toJSON() })));
          report.backdropChecks.push({ scenario: scenario.id, formulaId, phase, expectedFilter, count, filters }); await save();
          assert.equal(filters.length, count, `${phase}: exact open modal stack`);
          assert.deepEqual(filters.map(item => item.filter), Array(count).fill(expectedFilter), `${phase}: single blur preserved; nested stacks have no backdrop filters`);
        };
        await activate(page.getByRole('button', { name: '登録式ライブラリ', exact: true }));
        await inspectBackdrops('single-library', 1, 'blur(3px)');
        await activate(page.getByRole('button', { name: '関連レポートを閲覧・編集', exact: true }));
        await inspectBackdrops('nested-report', 2, 'none');
        await activate(page.getByRole('button', { name: 'Markdownを編集', exact: true }));
        const trigger = page.getByRole('button', { name: '比較差分1の出典を確認', exact: true });
        await activate(trigger);
        const dialog = page.getByRole('dialog', { name: '比較差分の出典確認', exact: true });
        await inspectBackdrops('nested-source', 3, 'none');
        const identity = dialog.locator('p').filter({ hasText: /^差分ID：/ });
        const expected = `差分ID：f94c198b-b4b1-4a41-a86e-11d63e9013bd　元引用ID：965d1c53-3da3-4ae2-a73c-fd94df1efe4f　登録式ID：${formulaId}`;
        assert.equal(await identity.textContent(), expected);
        for (const theme of ['light', 'dark']) for (const percent of [100, 200]) {
          const start = performance.now();
          await page.evaluate(({ theme, percent }) => { document.documentElement.dataset.theme = theme; document.documentElement.style.fontSize = `${percent}%`; }, { theme, percent });
          await identity.scrollIntoViewIfNeeded();
          const outer = await dialog.evaluate(dialog => ({ viewport: innerWidth, document: { scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }, body: { scroll: document.body.scrollWidth, client: document.body.clientWidth }, dialog: dialog.getBoundingClientRect().toJSON() }));
          const measurements = await dialog.evaluate(dialog => [...dialog.querySelectorAll('.modal-content, section, p, button')].map(e => {
            const s = getComputedStyle(e); return { tag: e.tagName, class: e.className, text: e.textContent, nodes: [...e.childNodes].map(n => ({ type: n.nodeType, text: n.textContent })), client: e.clientWidth, scroll: e.scrollWidth, rect: e.getBoundingClientRect().toJSON(), style: Object.fromEntries(['width','minWidth','maxWidth','padding','border','overflowWrap','wordBreak','whiteSpace','fontFamily','fontSize','letterSpacing'].map(k => [k, s[k]])) };
          }));
          const entry = { scenario, browser: browser.version(), formulaId, theme, percent, startMonotonic: start, endMonotonic: performance.now(), outer, measurements, errors: [...errors] };
          report.results.push(entry); await save();
          await page.screenshot({ path: `${output}/${scenario.id}-${formulaId === 'quote-formula' ? 'exact' : 'unicode'}-${theme}-${percent}.png` });
          assert.equal(outer.viewport, scenario.width, 'Configured CSS viewport unchanged');
          assert.ok(outer.document.scroll <= outer.viewport + 1 && outer.body.scroll <= outer.viewport + 1, 'Document and body fit horizontally');
          assert.ok(outer.dialog.left >= -1 && outer.dialog.right <= outer.viewport + 1, 'Dialog remains within viewport');
          for (const m of measurements) assert.ok(m.scroll <= m.client + 1, `Horizontal overflow: ${JSON.stringify(m)}`);
          for (const m of measurements.filter(m => m.tag === 'BUTTON')) assert.ok(m.rect.height >= 44, 'Existing 44px operation target');
          assert.equal(await identity.textContent(), expected);
          assert.deepEqual(errors, []);
        }
        await page.keyboard.press('Escape'); await expect(dialog).toHaveCount(0); await expect(trigger).toBeFocused();
        await page.keyboard.press('Enter'); await expect(dialog).toBeVisible();
        await page.keyboard.press('Tab'); assert.equal(await dialog.evaluate(e => e.contains(document.activeElement)), true);
        await page.keyboard.press('Escape'); await expect(trigger).toBeFocused();
        await inspectBackdrops('source-closed-report', 2, 'none');
        await page.keyboard.press('Escape');
        await expect(page.getByRole('dialog', { name: '登録式の関連レポート', exact: true })).toHaveCount(0);
        await inspectBackdrops('restored-single-library', 1, 'blur(3px)');
        await expect(page.getByRole('button', { name: '関連レポートを閲覧・編集', exact: true })).toBeFocused();
        assert.equal(await page.evaluate(() => localStorage.getItem('calculation-memo:data')), raw, 'Opening/reading/closing does not save snapshots or confirmation history');
      } finally { await context.close(); }
    } } finally { await browser.close(); }
  }
  report.status = 'passed';
} catch (error) { report.status = 'failed'; report.error = String(error.stack || error); throw error; }
finally { report.finishedAt = new Date().toISOString(); await save(); server.kill('SIGTERM'); }
