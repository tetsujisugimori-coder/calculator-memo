// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { downloadMarkdownReport } from '../lib/markdown-report';
const report = { markdown: '# 日本語\n', filename: 'report.md', warnings: [] };
beforeEach(() => { vi.useFakeTimers(); vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:test'), revokeObjectURL: vi.fn() }); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
it('requests a download with exact source Blob and removes the temporary link', () => {
  let captured: HTMLAnchorElement | undefined;
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { captured = document.querySelector('a') ?? undefined; });
  downloadMarkdownReport(report);
  expect(captured?.download).toBe('report.md'); expect(captured?.href).toBe('blob:test'); expect(captured?.isConnected).toBe(false);
  const blob = vi.mocked(URL.createObjectURL).mock.calls[0][0] as Blob;
  expect(blob.type).toBe('text/markdown;charset=utf-8'); expect(blob.size).toBe(new TextEncoder().encode(report.markdown).length);
  expect(URL.revokeObjectURL).not.toHaveBeenCalled(); vi.advanceTimersByTime(60000); expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test');
});
it('rejects lossy UTF8 conversion before creating a download', () => {
  expect(() => downloadMarkdownReport({ ...report, markdown: '\ud800' })).toThrow('文字情報'); expect(URL.createObjectURL).not.toHaveBeenCalled();
});
it('cleans up and rethrows browser download initiation failure', () => {
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => { throw new Error('blocked'); });
  expect(() => downloadMarkdownReport(report)).toThrow('blocked'); expect(document.querySelector('a')).toBeNull(); vi.advanceTimersByTime(60000); expect(URL.revokeObjectURL).toHaveBeenCalled();
});
