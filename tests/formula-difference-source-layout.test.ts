// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DifferenceSourceDialog } from '../components/FormulaDifferenceSources';
import type { DifferenceAssessment } from '../lib/formula-report-diff-tracking';
import type { EvidenceRecord } from '../lib/calculation-evidence';

const at = '2026-10-26T03:22:21.693Z';
const record: EvidenceRecord = { id: 'record', evaluator: 'calculator-memo-v1', status: 'confirmed', calculatedAt: at, persistedAt: at, blocks: [] };
const differenceId = 'f94c198b-b4b1-4a41-a86e-11d63e9013bd';
const quoteId = '965d1c53-3da3-4ae2-a73c-fd94df1efe4f';
let host: HTMLDivElement, root: Root;
beforeEach(() => { Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true }); host = document.createElement('div'); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); });

it.each(['quote-formula', '式😀e\u0301・長いID_' + 'abc　日本語'.repeat(80), 'ID<>&`\n\r\n終端'])('preserves the complete identity text as one wrapping text node (%s)', async formulaId => {
  const assessment: DifferenceAssessment = { status: 'tracked', reason: '追跡情報一致', start: 0, end: 1,
    snapshot: { version: 1, differenceId, preparedAt: at, quoteBodyEdited: false,
      quote: { version: 1, quoteId, formulaId, memoId: 'memo', blockId: 'block', citedAt: at, record }, after: record } };
  const source = { notes: [], fetchedAt: at };
  const original = JSON.stringify({ assessment, source });
  const refresh = vi.fn(), close = vi.fn();
  await act(async () => root.render(createElement(DifferenceSourceDialog, { assessment, source, links: [], onRefresh: refresh, onClose: close })));
  const paragraph = [...host.querySelectorAll('p')].find(p => p.textContent?.startsWith('差分ID：'))!;
  expect(paragraph.textContent).toBe(`差分ID：${differenceId}　元引用ID：${quoteId}　登録式ID：${formulaId}`);
  // Chromium can hang a U+3000 at the beginning of an adjacent text node beyond
  // the line box despite overflow-wrap:anywhere. Native layout is tested separately.
  expect(paragraph.childNodes).toHaveLength(1);
  expect(paragraph.firstChild?.nodeType).toBe(Node.TEXT_NODE);
  expect(JSON.stringify({ assessment, source })).toBe(original);
  expect(refresh).not.toHaveBeenCalled(); expect(close).not.toHaveBeenCalled();
});
