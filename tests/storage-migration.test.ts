import { describe, expect, it } from 'vitest';
import { createHash, webcrypto } from 'node:crypto';
import { classifyBranches, createMigrationEngine, details, hashRaw, inspectJournalRecords, journalRequiresHold, isEmptyDestination, HASH_ALGORITHM, type BaseEvidence } from '../e2e/fixtures/storage-migration';
import { inspectSnapshot, type Snapshot, type Token } from '../e2e/fixtures/storage-idb';
const rawA = ' \n{"version":1,"history":[],"notes":[],"settings":{"theme":"light","activePanel":"history"},"future":9007199254740993001}\t';
const rawB = rawA.replace('"light"', '"dark"');
const rawC = rawA.replace('"light"', '"system"');
const t0: Token = { structure: 1, incarnation: 'synthetic', generation: 0, latestOperation: 'genesis' };
const t1: Token = { ...t0, generation: 1, latestOperation: 'update' };
function genesis(raw = rawA): Snapshot {
  return { head: { ...t0, protocol: 1, legacyRaw: rawA }, current: raw, control: { protocol: 1, state: 'CLEAR' }, 'receipt:genesis': { protocol: 1, token: t0, previous: null, raw } };
}
function updated(raw = rawB): Snapshot {
  return { ...genesis(), head: { ...t1, protocol: 1, legacyRaw: rawA }, current: raw,
    'receipt:update': { protocol: 1, token: t1, previous: 'genesis', raw },
    'copy:1': { protocol: 1, source: t0, operationId: 'update', raw: rawA },
    'intent:update': { protocol: 1, operationId: 'update', expected: t0, expectedRaw: rawA, candidateRaw: raw, phase: 'READBACK_MATCH' } };
}
const base: BaseEvidence = { sourceRaw: rawA, targetRaw: rawA, targetToken: t0 };
describe('isolated migration pure classification, not write authority', () => {
  it.each([
    [null, null, 'ABSENT'], [rawA, null, 'ONLY_OLD'], [null, genesis(), 'ONLY_IDB'],
    [rawA, genesis(), 'SAME'], [rawB, genesis(), 'SOURCE_ONLY_CHANGE'],
    [rawA, updated(), 'TARGET_ONLY_CHANGE'], [rawC, updated(), 'BOTH_CHANGED'],
    [rawB, updated(), 'SAME'], [rawA, undefined, 'UNKNOWN'], [undefined, genesis(), 'UNKNOWN'],
    ['not JSON', genesis(), 'UNKNOWN'],
  ] as const)('classifies raw/verified receipt facts case %#', (source, target, expected) => {
    expect(classifyBranches(source, target, base)).toBe(expected);
  });
  it('missing causal evidence refuses to choose a newer side', () => {
    expect(classifyBranches(rawB, genesis())).toBe('UNKNOWN');
    expect(classifyBranches(rawA, updated())).toBe('UNKNOWN');
  });
  it('an initial target intentionally different from frozen source is UNCHANGED with proof', () => {
    expect(classifyBranches(rawA, genesis(rawB), { ...base, targetRaw: rawB })).toBe('UNCHANGED');
  });
  it('retained generation detects target ABA despite equal raw to base', () => {
    expect(inspectSnapshot(updated(rawA))).toBe(null);
    expect(classifyBranches(rawB, updated(rawA), base)).toBe('BOTH_CHANGED');
  });
  for (const corrupt of [
    (s: Snapshot) => { delete s['receipt:update']; },
    (s: Snapshot) => { (s.head as Token).generation = -1; },
    (s: Snapshot) => { (s.head as Token).generation = 0; },
    (s: Snapshot) => { (s.head as Token).incarnation = 'other'; },
    (s: Snapshot) => { s.current = '{}'; },
    (s: Snapshot) => { s.current = rawB.trim(); },
    (s: Snapshot) => { delete s['copy:1']; },
    (s: Snapshot) => { (s['receipt:update'] as { previous: string }).previous = 'invented'; },
    (s: Snapshot) => { s.control = null; },
  ]) it('corrupt or reversed history is UNKNOWN, never timestamp preference', () => {
    const s = structuredClone(updated()); corrupt(s);
    expect(classifyBranches(rawA, s, base)).toBe('UNKNOWN');
  });
  it.each([
    { ...base, sourceRaw: rawB }, { ...base, targetRaw: rawB },
    { ...base, targetToken: { ...t0, generation: 1 } },
    { ...base, targetToken: { ...t0, incarnation: 'invented' } },
    { ...base, targetToken: { ...t0, latestOperation: 'unretained' } },
  ])('rejects unverified claimed base %#', forged => {
    expect(classifyBranches(rawC, updated(), forged)).toBe('UNKNOWN');
  });
  it('equality is only exact raw, not normalized JSON equality', () => {
    expect(classifyBranches(rawA.trim(), genesis())).toBe('UNKNOWN');
    expect(classifyBranches(rawA.trim(), genesis(), base)).toBe('SOURCE_ONLY_CHANGE');
  });
});
describe('UTF-16 evidence hashing', () => {
  for (const raw of ['', rawA, '\ud800', '\udc00', '\ufffd', '😀', 'A\u0000B']) it('matches independent explicit UTF16LE hash ' + JSON.stringify(raw).slice(0, 30), async () => {
    // Vitest jsdom may lack subtle, so install Node's standard WebCrypto implementation.
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto });
    expect(await hashRaw(raw)).toBe(createHash('sha256').update(Buffer.from(raw, 'utf16le')).digest('hex'));
    expect(HASH_ALGORITHM).toBe('SHA-256/UTF-16LE-code-units');
  });
  it('does not merge lone surrogates with replacement characters', async () => {
    expect(await hashRaw('\ud800')).not.toBe(await hashRaw('\ufffd'));
    expect(await hashRaw(rawA)).not.toBe(await hashRaw(rawA.trim()));
  });
});
describe('isolation and read-only failures', () => {
  const source = { key: 'stage3b5-test-source', getItem: () => rawA };
  it.each(['calculation-memo:data', 'stage3b5-test-', 'stage3b5-test-../real', 'stage3b5-test-a/b'])('never reads unauthorized source %s', key => {
    let reads = 0;
    expect(() => createMigrationEngine({ source: { key, getItem: () => { reads++; return rawA; } }, targetName: 'stage3b4-test-target' })).toThrow('synthetic-namespace-required');
    expect(reads).toBe(0);
  });
  it.each(['calculation-memo', 'stage3b4-test-', 'stage3b4-test-../real'])('never opens unauthorized target %s', targetName => {
    expect(() => createMigrationEngine({ source, targetName })).toThrow('synthetic-namespace-required');
  });
  it('source changes while acquiring are UNKNOWN and cannot become a candidate', async () => {
    let raw = rawA, opens = 0;
    const engine = createMigrationEngine({ source: { ...source, getItem: () => raw }, targetName: 'stage3b4-test-race',
      factory: { open() { opens++; throw Error('unexpected-open'); } } as unknown as IDBFactory,
      fault(point) { if (point === 'source-after-read') raw = rawB; } });
    expect(await engine.preview()).toMatchObject({ state: 'UNKNOWN', reason: 'source-changed-during-read', executionAllowed: false });
    expect(opens).toBe(0);
  });
  it('raw unreadable preview is UNKNOWN without opening or writing destination', async () => {
    let opens = 0;
    const engine = createMigrationEngine({ source: { ...source, getItem() { throw Error('source-denied'); } }, targetName: 'stage3b4-test-denied', factory: { open() { opens++; throw Error('unexpected-open'); } } as unknown as IDBFactory });
    expect(await engine.preview()).toMatchObject({ state: 'UNKNOWN', reason: 'source-denied', executionAllowed: false });
    expect(opens).toBe(0);
  });
  it('invalid migration IDs cannot open a database and hold this instance', async () => {
    let opens = 0;
    const engine = createMigrationEngine({ source, targetName: 'stage3b4-test-invalid', factory: { open() { opens++; throw Error('unexpected-open'); } } as unknown as IDBFactory });
    const request = { migrationId: '../bad', expectedSourceRaw: rawA, expectedTargetRaw: rawA, expectedTargetToken: t0 };
    expect(await engine.migrate(request)).toMatchObject({ state: 'BLOCKED', executionAllowed: false });
    expect(await engine.migrate({ ...request, migrationId: 'good' })).toMatchObject({ state: 'BLOCKED', reason: 'busy-closed-or-terminal-hold' });
    expect(opens).toBe(0);
  });
  it('close fences requests rather than reopening a session', async () => {
    const engine = createMigrationEngine({ source, targetName: 'stage3b4-test-closed' }); engine.close();
    expect(await engine.migrate({ migrationId: 'closed', expectedSourceRaw: rawA, expectedTargetRaw: rawA, expectedTargetToken: t0 })).toMatchObject({ state: 'BLOCKED' });
    expect(await engine.preserveBranches({ rescueId: 'closed' })).toMatchObject({ state: 'BLOCKED' });
  });
});

