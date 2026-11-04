export const EXPECTED_STORAGE_CASES = Object.freeze({
  'normal-preserve-write-readback':'OBSERVED_MATCH',
  'write-fault-before':'UNKNOWN','write-fault-after':'UNKNOWN','write-fault-read':'UNKNOWN','write-fault-mismatch':'UNKNOWN',
  quota:'REFUSED','copy-read':'REFUSED','copy-mismatch':'REFUSED','same-tab-coordinator':'REFUSED','notified-ABA':'REFUSED',
  'unnotified-ABA-limit':'OBSERVED_MATCH','manual-recovery-first-failure-retained':'OBSERVED_MATCH',
  'cross-page-web-lock-and-storage-event':'REFUSED','actual-page-close-after-intent':'UNKNOWN',
  'actual-web-lock-steal-fences-suspended-writer':'UNKNOWN',
});
export function validateStorageResults(results, engines=['chromium','webkit']) {
  const errors=[];
  if(!Array.isArray(results)||results.length!==engines.length)return ['engine evidence missing'];
  if(new Set(results.map(r=>r.engine)).size!==engines.length)errors.push('duplicate engine');
  for(const engine of engines){
    const r=results.find(r=>r.engine===engine);
    if(r?.error)errors.push(`${engine}: exception recorded`);
    if(!r||r.status!=='PASS'||!Array.isArray(r.cases)||r.cases.length!==Object.keys(EXPECTED_STORAGE_CASES).length){errors.push(`${engine}: incomplete/failed`);continue;}
    if(!Array.isArray(r.pageerrors)||r.pageerrors.length)errors.push(`${engine}: pageerror evidence`);
    if(r.version!==(engine==='chromium'?'141.0.7390.37':'26.0'))errors.push(`${engine}: version mismatch`);
    if(new Set(r.cases.map(c=>c.name)).size!==Object.keys(EXPECTED_STORAGE_CASES).length)errors.push(`${engine}: duplicate case`);
    for(const [name,phase]of Object.entries(EXPECTED_STORAGE_CASES)) {
      const c=r.cases.find(c=>c.name===name);
      if(c?.phase!==phase)errors.push(`${engine}: ${name} missing/wrong result`);
      if(name==='cross-page-web-lock-and-storage-event'&&!(Number.isInteger(c?.events)&&c.events>0))errors.push(`${engine}: no actual storage notification`);
      if(name==='actual-page-close-after-intent'&&(c?.next!=='REFUSED'||c?.originalStillPresent!==true))errors.push(`${engine}: restart not fail-closed`);
      if(name==='actual-web-lock-steal-fences-suspended-writer'&&(c?.primaryCalls!==0||c?.originalStillPresent!==true))errors.push(`${engine}: late write after known lock loss`);
    }
  }
  return errors;
}
