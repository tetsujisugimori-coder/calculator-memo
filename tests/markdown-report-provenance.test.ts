import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildMarkdownReport, reportCode } from '../lib/markdown-report';
import { recalculateReferenceMemo } from '../lib/block-references';
import * as dependency from '../lib/dependency-analysis';
import * as mermaid from '../lib/dependency-mermaid';
import * as calculator from '../lib/calculator';
import type { CalculationMemoBlock, MemoBlock, PlainCalculationNote } from '../lib/types';
const calc = (id: string, expression = '100', extra: Partial<CalculationMemoBlock> = {}): CalculationMemoBlock => ({ id, type: 'calculation', expression, displayExpression: expression, result: 100, resultText: '100', error: null, ...extra });
const ref = (id: string, target: string, expression = '@{1}+50') => calc(id, expression, { evaluationMode: 'block-references', references: { version: 1, entries: [{ slot: 1, blockId: target }] } });
const note = (blocks: MemoBlock[]): PlainCalculationNote => ({ id: 'N', type: 'plain-calculation', title: 'Test', content: '', blocks, createdAt: '', updatedAt: '' });
const section = (markdown: string, number: number) => markdown.split(`### ブロック ${number}（`)[1].split(/\n### ブロック |\n## 依存関係図/)[0];
afterEach(() => vi.restoreAllMocks());
describe('report provenance', () => {
  it('shows immediate source positions and values, not transitive source substitution', () => {
    const blocks = recalculateReferenceMemo([{ id: 'intro', type: 'text', content: 'hi' }, calc('A'), ref('B', 'A'), ref('C', 'B')]).blocks;
    const md = buildMarkdownReport(note(blocks)).markdown;
    const b = section(md, 3), c = section(md, 4);
    expect(b).toContain('参照元: ブロック 2 / ID: A'); expect(b).toContain('参照元の現在の保存内部数値: 100');
    expect(c).toContain('参照元: ブロック 3 / ID: B'); expect(c).toContain('参照元の現在の保存内部数値: 150'); expect(c).not.toContain('参照元: ブロック 2');
    expect(c).toContain('計算時の使用値は確認不能'); expect(md).toContain('依存関係図は計算履歴の証明ではありません');
  });
  it('does not decode old signature snapshots or claim changed source values were used', () => {
    const blocks = recalculateReferenceMemo([calc('A'), ref('B', 'A')]).blocks;
    Object.assign(blocks[0], { expression: '200', result: 200, resultText: '200' });
    const b = section(buildMarkdownReport(note(blocks)).markdown, 2);
    expect(b).toContain('保存内部数値: 150'); expect(b).toContain('参照元の現在の保存内部数値: 200');
    expect(b).toContain('状態: 古い可能性'); expect(b).toContain('参照元の結果状態 = 古い可能性'); expect(b).not.toContain('確定済み');
    expect(b).toContain('以下の現在の保存値で代用しません');
  });
  it('distinguishes precise current internal number and rounded display', () => {
    const b = section(buildMarkdownReport(note([calc('A', '1/3', { result: 1/3, resultText: '0.3333333333' }), ref('B', 'A')])).markdown, 2);
    expect(b).toContain('参照元の現在の保存内部数値: 0.3333333333333333'); expect(b).toContain(reportCode('0.3333333333')); expect(b).toContain('参照元の結果状態 = 古い可能性');
  });
  it('does not treat an unused mapping as a direct dependency', () => {
    const b = ref('B', 'A'); b.references!.entries.push({ slot: 2, blockId: 'unused' });
    const md = section(buildMarkdownReport(note([calc('A'), b, calc('unused')])).markdown, 2);
    expect(md).toContain('式で未使用の保存参照対応 @{2} → unused'); expect(md).not.toContain('参照元: ブロック 3');
  });
  it('preserves separate slots pointing to the same source', () => {
    const b = ref('B', 'A', '@{1}+@{2}'); b.references!.entries.push({ slot: 2, blockId: 'A' });
    const md = section(buildMarkdownReport(note([calc('A'), b])).markdown, 2);
    expect(md).toContain('ID参照 @{1} → A'); expect(md).toContain('ID参照 @{2} → A');
  });
  it('shows missing mapping and missing source without fabricating a value', () => {
    const md = section(buildMarkdownReport(note([ref('B', 'gone', '@{1}+@{2}')])).markdown, 1);
    expect(md).toContain('gone（参照先なし）'); expect(md).toContain('対応する保存参照先IDなし'); expect(md).not.toContain('参照元の現在の保存内部数値:');
  });
  it.each([['self', [ref('A','A')]], ['cycle', [ref('A','B'),ref('B','A')]]])('preserves %s diagnostics and uncertain source result', (_, blocks) => {
    const md = buildMarkdownReport(note(blocks as MemoBlock[])).markdown;
    expect(md).toMatch(/自己参照|循環参照/); expect(md).toContain('参照元の結果状態 = 古い可能性'); expect(md).not.toContain('状態: 確定済み');
  });
  it('keeps all legacy reassignment candidates and their uncertain status', () => {
    const blocks = [calc('A','x=1',{ evaluationMode:'note-variables',result:1,resultText:'1' }), calc('B','x=2',{evaluationMode:'note-variables',result:2,resultText:'2'}), calc('C','x+3',{evaluationMode:'note-variables',result:5,resultText:'5'})];
    const c = section(buildMarkdownReport(note(blocks)).markdown,3);
    expect(c).toContain('旧変数 x の候補: A, B'); expect(c).toContain('参照元: ブロック 1 / ID: A'); expect(c).toContain('参照元: ブロック 2 / ID: B'); expect(c).toContain('再代入の成否や未定義の可能性');
  });
  it('shows undefined legacy variables without false no-reference assertion', () => {
    const md = buildMarkdownReport(note([calc('A','x+1',{evaluationMode:'note-variables'})])).markdown;
    expect(md).toContain('旧変数 x の候補: なし'); expect(md).not.toContain('直接旧変数参照: なし');
  });
  it('distinguishes malformed expression from no references and retains unverified mapping', () => {
    const md = buildMarkdownReport(note([ref('B','A','@{1}+')])).markdown;
    expect(md).toContain('直接参照は確認不能'); expect(md).toContain('未確認の保存参照対応'); expect(md).not.toContain('直接ID参照: なし');
  });
  it('handles analyzer exception without asserting no reference', () => {
    vi.spyOn(dependency,'analyzeMemoDependencies').mockImplementation(()=> {throw new Error('failure');});
    const md=buildMarkdownReport(note([calc('A'),ref('B','A')])).markdown;
    expect(md).toContain('直接参照は確認不能'); expect(md).toContain('保存内部数値: 100'); expect(md).not.toContain('状態: 確定済み');
  });
  it.each([
    { result:null,resultText:'',error:null }, { result:null,resultText:'',error:'失敗' },
    { result:0,resultText:'0',error:null }, { result:-0,resultText:'0',error:null },
  ])('preserves source no-result/error/zero distinction %#', extra => {
    const md=section(buildMarkdownReport(note([calc('A','0',extra),ref('B','A')])).markdown,2);
    expect(md).toContain(`参照元の現在の保存内部数値: ${extra.result===null?'なし':Object.is(extra.result,-0)?'-0':extra.result}`);
    expect(md).toContain(extra.error?'計算エラー':extra.result===null?'未計算または結果なし':'古い可能性');
  });
  it('escapes source identifiers and preserves special multiline expressions with dynamic fences', () => {
    const id='A\n# [x]<img>'; const expr='1\n```\n# fake';
    const md=section(buildMarkdownReport(note([calc(id,expr),ref('B',id)])).markdown,2);
    expect(md).toContain('ID: A \\# \\[x\\]&lt;img&gt;'); expect(md).toContain(reportCode(expr)); expect(md).not.toContain('<img>');
  });
  it('does not read arbitrary historical-looking unknown fields, mutate input or invoke evaluator', () => {
    const n=note([calc('A'),ref('B','A')]); Object.assign(n.blocks![1],{ usedValues:{A:999},trial:{result:888} });
    const raw=JSON.stringify(n); const calculate=vi.spyOn(calculator,'calculateExpression'); const variable=vi.spyOn(calculator,'calculateVariableExpression');
    const md=buildMarkdownReport(n).markdown;
    expect(md).not.toContain('999'); expect(md).not.toContain('888'); expect(md).toContain('計算時の使用値は確認不能'); expect(JSON.stringify(n)).toBe(raw); expect(calculate).not.toHaveBeenCalled(); expect(variable).not.toHaveBeenCalled();
  });
  it('does not invent sources for empty notes or constant-only reference formulas', () => {
    expect(buildMarkdownReport(note([])).markdown).not.toContain('参照元:');
    const md=buildMarkdownReport(note([ref('B','A','1')])).markdown;
    expect(md).toContain('直接ID参照: なし'); expect(md).toContain('式で未使用の保存参照対応');
  });
  it('does not multiply long source display text across high fan-out dependencies', () => {
    const long = 'precision-record-'.repeat(1500);
    const blocks = [calc('A','100',{resultText:long}), ...Array.from({length:127},(_,i)=>ref('B'+i,'A'))];
    const raw=JSON.stringify(blocks); const md=buildMarkdownReport(note(blocks)).markdown;
    expect(md.split(long)).toHaveLength(3); // source body and first reference only
    expect(md).toContain('重複掲載を省略'); expect(md.length).toBeLessThan(300000); expect(JSON.stringify(blocks)).toBe(raw);
  });

  it('fails explicitly instead of returning a silently shortened oversized report', () => {
    vi.spyOn(mermaid, 'toMermaid').mockReturnValue('x'.repeat(4_000_000));
    expect(() => buildMarkdownReport(note([calc('A')]))).toThrow('出力が上限（400万文字）');
  });

  it('bounds expanded identifiers without silently falling back to an incomplete report', () => {
    const blocks = Array.from({length:127},(_,i)=>calc('<'.repeat(6000)+i,'x=1',{evaluationMode:'note-variables'}));
    blocks.push(calc('reader','x',{evaluationMode:'note-variables'}));
    expect(JSON.stringify(blocks).length).toBeLessThan(1_000_000);
    expect(() => buildMarkdownReport(note(blocks))).toThrow('出力が上限（400万文字）');
  });

});
