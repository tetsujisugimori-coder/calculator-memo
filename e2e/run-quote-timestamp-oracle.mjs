// Deterministic oracle regression; product clock/storage behavior is unchanged.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, unlink } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runChild } from './diagnostic-supervisor.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(process.env.GUI_EVIDENCE_DIR || 'gui-evidence/quote-timestamp'); await mkdir(output, { recursive: true });
let code = await readFile(new URL('./quote-overflow.mjs', import.meta.url), 'utf8');
const replace = (before, after) => { assert.equal(code.split(before).length, 2); code = code.replace(before, after); };
replace("window.__diagnosticNow='2026-10-31T10:35:24.268Z'", "window.__diagnosticNow='2026-10-31T22:57:30.999Z'");
replace('let browser,context,page;', `let browser,context,page;
result.oracle = [];
async function checkTimestampOracle(dialog, values, label) {
  await expect(dialog).toContainText('2026-10-31T22:57:30.999Z');
  await expect(values).toHaveCount(1);
  const observation = { label, acquiredAt: '2026-10-31T22:57:30.999Z', oldWholeDialogRejected: false, scopedPassed: false, wrongValueRejected: false };
  try { await expect(dialog).not.toContainText('999', { timeout: 150 }); }
  catch { observation.oldWholeDialogRejected = true; }
  assert.ok(observation.oldWholeDialogRejected, 'Old predicate must reject valid timestamp metadata');
  await expect(values).not.toContainText('999'); observation.scopedPassed = true;
  const fields = values.locator('.evidence-block-values > dl > div').filter({ has: page.locator('dt').filter({ hasText: /^当時の内部結果$/ }) }).locator('dd');
  // values may itself be the one BlockInfo container (picker/source).
  const actualFields = label.startsWith('picker') || label === 'source'
    ? values.locator(':scope > dl > div').filter({ has: page.locator('dt').filter({ hasText: /^当時の内部結果$/ }) }).locator('dd')
    : fields;
  observation.negativeFieldCount = await actualFields.count();
  assert.equal(observation.negativeFieldCount, label === 'comparison' ? 2 : 1);
  observation.wrongValueControls = [];
  for (const actualField of await actualFields.all()) {
    const original = await actualField.textContent(); let rejected = false;
    await actualField.evaluate(element => { element.textContent = '999'; });
    try { await expect(values).not.toContainText('999', { timeout: 150 }); }
    catch { rejected = true; }
    finally { await actualField.evaluate((element, text) => { element.textContent = text; }, original); }
    observation.wrongValueControls.push({ original, rejected });
  }
  observation.wrongValueRejected = observation.wrongValueControls.every(c => c.rejected);
  assert.ok(observation.wrongValueRejected, 'Scoped predicate must still reject an incorrect historical result');
  await expect(values).not.toContainText('999');
  observation.text = await dialog.innerText(); result.oracle.push(observation);
}
`);
replace("await picker.getByLabel('引用するブロック',{exact:true}).selectOption('quote-result');", "await picker.getByLabel('引用するブロック',{exact:true}).selectOption('quote-result');\n    await checkTimestampOracle(picker, picker.locator('.evidence-block-values'), 'picker-'+i);");
replace('  result.rawUnchanged=rawBefore===', `
  await activate(report.getByRole('button',{name:'引用元の保存記録・ブロックを開く',exact:true}));
  const sourceDialog = page.getByRole('dialog',{name:'引用元の保存記録・ブロック',exact:true});
  await checkTimestampOracle(sourceDialog, sourceDialog.locator('.evidence-block-values'), 'source');
  await activate(sourceDialog.getByRole('button',{name:'引用元表示を閉じる',exact:true}));
  await activate(report.getByRole('button',{name:'別の保存記録と比較',exact:true}));
  const comparisonDialog = page.getByRole('dialog',{name:'引用時の記録と別の保存記録を比較',exact:true});
  await comparisonDialog.getByLabel('比較先の保存記録',{exact:true}).selectOption(JSON.stringify(['quote-memo','quote-comparison-record']));
  await checkTimestampOracle(comparisonDialog, comparisonDialog.getByRole('region',{name:'引用時と比較先の差分',exact:true}), 'comparison');
  await activate(comparisonDialog.getByRole('button',{name:'比較表示を閉じる',exact:true}));
  assert.equal(result.oracle.length, 4);
  result.rawUnchanged=rawBefore===`);
const generated = join(root, 'e2e/.quote-timestamp-' + process.pid + '.mjs');
try {
  await writeFile(generated, code); await writeFile(join(output, 'derived-probe.mjs'), code);
  const outcome = await runChild({ command: process.execPath, args: [generated, root, 'timestamp-oracle', '--width=390', '--theme=light', '--expect-fit'], env: { ...process.env, GUI_EVIDENCE_DIR: output }, log: join(output, 'worker.log'), timeoutMs: 120000 });
  await writeFile(join(output, 'supervisor.json'), JSON.stringify(outcome, null, 2) + '\n');
  const result = JSON.parse(await readFile(join(output, 'result.json'), 'utf8'));
  assert.ok(outcome.ok && result.status === 'completed' && result.oracle.length === 4);
} finally { await unlink(generated).catch(() => {}); }
