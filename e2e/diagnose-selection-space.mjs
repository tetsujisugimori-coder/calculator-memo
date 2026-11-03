// Bounded diagnostic, not a retry-until-green acceptance test. Synthetic contexts only.
import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';
const url = process.env.SPACE_DIAGNOSTIC_URL;
const output = process.env.SPACE_DIAGNOSTIC_OUTPUT || 'gui-evidence/space-diagnostic.json';
const browser = await chromium.launch();
const cases = [];
try {
  for (const mode of ['keyboard', 'touch-then-keyboard']) for (let trial = 0; trial < 4; trial++) {
    const context = await browser.newContext({ viewport: { width: 375, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    try {
      const page = await context.newPage(); let button;
      if (url) {
        const date = '2026-10-31T00:00:00.000Z';
        const raw = JSON.stringify({ version: 1, history: [], notes: [{ id: 'synthetic-space', type: 'plain-calculation', title: 'Space diagnostic', content: 'Synthetic only', createdAt: date, updatedAt: date }], settings: { theme: 'light', activePanel: 'history' } });
        const backup = JSON.stringify({ format: 'calculator-memo-backup', formatVersion: 1, createdAt: date, acquiredAt: date, acquisition: 'captured', appStorageVersion: 1, entries: [{ key: 'calculation-memo:data', raw, utf16CodeUnits: raw.length, validation: 'ok', counts: { history: 0, notes: 1, formulas: 0, reports: 0, executions: 0 } }] });
        await page.goto(url);
        await page.getByRole('button', { name: '選択復元プレビュー', exact: true }).click();
        await page.getByLabel('バックアップファイル', { exact: true }).setInputFiles({ name: 'synthetic.json', mimeType: 'application/json', buffer: Buffer.from(backup) });
        button = page.locator('[data-preview-key="notes:0"] button[aria-pressed]'); await button.waitFor();
      } else {
        await page.setContent(`<!doctype html><button aria-pressed="false">復元候補に選択</button><script>const b=document.querySelector('button');b.onclick=()=>{const next=b.getAttribute('aria-pressed')!=='true';b.setAttribute('aria-pressed',next);b.textContent=next?'候補から解除':'復元候補に選択';}</script>`);
        button = page.locator('button');
      }
      await button.evaluate(button => {
        window.__spaceDiagnostic = { button, events: [] };
        for (const capture of [true, false]) for (const type of ['keydown','keyup','click']) document.addEventListener(type, event => {
          if (event.target !== button) return;
          window.__spaceDiagnostic.events.push({ type, phase: capture ? 'capture' : 'bubble', time: performance.now(), key: event.key,
            trusted: event.isTrusted, prevented: event.defaultPrevented, same: event.target === button,
            focus: document.activeElement === button, connected: button.isConnected,
            active: button.matches(':active'), pressed: button.getAttribute('aria-pressed') });
        }, capture);
      });
      if (mode === 'touch-then-keyboard') { await button.tap(); await button.tap(); }
      await button.focus();
      const steps = [];
      for (let input = 0; input < 2; input++) {
        // 16ms is a fixed stimulus (held key), NOT a synchronization sleep or retry.
        await page.keyboard.press('Space', { delay: 16 });
        steps.push(await button.evaluate(button => ({ pressed: button.getAttribute('aria-pressed'), same: button === window.__spaceDiagnostic.button, focus: document.activeElement === button })));
      }
      cases.push({ mode, trial, steps, events: await page.evaluate(() => window.__spaceDiagnostic.events) });
    } finally { await context.close(); }
  }
} finally {
  await writeFile(output, JSON.stringify({ target: url ? 'application' : 'standards-mode native button (no React)', sha: process.env.EXPECTED_SHA || null, browser: browser.version(), node: process.version, cases }, null, 2) + '\n');
  await browser.close();
}
