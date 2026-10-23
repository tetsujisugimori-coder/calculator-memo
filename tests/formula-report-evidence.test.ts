import { describe, expect, it, vi } from 'vitest';
import { formulaDefinitionSignature, formulaReportAssessment, readReportEvidence, reportEvidenceSignature, resolveReportEvidence } from '../lib/formula-report-evidence';
import { emptyFormulaReports, formulaReportCorrespondence, formulaReportSignature, readFormulaReports, saveFormulaReport, type FormulaReportSaveRequest } from '../lib/formula-reports';
import { loadData, defaultData, saveData, saveDataChecked } from '../lib/storage';
import type { FormulaLibrary, FormulaReport, FormulaReports, Memo } from '../lib/types';
const now = '2026-10-23T00:00:00.000Z';
const formula = { id: 'f', title: '式', expression: 'x+y', createdAt: now, updatedAt: now };
const library: FormulaLibrary = { version: 1, selectedId: 'f', entries: [formula] };
const link = { memoId: 'm', recordId: 'e' };
const record = { id: 'e', evaluator: 'calculator-memo-v1' as const, status: 'confirmed' as const, calculatedAt: now, persistedAt: now, blocks: [
  { blockId: 'a', position: 1, expression: '-0', inputs: [], result: '-0', resultText: '0', status: 'success' as const },
  { blockId: 'b', position: 2, expression: 'x', inputs: [{ kind: 'variable' as const, name: 'x', sourceBlockId: 'a', value: '-0' }], result: '-0', resultText: '0', status: 'success' as const },
] };
const notes: Memo[] = [{ id: 'm', title: '過去', type: 'plain-calculation', content: '未保存の現在値で補わない', createdAt: now, updatedAt: now, calculationEvidence: { version: 1, records: [record] } }];
function request(report?: FormulaReport, options: Partial<FormulaReportSaveRequest> = {}): FormulaReportSaveRequest { return { id: 'r', formulaId: 'f', title: '説明', body: '本文', expectedReport: formulaReportSignature(report), expectedExpression: formula.expression, expectedDefinition: formulaDefinitionSignature(formula), links: [link], expectedEvidence: reportEvidenceSignature(notes, [link]), confirm: true, ...options }; }
function confirmed(): FormulaReport { return saveFormulaReport(emptyFormulaReports(), library, request(), now, notes).entries[0]; }
const wrapped = (report: FormulaReport): FormulaReports => ({ version: 1, entries: [report] });
describe('report confirmation evidence', () => {
  it('records stable identity, explicit time, derived variable definitions and exact report target', () => {
    const report = confirmed(), item = report.evidence!.confirmations[0];
    expect(item.id).toBeTruthy(); expect(item).toMatchObject({ formulaId: 'f', confirmedAt: now, title: '説明', body: '本文', links: [link], definition: { version: 1, expression: 'x+y', variables: ['x', 'y'] } });
    expect(formulaReportAssessment(report, formula, notes).status).toBe('confirmed');
    expect(formulaReportAssessment(report, { ...formula, title: '名前だけ' }, notes).status).toBe('confirmed');
    expect(formulaReportAssessment(report, { ...formula, expression: 'x+z' }, notes).status).toBe('changed');
  });
  it('changes variable definitions independently without claiming equivalence', () => {
    const report = confirmed(); report.evidence!.confirmations[0].definition.variables = ['x', 'z'];
    expect(formulaReportAssessment(report, formula, notes).status).toBe('changed');
  });
  it('retains old confirmation and report text on edits and reconfirmation', () => {
    const first = confirmed(); const original = JSON.stringify(first);
    const edited = saveFormulaReport(wrapped(first), library, request(first, { confirm: false, body: '第二稿' }), now, notes).entries[0];
    expect(formulaReportAssessment(edited, formula, notes).status).toBe('unconfirmed');
    expect(edited.evidence!.confirmations).toEqual(first.evidence!.confirmations);
    const second = saveFormulaReport(wrapped(edited), library, request(edited, { body: '第二稿' }), now, notes).entries[0];
    expect(second.evidence!.confirmations).toHaveLength(2); expect(second.evidence!.confirmations[0].body).toBe('本文');
    expect(JSON.stringify(first)).toBe(original);
  });
  it('does not invent legacy date or variable data and retains legacy snapshot when reconfirming', () => {
    const old = { id: 'r', formulaId: 'f', title: '説明', body: '本文', createdAt: now, updatedAt: now, confirmedExpression: 'legacy' };
    expect(formulaReportAssessment(old, formula, notes).status).toBe('unknown');
    expect(readFormulaReports(wrapped(old)).entries[0]).toEqual(old);
    const next = saveFormulaReport(wrapped(old), library, request(old), now, notes).entries[0];
    expect(next.confirmedExpression).toBe('legacy'); expect(next.evidence!.confirmations).toHaveLength(1);
    expect(formulaReportAssessment(next, formula, notes).status).toBe('confirmed');
  });
  it('keeps legacy confirmation comparison unknown after ordinary save initializes empty evidence', () => {
    const old = { id: 'r', formulaId: 'f', title: '説明', body: '本文', createdAt: now, updatedAt: now, confirmedExpression: 'x+y' };
    const saved = saveFormulaReport(wrapped(old), library, request(old, { confirm: false, links: [], expectedEvidence: reportEvidenceSignature(notes, []) }), now, notes).entries[0];
    expect(saved.evidence!.confirmations).toEqual([]);
    expect(saved.confirmedExpression).toBe('x+y');
    expect(formulaReportAssessment(saved, formula, notes)).toMatchObject({ status: 'unknown' });
    expect(formulaReportAssessment(saved, formula, notes).reason).toContain('未記録');
  });
  it('never invents confirmation by viewing or plain saving', () => {
    const report = saveFormulaReport(emptyFormulaReports(), library, request(undefined, { confirm: false }), now, notes).entries[0];
    expect(report.evidence!.confirmations).toEqual([]); expect(formulaReportAssessment(report, formula, notes).status).toBe('unconfirmed');
  });
  it('fails closed for unknown definition fields and preserves them for recovery', () => {
    const future = { ...formula, variables: [{ name: 'x', unit: 'm' }] };
    expect(formulaReportAssessment(confirmed(), future, notes).status).toBe('unknown');
    expect(() => saveFormulaReport(emptyFormulaReports(), { ...library, entries: [future] }, request(undefined, { expectedDefinition: formulaDefinitionSignature(future) }), now, notes)).toThrow('未対応');
  });
  it('rejects a changed definition, changed report or changed same-ID record before confirmation', () => {
    expect(() => saveFormulaReport(emptyFormulaReports(), library, request(undefined, { expectedDefinition: 'old' }), now, notes)).toThrow('変更');
    const report = confirmed(); expect(() => saveFormulaReport(wrapped({ ...report, body: 'other' }), library, request(report), now, notes)).toThrow('変更');
    const modified = structuredClone(notes); if (modified[0].type === 'plain-calculation') modified[0].calculationEvidence!.records[0].blocks[0].resultText = 'changed';
    expect(() => saveFormulaReport(emptyFormulaReports(), library, request(), now, modified)).toThrow('変更');
  });
  it('preserves history at limits instead of trimming or silently replacing', () => {
    const report = confirmed(); report.evidence!.confirmations = Array.from({ length: 20 }, (_, i) => ({ ...report.evidence!.confirmations[0], id: `c${i}` }));
    expect(() => saveFormulaReport(wrapped(report), library, request(report), now, notes)).toThrow('20');
    const tooLarge = confirmed(); tooLarge.evidence!.confirmations = Array.from({ length: 11 }, (_, i) => ({ ...tooLarge.evidence!.confirmations[0], id: `c${i}`, body: 'a'.repeat(100000) }));
    expect(() => readFormulaReports(wrapped(tooLarge))).toThrow('バイト');
  });
  it.each([2, null, {}, { version: 1, links: [link, link], confirmations: [] }, { version: 2, links: [], confirmations: [] }])('protects malformed or unknown evidence %j', evidence => {
    const value = { ...confirmed(), evidence }; const raw = JSON.stringify({ ...defaultData, formulaReports: wrapped(value as FormulaReport) });
    expect(loadData({ getItem: () => raw })).toMatchObject({ status: 'error', raw });
  });
  it('protects unknown evidence metadata in the raw original instead of accepting an editable object', () => {
    const report = confirmed(); const evidence = { ...report.evidence!, futurePolicy: 'unsupported' };
    const unsupported = { ...report, evidence };
    const raw = JSON.stringify({ ...defaultData, formulaReports: wrapped(unsupported) });
    expect(loadData({ getItem: () => raw })).toMatchObject({ status: 'error', raw });
    expect(formulaReportAssessment(unsupported, formula, notes).status).toBe('unknown');
    expect(() => saveFormulaReport(wrapped(unsupported), library, request(unsupported), now, notes)).toThrow('未対応');
  });
  it('rejects duplicate confirmation identity and malformed variables', () => {
    const evidence = confirmed().evidence!;
    expect(() => readReportEvidence({ ...evidence, confirmations: [evidence.confirmations[0], evidence.confirmations[0]] }, 'f')).toThrow();
    expect(() => readReportEvidence({ ...evidence, confirmations: [{ ...evidence.confirmations[0], definition: { version: 1, expression: 'x+y', variables: ['x', 'x'] } }] }, 'f')).toThrow();
  });
});
describe('read-only stable evidence links', () => {
  it('copies recorded internal inputs and -0 without current memo values or evaluation', () => {
    const before = JSON.stringify(notes), item = resolveReportEvidence(notes, [link])[0];
    expect(item.status).toBe('available'); expect(item.record!.blocks[1].inputs[0].value).toBe('-0');
    item.record!.blocks[0].result = '10'; expect(JSON.stringify(notes)).toBe(before);
  });
  it('distinguishes missing records, corrupted records and duplicate memo IDs', () => {
    expect(resolveReportEvidence([], [link])[0].status).toBe('missing');
    expect(resolveReportEvidence(notes, [{ ...link, recordId: 'absent' }])[0].status).toBe('missing');
    expect(resolveReportEvidence([...notes, ...notes], [link])[0].status).toBe('invalid');
    const bad = structuredClone(notes); if (bad[0].type === 'plain-calculation') bad[0].calculationEvidence!.records[0].blocks[0].result = 'NaN';
    expect(resolveReportEvidence(bad, [link])[0].status).toBe('invalid');
    expect(formulaReportAssessment(confirmed(), formula, bad).status).toBe('unknown');
  });
  it('does not certify unknown record fields or oversized link lists', () => {
    const unknown = structuredClone(notes);
    if (unknown[0].type === 'plain-calculation') Object.assign(unknown[0].calculationEvidence!.records[0], { futureMeaning: true });
    expect(resolveReportEvidence(unknown, [link])[0].status).toBe('invalid');
    expect(() => saveFormulaReport(emptyFormulaReports(), library, request(undefined, { links: Array.from({ length: 21 }, (_, i) => ({ memoId: 'm', recordId: `r${i}` })) }), now, notes)).toThrow('20');
  });
  it('uses memo ID and record ID, never title or another memo record with the same ID', () => {
    const other = structuredClone(notes[0]); other.id = 'other';
    expect(resolveReportEvidence([other], [link])[0].status).toBe('missing');
  });
  it('detects same-ID record replacement after confirmation, not just during save', () => {
    const report = confirmed(); const changed = structuredClone(notes);
    if (changed[0].type === 'plain-calculation') changed[0].calculationEvidence!.records[0].blocks[0].resultText = 'replaced';
    expect(formulaReportAssessment(report, formula, changed)).toMatchObject({ status: 'unknown' });
    expect(formulaReportAssessment(report, formula, changed).reason).toContain('一致しません');
  });
  it('retains missing old links for rescue but will not add or confirm missing evidence', () => {
    const report = confirmed();
    expect(() => saveFormulaReport(wrapped(report), library, request(report, { confirm: true, expectedEvidence: reportEvidenceSignature([], [link]) }), now, [])).toThrow('根拠参照');
    const rescued = saveFormulaReport(wrapped(report), library, request(report, { body: 'rescue', confirm: false, expectedEvidence: reportEvidenceSignature([], [link]) }), now, []).entries[0];
    expect(rescued.evidence!.links).toEqual([link]);
    expect(() => saveFormulaReport(emptyFormulaReports(), library, request(undefined, { confirm: false, expectedEvidence: reportEvidenceSignature([], [link]) }), now, [])).toThrow('根拠参照');
  });
});


