// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CalculatorApp } from '../components/CalculatorApp';
import { collectBackup, serializeBackup } from '../lib/backup';
import { STORAGE_KEY, defaultData } from '../lib/storage';
import { RECOVERY_KEYS } from '../lib/restore-storage';
const source = '{ "version":1, "history":[], "notes":[], "settings":{"theme":"light","activePanel":"history"}, "future":123456789012345678901234567890 }';
const target = '{\n "version":1,"history":[],"notes":[{"id":"restored","type":"plain-calculation","title":"復元メモ","content":"日本語😀\\n<safe>","createdAt":"2026-10-30T00:00:00Z","updatedAt":"2026-10-30T00:00:00Z"}],"settings":{"theme":"light","activePanel":"notes"},"future":123456789012345678901234567890\n}';
function envelope(raw=target) { const r=collectBackup({getItem:()=>raw}); if(r.status!=='ready') throw Error('fixture'); return serializeBackup(r.backup); }
let host: HTMLDivElement; let root: ReturnType<typeof createRoot>;
const pause=()=>new Promise(r=>setTimeout(r,20));
function button(label:string){const b=[...host.querySelectorAll('button')].find(b=>b.textContent===label);expect(b,label).toBeTruthy();return b!;}
async function click(label:string){await act(async()=>button(label).click());}
async function mount(){await act(async()=>root.render(createElement(CalculatorApp)));await act(pause);}
async function file(text=envelope()) { const input=host.querySelector('input[type=file]')!; Object.defineProperty(input,'files',{configurable:true,value:[{name:'long-復元.json',size:new TextEncoder().encode(text).length,text:async()=>text}]}); await act(async()=>input.dispatchEvent(new Event('change',{bubbles:true}))); }
async function prepare(){await click('JSONから復元');await act(pause);await file();await click('現在データを保全する');}
async function approve(){await act(async()=>host.querySelector<HTMLInputElement>('.restore-approval input')!.click());}
describe('safe restore app boundary',()=>{
 beforeEach(()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});localStorage.clear();localStorage.setItem(STORAGE_KEY,source);host=document.createElement('div');document.body.append(host);root=createRoot(host);});
 afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.restoreAllMocks();vi.unstubAllGlobals();});
 it('does not normalize already clean raw on load',async()=>{const write=vi.spyOn(Storage.prototype,'setItem');await mount();expect(write).not.toHaveBeenCalled();expect(localStorage.getItem(STORAGE_KEY)).toBe(source);});
 it('preview is read-only, approval is distinct and double execution cannot repeat the write',async()=>{
  await mount();const write=vi.spyOn(Storage.prototype,'setItem');await click('JSONから復元');await act(pause);await file();expect(write).not.toHaveBeenCalled();expect(host.textContent).toContain('異なります');
  expect(button('復元を実行する').disabled).toBe(true);await click('現在データを保全する');expect(localStorage.getItem(STORAGE_KEY)).toBe(source);expect(button('復元を実行する').disabled).toBe(true);await approve();
  await act(async()=>{button('復元を実行する').click();button('復元を実行する').click();});
  expect(write.mock.calls.filter(([key])=>key===STORAGE_KEY)).toHaveLength(1);expect(localStorage.getItem(STORAGE_KEY)).toBe(target);expect(host.textContent).toContain('画面状態を更新しました');
  expect(JSON.parse(localStorage.getItem(RECOVERY_KEYS[0])!).raw).toBe(source);
  await click('閉じる');await act(pause);expect(localStorage.getItem(STORAGE_KEY)).toBe(target);expect(host.textContent).toContain('復元メモ');
  const r=collectBackup(localStorage);expect(r.status).toBe('ready');if(r.status==='ready')expect(JSON.parse(serializeBackup(r.backup)).entries[0].raw).toBe(target);
  await act(async()=>root.unmount());root=createRoot(host);await mount();expect(localStorage.getItem(STORAGE_KEY)).toBe(target);
 });
 it('same-turn same-value notification revokes approval before final click',async()=>{
  await mount();await prepare();await approve();const write=vi.spyOn(Storage.prototype,'setItem');
  await act(async()=>{window.dispatchEvent(new StorageEvent('storage',{key:STORAGE_KEY,newValue:source}));button('復元を実行する').click();});
  expect(write).not.toHaveBeenCalled();expect(localStorage.getItem(STORAGE_KEY)).toBe(source);expect(host.textContent).toContain('失効');
 });
 it('same-tab raw change fails closed and keeps newer raw, without automatic rollback',async()=>{
  await mount();await prepare();await approve();const newer=JSON.stringify(defaultData);localStorage.setItem(STORAGE_KEY,newer);await click('復元を実行する');expect(localStorage.getItem(STORAGE_KEY)).toBe(newer);expect(host.textContent).toContain('上書きせず');
 });
 it('recovery quota failure cannot be bypassed by approval',async()=>{
  await mount();await click('JSONから復元');await act(pause);await file();vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw Error('QuotaExceeded');});await click('現在データを保全する');expect(button('復元を実行する').disabled).toBe(true);expect(localStorage.getItem(STORAGE_KEY)).toBe(source);expect(host.textContent).toContain('上書きしません');
 });
 it('invalid or replaced file loses prior authority; cancelled selection is not a restore',async()=>{
  await mount();await prepare();await approve();await file('{"format":"unrelated"}');expect(host.querySelector('.restore-approval')).toBeNull();expect(localStorage.getItem(STORAGE_KEY)).toBe(source);
  const input=host.querySelector('input[type=file]')!;Object.defineProperty(input,'files',{configurable:true,value:[]});await act(async()=>input.dispatchEvent(new Event('change',{bubbles:true})));expect(host.textContent).toContain('取り消しました');
 });
 it('Enter at body or final button cannot calculate or implicitly restore',async()=>{
  await mount();await prepare();await approve();const write=vi.spyOn(Storage.prototype,'setItem');await act(async()=>{document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));button('復元を実行する').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));});expect(write).not.toHaveBeenCalled();expect(localStorage.getItem(STORAGE_KEY)).toBe(source);
 });
 it('unknown write outcome stops later app autosave and keeps recovery',async()=>{
  await mount();await prepare();await approve();const original=Storage.prototype.setItem;vi.spyOn(Storage.prototype,'setItem').mockImplementation(function(this:Storage,k,v){original.call(this,k,v);if(k===STORAGE_KEY)throw Error('after write');});
  await click('復元を実行する');expect(host.textContent).toContain('UNKNOWN');expect(localStorage.getItem(STORAGE_KEY)).toBe(target);await click('閉じる');await act(pause);expect(localStorage.getItem(STORAGE_KEY)).toBe(target);expect(localStorage.getItem(RECOVERY_KEYS[0])).not.toBeNull();
 });
 it('does not discard or save an open memo editor',async()=>{
  await mount();await click('新規作成');
  // The underlying restore entry cannot be reached by a pointer while the modal
  // is open; programmatic activation proves the protective guard too.
  await click('JSONから復元');expect(host.textContent).toContain('編集中');expect(host.querySelector<HTMLInputElement>('input[type=file]')!.disabled).toBe(true);expect(localStorage.getItem(STORAGE_KEY)).toBe(source);
 });
 it('exposes original recovery JSON after remount without modifying current raw',async()=>{
  await mount();await prepare();await approve();await click('復元を実行する');
  await act(async()=>root.unmount());root=createRoot(host);await mount();await click('JSONから復元');await act(pause);
  const url=vi.fn((_blob: Blob)=> { void _blob; return 'blob:test'; });vi.stubGlobal('URL',Object.assign(URL,{createObjectURL:url,revokeObjectURL:vi.fn()}));vi.spyOn(HTMLAnchorElement.prototype,'click').mockImplementation(()=>{});
  const write=vi.spyOn(Storage.prototype,'setItem');await click('復旧コピー 1 を書き出す');
  const blob=url.mock.calls[0][0] as Blob;
  const text=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=reject;reader.readAsText(blob);});
  expect(JSON.parse(text).entries[0].raw).toBe(source);expect(write).not.toHaveBeenCalled();expect(localStorage.getItem(STORAGE_KEY)).toBe(target);
 });
 it('maintains missing-key initialization without treating it as a restored snapshot',async()=>{
  localStorage.removeItem(STORAGE_KEY);await mount();expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)).toEqual(defaultData);
 });

});
