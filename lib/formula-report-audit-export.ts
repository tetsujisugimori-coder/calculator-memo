import { assessReportAudit, type AuditInventory, type AuditItem } from './formula-report-audit';
import { reportCode, reportFilename, reportLines, type MarkdownReport } from './markdown-report';

export const bodyLabels = { intact: '本文対応あり', edited: '本文編集・対応未保証', invalid: '未知・不正／対応不明', untracked: '追跡情報不足' };
export const sourceLabels = { unverified: '未照合', matched: '保存記録と一致', changed: '保存記録の変更', missing: '記録・ブロック欠落', invalid: '未知・不正', unavailable: '取得失敗' };
const sideLabels = { quote: '引用元', before: '比較元', after: '比較先' };

export type AuditMarkdownInput = {
  formulaId: string; formulaTitle?: string; reportId?: string; reportTitle?: string;
  editing: boolean; unsavedChanges?: boolean; savedContextChanged?: boolean; body: string; inventory: AuditInventory; items: AuditItem[];
  state: 'unverified' | 'checked' | 'stale'; fetchedAt?: string; acquisitionError?: string; exportedAt: string;
};

function utc(value: string): string {
  // A timezone-free time must not be interpreted in the exporting device's zone.
  if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(value) || !Number.isFinite(Date.parse(value))) {
    throw new Error('日時の意味とタイムゾーンを確認できないため点検結果の出力を停止しました。');
  }
  return new Date(value).toISOString();
}

/** Format the shared audit result, never parse markers, read storage or evaluate.
 * The caller captures body, inventory, assessment and acquisition in one generation.
 * Unverified output cannot turn an earlier acquired success into a current result. */