describe('PR #62 review: saved evidence assessment and unsupported fields', () => {
  it('allows the compatibility helper to forward saved notes without changing either input', () => {
    const report = confirmed(), before = JSON.stringify({ report, notes });
    expect(formulaReportCorrespondence(report, formula, notes)).toBe('confirmed');
    expect(formulaReportCorrespondence(report, formula)).toBe('unknown');
    expect(formulaReportAssessment(report, formula).reason).toContain('根拠未照合');
    expect(formulaReportAssessment(report, formula, []).reason).toContain('欠落');
    expect(JSON.stringify({ report, notes })).toBe(before);
  });
  it('does not require saved notes when the confirmation has no evidence links', () => {
    const report = saveFormulaReport(emptyFormulaReports(), library, request(undefined, { links: [], expectedEvidence: '[]' }), now, notes).entries[0];
    expect(formulaReportCorrespondence(report, formula)).toBe('confirmed');
    expect(formulaReportAssessment(report, formula, []).status).toBe('confirmed');
  });
  const locations = ['evidence', 'link', 'confirmation', 'definition', 'historical-link', 'older-confirmation'] as const;
  function unsupported(location: typeof locations[number]) {
    const report = confirmed(), evidence = report.evidence!;
    const target = location === 'evidence' ? evidence : location === 'link' ? evidence.links[0]
      : location === 'definition' ? evidence.confirmations[0].definition : location === 'historical-link' ? evidence.confirmations[0].links[0]
      : evidence.confirmations[0];
    Object.assign(target, { futureMeaning: { policy: 'must not discard' } });
    if (location === 'older-confirmation') evidence.confirmations.push({ ...structuredClone(confirmed().evidence!.confirmations[0]), id: 'newer' });
    return report;
  }
  it.each(locations)('protects unsupported %s at load, ordinary save and explicit confirmation', location => {
    const report = unsupported(location), original = JSON.stringify(report);
    const raw = JSON.stringify({ ...defaultData, formulaLibrary: library, formulaReports: wrapped(report) });
    const storage = { getItem: () => raw, setItem: vi.fn() };
    expect(loadData(storage)).toMatchObject({ status: 'error', raw });
    expect(formulaReportAssessment(report, formula, notes).status).toBe('unknown');
    expect(() => readFormulaReports(wrapped(report))).toThrow('未対応');
    for (const confirm of [false, true]) {
      // Even an explicit link removal must not normalize away an unknown meaning.
      expect(() => saveFormulaReport(wrapped(report), library, request(report, { confirm, links: [], expectedEvidence: '[]' }), now, notes)).toThrow('未対応');
    }
    expect(saveData(defaultData, storage)).toBe(false);
    expect(saveDataChecked(defaultData, raw, storage)).toEqual({ ok: false, reason: 'invalid' });
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(storage.getItem()).toBe(raw); expect(JSON.stringify(report)).toBe(original);
  });
  it('does not remove an unknown current link during ordinary save', () => {
    const report = unsupported('link');
    expect(() => saveFormulaReport(wrapped(report), library, request(report, { confirm: false, links: [], expectedEvidence: '[]' }), now, notes)).toThrow('未対応');
  });
  it('does not supersede an unsupported confirmation with a new supported confirmation', () => {
    const report = unsupported('confirmation');
    expect(() => saveFormulaReport(wrapped(report), library, request(report), now, notes)).toThrow('未対応');
  });
  it.each(locations)('rejects unsupported %s in a save candidate without writing', location => {
    const raw = JSON.stringify(defaultData), storage = { getItem: () => raw, setItem: vi.fn() };
    const candidate = { ...defaultData, formulaReports: wrapped(unsupported(location)) };
    expect(saveData(candidate, storage)).toBe(false);
    expect(saveDataChecked(candidate, raw, storage)).toEqual({ ok: false, reason: 'invalid' });
    expect(storage.setItem).not.toHaveBeenCalled();
  });
});

