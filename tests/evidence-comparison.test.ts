import { describe, expect, it, vi, afterEach } from 'vitest';
import { compareEvidenceRecords, buildEvidenceComparisonMarkdown, evidenceInputLabel, evidenceModeLabel, evidenceRowLabel } from '../lib/evidence-comparison';
import { type EvidenceBlock, type EvidenceRecord, validCalculationEvidence } from '../lib/calculation-evidence';
import * as calculator from '../lib/calculator';
import * as storage from '../lib/storage';
import { reportLines, REPORT_OUTPUT_CHARACTER_LIMIT } from '../lib/markdown-report';

const block = (blockId = 'A', position = 1): EvidenceBlock => ({ blockId, position, expression: '100', inputs: [], result: '100', resultText: '100', status: 'success' });
const record = (id = 'before', blocks: EvidenceBlock[] = [block()]): EvidenceRecord => ({ id, blocks, calculatedAt: '2026-10-22T01:00:00.000Z', persistedAt: '2026-10-22T01:01:00.000Z', evaluator: 'calculator-memo-v1', status: 'confirmed' });
const input = (sourceBlockId = 'A', value = '100') => ({ kind: 'id' as const, name: 'ReferenceValue1', sourceBlockId, value });
const consumer = (): EvidenceBlock => ({ ...block('B', 2), expression: '@{1}+50', evaluationMode: 'block-references', references: { version: 1, entries: [{ slot: 1, blockId: 'A' }] }, inputs: [input()], result: '150', resultText: '150' });
const pair = () => { const before = record('before', [block(), consumer()]); return { before, after: { ...structuredClone(before), id: 'after' } }; };
const report = (before = record(), after = record('after')) => buildEvidenceComparisonMarkdown({ id: 'memo', title: '保存記録' }, compareEvidenceRecords(before, after));
afterEach(() => vi.restoreAllMocks());

