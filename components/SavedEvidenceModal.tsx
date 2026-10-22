"use client";

import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { loadData, STORAGE_KEY } from "../lib/storage";
import { validCalculationEvidence, type EvidenceRecord } from "../lib/calculation-evidence";
import { compareEvidenceRecords, buildEvidenceComparisonMarkdown, EVIDENCE_CHANGE_LABELS } from "../lib/evidence-comparison";
import { downloadMarkdownReport } from "../lib/markdown-report";
import { analyzeEvidenceImpact } from "../lib/evidence-impact";
import { appendEvidenceImpactMarkdown } from "../lib/evidence-impact-markdown";
import { EvidenceImpactView } from "./EvidenceImpactView";
import { RecordInfo, BlockInfo } from "./EvidenceRecordDetails";
import { Modal } from "./Modal";

type Snapshot = { id: string; title: string; raw: string; records: EvidenceRecord[]; fetchedAt: string };
function readSavedRecords(memoId: string): Snapshot {
  const loaded = loadData();
  if (loaded.status !== "ok") throw new Error("比較不可：保存済み原本を安全に読み取れません。元データは変更していません。保護の案内から原本を確認してください。");
  const note = loaded.data.notes.find(item => item.id === memoId);
  if (!note || note.type !== "plain-calculation") throw new Error("対象の保存済み計算メモが見つかりません。現在の編集内容で代用しません。");
  if (note.calculationEvidence !== undefined && !validCalculationEvidence(note.calculationEvidence)) throw new Error("比較不可：未対応または不正な計算記録です。元データは変更していません。");
  return { id: note.id, title: note.title, raw: loaded.raw, records: structuredClone(note.calculationEvidence?.records ?? []), fetchedAt: new Date().toISOString() };
}
function initial(memoId: string) {
  try {
    const snapshot = readSavedRecords(memoId);
    return { snapshot, error: "", detailId: snapshot.records.at(-1)?.id ?? "", beforeId: snapshot.records.at(-2)?.id ?? "", afterId: snapshot.records.at(-1)?.id ?? "" };
  } catch (cause) {
    return { snapshot: null, error: cause instanceof Error ? cause.message : "保存記録を取得できませんでした。", detailId: "", beforeId: "", afterId: "" };
  }
}
function LazyDetails({ summary, children, className, blockId }: { summary: ReactNode; children: ReactNode; className?: string; blockId?: string }) {
  const [open, setOpen] = useState(false);
  return <details className={className} data-block-id={blockId} onToggle={event => setOpen(event.currentTarget.open)}><summary>{summary}</summary>{open ? children : null}</details>;
}

