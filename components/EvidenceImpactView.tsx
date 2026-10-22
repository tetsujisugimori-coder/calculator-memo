"use client";
import { useState, type ReactNode } from 'react';
import type { EvidenceImpact } from '../lib/evidence-impact';
import { impactEdgeLabel } from '../lib/evidence-impact-markdown';

export function EvidenceImpactView({ impact, renderDetails }: { impact: EvidenceImpact; renderDetails: (id: string) => ReactNode }) {
  const [opened, setOpened] = useState(false);
  return <section aria-label="保存記録の変更影響分析"><details onToggle={event => setOpened(event.currentTarget.open)}>
    <summary>変更影響分析</summary>
    {opened && <>
      <p>直接変更（観測差分） {impact.counts.direct} / 波及変更候補 {impact.counts.propagation} / 結果差分 {impact.counts.result} / 順序差分 {impact.counts.order} / 判定不能 {impact.counts.unknown}</p>
      <p>直接変更は保存項目の差です。実使用値の変化を、利用者の直接編集や最初の原因とは断定しません。波及変更候補と結果差分は独立し、複数の起点を単一原因に決めつけません。</p>
      <p>変更前・変更後の実使用入力だけを別々に追跡します。各起点の代表経路で、全経路ではありません。依存経路は数値的な因果関係や数学的証明ではありません。未保存編集・試算・現在の依存図は使用しません。</p>
      {impact.warnings.map((warning, index) => <p key={index}>{warning}</p>)}
      <details><summary>実使用依存関係の追加・削除</summary><p>同じ入力の参照先変更は、旧辺の削除と新辺の追加として示します。使用値だけの差は辺の変更ではありません。</p>
        {(['added', 'removed'] as const).map(kind => <section key={kind}><h4>{kind === 'added' ? '追加' : '削除'}</h4>{impact.edgeChanges[kind].length ? <ul>{impact.edgeChanges[kind].map((edge, index) => <li key={index}>{impactEdgeLabel(edge)}</li>)}</ul> : <p>なし</p>}</section>)}
      </details>
      {impact.rows.map(row => <ImpactRow key={row.blockId} row={row} impact={impact} renderDetails={renderDetails} />)}
    </>}
  </details></section>;
}
function ImpactRow({ row, impact, renderDetails }: { row: EvidenceImpact['rows'][number]; impact: EvidenceImpact; renderDetails: (id: string) => ReactNode }) {
  const [open, setOpen] = useState(false);
  const labels = [row.directChanges.length ? '直接変更（観測差分）' : '', row.propagationCandidate ? '波及変更候補' : '', row.resultChanges.length ? '結果差分' : '', row.orderChanges.length ? '順序差分' : '', row.unknown.length ? '判定不能' : '', row.unchanged ? '変更なし（既知項目）' : ''].filter(Boolean);
  return <details className="evidence-diff-row" data-impact-block-id={row.blockId} onToggle={event => setOpen(event.currentTarget.open)}><summary><span>ブロックID：{row.blockId}</span><span>{labels.join(' / ')}</span></summary>
    {open && <>
      {([['直接変更（観測差分）', row.directChanges], ['結果差分', row.resultChanges], ['順序差分', row.orderChanges], ['判定不能', row.unknown]] as const).map(([name, values]) => <p key={name}>{name}：{values.length ? values.join(' / ') : '該当なし（既知項目）'}</p>)}
      {renderDetails(row.blockId)}
      {([['変更前の経路', row.beforePaths], ['変更後の経路', row.afterPaths]] as const).map(([name, paths]) => <section key={name}><h4>{name}</h4>{paths.length ? <ul>{paths.map(path => <li key={path.rootId}>起点 {path.rootId}：{path.blockIds.join(' → ')}</li>)}</ul> : <p>代表経路なし（分析できた範囲）</p>}</section>)}
      {([['変更前', impact.before], ['変更後', impact.after]] as const).map(([name, side]) => <section key={name}><h4>{name}の実使用辺と判断根拠</h4><ul>{side.edges.filter(edge => edge.target === row.blockId).map((edge, index) => <li key={index}>{impactEdgeLabel(edge)} / 内部使用値 {edge.value} / {edge.valid ? '記録内整合チェック済み（真正性は未保証）' : `判定不能：${edge.reasons.join(' / ')}`}</li>)}</ul></section>)}
    </>}
  </details>;
}
