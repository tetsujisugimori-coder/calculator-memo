"use client";

import { useState } from "react";
import { useFormulaSavedSnapshot, type FormulaSavedSnapshot } from "./useFormulaSavedSnapshot";
import { formulaDefinitionSnapshot, formulaReportAssessment, type FormulaReportAssessment } from "../lib/formula-report-evidence";
import { downloadMarkdownReport, reportFilename } from "../lib/markdown-report";
import { MarkdownContent } from "./MarkdownContent";
import { FormulaReportTimeline } from "./FormulaReportTimeline";

function label(status: FormulaReportAssessment["status"]) {
  return status === "confirmed" ? "確認済み・式一致" : status === "changed" ? "要再確認・式変更あり" : status === "unconfirmed" ? "未確認" : status === "orphan" ? "登録式が見つからない" : "根拠不足または判定不能";
}

/** Read-only saved snapshot. No draft props, evaluator, or storage writer enters this view. */
export function FormulaDetailView(props: { formulaId: string; pendingSave?: boolean; source?: FormulaSavedSnapshot }) {
  return props.source ? <SavedFormulaDetail {...props} source={props.source} /> : <StandaloneFormulaDetail {...props} />;
}
function StandaloneFormulaDetail(props: { formulaId: string; pendingSave?: boolean }) {
  const source = useFormulaSavedSnapshot();
  return <SavedFormulaDetail {...props} source={source} />;
}
function SavedFormulaDetail({ formulaId, pendingSave = false, source }: { formulaId: string; pendingSave?: boolean; source: FormulaSavedSnapshot }) {
  const [notice, setNotice] = useState("");
  const { loaded, fetchedAt, stale } = source;
  const refresh = () => { source.refresh(); setNotice(""); };
  const data = loaded.status === "ok" ? loaded.data : undefined;
  const formula = data?.formulaLibrary?.entries.find(item => item.id === formulaId);
  const report = data?.formulaReports?.entries.find(item => item.formulaId === formulaId);
  const assessment = report ? formulaReportAssessment(report, formula, data?.notes) : undefined;
  let variables = "判定不能";
  try { if (formula) variables = formulaDefinitionSnapshot(formula).variables.join("、") || "なし"; } catch { /* Never evaluate or repair an unreadable definition. */ }
  const exportBody = async (download: boolean) => {
    if (!report) return;
    try {
      if (download) downloadMarkdownReport({ markdown: report.body, filename: reportFilename(report.title), warnings: [] });
      else await navigator.clipboard.writeText(report.body);
      setNotice(download ? "ダウンロードを要求しました。保存完了はブラウザで確認してください。" : "保存済みレポート本文をコピーしました。");
    } catch { setNotice("出力できませんでした。保存済み原本は変更していません。"); }
  };
  return <section className="formula-report formula-detail-view" aria-label="保存済み登録式の詳細">
    <h4>登録式詳細（保存済み原本の閲覧）</h4>
    <p>取得日時：{fetchedAt}</p>
    <button type="button" onClick={refresh}>保存済み詳細を再取得</button>
    {pendingSave && <p role="status">未保存の編集があります。以下は保存済み原本だけを表示し、編集中の内容を混ぜません。</p>}
    {stale && <p role="alert">保存原本の更新を検知しました。以下は取得時点の内容です。現在の対応状態は根拠未照合です。再取得してください。</p>}
    {loaded.status === "error" ? <p role="alert">判定不能：保存済み原本を安全に取得できません。{loaded.message} 原本は変更していません。設定の原本JSON保全・復旧手順を利用してください。</p> : !formula ? <p>保存済み登録式が見つかりません。未保存の編集で補完しません。</p> : <>
      <h3 className="identity-item identity-registered"><span className="identity-label">登録式</span><span>{formula.title}</span></h3><p>登録式ID：{formula.id}</p>
      <div className="library-expression"><strong>計算式（保存済み）</strong><pre>{formula.expression}</pre></div>
      <div className="library-variables"><strong>変数定義（保存済みの式から構文抽出）</strong><p>{variables}</p><p>変数ごとの説明は現在の保存形式にはありません。値は実行時に指定します。</p></div>
      <p>計算結果：未計算</p><p>閲覧では保存・確認・再計算を行いません。</p>
      {!report ? <p>関連レポートは未登録です。確認履歴もありません。</p> : <>
        <h4>関連レポート：{report.title}</h4><p>レポートID：{report.id}</p>
        <p data-testid="formula-detail-assessment" role="status">{stale ? "根拠未照合（原本更新後）" : label(assessment!.status)}</p>
        {!stale && <p>{assessment!.reason}</p>}
        <details><summary>確認状態の意味と限界</summary><p>確認済みは利用者の明示確認と保存の履歴です。数学的正しさ・同値性や出典の信頼性を保証しません。式文字列と構文から抽出した変数定義を比較します。閲覧・プレビュー・計算成功では確認済みになりません。根拠未照合は未取得であり、不一致の断定ではありません。</p></details>
        <section className="formula-report-preview" aria-label="保存済み関連レポート"><MarkdownContent content={report.body} /></section>
        <div className="modal-actions"><button type="button" onClick={() => void exportBody(false)}>保存済みレポート本文をコピー</button><button type="button" onClick={() => void exportBody(true)}>保存済みレポート.mdをダウンロード</button></div>
        {notice && <p role="status">{notice}</p>}
        <p>作成日時：{report.createdAt}　更新日時：{report.updatedAt}</p>
        <FormulaReportTimeline report={report} formula={formula} notes={data!.notes} stale={stale} fetchedAt={fetchedAt} />
      </>}
    </>}
  </section>;
}
