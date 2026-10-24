import { evidenceInputLabel, evidenceModeLabel, evidenceRowLabel } from './evidence-comparison';
import { compareQuoteToRecord } from './formula-quote-comparison';
import { insertQuoteAtCursor, readQuoteAssessments, type QuoteAssessment } from './formula-report-quotes';
import { parseMarkdownBlocks } from './markdown-blocks';
import { reportCode, reportLines } from './markdown-report';
import type { FormulaReportEvidenceLink, Memo } from './types';

// Distinct inert language prevents values from impersonating fixed-quote text fences.
const differenceValue = (value: string) => reportCode(value, 'calculation-difference-value');

/** Presentation of the existing validated comparison, not a second difference engine.
 * No clocks, current draft values, recalculation, persistence or quote rewriting.
 */
export function buildQuoteDifferenceMarkdown(quote: QuoteAssessment, formulaId: string, notes: Memo[], links: FormulaReportEvidenceLink[], targetKey: string): string {
  const comparison = compareQuoteToRecord(quote, formulaId, notes, links, targetKey);
  const snapshot = quote.snapshot!;
  const lines = reportLines(['## 引用時の計算記録と保存記録の差分', '',
    '登録式ID:', '', differenceValue(formulaId), '', 'メモID:', '', differenceValue(snapshot.memoId), '',
    '引用ID:', '', differenceValue(snapshot.quoteId), '', '引用対象ブロックID:', '', differenceValue(snapshot.blockId), '',
    '比較元は追跡情報に保持された引用時の記録、比較先は利用者が明示選択した別の保存記録です。元の固定引用・追跡情報・引用時snapshotは更新していません。', '',
    '比較範囲は同じメモID内の記録全体です。ブロックIDで対応付け、式、計算モード、実使用参照元・内部値、表示結果・内部結果、本文順・実行順、追加・削除を比較します。現在のメモ・未保存編集・試算は含まず、再計算はしていません。', '']);
  if (quote.status === 'edited') lines.push('引用本文は編集されています。比較元は追跡情報に保存された引用時記録であり、編集後の文章そのものではありません。', '');
  for (const [name, record] of [['引用時', comparison.before], ['比較先（明示選択）', comparison.after]] as const) {
    lines.push(`### ${name}`, '', '記録ID:', '', differenceValue(record.id), '',
      '計算日時:', '', differenceValue(record.calculatedAt || '記録日時なし'), '',
      '保存要求時刻:', '', differenceValue(record.persistedAt || '記録日時なし'), '',
      '- 記録状態: 保存された確定計算記録（現在の結果・説明の確認済み判定ではありません）', '');
  }
  lines.push('日時は記録された端末時計の文字列です。保存要求時刻は保存完了時刻ではありません。日時順での並べ替えや、欠けた日時の現在時刻による補完はしていません。', '',
    '### 観測された変更', '',
    `変更: ${comparison.counts.changed} / 追加: ${comparison.counts.added} / 削除: ${comparison.counts.removed} / 同一（比較対象項目に変更なし）: ${comparison.counts.unchanged}`, '');
  for (const row of comparison.rows) {
    lines.push('ブロックID:', '', differenceValue(row.blockId), '', evidenceRowLabel(row), '');
  }
  for (const row of comparison.rows.filter(item => item.kind !== 'unchanged')) {
    lines.push('', '### ブロックの変更詳細', '', 'ブロックID:', '', differenceValue(row.blockId), '', evidenceRowLabel(row), '');
    for (const [name, side] of [['引用時', row.before], ['比較先', row.after]] as const) {
      lines.push(`#### ${name}`, '');
      if (!side) { lines.push('この側の計算記録には存在しません。値は確認不能です。', ''); continue; }
      const { block, executionOrder } = side;
      lines.push('計算モード:', '', differenceValue(evidenceModeLabel(block)), '', `- 本文順: ${block.position} / 実行順: ${executionOrder}`, '- 結果状態: 成功（この保存記録内）', '',
        '式:', '', differenceValue(block.expression), '', '表示結果（丸め・整形済み）:', '', differenceValue(block.resultText), '',
        '内部結果（丸め前、負のゼロを区別）:', '', differenceValue(block.result), '', '実使用参照元・内部値:', '');
      if (!block.inputs.length) lines.push('実使用のID参照・旧変数なし（記録された読取り）。', '');
      for (const input of block.inputs) lines.push('実使用参照名・種類:', '', differenceValue(evidenceInputLabel(input, block)), '',
        '参照元ブロックID:', '', differenceValue(input.sourceBlockId), '', '実使用内部値:', '', differenceValue(input.value), '');
    }
  }
  lines.push('### 比較不能・解釈上の制限', '', ...comparison.warnings.flatMap(warning => [differenceValue(warning), '']),
    '- 実使用の参照名・種類と参照元ID、保存された内部値を比較します。未使用候補や入力読取り順だけの差は比較しません。',
    '- 変更理由・編集意図・数学的正しさ・説明や証明の妥当性は不明です。差分は観測結果であり、原因や正誤を自動判定していません。',
    '- 追加・削除は選択した計算記録間だけの意味です。メモ本文全体の編集履歴ではありません。', '');
  return lines.join('\n');
}

/** Preserve the entire fixed quotation, including the gap before tracking metadata.
 * Offsets use textarea-normalized UTF-16 positions, just like the shared inserter.
 */
export function insertDifferenceAtCursor(body: string, markdown: string, formulaId: string, start: number, end = start): { body: string; caret: number } {
  const normalize = (text: string) => text.replace(/\r\n?/g, '\n');
  const ranges = readQuoteAssessments(body, formulaId, []).map(quote => ({ start: quote.start, end: quote.end }));
  const blocks = parseMarkdownBlocks(body);
  // Protect a recognizable pair even if metadata is future, corrupt or foreign.
  blocks.forEach((block, index) => {
    if (block.kind !== 'code' || !block.language.startsWith('calculator-memo-evidence')) return;
    const previous = blocks[index - 1];
    if (previous?.kind === 'code' && previous.language === 'text') ranges.push({ start: previous.start, end: block.end });
  });
  if (ranges.some(range => start > normalize(body.slice(0, range.start)).length && start < normalize(body.slice(0, range.end)).length)) {
    throw new Error('固定引用の本文と追跡情報の間・内部へは差分を挿入できません。引用全体の外へカーソルを移してください。本文は保持しています。');
  }
  return insertQuoteAtCursor(body, markdown, start, end);
}
