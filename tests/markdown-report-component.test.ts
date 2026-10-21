// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MarkdownReportModal } from '../components/MarkdownReportModal';
import { buildMarkdownReport, downloadMarkdownReport } from '../lib/markdown-report';
import { STORAGE_KEY } from '../lib/storage';
import type { PlainCalculationNote } from '../lib/types';

// Pure export semantics are tested separately. These tests exercise real storage
// validation, saved-only selection, readonly UI, and browser operation outcomes.
vi.mock('../lib/markdown-report', () => ({ buildMarkdownReport: vi.fn(), downloadMarkdownReport: vi.fn() }));
const saved = (): PlainCalculationNote => ({ id: 'saved-note', type: 'plain-calculation', title: '保存済み', content: '', blocks: [{id:'saved-text', type:'text', content:'原本だけ'}], createdAt: '2026-10-21T00:00:00Z', updatedAt: '2026-10-21T00:00:00Z' });
const store = (notes: unknown[] = [saved()]) => localStorage.setItem(STORAGE_KEY, JSON.stringify({version:1, history:[], notes, settings:{theme:'light', activePanel:'notes'}, extra:{keep:true}}));
let host: HTMLDivElement, root: Root;
const copy = vi.fn();
const button = (text: string) => [...host.querySelectorAll('button')].find(node => node.textContent === text)!;
const show = async (memoId = 'saved-note') => act(async () => root.render(createElement(MarkdownReportModal, {memoId, onClose:vi.fn()})));
const click = async (text: string) => act(async () => button(text).click());
beforeEach(() => {
  (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear(); store(); host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  vi.mocked(buildMarkdownReport).mockReset().mockReturnValue({markdown:'# 保存済み\n\n原本だけ', filename:'保存済み.md', warnings:[]});
  vi.mocked(downloadMarkdownReport).mockReset(); copy.mockReset().mockResolvedValue(undefined);
  vi.stubGlobal('navigator', {...navigator, clipboard:{writeText:copy}});
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('captures persisted original only, with a readonly source preview and no storage writes', async () => {
  const before = localStorage.getItem(STORAGE_KEY), writes = vi.spyOn(Storage.prototype, 'setItem');
  await show();
  expect(buildMarkdownReport).toHaveBeenCalledExactlyOnceWith(saved());
  const preview = host.querySelector('textarea')!;
  expect(preview.readOnly).toBe(true); expect(preview.value).toBe('# 保存済み\n\n原本だけ');
  expect(host.textContent).toContain('未保存の編集内容・未反映の試算は含めず');
  await click('Markdown全文をコピー'); await click('.mdをダウンロード');
  expect(copy).toHaveBeenCalledWith(preview.value);
  expect(downloadMarkdownReport).toHaveBeenCalledWith({markdown:preview.value, filename:'保存済み.md', warnings:[]});
  expect(writes).not.toHaveBeenCalled(); expect(localStorage.getItem(STORAGE_KEY)).toBe(before);
  expect(host.textContent).toContain('保存先と完了はブラウザで確認');
});
it('keeps the opened snapshot instead of taking subsequent draft or trial data', async () => {
  await show();
  store([{...saved(), title:'未保存draftを模した別状態', blocks:[{id:'trial',type:'text',content:'試算999'}]}]);
  await click('Markdown全文をコピー');
  expect(buildMarkdownReport).toHaveBeenCalledTimes(1);
  expect(copy).toHaveBeenCalledWith('# 保存済み\n\n原本だけ');
  expect(host.querySelector('textarea')!.value).not.toContain('999');
});
it.each(['{broken', JSON.stringify({version:99}), null])('refuses unreadable or absent persisted source %s without fallback', async raw => {
  if (raw === null) localStorage.removeItem(STORAGE_KEY); else localStorage.setItem(STORAGE_KEY, raw);
  const writes = vi.spyOn(Storage.prototype, 'setItem');
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => {}); await show();
  warning.mockRestore();
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('原本を安全に読み取れません');
  expect(buildMarkdownReport).not.toHaveBeenCalled(); expect(host.querySelector('textarea')).toBeNull();
  expect(button('Markdown全文をコピー')).toBeUndefined(); expect(writes).not.toHaveBeenCalled(); expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
});
it('refuses a missing saved ID', async () => { await show('absent'); expect(host.textContent).toContain('見つかりません'); expect(buildMarkdownReport).not.toHaveBeenCalled(); });
it('respects non-destructive protection for unknown blocks', async () => {
  store([{...saved(), blocks:[{id:'unknown', type:'future-chart', opaque:{keep:1}}]}]);
  const raw = localStorage.getItem(STORAGE_KEY); await show();
  expect(host.querySelector('[role="alert"]')).not.toBeNull(); expect(buildMarkdownReport).not.toHaveBeenCalled(); expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
});
it('shows generation failure rather than a complete report', async () => {
  vi.mocked(buildMarkdownReport).mockImplementation(() => { throw new Error('未対応の構造を検出'); }); await show();
  expect(host.querySelector('[role="alert"]')?.textContent).toBe('未対応の構造を検出'); expect(host.querySelector('textarea')).toBeNull();
});
it('shows warnings as text without executing embedded HTML', async () => {
  vi.mocked(buildMarkdownReport).mockReturnValue({markdown:'<script>alert(1)</script>', filename:'safe.md', warnings:['<img src=x onerror=alert(1)>']});
  await show(); expect(host.querySelector('script, img')).toBeNull(); expect(host.querySelector('textarea')!.value).toContain('<script>');
  expect(host.querySelector('[aria-label="レポートの注意事項"]')?.textContent).toContain('<img');
});
it('reports clipboard rejection without claiming success or hiding the preview', async () => {
  copy.mockRejectedValue(new Error('denied')); await show(); await click('Markdown全文をコピー');
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('コピーに失敗'); expect(host.textContent).not.toContain('コピーしました'); expect(host.querySelector('textarea')).not.toBeNull();
});
it('does not claim clipboard success before its promise resolves', async () => {
  let complete!: () => void; copy.mockReturnValue(new Promise<void>(resolve => {complete=resolve;}));
  await show(); await click('Markdown全文をコピー'); expect(button('Markdown全文をコピー').disabled).toBe(true); expect(host.querySelector('[role="status"]')).toBeNull();
  await act(async () => complete()); expect(host.querySelector('[role="status"]')?.textContent).toContain('コピーしました');
});
it('reports download failure without changing saved data', async () => {
  vi.mocked(downloadMarkdownReport).mockImplementation(() => {throw new Error('blob denied');});
  const raw = localStorage.getItem(STORAGE_KEY); await show(); await click('.mdをダウンロード');
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('開始できません'); expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);
});