describe('only explicitly empty canonical-content genesis is replaceable', () => {
  const empty = JSON.stringify({ version: 1, history: [], notes: [], settings: { theme: 'light', activePanel: 'history' } });
  it('allows empty v1 with exact settings and whitespace', () => expect(isEmptyDestination(' \n' + empty)).toBe(true));
  it.each([rawA, rawB, rawC, '{}', empty.replace('"light"', '"dark"'), empty.replace('"history":[]', '"history":[{}]'), empty.replace('"version":1', '"version":1,"version":1'), empty.replace('"notes":[]', '"notes":[],"unknown":[]')])('protects every nonempty, extra-field, corrupt or alternative-settings target %#', raw => expect(isEmptyDestination(raw)).toBe(false));
});


describe('append-only rescue evidence verification', () => {
  async function evidence(): Promise<Snapshot> {
    const branches = [
      { branchId: 'r-old', origin: 'OLD_LOCAL_STORAGE', raw: rawA, hash: await hashRaw(rawA), hashAlgorithm: HASH_ALGORITHM, schemaValid: true, ids: [], generation: null, receipt: null, parent: null },
      { branchId: 'r-idb', origin: 'ISOLATED_IDB', raw: rawB, hash: await hashRaw(rawB), hashAlgorithm: HASH_ALGORITHM, schemaValid: true, ids: [], generation: t1, receipt: 'update', parent: 'genesis' },
    ];
    return { 'rescue-attempt:r': { protocol: 1, state: 'PENDING', rescueId: 'r', source: 'stage3b5-test-source', destination: 'stage3b4-test-target' }, 'rescue:r': { protocol: 1, rescueId: 'r', source: 'stage3b5-test-source', destination: 'stage3b4-test-target', branches, targetEvidence: updated(), executionAllowed: false } };
  }
  it('validates independent branches and retained generation receipt chain', async () => expect(await inspectJournalRecords(await evidence())).toBe(null));
  for (const change of [
    (v: Record<string, unknown>) => { v.raw = rawC; },
    (v: Record<string, unknown>) => { v.hash = '0'.repeat(64); },
    (v: Record<string, unknown>) => { v.hashAlgorithm = 'UTF8'; },
    (v: Record<string, unknown>) => { v.branchId = 'other'; },
    (v: Record<string, unknown>) => { v.parent = 'unproved'; },
    (v: Record<string, unknown>) => { v.generation = { ...t1, generation: 9 }; },
    (v: Record<string, unknown>) => { v.receipt = 'missing'; },
    (v: Record<string, unknown>) => { v.ids = ['invented-id']; },
    (v: Record<string, unknown>) => { v.schemaValid = false; },
  ]) it('fails closed on corrupted branch metadata or raw', async () => {
    const s = await evidence(); change((s['rescue:r'] as {branches: Record<string, unknown>[]}).branches[1]);
    expect(await inspectJournalRecords(s)).not.toBe(null);
  });
  it('refuses to invent a source parent even with a valid target receipt', async () => {
    const s = await evidence(); (s['rescue:r'] as {branches: Record<string, unknown>[]}).branches[0].parent = 'genesis';
    expect(await inspectJournalRecords(s)).toBe('inferred-source-causality');
  });
  it('does not treat detached target token as retained history', async () => {
    const s = await evidence(); delete (s['rescue:r'] as {targetEvidence: Snapshot}).targetEvidence['receipt:update'];
    expect(await inspectJournalRecords(s)).toBe('invalid-branch-generation');
  });
  it('detects missing rescue attempt and unknown record types', async () => {
    const s = await evidence(); delete s['rescue-attempt:r'];
    expect(await inspectJournalRecords(s)).toBe('invalid-rescue-record');
    expect(await inspectJournalRecords({ foreign: { protocol: 1 } })).toBe('unknown-journal-record');
  });
  it('keeps corrupt raw as evidence without claiming schema or generation validity', async () => {
    const s = await evidence(), rescue = s['rescue:r'] as {branches: Record<string, unknown>[]; targetEvidence: Snapshot};
    rescue.targetEvidence.current = '{broken';
    rescue.branches[1] = { ...rescue.branches[1], raw: '{broken', hash: await hashRaw('{broken'), schemaValid: false, generation: null, receipt: null, parent: null };
    expect(await inspectJournalRecords(s)).toBe(null);
  });
  it('requires migration receipt hash and generation to match its attempt', async () => {
    const empty = JSON.stringify({ version: 1, history: [], notes: [], settings: { theme: 'light', activePanel: 'history' } });
    const receipt = { protocol: 1, state: 'VERIFIED', migrationId: 'm', sourceRaw: rawA, targetBeforeRaw: empty, before: t0, after: { ...t1, latestOperation: 'm' }, hash: await hashRaw(rawA), hashAlgorithm: HASH_ALGORITHM };
    const s = { 'attempt:m': { protocol: 1, state: 'VALIDATING', migrationId: 'm', source: 'stage3b5-test-source', destination: 'stage3b4-test-target' }, 'receipt:m': receipt };
    expect(await inspectJournalRecords(s)).toBe(null);
    receipt.before = { ...t0, latestOperation: 'invented' }; expect(await inspectJournalRecords(s)).toBe('invalid-migration-receipt');
    receipt.before = t0; receipt.hash = 'forged'; expect(await inspectJournalRecords(s)).toBe('invalid-migration-receipt');
  });
});


