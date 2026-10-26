import type { AuditRecordMetadata } from './formula-report-audit-record';
import { validateAuditComparisonSnapshot, type AuditComparisonItem, type AuditComparisonState, type AuditRecordComparison } from './formula-report-audit-comparison';
import { EVIDENCE_CHANGE_LABELS, type EvidenceComparison } from './evidence-comparison';
import type { EvidenceRecord } from './calculation-evidence';
import { bodyLabels, sourceLabels } from './formula-report-audit-export';
import { reportCode, reportLines, type MarkdownReport } from './markdown-report';

export const auditComparisonStateLabels: Record<AuditComparisonState, string> = { matched: '一致（比較可能な項目）', changed: '変更あり', added: '追加', removed: '削除', missing: '根拠欠落', unavailable: '取得不能', incomparable: '比較不能', unknown: '記録形式不明' };
export const formatAuditComparisonStates = (values: AuditComparisonState[]) => values.map(value => auditComparisonStateLabels[value]).join('／');
export type AuditComparisonMarkdownInput = { before: AuditRecordMetadata; after: AuditRecordMetadata; result: AuditRecordComparison; exportedAt: string; savedContextChanged?: boolean };
const sideLabels = { quote: '引用元', before: '比較差分の比較元', after: '比較差分の比較先' };
const dateWithZone = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/;

/** Presentation of one captured result only: no scanner, comparator, clock,
 * evaluator or persistence. Caller owns selection/generation invalidation. */
