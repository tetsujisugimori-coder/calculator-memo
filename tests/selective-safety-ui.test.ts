// @vitest-environment jsdom
import { act,createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach,afterEach,it,expect,vi } from 'vitest';
import { SelectionPreviewModal } from '../components/SelectionPreviewModal';
import { base,history,wrap } from './helpers/selective-safety-fixture';
import { STORAGE_KEY } from '../lib/storage';
import { RECOVERY_CHANGED_EVENT } from '../lib/recovery-manager';
let host:HTMLDivElement;let root:ReturnType<typeof createRoot>;let generation=1;
const raw=JSON.stringify(base);const prepare='原文保持候補を明示的に生成';const check='実行直前条件を読み取り専用で再検証';
const button=(label:string,scope:ParentNode=host)=>[...scope.querySelectorAll('button')].find(b=>b.textContent===label)!;
const click=async(label:string,scope:ParentNode=host)=>act(async()=>button(label,scope).click());
const state=()=>host.querySelector('[data-testid="restore-safety-state"]')?.textContent;
const flight=()=>host.querySelector('[data-testid="restore-safety-preflight"]')?.textContent;
async function upload(text=wrap(JSON.stringify({...base,history:[history('new')]}))) {
 const input=host.querySelector('input[type="file"]')!;await act(async()=>{Object.defineProperty(input,'files',{configurable:true,value:[{name:'synthetic.json',size:new TextEncoder().encode(text).length,text:()=>Promise.resolve(text)}]});input.dispatchEvent(new Event('change',{bubbles:true}));});
}
async function ready(){await upload();await click('現在データを明示的に再取得して比較');await click('復元候補に選択',host.querySelector('[data-preview-key="history:0"]')!);await click('復元計画を明示的に再生成');await click(prepare);}
beforeEach(async()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});generation=1;localStorage.clear();localStorage.setItem(STORAGE_KEY,raw);localStorage.setItem('calculation-memo:restore-recovery:v1:0','protected');host=document.createElement('div');document.body.append(host);root=createRoot(host);
 await act(async()=>root.render(createElement(SelectionPreviewModal,{generation,getGeneration:()=>generation,onClose:vi.fn()})));
});
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.restoreAllMocks();});
it('shows Stage 3A PASS separately from Stage 2 BLOCKED and never writes',async()=>{
 const set=vi.spyOn(Storage.prototype,'setItem'),remove=vi.spyOn(Storage.prototype,'removeItem'),clear=vi.spyOn(Storage.prototype,'clear');await ready();expect(state()).toBe('原文保持・候補生成: PASS');expect(host.querySelector('[data-testid="restore-plan-state"]')?.textContent).toBe('BLOCKED');expect(flight()).toContain('未実施');await click(check);expect(flight()).toBe('直前再検証: PASS');expect(host.textContent).toContain('実行は禁止中');expect(button('復元を実行する')).toBeUndefined();
 expect(localStorage.getItem(STORAGE_KEY)).toBe(raw);expect(localStorage.getItem('calculation-memo:restore-recovery:v1:0')).toBe('protected');for(const fn of [set,remove,clear])expect(fn).not.toHaveBeenCalled();
});
it.each(['selection','storage','same-tab','generation','read-error','file','unsaved'])('withdraws old success on %s',async kind=>{
 await ready();await click(check);expect(flight()).toContain('PASS');
 if(kind==='selection')await click('候補から解除',host.querySelector('[data-preview-key="history:0"]')!);
 if(kind==='storage')await act(async()=>window.dispatchEvent(new StorageEvent('storage',{key:STORAGE_KEY,newValue:raw})));
 if(kind==='same-tab')await act(async()=>window.dispatchEvent(new Event(RECOVERY_CHANGED_EVENT)));
 if(kind==='generation'){generation++;await click(check);}
 if(kind==='read-error'){vi.spyOn(Storage.prototype,'getItem').mockImplementation(()=>{throw Error('denied');});await click(check);}
 if(kind==='file')await upload('{');
 if(kind==='unsaved')await act(async()=>root.render(createElement(SelectionPreviewModal,{generation,getGeneration:()=>generation,onClose:vi.fn(),blockedReason:'未保存編集'})));
 expect(host.querySelector('[data-testid="restore-safety-preflight"]')).toBeNull();expect(state()).not.toBe('原文保持・候補生成: PASS');
});
it('raw changed between last capture and candidate generation does not publish PASS',async()=>{
 await upload();await click('現在データを明示的に再取得して比較');await click('復元候補に選択',host.querySelector('[data-preview-key="history:0"]')!);await click('復元計画を明示的に再生成');
 localStorage.setItem(STORAGE_KEY,raw+' ');await click(prepare);expect(state()).not.toBe('原文保持・候補生成: PASS');
});
it('application storage conflict remains BLOCKED after original raw returns; reacquisition cannot clear protection',async()=>{
 const { CalculatorApp }=await import('../components/CalculatorApp');
 vi.stubGlobal('ResizeObserver',class {observe(){}disconnect(){}});
 await act(async()=>root.render(createElement(CalculatorApp)));await act(async()=>new Promise(resolve=>setTimeout(resolve,20)));await click('選択復元プレビュー');await ready();expect(state()).toBe('原文保持・候補生成: PASS');
 localStorage.setItem(STORAGE_KEY,raw+' ');await act(async()=>window.dispatchEvent(new StorageEvent('storage',{key:STORAGE_KEY,newValue:raw+' '})));
 localStorage.setItem(STORAGE_KEY,raw);await act(async()=>window.dispatchEvent(new StorageEvent('storage',{key:STORAGE_KEY,newValue:raw})));
 await click('現在データを明示的に再取得して比較');await click('復元計画を明示的に再生成');await click(prepare);
 expect(state()).toBe('原文保持・候補生成: BLOCKED');expect(host.textContent).toContain('現在の保存状態が未確認または保存保護中');expect(button(check).disabled).toBe(true);vi.unstubAllGlobals();
});
