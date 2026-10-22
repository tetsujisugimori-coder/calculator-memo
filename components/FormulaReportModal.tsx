"use client";

import { useEffect, useRef, useState } from "react";
import type { FormulaReport, RegisteredFormula, FormulaReportEvidenceLink, Memo } from "../lib/types";
import { formulaReportSignature, FORMULA_REPORT_TEMPLATE, type FormulaReportSaveRequest } from "../lib/formula-reports";
import { downloadMarkdownReport, reportFilename } from "../lib/markdown-report";
import { MarkdownContent } from "./MarkdownContent";
import { loadData, STORAGE_KEY } from "../lib/storage";
import { formulaDefinitionSignature, formulaDefinitionSnapshot, formulaReportAssessment, reportEvidenceSignature, resolveReportEvidence } from "../lib/formula-report-evidence";
import { FormulaReportEvidence, HistoricalReportEvidence } from "./FormulaReportEvidence";
import { Modal } from "./Modal";

type Props = {
  formulaId: string; formula?: RegisteredFormula; report?: FormulaReport;
  writable: boolean; onClose: () => void;
  onSave: (request: FormulaReportSaveRequest) => Promise<FormulaReport | string>;
};

function acquireEvidence() {
  const loaded = loadData();
  return loaded.status === "error"
    ? { notes: [] as Memo[], raw: loaded.raw, error: "保存済み原本を安全に取得できません。根拠は参照不能です。現在の編集で補完しません。", fetchedAt: new Date().toISOString() }
    : { notes: structuredClone(loaded.data.notes), raw: loaded.status === "ok" ? loaded.raw : null, error: "", fetchedAt: new Date().toISOString() };
}

