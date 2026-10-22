import type { EvidenceComparison } from './evidence-comparison';
import type { EvidenceImpact, ImpactEdge } from './evidence-impact';
import { literal, reportCode, reportLines, type MarkdownReport } from './markdown-report';

export const impactEdgeLabel = (edge: ImpactEdge) => `${edge.source} → ${edge.target}（${edge.kind === 'variable' ? '旧変数' : 'ID参照'} ${edge.inputName}）`;
/** Append analysis from exactly the same frozen comparison, without reevaluation. */
export function appendEvidenceImpactMarkdown(report: MarkdownReport, comparison: EvidenceComparison, impact: EvidenceImpact): MarkdownReport {
  const lines = reportLines([report.markdown, '', '## 保存記録の変更影響分析', '',
    '直接変更は保存された項目の観測差分です。実使用内部値の変化が、利用者の直接編集や最初の原因であるとは限りません。波及変更候補・結果差分を独立に表示します。依存経路は数値的な因果関係や数学的証明ではありません。', '',
    '経路は変更前／変更後それぞれの実使用入力だけから求めます。未使用候補、現在のメモ、未保存編集・試算は含めません。各起点からの代表経路であり、全経路の列挙ではありません。', '',
    `- 直接変更（観測差分）: ${impact.counts.direct}`, `- 波及変更候補: ${impact.counts.propagation}`, `- 結果差分: ${impact.counts.result}`, `- 順序差分: ${impact.counts.order}`, `- 判定不能事項があるブロック: ${impact.counts.unknown}`, '',
    '### 独立した分類一覧', '']);
  for (const [label, selected] of [
    ['直接変更（観測差分）', impact.rows.filter(row => row.directChanges.length)],
    ['結果差分', impact.rows.filter(row => row.resultChanges.length)],
    ['波及変更候補', impact.rows.filter(row => row.propagationCandidate)],
  ] as const) {
    lines.push(`#### ${label}`, '', ...(selected.length ? selected.map(row => `- ${literal(row.blockId)}`) : ['該当なし（分析できた範囲）。']), '');
  }
  lines.push('### 実使用依存関係の変更', '', '同じ入力の参照先変更は旧辺の削除と新辺の追加、および実使用参照元の差分として示します。使用値だけの変化は依存先変更ではありません。', '');
  for (const [label, edges] of [['追加', impact.edgeChanges.added], ['削除', impact.edgeChanges.removed]] as const) {
    lines.push(`#### ${label}`, '', ...(edges.length ? edges.map(edge => `- ${literal(impactEdgeLabel(edge))}`) : ['なし']), '');
  }
  lines.push('### ブロック別の判断根拠と経路', '');
  for (const row of impact.rows) {
    lines.push(`#### ${literal(row.blockId)}`, '');
    for (const [label, values] of [['直接変更（観測差分）', row.directChanges], ['結果差分', row.resultChanges], ['順序差分', row.orderChanges], ['判定不能', row.unknown]] as const) {
      lines.push(`- ${label}: ${values.length ? values.map(literal).join(' / ') : '該当なし（既知項目）'}`);
    }
    lines.push(`- 波及変更候補: ${row.propagationCandidate ? '該当' : '確認されず（分析できた範囲）'}`, '');
    for (const [label, paths] of [['変更前の経路', row.beforePaths], ['変更後の経路', row.afterPaths]] as const) {
      lines.push(`${label}:`, '');
      if (!paths.length) lines.push('代表経路なし（分析できた範囲）。', '');
      for (const path of paths) lines.push(`起点 ${literal(path.rootId)}:`, '', reportCode(path.blockIds.join(' → ')), '');
    }
    for (const [label, side] of [['変更前', impact.before], ['変更後', impact.after]] as const) {
      const edges = side.edges.filter(edge => edge.target === row.blockId);
      if (edges.length) {
        lines.push(`${label}の記録された実使用辺（経路の根拠）:`, '');
        for (const edge of edges) lines.push(`- ${literal(impactEdgeLabel(edge))} / 内部使用値 ${literal(edge.value)} / ${edge.valid ? '記録内整合チェック済み（真正性は未保証）' : `判定不能: ${edge.reasons.map(literal).join(' / ')}`}`, '');
      }
    }
  }
  lines.push('### 分析の制約', '', ...impact.warnings.map(warning => `- ${literal(warning)}`), '',
    `- 比較記録: ${literal(comparison.before.id)} → ${literal(comparison.after.id)}`,
    '- v1記録は成功した計算だけを保存します。未対応状態・不正な記録をエラー結果や結果なしの正常な履歴として補完しません。',
    '- 結果だけが異なる場合、直接編集された原因は確認不能です。複数の起点候補があっても単一原因と断定しません。', '',
    '### 影響についての解説追記欄', '', '未記入: 利用者が変更意図や確認した条件を追記してください。記録にない原因は自動生成していません。', '');
  return { ...report, markdown: lines.join('\n'), warnings: [...report.warnings, ...impact.warnings] };
}
