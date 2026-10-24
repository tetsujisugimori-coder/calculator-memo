"use client";

import { useId, useMemo, useState } from "react";
import type { FormulaReportEvidenceLink, Memo } from "../lib/types";
import type { QuoteAssessment } from "../lib/formula-report-quotes";
import { quoteComparisonTargets, compareQuoteToRecord } from "../lib/formula-quote-comparison";
import { reportEvidenceLinkKey } from "../lib/formula-report-evidence";
import { evidenceRowLabel } from "../lib/evidence-comparison";
import { BlockInfo, RecordInfo } from "./EvidenceRecordDetails";
import { MarkdownContent } from "./MarkdownContent";
import { Modal } from "./Modal";

export type QuoteSource = { notes: Memo[]; fetchedAt: string; error?: string; stale?: boolean };
export type DifferenceInsertion = { key: string; reportId: string; title: string; disabled: boolean; prepare: (quote: QuoteAssessment, targetKey: string) => { markdown: string; start: number; end: number; insert: () => void } };
export function FormulaQuoteComparison({ quote, formulaId, body, links, source, onRefresh, onClose, insertion }: {
  quote: QuoteAssessment; formulaId: string; body: string; links: FormulaReportEvidenceLink[]; source: QuoteSource;
  onRefresh?: () => void; onClose: () => void; insertion?: DifferenceInsertion;
}) {
  const id = useId();
  const [selection, setSelection] = useState<{ notes: Memo[]; links: FormulaReportEvidenceLink[]; body: string; fetchedAt: string; quoteKey: string; choice: string; blockId: string } | null>(null);
  const [invalidated, setInvalidated] = useState(false);
  const [prepared, setPrepared] = useState<{ selection: typeof selection; key: string; plan: ReturnType<DifferenceInsertion["prepare"]> } | null>(null);
  const [insertionError, setInsertionError] = useState("");
  const quoteKey = JSON.stringify([formulaId, quote.start, quote.end, quote.snapshot?.quoteId]);
  const blocked = !!source.error || !!source.stale;
  const active = !blocked && selection?.notes === source.notes && selection.links === links && selection.body === body && selection.fetchedAt === source.fetchedAt && selection.quoteKey === quoteKey;
  if (selection && !active) { setSelection(null); setInvalidated(true); }
  const validPreview = !!prepared && active && prepared.selection === selection && !!insertion && !insertion.disabled && prepared.key === insertion.key;
  if (prepared && !validPreview) { setPrepared(null); setInsertionError("挿入条件が変わったためプレビューを破棄しました。比較対象を確認して生成し直してください。"); }
  const choice = active ? selection.choice : "";
  const result = useMemo(() => {
    if (blocked) return { targets: [], comparison: null, error: source.error ? '原本取得失敗：比較先を取得できません。欠落とは断定しません。' : '根拠未照合：原本の更新を検知しました。明示再取得が必要です。' };
    try {
      const targets = quoteComparisonTargets(quote, formulaId, source.notes, links);
      if (!choice) return { targets, comparison: null, error: "" };
      try { return { targets, comparison: compareQuoteToRecord(quote, formulaId, source.notes, links, choice), error: "" }; }
      catch (cause) { return { targets, comparison: null, error: cause instanceof Error ? cause.message : '比較不能です。' }; }
    } catch (cause) { return { targets: [], comparison: null, error: cause instanceof Error ? cause.message : '比較不能です。' }; }
  }, [blocked, source.error, source.notes, quote, formulaId, links, choice]);
  const selectedTarget = result.targets.find(target => reportEvidenceLinkKey(target.link) === choice);
  const snapshot = quote.snapshot;
  const comparison = result.comparison;
  const selectedRow = comparison?.rows.find(row => row.blockId === (active ? selection.blockId : snapshot?.blockId));
  return <Modal title="引用時の記録と別の保存記録を比較" onClose={onClose} wide><section className="formula-report quote-tools saved-evidence">
    <p>比較元は追跡情報に保存された引用時の記録です。現在取得した元記録では置き換えません。比較先はこの登録式の保存済み根拠リンクから明示選択します。</p>
    <p>同じメモID内のブロックIDだけで対応付けます。別メモの同名・同式は同一ブロックの根拠にならないため比較しません。日時順での自動選択・再計算・保存・確認履歴の追加は行いません。</p>
    <p>差分は観測結果であり、真の原因・編集意図・説明の誤り・数学的正しさを判定しません。追加・削除は選択した記録間だけの意味です。</p>
    <p>保存原本取得日時：{source.fetchedAt}。記録日時は保存文字列であり、日時順に並べ替えません。保存要求時刻は保存完了時刻ではありません。</p>
    {quote.status === 'edited' && <p role="status">引用本文は編集されています。比較対象は追跡情報に保存された引用時の記録であり、編集後の文章そのものではありません。</p>}
    {snapshot && <section aria-label="引用時の記録"><h3>引用時</h3><p>メモID：{snapshot.memoId}　引用ブロックID：{snapshot.blockId}</p><RecordInfo record={snapshot.record} /></section>}
    {onRefresh && <button type="button" onClick={() => { setSelection(null); setInvalidated(true); onRefresh(); }}>比較用の保存原本を再取得</button>}
    {result.error && <p role="alert">{result.error}</p>}
    {!blocked && !result.error && !result.targets.length && <p>同じメモIDの保存済み根拠リンクに、比較できる別の記録がありません。リンク追加や記録作成は自動では行いません。</p>}
    <label htmlFor={id}>比較先の保存記録</label><select id={id} aria-label="比較先の保存記録" value={choice} disabled={blocked || !result.targets.length} onChange={event => { setInvalidated(false); setSelection({ notes: source.notes, links, body, fetchedAt: source.fetchedAt, quoteKey, choice: event.target.value, blockId: snapshot?.blockId ?? '' }); }}><option value="">記録を選択</option>{result.targets.map((target, index) => <option key={reportEvidenceLinkKey(target.link)} value={reportEvidenceLinkKey(target.link)}>記録{index + 1}：{target.link.recordId.slice(0, 8)}{target.link.recordId.length > 8 ? '…' : ''}{target.status === 'missing' ? '（欠落）' : target.status === 'invalid' ? '（比較不能）' : ''}</option>)}</select>
    {selectedTarget && <p>比較先のメモID：{selectedTarget.link.memoId}　記録ID：{selectedTarget.link.recordId}</p>}
    {invalidated && !blocked && <p role="status">取得内容または引用が変わったため、比較先の選択を解除しました。選択し直してください。</p>}
    {comparison && <section aria-label="引用時と比較先の差分"><h3>比較先</h3><p>メモID：{snapshot!.memoId}</p><RecordInfo record={comparison.after} />
      <p>変更 {comparison.counts.changed} / 追加 {comparison.counts.added} / 削除 {comparison.counts.removed} / 同一（比較対象項目に変更なし）{comparison.counts.unchanged}</p>
      {comparison.warnings.map(warning => <p key={warning}>{warning}</p>)}
      <label htmlFor={`${id}-block`}>詳細を確認するブロック</label><select id={`${id}-block`} value={selectedRow?.blockId ?? ''} onChange={event => setSelection(current => current && ({ ...current, blockId: event.target.value }))}>{comparison.rows.map((row, index) => <option key={row.blockId} value={row.blockId}>ブロック{index + 1}：{row.blockId.slice(0, 8)}{row.blockId.length > 8 ? '…' : ''}</option>)}</select>
      <ul>{comparison.rows.map(row => <li key={row.blockId}>ブロックID：{row.blockId} / {evidenceRowLabel(row)}</li>)}</ul>
      {selectedRow && <section aria-label="選択ブロックの差分"><h4>ブロックID：{selectedRow.blockId}</h4><p>{evidenceRowLabel(selectedRow)}</p><div className="evidence-pair"><section><h4>引用時</h4>{selectedRow.before ? <BlockInfo {...selectedRow.before} record={comparison.before} /> : <p>引用時の記録には存在しません。</p>}</section><section><h4>比較先</h4>{selectedRow.after ? <BlockInfo {...selectedRow.after} record={comparison.after} /> : <p>比較先の記録には存在しません。</p>}</section></div></section>}
    </section>}
    {insertion && <button type="button" disabled={!comparison || blocked || insertion.disabled} onClick={() => {
      try { const plan = insertion.prepare(quote, choice); setPrepared({ selection, key: insertion.key, plan }); setInsertionError(""); }
      catch (cause) { setPrepared(null); setInsertionError(cause instanceof Error ? cause.message : "差分文を準備できません。本文は保持しています。"); }
    }}>差分をレポートに挿入</button>}
    {insertionError && <p role="alert">{insertionError}</p>}
    {validPreview && prepared && insertion && <Modal title="差分の挿入前プレビュー" onClose={() => setPrepared(null)} wide>
      <section className="formula-report quote-tools">
        <p>挿入先：{insertion.title}（レポートID：{insertion.reportId}）</p>
        <p>本文の位置 {prepared.plan.start}（0始まり）へ追加します。選択範囲 {prepared.plan.start}〜{prepared.plan.end} の文章も保持し、置換・削除しません。編集欄が閉じている場合は末尾です。</p>
        <p>以下が追加予定のMarkdown全文です。既存引用・追跡情報は更新しません。保存と確認は別操作です。差分文は新しい本文編集であり、数学的証明ではありません。</p>
        <section aria-label="差分の挿入前プレビュー"><MarkdownContent content={prepared.plan.markdown} /></section>
        <details><summary>追加予定のMarkdown原文全文</summary><pre>{prepared.plan.markdown}</pre></details>
        <button type="button" onClick={() => { try { prepared.plan.insert(); setPrepared(null); onClose(); } catch (cause) { setPrepared(null); setInsertionError(cause instanceof Error ? cause.message : "挿入できませんでした。本文は保持しています。"); } }}>この差分を本文へ挿入</button>
        <button type="button" onClick={() => setPrepared(null)}>差分挿入をキャンセル</button>
      </section>
    </Modal>}
    <button type="button" onClick={onClose}>比較表示を閉じる</button>
  </section></Modal>;
}