describe('optional confirmation remarks', () => {
  it.each(['', '導出式と参考文献を照合\n日本語😀 <script>alert(1)</script>', 'a'.repeat(500), '😀'.repeat(250)])('retains exact bounded remarks %s', remarks => {
    const report = saveFormulaReport(emptyFormulaReports(), library, request(undefined, { confirmationRemarks: remarks }), now, notes).entries[0];
    expect(report.evidence!.confirmations[0].remarks).toBe(remarks);
    expect(formulaReportAssessment(report, formula, notes).status).toBe('confirmed');
    const before = JSON.stringify(report);
    expect(readFormulaReports(wrapped(report)).entries[0]).toEqual(report);
    expect(JSON.stringify(report)).toBe(before);
  });
  it.each(['x'.repeat(501), '😀'.repeat(250) + 'x', null, 4, {}, []])('rejects invalid remarks without altering source', remarks => {
    const report = confirmed(), before = JSON.stringify(report);
    expect(() => saveFormulaReport(wrapped(report), library, request(report, { confirmationRemarks: remarks as string }), now, notes)).toThrow('500 UTF-16');
    expect(JSON.stringify(report)).toBe(before);
    const malformed = structuredClone(report); Object.assign(malformed.evidence!.confirmations[0], { remarks });
    expect(() => readFormulaReports(wrapped(malformed))).toThrow('500 UTF-16');
    expect(formulaReportAssessment(malformed, formula, notes).status).toBe('unknown');
  });
  it('distinguishes legacy absence from new empty without changing history or normal saves', () => {
    const legacy = confirmed(); delete legacy.evidence!.confirmations[0].remarks;
    const before = JSON.stringify(legacy);
    const normal = saveFormulaReport(wrapped(legacy), library, request(legacy, { confirm: false, confirmationRemarks: 'not saved' }), now, notes).entries[0];
    expect(normal.evidence!.confirmations).toEqual(legacy.evidence!.confirmations);
    const next = saveFormulaReport(wrapped(normal), library, request(normal), now, notes).entries[0];
    expect(next.evidence!.confirmations[0]).toEqual(legacy.evidence!.confirmations[0]);
    expect(Object.hasOwn(next.evidence!.confirmations[0], 'remarks')).toBe(false);
    expect(next.evidence!.confirmations[1].remarks).toBe('');
    expect(JSON.stringify(legacy)).toBe(before);
  });
  it('still rejects unknown confirmation keys alongside recognized remarks', () => {
    const report = confirmed(); Object.assign(report.evidence!.confirmations[0], { futureRemarks: 'retain me' });
    const before = JSON.stringify(report);
    expect(() => readFormulaReports(wrapped(report))).toThrow('未対応');
    expect(() => saveFormulaReport(wrapped(report), library, request(report, { confirm: false }), now, notes)).toThrow('未対応');
    expect(JSON.stringify(report)).toBe(before);
  });
});
