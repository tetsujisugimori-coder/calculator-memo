import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildMarkdownReport, reportCode } from '../lib/markdown-report';
import type { EvidenceHistory, EvidenceRecord } from '../lib/calculation-evidence';
import type { CalculationMemoBlock, PlainCalculationNote } from '../lib/types';
import * as calculator from '../lib/calculator';
import * as dependency from '../lib/dependency-analysis';

const calc = (id: string, expression: string, result: number): CalculationMemoBlock => ({ id, type: 'calculation', expression, displayExpression: expression, result, resultText: String(result), error: null });
const record = (): EvidenceRecord => ({
  id: 'record-1', calculatedAt: '2026-10-21T01:00:00.000Z', persistedAt: '2026-10-21T01:01:00.000Z', evaluator: 'calculator-memo-v1', status: 'confirmed',
  blocks: [
    { blockId: 'A', position: 2, expression: '100', inputs: [], result: '100', resultText: '100', status: 'success' },
    { blockId: 'B', position: 1, expression: '@{1}+50', evaluationMode: 'block-references', references: { version: 1, entries: [{ slot: 1, blockId: 'A' }] }, inputs: [{ kind: 'id', name: 'ReferenceValue1', sourceBlockId: 'A', value: '100' }], result: '150', resultText: '150', status: 'success' },
  ],
});
const note = (history?: EvidenceHistory): PlainCalculationNote => ({
  id: 'memo', type: 'plain-calculation', title: '保存根拠', content: '', createdAt: '2026-10-21T00:00:00.000Z', updatedAt: '2026-10-21T02:00:00.000Z',
  blocks: [calc('A', '400', 400), { ...calc('B', '@{1}+50', 150), evaluationMode: 'block-references', references: { version: 1, entries: [{ slot: 1, blockId: 'A' }] } }],
  ...(history ? { calculationEvidence: history } : {}),
});
const history = (...records: EvidenceRecord[]): EvidenceHistory => ({ version: 1, records });
afterEach(() => vi.restoreAllMocks());

