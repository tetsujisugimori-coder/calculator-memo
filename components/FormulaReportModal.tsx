"use client";

import { useEffect, useRef, useState } from "react";
import type { FormulaReport, RegisteredFormula } from "../lib/types";
import { formulaReportSignature, FORMULA_REPORT_TEMPLATE, type FormulaReportSaveRequest } from "../lib/formula-reports";
import { downloadMarkdownReport, reportFilename } from "../lib/markdown-report";
import { MarkdownContent } from "./MarkdownContent";
import { Modal } from "./Modal";

type Props = {
  formulaId: string; formula?: RegisteredFormula; report?: FormulaReport;
  writable: boolean; onClose: () => void;
  onSave: (request: FormulaReportSaveRequest) => Promise<FormulaReport | string>;
};

/** Expectations are frozen when opened; prop changes never silently rebase a draft. */
export function FormulaReportModal({ formulaId, formula, report, writable, onClose, onSave }: Props) {
  const [baseline, setBaseline] = useState(() => ({ report: report ? structuredClone(report) : undefined, expression: formula?.expression ?? null }));
  const [id] = useState(() => report?.id ?? crypto.randomUUID());
  const [title, setTitle] = useState(report?.title ?? formula?.title ?? "関連レポート");
  const [body, setBody] = useState(report?.body ?? FORMULA_REPORT_TEMPLATE);
  const [preview, setPreview] = useState(Boolean(report));
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [discard, setDiscard] = useState(false);
  const [notice, setNotice] = useState<{ text: string; failed: boolean } | null>(null);
  const dirty = !baseline.report || title !== baseline.report.title || body !== baseline.report.body;
  const conflict = formulaReportSignature(report) !== formulaReportSignature(baseline.report) || (formula?.expression ?? null) !== baseline.expression;
  const invalid = !title.trim() || title.length > 120 || body.length > 100_000;
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (dirty || savingRef.current) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const close = () => { if (savingRef.current) return; if (dirty) setDiscard(true); else onClose(); };
  const save = async (confirm: boolean) => {
    if (!writable || savingRef.current || conflict || invalid || (confirm && !formula)) return;
    savingRef.current = true; setSaving(true); setNotice(null);
    try {
      const result = await onSave({ id, formulaId, title, body, expectedReport: formulaReportSignature(baseline.report), expectedExpression: baseline.expression, confirm });
      if (typeof result === "string") { setNotice({ text: result, failed: true }); return; }
      setBaseline({ report: structuredClone(result), expression: baseline.expression });
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
  const state = conflict ? "現在の保存内容との照合不能（編集中に変更されました）" : dirty && baseline.report ? "編集中の内容は未確認・未保存です" : !formula ? "登録式が見つからない" : baseline.report?.confirmedExpression === null || !baseline.report ? "式との対応は未確認です" : baseline.report.confirmedExpression === formula.expression ? "式との対応を確認済み" : "式が変更されています。レポートの内容を要確認";
  return <Modal title="登録式の関連レポート" onClose={close} closeDisabled={saving} wide>
    <div className="formula-report">
      <p>登録式の説明資料です。計算定義・数値的な計算根拠・数学的証明とは別に扱います。</p>
      <p role="status">{state}</p>
      <details><summary>確認済みの意味と保証範囲</summary><p>利用者がこの式の説明として内容を確認したという意味です。式文字列の一致は数学的同値性や証明の正しさを保証しません。由緒・出典の信頼性も自動検証しません。開くだけ・計算成功だけでは確認済みになりません。</p></details>
      <p>登録式ID：{formulaId}</p><p>レポートID：{id}</p>
      {formula ? <div><strong>現在の登録式（変更できません）</strong><pre>{formula.expression}</pre></div> : <p>登録式が見つからないため、本文だけを保全しています。閲覧・編集・コピー・ファイル出力ができますが、式との対応は確認できません。</p>}
      {baseline.report?.confirmedExpression != null && <details><summary>最後に確認した式</summary><pre>{baseline.report.confirmedExpression}</pre></details>}
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
      <div className="modal-actions"><button type="button" disabled={!writable || saving || conflict || invalid} onClick={() => void save(false)}>レポートを保存</button><button type="button" className="button-primary" disabled={!formula || !writable || saving || conflict || invalid} onClick={() => void save(true)}>現在の式に対する内容を確認して保存</button></div>
      {saving && <p role="status">保存結果を確認しています。まだ保存済みではありません。</p>}
      {discard && <Modal title="未保存のレポート編集を破棄しますか？" onClose={() => setDiscard(false)}><p>保存していない本文は失われます。必要なら戻ってコピーしてください。</p><div className="modal-actions"><button onClick={() => setDiscard(false)}>編集に戻る</button><button className="button-danger" onClick={onClose}>未保存の編集を破棄して閉じる</button></div></Modal>}
    </div>
  </Modal>;
}
