import { vi } from 'vitest';
/** Each case represents a fresh page runtime. Keep Storage.prototype (so native
 * method fault injection/brand checks still work), but give the facade a fresh
 * underlying identity. Production intentionally has no API to clear UNKNOWN.
 * Clearing bytes or unmounting React within a case must NOT clear its HOLD. */
export function freshStorageRuntime(): void {
  vi.stubGlobal('localStorage', new Proxy(window.localStorage, {}));
}