describe('restart never upgrades persisted rescue acknowledgment to coordinator completion', () => {
  it('holds even when rescue receipt exists and diagnostic persistence failed', () => {
    expect(journalRequiresHold({ 'rescue-attempt:r': { protocol: 1, state: 'PENDING' }, 'rescue:r': { protocol: 1, executionAllowed: false } })).toBe(true);
  });
  it('holds historical migration, rescue, and diagnostic evidence independently', () => {
    for (const key of ['attempt:m', 'rescue-attempt:r', 'diagnostic:r']) expect(journalRequiresHold({ [key]: { protocol: 1 } })).toBe(true);
    expect(journalRequiresHold({})).toBe(false);
  });
});
describe('journal scope and genesis consistency', () => {
  const attempt = { protocol: 1, state: 'VALIDATING', migrationId: 'm', source: 'stage3b5-test-source', destination: 'stage3b4-test-target' };
  it.each(['calculation-memo:data', 'stage3b5-test-', 'stage3b5-test-../real'])('rejects invalid source %s', async source => {
    expect(await inspectJournalRecords({ 'attempt:m': { ...attempt, source } })).toBe('invalid-journal-namespace');
  });
  it.each(['production', 'stage3b4-test-', 'stage3b4-test-../real'])('rejects invalid target %s', async destination => {
    expect(await inspectJournalRecords({ 'attempt:m': { ...attempt, destination } })).toBe('invalid-journal-namespace');
  });
  it('rejects otherwise valid evidence copied from a different isolated destination', async () => {
    expect(await inspectJournalRecords({ 'attempt:m': attempt }, { source: attempt.source, destination: 'stage3b4-test-other' })).toBe('journal-scope-mismatch');
  });
  it('rejects mixed isolated source scopes in one journal', async () => {
    expect(await inspectJournalRecords({ 'attempt:m': attempt, 'rescue-attempt:r': { protocol: 1, state: 'PENDING', rescueId: 'r', source: 'stage3b5-test-other', destination: attempt.destination } })).toBe('journal-scope-mismatch');
  });
  it('rejects operation ID key mismatch and reserved genesis reuse', async () => {
    expect(await inspectJournalRecords({ 'attempt:other': attempt })).toBe('invalid-migration-attempt');
    expect(await inspectJournalRecords({ 'attempt:genesis': { ...attempt, migrationId: 'genesis' } })).toBe('invalid-migration-attempt');
  });
});


