"use client";

import { useEffect, useLayoutEffect, useId, useMemo, useRef, useState } from "react";
import type { FormulaReport, RegisteredFormula, FormulaReportEvidenceLink, Memo } from "../lib/types";
import { readFormulaReports, formulaReportSignature, FORMULA_REPORT_TEMPLATE, appendFormulaReportTemplate, type FormulaReportSaveRequest } from "../lib/formula-reports";
import { downloadMarkdownReport, reportFilename } from "../lib/markdown-report";
import { MarkdownContent } from "./MarkdownContent";
import { loadData, STORAGE_KEY } from "../lib/storage";
import { formulaDefinitionSignature, formulaDefinitionSnapshot, formulaReportAssessment, reportEvidenceSignature, resolveReportEvidence } from "../lib/formula-report-evidence";
import { FormulaReportEvidence, HistoricalReportEvidence } from "./FormulaReportEvidence";
import { ConfirmationRemarks } from "./ConfirmationRemarks";
import { extractMarkdownHeadings, markdownHeadingDomId, type MarkdownHeading } from "../lib/markdown-blocks";
import { FormulaQuotePicker, FormulaQuoteStatus } from "./FormulaReportQuotes";
import { insertQuoteAtCursor } from "../lib/formula-report-quotes";
import { buildQuoteDifferenceMarkdown, insertDifferenceAtCursor } from "../lib/formula-report-diff";
import type { DifferenceInsertion } from "./FormulaQuoteComparison";
import { Modal } from "./Modal";

type Props = {
  formulaId: string; formula?: RegisteredFormula; report?: FormulaReport;
  writable: boolean; onClose: () => void;
  onSave: (request: FormulaReportSaveRequest) => Promise<FormulaReport | string>;
};

function acquireEvidence(formulaId: string) {
  const loaded = loadData();
  return loaded.status === "error"
    ? { links: [] as FormulaReportEvidenceLink[], notes: [] as Memo[], raw: loaded.raw, error: "保存済み原本を安全に取得できません。根拠は参照不能です。現在の編集で補完しません。", fetchedAt: new Date().toISOString() }
    : { links: structuredClone(loaded.data.formulaReports?.entries.find(item => item.formulaId === formulaId)?.evidence?.links ?? []), notes: structuredClone(loaded.data.notes), raw: loaded.status === "ok" ? loaded.raw : null, error: "", fetchedAt: new Date().toISOString() };
}

