// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PlainNoteModal } from '../components/PlainNoteModal';
import * as evidenceModule from '../lib/calculation-evidence';
import type { PlainNoteDraft } from '../lib/types';
const initial = (): PlainNoteDraft => ({ title: 'evidence', content: '', calculationPolicy: { version: 1, mode: 'manual' }, blocks: [{ id: 'a', type: 'calculation', expression: '12', displayExpression: '12', result: 10, resultText: '10', error: null, evaluationMode: 'block-references', references: { version: 1, entries: [] } }] });
let root: Root, host: HTMLDivElement;
const button = (text: string) => [...host.querySelectorAll('button')].find(b => b.textContent === text)!;
async function click(text: string) { await act(async () => { button(text).click(); }); }
beforeEach(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; host = document.createElement('div'); document.body.append(host); root = createRoot(host); });
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.restoreAllMocks(); });
async function render(save = vi.fn(), revision = '') { await act(async () => root.render(createElement(PlainNoteModal, { initial: initial(), sourceRevision: revision, onSave: save, onClose: vi.fn(), onOpenGuide: vi.fn() }))); return save; }
it('preview does not queue a confirmation; explicit successful apply queues unsaved evidence', async () => {
  const save = await render(); await click('試算する'); await click('保存する'); expect(save.mock.calls[0][1]).toEqual([]);
  await click('結果を反映'); expect(host.textContent).toContain('保存待ち: 1件'); await click('保存する');
  expect(save.mock.calls[1][1]).toHaveLength(1); expect(save.mock.calls[1][0]).not.toHaveProperty('calculationEvidence');
});
it('repeated explicit recalculation queues distinct calculations but ordinary block edits discard pending evidence', async () => {
  const save = await render(); await click('メモ全体を再計算'); await click('メモ全体を再計算'); expect(host.textContent).toContain('保存待ち: 2件');
  await click('＋ 文章'); expect(host.textContent).toContain('保存待ち: 0件'); await click('保存する'); expect(save.mock.calls[0][1]).toEqual([]);
});
it('changed original revision invalidates pending evidence without modifying draft values', async () => {
  const save = await render(); await click('メモ全体を再計算'); await render(save, 'external'); await click('保存する');
  expect(save.mock.calls[0][1]).toEqual([]); expect(save.mock.calls[0][0].blocks[0].result).toBe(12);
});
it('failed save keeps draft and pending evidence visible and never labels them persisted', async () => {
  const save = vi.fn(() => 'quota failure: unchanged'); await render(save); await click('メモ全体を再計算'); await click('保存する');
  expect(host.querySelector('[role="alert"]')?.textContent).toBe('quota failure: unchanged');
  expect(host.textContent).toContain('保存待ち: 1件'); expect(button('保存する').disabled).toBe(false);
});
it('legacy save captures only the actual save-time evaluation and does not change the supplied original', async () => {
  const draft: PlainNoteDraft = { title: 'old', content: '', blocks: [{ id: 'a', type: 'calculation', expression: '2+3', displayExpression: '', result: null, resultText: '', error: null }] };
  const before = JSON.stringify(draft); const save = vi.fn();
  await act(async () => root.render(createElement(PlainNoteModal, { initial: draft, onSave: save, onClose: vi.fn(), onOpenGuide: vi.fn() })));
  await click('保存する'); expect(save.mock.calls[0][0].blocks[0].result).toBe(5); expect(save.mock.calls[0][1]).toHaveLength(1); expect(JSON.stringify(draft)).toBe(before);
});
it('pending count overflow refuses recalculation and trial application without dropping the 100 queued records', async () => {
  const save = await render();
  for (let index = 0; index < 100; index++) await click('メモ全体を再計算');
  expect(host.textContent).toContain('保存待ち: 100件');
  await click('メモ全体を再計算'); expect(host.textContent).toContain('上限'); expect(host.textContent).toContain('保存待ち: 100件');
  await click('試算する'); await click('結果を反映'); expect(host.textContent).toContain('反映を停止しました');
  expect(host.textContent).not.toContain('試算結果を編集内容へ一括反映しました');
  await click('保存する'); expect(save.mock.calls[0][1]).toHaveLength(100);
});

it('pending byte overflow preserves previous evidence and current draft', async () => {
  const save = await render(); await click('メモ全体を再計算'); await click('保存する');
  const candidate = structuredClone(save.mock.calls[0][1][0]) as evidenceModule.EvidenceCandidate;
  candidate.blocks[0].resultText = 'x'.repeat(500_001);
  vi.spyOn(evidenceModule, 'makeEvidenceCandidate').mockReturnValue(candidate);
  await click('メモ全体を再計算');
  expect(host.textContent).toContain('上限'); expect(host.textContent).toContain('保存待ち: 1件');
  await click('保存する'); expect(save.mock.calls[1][1]).toEqual(save.mock.calls[0][1]); expect(save.mock.calls[1][0]).toEqual(save.mock.calls[0][0]);
});