describe('saved record comparison without evaluation', () => {
  it('treats different record IDs with equal compared content as unchanged', () => {
    const result = compareEvidenceRecords(record(), record('other'));
    expect(result.counts).toEqual({ added: 0, removed: 0, changed: 0, unchanged: 1 });
    expect(evidenceRowLabel(result.rows[0])).toBe('比較対象項目に変更なし');
  });
  it('rejects the same record even when given a separately cloned object', () => {
    expect(() => compareEvidenceRecords(record(), structuredClone(record()))).toThrow('異なる2件');
  });
  it.each([
    ['expression', { expression: '50+50' }], ['mode', { evaluationMode: 'note-variables' }],
    ['displayResult', { resultText: '100.0' }], ['internalResult', { result: '100.00000000000001' }],
    ['bodyOrder', { position: 4 }],
  ] as const)('reports isolated %s changes even when other values match', (key, change) => {
    const before = record(), after = record('after', [{ ...block(), ...change }]);
    expect(compareEvidenceRecords(before, after).rows[0].changes).toEqual([key]);
  });
  it('keeps signed zero distinct when displayed values are identical', () => {
    const before = record('before', [{ ...block(), result: '0', resultText: '0' }]);
    const after = record('after', [{ ...block(), result: '-0', resultText: '0' }]);
    expect(compareEvidenceRecords(before, after).rows[0].changes).toEqual(['internalResult']);
    expect(report(before, after).markdown).toContain('```text\n-0\n```');
  });
  it('reports changed source with equal actual input and equal result', () => {
    const before = record('before', [block(), block('C', 3), consumer()]);
    const after = structuredClone(before); after.id = 'after'; after.blocks[2].inputs[0].sourceBlockId = 'C';
    after.blocks[2].references!.entries[0].blockId = 'C';
    expect(compareEvidenceRecords(before, after).rows.find(row => row.blockId === 'B')!.changes).toEqual(['sources']);
  });
  it('reports actual input-only difference rather than using current source result', () => {
    const { before, after } = pair(); after.blocks[1].inputs[0].value = '120';
    expect(compareEvidenceRecords(before, after).rows[1].changes).toEqual(['values']);
    expect(report(before, after).markdown).toContain('```text\n120\n```');
  });
  it('preserves -0 in actual input comparison', () => {
    const { before, after } = pair(); before.blocks[1].inputs[0].value = '0'; after.blocks[1].inputs[0].value = '-0';
    expect(compareEvidenceRecords(before, after).rows[1].changes).toEqual(['values']);
  });
  it('shows multiple simultaneous changes and same-result formula changes', () => {
    const { before, after } = pair();
    Object.assign(after.blocks[1], { expression: '@{1}+30', position: 5, result: '170', resultText: '170' });
    after.blocks[1].inputs[0].value = '140';
    expect(compareEvidenceRecords(before, after).rows[1].changes).toEqual(['expression', 'values', 'displayResult', 'internalResult', 'bodyOrder']);
  });
  it('uses block IDs, not expression or body position, to pair blocks', () => {
    const result = compareEvidenceRecords(record(), record('after', [block('renamed')]));
    expect(result.counts).toEqual({ added: 1, removed: 1, changed: 0, unchanged: 0 });
    expect(result.rows[0].before).toBeUndefined(); expect(result.rows[1].after).toBeUndefined();
    expect(evidenceRowLabel(result.rows[0])).toContain('記録間で追加');
    expect(report(record(), record('after', [block('renamed')])).markdown).toContain('メモ本文全体の編集履歴ではありません');
  });
  it('distinguishes body order from the saved execution array order', () => {
    const before = record('before', [block('A', 2), block('B', 1)]);
    const after = record('after', [block('B', 1), block('A', 2)]);
    const result = compareEvidenceRecords(before, after);
    expect(result.rows.map(row => row.blockId)).toEqual(['B', 'A']);
    expect(result.rows.map(row => row.changes)).toEqual([['executionOrder'], ['executionOrder']]);
    expect(result.rows[0].before?.executionOrder).toBe(2); expect(result.rows[0].after?.executionOrder).toBe(1);
  });
  it.each(['2026-10-22T01:00:00.000Z', '2025-10-22T01:00:00.000Z'])('never reorders chosen records using clock %s', time => {
    const before = record(), after = record('after'); after.calculatedAt = time; after.persistedAt = time;
    const result = compareEvidenceRecords(before, after);
    expect(result.before.id).toBe('before'); expect(result.after.id).toBe('after'); expect(result.counts.unchanged).toBe(1);
  });
  it('reverses additions/removals with explicit swapped direction', () => {
    const a = record(), b = record('after', [block(), block('B', 2)]);
    expect(compareEvidenceRecords(a, b).counts.added).toBe(1);
    expect(compareEvidenceRecords(b, a).counts.removed).toBe(1);
  });
  it('ignores unused reference candidates while retaining used references', () => {
    const { before, after } = pair(); after.blocks[1].references!.entries.push({ slot: 2, blockId: 'UNUSED' });
    const result = compareEvidenceRecords(before, after); expect(result.counts.unchanged).toBe(2);
    expect(report(before, after).markdown).not.toContain('UNUSED');
  });
  it('normalizes input read ordering but not source or values', () => {
    const before = record('before', [block(), { ...consumer(), inputs: [input(), { ...input(), name: 'ReferenceValue2' }], references: { version: 1, entries: [{ slot: 1, blockId: 'A' }, { slot: 2, blockId: 'A' }] } }]);
    const after = structuredClone(before); after.id = 'after'; after.blocks[1].inputs.reverse();
    expect(compareEvidenceRecords(before, after).counts.unchanged).toBe(2);
  });
  it('recognizes legacy reassignment actual source rather than earlier candidate', () => {
    const before = record('before', [ { ...block('old'), expression: 'a=100', evaluationMode: 'note-variables' }, { ...block('new', 2), expression: 'a=100', evaluationMode: 'note-variables' }, { ...block('use', 3), expression: 'a', evaluationMode: 'note-variables', inputs: [{ kind: 'variable', name: 'a', sourceBlockId: 'old', value: '100' }] } ]);
    const after = structuredClone(before); after.id = 'after'; after.blocks[2].inputs[0].sourceBlockId = 'new';
    expect(compareEvidenceRecords(before, after).rows[2].changes).toEqual(['sources']);
    expect(report(before, after).markdown).toContain('旧変数 a');
  });
  it('defines absent optional mode as known legacy and unknown auxiliary fields as unexamined', () => {
    const before = record(); Object.assign(before.blocks[0], { futureAux: { note: 'kept' } });
    const result = compareEvidenceRecords(before, record('after'));
    expect(evidenceModeLabel(result.before.blocks[0])).toContain('legacy');
    expect(result.warnings.join()).toContain('未知の付随フィールド');
    expect(result.rows[0].kind).toBe('unchanged');
    expect(result.before.blocks[0]).toHaveProperty('futureAux.note', 'kept');
  });
  it.each([
    ['missing inputs', (r: EvidenceRecord) => { delete (r.blocks[0] as Partial<EvidenceBlock>).inputs; }],
    ['missing result', (r: EvidenceRecord) => { delete (r.blocks[0] as Partial<EvidenceBlock>).result; }],
    ['unsupported evaluator', (r: EvidenceRecord) => { Object.assign(r, { evaluator: 'future' }); }],
    ['unsupported mode', (r: EvidenceRecord) => { r.blocks[0].evaluationMode = 'future'; }],
    ['noncanonical number', (r: EvidenceRecord) => { r.blocks[0].result = '100.0'; }],
    ['duplicate ID', (r: EvidenceRecord) => { r.blocks.push(block('A', 2)); }],
    ['zero blocks', (r: EvidenceRecord) => { r.blocks = []; }],
    ['broken reference', (r: EvidenceRecord) => { r.blocks[0].inputs = [input('missing')]; }],
  ] as const)('fails closed for %s rather than reporting unchanged', (_, corrupt) => {
    const bad = record('after'); corrupt(bad); const raw = JSON.stringify(bad);
    expect(() => compareEvidenceRecords(record(), bad)).toThrow('比較不可');
    expect(JSON.stringify(bad)).toBe(raw);
  });
  it('detaches and freezes the shared model without freezing originals', () => {
    const a = record(), b = record('after'); const raw = JSON.stringify([a, b]);
    const model = compareEvidenceRecords(a, b);
    expect(JSON.stringify([a, b])).toBe(raw); expect(Object.isFrozen(a)).toBe(false);
    expect(Object.isFrozen(model.rows[0].before!.block.inputs)).toBe(true);
    a.blocks[0].expression = 'CURRENT-EDIT';
    expect(model.before.blocks[0].expression).toBe('100');
    expect(buildEvidenceComparisonMarkdown({ id: 'memo', title: 'test' }, model).markdown).not.toContain('CURRENT-EDIT');
  });
  it('does not invoke numerical evaluation or persistence', () => {
    const calculate = vi.spyOn(calculator, 'calculateExpression').mockImplementation(() => { throw new Error('must not evaluate'); });
    const save = vi.spyOn(storage, 'saveData').mockImplementation(() => { throw new Error('must not save'); });
    expect(report().markdown).toContain('比較対象項目に変更なし');
    expect(calculate).not.toHaveBeenCalled(); expect(save).not.toHaveBeenCalled();
  });
});