describe('preview supported collection summaries', () => {
  it('counts supported nested collections and preserves identifier paths, excluding opaque arrays', () => {
    const date = '2026-10-30T00:00:00Z';
    const raw = JSON.stringify({ version: 1, settings: { theme: 'light', activePanel: 'history' },
      history: [{ id: 'h', expression: '1', displayExpression: '1', result: 1, resultText: '1', createdAt: date }],
      notes: [{ id: 'n', type: 'plain-calculation', title: 'memo', content: 'body', createdAt: date, updatedAt: date }],
      formulaLibrary: { version: 1, selectedId: 'f', entries: [{ id: 'f', title: 'formula', expression: 'x+1', createdAt: date, updatedAt: date }] },
      formulaReports: { version: 1, entries: [{ id: 'r', formulaId: 'f', title: 'report', body: 'body', createdAt: date, updatedAt: date, confirmedExpression: null }] },
      formulaExecutions: [{ formulaId: 'f', expression: 'x+1', inputs: { x: '2' } }], future: [{ id: 'opaque' }],
    });
    expect(details(raw)).toEqual({ valid: true, counts: { history: 1, notes: 1, formulas: 1, reports: 1, executions: 1 },
      ids: ['history:h', 'notes:n', 'formulaLibrary.entries:f', 'formulaReports.entries:r', 'formulaExecutions:formulaId:f'] });
    expect(JSON.parse(raw).future).toEqual([{ id: 'opaque' }]);
  });
  it('reports zero for absent optional collections and never counts opaque future arrays', () => {
    expect(details(rawA).counts).toEqual({ history: 0, notes: 0, formulas: 0, reports: 0, executions: 0 });
    expect(details(rawA.replace('"future":9007199254740993001', '"future":[{"id":"opaque"}]')).ids).toEqual([]);
  });
});
