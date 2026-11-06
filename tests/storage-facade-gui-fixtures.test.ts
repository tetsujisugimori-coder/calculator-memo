import { describe, expect, it } from 'vitest';
import { backup, key, source, protectedRaw, target, recoveryRecord } from '../e2e/storage-facade-fixtures.mjs';
import { validateRestoreBackup, validateRestoreRaw } from '../lib/restore-validation';
import { loadData } from '../lib/storage-format';
import { inspectRecoverySlot } from '../lib/recovery-reader';

describe('additional real-app GUI synthetic fixtures', () => {
  it('fixed restore target passes strict validation without normalization and retains its lexical source', () => {
    const text = backup(target);
    const parsed = JSON.parse(text);
    expect(parsed.entries[0].counts).toEqual({ history: 1, notes: 1, formulas: 0, reports: 0, executions: 0 });
    expect(parsed.entries[0].key).toBe(key);
    expect(parsed.entries[0].utf16CodeUnits).toBe(target.length);
    expect(target).toContain('900719925474099312345');
    expect(target.startsWith(' \n')).toBe(true);
    expect(target.endsWith('\t')).toBe(true);
    const checked = validateRestoreBackup(text, Buffer.byteLength(text, 'utf8'));
    expect(checked.ok).toBe(true);
    if (!checked.ok) throw new Error(checked.message);
    expect(checked.raw).toBe(target);
    expect(checked.counts).toEqual({ history: 1, notes: 1, formulas: 0, reports: 0, executions: 0 });
  });
  it('synthetic healthy source and copy are valid while reset source is protected as unsupported version', () => {
    expect(validateRestoreRaw(source).ok).toBe(true);
    expect(loadData({ getItem: () => protectedRaw })).toMatchObject({ status: 'error', reason: 'unsupported-version', raw: protectedRaw });
    expect(inspectRecoverySlot('calculation-memo:restore-recovery:v1:0', recoveryRecord)).toMatchObject({ status: 'valid', copy: { raw: source } });
  });
  it('wrong expected counts fail validation rather than being silently corrected by the test helper', () => {
    const broken = JSON.parse(backup(target));
    broken.entries[0].counts.history = 99;
    const text = JSON.stringify(broken);
    expect(validateRestoreBackup(text, Buffer.byteLength(text, 'utf8')).ok).toBe(false);
  });
});
