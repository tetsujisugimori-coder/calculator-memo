import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
// Load the small test-only ESM contract without importing the browser runner.
const source = readFileSync(new URL('../e2e/source-evidence-contract.mjs', import.meta.url), 'utf8');
const contract = await import(/* @vite-ignore */ 'data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const identity = '差分ID：316746bc-6ada-4722-80b5-1a622ce5bd13　元引用ID：cf886864-22dd-4ace-999d-858cfab8e426　登録式ID：quote-formula';
it('GUI negative control: 999 inside a generated UUID is not a calculation value', () => {
 expect(() => contract.assertHistoricalSourceText('before' + identity + 'after', identity, 'quote-formula')).not.toThrow();
});
it.each(['999', 'z = 999', '実使用内部値999', '当時の内部結果999', '当時の表示結果999'])('GUI negative control: leaked %s remains a failure', value => {
 expect(() => contract.assertHistoricalSourceText(identity + value, identity, 'quote-formula')).toThrow('Current calculation sentinel');
});
it('GUI negative control: additional values cannot hide inside the excluded paragraph', () => {
 expect(() => contract.assertHistoricalSourceText(identity + '999', identity + '999', 'quote-formula')).toThrow('Only the exact');
});
it('GUI negative control: duplicate or missing identity paragraph cannot silently pass', () => {
 expect(() => contract.assertHistoricalSourceText(identity + identity, identity, 'quote-formula')).toThrow('exactly once');
 expect(() => contract.assertHistoricalSourceText('absent', identity, 'quote-formula')).toThrow('exactly once');
});
it('GUI contract preserves exact snapshots including negative zero independently of displayed results', () => {
 expect(contract.expectedHistoricalBlocks({ blocks: [{ blockId: 'source', position: 2, expression: 'z=-0', result: '-0', resultText: '0', inputs: [] }, { blockId: 'target', position: 1, expression: 'z*2', evaluationMode: 'note-variables', result: '-0', resultText: '0', inputs: [{ sourceBlockId: 'source', value: '-0' }] }] })).toEqual([
  { position: '2', execution: '1', mode: 'legacy（旧方式）', expression: 'z=-0', internal: '-0', display: '0', inputs: [] },
  { position: '1', execution: '2', mode: 'note-variables', expression: 'z*2', internal: '-0', display: '0', inputs: [{ source: 'source', value: '-0', position: '2' }] },
 ]);
});

it('worker queue preserves all six scenario identities and original port mapping exactly once', async () => {
 const configSource = readFileSync(new URL('../e2e/scenario-config.mjs', import.meta.url), 'utf8');
 const config = await import(/* @vite-ignore */ 'data:text/javascript;base64,' + Buffer.from(configSource).toString('base64'));
 expect(config.executionOrder).toEqual([4, 5, 0, 1, 2, 3]);
 expect([...config.executionOrder].sort()).toEqual(config.scenarios.map((_: unknown, index: number) => index));
 expect(config.executionOrder.map((index: number) => config.scenarioPort(index))).toEqual([4284, 4285, 4280, 4281, 4282, 4283]);
 const smoke = readFileSync(new URL('../e2e/smoke.mjs', import.meta.url), 'utf8');
 expect(smoke).toContain('executionOrder[next++]');
 expect(smoke).toContain('port: scenarioPort(index)');
 expect(smoke).toContain('Promise.allSettled([runWorker(), runWorker()])');
 expect(smoke).toContain('summary.workers.sort((a,b) => scenarios.findIndex(s=>s.id===a.id) - scenarios.findIndex(s=>s.id===b.id))');
});

it('GUI negative control: legitimate timestamp milliseconds 999 are not numeric results', () => {
 const stamps = ['保存原本取得日時：2026-10-26T01:00:00.999Z。照合はこの取得時点だけです。数学的証明、真正性、利用者の明示確認ではありません。', '元引用日時：2026-10-26T01:00:00.999Z。差分プレビュー準備日時：2026-10-26T01:00:01.999Z（保存完了・確認日時ではありません）。'];
 expect(() => contract.assertHistoricalSourceText(identity + stamps.join(''), identity, 'quote-formula', stamps)).not.toThrow();
 expect(() => contract.assertHistoricalSourceText(identity + stamps.join('') + '実使用内部値999', identity, 'quote-formula', stamps)).toThrow('Current calculation sentinel');
 expect(() => contract.assertHistoricalSourceText(identity + stamps.join('') + '999', identity, 'quote-formula', [stamps[0] + '999'])).toThrow('Only exact timestamp');
});
