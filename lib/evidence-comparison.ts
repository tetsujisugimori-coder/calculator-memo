import { validCalculationEvidence, type EvidenceBlock, type EvidenceInput, type EvidenceRecord } from './calculation-evidence';
import { literal, reportCode, reportFilename, reportLines, REPORT_CHARACTER_LIMIT, type MarkdownReport } from './markdown-report';

export const EVIDENCE_CHANGE_LABELS = {
  expression: '入力式', mode: '計算モード', sources: '実使用参照元', values: '実使用内部値',
  displayResult: '表示結果', internalResult: '内部結果', bodyOrder: '本文順', executionOrder: '実行順',
} as const;
export type EvidenceChangeKey = keyof typeof EVIDENCE_CHANGE_LABELS;
export type EvidenceComparisonSide = { block: EvidenceBlock; executionOrder: number };
export type EvidenceComparisonRow = {
  blockId: string; before?: EvidenceComparisonSide; after?: EvidenceComparisonSide;
  kind: 'added' | 'removed' | 'changed' | 'unchanged'; changes: EvidenceChangeKey[];
};
export type EvidenceComparison = {
  before: EvidenceRecord; after: EvidenceRecord; rows: EvidenceComparisonRow[];
  counts: { added: number; removed: number; changed: number; unchanged: number }; warnings: string[];
};

/** Only known v1 meanings are compared. Extra fields remain untouched, not certified. */
function hasUnknownFields(record: EvidenceRecord): boolean {
  const extra = (object: object, keys: string[]) => Object.keys(object).some(key => !keys.includes(key));
  return extra(record, ['id', 'calculatedAt', 'persistedAt', 'evaluator', 'status', 'blocks']) || record.blocks.some(block =>
    extra(block, ['blockId', 'position', 'expression', 'evaluationMode', 'references', 'inputs', 'result', 'resultText', 'status'])
    || block.inputs.some(input => extra(input, ['kind', 'name', 'sourceBlockId', 'value']))
    || (block.references && (extra(block.references, ['version', 'entries']) || block.references.entries.some(entry => extra(entry, ['slot', 'blockId'])))));
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
const inputKey = (input: EvidenceInput) => JSON.stringify([input.kind, input.name]);
const inputMap = (block: EvidenceBlock, field: 'sourceBlockId' | 'value') => JSON.stringify(
  block.inputs.map(input => [inputKey(input), input[field]]).sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0),
);

/** No parsing/evaluation, present-day memo lookup, clock or persistence operations. */
export function compareEvidenceRecords(before: EvidenceRecord, after: EvidenceRecord, options: { allowSameRecordId?: boolean } = {}): EvidenceComparison {
  if (!validCalculationEvidence({ version: 1, records: [before] }) || !validCalculationEvidence({ version: 1, records: [after] })) {
    throw new Error('比較不可: 未対応または不正な計算記録です。欠けた情報は確認不能であり、現在のメモから補完しません。元データを保護してください。');
  }
  if (before.id === after.id && !options.allowSameRecordId) throw new Error('比較には異なる2件の保存記録を選んでください。');
  const left = structuredClone(before), right = structuredClone(after);
  const leftById = new Map(left.blocks.map((block, index) => [block.blockId, { block, executionOrder: index + 1 }]));
  const rightById = new Map(right.blocks.map((block, index) => [block.blockId, { block, executionOrder: index + 1 }]));
  // Stable ID is the only correspondence rule. Display follows the selected after
  // record's body order, then before-only rows. Neither record is reordered.
  const ids = [...right.blocks].sort((a, b) => a.position - b.position).map(block => block.blockId);
  ids.push(...[...left.blocks].sort((a, b) => a.position - b.position).filter(block => !rightById.has(block.blockId)).map(block => block.blockId));
  const rows: EvidenceComparisonRow[] = ids.map(blockId => {
    const beforeSide = leftById.get(blockId), afterSide = rightById.get(blockId);
    if (!beforeSide) return { blockId, after: afterSide, kind: 'added', changes: [] };
    if (!afterSide) return { blockId, before: beforeSide, kind: 'removed', changes: [] };
    const a = beforeSide.block, b = afterSide.block;
    const changes: EvidenceChangeKey[] = [];
    if (a.expression !== b.expression) changes.push('expression');
    if (a.evaluationMode !== b.evaluationMode) changes.push('mode');
    if (inputMap(a, 'sourceBlockId') !== inputMap(b, 'sourceBlockId')) changes.push('sources');
    // These canonical round-trip encodings deliberately distinguish 0 and -0.
    if (inputMap(a, 'value') !== inputMap(b, 'value')) changes.push('values');
    if (a.resultText !== b.resultText) changes.push('displayResult');
    if (a.result !== b.result) changes.push('internalResult');
    if (a.position !== b.position) changes.push('bodyOrder');
    if (beforeSide.executionOrder !== afterSide.executionOrder) changes.push('executionOrder');
    return { blockId, before: beforeSide, after: afterSide, kind: changes.length ? 'changed' : 'unchanged', changes };
  });
  const counts = { added: 0, removed: 0, changed: 0, unchanged: 0 };
  rows.forEach(row => counts[row.kind]++);
  const warnings = ['記録にない原因・説明、当時のメモタイトル・文章・表示専用数式は確認不能です。現在のメモから補完していません。'];
  if (hasUnknownFields(left) || hasUnknownFields(right)) warnings.push('未知の付随フィールドは解釈・比較していません。「変更なし」は比較対象の既知項目だけを指します。');
  return freeze({ before: left, after: right, rows, counts, warnings });
}