describe('saved calculation evidence in Markdown', () => {
  it('distinguishes historical actually used values from changed current source values', () => {
    const report = buildMarkdownReport(note(history(record()))).markdown;
    expect(report).toContain('参照元の現在の保存内部数値: 400');
    expect(report).toContain('実際に使用した内部数値: 100');
    expect(report).toContain('計算時の内部結果: 150');
    expect(report).toContain('現在の式や結果への対応は保証しません');
    expect(report).toContain('状態: 古い可能性');
    expect(report).not.toContain('状態: 確定済み');
  });
  it('keeps execution order separate from original body position', () => {
    const report = buildMarkdownReport(note(history(record()))).markdown;
    expect(report).toContain('記録内の実行順 1 / 当時の本文順序 2');
    expect(report).toContain('記録内の実行順 2 / 当時の本文順序 1');
    expect(report).toContain('計算日時: 2026');
    expect(report).toContain('保存日時: 2026');
    expect(report).toContain('端末時計');
  });
  it('retains all past batches rather than replacing them with the latest result', () => {
    const second = record(); second.id = 'record-2'; second.calculatedAt = '2026-10-21T02:00:00.000Z'; second.persistedAt = '2026-10-21T02:01:00.000Z';
    second.blocks[0].expression = '200'; second.blocks[0].result = second.blocks[0].resultText = '200';
    second.blocks[1].inputs[0].value = '200'; second.blocks[1].result = second.blocks[1].resultText = '250';
    const report = buildMarkdownReport(note(history(record(), second))).markdown;
    expect(report).toContain('### 確定記録 1'); expect(report).toContain('### 確定記録 2');
    expect(report).toContain('実際に使用した内部数値: 100'); expect(report).toContain('実際に使用した内部数値: 200');
  });
  it('retains historical blocks even after every current calculation block is deleted', () => {
    const input = note(history(record())); input.blocks = [];
    const report = buildMarkdownReport(input).markdown;
    expect(report).toContain('本文ブロックはありません'); expect(report).not.toContain('```mermaid');
    expect(report).toContain('当時のブロックID: A'); expect(report).toContain('当時のブロックID: B');
    expect(report.match(/削除済み、または現在は確認不能/g)).toHaveLength(2);
  });
  it('preserves historical internal precision independently of display rounding', () => {
    const saved = record(); saved.blocks = [{ ...saved.blocks[0], expression: '1/3', result: '0.3333333333333333', resultText: '0.3333333333' }];
    const report = buildMarkdownReport(note(history(saved))).markdown;
    expect(report).toContain('計算時の内部結果: 0.3333333333333333');
    expect(report).toContain('計算時の表示値（丸め・整形済み）:\n\n```text\n0.3333333333\n```');
  });
  it('preserves signed zero in historical values', () => {
    const saved = record(); saved.blocks[0].expression = '-0'; saved.blocks[0].result = '-0'; saved.blocks[0].resultText = '0';
    saved.blocks[1].expression = '@{1}'; saved.blocks[1].inputs[0].value = '-0'; saved.blocks[1].result = '-0'; saved.blocks[1].resultText = '0';
    const report = buildMarkdownReport(note(history(saved))).markdown;
    expect(report).toContain('実際に使用した内部数値: -0'); expect(report).toContain('計算時の内部結果: -0');
  });
  it('shows actual legacy assignment origin rather than inferring it from candidates', () => {
    const saved = record(); saved.blocks = [
      { ...saved.blocks[0], position: 1, expression: 'x=100', evaluationMode: 'note-variables' },
      { ...saved.blocks[0], blockId: 'A2', position: 2, expression: 'x=200', evaluationMode: 'note-variables', result: '200', resultText: '200' },
      { blockId: 'B', position: 3, expression: 'x+50', evaluationMode: 'note-variables', inputs: [{ kind: 'variable', name: 'x', sourceBlockId: 'A2', value: '200' }], result: '250', resultText: '250', status: 'success' },
    ];
    const report = buildMarkdownReport(note(history(saved))).markdown;
    expect(report).toContain('- 旧変数: x'); expect(report).toContain('参照元ID（計算時）: A2 / 当時の本文順序 2');
    expect(report).toContain('実際に使用した内部数値: 200');
  });
  it('does not invent history for old data or empty history', () => {
    for (const input of [note(), note(history())]) {
      const report = buildMarkdownReport(input).markdown;
      expect(report).toContain('計算時の使用値は確認不能'); expect(report).not.toContain('## 確定根拠の履歴');
      expect(report).not.toContain('実際に使用した内部数値:');
    }
  });
  it('keeps no-record warning for newly added IDs alongside historical blocks', () => {
    const input = note(history(record())); input.blocks!.push(calc('new', '999', 999));
    const report = buildMarkdownReport(input).markdown;
    expect(report).toContain('保存記録があります'); expect(report).toContain('計算時の使用値は確認不能');
    expect(report).not.toContain('当時のブロックID: new');
  });
  it.each([{ version: 2, records: [] }, { version: 1, records: [{}] }, { version: 1, records: null }])('refuses unsupported or malformed evidence without pretending a complete report %#', invalid => {
    const input = note(); Object.assign(input, { calculationEvidence: invalid });
    const before = JSON.stringify(input);
    expect(() => buildMarkdownReport(input)).toThrow('計算根拠履歴'); expect(JSON.stringify(input)).toBe(before);
  });
  it('does not reevaluate or mutate frozen historical data during output', () => {
    const input = note(history(record())); const before = JSON.stringify(input);
    const deepFreeze = (value: unknown) => { if (value && typeof value === 'object') { Object.values(value).forEach(deepFreeze); Object.freeze(value); } };
    deepFreeze(input);
    const numeric = vi.spyOn(calculator, 'calculateExpression'); const variable = vi.spyOn(calculator, 'calculateVariableExpression');
    buildMarkdownReport(input);
    expect(numeric).not.toHaveBeenCalled(); expect(variable).not.toHaveBeenCalled(); expect(JSON.stringify(input)).toBe(before);
  });
  it('retains history when current dependency graph analysis fails', () => {
    vi.spyOn(dependency, 'analyzeMemoDependencies').mockImplementation(() => { throw new Error('failed'); });
    const report = buildMarkdownReport(note(history(record()))).markdown;
    expect(report).toContain('解析処理に失敗'); expect(report).toContain('実際に使用した内部数値: 100');
    expect(report).toContain('暗号学的な真正性保証や数学的証明ではありません');
    expect(report).toContain('出力時の再計算・再現検証は行っていません');
  });
  it('escapes historical identifiers and safely fences recorded display strings', () => {
    const saved = record(); saved.id = '<record>\n#title'; saved.blocks[0].blockId = '<A>\n#id';
    saved.blocks[1].references!.entries[0].blockId = saved.blocks[0].blockId;
    saved.blocks[1].inputs[0].sourceBlockId = saved.blocks[0].blockId;
    saved.blocks[0].expression = '100\n```\n# recorded-expression\n````';
    saved.blocks[0].resultText = '```\n<script>\n# escaped\n````';
    const report = buildMarkdownReport(note(history(saved))).markdown;
    expect(report).toContain('&lt;record&gt; \\#title'); expect(report).toContain('&lt;A&gt; \\#id');
    expect(report).toContain(reportCode(saved.blocks[0].resultText));
    expect(report).toContain(reportCode(saved.blocks[0].expression));
    expect(report).not.toContain('\n#title'); expect(report).not.toContain('\n#id');
  });
});
