import { scanAuditComparisonRecordEnvelopes } from './formula-report-audit-comparison-record';
import { outsideAuditRecordBlocks, scanAuditRecordEnvelopes } from './formula-report-audit-record';
import { validateQuoteSnapshot, type QuoteSnapshot } from './formula-report-snapshots';
import { scanDifferenceEnvelopes } from './formula-report-diff-envelope';
import { resolveReportEvidence } from './formula-report-evidence';
import { parseMarkdownBlocks, type MarkdownBlock } from './markdown-blocks';
import type { FormulaReportEvidenceLink, Memo } from './types';

export type { QuoteSnapshot } from './formula-report-snapshots';
export { validateQuoteSnapshot } from './formula-report-snapshots';
export type QuoteStatus = 'matched' | 'source-changed' | 'source-missing' | 'unavailable' | 'edited' | 'invalid';
export type QuoteAssessment = { status: QuoteStatus; reason: string; snapshot?: QuoteSnapshot; start: number; end: number };
const LANGUAGE = 'calculator-memo-evidence-v1';
const normalizeLines = (value: string) => value.replace(/\r\n?/g, '\n');
/** The caller must supply links from the saved report, not uncommitted link edits. */
export function quoteCandidates(notes: Memo[], persistedLinks: FormulaReportEvidenceLink[]) {
  return resolveReportEvidence(notes, persistedLinks).filter(item => item.status === 'available' && item.record);
}
function fence(text: string, language: string): string {
  const length = Math.max(3, ...Array.from(text.matchAll(/`+/g), match => match[0].length + 1));
  const marker = '`'.repeat(length);
  return `${marker}${language}\n${text}\n${marker}`;
}
function readable(snapshot: QuoteSnapshot): string {
  const block = snapshot.record.blocks.find(item => item.blockId === snapshot.blockId)!;
  return [
    '計算根拠引用（固定スナップショット）', `引用ID：${snapshot.quoteId}`, `登録式ID：${snapshot.formulaId}`,
    `メモID：${snapshot.memoId}`, `記録ID：${snapshot.record.id}`, `ブロックID：${snapshot.blockId}`,
    `引用日時：${snapshot.citedAt}`, `計算日時：${snapshot.record.calculatedAt}`, `保存要求時刻：${snapshot.record.persistedAt}`,
    `本文順：${block.position}`, `実行順：${snapshot.record.blocks.findIndex(item => item.blockId === snapshot.blockId) + 1}`,
    `計算モード：${block.evaluationMode ?? 'legacy（旧方式）'}`, `当時の式：\n${block.expression}`,
    `当時の表示結果：\n${block.resultText}`, `当時の内部結果：${block.result}`,
    '記録内の状態：成功・確定記録。真正性や数学的証明の保証ではありません。',
    '実使用参照元・内部値：', ...(block.inputs.length ? block.inputs.map(input => `${input.kind} / ${input.name} / 元ブロックID：${input.sourceBlockId} / 内部値：${input.value}`) : ['記録内に実使用参照入力なし']),
    '追跡対象は同じIDの保存記録全体です。現在の計算メモ本文や新しい別IDの計算記録とは比較しません。',
  ].join('\n');
}
/** No evaluation, saving or confirmation. Metadata remains ordinary exportable Markdown. */
export function createQuoteMarkdown(snapshot: QuoteSnapshot): string {
  validateQuoteSnapshot(snapshot);
  const markdown = `${fence(readable(snapshot), 'text')}\n\n${fence(JSON.stringify(snapshot), LANGUAGE)}`;
  if (markdown.length > 100_000) throw new Error('引用が本文上限100,000文字を超えます。切り捨てず挿入を停止しました。');
  return markdown;
}

export function readQuoteAssessments(body: string, formulaId: string, notes: Memo[], availability: { error?: string; stale?: boolean } = {}, parsedBlocks?: MarkdownBlock[]): QuoteAssessment[] {
  if (body.length > 100_000) return [{ status: 'unavailable', reason: '本文上限超過のため引用照合を停止しています。本文は保持しています。', start: 0, end: body.length }];
  const blocks = outsideAuditRecordBlocks(body, parsedBlocks ?? parseMarkdownBlocks(body));
  const auditRanges = [...scanAuditRecordEnvelopes(body), ...scanAuditComparisonRecordEnvelopes(body)];
  const results: QuoteAssessment[] = [];
  for (let index = 0; index < blocks.length; index++) {
    const metadata = blocks[index];
    if (metadata.kind !== 'code' || !metadata.language.startsWith('calculator-memo-evidence')) continue;
    const result: QuoteAssessment = { status: 'invalid', reason: '未対応または不正な引用メタデータです。本文は保持しています。', start: metadata.start, end: metadata.end };
    results.push(result);
    try {
      if (metadata.language !== LANGUAGE) continue;
      const snapshot: unknown = JSON.parse(metadata.text);
      validateQuoteSnapshot(snapshot);
      result.snapshot = snapshot;
      if (snapshot.formulaId !== formulaId) { result.reason = 'この登録式とは異なる登録式IDの引用です。照合できません。'; continue; }
      const visible = blocks[index - 1];
      if (!visible || visible.kind !== 'code' || visible.language !== 'text') { result.status = 'edited'; result.reason = '引用本文が欠落または編集されています。メタデータとの整合を確認できません。'; continue; }
      result.start = visible.start;
      if (auditRanges.some(range => result.start < range.end && result.end > range.start)) { result.status = 'invalid'; result.reason = '固定引用と固定点検記録の領域が交差しています。本文対応を推測しません。'; delete result.snapshot; continue; }
      // Parser end includes the final line break. Ignore only that structural line break.
      const actual = normalizeLines(body.slice(visible.start, metadata.end)).replace(/\n$/, '');
      if (actual !== normalizeLines(createQuoteMarkdown(snapshot))) { result.status = 'edited'; result.reason = '引用本文または形式が編集されています。引用時メタデータとの整合を確認できません。'; continue; }
      if (availability.error || availability.stale) { result.status = 'unavailable'; result.reason = availability.error ? '原本取得失敗：引用元を照合できません。引用本文は保持しています。' : '根拠未照合：原本の更新を検知しました。明示再取得が必要です。'; continue; }
      const source = resolveReportEvidence(notes, [{ memoId: snapshot.memoId, recordId: snapshot.record.id }])[0];
      if (source.status === 'missing') { result.status = 'source-missing'; result.reason = '引用元の保存記録が欠落しています。引用本文は保持しています。'; continue; }
      if (source.status !== 'available' || !source.record) { result.status = 'unavailable'; result.reason = '引用元が未知・不正な形式のため照合できません。'; continue; }
      if (!source.record.blocks.some(block => block.blockId === snapshot.blockId)) { result.status = 'source-missing'; result.reason = '引用元の対象ブロックが欠落しています。引用本文は保持しています。'; continue; }
      result.status = JSON.stringify(source.record) === JSON.stringify(snapshot.record) ? 'matched' : 'source-changed';
      result.reason = result.status === 'matched' ? '取得原本の保存記録全体と一致。数学的証明や現在の計算結果の承認ではありません。' : '引用元の同一ID保存記録が変更されています。引用本文は自動更新しません。';
    } catch { /* Unknown payloads remain visible Markdown, never silently repaired. */ }
  }
  // A removed metadata fence must not make a surviving fixed-quote label disappear
  // from the audit. This is detection of our visible form, not arbitrary prose.
  for (let index = 0; index < blocks.length; index++) {
    const visible = blocks[index], following = blocks[index + 1];
    if (visible.kind === 'code' && visible.language === 'text' && visible.text.startsWith('計算根拠引用（固定スナップショット）\n')
      && !(following?.kind === 'code' && following.language.startsWith('calculator-memo-evidence'))) {
      results.push({ status: 'invalid', reason: '引用メタデータが欠落しています。表示本文だけでは引用元を照合できません。', start: visible.start, end: visible.end });
    }
  }
  results.sort((a, b) => a.start - b.start);
  const counts = new Map<string, number>();
  for (const item of results) if (item.snapshot) counts.set(item.snapshot.quoteId, (counts.get(item.snapshot.quoteId) ?? 0) + 1);
  for (const item of results) if (item.snapshot && counts.get(item.snapshot.quoteId)! > 1) { item.status = 'invalid'; item.reason = '引用IDが重複しています。別の引用と一意に区別できません。'; }
  return results;
}

/** DOM textarea offsets normalize CRLF; map them back without rewriting untouched text. */
function originalOffset(body: string, offset: number): number {
  if (!Number.isInteger(offset) || offset < 0 || offset > normalizeLines(body).length) throw new Error('挿入位置を確認できません。本文は保持しています。');
  let normalized = 0; let original = 0;
  while (normalized < offset) { if (body[original] === '\r' && body[original + 1] === '\n') original += 2; else original++; normalized++; }
  return original;
}
export function insertQuoteAtCursor(body: string, quote: string, selectionStart: number, selectionEnd = selectionStart): { body: string; caret: number } {
  const start = originalOffset(body, selectionStart); originalOffset(body, selectionEnd);
  if (selectionEnd < selectionStart) throw new Error('挿入位置を確認できません。');
  if (parseMarkdownBlocks(body).some(block => {
    if ((block.kind !== 'code' && block.kind !== 'math') || start <= block.start || start > block.end) return false;
    if (start < block.end) return true;
    // At the exclusive end, only an actually closed fence is safe. Unclosed
    // blocks consume EOF, including trailing empty lines, in the shared parser.
    const lines = normalizeLines(body.slice(block.start, block.end)).split('\n');
    if (lines.length < 2) return true;
    if (block.kind === 'math') return lines.at(-1)!.trim() !== '$$';
    const opening = lines[0].match(/^ {0,3}(`{3,}|~{3,})/);
    const closing = lines.at(-1)!.match(/^ {0,3}(`+|~+)[ \t]*$/);
    return !opening || !closing || opening[1][0] !== closing[1][0] || closing[1].length < opening[1].length;
  })) {
    throw new Error('コード・数式ブロック内へは引用を挿入できません。ブロック外へカーソルを移してください。本文は保持しています。');
  }
  // Difference tracking has a structured envelope. Do not split its body from
  // its metadata, including future or damaged envelopes, when inserting quotes.
  for (const range of [...scanDifferenceEnvelopes(body, outsideAuditRecordBlocks(body)), ...scanAuditRecordEnvelopes(body), ...scanAuditComparisonRecordEnvelopes(body)]) {
    if (start > range.start && (start < range.end || (!range.closed && start === range.end))) {
      throw new Error('比較差分・固定点検記録・固定比較資料の本文・追跡情報の内部、または終了を確認できない範囲へは挿入できません。本文を保持し、差分全体の前へカーソルを移してください。');
    }
  }
  // Insert before the selected range; never delete the selected or surrounding prose.
  const addition = `${start ? '\n\n' : ''}${quote}\n\n`;
  const next = body.slice(0, start) + addition + body.slice(start);
  if (next.length > 100_000) throw new Error('本文上限100,000文字を超えます。切り捨てず挿入を停止しました。');
  return { body: next, caret: selectionStart + addition.length };
}