/** Expectations are frozen when opened; prop changes never silently rebase a draft. */
export function FormulaReportModal({ formulaId, formula, report, writable, onClose, onSave }: Props) {
  const [baseline, setBaseline] = useState(() => ({ report: report ? structuredClone(report) : undefined, expression: formula?.expression ?? null, definition: formulaDefinitionSignature(formula) }));
  const [id] = useState(() => report?.id ?? crypto.randomUUID());
  const [title, setTitle] = useState(report?.title ?? formula?.title ?? "関連レポート");
  const [body, setBody] = useState(report?.body ?? FORMULA_REPORT_TEMPLATE);
  const [links, setLinks] = useState<FormulaReportEvidenceLink[]>(() => structuredClone(report?.evidence?.links ?? []));
  const [evidence, setEvidence] = useState(acquireEvidence);
  const [generation, setGeneration] = useState(0);
  const [evidenceChanged, setEvidenceChanged] = useState(false);
  const [preview, setPreview] = useState(Boolean(report));
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [discard, setDiscard] = useState(false);
  const [notice, setNotice] = useState<{ text: string; failed: boolean } | null>(null);
  const dirty = !baseline.report || title !== baseline.report.title || body !== baseline.report.body || JSON.stringify(links) !== JSON.stringify(baseline.report?.evidence?.links ?? []);
  const conflict = formulaReportSignature(report) !== formulaReportSignature(baseline.report) || formulaDefinitionSignature(formula) !== baseline.definition;
  const invalid = !title.trim() || title.length > 120 || body.length > 100_000;
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty || savingRef.current) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useEffect(() => {
    const observe = (event: StorageEvent) => { if ((event.key === STORAGE_KEY || event.key === null) && event.newValue !== evidence.raw) setEvidenceChanged(true); };
    window.addEventListener("storage", observe);
    return () => window.removeEventListener("storage", observe);
  }, [evidence.raw]);
  const refreshEvidence = () => { setEvidence(acquireEvidence()); setGeneration(value => value + 1); setEvidenceChanged(false); };
  const unavailable = Boolean(evidence.error) || resolveReportEvidence(evidence.notes, links).some(item => item.status !== "available");
  const close = () => { if (savingRef.current) return; if (dirty) setDiscard(true); else onClose(); };
  const save = async (confirm: boolean) => {
    if (!writable || savingRef.current || conflict || invalid || evidenceChanged || (confirm && (!formula || unavailable))) return;
    savingRef.current = true; setSaving(true); setNotice(null);
    try {
      const result = await onSave({ id, formulaId, title, body, expectedReport: formulaReportSignature(baseline.report), expectedExpression: baseline.expression, expectedDefinition: baseline.definition, links, expectedEvidence: reportEvidenceSignature(evidence.notes, links), confirm });
      if (typeof result === "string") { setNotice({ text: result, failed: true }); return; }
      setBaseline({ report: structuredClone(result), expression: baseline.expression, definition: baseline.definition });
      setNotice({ text: confirm ? "内容の確認と保存が完了しました。" : "レポートを保存しました。", failed: false });
    } catch (cause) { setNotice({ text: cause instanceof Error ? cause.message : "保存に失敗しました。編集内容は保持しています。", failed: true }); }
    finally { savingRef.current = false; setSaving(false); }
  };
  const exportBody = async (download: boolean) => {
    try {
      if (body.length > 100_000) throw new Error("本文の上限100,000文字を超えています。出力を中止しました。");
      if (download) downloadMarkdownReport({ markdown: body, filename: reportFilename(title), warnings: [] });
      else await navigator.clipboard.writeText(body);
      setNotice({ text: download ? "ダウンロードを要求しました。保存完了はブラウザで確認してください。" : "レポート本文をコピーしました。", failed: false });
    } catch (cause) { setNotice({ text: cause instanceof Error ? cause.message : "出力できませんでした。本文は保持しています。", failed: true }); }
  };
  let currentVariables = "比較不能";
  try { if (formula) currentVariables = formulaDefinitionSnapshot(formula).variables.join("、") || "なし"; } catch { /* Invalid definitions are never evaluated or repaired. */ }
  const lastConfirmation = baseline.report?.evidence?.confirmations.at(-1);
  const recordsChanged = Boolean(lastConfirmation?.links.length && lastConfirmation.evidenceSignature !== reportEvidenceSignature(evidence.notes, lastConfirmation.links));
  const assessment = baseline.report ? formulaReportAssessment(baseline.report, formula, evidence.notes) : { status: "unconfirmed", reason: "" };
  const state = conflict ? "現在の保存内容との照合不能（編集中に変更されました）" : dirty && baseline.report ? "編集中の内容は未確認・未保存です" : !formula ? "登録式が見つからない" : evidence.error || evidenceChanged || unavailable ? "根拠不足または判定不能" : assessment.status === "confirmed" ? "確認済み・式一致（式との対応を確認済み）" : assessment.status === "changed" ? "確認済み・式変更あり。式が変更されています。レポートの内容を要確認" : assessment.status === "unknown" ? "根拠不足または判定不能" : "式との対応は未確認です";

  return <Modal title="登録式の関連レポート" onClose={close} closeDisabled={saving} wide>
    <div className="formula-report">
      <p>登録式の説明資料です。計算定義・数値的な計算根拠・数学的証明とは別に扱います。</p>
      <p role="status">{state}</p>{assessment.reason && <p>{assessment.reason}</p>}
      <details><summary>確認済みの意味と保証範囲</summary><p>利用者がこの式の説明として内容を確認したという意味です。式文字列の一致は数学的同値性や証明の正しさを保証しません。由緒・出典の信頼性も自動検証しません。開くだけ・計算成功だけでは確認済みになりません。変数は登録式の構文から抽出した定義で、実行時入力値とは別です。確認履歴は最大20件、履歴本文も含めレポート全体1,000,000バイトまで。上限では履歴を削除せず保存を停止します。</p></details>
      <p>登録式ID：{formulaId}</p><p>レポートID：{id}</p>
      {formula ? <div><strong>現在の登録式（変更できません）</strong><pre>{formula.expression}</pre><p>現在の変数定義：{currentVariables}</p></div> : <p>登録式が見つからないため、本文だけを保全しています。閲覧・編集・コピー・ファイル出力ができますが、式との対応は確認できません。</p>}
      {baseline.report?.confirmedExpression != null && <details><summary>互換用に保持した確認式（この項目単独では日時・変数情報なし）</summary><pre>{baseline.report.confirmedExpression}</pre></details>}
      {baseline.report?.evidence?.confirmations.length ? <details><summary>確認時の式・本文・根拠の履歴（{baseline.report.evidence.confirmations.length}件）</summary>{baseline.report.evidence.confirmations.map(confirmation => <details key={confirmation.id}><summary>確認日時：{confirmation.confirmedAt}</summary><p>確認ID：{confirmation.id}　登録式ID：{confirmation.formulaId}</p><p>定義比較形式：v{confirmation.definition.version}</p><pre>{confirmation.definition.expression}</pre><p>確認時の変数定義：{confirmation.definition.variables.join("、") || "なし"}</p><p>確認したタイトル：{confirmation.title}</p><details><summary>確認した本文（生Markdown）</summary><pre>{confirmation.body}</pre></details><p>当時の関連付け：{confirmation.links.length}件</p>{confirmation.links.map(link => <p key={JSON.stringify(link)}>メモID：{link.memoId}　記録ID：{link.recordId}</p>)}{confirmation.links.length > 0 && <HistoricalReportEvidence key={generation} confirmation={confirmation} notes={evidence.notes} />}</details>)}</details> : null}
      <details><summary>根拠となる保存済み計算記録</summary>
        <p>原本取得日時：{evidence.fetchedAt}</p><button type="button" disabled={saving} onClick={refreshEvidence}>保存済み根拠を再取得</button>
        {evidenceChanged && <p role="alert">保存原本の更新を検知しました。表示は取得時点の内容です。再取得して根拠を確認するまで保存を停止します。</p>}
        {evidence.error && <p role="alert">{evidence.error}</p>}
        <FormulaReportEvidence key={generation} generation={generation} recordsChanged={recordsChanged} notes={evidence.notes} links={links} onChange={setLinks} disabled={saving || !writable || conflict || Boolean(evidence.error) || evidenceChanged} />
      </details>
      {baseline.report && <p>作成日時：{baseline.report.createdAt}　更新日時：{baseline.report.updatedAt}</p>}
      {!writable && <p role="alert">保存保護中のため変更を保存できません。本文を控えてください。</p>}
      {conflict && <p role="alert">編集中に式またはレポートが変更されました。上書きを停止しました。本文を控えてから閉じて開き直してください。</p>}
      <label htmlFor="formula-report-title">レポートタイトル</label><input id="formula-report-title" value={title} disabled={saving} onChange={event => setTitle(event.target.value)} />
      <div className="modal-actions"><button type="button" aria-pressed={!preview} onClick={() => setPreview(false)}>Markdownを編集</button><button type="button" aria-pressed={preview} onClick={() => setPreview(true)}>レポートをプレビュー</button></div>
      {preview ? <section className="formula-report-preview" aria-label="関連レポートのプレビュー">{body.length > 100_000 ? <p role="alert">本文が100,000文字を超えているためプレビューを停止しました。本文は切り捨てていません。Markdown編集で確認してください。</p> : <MarkdownContent content={body} />}</section> : <><label htmlFor="formula-report-body">レポート本文（Markdown）</label><textarea id="formula-report-body" className="code-input" rows={16} value={body} disabled={saving} onChange={event => setBody(event.target.value)} /></>}
      <p>タイトル {title.length}/120文字、本文 {body.length}/100,000文字。見出しは編集用テンプレートです。未記入の証明・史実・出典は補いません。</p>
      {invalid && <p role="alert">タイトルは1〜120文字、本文は100,000文字以内にしてください。超過分は切り捨てません。</p>}
      <p>コピー・ファイル出力は現在表示中の本文です。未保存の編集も含み、保存は行いません。</p>
      {notice && <p role={notice.failed ? "alert" : "status"}>{notice.text}</p>}
      <div className="modal-actions"><button type="button" disabled={saving} onClick={close}>レポートを閉じる</button><button type="button" onClick={() => void exportBody(false)}>レポート本文をコピー</button><button type="button" onClick={() => void exportBody(true)}>レポート.mdをダウンロード</button></div>
      <div className="modal-actions"><button type="button" disabled={!writable || saving || conflict || invalid || evidenceChanged} onClick={() => void save(false)}>レポートを保存</button><button type="button" className="button-primary" disabled={!formula || !writable || saving || conflict || invalid || evidenceChanged || unavailable} onClick={() => void save(true)}>現在の式に対する内容を確認して保存</button></div>
      {saving && <p role="status">保存結果を確認しています。まだ保存済みではありません。</p>}
      {discard && <Modal title="未保存のレポート編集を破棄しますか？" onClose={() => setDiscard(false)}><p>保存していない本文は失われます。必要なら戻ってコピーしてください。</p><div className="modal-actions"><button onClick={() => setDiscard(false)}>編集に戻る</button><button className="button-danger" onClick={onClose}>未保存の編集を破棄して閉じる</button></div></Modal>}
    </div>
  </Modal>;
}
