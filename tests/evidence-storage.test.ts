import { describe, expect, it, vi } from 'vitest';
import { defaultData, loadData, saveDataChecked, STORAGE_KEY, withStorageWriteLock } from '../lib/storage';
import type { StoredData } from '../lib/types';
const base = (): StoredData => structuredClone(defaultData);
function store(initial: string | null = null) {
  let raw = initial;
  return { getItem: vi.fn(() => raw), setItem: vi.fn((_key: string, next: string) => { raw = next; }), raw: () => raw };
}
describe('evidence persistence boundary', () => {
  it('checks original bytes before any write and reads back a successful write', () => {
    const target = store(); const data = base();
    const result = saveDataChecked(data, null, target);
    expect(result).toEqual({ ok: true, raw: JSON.stringify(data) });
    expect(target.setItem).toHaveBeenCalledWith(STORAGE_KEY, JSON.stringify(data));
    expect(target.getItem.mock.calls.length).toBeGreaterThanOrEqual(4);
  });
  it('refuses changed source rather than overwrite another tab', () => {
    const target = store(JSON.stringify({ ...base(), extra: 'other tab' }));
    expect(saveDataChecked(base(), JSON.stringify(base()), target)).toEqual({ ok: false, reason: 'conflict' });
    expect(target.setItem).not.toHaveBeenCalled();
  });
  it('reports write failure without a successful record', () => {
    const target = store(); target.setItem.mockImplementation(() => { throw new Error('quota'); });
    expect(saveDataChecked(base(), null, target)).toEqual({ ok: false, reason: 'unavailable' });
    expect(target.raw()).toBeNull();
  });
  it('does not claim success when write is silently dropped', () => {
    const target = store(); target.setItem.mockImplementation(() => undefined);
    expect(saveDataChecked(base(), null, target)).toEqual({ ok: false, reason: 'conflict' });
  });
  it('protects malformed and future evidence on load and save', () => {
    for (const calculationEvidence of [{ version: 2, records: [] }, { version: 1, records: [{}] }, null]) {
      const data = { ...base(), notes: [{ id: 'note', type: 'plain-calculation', title: '', content: '', createdAt: '', updatedAt: '', blocks: [], calculationEvidence }] } as unknown as StoredData;
      const target = store(JSON.stringify(data));
      expect(loadData(target).status).toBe('error');
      expect(saveDataChecked(base(), target.raw(), target).ok).toBe(false);
      expect(target.setItem).not.toHaveBeenCalled();
      const empty = store(); expect(saveDataChecked(data, null, empty).ok).toBe(false); expect(empty.setItem).not.toHaveBeenCalled();
    }
  });
  it('preserves old no-history notes and opaque fields without fabricating evidence', () => {
    const data = { ...base(), notes: [{ id: 'note', type: 'plain-calculation' as const, title: '', content: '', createdAt: '', updatedAt: '', blocks: [], future: { x: 2 } }] };
    const target = store(JSON.stringify(data)); const loaded = loadData(target);
    expect(loaded.status).toBe('ok');
    if (loaded.status !== 'ok') throw new Error('load');
    expect(saveDataChecked(loaded.data, loaded.raw, target).ok).toBe(true);
    expect(JSON.parse(target.raw()!).notes[0]).toEqual(data.notes[0]);
    expect(target.raw()).not.toContain('calculationEvidence');
  });
  it('serializes same-client writers and recovers the queue after rejection', async () => {
    const order: number[] = []; let release!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    const one = withStorageWriteLock(async () => { order.push(1); await pending; order.push(2); });
    const two = withStorageWriteLock(() => { order.push(3); });
    await Promise.resolve(); expect(order).toEqual([1]); release(); await Promise.all([one, two]); expect(order).toEqual([1, 2, 3]);
    await expect(withStorageWriteLock(() => { throw new Error('failure'); })).rejects.toThrow('failure');
    expect(await withStorageWriteLock(() => 7)).toBe(7);
  });
});
