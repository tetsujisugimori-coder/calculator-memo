import { LEDGER_KEY, type ExclusiveLock, type Store } from './coordinator';

export type Access = { op: 'get' | 'set'; key: string; value?: string; at: 'before' | 'after' };
export type Injection = { matches: (access: Access) => boolean; action: (store: FaultStore, access: Access) => void; fired: number };
/** Actual getItem/setItem implementation, not a boolean outcome simulator.
 * The trace proves the injected fault occurred and counts actual primary writes. */
export class FaultStore implements Store {
  readonly values = new Map<string, string>();
  readonly trace: Access[] = [];
  readonly injections: Injection[] = [];
  inject(matches: Injection['matches'], action: Injection['action']): Injection {
    const fault = { matches, action, fired: 0 }; this.injections.push(fault); return fault;
  }
  private access(a: Access) {
    this.trace.push({ ...a });
    for (const fault of this.injections) if (!fault.fired && fault.matches(a)) { fault.fired++; fault.action(this, a); }
  }
  getItem(key: string): string | null {
    this.access({ op: 'get', key, at: 'before' });
    const value = this.values.get(key) ?? null;
    this.access({ op: 'get', key, at: 'after' });
    return value;
  }
  setItem(key: string, value: string): void {
    this.access({ op: 'set', key, value, at: 'before' });
    this.values.set(key, value);
    this.access({ op: 'set', key, value, at: 'after' });
  }
}

/** Shared across coordinator instances, like a single Web Locks resource. */
export function memoryExclusive(): ExclusiveLock {
  let held = false;
  return async work => {
    if (held) throw Error('lock unavailable');
    held = true; try { return await work(); } finally { held = false; }
  };
}

/** Logical keys are remapped: no product key is touched in browser tests.
 * Also requires a dedicated fresh origin/context in the runner. */
export function isolatedStore(storage: Store, namespace: string): Store {
  if (!/^stage3b-test-[a-zA-Z0-9-]+:$/.test(namespace)) throw Error('test namespace required');
  return { getItem: key => storage.getItem(namespace + key), setItem: (key, value) => storage.setItem(namespace + key, value) };
}

export const isLedgerPhase = (phase: string) => (a: Access) => a.key === LEDGER_KEY && a.op === 'set' && a.at === 'after'
  && (JSON.parse(a.value!).records.at(-1).phase === phase);
