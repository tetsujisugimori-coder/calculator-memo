import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
const read = path => readFile(new URL(path, import.meta.url), 'utf8');

test('additional facade CI checks exact PR head with pinned actions and read-only permissions', async () => {
  const workflow = await read('../.github/workflows/storage-facade.yml');
  assert.match(workflow, /contents: read/);
  assert.match(workflow, /ref: \$\{\{ github.event.pull_request.head.sha \}\}/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /actions\/checkout@d23441a48e516b6c34aea4fa41551a30e30af803/);
  assert.match(workflow, /actions\/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38/);
  assert.match(workflow, /actions\/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02/);
  assert.match(workflow, /node-version: 22.13.0/);
  assert.match(workflow, /npm ci --prefix e2e --ignore-scripts/);
  assert.match(workflow, /install --with-deps chromium webkit/);
  assert.match(workflow, /storage-writer-boundary.node-test.mjs/);
  assert.match(workflow, /storage-facade-ci.node-test.mjs/);
  assert.doesNotMatch(workflow, /continue-on-error|pull_request_target|secrets\.|deploy-pages|pages: write|id-token: write/);
});

test('bounded runner preserves original outcome and failure artifacts in an exclusive directory', async () => {
  const runner = await read('./run-storage-facade-gui.mjs');
  const spec = await read('./storage-facade-browser.mjs');
  const workflow = await read('../.github/workflows/storage-facade.yml');
  assert.match(runner, /await mkdir\(out\)/);
  assert.match(runner, /randomUUID\(\)/);
  assert.match(runner, /600_000/);
  assert.match(runner, /process.on\('SIGTERM'/);
  assert.match(runner, /process.exitCode = 1/);
  assert.match(runner, /runner-outcome.json/);
  assert.match(spec, /tracing.start\(\{ screenshots: false, snapshots: true, sources: true \}\)/);
  assert.match(spec, /-failure.png/);
  assert.match(spec, /-trace.zip/);
  assert.match(workflow, /timeout-minutes: 20/);
  assert.match(workflow, /620s node e2e\/run-storage-facade-gui.mjs/);
  assert.match(workflow, /if: always\(\)/);
  assert.match(workflow, /retention-days: 7/);
  assert.match(workflow, /if-no-files-found: error/);
});

test('owned loopback build identifies source, bundle, and browser-observed asset bytes', async () => {
  const runner = await read('./run-storage-facade-gui.mjs');
  const spec = await read('./storage-facade-browser.mjs');
  assert.match(runner, /server.listen\(0, '127.0.0.1'\)/);
  assert.match(runner, /source changed during build/);
  assert.match(runner, /source changed during browser acceptance/);
  assert.match(runner, /served bundle changed/);
  assert.match(runner, /chromiumExecutableOverride/);
  assert.match(runner, /CI uses the lockfile-pinned browser/);
  assert.match(spec, /assert.deepEqual\(await page.evaluate.*__storage_facade_provenance.json/);
  assert.match(spec, /browser received owned build/);
  assert.match(spec, /context.route\('\*\*\/\*'/);
});

test('all eight matrix cases require six completed fresh contexts; no partial or forced success', async () => {
  const runner = await read('./run-storage-facade-gui.mjs');
  const spec = await read('./storage-facade-browser.mjs');
  assert.match(spec, /\[\['chromium', chromium\], \['webkit', webkit\]\]/);
  assert.match(spec, /\[375, 390, 765, 1280\]/);
  assert.match(spec, /browser.newContext\(/);
  assert.match(runner, /c.contexts.length === 6/);
  assert.match(runner, /c.contexts.every\(s => s.status === 'passed'\)/);
  assert.match(spec, /assert.equal\(record.cases.length, 8\)/);
  assert.match(spec, /all eight matrix cases and six contexts each must pass/);
  assert.doesNotMatch(spec, /force:\s*true|test.skip|process.exit\(0\)/);
});

test('product operations use real UI, fixed raw expectations, and native fault observation without product hooks', async () => {
  const spec = await read('./storage-facade-browser.mjs');
  for (const label of ['計算する', '保存する', 'レポートを保存', '現在データを保全する', '復元を実行する', 'このコピーだけ削除する', '初期化する']) assert.ok(spec.includes(label), label);
  assert.match(spec, /assert.equal\(await raw\(page\), target\)/);
  assert.match(spec, /assert.deepEqual\(afterDelete, expected/);
  assert.match(spec, /noRetryObservationMs: 1600/);
  assert.match(spec, /assert.deepEqual\(await writes\(page\), callsAtUnknown/);
  for (const kind of ['autosave-unknown', 'preservation-unknown', 'delete-unknown', 'reset-unknown']) assert.ok(spec.includes(kind));
  assert.match(spec, /Storage.prototype\[method\]/);
  assert.match(spec, /throw-after/);
  assert.match(spec, /behavior === 'noop'/);
  assert.doesNotMatch(spec, /from ['"].*lib\/|executeStorageOperation\(|runStorageOperation\(|saveDataChecked\(/);
  assert.match(spec, /additional-storage-facade-gui-not-formal/);
});


test('calculation editor is opened through its native summary before fill, and reload does not await a collapsed textbox', async () => {
  const spec = await read('./storage-facade-browser.mjs');
  assert.match(spec, /if \(!await input.isVisible\(\)\) await activate\(page.locator\('\.expression-entry > summary'\), r\)/);
  assert.match(spec, /await \(await expressionInput\(page, r\)\).fill\('12\+34'\)/);
  assert.match(spec, /await \(await expressionInput\(page, r\)\).fill\('8\+9'\)/);
  assert.match(spec, /await page.reload\(\); await button\(page, '計算する'\).waitFor\(\)/);
  assert.doesNotMatch(spec, /getByRole\('textbox', \{ name: '計算式を入力', exact: true \}\)\.(fill|waitFor)\(/);
});
