import { createDecisionLifecycle, describeDecision, type Observation } from './storage-decision-lifecycle';
/** Test page only. Reads one synthetic key, never enumerates or writes storage. */
export function mountLifecycle(key: string) {
  if (!/^stage3b8-test-[A-Za-z0-9_-]{1,100}$/.test(key)) throw Error('synthetic-key-required');
  let failRead = false, disposed = false;
  const lifecycle = createDecisionLifecycle(async () => {
    if (failRead) throw Error('synthetic-read-failure');
    const raw = localStorage.getItem(key);
    if (raw === null) throw Error('missing-snapshot');
    return JSON.parse(raw) as Observation;
  });
  const display = document.querySelector<HTMLPreElement>('#report')!;
  const render = () => { display.textContent = JSON.stringify({ ...describeDecision(lifecycle.view()), id: lifecycle.view().id, checking: lifecycle.view().checking, writeAllowed: false }, null, 2); };
  const generate = async () => { const p=lifecycle.generate(); render(); await p; if (!disposed) render(); };
  const use = async () => { const p=lifecycle.useForReview(lifecycle.view().id); render(); const r=await p; if (!disposed) render(); return r; };
  const refresh = async () => { const p=lifecycle.revalidate(); render(); await p; if (!disposed) render(); };
  const storage = (event: StorageEvent) => {
    if (event.storageArea !== localStorage) return;
    lifecycle.notifyChange(event.key === key || event.key === null ? 'relevant' : 'unrelated-proven'); render();
  };
  const channel = new BroadcastChannel(key);
  const broadcast = (event: MessageEvent) => { lifecycle.notifyChange(event.data?.key === key ? 'relevant' : 'unknown'); render(); };
  const visibility = () => { if (document.visibilityState === 'visible') void refresh(); };
  const pageShow = () => { void refresh(); };
  window.addEventListener('storage', storage); channel.addEventListener('message', broadcast);
  document.addEventListener('visibilitychange', visibility); window.addEventListener('pageshow', pageShow);
  document.querySelector('#generate')!.addEventListener('click', generate);
  document.querySelector('#use')!.addEventListener('click', use);
  render();
  return { lifecycle, generate, use, render, setReadFailure(value: boolean) { failRead=value; },
    dispose() { disposed=true; lifecycle.close(); channel.close(); window.removeEventListener('storage', storage); channel.removeEventListener('message', broadcast); document.removeEventListener('visibilitychange', visibility); window.removeEventListener('pageshow', pageShow); document.querySelector('#generate')!.removeEventListener('click', generate); document.querySelector('#use')!.removeEventListener('click', use); render(); } };
}