export function buildAuditMarkdown(input: AuditMarkdownInput): MarkdownReport {
  const { inventory } = input;
  if (input.items.length !== inventory.items.length || input.items.some((item, index) => {
    const original = inventory.items[index];
    return item.key !== original.key || item.order !== original.order || item.kind !== original.kind || item.start !== original.start || item.end !== original.end;
  })) throw new Error('根拠一覧の全件と出力対象が一致しないため出力を停止しました。絞り込み前の同じ世代の結果を使用してください。');
  if (inventory.items.some(item => !Number.isSafeInteger(item.start) || !Number.isSafeInteger(item.end) || item.start < 0 || item.end < item.start || item.end > input.body.length)) {
    throw new Error('本文と点検位置の整合性を確認できないため出力を停止しました。');
  }
  // Reuse the existing assessor for the fail-closed downgrade. No source record
  // or old acquisition reason/time is copied into unverified/stale output.
  const items = input.state === 'checked' ? input.items : assessReportAudit(inventory);
  const reviewCount = items.filter(item => item.needsReview).length;
  const lines = reportLines(['# レポート全体の根拠点検結果', '',
    '指定本文と取得した保存原本に基づく点検時点の記録です。出典との一致、利用者による明示確認、数学的な正しさは別の概念です。出力だけでは点検完了・確認済み・証明済みになりません。', '',
    '## 対象と時点', '']);
  const field = (label: string, value: string) => lines.push(`${label}：`, '', reportCode(value), '');
  field('登録式 ID', input.formulaId);
  field('登録式タイトル', input.formulaTitle ?? '未提供（推測しません）');
  field('レポート ID', input.reportId ?? '未提供（推測しません）');
  field('レポートタイトル', input.reportTitle ?? '未提供（推測しません）');
  lines.push(`対象本文：${input.savedContextChanged ? '開いた時点から保持している本文（現在の保存内容との一致は確認不能）' : input.editing ? '現在の編集中本文（本文に未保存変更あり）' : '現在表示中の保存済み本文（本文に未保存変更なし）'}。`, '',
    `本文の未保存変更（現在の編集基準本文との比較）：${input.editing ? 'あり' : 'なし'}。`, '',
    `レポートの未保存変更（タイトル・関連付けを含む）：${(input.unsavedChanges ?? input.editing) ? 'あり' : 'なし'}。`, '',
    `出力日時（UTC、ISO 8601）：${utc(input.exportedAt)}`, '',
    '出力日時は保存原本の取得日時・計算日時・保存日時・利用者確認日時ではありません。', '');
  if (input.savedContextChanged) lines.push('登録式または保存済みレポートの変更・削除を検知しています。出力対象は画面に保持した本文であり、現在の保存済み本文とは断定しません。保存原本との照合結果とは別の制約です。', '');
  if (input.state === 'checked') {
    lines.push('点検状態：照合済み（明示取得した世代を使用。取得失敗・未知／不正を含む結果であり、全件一致や点検完了を意味しません）。', '');
    lines.push(input.fetchedAt
      ? `${input.acquisitionError ? '原本取得試行日時' : '原本の観測取得日時'}（UTC、ISO 8601）：${utc(input.fetchedAt)}`
      : '原本の観測取得日時：未記録。出力日時で代用せず、取得時刻を推測しません。', '');
    lines.push('この日時は保存日時・計算日時・利用者確認日時ではありません。取得失敗時は有効な保存原本を取得できた日時ではありません。', '');
    if (input.acquisitionError) field('取得の制約', input.acquisitionError);
  } else {
    lines.push(input.state === 'stale'
      ? '点検状態：結果失効・未照合。更新を検知したため旧照合結果と旧取得日時は現在有効な結果として掲載していません。'
      : '点検状態：未照合。現在の本文に対する有効な明示照合結果はありません。', '',
    '原本の観測取得日時：有効な取得情報なし。必要な場合は画面で「保存記録と照合」を明示的に実行してください。', '');
  }
  lines.push('## 集計と範囲', '', `認識できた出現数：${items.length}件。見直し対象：${reviewCount}件。`, '',
    '出力対象は絞り込みや選択中の詳細に依存しない、レポート全体の認識できた全出現です。分母は本文上の出現数であり、レポート中のすべての根拠を網羅した数ではありません。差分内部のsnapshotを二重計上しません。複数の問題がある項目も見直し対象は1件として数えます。未照合も見直し対象です。', '',
    `集計の完全性：${inventory.complete ? '既存解析で認識可能な範囲を列挙（すべての根拠の網羅保証ではありません）' : '不完全。列挙できない範囲・件数があります' }。`, '');
  field('解析の範囲と制約', inventory.reason);
  if (!items.length) lines.push('列挙できる項目は0件です。根拠が存在しない、全件一致、点検完了を意味しません。', '');
  lines.push('## 本文順・出現単位の一覧', '', '位置は対象本文の0始まり UTF-16 コード単位、開始を含み終了を含まない範囲です。本文編集後にその位置が有効であることは保証しません。', '');
  for (const item of items) {
    lines.push(`### ${item.order}. ${item.kind === 'quote' ? '固定引用' : '比較差分'}`, '',
      `本文位置：開始 ${item.start}、終了 ${item.end}。`, '',
      `本文状態：${bodyLabels[item.bodyStatus]}。`, '',
      `見直し対象：${item.needsReview ? 'はい（行単位で1件）' : 'いいえ（確認済み・数学的に正しいという意味ではありません）'}。`, '');
    field('本文状態の理由', item.reason);
    const quote = item.quote?.snapshot ?? item.difference?.snapshot?.quote;
    if (quote) {
      field('検証できた引用 ID', quote.quoteId);
      field('検証できた出典メモ ID', quote.memoId);
      field('検証できた対象ブロック ID', quote.blockId);
      if (item.difference?.snapshot) field('検証できた比較差分 ID', item.difference.snapshot.differenceId);
    } else lines.push('識別情報：追跡情報不足または未知・不正のため検証できません。本文から ID を推測しません。', '');
    if (!item.sources.length) lines.push('出典：追跡情報不足または未知・不正のため照合できません。', '');
    for (const source of item.sources) {
      const side = sideLabels[source.side];
      const record = source.side === 'after' ? item.difference?.snapshot?.after : quote?.record;
      lines.push(`#### ${side}`, '');
      if (record) field(`${side}の検証できた出典記録 ID`, record.id);
      lines.push(`出典照合状態：${sourceLabels[source.status]}。`, '');
      field(`${side}の照合理由`, source.reason);
      lines.push(`関連付け：${source.linked === true ? '取得した保存済み根拠リンクあり' : source.linked === false ? '関連付け解除・保存済み根拠リンクなし（記録欠落とは別）。自動追加しません' : '未判定（未照合・取得失敗など）。関連解除とは断定しません'}。`, '');
    }
    lines.push(item.canNavigate ? '本文移動：この点検世代で対応位置を認識できました。出力先からアプリ内移動できる保証ではありません。' : '本文移動：対応位置を安全に確定できないため移動不能です。', '');
  }
  lines.push('## 保存保護と保証しないこと', '',
    'この出力は独立した点検記録です。レポート本文への挿入、計算メモレポートとの結合、保存、再計算、利用者確認、確認履歴追加は行いません。', '',
    '本文全文、固定snapshot全文、保存原本全文は含みません。この出力だけから元のレポート本文・計算記録・snapshotを復元できません。追跡情報にない内容、解析不能領域、マーカーが消された文章の由来、変更理由や真正性は推測しません。', '',
    '原本の常時最新性・任意の外部書込みとの原子的整合性は保証しません。出力後の変更はこのファイルへ自動反映しません。ファイル名のみ既存の安全化・長さ制限を適用し、上記のタイトル・IDは省略していません。', '');
  return { markdown: lines.join('\n'), filename: reportFilename(`${input.reportTitle ?? '関連レポート'}-根拠点検`), warnings: inventory.complete ? [] : [inventory.reason] };
}
