import { describe, expect, it, vi } from 'vitest';
import { readSyntheticStore } from '../e2e/fixtures/storage-reconciliation';

const name = 'stage3b4-test-environment';
const asFactory = (mock: unknown): IDBFactory => mock as IDBFactory;

describe('Stage 3B-7A bounded environment access', () => {
  it('never opens an absent IndexedDB during read-only enumeration', async () => {
    const open = vi.fn();
    const factory = asFactory({ databases: async () => [], open });
    expect(await readSyntheticStore(name, 'records', factory)).toEqual({ kind: 'absent' });
    expect(open).not.toHaveBeenCalled();
  });
  it('unknown database catalog access cannot be treated as absence or PASS', async () => {
    const open = vi.fn();
    const factory = asFactory({ databases: async () => { throw new Error('catalog denied'); }, open });
    const result = await readSyntheticStore(name, 'records', factory);
    expect(result.kind).toBe('unavailable');
    expect(result.kind === 'unavailable' && result.reason).toContain('database-enumeration-failed');
    expect(open).not.toHaveBeenCalled();
  });
  it('an open exception after successful enumeration remains unavailable', async () => {
    const factory = asFactory({
      databases: async () => [{ name, version: 1 }],
      open: () => { throw new Error('synchronous open denied'); },
    });
    expect((await readSyntheticStore(name, 'records', factory)).kind).toBe('unavailable');
  });
  it('deletion between enumeration and open aborts upgrade and remains UNKNOWN, not absent', async () => {
    const abort = vi.fn();
    const request: Record<string, unknown> = { transaction: { abort } };
    const factory = asFactory({
      databases: async () => [{ name, version: 1 }],
      open: () => {
        queueMicrotask(() => {
          (request.onupgradeneeded as () => void)();
          (request.onerror as () => void)();
        });
        return request;
      },
    });
    const result = await readSyntheticStore(name, 'records', factory);
    expect(abort).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ kind: 'unavailable', reason: 'store-disappeared-between-enumeration-and-open' });
  });
  it('an unexpected database version is unavailable and closes the handle', async () => {
    const close = vi.fn();
    const request: Record<string, unknown> = {};
    const factory = asFactory({
      databases: async () => [{ name, version: 2 }],
      open: () => {
        queueMicrotask(() => (request.onsuccess as () => void)());
        return request;
      },
    });
    request.result = { version: 2, objectStoreNames: { length: 0, contains: () => false }, close };
    expect((await readSyntheticStore(name, 'records', factory)).kind).toBe('unavailable');
    expect(close).toHaveBeenCalledOnce();
  });
  it('must never be repurposed to read production database namespaces', async () => {
    const factory = asFactory({ databases: vi.fn(), open: vi.fn() });
    await expect(readSyntheticStore('calculator-production', 'records', factory)).rejects.toThrow('synthetic-namespace-required');
  });
});
