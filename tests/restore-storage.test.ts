import { describe, expect, it, vi } from 'vitest';
import { preserveRestoreSource, readRecoveryCopies, restoreRaw, RECOVERY_KEYS } from '../lib/restore-storage';
import { STORAGE_KEY } from '../lib/storage';
const source = '{ old private source }';
const target = '{"version":1,"history":[],"notes":[],"settings":{"theme":"light","activePanel":"history"}}';
function fixture(raw: string | null = source) {
  const map = new Map<string,string>([['other-app','private']]); if(raw !== null) map.set(STORAGE_KEY,raw);
  return {map, getItem:vi.fn((k:string)=>map.get(k)??null), setItem:vi.fn((k:string,v:string)=>{map.set(k,v);})};
}
describe('immutable restore recovery and checked raw write',()=>{
 it('preserves source independently then writes exact raw without touching another app',()=>{
  const s=fixture(); const p=preserveRestoreSource(s,source); expect(p.ok).toBe(true); expect(s.map.get(STORAGE_KEY)).toBe(source);
  if(!p.ok)return; expect(restoreRaw(s,target,source,p.copy,()=>true)).toEqual({status:'verified'});
  expect(s.map.get(STORAGE_KEY)).toBe(target); expect(readRecoveryCopies(s)[0].raw).toBe(source); expect(s.map.get('other-app')).toBe('private');
 });
 it.each([null,'','{"version":999}'])('preserves missing/empty/unknown original %s',raw=>{
  const s=fixture(raw); const p=preserveRestoreSource(s,raw); expect(p.ok).toBe(true); if(!p.ok)return;
  expect(p.copy.raw).toBe(raw); expect(restoreRaw(s,target,raw,p.copy,()=>true).status).toBe('verified');
 });
 it('reuses only exact verified copies and never overwrites old slots',()=>{
  const s=fixture(); const a=preserveRestoreSource(s,source); expect(a.ok).toBe(true); const before=s.setItem.mock.calls.length;
  expect(preserveRestoreSource(s,source).ok).toBe(true); expect(s.setItem).toHaveBeenCalledTimes(before);
  s.map.set(STORAGE_KEY,'second'); expect(preserveRestoreSource(s,'second').ok).toBe(true); expect(readRecoveryCopies(s).map(c=>c.raw)).toEqual([source,'second']);
 });
 it('fails closed on full or corrupt recovery without deleting anything',()=>{
  const s=fixture(); for(let i=0;i<RECOVERY_KEYS.length;i++){s.map.set(STORAGE_KEY,String(i)); expect(preserveRestoreSource(s,String(i)).ok).toBe(true);}
  s.map.set(STORAGE_KEY,source); const before=[...s.map]; expect(preserveRestoreSource(s,source).ok).toBe(false); expect([...s.map]).toEqual(before);
  s.map.set(RECOVERY_KEYS[0],'broken'); expect(preserveRestoreSource(s,source).ok).toBe(false); expect(s.map.get(STORAGE_KEY)).toBe(source);
 });
 it.each(['throw','drop','corrupt'])('does not write data if recovery %s fails',mode=>{
  const s=fixture(); s.setItem.mockImplementation((k,v)=>{if(mode==='throw')throw Error('quota'); if(mode==='corrupt')s.map.set(k,v+'bad');});
  expect(preserveRestoreSource(s,source).ok).toBe(false); expect(s.map.get(STORAGE_KEY)).toBe(source); expect(s.setItem.mock.calls.every(([k])=>k!==STORAGE_KEY)).toBe(true);
 });
 it('refuses changed source, altered safety copy, or revoked authority',()=>{
  const s=fixture(); const p=preserveRestoreSource(s,source); if(!p.ok)throw Error('setup');
  s.map.set(STORAGE_KEY,'newer'); expect(restoreRaw(s,target,source,p.copy,()=>true).status).toBe('aborted'); expect(s.map.get(STORAGE_KEY)).toBe('newer');
  s.map.set(STORAGE_KEY,source); expect(restoreRaw(s,target,source,p.copy,()=>false).status).toBe('aborted');
  s.map.set(p.copy.key,'broken'); expect(restoreRaw(s,target,source,p.copy,()=>true).status).toBe('aborted'); expect(s.map.get(STORAGE_KEY)).toBe(source);
 });
 it.each(['throw-before','throw-after','different','read-failure'])('write outcome %s is UNKNOWN without rollback',mode=>{
  const s=fixture(); const p=preserveRestoreSource(s,source); if(!p.ok)throw Error('setup');
  s.setItem.mockImplementation((k,v)=>{if(mode==='throw-before')throw Error('quota');s.map.set(k,mode==='different'?'newer':v);if(mode==='throw-after')throw Error('uncertain');if(mode==='read-failure')s.getItem.mockImplementation(()=>{throw Error('read');});});
  expect(restoreRaw(s,target,source,p.copy,()=>true).status).toBe('unknown'); expect(s.setItem.mock.calls.filter(([k])=>k===STORAGE_KEY)).toHaveLength(1); expect(s.map.get(p.copy.key)).toBe(p.copy.serialized);
 });
 it('bounds current source and rejects an invalid restore candidate before main write',()=>{
  const s=fixture(); expect(preserveRestoreSource(s,'x'.repeat(2097153)).ok).toBe(false); const p=preserveRestoreSource(s,source); if(!p.ok)throw Error('setup');
  expect(restoreRaw(s,'{"version":999}',source,p.copy,()=>true).status).toBe('aborted'); expect(s.map.get(STORAGE_KEY)).toBe(source);
 });
});

it('bounds cumulative recovery JSON allocation without deleting prior source copies',()=>{
 const s=fixture(); const a='a'.repeat(1024*1024);
 for(let i=0;i<3;i++){s.map.set(STORAGE_KEY,a+i);expect(preserveRestoreSource(s,a+i).ok).toBe(true);}
 s.map.set(STORAGE_KEY,a+'fourth'); const before=[...s.map];expect(preserveRestoreSource(s,a+'fourth').ok).toBe(false);expect([...s.map]).toEqual(before);
});