/** Expectations are frozen when opened; prop changes never silently rebase a draft. */
export function FormulaReportModal({ formulaId, formula, report, writable, onClose, onSave }: Props) {
  const [baseline, setBaseline] = useState(() => ({ report: report ? structuredClone(report) : undefined, expression: formula?.expression ?? null, definition: formulaDefinitionSignature(formula) }));
  const [openedFormulaId] = useState(formulaId);
  const [id] = useState(() => report?.id ?? crypto.randomUUID());
  const [title, setTitle] = useState(report?.title ?? formula?.title ?? "関連レポート");
  const [body, setBody] = useState(report?.body ?? FORMULA_REPORT_TEMPLATE);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const headingPrefix = useId();
  const [quotePicker, setQuotePicker] = useState(false);
  const [quoteUndo, setQuoteUndo] = useState<{ before: string; after: string } | null>(null);
  const quoteSelection = useRef({ start: 0, end: 0 });
  const diffSelection = useRef({ start: 0, end: 0 });
  const [differenceUndo, setDifferenceUndo] = useState<{ before: string; after: string } | null>(null);
  const insertionKeyRef = useRef("");

  const headings = useMemo(() => body.length <= 100_000 ? extractMarkdownHeadings(body) : [], [body]);
  const [templateUndo, setTemplateUndo] = useState<{ before: string; after: string } | null>(null);
  const navigateHeading = (heading: MarkdownHeading) => {
    if (preview) {
      const target = document.getElementById(markdownHeadingDomId(headingPrefix, heading.id));
      target?.focus(); target?.scrollIntoView({ block: "nearest" });
    } else {
      editorRef.current?.focus();
      const offset = (position: number) => body.slice(0, position).replace(/\r\n?/g, "\n").length;
      editorRef.current?.setSelectionRange(offset(heading.start), offset(heading.end));
      const editor = editorRef.current;
      if (editor) {
        // Selection alone does not consistently scroll a textarea in every engine.
        // Measure the wrapped prefix with identical typography; never modify the draft.
        const mirror = document.createElement("div");
        const style = getComputedStyle(editor);
        for (const property of ["font", "line-height", "letter-spacing", "padding", "text-indent", "tab-size"]) mirror.style.setProperty(property, style.getPropertyValue(property));
        Object.assign(mirror.style, { position: "fixed", top: "0", left: "0", visibility: "hidden", pointerEvents: "none", width: `${editor.clientWidth}px`, boxSizing: "border-box", whiteSpace: "pre-wrap", overflowWrap: "break-word" });
        mirror.setAttribute("aria-hidden", "true");
        mirror.textContent = editor.value.slice(0, offset(heading.start));
        const marker = document.createElement("span"); marker.textContent = "|"; mirror.append(marker);
        document.body.append(mirror);
        editor.scrollTop = Math.max(0, marker.offsetTop - editor.clientHeight / 2);
        mirror.remove();
        editor.scrollIntoView({ block: "nearest" });
      }
    }
  };
  const [links, setLinks] = useState<FormulaReportEvidenceLink[]>(() => structuredClone(report?.evidence?.links ?? []));
  const [evidence, setEvidence] = useState(() => acquireEvidence(formulaId));
  const [generation, setGeneration] = useState(0);
  const [evidenceChanged, setEvidenceChanged] = useState(false);
  const [preview, setPreview] = useState(Boolean(report));
  const [remarks, setRemarks] = useState("");
  const remarksInvalid = remarks.length > 500;
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [discard, setDiscard] = useState(false);
  const [notice, setNotice] = useState<{ text: string; failed: boolean } | null>(null);
  const dirty = !baseline.report || title !== baseline.report.title || body !== baseline.report.body || JSON.stringify(links) !== JSON.stringify(baseline.report?.evidence?.links ?? []);
  const unsaved = dirty || remarks.length > 0;
  const conflict = openedFormulaId !== formulaId || (report && report.id !== id) || formulaReportSignature(report) !== formulaReportSignature(baseline.report) || formulaDefinitionSignature(formula) !== baseline.definition;
  const invalid = !title.trim() || title.length > 120 || body.length > 100_000;
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { if (unsaved || savingRef.current) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsaved]);
  useEffect(() => {
    const observe = (event: StorageEvent) => { if ((event.key === STORAGE_KEY || event.key === null) && event.newValue !== evidence.raw) setEvidenceChanged(true); };
    window.addEventListener("storage", observe);
    return () => window.removeEventListener("storage", observe);
  }, [evidence.raw]);
  const refreshEvidence = () => { setEvidence(acquireEvidence(formulaId)); setGeneration(value => value + 1); setEvidenceChanged(false); };
  const unavailable = Boolean(evidence.error) || resolveReportEvidence(evidence.notes, links).some(item => item.status !== "available");
  const close = () => { if (savingRef.current) return; if (unsaved) setDiscard(true); else onClose(); };
  const save = async (confirm: boolean) => {
    if (!writable || savingRef.current || conflict || invalid || evidenceChanged || (confirm && (!formula || unavailable || remarksInvalid))) return;
    savingRef.current = true; setSaving(true); setNotice(null);
    try {
      const result = await onSave({ id, formulaId, title, body, expectedReport: formulaReportSignature(baseline.report), expectedExpression: baseline.expression, expectedDefinition: baseline.definition, links, expectedEvidence: reportEvidenceSignature(evidence.notes, links), confirm, ...(confirm ? { confirmationRemarks: remarks } : {}) });
      if (typeof result === "string") { setNotice({ text: result, failed: true }); return; }
      setTemplateUndo(null); setQuoteUndo(null); setDifferenceUndo(null);
      setEvidence(acquireEvidence(formulaId));
      setBaseline({ report: structuredClone(result), expression: baseline.expression, definition: baseline.definition });
      if (confirm) setRemarks("");
      setNotice({ text: confirm ? "内容の確認と保存が完了しました。" : "レポートを保存しました。", failed: false });
    } catch (cause) { setNotice({ text: cause instanceof Error ? cause.message : "保存に失敗しました。編集内容は保持しています。", failed: true }); }
    finally { savingRef.current = false; setSaving(false); }
  };
  const insertionKey = JSON.stringify([id, formulaId, title, body, links, generation, evidence.fetchedAt, evidenceChanged, evidence.error, conflict, writable, saving]);
  useLayoutEffect(() => { insertionKeyRef.current = insertionKey; }, [insertionKey]);
  if (differenceUndo && conflict) setDifferenceUndo(null);
  const checkInsertionSource = () => {
    const loaded = loadData();
    if (loaded.status !== "ok" || loaded.raw !== evidence.raw) {
      setEvidenceChanged(true);
      throw new Error("差分挿入前に原本の変更または取得失敗を検知しました。本文は保持しています。保存済み根拠を再取得し、比較対象を選び直してください。");
    }
    return loaded.data;
  };
  const differenceInsertion: DifferenceInsertion = {
    key: insertionKey, reportId: id, title,
    disabled: saving || !writable || !!conflict || evidenceChanged || !!evidence.error,
    prepare: (quote, targetKey) => {
      if (savingRef.current || !writable || conflict || evidenceChanged || evidence.error) throw new Error("現在は差分を挿入できません。本文は保持しています。");
      const data = checkInsertionSource();
      const markdown = buildQuoteDifferenceMarkdown(quote, formulaId, evidence.notes, evidence.links, targetKey);
      const { start, end } = diffSelection.current;
      const next = insertDifferenceAtCursor(body, markdown, formulaId, start, end);
      // Validate the complete report collection without invoking any save/confirmation writer.
      const preflight = (current: typeof data) => {
        const reports = current.formulaReports;
        const original = reports?.entries.find(item => item.id === id && item.formulaId === formulaId);
        if (!reports || !original || formulaReportSignature(original) !== formulaReportSignature(baseline.report)) throw new Error("挿入先レポートを同じ保存原本で確認できません。本文は保持しています。");
        readFormulaReports({ ...reports, entries: reports.entries.map(item => item === original ? { ...item, title, body: next.body, ...(item.evidence ? { evidence: { ...item.evidence, links } } : {}) } : item) });
      };
      preflight(data);
      return { markdown, start, end, insert: () => {
        if (insertionKeyRef.current !== insertionKey || savingRef.current || !writable || conflict || evidenceChanged || evidence.error) throw new Error("本文・レポート・取得世代が変わりました。古いプレビューは挿入しません。生成し直してください。");
        preflight(checkInsertionSource());
        setDifferenceUndo({ before: body, after: next.body }); setQuoteUndo(null); setTemplateUndo(null);
        setBody(next.body); setPreview(false);
        setNotice({ text: "比較差分を本文へ追加しました。既存引用はそのままです。未保存・未確認です。", failed: false });
        requestAnimationFrame(() => { editorRef.current?.focus(); editorRef.current?.setSelectionRange(next.caret, next.caret); });
      } };
    },
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
      {baseline.report?.evidence?.confirmations.length ? <details><summary>確認時の式・本文・根拠の履歴（{baseline.report.evidence.confirmations.length}件）</summary>{baseline.report.evidence.confirmations.map(confirmation => <details key={confirmation.id}><summary>確認日時：{confirmation.confirmedAt}</summary><p>確認ID：{confirmation.id}　登録式ID：{confirmation.formulaId}</p><p>定義比較形式：v{confirmation.definition.version}</p><pre>{confirmation.definition.expression}</pre><p>確認時の変数定義：{confirmation.definition.variables.join("、") || "なし"}</p><p>確認したタイトル：{confirmation.title}</p><details><summary>確認した本文（生Markdown）</summary><pre>{confirmation.body}</pre></details><ConfirmationRemarks remarks={confirmation.remarks} /><p>当時の関連付け：{confirmation.links.length}件</p>{confirmation.links.map(link => <p key={JSON.stringify(link)}>メモID：{link.memoId}　記録ID：{link.recordId}</p>)}{confirmation.links.length > 0 && <HistoricalReportEvidence key={generation} confirmation={confirmation} notes={evidence.notes} />}</details>)}</details> : null}
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
      {!preview && <div className="report-template-tools">
        <p id="report-template-help">6章のMarkdownを本文の末尾に追加します。既存本文は保持します。章は自由に編集・削除でき、追加だけでは保存・確認されません。直後は専用の取消ができますが、その後の編集・保存で取消は終了します。</p>
        <button type="button" disabled={saving || !writable || conflict || evidenceChanged} aria-describedby="report-template-help" onClick={() => {
          if (savingRef.current) return;
          try { const next = appendFormulaReportTemplate(body); setTemplateUndo({ before: body, after: next }); setQuoteUndo(null); setDifferenceUndo(null); setBody(next); setNotice({ text: "本文の末尾にテンプレートを追加しました。未保存です。", failed: false }); }
          catch (cause) { setNotice({ text: cause instanceof Error ? cause.message : "追加できませんでした。本文は保持しています。", failed: true }); }
        }}>テンプレートを挿入（末尾に追加）</button>
        <button type="button" disabled={saving || !templateUndo || body !== templateUndo.after} onClick={() => {
          if (savingRef.current || !templateUndo || body !== templateUndo.after) return;
          setBody(templateUndo.before); setTemplateUndo(null); setQuoteUndo(null); setDifferenceUndo(null); setNotice({ text: "直前のテンプレート追加を取り消しました。保存は行っていません。", failed: false });
        }}>直前のテンプレート追加を取り消す</button>
      </div>}
      {!preview && <div className="quote-tools">
        <p>カーソル位置へ引用を追加します。範囲選択時は選択範囲の先頭へ挿入し、選択した文章も保持します。直後だけ専用取消ができます。</p>
        <button type="button" disabled={saving || !writable || conflict || evidenceChanged || Boolean(evidence.error)} onClick={() => {
          const editor = editorRef.current;
          quoteSelection.current = { start: editor?.selectionStart ?? body.length, end: editor?.selectionEnd ?? body.length };
          setQuotePicker(true);
        }}>計算根拠を引用</button>
        <button type="button" disabled={saving || !quoteUndo || body !== quoteUndo.after} onClick={() => {
          if (savingRef.current || !quoteUndo || body !== quoteUndo.after) return;
          setBody(quoteUndo.before); setQuoteUndo(null); setTemplateUndo(null);
          setNotice({ text: "直前の引用を取り消しました。保存は行っていません。", failed: false });
        }}>直前の引用を取り消す</button>
      </div>}
      <div className="quote-tools"><button type="button" disabled={saving || !!conflict || !differenceUndo || body !== differenceUndo.after} onClick={() => {
        if (savingRef.current || conflict || !differenceUndo || body !== differenceUndo.after) return;
        setBody(differenceUndo.before); setDifferenceUndo(null); setQuoteUndo(null); setTemplateUndo(null);
        setNotice({ text: "直前の差分挿入を取り消しました。保存は行っていません。", failed: false });
      }}>直前の差分挿入を取り消す</button></div>
      <FormulaQuoteStatus insertion={differenceInsertion} onCompareOpen={() => {
        const editor = editorRef.current;
        const end = body.replace(/\r\n?/g, "\n").length;
        diffSelection.current = { start: editor?.selectionStart ?? end, end: editor?.selectionEnd ?? end };
      }} onRefresh={refreshEvidence} body={body} formulaId={formulaId} links={evidence.links} source={{ ...evidence, stale: evidenceChanged || conflict }} />
      {quotePicker && <FormulaQuotePicker formulaId={formulaId} links={evidence.links} source={{ ...evidence, stale: evidenceChanged }} disabled={saving || !writable || conflict} onClose={() => setQuotePicker(false)} onInsert={markdown => {
        if (savingRef.current || !writable || conflict || evidenceChanged || evidence.error) return;
        const latest = loadData();
        if (latest.status === "error" || (latest.status === "ok" ? latest.raw : null) !== evidence.raw) {
          setEvidenceChanged(true); setQuotePicker(false); setNotice({ text: "引用前に原本の変更または取得失敗を検知しました。本文は変更していません。保存済み根拠を再取得してください。", failed: true }); return;
        }
        try {
          const next = insertQuoteAtCursor(body, markdown, quoteSelection.current.start, quoteSelection.current.end);
          setQuoteUndo({ before: body, after: next.body }); setTemplateUndo(null); setDifferenceUndo(null); setBody(next.body); setQuotePicker(false);
          setNotice({ text: "計算根拠を引用しました。未保存です。", failed: false });
          requestAnimationFrame(() => { editorRef.current?.focus(); editorRef.current?.setSelectionRange(next.caret, next.caret); });
        } catch (cause) { setQuotePicker(false); setNotice({ text: cause instanceof Error ? cause.message : "引用を挿入できませんでした。本文は保持しています。", failed: true }); }
      }} />}
      <details className="report-heading-navigation"><summary>章一覧（{headings.length}件）</summary>
        <p>現在表示中のMarkdownの見出しです。編集時は該当行を選択、プレビュー時は見出しへ移動します。保存は行いません。</p>
        {body.length > 100_000 ? <p>上限超過のため章一覧を停止しています。本文は保持しています。</p> : headings.length ? <nav aria-label="レポートの章一覧"><ol>{headings.map(heading => <li key={heading.id} style={{ paddingInlineStart: `${(heading.level - 1) * .5}rem` }}><button type="button" disabled={saving} onClick={() => navigateHeading(heading)}>H{heading.level}：{heading.text}</button></li>)}</ol></nav> : <p>見出しがありません。行頭の #〜###### と空白で見出しを作成できます。</p>}
      </details>
      {preview ? <section className="formula-report-preview" aria-label="関連レポートのプレビュー">{body.length > 100_000 ? <p role="alert">本文が100,000文字を超えているためプレビューを停止しました。本文は切り捨てていません。Markdown編集で確認してください。</p> : <MarkdownContent content={body} headingIdPrefix={headingPrefix} />}</section> : <><label htmlFor="formula-report-body">レポート本文（Markdown）</label><textarea ref={editorRef} id="formula-report-body" className="code-input" rows={16} value={body} disabled={saving} onChange={event => { setBody(event.target.value); setTemplateUndo(null); setQuoteUndo(null); setDifferenceUndo(null); }} /></>}
      <p>タイトル {title.length}/120文字、本文 {body.length}/100,000文字。見出しは編集用テンプレートです。未記入の証明・史実・出典は補いません。</p>
      {invalid && <p role="alert">タイトルは1〜120文字、本文は100,000文字以内にしてください。超過分は切り捨てません。</p>}
      <p>コピー・ファイル出力は現在表示中の本文です。未保存の編集も含み、保存は行いません。</p>
      {notice && <p role={notice.failed ? "alert" : "status"}>{notice.text}</p>}
      <div className="modal-actions"><button type="button" disabled={saving} onClick={close}>レポートを閉じる</button><button type="button" onClick={() => void exportBody(false)}>レポート本文をコピー</button><button type="button" onClick={() => void exportBody(true)}>レポート.mdをダウンロード</button></div>
      <label htmlFor="formula-report-remarks">確認時の備考（任意）</label>
      <textarea id="formula-report-remarks" rows={3} value={remarks} disabled={saving} aria-describedby="formula-report-remarks-help formula-report-remarks-count" aria-invalid={remarksInvalid} onChange={event => { if (!savingRef.current) setRemarks(event.target.value); }} />
      <p id="formula-report-remarks-help">利用者の確認時の申告です。変更日時・変更理由の客観的記録や数学的正しさの保証ではありません。明示確認の保存成功時だけ履歴へ記録します。通常保存では備考は保存されません。</p>
      <p id="formula-report-remarks-count" role={remarksInvalid ? "alert" : undefined}>{remarks.length}/500 UTF-16コード単位（絵文字などは2単位）。{remarksInvalid && "上限超過のため確認できません。入力は切り捨てていません。"}</p>
      <div className="modal-actions"><button type="button" disabled={!writable || saving || conflict || invalid || evidenceChanged} onClick={() => void save(false)}>レポートを保存</button><button type="button" className="button-primary" disabled={!formula || !writable || saving || conflict || invalid || evidenceChanged || unavailable || remarksInvalid} onClick={() => void save(true)}>現在の式に対する内容を確認して保存</button></div>
      {saving && <p role="status">保存結果を確認しています。まだ保存済みではありません。</p>}
      {discard && <Modal title="未保存のレポート編集を破棄しますか？" onClose={() => setDiscard(false)}><p>保存していない本文・備考は失われます。必要なら戻ってコピーしてください。</p><div className="modal-actions"><button onClick={() => setDiscard(false)}>編集に戻る</button><button className="button-danger" onClick={onClose}>未保存の編集を破棄して閉じる</button></div></Modal>}
    </div>
  </Modal>;
}
