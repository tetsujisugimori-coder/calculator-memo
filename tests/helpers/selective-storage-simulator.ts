// TEST ONLY. Never imported by lib/components/app. This is an executable fault
// model, not a product write path or proof of localStorage atomicity/durability.
import { preserveRestoreSource, RECOVERY_KEYS } from '../../lib/restore-storage';
import { STORAGE_KEY } from '../../lib/storage';
export type Fault = 'before' | 'quota' | 'read' | 'write' | 'mismatch' | 'preserve' | 'copy-read' | 'stale' | 'other-tab' | 'same-tab' | 'aba' | 'recovery' | 'interrupt';
export function simulateStorage(candidate: string, initial: string, fault?: Fault) {
  const data = new Map<string,string>([[STORAGE_KEY,initial]]);
  const writes: string[] = []; let phase = 'before'; let attempted = false; let revision = 1;
  const expectedRevision = revision;
  const result = (status:'SUCCESS'|'FAILURE'|'UNKNOWN', reason:string, recovery?:string) => ({status,reason,recovery,phase,attempted,writes,data,revision});
  const adapter = {
    getItem(key:string):string|null {
      if(fault === 'read')throw Error('read unavailable');
      if(fault === 'copy-read' && RECOVERY_KEYS.includes(key) && data.has(key))throw Error('preservation readback failed');
      return data.get(key) ?? null;
    },
    setItem(key:string,value:string) {
      writes.push(key);
      if(RECOVERY_KEYS.includes(key) && (fault==='quota'||fault==='preserve'))throw Error(fault==='quota'?'QuotaExceededError':'copy write failed');
      if(key===STORAGE_KEY) {
        if(fault==='write'){data.set(key,value);throw Error('write raised after mutation');}
        data.set(key,fault==='mismatch'?'concurrent value':value);return;
      }
      data.set(key,value);
    },
  };
  try {
    if(fault==='before')return result('FAILURE','pre-write validation failed');
    if(fault==='stale')return result('FAILURE','stale generation');
    if(adapter.getItem(STORAGE_KEY)!==initial)return result('FAILURE','changed original');
    phase='preservation';
    const copy=preserveRestoreSource(adapter,initial);
    if(!copy.ok)return result('FAILURE',copy.message);
    phase='pre-write';
    if(fault==='same-tab'||fault==='other-tab'){data.set(STORAGE_KEY,'other writer');revision++;}
    if(fault==='aba'){data.set(STORAGE_KEY,'B');data.set(STORAGE_KEY,initial);revision++;}
    if(adapter.getItem(STORAGE_KEY)!==initial||revision!==expectedRevision)return result('FAILURE','observed conflict / ABA');
    attempted=true;phase='write';
    if(fault==='interrupt')return result('UNKNOWN','interrupted after write attempt marker');
    adapter.setItem(STORAGE_KEY,candidate);phase='readback';
    if(fault==='recovery')return result('UNKNOWN','primary result unconfirmed','manual recovery also failed; first failure retained');
    if(adapter.getItem(STORAGE_KEY)!==candidate)return result('UNKNOWN','post-write raw mismatch');
    return result('SUCCESS','single synthetic write and readback verified only');
  }catch(error){return result(attempted?'UNKNOWN':'FAILURE',String(error));}
}
