import { describe, expect, it } from 'vitest';
import { insertQuoteAtCursor, type QuoteSnapshot } from '../lib/formula-report-quotes';
import { buildQuoteDifferenceMarkdown, insertDifferenceAtCursor } from '../lib/formula-report-diff';
import { createTrackedDifferenceMarkdown, readDifferenceAssessments } from '../lib/formula-report-diff-tracking';
import type { EvidenceRecord } from '../lib/calculation-evidence';
import type { Memo } from '../lib/types';
const at = '2026-10-24T00:00:00.000Z';
function fixture(id = 'd') {
  const before: EvidenceRecord = { id: 'a', evaluator: 'calculator-memo-v1', status: 'confirmed', calculatedAt: at, persistedAt: at, blocks: [{ blockId: 'b', position: 1, expression: '1', result: '1', resultText: '1', status: 'success', inputs: [] }] };
  const after = structuredClone(before); after.id = 'z'; after.blocks[0].result = '2';
  const quote: QuoteSnapshot = { version: 1, quoteId: 'q', formulaId: 'f', memoId: 'm', blockId: 'b', citedAt: at, record: before };
  const notes = [{ id: 'm', type: 'plain-calculation', title: '', content: '', createdAt: at, updatedAt: at, calculationEvidence: { version: 1, records: [before, after] } }] as Memo[];
  const markdown = buildQuoteDifferenceMarkdown({ status: 'matched', reason: '', start: 0, end: 0, snapshot: quote }, 'f', notes, [{ memoId: 'm', recordId: 'z' }], '["m","z"]');
  const body = createTrackedDifferenceMarkdown(markdown, quote, after, id, at);
  return { body, notes, quote, after };
}
const normalize = (s: string) => s.replace(/\r\n?/g, '\n');
const insertions = [
  ['quote', (body: string, start: number, end = start) => insertQuoteAtCursor(body, '追加😀', start, end)],
  ['difference', (body: string, start: number, end = start) => insertDifferenceAtCursor(body, '追加😀', 'f', start, end)],
] as const;
const fake = '```calculator-memo-difference-preview\n{}\n```\n\n';
describe.each(insertions)('%s difference envelope insertion boundary', (_kind, insert) => {
  it.each(['\n', '\r\n'])('rejects the original bypass after unknown intermediate fence (%j)', eol => {
    const f = fixture();
    const body = ('日本語😀\n\n' + f.body.replace('### 観測された変更', fake + '### 観測された変更')).replace(/\n/g, eol);
    const raw = JSON.stringify(f); const offset = normalize(body).indexOf('### 観測された変更');
    expect(() => insert(body, offset, offset + 4)).toThrow();
    expect(JSON.stringify(f)).toBe(raw);
  });
});

