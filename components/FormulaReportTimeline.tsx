"use client";

import { formulaReportTimeline } from "../lib/formula-report-timeline";
import type { FormulaReport, Memo, RegisteredFormula } from "../lib/types";
import { ConfirmationRemarks } from "./ConfirmationRemarks";
import { HistoricalReportEvidence } from "./FormulaReportEvidence";

/** Only the parent's validated saved snapshot is accepted; no drafts or writer are used. */
export function FormulaReportTimeline({ report, formula, notes, stale, fetchedAt }: { report: FormulaReport; formula: RegisteredFormula; notes: Memo[]; stale: boolean; fetchedAt: string }) {
  let timeline: ReturnType<typeof formulaReportTimeline>;
  try { timeline = formulaReportTimeline(report, formula, notes); }
  catch { return <p role="alert">判定不能：確認履歴の形式を安全に表示できません。原本は変更していません。</p>; }
  return <details className="formula-timeline" aria-label="根拠・確認履歴タイムライン">
    <summary>確認履歴（{timeline.entries.length}件）・タイムライン</summary>
    <p>比較対象の原本取得日時：{fetchedAt}。未保存編集・未反映試算は含みません。</p>
    <p>確認日時は変更日時ではありません。変更日時・変更理由・確認間の変更経過は記録なしのため復元できません。現在との相違は変更イベントではありません。</p>
    <p>{timeline.chronological ? "記録された確認日時の古い順です。同一日時は保存配列順で表示しますが、その時間内の実際の先後は確定できません。端末時計の正確性は保証しません。" : "時差情報のない日時を含むため、時系列順は確定できません。保存配列順で表示し、日時や時差を補いません。"}最後の確認記録は保存配列の末尾であり、日時の最大値とは限りません。</p>
    {stale && <p role="alert">根拠未照合：更新検知前に取得した履歴です。現在の原本との一致・相違は再取得まで判定しません。</p>}
    {!timeline.entries.length && <p>日時・変数・根拠を含む確認履歴はありません。旧形式の確認式だけでは現在の対応を確定できません。</p>}
    <ol className="formula-confirmation-timeline">
      {timeline.entries.map(({ confirmation, savedPosition, lastSaved, definitionMatches, reportMatches, linksMatch, assessment }) => <li key={confirmation.id} data-confirmation-id={confirmation.id}>
        <details><summary>確認日時：<time>{confirmation.confirmedAt}</time>（{lastSaved ? "最後の確認記録" : "過去の確認記録"}）</summary>
          <p>当時の記録：利用者の明示確認の保存記録あり。当時の判定結果そのものは記録なし。数学的正しさや原本の真正性を保証しません。履歴は現在の確認への自動承認ではありません。</p>
          <p>確認ID：{confirmation.id}　登録式ID：{confirmation.formulaId}</p><p>関連レポートID：{report.id}　保存配列位置：{savedPosition}</p>
          <p>式・レポートの版番号は記録なし。確認IDと以下の保存済み内容で対象を識別します。</p>
          <ConfirmationRemarks remarks={confirmation.remarks} />
          <section aria-label="取得原本との相違">
            <p>現在の内容との対応：{stale ? "根拠未照合" : assessment.status === "confirmed" ? "取得原本と一致（この履歴を現在の確認へ昇格しません）" : assessment.status === "changed" ? "要再確認・式変更あり" : assessment.status === "unconfirmed" ? "未確認（レポートまたは参照が相違）" : "根拠不足または判定不能"}</p>
            {!stale && <><p>{assessment.reason}</p><ul><li>式定義：{definitionMatches === null ? "判定不能" : definitionMatches ? "一致" : "相違あり"}</li><li>レポート本文・タイトル：{reportMatches ? "一致" : "相違あり"}</li><li>根拠参照：{linksMatch ? "一致" : "相違あり"}</li></ul><p>相違は取得原本との文字列・変数・ID参照の比較です。変更の時点・理由や数学的同値性は判定しません。</p></>}
          </section>
          <p>定義比較形式：v{confirmation.definition.version}</p><pre>{confirmation.definition.expression}</pre><p>確認時の変数：{confirmation.definition.variables.join("、") || "なし"}</p>
          <p>確認したタイトル：{confirmation.title}</p><details><summary>確認した本文（生Markdown）</summary><pre>{confirmation.body}</pre></details>
          {confirmation.links.length ? <><p>確認時の根拠ID：</p><ul>{confirmation.links.map(link => <li key={JSON.stringify([link.memoId, link.recordId])}>メモID：{link.memoId}　記録ID：{link.recordId}</li>)}</ul>{stale ? <p>根拠未照合：計算記録の詳細は再取得後に確認してください。</p> : <HistoricalReportEvidence confirmation={confirmation} notes={notes} />}</> : <p>根拠計算記録の関連付けはありません。</p>}
        </details>
      </li>)}
    </ol>
  </details>;
}
