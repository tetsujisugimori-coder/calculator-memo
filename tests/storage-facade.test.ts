import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { executeStorageOperation, executeWithAdapter, runStorageOperation, type StorageAdapter, type StorageOperation } from '../lib/storage-facade';
import { defaultData, resetStoredDataChecked, saveData, saveDataChecked, STORAGE_KEY, withStorageWriteLock } from '../lib/storage';
import { preserveRestoreSource, RECOVERY_KEYS, restoreRaw } from '../lib/restore-storage';
import { deleteRecoveryCopy, holdRecoverySession, readRecoverySnapshot } from '../lib/recovery-manager';
const source = '{ "version":1,"history":[],"notes":[],"settings":{"theme":"light","activePanel":"history"},"unknown":{"exact":900719925474099312345} }';
const candidate = { ...defaultData, settings: { theme: 'dark' as const, activePanel: 'notes' as const } };
const target = JSON.stringify(candidate);
function fixture(initial: string | null = source) {
  const map = new Map<string, string>([['other-app', 'untouched']]);
  if (initial !== null) map.set(STORAGE_KEY, initial);
  return { map, getItem: vi.fn((key: string) => map.get(key) ?? null), setItem: vi.fn((key: string, raw: string) => { map.set(key, raw); }), removeItem: vi.fn((key: string) => { map.delete(key); }) };
}
type Fixture = ReturnType<typeof fixture>;
function locks() {
  vi.stubGlobal('navigator', { locks: { request: vi.fn(async (_name: string, options: unknown, callback?: (lock: object | null) => unknown) => typeof options === 'function' ? options({}) : callback!({})) } });
}
function operation(kind: 'ordinary-save' | 'reset' | 'preserve' | 'full-restore' | 'recovery-delete', store: Fixture, valid = () => true): StorageOperation {
  const context = { writer: `test-${kind}`, operationId: `fixture-${kind}`, valid };
  if (kind === 'ordinary-save') return { ...context, kind, data: candidate, expectedRaw: source };
  if (kind === 'reset') return { ...context, kind, expectedRaw: source, approvedAndCurrent: valid };
  if (kind === 'preserve') return { ...context, kind, expectedRaw: source };
  const preserved = preserveRestoreSource(store, source);
  if (!preserved.ok) throw Error('setup preservation');
  if (kind === 'full-restore') return { ...context, kind, raw: target, expectedRaw: source, copy: preserved.copy, approvedAndCurrent: valid };
  return { ...context, kind, key: preserved.copy.key, snapshot: readRecoverySnapshot(store), approvedAndCurrent: valid };
}
const execute = (request: StorageOperation, store: Fixture) => request.kind === 'recovery-delete' ? runStorageOperation(request, store) : Promise.resolve(executeStorageOperation(request, store));
beforeEach(() => { locks(); vi.spyOn(console, 'error').mockImplementation(() => undefined); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('typed shared product storage facade', () => {
  it.each(['ordinary-save', 'reset', 'preserve', 'full-restore', 'recovery-delete'] as const)('verifies %s and never touches another app', async kind => {
    const store = fixture(); const request = operation(kind, store);
    store.setItem.mockClear(); store.removeItem.mockClear();
    const result = await execute(request, store);
    expect(result).toMatchObject({ status: 'VERIFIED', diagnostic: { operation: kind, operationId: `fixture-${kind}`, writer: `test-${kind}`, mutationAttempted: true, hold: false } });
    expect(store.map.get('other-app')).toBe('untouched');
    if (kind === 'preserve' || kind === 'recovery-delete') expect(store.map.get(STORAGE_KEY)).toBe(source);
    if (kind === 'preserve') expect(result.copy?.raw).toBe(source);
    if (kind === 'full-restore') expect(store.map.get(RECOVERY_KEYS[0])).toContain('900719925474099312345');
    expect(store.setItem.mock.calls.length + store.removeItem.mock.calls.length).toBe(1);
  });
  it('keeps v1 data and recovery envelopes free of runtime metadata', () => {
    const store = fixture(); const preserved = preserveRestoreSource(store, source);
    expect(preserved.ok).toBe(true);
    expect(Object.keys(JSON.parse(store.map.get(RECOVERY_KEYS[0])!))).toEqual(['format', 'version', 'createdAt', 'sourceKey', 'raw', 'utf16CodeUnits']);
    expect(saveDataChecked(candidate, source, store).ok).toBe(true);
    expect(store.map.get(STORAGE_KEY)).toBe(target);
    expect(store.map.get(STORAGE_KEY)).not.toMatch(/operationId|generation|receipt|incarnation|protocolVersion/);
  });
  it('does not rewrite an unchanged checked raw or create redundant recovery copies', () => {
    const store = fixture(target);
    expect(saveDataChecked(candidate, target, store)).toEqual({ ok: true, raw: target });
    expect(store.setItem).not.toHaveBeenCalled();
    expect(preserveRestoreSource(store, target).ok).toBe(true);
    expect(preserveRestoreSource(store, target).ok).toBe(true);
    expect(store.setItem).toHaveBeenCalledTimes(1);
  });
  it('routes legacy helper through verified facade readback instead of assuming set success', () => {
    const store = fixture(); store.setItem.mockImplementation(() => undefined);
    expect(saveData(candidate, store)).toBe(false);
    expect(saveData(candidate, store)).toBe(false);
    expect(store.setItem).toHaveBeenCalledTimes(1);
  });
  it.each(['ordinary-save', 'reset', 'preserve', 'full-restore', 'recovery-delete'] as const)('refuses stale %s before any mutation', async kind => {
    const store = fixture(); const request = operation(kind, store);
    store.setItem.mockClear(); store.removeItem.mockClear(); store.map.set(STORAGE_KEY, target);
    expect((await execute(request, store)).status).toBe('CONFLICT');
    expect(store.setItem).not.toHaveBeenCalled(); expect(store.removeItem).not.toHaveBeenCalled();
    expect(store.map.get(STORAGE_KEY)).toBe(target);
  });
  it.each(['ordinary-save', 'reset', 'preserve', 'full-restore', 'recovery-delete'] as const)('refuses expired %s approval/validation before mutation', async kind => {
    const store = fixture(); let valid = true; const request = operation(kind, store, () => valid);
    store.setItem.mockClear(); store.removeItem.mockClear(); valid = false;
    expect((await execute(request, store)).status).toBe('BLOCKED');
    expect(store.setItem).not.toHaveBeenCalled(); expect(store.removeItem).not.toHaveBeenCalled();
  });
  it('checks validation again immediately before the ordinary write', () => {
    const store = fixture(); let calls = 0;
    const result = executeStorageOperation({ kind: 'ordinary-save', writer: 'stale', data: candidate, expectedRaw: source, valid: () => ++calls < 2 }, store);
    expect(result.status).toBe('BLOCKED'); expect(store.setItem).not.toHaveBeenCalled();
  });
  it('rejects malformed candidate before lossy JSON serialization and never repairs invalid destination', () => {
    const store = fixture('{broken');
    expect(executeStorageOperation({ kind: 'ordinary-save', writer: 'test', data: candidate, expectedRaw: '{broken' }, store).status).toBe('INVALID');
    expect(store.setItem).not.toHaveBeenCalled(); expect(store.map.get(STORAGE_KEY)).toBe('{broken');
    const clean = fixture();
    expect(executeStorageOperation({ kind: 'ordinary-save', writer: 'test', data: { ...candidate, notes: [{}] } as never, expectedRaw: source }, clean).status).toBe('INVALID');
    expect(clean.setItem).not.toHaveBeenCalled();
  });
  it('reports unavailable storage/missing API and throwing preflight without mutation', () => {
    const request: StorageOperation = { kind: 'ordinary-save', writer: 'test', data: candidate, expectedRaw: source };
    expect(executeStorageOperation(request, { getItem: () => source }).status).toBe('UNAVAILABLE');
    const store = fixture(); store.getItem.mockImplementation(() => { throw Error('read denied'); });
    expect(executeStorageOperation(request, store)).toMatchObject({ status: 'UNAVAILABLE', diagnostic: { mutationAttempted: false } });
    expect(store.setItem).not.toHaveBeenCalled();
    store.getItem.mockImplementation(key => store.map.get(key) ?? null);
    expect(executeStorageOperation({ ...request, valid: () => { throw Error('preflight'); } }, store).status).toBe('UNAVAILABLE');
    expect(executeStorageOperation(request, store).status).toBe('VERIFIED'); // Known pre-mutation failures do not latch HOLD.
  });
  it.each([1, 2, 3])('read failure at ordinary read %s is pre-mutation UNAVAILABLE', count => {
    const store = fixture(); let reads = 0;
    store.getItem.mockImplementation(key => { if (++reads === count) throw Error('read'); return store.map.get(key) ?? null; });
    expect(executeStorageOperation(operation('ordinary-save', store), store)).toMatchObject({ status: 'UNAVAILABLE', diagnostic: { mutationAttempted: false } });
    expect(store.setItem).not.toHaveBeenCalled();
  });
  it('rejects selective restore even if an unsafe caller fabricates executionAllowed=true', async () => {
    const store = fixture();
    for (const executionAllowed of [false, true]) {
      const result = await runStorageOperation({ kind: 'selective-restore', writer: 'selection-preview', executionAllowed } as StorageOperation, store);
      expect(result.status).toBe('BLOCKED'); expect(result.message).toContain('executionAllowed=false');
    }
    expect(store.setItem).not.toHaveBeenCalled(); expect(store.removeItem).not.toHaveBeenCalled();
  });
});

describe('UNKNOWN attempt boundary and page-lifetime HOLD', () => {
  const kinds = ['ordinary-save', 'reset', 'preserve', 'full-restore', 'recovery-delete'] as const;
  for (const kind of kinds) {
    it.each(['throw-before', 'throw-after', 'drop', 'mismatch', 'readback-failure', 'expired-after'] as const)(`${kind}: %s is UNKNOWN and retries across all helpers make zero mutations`, async fault => {
      const store = fixture(); let valid = true; const request = operation(kind, store, () => valid);
      store.setItem.mockClear(); store.removeItem.mockClear();
      const mutate = (key: string, raw?: string) => {
        if (fault === 'throw-before') throw Error('quota');
        if (fault !== 'drop') { if (raw === undefined) store.map.delete(key); else store.map.set(key, raw); }
        if (fault === 'throw-after') throw Error('after');
        if (fault === 'mismatch') store.map.set(key, 'intervening writer');
        if (fault === 'readback-failure') store.getItem.mockImplementation(() => { throw Error('readback'); });
        if (fault === 'expired-after') valid = false;
      };
      store.setItem.mockImplementation(mutate); store.removeItem.mockImplementation(key => mutate(key));
      const result = await execute(request, store);
      expect(result).toMatchObject({ status: 'UNKNOWN', diagnostic: { mutationAttempted: true, hold: true } });
      const attempted = store.setItem.mock.calls.length + store.removeItem.mock.calls.length;
      expect(attempted).toBe(1);
      // Even API recovery, fresh approval, byte restoration and another helper do
      // not erase the unknown operation or license a duplicate mutation.
      valid = true; store.getItem.mockImplementation(key => store.map.get(key) ?? null);
      expect(executeStorageOperation(operation('ordinary-save', store), store)).toMatchObject({ status: 'BLOCKED', diagnostic: { hold: true } });
      expect(saveDataChecked(candidate, store.getItem(STORAGE_KEY), store)).toEqual({ ok: false, reason: 'uncertain' });
      expect(resetStoredDataChecked(store.getItem(STORAGE_KEY), store)).toEqual({ ok: false, reason: 'uncertain' });
      expect(preserveRestoreSource(store, store.getItem(STORAGE_KEY))).toMatchObject({ ok: false, uncertain: true });
      expect(saveData(candidate, store)).toBe(false);
      expect(store.setItem.mock.calls.length + store.removeItem.mock.calls.length).toBe(attempted);
      expect(store.map.get('other-app')).toBe('untouched');
    });
  }
  it('full restore and deletion compatibility wrappers retain a pre-existing UNKNOWN HOLD', async () => {
    const store = fixture(); const preserved = preserveRestoreSource(store, source); if (!preserved.ok) throw Error('setup');
    const snapshot = readRecoverySnapshot(store);
    store.setItem.mockImplementation(() => { throw Error('after invocation'); });
    expect(saveDataChecked(candidate, source, store)).toEqual({ ok: false, reason: 'uncertain' });
    expect(restoreRaw(store, target, source, preserved.copy, () => true).status).toBe('unknown');
    expect((await deleteRecoveryCopy(store, snapshot, preserved.copy.key, () => true)).status).toBe('unknown');
    expect(store.removeItem).not.toHaveBeenCalled();
  });
});

describe('facade cooperative lock policy and fault fencing', () => {
  it('uses the existing write lock, checks stale requests after acquisition, and never falls back on denial', async () => {
    const store = fixture(); let callback!: () => unknown;
    vi.stubGlobal('navigator', { locks: { request: (_name: string, cb: () => unknown) => new Promise(resolve => { callback = () => resolve(cb()); }) } });
    let valid = true;
    const pending = runStorageOperation(operation('ordinary-save', store, () => valid), store);
    await Promise.resolve(); valid = false; callback();
    expect((await pending).status).toBe('BLOCKED'); expect(store.setItem).not.toHaveBeenCalled();
    vi.stubGlobal('navigator', { locks: { request: vi.fn(() => Promise.reject(Error('denied'))) } });
    expect((await runStorageOperation(operation('ordinary-save', store), store)).status).toBe('UNAVAILABLE');
    expect(store.setItem).not.toHaveBeenCalled(); expect(navigator.locks.request).toHaveBeenCalledTimes(1);
  });
  it('retains the same-tab-only ordinary fallback when Web Locks is absent, but refuses deletion', async () => {
    const store = fixture(); const deletion = operation('recovery-delete', store); store.setItem.mockClear();
    vi.stubGlobal('navigator', {});
    expect((await runStorageOperation(deletion, store)).status).toBe('UNAVAILABLE'); expect(store.removeItem).not.toHaveBeenCalled();
    expect((await runStorageOperation(operation('ordinary-save', store), store)).status).toBe('VERIFIED');
  });
  it('public sync/adapter calls cannot bypass the exclusive recovery-session requirement', async () => {
    const store = fixture(); const request = operation('recovery-delete', store);
    const adapter: StorageAdapter = { identity: store, kind: 'fixture', canSet: true, canRemove: true, read: store.getItem, write: store.setItem, remove: store.removeItem };
    for (const supported of [true, false]) {
      if (!supported) vi.stubGlobal('navigator', {});
      const release = holdRecoverySession(() => undefined);
      expect(executeStorageOperation(request, store).status).toBe('BLOCKED');
      expect(executeWithAdapter(request, adapter).status).toBe('BLOCKED');
      expect((await runStorageOperation(request, store)).status).not.toBe('VERIFIED');
      release();
    }
    expect(store.removeItem).not.toHaveBeenCalled();
  });
  it.each(['ordinary-save', 'reset', 'preserve', 'full-restore', 'recovery-delete'] as const)('%s: lock rejection after mutation is UNKNOWN, not observed VERIFIED', async kind => {
    const store = fixture(); const request = operation(kind, store); store.setItem.mockClear(); store.removeItem.mockClear();
    vi.stubGlobal('navigator', { locks: { request: async (_name: string, options: unknown, callback?: (lock: object) => unknown) => {
      if (typeof options === 'function') await options({}); else await callback!({});
      throw Error('lock release after callback');
    } } });
    expect(await runStorageOperation(request, store)).toMatchObject({ status: 'UNKNOWN', diagnostic: { mutationAttempted: true, hold: true, phase: 'lock' } });
    expect(store.setItem.mock.calls.length + store.removeItem.mock.calls.length).toBe(1);
    locks(); expect(saveDataChecked(candidate, store.getItem(STORAGE_KEY), store)).toEqual({ ok: false, reason: 'uncertain' });
  });
  it('caller-owned compatibility lock also latches HOLD when it rejects after a verified helper callback', async () => {
    const store = fixture();
    vi.stubGlobal('navigator', { locks: { request: async (_name: string, callback: () => unknown) => { await callback(); throw Error('release'); } } });
    await expect(withStorageWriteLock(() => saveDataChecked(candidate, source, store))).rejects.toThrow('UNKNOWN');
    expect(store.setItem).toHaveBeenCalledTimes(1);
    expect(resetStoredDataChecked(target, store)).toEqual({ ok: false, reason: 'uncertain' });
  });
  it('fences an ordinary callback invoked after a broken lock manager already rejected', async () => {
    const store = fixture(); let late!: () => unknown;
    vi.stubGlobal('navigator', { locks: { request: (_name: string, cb: () => unknown) => { late = cb; return Promise.reject(Error('denied')); } } });
    expect((await runStorageOperation(operation('ordinary-save', store), store)).status).toBe('UNAVAILABLE');
    await expect(late()).rejects.toThrow('失効'); expect(store.setItem).not.toHaveBeenCalled();
  });
  it('fences a late recovery-session callback after lock-manager rejection', async () => {
    const store = fixture(); const deletion = operation('recovery-delete', store); let late!: (lock: object) => Promise<unknown>;
    vi.stubGlobal('navigator', { locks: { request: (_name: string, _options: unknown, cb: typeof late) => { late = cb; return Promise.reject(Error('denied')); } } });
    expect((await runStorageOperation(deletion, store)).status).toBe('UNAVAILABLE');
    expect(await late({})).toMatchObject({ status: 'BLOCKED' }); expect(store.removeItem).not.toHaveBeenCalled();
  });
  it('allows a non-Web-Storage fixture adapter while keeping the same raw checks and UNKNOWN contract', () => {
    const store = fixture();
    const adapter: StorageAdapter = { identity: store, kind: 'isolated-future-adapter-contract', canSet: true, canRemove: true, read: store.getItem, write: store.setItem, remove: store.removeItem };
    expect(executeWithAdapter(operation('ordinary-save', store), adapter).status).toBe('VERIFIED');
    expect(store.map.get(STORAGE_KEY)).toBe(target);
  });
});