const variants: [string, (body: string) => string][] = [
  ['future start and end', body => body.replaceAll('difference-start-v1', 'difference-start-v2').replaceAll('difference-v1', 'difference-v2')],
  ['future end', body => body.replaceAll('difference-v1', 'difference-v2')],
  ['malformed start JSON', body => body.replace('{"version":1,"differenceId":"d"}', '{broken')],
  ['unknown start field', body => body.replace('{"version":1,"differenceId":"d"}', '{"version":1,"differenceId":"d","future":true}')],
  ['unknown intermediate', body => body.replace('### 観測された変更', fake + '### 観測された変更')],
  ['malformed end JSON', body => body.replace(/(```calculator-memo-difference-v1\n)[^\n]+/, '$1{broken')],
  ['unknown end field', body => body.replace('"preparedAt"', '"extra":1,"preparedAt"')],
  ['different end ID', body => body.replace('"differenceId":"d","preparedAt"', '"differenceId":"other","preparedAt"')],
  ['invalid end snapshot', body => body.replace('"quoteBodyEdited":false', '"quoteBodyEdited":"false"')],
  ['missing end', body => body.slice(0, body.indexOf('```calculator-memo-difference-v1'))],
  ['missing end closing fence', body => body.slice(0, -3)],
  ['short end closing fence', body => body.slice(0, -3) + '``'],
  ['wrong end closing fence', body => body.slice(0, -3) + '~~~'],
  ['duplicate start', body => body.replace('### 観測された変更', '```calculator-memo-difference-start-v1\n{"version":1,"differenceId":"d"}\n```\n\n### 観測された変更')],
  ['nested complete difference', body => body.replace('### 観測された変更', fixture('nested').body + '\n\n### 観測された変更')],
];
describe.each(insertions)('%s fail-closed ranges and intact boundaries', (_kind, insert) => {
  describe.each(['\n', '\r\n'])('line ending %j with Japanese/emoji UTF-16', eol => {
    it.each(variants)('does not recover an ambiguous %s envelope at a later marker', (_name, change) => {
      const f = fixture();
      const raw = JSON.stringify(f);
      const body = ('前置き😀日本語\n\n' + change(f.body) + '\n\n後置き😀').replace(/\n/g, eol);
      const normalized = normalize(body), start = normalized.indexOf('```calculator-memo-difference');
      // Before the ambiguous opening is safe; its rest, including EOF, is not.
      expect(insert(body, start).body.endsWith(body.slice(body.indexOf('```calculator-memo-difference')))).toBe(true);
      expect(() => insert(body, normalized.indexOf('後置き'))).toThrow();
      expect(() => insert(body, normalized.length)).toThrow();
      expect(() => insert(body, normalized.indexOf('### 引用時'))).toThrow();
      expect(JSON.stringify(f)).toBe(raw);
      const assessments = readDifferenceAssessments(body, 'f', f.notes);
      expect(assessments.every(item => !item.snapshot && !item.before && !item.after && item.status !== 'tracked')).toBe(true);
    });
    it('keeps v1 start/end and multiple complete boundaries insertable without replacing selection', () => {
      const first = fixture(), second = fixture('second');
      const body = ('日本語😀\n\n' + first.body + '\n\n間😀\n\n' + second.body + '\n\n終😀').replace(/\n/g, eol);
      const normalized = normalize(body);
      const positions = [normalized.indexOf('```calculator-memo-difference-start-v1'), normalized.indexOf('\n\n間😀'), normalized.lastIndexOf('```calculator-memo-difference-start-v1'), normalized.indexOf('\n\n終😀'), normalized.length];
      for (const pos of positions) {
        const result = insert(body, pos, normalized.length);
        expect(result.body.replace(/\n\n追加😀\n\n|追加😀\n\n/, '')).toBe(body);
        expect(result.caret).toBe(pos + (pos ? 2 : 0) + '追加😀\n\n'.length);
      }
      expect(readDifferenceAssessments(body, 'f', first.notes).map(item => item.status)).toEqual(['tracked', 'tracked']);
    });
    it('honors fenced-code nesting, tilde/longer fences and edited ordinary prose', () => {
      const f = fixture();
      const body = (f.body.replace('### 観測された変更', '~~~~text\n```calculator-memo-difference-preview\n{}\n```\n~~~~\n\n### 観測された変更')).replace(/\n/g, eol);
      expect(() => insert(body, normalize(body).indexOf('### 観測された変更'))).toThrow();
      expect(insert(body, normalize(body).length).body.startsWith(body)).toBe(true);
      expect(readDifferenceAssessments(body, 'f', f.notes)[0].status).toBe('edited');
      const tilde = f.body.replaceAll('```', '~~~~').replace(/\n/g, eol);
      expect(insert(tilde, normalize(tilde).length).body.startsWith(tilde)).toBe(true);
    });
  });
  it('rejects invalid selections without changing the input', () => {
    const { body } = fixture(); const raw = body;
    for (const [start, end] of [[-1, 0], [1, 0], [body.length + 1, body.length + 1], [0, 0.5]]) expect(() => insert(body, start, end)).toThrow();
    expect(body).toBe(raw);
  });
});
