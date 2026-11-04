import { expect,it,describe } from 'vitest';
import { simulateStorage,type Fault } from './helpers/selective-storage-simulator';
import { setup } from './helpers/selective-safety-fixture';
import { STORAGE_KEY } from '../lib/storage';
import { RECOVERY_KEYS } from '../lib/restore-storage';
describe('test-only storage fault model; no automatic rollback/retry',()=>{
 const f=setup();const c=f.candidate();
 it('normal candidate is applied once only in a synthetic adapter with a verified preservation record',()=>{
  const r=simulateStorage(c.raw!,f.context.currentRaw!);expect(r.status).toBe('SUCCESS');expect(r.writes.filter(k=>k===STORAGE_KEY)).toHaveLength(1);
  expect(r.data.get(STORAGE_KEY)).toBe(c.raw);expect(JSON.parse(r.data.get(RECOVERY_KEYS[0])!).raw).toBe(f.context.currentRaw);
 });
 it.each(['before','quota','read','preserve','copy-read','stale','other-tab','same-tab','aba'] as Fault[])('refuses before primary write on %s',fault=>{
  const r=simulateStorage(c.raw!,f.context.currentRaw!,fault);expect(r.status).toBe('FAILURE');expect(r.writes.filter(k=>k===STORAGE_KEY)).toHaveLength(0);expect(r.attempted).toBe(false);
 });
 it.each(['write','mismatch','recovery','interrupt'] as Fault[])('retains UNKNOWN and never retries or rolls back on %s',fault=>{
  const r=simulateStorage(c.raw!,f.context.currentRaw!,fault);expect(r.status).toBe('UNKNOWN');expect(r.attempted).toBe(true);expect(r.writes.filter(k=>k===STORAGE_KEY).length).toBeLessThanOrEqual(1);expect(r.data.get(RECOVERY_KEYS[0])).toBeTruthy();
  if(fault==='write')expect(r.data.get(STORAGE_KEY)).toBe(c.raw);if(fault==='recovery'){expect(r.reason).toBe('primary result unconfirmed');expect(r.recovery).toContain('first failure retained');}
 });
 it('demonstrates that unobserved ABA cannot be detected by raw equality alone',()=>{
  const map=new Map([[STORAGE_KEY,'A']]);const before=map.get(STORAGE_KEY);map.set(STORAGE_KEY,'B');map.set(STORAGE_KEY,'A');expect(map.get(STORAGE_KEY)).toBe(before);
 });
});