export function buildAuditComparisonMarkdown(input: AuditComparisonMarkdownInput): MarkdownReport {
  if (!dateWithZone.test(input.exportedAt) || !Number.isFinite(Date.parse(input.exportedAt))) throw new Error('出力日時とタイムゾーンを確認できません。');
  const exportedAt = new Date(input.exportedAt).toISOString();
  const { before, after, result } = input;
  const lines = reportLines(['# 固定点検記録の2時点比較結果', '', '選択した過去の固定点検記録 A → B の比較資料です。現在の保存原本の照合とは別です。出力のための再比較・再取得・再計算は行っていません。', '', '## 対象と比較条件', '']);
  // Every arbitrary string is verbatim in a dynamically sized inert text fence.
  // Never normalize newlines/Unicode or interpolate untrusted text into headings.
  const field = (label: string, value: string | undefined) => lines.push(`${label}：`, '', reportCode(value === undefined ? '情報未記録（推測補完しません）' : value), '');
  field('比較方向', '比較元 A → 比較先 B（選択順。日時順ではありません）');
  field('出力日時（UTC、ISO 8601）', exportedAt);
  lines.push('出力日時・記録生成日時・原本取得／試行日時・計算日時・保存要求日時・利用者確認日時は別です。互いに代用しません。', '');
  if (input.savedContextChanged) lines.push('現在画面に保持した本文と現在の保存本文との一致は未確認です。保存通知だけでは対象レポートの変更・削除を断定しません。過去記録の照合成功でもこの制約は解除されません。', '');
  for (const [name, metadata] of [['比較元 A', before], ['比較先 B', after]] as const) {
    lines.push(`### ${name}`, '');
    field('固定点検記録 ID', metadata.recordId); field('登録式 ID', metadata.formulaId); field('数学レポート ID', metadata.reportId);
    field('記録生成日時（記録内のタイムゾーン表記を保持）', metadata.generatedAt || undefined);
    field('点検対象本文 SHA-256（真正性の証明ではありません）', metadata.bodySha256);
    field('点検対象本文長（UTF-16コード単位）', String(metadata.bodyLength));
    const snapshot = metadata.comparison;
    if (!snapshot) { lines.push('旧 v1 記録等：構造化比較資料不足。文章・現在値から補完しません。', ''); continue; }
    if (!validateAuditComparisonSnapshot(snapshot)) { lines.push('記録形式不明・不正：構造化資料を推測修復・解釈しません。総合判定は既存比較結果を参照してください。', ''); continue; }
    field('当時の照合状態', snapshot.state === 'checked' ? '照合操作実行（取得成否は別）' : snapshot.state === 'stale' ? '当時の照合結果失効' : '当時は未照合');
    field('原本取得・形式検証状態', snapshot.acquisitionStatus === 'ok' ? '成功（根拠一致とは別）' : snapshot.acquisitionStatus === 'unavailable' ? '取得不能' : snapshot.acquisitionStatus === 'invalid' ? '未知・不正な保存形式' : '成否未記録（成功と推測しません）');
    field(snapshot.acquisitionStatus === 'ok' ? '原本取得日時（UTC）' : '原本取得試行日時（UTC）', snapshot.fetchedAt);
    field('集計の完全性', snapshot.complete ? '認識可能な範囲で完全（全根拠の網羅保証ではありません）' : '不完全（未列挙件数は不明）'); field('集計の理由', snapshot.reason);
    const context = snapshot.bodyContext;
    if (!context) lines.push('当時の保持本文・未保存編集・保存本文との一致確認状態は未記録です。', '');
    else {
      field('当時の本文状態', context.editing ? '編集中の本文' : '画面に保持した本文');
      field('当時のレポート未保存変更（本文以外も含む）', context.unsavedChanges ? 'あり' : 'なし');
      field('当時の保持本文と保存本文の一致確認制約', context.savedContextChanged ? '一致未確認。出典照合とは別の制約。' : '一致未確認の記録なし。外部保存との原子的な一致保証ではありません。');
    }
  }
  lines.push('## 総合比較結果', '');
  field('総合状態（既存比較結果）', formatAuditComparisonStates(result.states));
  for (const change of result.changes) field('記録間の変化', change);
  for (const limitation of result.limitations) field('制約理由', limitation);
  lines.push(`列挙された比較行数：${result.rows.length}。比較可能件数・全根拠件数と同義ではありません。`, '', '複数状態は併記します。不完全・比較不能な項目を一致へ含めません。変更理由は未記録のため理由不明です。', '');
  const evidence = (record: EvidenceRecord | undefined) => {
    if (!record) { lines.push('情報不足：この側の保存原本情報はありません。固定snapshotで代用しません。', ''); return; }
    field('計算記録 ID', record.id); field('計算日時（記録値）', record.calculatedAt); field('保存要求日時（保存完了ではない、記録値）', record.persistedAt);
    field('評価器', record.evaluator); field('計算記録状態', record.status);
    record.blocks.forEach((block, index) => {
      lines.push(`###### 計算ブロック ${index + 1}`, '');
      field('blockId', block.blockId); field('当時の本文順', String(block.position)); field('記録内の実行順', String(index + 1));
      field('式', block.expression); field('計算モード', block.evaluationMode ?? 'legacy（旧方式）');
      field('内部結果（記録文字列・丸め表示から推測しない）', block.result); field('表示結果', block.resultText); field('ブロック状態', block.status);
      if (!block.inputs.length) lines.push('記録された実使用入力：0件（未記録の値を推測しません）。', '');
      block.inputs.forEach((value, n) => { lines.push(`実使用入力 ${n + 1}`, ''); field('入力の種別', value.kind); field('入力名', value.name); field('実使用参照元 blockId', value.sourceBlockId); field('実際に使用した内部値', value.value); });
      if (!block.references) lines.push('参照先ID定義：未記録（参照なしとは推測しません）。', '');
      else { lines.push(`保存された参照先ID定義：${block.references.entries.length}件。実使用入力とは別です。`, ''); block.references.entries.forEach(value => { field('参照スロット', String(value.slot)); field('参照先 blockId', value.blockId); }); }
    });
  };
  const itemDetails = (name: string, item: AuditComparisonItem | undefined) => {
    lines.push(`#### ${name}`, '');
    if (!item) { lines.push('この側には列挙されていません。不完全な集計を追加・削除と断定しません。', ''); return; }
    field(item.kind === 'quote' ? 'quoteId' : 'differenceId', item.id); field('本文・追跡状態', bodyLabels[item.bodyStatus]); field('本文状態の理由', item.reason);
    if (item.kind === 'difference') { field('原引用 quoteId', item.originQuoteId); field('原引用対象 blockId', item.originBlockId); }
    if (!item.sources.length) lines.push('出典の構造化情報不足。', '');
    item.sources.forEach(source => {
      lines.push(`##### ${sideLabels[source.side]}`, ''); field('出典メモ ID', source.memoId); field('引用対象 blockId（差分は記録全体）', source.blockId);
      field('当時の出典照合状態', sourceLabels[source.status]); field('出典状態の理由', source.reason); field('当時の関連付け', source.linked === undefined ? '未確認' : source.linked ? 'あり' : 'なし');
      lines.push('引用・比較差分に固定した snapshot：', ''); evidence(source.frozen);
      lines.push('当時取得した保存原本（snapshotとは別）：', ''); evidence(source.observed);
    });
  };
  const calculationChanges = (name: string, comparison: EvidenceComparison | undefined) => {
    lines.push(`##### ${name}`, '');
    if (!comparison) { lines.push('この種類の計算根拠比較情報はありません。片側不足等の制約を参照し、一致とは扱いません。', ''); return; }
    lines.push(`変更 ${comparison.counts.changed}／追加 ${comparison.counts.added}／削除 ${comparison.counts.removed}／一致 ${comparison.counts.unchanged}（既存の計算ブロック比較結果）。`, '');
    comparison.warnings.forEach(value => field('比較の制約', value));
    comparison.rows.forEach(row => { field('比較ブロック ID', row.blockId); field('ブロック状態', row.kind === 'unchanged' ? '一致（比較対象の既知項目）' : row.kind === 'changed' ? '変更あり' : row.kind === 'added' ? '追加' : '削除'); row.changes.forEach(change => field('変更項目', EVIDENCE_CHANGE_LABELS[change])); });
  };
  lines.push('## 項目別比較と計算根拠', '');
  result.rows.forEach((row, index) => {
    lines.push(`### 比較行 ${index + 1}：${row.kind === 'quote' ? '固定引用' : '比較差分'}`, ''); field('安定識別子', row.id); field('項目状態', formatAuditComparisonStates(row.states)); row.changes.forEach(value => field('項目の変化・制約', value));
    itemDetails('比較元 A の固定情報', row.before); itemDetails('比較先 B の固定情報', row.after);
    row.sources.forEach(source => { lines.push(`#### ${sideLabels[source.side]}の A → B 比較`, ''); field('出典比較状態', formatAuditComparisonStates(source.states)); source.changes.forEach(value => field('出典の変化・制約', value)); calculationChanges('引用・差分snapshot同士', source.frozen); calculationChanges('各点検時に取得した保存原本同士', source.observed); });
  });
  lines.push('## 制限と保存保護', '', 'calculatedAt／persistedAt は参考日時として掲載します。日時だけの差は既存仕様どおり計算根拠の変更にしません。内部値と表示値は別であり、丸め表示から内部値を推測しません。', '', '一致は数学的正しさ・証明の成立・原本の真正性・変更理由の証明ではありません。比較方向は利用者の選択順で、日時の大小や表示順から因果関係を推測しません。', '', '旧 v1・未知・不正・未照合・失効・不完全・取得不能の不足情報は推測補完しません。この資料は認識された構造化資料だけの比較であり、人間向け本文の文意・未知の付随フィールドまで検証したものではありません。', '', '出力だけでは本文への挿入・保存・再計算・明示確認・確認履歴追加は行いません。過去記録・snapshot・保存原本は変更しません。出力後の変化を自動反映せず、外部保存との原子的な一致は保証しません。本文への移動位置はこの独立資料では保証しません。', '');
  return { markdown: lines.join('\n'), filename: `audit-comparison-${exportedAt.replace(/[-:.]/g, '')}.md`, warnings: [...result.limitations] };
}