describe('comparison Markdown', () => {
  it('uses exact selected record IDs, requested-save labels, and no completion claim', () => {
    const text = report().markdown;
    expect(text).toContain('記録ID: before'); expect(text).toContain('記録ID: after');
    expect(text).toContain('保存要求時刻:'); expect(text).not.toContain('保存完了時刻:');
    expect(text).toContain('保存要求時刻は保存完了時刻ではありません');
    expect(text).toContain('未記入:'); expect(text).toContain('原因・説明');
  });
  it('outputs the requested A/B/C example with actual historical inputs', () => {
    const a = record('before', [block(), consumer(), { ...consumer(), blockId: 'C', position: 3, expression: '@{1}*2', references: { version: 1, entries: [{ slot: 1, blockId: 'B' }] }, inputs: [input('B', '150')], result: '300', resultText: '300' }]);
    const b = structuredClone(a); b.id = 'after';
    b.blocks[0].expression = b.blocks[0].result = b.blocks[0].resultText = '120';
    b.blocks[1].inputs[0].value = '120'; b.blocks[1].result = b.blocks[1].resultText = '170';
    b.blocks[2].inputs[0].value = '170'; b.blocks[2].result = b.blocks[2].resultText = '340';
    const text = report(a, b).markdown;
    for (const value of ['100', '120', '150', '170', '300', '340']) expect(text).toContain(`\n${value}\n`);
    expect(text).toContain('実使用内部値'); expect(text).toContain('差分は因果関係の証明ではなく');
  });
  it('keeps HTML and fence characters inert, with original expression preserved', () => {
    const before = record('before\n<script>'); before.blocks[0].blockId = 'A\n# ```<script>';
    before.blocks[0].expression = '```\n<script>\n~~~\n';
    const after = structuredClone(before); after.id = 'after';
    const output = buildEvidenceComparisonMarkdown({ id: 'memo\n# heading', title: '<script> *test*' }, compareEvidenceRecords(before, after));
    expect(output.markdown).toContain('&lt;script&gt;');
    expect(output.markdown).toContain('````text\n```\n<script>\n~~~\n\n````');
    expect(output.markdown).not.toContain('\n# heading');
    expect(output.filename).not.toMatch(/[<>]/);
  });
  it('uses filename handling for empty, path and very long titles', () => {
    for (const title of ['', '../../bad\\path?', 'あ'.repeat(400)]) {
      const result = buildEvidenceComparisonMarkdown({ id: 'memo', title }, compareEvidenceRecords(record(), record('after')));
      expect(result.filename).toMatch(/\.md$/); expect(result.filename).not.toMatch(/[/\\?]/);
      expect(new TextEncoder().encode(result.filename).length).toBeLessThanOrEqual(200);
    }
  });
  it('rejects oversized identity without partial output', () => {
    expect(() => buildEvidenceComparisonMarkdown({ id: 'm', title: 'x'.repeat(1_000_001) }, compareEvidenceRecords(record(), record('after')))).toThrow('省略せず');
  });
  it('stops actual generation when escaping exceeds output capacity without truncating', () => {
    const model = compareEvidenceRecords(record(), record('after'));
    expect(() => buildEvidenceComparisonMarkdown({ id: 'memo', title: '&'.repeat(900_000) }, model)).toThrow('400万文字');
  });
  it('rejects records exceeding the existing UTF-8 byte budget without editing them', () => {
    const bad = record('after'); bad.blocks[0].resultText = 'あ'.repeat(170_000);
    const original = bad.blocks[0].resultText;
    expect(() => compareEvidenceRecords(record(), bad)).toThrow('比較不可');
    expect(bad.blocks[0].resultText).toBe(original);
  });
  it('uses the same bounded line accumulator as the existing report', () => {
    const lines = reportLines(['x'.repeat(REPORT_OUTPUT_CHARACTER_LIMIT - 1)]);
    expect(() => lines.push('tail')).toThrow('400万文字');
  });
  it('marks unresolvable display slots as unconfirmed instead of guessing', () => {
    const b = consumer(); b.inputs[0].name = 'not-a-slot';
    expect(evidenceInputLabel(b.inputs[0], b)).toContain('確認不能');
  });
  it('works on storage-valid record data without a present-day memo', () => {
    expect(validCalculationEvidence({ version: 1, records: [record()] })).toBe(true);
    const text = report().markdown;
    expect(text).toContain('当時のメモタイトル'); expect(text).toContain('現在のメモから補完していません');
  });
});
