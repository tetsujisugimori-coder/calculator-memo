"use client";

import { useState } from "react";
import { buildMarkdownReport, downloadMarkdownReport } from "../lib/markdown-report";
import { loadData } from "../lib/storage";
import { verifyCalculationEvidence } from "../lib/calculation-evidence";
import { Modal } from "./Modal";

/** Captured only when explicitly opened, and only from the persisted source.
 * Editor drafts, trial results and application memory are never fallback sources.
 */
function readReport(memoId: string) {
  try {
    const loaded = loadData();
    if (loaded.status !== "ok") throw new Error("保存済み原本を安全に読み取れません。元データは変更していません。");
    const note = loaded.data.notes.find(item => item.id === memoId);
    if (!note || note.type !== "plain-calculation") throw new Error("対象の保存済み計算メモが見つかりません。編集内容からの代替出力は行いません。");
    return { report: buildMarkdownReport(note), evidence: note.calculationEvidence, error: "" };
  } catch (cause) {
    return { report: null, evidence: undefined, error: cause instanceof Error ? cause.message : "レポートを生成できませんでした。元データは変更していません。" };
  }
}

export function MarkdownReportModal({ memoId, onClose }: { memoId: string; onClose: () => void }) {
  const [{ report, evidence, error }] = useState(() => readReport(memoId));
  const [notice, setNotice] = useState<{ text: string; failed: boolean } | null>(null);
  const [copying, setCopying] = useState(false);
  const [verification, setVerification] = useState<{ id: string; success: boolean; message: string }[] | null>(null);
  const verify = () => {
    if (!evidence?.records.length) return;
    // Explicit read-only action on the same persisted snapshot as the report.
    // Never install reproduced values in application state or write them back.
    setVerification(evidence.records.map(record => {
      try { return { id: record.id, ...verifyCalculationEvidence(record) }; }
      catch { return { id: record.id, success: false, message: "記録を再現検証できませんでした。原本は変更していません。" }; }
    }));
  };
  const copy = async () => {
    if (!report || copying) return;
    setCopying(true);
    try {
      await navigator.clipboard.writeText(report.markdown);
      setNotice({ text: "Markdown全文をコピーしました。", failed: false });
    } catch {
      setNotice({ text: "コピーに失敗しました。プレビューから手動でコピーできます。", failed: true });
    } finally { setCopying(false); }
  };
  const download = () => {
    if (!report) return;
    try {
      downloadMarkdownReport(report);
      setNotice({ text: "ダウンロードを要求しました。保存先と完了はブラウザで確認してください。", failed: false });
    } catch {
      setNotice({ text: "ダウンロードを開始できませんでした。元データは変更していません。", failed: true });
    }
  };
  return <Modal title="計算メモのレポート出力" onClose={onClose} wide>
    <div className="markdown-report">
      <p>開いた時点の保存済み原本だけを出力します。未保存の編集内容・未反映の試算は含めず、出力・コピー・ダウンロードでは再計算や保存は行いません。</p>
      {error && <p role="alert" className="field-error">{error}</p>}
      {report && <>
        {report.warnings.length > 0 && <ul aria-label="レポートの注意事項">{report.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>}
        <label>Markdownソース確認<textarea className="code-input" aria-label="Markdownレポート全文" readOnly value={report.markdown} rows={16} /></label>
        <p>ファイル名：{report.filename}</p>
        <p>図と数式の描画は受け取り先のMarkdown対応状況によって異なります。</p>
        {evidence?.records.length ? <div>
          <p>保存済み根拠記録 {evidence.records.length} 件。明示的に再現検証すると、記録内の使用値・参照元・評価順序・結果を現在の評価器で照合します。現在のメモの再計算・結果反映・保存は行いません。</p>
          <button type="button" className="button-secondary" onClick={verify}>保存記録を再現検証</button>
          {verification && <div role={verification.every(result => result.success) ? "status" : "alert"}>
            <p>{verification.every(result => result.success) ? `${verification.length}件の保存記録を再現できました。` : `${verification.filter(result => !result.success).length}件の保存記録を再現できませんでした。`} 記録内容の一致確認であり、暗号学的な真正性や数学的証明の保証ではありません。評価器の変更や記録内容の不一致は、原本と照合してください。</p>
            {verification.some(result => !result.success) && <ul>{verification.filter(result => !result.success).map((result, index) => <li key={index}>記録 {result.id}: {result.message}</li>)}</ul>}
          </div>}
        </div> : <p>保存済みの根拠記録はありません。過去の計算時の使用値は確認不能です。</p>}
      </>}
      {notice && <p role={notice.failed ? "alert" : "status"}>{notice.text}</p>}
      <div className="modal-actions report-detail-actions">
        <button type="button" className="button-secondary" onClick={onClose}>閉じる</button>
        {report && <><button type="button" className="button-secondary" disabled={copying} onClick={copy}>Markdown全文をコピー</button><button type="button" className="button-primary" onClick={download}>.mdをダウンロード</button></>}
      </div>
    </div>
  </Modal>;
}
