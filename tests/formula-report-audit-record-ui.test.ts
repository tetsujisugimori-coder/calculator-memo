// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { webcrypto } from 'node:crypto';
import { FormulaReportModal } from '../components/FormulaReportModal';
import { defaultData, STORAGE_KEY } from '../lib/storage';
import type { FormulaReport, RegisteredFormula } from '../lib/types';
import { scanAuditRecordEnvelopes } from '../lib/formula-report-audit-record';
import { parseReportAudit } from '../lib/formula-report-audit';
const at = '2026-10-25T00:00:00.000Z';
const formula: RegisteredFormula = { id: 'f', title: '式', expression: 'x+1', createdAt: at, updatedAt: at };
const report: FormulaReport = { id: 'r', formulaId: 'f', title: '記録', body: '前文\n後文', createdAt: at, updatedAt: at, confirmedExpression: null };
let host: HTMLDivElement, root: Root, raw: string;
const save = vi.fn(), close = vi.fn();
const button = (name: string) => [...host.querySelectorAll('button')].find(n => n.textContent === name)!;
const click = async (name: string) => act(async () => { expect(button(name), name).toBeTruthy(); button(name).click(); });
const render = async (r = report) => act(async () => root.render(createElement(FormulaReportModal, { formulaId: 'f', formula, report: r, writable: true, onSave: save, onClose: close })));
const editor = () => host.querySelector<HTMLTextAreaElement>('#formula-report-body')!;
const change = async (value: string) => act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(editor(), value); editor().dispatchEvent(new Event('input', { bubbles: true })); });
const prepare = async (checked = false) => { await click('Markdownを編集'); editor().setSelectionRange(3, 5); await click('根拠点検'); if (checked) await click('保存記録と照合'); await click('レポートへ挿入'); await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); }); };
beforeEach(async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  Object.defineProperty(globalThis.crypto, 'subtle', { configurable: true, value: webcrypto.subtle });
  HTMLElement.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal('requestAnimationFrame', vi.fn(() => 1)); vi.stubGlobal('cancelAnimationFrame', vi.fn());
  localStorage.clear(); raw = JSON.stringify({ ...defaultData, formulaLibrary: { version: 1, selectedId: 'f', entries: [formula] }, formulaReports: { version: 1, entries: [report] } }); localStorage.setItem(STORAGE_KEY, raw);
  host = document.createElement('div'); document.body.append(host); root = createRoot(host); save.mockReset(); close.mockReset(); await render();
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it.each([false, true])('previews shared full record and inserts without persistence, checked=%s', async checked => {
  await prepare(checked);
  const draft = host.querySelector<HTMLTextAreaElement>('#audit-record-markdown')!.value;
  expect(host.querySelector<HTMLTextAreaElement>('#audit-record-target-body')!.value).toBe(report.body);
  expect(draft).toContain(checked ? '点検状態：照合済み' : '点検状態：未照合');
  expect(draft).toContain('認識できた出現数：0件'); expect(draft).toContain('固定点検記録');
  const reads = vi.spyOn(Storage.prototype, 'getItem');
  await click('固定記録を本文へ挿入'); expect(reads).not.toHaveBeenCalled(); reads.mockRestore();
  const after = editor().value; expect(after.startsWith('前文\n')).toBe(true); expect(after.endsWith('後文')).toBe(true);
  expect(scanAuditRecordEnvelopes(after)).toHaveLength(1); expect(parseReportAudit(after, 'f').items).toHaveLength(0);
  expect(localStorage.getItem(STORAGE_KEY)).toBe(raw); expect(save).not.toHaveBeenCalled();
  await click('直前の点検記録挿入を取り消す'); expect(editor().value).toBe(report.body); expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
});
it('cancel preview preserves exact draft and storage', async () => { await prepare(); await click('挿入をやめる'); await click('根拠点検を閉じる'); expect(editor().value).toBe(report.body); expect(localStorage.getItem(STORAGE_KEY)).toBe(raw); });
it('intervening draft edits refuse undo and retain unrelated text', async () => { await prepare(); await click('固定記録を本文へ挿入'); const changed = editor().value + '\n追記'; await change(changed); await click('直前の点検記録挿入を取り消す'); expect(editor().value).toBe(changed); expect(host.textContent).toContain('安全に取消できません'); });
it('moving selection after preview rejects insertion without replacing selected text', async () => { await prepare(); editor().setSelectionRange(0, 0); await click('固定記録を本文へ挿入'); expect(editor().value).toBe(report.body); expect(host.textContent).toContain('挿入位置が変わった'); });
it.each(['changed', 'deleted'])('storage %s invalidates preview, fresh preview retains uncertainty after explicit source check', async kind => {
  await prepare(true);
  const data = JSON.parse(raw); if (kind === 'deleted') data.formulaReports.entries = []; else data.formulaReports.entries[0].body = '外部変更';
  const next = JSON.stringify(data); localStorage.setItem(STORAGE_KEY, next);
  await act(async () => window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, newValue: next })));
  expect(host.querySelector('#audit-record-markdown')).toBeNull(); expect(editor().value).toBe(report.body);
  await click('保存記録と照合'); await click('レポートへ挿入'); await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
  expect(host.querySelector<HTMLTextAreaElement>('#audit-record-markdown')!.value).toContain('現在の保存本文との一致は未確認');
  expect(localStorage.getItem(STORAGE_KEY)).toBe(next);
});
it('deferred digest cannot resurrect preview after close', async () => {
  let resolve!: (value: ArrayBuffer) => void;
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(() => new Promise(r => { resolve = r; }));
  await click('根拠点検'); await click('レポートへ挿入'); await click('根拠点検を閉じる');
  await act(async () => resolve(new ArrayBuffer(32))); expect(host.querySelector('#audit-record-markdown')).toBeNull();
});
it('same-turn storage notification rejects old insert callback before React redraw', async () => {
  await prepare();
  await act(async () => { window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, newValue: 'other' })); button('固定記録を本文へ挿入').click(); });
  expect(editor().value).toBe(report.body);
});
it.each(['storage', 'refresh', 'target'])('pending digest cannot restore preview after %s changes', async kind => {
  let resolve!: (value: ArrayBuffer) => void;
  vi.spyOn(crypto.subtle, 'digest').mockImplementation(() => new Promise(r => { resolve = r; }));
  await click('根拠点検'); await click('レポートへ挿入');
  if (kind === 'storage') await act(async () => window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, newValue: 'new' })));
  if (kind === 'refresh') await click('保存記録と照合');
  if (kind === 'target') await render({ ...report, title: 'new remote title' });
  await act(async () => resolve(new ArrayBuffer(32))); expect(host.querySelector('#audit-record-markdown')).toBeNull(); expect(save).not.toHaveBeenCalled();
});
it('edited source body is frozen separately from saved-body agreement', async () => {
  await click('Markdownを編集'); await change('編集中 <script>danger</script> | `'); await click('根拠点検'); await click('レポートへ挿入');
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
  expect(host.querySelector<HTMLTextAreaElement>('#audit-record-target-body')!.value).toBe('編集中 <script>danger</script> | `');
  expect(host.querySelector<HTMLTextAreaElement>('#audit-record-markdown')!.value).toContain('本文に未保存変更あり'); expect(host.querySelector('script')).toBeNull();
  expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
});
it('preview body hash identifies exact pre-insertion body rather than generated result', async () => {
  await prepare(); const markdown = host.querySelector<HTMLTextAreaElement>('#audit-record-markdown')!.value;
  const metadata = scanAuditRecordEnvelopes(markdown)[0].metadata!;
  expect(metadata.bodyLength).toBe(report.body.length);
  const expected = await webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(report.body));
  expect(metadata.bodySha256).toBe(Buffer.from(expected).toString('hex')); expect(metadata.generatedAt).toMatch(/Z$/);
});
it('body changed and then restored still refuses old undo by edit generation', async () => {
  await prepare(); await click('固定記録を本文へ挿入'); const inserted = editor().value;
  await change(inserted + 'edit'); await change(inserted); await click('直前の点検記録挿入を取り消す');
  expect(editor().value).toBe(inserted); expect(host.textContent).toContain('安全に取消できません');
});
it('async preview Escape restores its trigger focus without disabled-button blur', async () => {
  await prepare(); await act(async () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
  expect(host.querySelector('#audit-record-markdown')).toBeNull(); expect(document.activeElement).toBe(button('レポートへ挿入'));
});
