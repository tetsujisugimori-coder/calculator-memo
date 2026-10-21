import { readFileSync } from 'node:fs';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { buildMarkdownReport, reportCode, reportFilename, REPORT_CHARACTER_LIMIT } from '../lib/markdown-report';
import { recalculateReferenceMemo } from '../lib/block-references';
import * as dependency from '../lib/dependency-analysis';
import * as mermaid from '../lib/dependency-mermaid';
import * as calculator from '../lib/calculator';
import type { CalculationMemoBlock, MemoBlock, PlainCalculationNote } from '../lib/types';
const calc = (id = 'A', expression = '100', extra: Partial<CalculationMemoBlock> = {}): CalculationMemoBlock => ({ id, type: 'calculation', expression, displayExpression: expression, result: 100, resultText: '100', error: null, ...extra });
const note = (blocks: MemoBlock[] = [], extra: Partial<PlainCalculationNote> = {}): PlainCalculationNote => ({ id: 'saved-note', type: 'plain-calculation', title: '計算記録', content: '', blocks, createdAt: '2026-10-21T00:00:00Z', updatedAt: '2026-10-21T01:00:00Z', ...extra });
const ref = (id: string, target: string) => calc(id, '@{1}+50', { evaluationMode: 'block-references', references: { version: 1, entries: [{ slot: 1, blockId: target }] } });
afterEach(() => vi.restoreAllMocks());
describe('saved Markdown reports', () => {
  it('reproduces the published example exactly without changing its signed fixture', () => {
    const raw = readFileSync(new URL('../docs/examples/markdown-report-fixture.json', import.meta.url), 'utf8');
    const fixture = JSON.parse(raw) as PlainCalculationNote; const before = JSON.stringify(fixture);
    expect(buildMarkdownReport(fixture).markdown).toBe(readFileSync(new URL('../docs/examples/markdown-report-example.md', import.meta.url), 'utf8'));
    expect(JSON.stringify(fixture)).toBe(before); expect(fixture.blocks?.filter(b => b.type === 'calculation').map(b => b.result)).toEqual([100, 150, 300]);
  });
  it('preserves mixed block order, source expressions and LaTeX, not cached content', () => {
    const r = buildMarkdownReport(note([{ id: 'intro', type: 'text', content: '**前提**: 税率' }, { id: 'math', type: 'formula', latex: '\\frac{1}{3}' }, calc('A', '1/3', { result: 1 / 3, resultText: '0.3333333333' }), { id: 'end', type: 'text', content: '結論' }], { content: 'OLD DERIVED CONTENT' })).markdown;
    expect(r.indexOf('**前提**')).toBeLessThan(r.indexOf('\\frac{1}{3}'));
    expect(r.indexOf('\\frac{1}{3}')).toBeLessThan(r.indexOf('入力式:'));
    expect(r.indexOf('入力式:')).toBeLessThan(r.indexOf('結論'));
    expect(r).toContain('保存内部数値: 0.3333333333333333'); expect(r).toContain('0.3333333333');
    expect(r).toContain('状態不明'); expect(r).not.toContain('OLD DERIVED CONTENT');
  });
  it('never evaluates, mutates frozen input or accesses persistence', () => {
    const input = note([calc(), ref('B', 'A')]);
    input.blocks!.forEach(Object.freeze); Object.freeze(input.blocks); Object.freeze(input);
    const before = JSON.stringify(input);
    const evaluate = vi.spyOn(calculator, 'calculateExpression');
    const variable = vi.spyOn(calculator, 'calculateVariableExpression');
    buildMarkdownReport(input);
    expect(evaluate).not.toHaveBeenCalled(); expect(variable).not.toHaveBeenCalled(); expect(JSON.stringify(input)).toBe(before);
  });
  it('only confirms signed current results and propagates stale dependencies', () => {
    const initial = [calc(), ref('B', 'A'), ref('C', 'B')];
    const completed = recalculateReferenceMemo(initial).blocks;
    const good = buildMarkdownReport(note(completed)).markdown;
    expect(good.match(/状態: 確定済み/g)).toHaveLength(3);
    const edited = completed.map(b => b.id === 'A' ? { ...b, expression: '200' } : b);
    const stale = buildMarkdownReport(note(edited)).markdown;
    expect(stale.match(/状態: 古い可能性/g)).toHaveLength(3); expect(stale).not.toContain('状態: 確定済み');
    expect(stale).toContain('保存内部数値: 150');
  });
  it('does not certify consumers of contradictory failed transaction records', () => {
    const signed = recalculateReferenceMemo([calc(), ref('B', 'A')]).blocks;
    const source = signed[0] as CalculationMemoBlock; source.evaluationState!.attemptError = 'failed transaction';
    const r = buildMarkdownReport(note(signed)).markdown;
    expect(r.match(/状態: 古い可能性/g)).toHaveLength(2); expect(r).not.toContain('状態: 確定済み');
  });
  it('does not trust current without a matching signature', () => {
    const r = buildMarkdownReport(note([calc('A', '100', { evaluationState: { version: 1, status: 'current' } })])).markdown;
    expect(r).toContain('状態: 古い可能性'); expect(r).not.toContain('状態: 確定済み');
  });
  it.each([
    [calc('A', '1/0', { result: null, resultText: '', error: 'ゼロ除算' }), '計算エラー'],
    [calc('A', '', { result: null, resultText: '' }), '未計算または結果なし'],
    [calc(), '状態不明'],
    [calc('A', '100', { evaluationState: { version: 1, status: 'stale', attemptError: '失敗' } }), '古い可能性'],
  ])('distinguishes saved states %#', (block, label) => expect(buildMarkdownReport(note([block as CalculationMemoBlock])).markdown).toContain(`状態: ${label}`));
  it('reports missing references and source IDs', () => {
    const r = buildMarkdownReport(note([ref('B', 'gone')])).markdown;
    expect(r).toContain('gone（参照先なし）'); expect(r).toContain('参照切れ'); expect(r).toContain('古い可能性');
  });
  it.each([[ref('A', 'A')], [ref('A', 'B'), ref('B', 'A')]])('retains cyclic graph and diagnostic %#', (...blocks) => {
    const r = buildMarkdownReport(note(blocks as MemoBlock[])).markdown;
    expect(r).toContain('```mermaid'); expect(r).toMatch(/循環|自己参照/); expect(r).not.toContain('状態: 確定済み');
  });
  it('keeps legacy variable binding uncertain', () => {
    const r = buildMarkdownReport(note([calc('A', 'x=100', { evaluationMode: 'note-variables' }), calc('B', 'x+1', { evaluationMode: 'note-variables' })])).markdown;
    expect(r).toContain('旧変数 x の候補: A（不確定'); expect(r).toContain('-.->'); expect(r).toContain('状態不明');
  });
  it('retains invalid expressions and downstream diagnostic', () => {
    const r = buildMarkdownReport(note([calc('A', '('), ref('B', 'A')])).markdown;
    expect(r).toContain('\n(\n'); expect(r).toContain('invalid\\-expression'); expect(r).not.toContain('状態: 確定済み');
  });
  it('preserves empty notes without an empty graph', () => {
    const r = buildMarkdownReport(note()).markdown;
    expect(r).toContain('本文ブロックはありません'); expect(r).not.toContain('```mermaid');
  });
  it('supports content-only old notes without normalization or calculation', () => {
    const r = buildMarkdownReport(note([], { blocks: undefined, content: '# 旧本文\n\nそのまま' })).markdown;
    expect(r).toContain('# 旧本文'); expect(r).toContain('そのまま');
  });
  it('retains raw expression with multiline and closing fences safely', () => {
    const input = 'x\n```\n# not-a-report-title\n````';
    const r = buildMarkdownReport(note([calc('A', input)])).markdown;
    expect(r).toContain('`````text\n' + input + '\n`````');
  });
  it('escapes title and IDs, preserves Markdown and neutralizes raw HTML', () => {
    const r = buildMarkdownReport(note([{ id: '<id>\n#x', type: 'text', content: '**太字**\n<script>alert(1)</script>\n:::calc\n2+2\n:::' }], { title: '<img>\n# title [a](javascript:evil)' }));
    expect(r.markdown).not.toContain('<script>'); expect(r.markdown).not.toContain('<img>');
    expect(r.markdown).toContain('**太字**'); expect(r.markdown).toContain('\\:\\:\\:calc'); expect(r.warnings.length).toBeGreaterThan(0);
  });
  it.each(['```js\nhello', '~~~~\nhello', '$$\nx'])('closes unmatched body delimiters without modifying original: %s', content => {
    const n = note([{ id: 'text', type: 'text', content }]); const before = JSON.stringify(n);
    const r = buildMarkdownReport(n); expect(r.warnings.some(w => w.includes('未閉鎖'))).toBe(true); expect(JSON.stringify(n)).toBe(before);
  });
  it('does not treat backticks inside display math as a Markdown fence', () => {
    const content = '$$\nx\n```\ny\n$$';
    const r = buildMarkdownReport(note([{ id: 'math-text', type: 'text', content }]));
    expect(r.markdown).toContain(reportCode('x\n```\ny', 'latex')); expect(r.warnings.some(w => w.includes('未閉鎖'))).toBe(false);
  });
  it('preserves alignment ampersands in Markdown math and literalizes HTML-bearing math', () => {
    const content = '$$\n\\begin{aligned}a&=b\\end{aligned}\n$$\n$x<y$';
    const r = buildMarkdownReport(note([{ id: 'm', type: 'text', content }]));
    expect(r.markdown).toContain('a&=b'); expect(r.markdown).not.toContain('a&amp;=b'); expect(r.markdown).toContain(reportCode('$x<y$', 'markdown')); expect(r.warnings.length).toBeGreaterThan(0);
  });
  it('does not modify code fence contents including HTML', () => {
    const r = buildMarkdownReport(note([{ id: 'text', type: 'text', content: '````html\n<script>\n```\n````' }]));
    expect(r.markdown).toContain('````html\n<script>\n```\n````'); expect(r.warnings.some(w => w.includes('未閉鎖'))).toBe(false);
  });
  it.each(['x\n$$\n# escape', '<tag>', 'x\n```\ny', 'x\n~~~\ny'])('falls back to literal LaTeX for structural delimiters %s', latex => {
    const r = buildMarkdownReport(note([{ id: 'math', type: 'formula', latex }]));
    expect(r.markdown).toContain(reportCode(latex, 'latex')); expect(r.warnings.length).toBeGreaterThan(0);
  });
  it('reports graph analysis failure without losing text or saved values', () => {
    vi.spyOn(dependency, 'analyzeMemoDependencies').mockImplementation(() => { throw new Error('test'); });
    const r = buildMarkdownReport(note([{ id: 't', type: 'text', content: 'keep me' }, calc()]));
    expect(r.markdown).toContain('keep me'); expect(r.markdown).toContain('保存内部数値: 100'); expect(r.markdown).toContain('状態不明'); expect(r.markdown).toContain('解析処理に失敗');
  });
  it('reports Mermaid failure and keeps dependency references', () => {
    vi.spyOn(mermaid, 'toMermaid').mockImplementation(() => { throw new Error('test'); });
    const r = buildMarkdownReport(note([calc(), ref('B', 'A')])); expect(r.markdown).toContain('生成に失敗'); expect(r.markdown).toContain('ID参照 @{1} → A');
  });
  it('retains all blocks when graph limit is exceeded', () => {
    const r = buildMarkdownReport(note(Array.from({ length: 129 }, (_, i) => calc(`C${i}`))));
    expect(r.markdown).toContain('ブロック 129'); expect(r.markdown).toContain('解析は不完全'); expect(r.markdown).toContain('128');
  });
  it.each([
    [{ id: 'A', type: 'future' }], [calc(), calc()], [calc('A', '1', { evaluationMode: 'future' })], [{ id: 'A', type: 'calculation' }],
  ])('refuses unsupported structures rather than silently omitting %#', (...blocks) => expect(() => buildMarkdownReport(note(blocks as MemoBlock[]))).toThrow(/未対応|不正/));
  it('keeps opaque extras unchanged and explicitly limits report completeness', () => {
    const n = { ...note([calc()]), proofRef: { unknown: 'keep' } }; const before = JSON.stringify(n);
    expect(buildMarkdownReport(n).markdown).toContain('未知の付随フィールド'); expect(JSON.stringify(n)).toBe(before);
  });
  it('refuses over-limit text without silent truncation', () => expect(() => buildMarkdownReport(note([{ id: 't', type: 'text', content: 'a'.repeat(REPORT_CHARACTER_LIMIT) }]))).toThrow('上限'));
  it('handles long text and many small backtick runs without argument overflow', () => expect(reportCode('` '.repeat(100_000))).toContain('```text'));
  it('keeps negative zero internal representation', () => expect(buildMarkdownReport(note([calc('A', '-0', { result: -0, resultText: '0' })])).markdown).toContain('保存内部数値: -0'));
  it.each(['', '.', '..', 'CON', 'a/b\\c:*?"<>|', '😀'.repeat(100)])('creates a bounded basename %s', title => {
    const file = reportFilename(title); expect(file).toMatch(/\.md$/); expect(file).not.toMatch(/[<>:"/\\|?*]/); expect(Array.from(file).length).toBeLessThanOrEqual(88); expect(file).not.toBe('.md'); expect(new TextEncoder().encode(file).length).toBeLessThanOrEqual(200);
  });
});
