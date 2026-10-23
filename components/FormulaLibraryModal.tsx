"use client";
import { VariableIdentification } from "./Identification";
import { useState } from "react";
import { FormulaReportModal } from "./FormulaReportModal";
import type { FormulaReportSaveRequest } from "../lib/formula-reports";
import { Modal } from "./Modal";
import { FormulaDetailView } from "./FormulaDetailView";
import { removeFormula, saveFormula, validateFormula } from "../lib/formula-library";
import type { FormulaLibrary, RegisteredFormula, FormulaReports, FormulaReport } from "../lib/types";

type Props = { reports?: FormulaReports; onSaveReport?: (request: FormulaReportSaveRequest) => Promise<FormulaReport | string>; library: FormulaLibrary; onChange: (library: FormulaLibrary) => void; onClose: () => void; writable: boolean; pendingSave?: boolean; onExecute: (id: string) => void };
export function FormulaLibraryModal({ library, reports, onSaveReport, onChange, onClose, writable, pendingSave = false, onExecute }: Props) {
  const [draft, setDraft] = useState<{ id?: string; title: string; expression: string } | null>(null);
  const [reportFormulaId, setReportFormulaId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [pendingDelete, setPendingDelete] = useState<RegisteredFormula | null>(null);
  const [removed, setRemoved] = useState<RegisteredFormula | null>(null);
  const [selectedId, setSelectedId] = useState(library.selectedId);
  const [detailRevision, setDetailRevision] = useState(0);
  const selected = library.entries.find((entry) => entry.id === selectedId) ?? library.entries.find((entry) => entry.id === library.selectedId);
  const close = () => { if (draft) setError("編集中です。登録するか、編集をキャンセルしてから閉じてください。"); else onClose(); };
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!draft || !writable) return;
    try {
      validateFormula(draft.title, draft.expression);
      const original = library.entries.find((entry) => entry.id === draft.id);
      const now = new Date().toISOString();
      const next = saveFormula(library, { ...original, id: original?.id ?? crypto.randomUUID(), title: draft.title.trim(), expression: draft.expression, createdAt: original?.createdAt ?? now, updatedAt: now });
      setSelectedId(next.selectedId);
      onChange(next);
      setDraft(null); setError("");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "登録内容を確認してください"); }
  };
  return <Modal title="登録式ライブラリ" onClose={close} wide>
    <p role={pendingSave ? "status" : undefined} aria-hidden={!pendingSave} data-testid={pendingSave ? "library-unsaved-changes" : undefined} style={{ visibility: pendingSave ? "visible" : "hidden" }}>未保存です。再読み込み・終了に注意。</p>
    <div className="formula-library">
      <p>計算方法を保存する場所です。選択すると詳細を表示します。「登録式を実行」から変数の値を入力して計算できます。</p>
      <p>構文だけを確認します。0除算・負数の平方根・指数や結果の範囲など、計算時の成立は未検証です。</p>
      {!writable && <p role="alert">保存領域を確認できないため変更できません。</p>}
      {error && <p className="field-error" role="alert">{error}</p>}
      {draft ? <form className="note-form" onSubmit={submit}>
        <label htmlFor="library-title">登録名</label><input id="library-title" maxLength={120} value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
        <label htmlFor="library-expression">登録する計算式</label><textarea id="library-expression" rows={4} maxLength={2000} className="code-input" value={draft.expression} onChange={(e) => setDraft({ ...draft, expression: e.target.value })} placeholder="price * quantity" />
        <div className="identity-item identity-registered"><span className="identity-label">登録式（編集中）</span><span>{draft.title || "登録名未入力"}</span></div>
        <VariableIdentification expression={draft.expression} />
        <p>英字で始まる変数名、sqrt・abs・pi・eを使用できます。代入は含めず、掛け算には * を使います。</p>
        <div className="modal-actions"><button type="button" onClick={() => { setDraft(null); setError(""); }}>編集をキャンセル</button><button className="button-primary" disabled={!writable} type="submit">登録する</button></div>
      </form> : <>
        <button className="button-primary" disabled={!writable} onClick={() => { setDraft({ title: "", expression: "" }); setError(""); }}>計算式を登録</button>
        {library.entries.length === 0 && <p>登録式はまだありません。</p>}
        <ul className="formula-library-list" aria-label="登録式一覧">{library.entries.map((entry) => <li key={entry.id}><button aria-label={entry.title} aria-description="登録式" aria-pressed={selected?.id === entry.id} onClick={() => setSelectedId(entry.id)}><span className="identity-item identity-registered"><span className="identity-label">登録式</span><span>{entry.title}</span></span></button></li>)}</ul>
        {selected && <section className="formula-library-detail" aria-label="選択した登録式">
          <FormulaDetailView key={`${selected.id}:${pendingSave}:${detailRevision}`} formulaId={selected.id} pendingSave={pendingSave} />
          {onSaveReport && <section aria-label="関連レポート"><h4>関連レポート</h4><p>登録式とは別に、証明・導出・適用条件・由緒・参考資料を記述できます。</p><button onClick={() => setReportFormulaId(selected.id)}>{reports?.entries.some(report => report.formulaId === selected.id) ? "関連レポートを閲覧・編集" : "レポートを作成"}</button></section>}
          <div className="modal-actions"><button className="button-primary" onClick={() => onExecute(selected.id)}>登録式を実行</button><button disabled={!writable} onClick={() => { setDraft({ id: selected.id, title: selected.title, expression: selected.expression }); setError(""); }}>登録式を編集</button><button disabled={!writable} onClick={() => setPendingDelete(selected)}>登録式を削除</button></div>
        </section>}
      </>}
      {onSaveReport && reports?.entries.some(report => !library.entries.some(formula => formula.id === report.formulaId)) && <section aria-label="登録式が見つからないレポート"><h3>登録式が見つからないレポート</h3><p>削除された登録式の説明を保全しています。内容を閲覧・編集・コピー・ファイル出力できます。</p><ul>{reports.entries.filter(report => !library.entries.some(formula => formula.id === report.formulaId)).map(report => <li key={report.id}><button onClick={() => setReportFormulaId(report.formulaId)}>{report.title}：閲覧・救出</button></li>)}</ul></section>}
      {reportFormulaId && onSaveReport && <FormulaReportModal key={reportFormulaId} formulaId={reportFormulaId} formula={library.entries.find(formula => formula.id === reportFormulaId)} report={reports?.entries.find(report => report.formulaId === reportFormulaId)} writable={writable && !pendingSave} onSave={onSaveReport} onClose={() => { setReportFormulaId(null); setDetailRevision(value => value + 1); }} />}
      {removed && !draft && <div role="status">「{removed.title}」を削除しました。<button disabled={!writable} onClick={() => { try { onChange(saveFormula(library, removed)); setSelectedId(removed.id); setRemoved(null); setError(""); } catch (cause) { setError(String(cause)); } }}>直前の削除を取り消す</button><p>取り消しはこの画面を閉じるまで有効です。</p></div>}
      {pendingDelete && <Modal title="登録式を削除しますか？" onClose={() => setPendingDelete(null)}><p>「{pendingDelete.title}」を削除します。メモや履歴には影響しません。関連レポートは削除せず、「登録式が見つからないレポート」に保全します。</p><div className="modal-actions"><button onClick={() => setPendingDelete(null)}>キャンセル</button><button className="button-danger" disabled={!writable} onClick={() => { onChange(removeFormula(library, pendingDelete.id)); setRemoved(pendingDelete); setPendingDelete(null); }}>削除する</button></div></Modal>}
    </div>
  </Modal>;
}
