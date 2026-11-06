/** Only this module may mutate Web Storage. No validation or retry belongs here. */
export type StorageAccess = Pick<Storage, 'getItem'> & Partial<Pick<Storage, 'setItem' | 'removeItem'>>;
export interface StorageAdapter {
  /** Stable, runtime-only identity for UNKNOWN HOLD. Not a persistent generation. */
  readonly identity: object;
  readonly kind: string;
  readonly canSet: boolean;
  readonly canRemove: boolean;
  read(key: string): string | null;
  write(key: string, raw: string): void;
  remove(key: string): void;
}
/** Synchronous adapter for the existing v1 store. IDB needs a transaction-aware
 * asynchronous facade implementation, not a promise cast into this interface. */
export function localStorageAdapter(storage: StorageAccess = localStorage): StorageAdapter {
  return {
    identity: storage, kind: 'localStorage-v1',
    canSet: typeof storage.setItem === 'function', canRemove: typeof storage.removeItem === 'function',
    read: key => storage.getItem(key),
    write: (key, raw) => { if (!storage.setItem) throw Error('Storage write unavailable'); storage.setItem(key, raw); },
    remove: key => { if (!storage.removeItem) throw Error('Storage delete unavailable'); storage.removeItem(key); },
  };
}
