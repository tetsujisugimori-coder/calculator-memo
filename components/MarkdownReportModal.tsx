"use client";

import { useState } from "react";
import { buildMarkdownReport, downloadMarkdownReport } from "../lib/markdown-report";
import { loadData } from "../lib/storage";
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
    return { report: buildMarkdownReport(note), error: "" };
  } catch (cause) {
    return { report: null, error: cause instanceof Error ? cause.message : "レポートを生成できませんでした。元データは変更していません。" };
  }
}

export function MarkdownReportModal({ memoId, onClose }: { memoId: string; onClose: () => void }) {
  const [{ report, error }] = useState(() => readReport(memoId));
  const [notice, setNotice] = useState<{ text: string; failed: boolean } | null>(null);
  const [copying, setCopying] = useState(false);
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
      <p>開いた時点の保存済み原本だけを出力します。未保存の編集内容・未反映の試算は含めず、再計算や保存は行いません。</p>
      {error && <p role="alert" className="field-error">{error}</p>}
      {report && <>
        {report.warnings.length > 0 && <ul aria-label="レポートの注意事項">{report.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul>}
        <label>Markdownソース確認<textarea className="code-input" aria-label="Markdownレポート全文" readOnly value={report.markdown} rows={16} /></label>
        <p>ファイル名：{report.filename}</p>
        <p>図と数式の描画は受け取り先のMarkdown対応状況によって異なります。</p>
      </>}
      {notice && <p role={notice.failed ? "alert" : "status"}>{notice.text}</p>}
      <div className="modal-actions report-detail-actions">
        <button type="button" className="button-secondary" onClick={onClose}>閉じる</button>
        {report && <><button type="button" className="button-secondary" disabled={copying} onClick={copy}>Markdown全文をコピー</button><button type="button" className="button-primary" onClick={download}>.mdをダウンロード</button></>}
      </div>
    </div>
  </Modal>;
}