/** Only an explicit opening/refresh reads persistence. Everything else uses one snapshot. */
export function SavedEvidenceModal({ memoId, onClose }: { memoId: string; onClose: () => void }) {
  const selectionHelpId = useId();
  const [state, setState] = useState(() => initial(memoId));
  const { snapshot, error, detailId, beforeId, afterId } = state;
  const [generation, setGeneration] = useState(0);
  const [changedElsewhere, setChangedElsewhere] = useState(false);
  const [notice, setNotice] = useState<{ text: string; failed: boolean } | null>(null);
  const [copying, setCopying] = useState(false);
  const [showUnchanged, setShowUnchanged] = useState(false);
  const records = snapshot?.records ?? [];
  const detail = records.find(record => record.id === detailId);
  const comparisonResult = useMemo(() => {
    if (!snapshot || !beforeId || !afterId) return { comparison: null, report: null, error: "" };
    try {
      const before = snapshot.records.find(record => record.id === beforeId);
      const after = snapshot.records.find(record => record.id === afterId);
      if (!before || !after) throw new Error("選択した記録が取得時点の原本にありません。選択し直してください。");
      const comparison = compareEvidenceRecords(before, after);
      let impact;
      try { impact = analyzeEvidenceImpact(comparison); }
      catch { return { comparison, impact: null, report: null, error: "影響分析を生成できませんでした。既存の記録比較は表示しています。不完全な分析を含むMarkdown出力は停止しました。" }; }
      try { return { comparison, impact, report: appendEvidenceImpactMarkdown(buildEvidenceComparisonMarkdown(snapshot, comparison), comparison, impact), error: "" }; }
      catch (cause) { return { comparison, impact, report: null, error: cause instanceof Error ? cause.message : "Markdown出力を生成できませんでした。" }; }
    } catch (cause) { return { comparison: null, report: null, error: cause instanceof Error ? cause.message : "記録を比較できませんでした。" }; }
  }, [snapshot, beforeId, afterId]);
  useEffect(() => {
    const observe = (event: StorageEvent) => {
      if ((event.key === STORAGE_KEY || event.key === null) && event.newValue !== snapshot?.raw) setChangedElsewhere(true);
    };
    window.addEventListener("storage", observe);
    return () => window.removeEventListener("storage", observe);
  }, [snapshot]);
  const refresh = () => {
    if (copying) return;
    setGeneration(value => value + 1);
    try {
      const next = readSavedRecords(memoId);
      const exists = (id: string) => next.records.some(record => record.id === id);
      const vanished = [detailId, beforeId, afterId].filter(id => id && !exists(id));
      setState({ snapshot: next, error: "", detailId: exists(detailId) ? detailId : "", beforeId: exists(beforeId) ? beforeId : "", afterId: exists(afterId) ? afterId : "" });
      setChangedElsewhere(false);
      setNotice({ text: vanished.length ? "選択していた記録が再取得した原本にありません。別の記録で代用せず選択を解除しました。" : "保存済み原本を再取得しました。画面とMarkdownを同じ取得内容へ更新しました。", failed: vanished.length > 0 });
    } catch (cause) {
      // Never mix a failed new generation with the previous successful selection.
      setState({ snapshot: null, error: cause instanceof Error ? cause.message : "再取得に失敗しました。", detailId: "", beforeId: "", afterId: "" });
      setNotice(null);
    }
  };
  const select = (key: "detailId" | "beforeId" | "afterId", id: string) => { setState(current => ({ ...current, [key]: id })); setNotice(null); };
  const copy = async () => {
    if (!comparisonResult.report || copying) return;
    const report = comparisonResult.report;
    setCopying(true);
    try { await navigator.clipboard.writeText(report.markdown); setNotice({ text: "選択した2記録の比較Markdown全文をコピーしました。", failed: false }); }
    catch { setNotice({ text: "コピーに失敗しました。全文確認欄から手動でコピーできます。", failed: true }); }
    finally { setCopying(false); }
  };
  const download = () => {
    if (!comparisonResult.report) return;
    try { downloadMarkdownReport(comparisonResult.report); setNotice({ text: "ダウンロードを要求しました。実際の保存先と完了はブラウザで確認してください。", failed: false }); }
    catch { setNotice({ text: "ダウンロードを開始できませんでした。原本は変更していません。", failed: true }); }
  };
  const options = records.map((record, index) => <option key={record.id} value={record.id}>記録 {index + 1}</option>);
  const { comparison, report } = comparisonResult;
  const impact = "impact" in comparisonResult ? comparisonResult.impact : null;
  return <Modal title="保存済み計算記録" onClose={onClose} wide>
    <div className="saved-evidence markdown-report">
      <p>保存済みの過去の計算記録を閲覧・比較します。現在の未保存編集、試算、未保存の記録候補は含みません。</p>
      <details className="evidence-help"><summary>i 計算記録の比較について</summary><p>試算比較は「これから反映する変更」、ここでの比較は「保存済みの過去同士」です。差分表示は因果関係の証明ではなく、計算の再現検証も数学的証明とは異なります。この画面では再計算・再現検証・保存は行いません。記録にない説明や原因は確認不能です。記録間の追加／削除は本文全体の編集履歴ではありません。履歴整理や容量上限の変更はできません。</p><p>保存要求時刻は保存処理を要求した日時であり、実際の保存完了時刻ではありません。日時が同じ・逆転していても追記順を維持します。記録原本は利用者が変更可能なJSONで、真正性を保証しません。</p></details>
      {error && <p role="alert" className="field-error">{error}</p>}
      {snapshot && <><p>対象メモ：{snapshot.title || "無題のメモ"} / メモID：{snapshot.id}（メモ名は取得時点の識別情報で、当時のタイトルではありません）</p><p>取得時刻：{snapshot.fetchedAt}（日時はUTC表記）。取得後は同じ原本の記録を使います。</p></>}
      {changedElsewhere && <p role="status">保存内容の外部更新を検知しました。現在は前の取得時点を表示しています。必要なら明示的に再取得してください。</p>}
      <button type="button" className="button-secondary" disabled={copying} onClick={refresh}>最新の保存内容を再取得</button>
      {snapshot && !records.length && <p>保存済み計算記録は0件です。履歴がないため比較できません。過去の使用値は確認不能です。</p>}
      {!!records.length && <>
        <details className="evidence-record-list"><summary>保存済み記録の一覧（{records.length}件・追記順）</summary><ol>{records.map((record, index) => <li key={record.id}><p>追記 {index + 1}</p><RecordInfo record={record} /></li>)}</ol></details>
        <p id={selectionHelpId}>選択肢の番号は取得した記録の追記順です。日時・完全な記録ID・件数は一覧と選択した記録の情報で確認できます。</p>
        <label>記録の詳細<select aria-describedby={selectionHelpId} aria-label="記録の詳細" disabled={copying} value={detailId} onChange={event => select("detailId", event.target.value)}><option value="">記録を選択</option>{options}</select></label>
        {detail && <><section aria-label="選択した記録の情報"><RecordInfo record={detail} /></section><LazyDetails className="evidence-record-detail" summary="選択した記録の詳細">{detail.blocks.map((block, index) => <LazyDetails key={block.blockId} summary={<>本文 {block.position} / 実行 {index + 1} / ID：{block.blockId}</>}><BlockInfo block={block} executionOrder={index + 1} record={detail} /></LazyDetails>)}</LazyDetails></>}
        {records.length === 1 ? <p>比較には異なる2件の保存記録が必要です。現在は1件の詳細のみ確認できます。</p> : <>
          <div className="evidence-pair"><label>変更前の記録<select aria-describedby={selectionHelpId} aria-label="変更前の記録" disabled={copying} value={beforeId} onChange={event => select("beforeId", event.target.value)}><option value="">記録を選択</option>{options}</select></label><label>変更後の記録<select aria-describedby={selectionHelpId} aria-label="変更後の記録" disabled={copying} value={afterId} onChange={event => select("afterId", event.target.value)}><option value="">記録を選択</option>{options}</select></label></div>
          <button type="button" className="button-secondary" disabled={copying || !beforeId || !afterId} onClick={() => { setState(current => ({ ...current, beforeId: current.afterId, afterId: current.beforeId })); setNotice(null); }}>前後を入れ替える</button>
          {(!beforeId || !afterId) && <p>比較する2記録を選択してください。</p>}
          {comparisonResult.error && <p role="alert" className="field-error">{comparisonResult.error}</p>}
          {comparison && <section aria-label="保存記録の比較結果">
            <h3>変更の概要</h3><p>比較対象の記録間で追加 {comparison.counts.added} / 削除 {comparison.counts.removed} / 変更 {comparison.counts.changed} / 比較対象項目に変更なし {comparison.counts.unchanged}</p>
            {comparison.warnings.map((warning, index) => <p key={index}>{warning}</p>)}
            <div className="evidence-pair"><section><h4>変更前</h4><RecordInfo record={comparison.before} /></section><section><h4>変更後</h4><RecordInfo record={comparison.after} /></section></div>
            <label className="evidence-toggle"><input type="checkbox" checked={showUnchanged} onChange={event => setShowUnchanged(event.target.checked)} />比較対象項目に変更なしのブロックも表示</label>
            {comparison.rows.filter(row => showUnchanged || row.kind !== "unchanged").map(row => <LazyDetails className="evidence-diff-row" blockId={row.blockId} key={row.blockId} summary={<><span>ブロックID：{row.blockId}</span><span>{row.kind === "added" ? "比較対象の記録間で追加" : row.kind === "removed" ? "比較対象の記録間で削除" : row.kind === "unchanged" ? "比較対象項目に変更なし" : row.changes.map(change => EVIDENCE_CHANGE_LABELS[change]).join(" / ")}</span></>}>
              <div className="evidence-pair"><section><h4>変更前</h4>{row.before ? <BlockInfo {...row.before} record={comparison.before} /> : <p>この記録に存在しません。</p>}</section><section><h4>変更後</h4>{row.after ? <BlockInfo {...row.after} record={comparison.after} /> : <p>この記録に存在しません。</p>}</section></div>
            </LazyDetails>)}
          </section>}
          {impact && comparison && <EvidenceImpactView generationKey={JSON.stringify([generation, beforeId, afterId])} impact={impact} renderDetails={id => {
            const row = comparison.rows.find(item => item.blockId === id)!;
            return <div className="evidence-pair"><section><h4>変更前</h4>{row.before ? <BlockInfo {...row.before} record={comparison.before} /> : <p>この記録に存在しません。</p>}</section><section><h4>変更後</h4>{row.after ? <BlockInfo {...row.after} record={comparison.after} /> : <p>この記録に存在しません。</p>}</section></div>;
          }} />}
          {report && <><label>比較Markdownの全文確認<textarea className="code-input" aria-label="比較Markdown全文" value={report.markdown} readOnly rows={16} /></label><p>ファイル名：{report.filename}</p><div className="modal-actions report-detail-actions"><button type="button" className="button-secondary" disabled={copying} onClick={copy}>比較Markdown全文をコピー</button><button type="button" className="button-primary" disabled={copying} onClick={download}>比較.mdをダウンロード</button></div></>}
        </>}
      </>}
      {notice && <p role={notice.failed ? "alert" : "status"}>{notice.text}</p>}
      <div className="modal-actions"><button type="button" className="button-secondary" onClick={onClose}>閉じる</button></div>
    </div>
  </Modal>;
}
