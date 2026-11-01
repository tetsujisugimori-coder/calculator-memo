"use client";
import { useState } from 'react';
import type { RestorePlan } from '../lib/selective-restore-plan';

/** Bounded read-only presentation. No execution control or storage dependency. */
export function RestorePlanPanel({ plan, stale, onGenerate, disabled }: { plan: RestorePlan | null; stale: string; onGenerate: () => void; disabled: boolean }) {
  const [page, setPage] = useState(0);
  const counts = plan?.counts;
  const state = !plan ? '未生成（UNKNOWN）' : stale ? `STALE: ${stale}` : plan.status === 'PASS' ? '事前検証PASS' : plan.status;
  return <section className="restore-plan" aria-label="復元計画の確認">
    <h3>復元計画の確認（第2段階）</h3>
    <p>計画の作成は実行承認ではありません。ADD・REPLACEも実行可能を意味しません。今回は実際の復元・保存を行いません。</p>
    <button type="button" className="button-secondary" disabled={disabled} onClick={() => { setPage(0); onGenerate(); }}>復元計画を明示的に再生成</button>
    <p role="status" data-testid="restore-plan-state">{state}</p>
    {plan && !stale && <>
      <p>選択 {counts!.selected}件 / 追加予定 {counts!.add}件 / 上書き候補 {counts!.replace}件 / 変更不要 {counts!.unchanged}件</p>
      <p>実行禁止 {counts!.blocked}件 / 判定不能 {counts!.unknown}件 / 復元後の参照不足 {counts!.missingReferences === null ? 'UNKNOWN（検査未完了）' : `${counts!.missingReferences}件`}</p>
      <p>同じ項目に実行禁止と判定不能の両方の根拠がある場合、それぞれの件数に含みます。</p>
      <p>判定不能は選択した表示行ごとに一度数えます。親に含まれる子の診断は親行へ伝え、参照実体の件数は増やしません。親子を両方選んだ場合は別の行です。</p>
      <p>復元後の参照判定不能・曖昧: {counts!.unknownReferences === null ? 'UNKNOWN（検査未完了）' : `${counts!.unknownReferences}件`}</p>
      <p>構造検証: {plan.candidate.status} / {plan.candidate.message}</p>
      <p>原文保持: {plan.lexical.status} / {plan.lexical.message}</p>
      <p>現在原文の仮再直列化差異: {plan.lexical.currentRoundTripChanges === null ? 'UNKNOWN' : plan.lexical.currentRoundTripChanges ? 'あり（未選択領域にも影響し得ます）' : 'なし（一般の損失なし編集能力の証明ではありません）'}</p>
      <p>復元前: {plan.candidate.before ? JSON.stringify(plan.candidate.before) : 'UNKNOWN'} / 復元後: {plan.candidate.after ? JSON.stringify(plan.candidate.after) : 'UNKNOWN'}</p>
      <ul>{plan.reasons.map((reason, index) => <li key={index}>{reason}</li>)}</ul>
      <p>項目 {plan.items.length ? page * 20 + 1 : 0}〜{Math.min(plan.items.length, (page + 1) * 20)} / {plan.items.length}</p>
      {plan.items.slice(page * 20, (page + 1) * 20).map((item, index) => <article key={`${item.key}-${index}`}>
        <h4>{item.category ?? 'UNKNOWN'} / {item.id ?? 'IDなし'}: {item.operation}</h4>
        <p>予定操作: {item.proposedOperation ?? 'UNKNOWN'} / 親スコープ: {item.scope ?? 'なし'} / 衝突: {item.collision ? 'あり' : 'なし'}</p>
        <p>バックアップ識別: {item.backupIdentity ?? 'UNKNOWN'} / 現在識別: {item.currentIdentities.length ? item.currentIdentities.join(', ') : '対応なし／不明'}</p>
        <p>{item.difference}</p>{item.coveredBy && <p>親 {item.coveredBy} の操作に含む（独立操作なし）。</p>}
        <details><summary>復元前後の内容（解析済み表示）</summary><PlanValues before={item.before} after={item.after} /></details>
        <ul>{item.reasons.map((v, i) => <li key={i}>{v}</li>)}{item.blockedReasons.map((v, i) => <li key={`b${i}`}>実行禁止: {v}</li>)}{item.unknowns.map((v, i) => <li key={`u${i}`}>UNKNOWN: {v}</li>)}</ul>
        <details><summary>3時点の参照詳細 {item.references.length}件</summary><PlanReferences references={item.references} /></details>
      </article>)}
      <nav className="recovery-actions" aria-label="計画の項目ページ"><button type="button" disabled={page === 0} onClick={() => setPage(v => v - 1)}>前の計画項目</button><button type="button" disabled={(page + 1) * 20 >= plan.items.length} onClick={() => setPage(v => v + 1)}>次の計画項目</button></nav>
      <details><summary>未選択の残存項目を含む全参照 {plan.references.length}件（対応範囲内）</summary><PlanReferences references={plan.references} /></details>
      <p>参照FOUNDはIDと内容の対応範囲の点検です。数学的正しさ・意味の完全保証ではありません。通知なし変更・ABAは完全検知できず、第3段階では実行直前の再照合が必要です。</p>
    </>}
    {plan && stale && <p>以前の判定・件数・項目詳細は失効したため表示を取り消しました。現在データの再取得と計画の明示再生成が必要です。</p>}
  </section>;
}
function PlanValues({ before, after }: { before: unknown; after: unknown }) {
  const [page, setPage] = useState(0);
  const text = JSON.stringify({ before: before ?? '対応なし／UNKNOWN', after: after ?? 'UNKNOWN' }, (_key, value) => Object.is(value, -0) ? '数値 -0（表示用）' : value, 2);
  return <><p>原文とは別の整形表示です。数値字句・空白・キー順の保持を意味しません。</p><pre>{text.slice(page * 4000, (page + 1) * 4000)}</pre><nav className="recovery-actions" aria-label="計画差分詳細ページ"><button type="button" disabled={page === 0} onClick={() => setPage(v => v - 1)}>差分の前ページ</button><span>{page + 1}/{Math.max(1,Math.ceil(text.length/4000))}</span><button type="button" disabled={(page + 1) * 4000 >= text.length} onClick={() => setPage(v => v + 1)}>差分の次ページ</button></nav></>;
}
function PlanReferences({ references }: { references: RestorePlan['references'] }) {
  const [page, setPage] = useState(0);
  return <><ul>{references.slice(page * 20, (page + 1) * 20).map((v, i) => <li key={i}>{v.namespace}: {v.status} / {v.source} → {v.target} / {v.message}</li>)}</ul>{references.length > 20 && <nav className="recovery-actions" aria-label="計画参照ページ"><button type="button" disabled={page === 0} onClick={() => setPage(v => v - 1)}>前の計画参照</button><span>{page + 1}/{Math.ceil(references.length / 20)}</span><button type="button" disabled={(page + 1) * 20 >= references.length} onClick={() => setPage(v => v + 1)}>次の計画参照</button></nav>}</>;
}