export function evidenceInputLabel(input: EvidenceInput, block: EvidenceBlock): string {
  if (input.kind === 'variable') return `旧変数 ${input.name}`;
  const slot = block.references?.entries.find(entry => input.name === `ReferenceValue${entry.slot}`)?.slot;
  return slot === undefined ? `ID参照 ${input.name}（表示用参照番号は確認不能）` : `ID参照 @{${slot}}`;
}
export const evidenceModeLabel = (block: EvidenceBlock) => block.evaluationMode ?? 'legacy（旧方式）';
export const evidenceRowLabel = (row: EvidenceComparisonRow) => row.kind === 'added' ? '比較対象の記録間で追加'
  : row.kind === 'removed' ? '比較対象の記録間で削除'
    : row.kind === 'unchanged' ? '比較対象項目に変更なし' : row.changes.map(key => EVIDENCE_CHANGE_LABELS[key]).join('・') + 'が変更';

/** A shared presentation model keeps the UI and output tied to the same records. */
export function buildEvidenceComparisonMarkdown(identity: { id: string; title: string }, comparison: EvidenceComparison): MarkdownReport {
  if (typeof identity.id !== 'string' || typeof identity.title !== 'string') throw new Error('対象メモの識別情報を確認できません。');
  if (identity.id.length + identity.title.length > REPORT_CHARACTER_LIMIT) throw new Error('対象メモの識別情報が出力上限を超えています。省略せず出力を停止しました。');
  const lines = reportLines([`# ${literal(identity.title.trim() || '計算メモ')} の保存計算記録比較`, '',
    '## 対象と保証範囲', '', `- 対象メモID: ${literal(identity.id)}`, '',
    'メモ名は取得時点の識別情報であり、当時のタイトルを保証しません。保存済みの2記録だけを比較しています。現在の未保存編集・試算・未保存の記録候補は含みません。再計算・保存は行っていません。', '',
    '追加／削除は比較対象の計算記録間だけの意味です。メモ本文全体の編集履歴ではありません。差分は因果関係の証明ではなく、再現検証や数学的証明、暗号学的な真正性保証でもありません。', '',
    '## 比較する記録', '']);
  for (const [name, record] of [['変更前', comparison.before], ['変更後', comparison.after]] as const) {
    lines.push(`### ${name}`, '', `- 記録ID: ${literal(record.id)}`, `- 計算日時: ${literal(record.calculatedAt)}`,
      `- 保存要求時刻: ${literal(record.persistedAt)}`, `- 記録内の計算ブロック数: ${record.blocks.length}`,
      `- 記録状態: 確定記録（${literal(record.status)}）`, '');
  }
  lines.push('日時は端末時計による保存文字列です。保存要求時刻は保存完了時刻ではありません。前後は選択した方向であり、日時の大小から並べ替えていません。', '',
    '## 変更概要', '', `- 変更: ${comparison.counts.changed} / 追加: ${comparison.counts.added} / 削除: ${comparison.counts.removed} / 比較対象項目に変更なし: ${comparison.counts.unchanged}`, '');
  for (const row of comparison.rows) lines.push(`- ${literal(row.blockId)}: ${evidenceRowLabel(row)}`);
  lines.push('', '## ブロックごとの比較', '');
  for (const row of comparison.rows) {
    lines.push(`### ブロック ${literal(row.blockId)}`, '', evidenceRowLabel(row), '');
    for (const [name, side] of [['変更前', row.before], ['変更後', row.after]] as const) {
      lines.push(`#### ${name}`, '');
      if (!side) { lines.push('この側の計算記録には存在しません。値は確認不能です。', ''); continue; }
      const { block, executionOrder } = side;
      lines.push(`- 当時の本文順: ${block.position}`, `- 記録内の実行順: ${executionOrder}`, `- 計算モード: ${literal(evidenceModeLabel(block))}`, '- 結果状態: 成功（この記録内）', '',
        '入力式:', '', reportCode(block.expression), '', '表示結果（丸め・整形済み）:', '', reportCode(block.resultText), '',
        '内部結果（丸め前、-0を区別）:', '', reportCode(block.result), '', '実際に使用した参照元と内部値:', '');
      if (!block.inputs.length) lines.push('実使用のID参照・旧変数なし（記録された読取り）。', '');
      for (const input of block.inputs) lines.push(`- ${literal(evidenceInputLabel(input, block))}`, '',
        '参照元ブロックID:', '', reportCode(input.sourceBlockId), '', '実使用内部値:', '', reportCode(input.value), '');
    }
  }
  lines.push('## 比較不能・確認不能と注意事項', '', ...comparison.warnings.map(warning => `- ${warning}`), '',
    '- 実使用の参照名・種類と参照元IDを照合し、使用値は保存された内部数値で比較します。未使用候補や入力読取り順だけの差は比較対象に含めません。',
    '- 未対応・不正な形式は比較を中止します。原本JSONを変更せず保護してください。', '',
    '## 解説の追記欄', '', '未記入: 変更の意図・条件・根拠・参考資料などを利用者が追記してください。記録にない理由や説明は自動生成していません。', '');
  return { markdown: lines.join('\n'), filename: reportFilename(`${identity.title || 'calculation-memo'}-記録比較`), warnings: [...comparison.warnings] };
}
