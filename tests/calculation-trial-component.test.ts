// @vitest-environment jsdom
import { act, createElement, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MemoBlockEditor } from '../components/MemoBlockEditor';
import { PlainNoteModal } from '../components/PlainNoteModal';
import * as trialModule from '../lib/calculation-trial';
import { recalculateReferenceMemo } from '../lib/block-references';
import type { MemoBlock, PlainNoteDraft } from '../lib/types';
vi.mock('../lib/calculation-trial', async importOriginal => {
  const original = await importOriginal<typeof import('../lib/calculation-trial')>();
  return { ...original, createCalculationTrial: vi.fn(original.createCalculationTrial) };
});
const calc = (id:string, expression:string): MemoBlock => ({id,type:'calculation',expression,displayExpression:expression,evaluationMode:'block-references',references:{version:1,entries:[]},result:10,resultText:'10',error:null});
let root:Root, host:HTMLDivElement;
const change=vi.fn();
function Editor({ blocks, memoKey='note', revision='' }: {blocks:MemoBlock[];memoKey?:string;revision?:string}) {
  return createElement(MemoBlockEditor,{blocks,manual:true,memoKey,sourceRevision:revision,onChange:change,onOpenGuide:vi.fn()});
}
function Stateful() {
  const [blocks,setBlocks]=useState<MemoBlock[]>([calc('a','12')]);
  return createElement(MemoBlockEditor,{blocks,manual:true,memoKey:'note',onChange:next=>{change(next);setBlocks(next);},onOpenGuide:vi.fn()});
}
const button = (text:string) => [...host.querySelectorAll('button')].find(b=>b.textContent===text)!;
async function click(text:string) { await act(async()=>{button(text).click();}); }
beforeEach(()=>{
  (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
  host=document.createElement('div');document.body.append(host);root=createRoot(host);change.mockReset();
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.mocked(trialModule.createCalculationTrial).mockClear();});
it('preview never calls onChange, apply calls once and returns focus to trial control', async()=>{
  await act(async()=>root.render(createElement(Stateful)));
  await click('試算する'); expect(change).not.toHaveBeenCalled(); expect(host.textContent).toContain('+2');
  expect(host.querySelector('.calculation-live-result')?.textContent).toContain('10');
  button('結果を反映').focus(); await click('結果を反映');
  expect(change).toHaveBeenCalledTimes(1);expect(host.querySelector('.calculation-live-result')?.textContent).toContain('12');
  expect(host.querySelector('.calculation-trial')).toBeNull();expect(document.activeElement).toBe(button('試算する'));
  expect(host.textContent).toContain('永続保存は「保存する」');
});
it.each(['expression','reorder','remove','add','metadata','note','source'])('invalidates preview on %s without calling onChange',async kind=>{
  const blocks=[calc('a','12'),calc('b','20')];
  await act(async()=>root.render(createElement(Editor,{blocks})));await click('試算する');
  const updated=structuredClone(blocks);
  if(kind==='expression'&&updated[0].type==='calculation')updated[0].expression='13';
  if(kind==='reorder')updated.reverse();if(kind==='remove')updated.pop();if(kind==='add')updated.push(calc('c','30'));
  if(kind==='metadata')Object.assign(updated[0],{future:'changed'});
  await act(async()=>root.render(createElement(Editor,{blocks:updated,memoKey:kind==='note'?'other':'note',revision:kind==='source'?'new':''})));
  expect(button('結果を反映').disabled).toBe(true);expect(host.textContent).toContain('失効');expect(change).not.toHaveBeenCalled();
});
it('does not persist trial or apply until the existing Save button is used',async()=>{
  const save=vi.fn(), initial:PlainNoteDraft={title:'test',content:'',blocks:[calc('a','12')],calculationPolicy:{version:1,mode:'manual'}};
  await act(async()=>root.render(createElement(PlainNoteModal,{initial,onSave:save,onClose:vi.fn(),onOpenGuide:vi.fn()})));
  const original=JSON.stringify(initial);await click('試算する');expect(save).not.toHaveBeenCalled();expect(JSON.stringify(initial)).toBe(original);
  await click('結果を反映');expect(save).not.toHaveBeenCalled();expect(JSON.stringify(initial)).toBe(original);
  await click('保存する');expect(save).toHaveBeenCalledTimes(1);expect(save.mock.calls[0][0].blocks[0].result).toBe(12);
  expect(JSON.stringify(save.mock.calls[0][0])).not.toContain('observations');
});
it('failed preview is diagnostic only and cannot be applied',async()=>{
  const blocks=[calc('a','1/0'),calc('z','20')];await act(async()=>root.render(createElement(Editor,{blocks})));await click('試算する');
  expect(host.textContent).toContain('試算失敗・未反映');expect(host.textContent).toContain('数値評価は未試行');expect(button('結果を反映').disabled).toBe(true);expect(change).not.toHaveBeenCalled();
});
it('late async result cannot replace a newer preview after an input change',async()=>{
  let resolve!:(value:trialModule.CalculationTrial)=>void;
  const original=await vi.importActual<typeof trialModule>('../lib/calculation-trial');
  const blocks=[calc('a','12')]; let previous!:trialModule.CalculationTrial;
  vi.mocked(trialModule.createCalculationTrial).mockImplementationOnce((b,c,o)=>{
    previous=original.createCalculationTrial(b,c,o);
    return new Promise< trialModule.CalculationTrial >(r=>{resolve=r;}) as unknown as trialModule.CalculationTrial;
  });
  await act(async()=>root.render(createElement(Editor,{blocks})));
  await click('試算する');expect(button('試算する').disabled).toBe(true);
  const next=[calc('a','15')];await act(async()=>root.render(createElement(Editor,{blocks:next})));
  expect(button('試算する').disabled).toBe(false);await click('試算する');expect(host.textContent).toContain('+5');
  await act(async()=>resolve(previous));expect(host.textContent).toContain('+5');expect(host.textContent).not.toContain('+2');expect(change).not.toHaveBeenCalled();
});
it('normal recalculate preserves immediate draft application and clears a preview',async()=>{
  const blocks=[calc('a','12')];await act(async()=>root.render(createElement(Editor,{blocks})));await click('試算する');await click('メモ全体を再計算');
  expect(change).toHaveBeenCalledWith(recalculateReferenceMemo(blocks).blocks);expect(host.querySelector('.calculation-trial')).toBeNull();
});
it('double Apply cannot commit the same trial twice',async()=>{
  await act(async()=>root.render(createElement(Stateful)));await click('試算する');
  await act(async()=>{const apply=button('結果を反映');apply.click();apply.click();});
  expect(change).toHaveBeenCalledTimes(1);expect(host.textContent).toContain('試算結果を編集内容へ一括反映しました');
});
it('saving an unapplied preview retains old results, not trial values',async()=>{
  const save=vi.fn(),initial:PlainNoteDraft={title:'preview-only',content:'',blocks:[calc('a','12')],calculationPolicy:{version:1,mode:'manual'}};
  await act(async()=>root.render(createElement(PlainNoteModal,{initial,onSave:save,onClose:vi.fn(),onOpenGuide:vi.fn()})));
  await click('試算する');await click('保存する');
  expect(save.mock.calls[0][0].blocks[0].result).toBe(10);expect(JSON.stringify(save.mock.calls[0][0])).not.toContain('observations');
});
it('late completion after unmount never updates or commits another screen',async()=>{
  let resolve!:(value:trialModule.CalculationTrial)=>void;let result!:trialModule.CalculationTrial;
  const original=await vi.importActual<typeof trialModule>('../lib/calculation-trial');
  vi.mocked(trialModule.createCalculationTrial).mockImplementationOnce((b,c,o)=>{
    result=original.createCalculationTrial(b,c,o);
    return new Promise<trialModule.CalculationTrial>(r=>{resolve=r;}) as unknown as trialModule.CalculationTrial;
  });
  await act(async()=>root.render(createElement(Editor,{blocks:[calc('a','12')]})));await click('試算する');
  await act(async()=>root.render(createElement('p',null,'別の画面')));await act(async()=>resolve(result));
  expect(host.textContent).toBe('別の画面');expect(change).not.toHaveBeenCalled();
});
it('invalidates trial when the saved source changes without replacing the local draft',async()=>{
  const save=vi.fn(),initial:PlainNoteDraft={title:'source',content:'',blocks:[calc('a','12')],calculationPolicy:{version:1,mode:'manual'}};
  const props={initial,onSave:save,onClose:vi.fn(),onOpenGuide:vi.fn()};
  await act(async()=>root.render(createElement(PlainNoteModal,{...props,sourceRevision:'original-record'})));await click('試算する');
  await act(async()=>root.render(createElement(PlainNoteModal,{...props,sourceRevision:'updated-record'})));
  expect(button('結果を反映').disabled).toBe(true);expect(host.textContent).toContain('失効');expect(save).not.toHaveBeenCalled();
});
