"use client";

import { useId, useMemo, useState } from "react";
import type { FormulaReportEvidenceLink, Memo } from "../lib/types";
import { resolveReportEvidence, reportEvidenceLinkKey } from "../lib/formula-report-evidence";
import { createQuoteMarkdown, quoteCandidates, readQuoteAssessments, type QuoteSnapshot } from "../lib/formula-report-quotes";
import { RecordInfo, BlockInfo } from "./EvidenceRecordDetails";
import { MarkdownContent } from "./MarkdownContent";
import { FormulaQuoteComparison, type DifferenceInsertion } from "./FormulaQuoteComparison";
import { Modal } from "./Modal";

type Source = { notes: Memo[]; fetchedAt: string; error?: string; stale?: boolean };

/** Frozen saved-record selection. No evaluator or persistence writer is used. */
export function FormulaQuotePicker({ formulaId, links, source, disabled, onInsert, onClose }: {
  formulaId: string; links: FormulaReportEvidenceLink[]; source: Source; disabled: boolean;
  onInsert: (markdown: string) => void; onClose: () => void;
}) {
  const prefix = useId();
  const candidates = useMemo(() => quoteCandidates(source.notes, links), [source.notes, links]);
  const [choice, setChoice] = useState("");
  const [blockId, setBlockId] = useState("");
  const [prepared, setPrepared] = useState<{ markdown: string; snapshot: QuoteSnapshot } | null>(null);
  const [error, setError] = useState("");
  const candidate = candidates.find(item => reportEvidenceLinkKey(item.link) === choice);
  const record = candidate?.record;
  const block = record?.blocks.find(item => item.blockId === blockId);
  const blocked = disabled || !!source.error || !!source.stale;
  const prepare = () => {
    if (blocked || !candidate || !record || !block) return;
    try {
      const snapshot: QuoteSnapshot = { version: 1, quoteId: crypto.randomUUID(), formulaId, memoId: candidate.link.memoId, blockId, citedAt: new Date().toISOString(), record: structuredClone(record) };
      setPrepared({ markdown: createQuoteMarkdown(snapshot), snapshot }); setError("");
    } catch (cause) { setPrepared(null); setError(cause instanceof Error ? cause.message : "引用を作成できません。本文は変更していません。"); }
  };
  return <Modal title="計算根拠を引用" onClose={onClose} wide>
    <section className="formula-report quote-tools">
      <p>この登録式のレポートに保存済みの根拠リンクだけを候補にします。未保存の関連付けは、まずレポートを保存してください。式名・式文字列から対応を推測しません。</p>
      <p>取得日時：{source.fetchedAt}。成功した確定計算記録だけが保存される既存形式です。未確認・エラー・結果なし・状態不明の値を確定記録へ補完しません。</p>
      {blocked && <p role="alert">根拠未照合または操作不可です。保存済み根拠を再取得してください。{source.error}</p>}
      <p>選択欄の識別子は短縮表示です。選択すると全文・式・値を下に表示します。</p>
      <label htmlFor={`${prefix}-record`}>引用する保存済み計算記録</label>
      <select id={`${prefix}-record`} value={candidate ? choice : ""} disabled={blocked} onChange={event => { setChoice(event.target.value); setBlockId(""); setPrepared(null); }}><option value="">記録を選択</option>{candidates.map((item, index) => <option key={reportEvidenceLinkKey(item.link)} value={reportEvidenceLinkKey(item.link)}>記録{index + 1}：{item.link.recordId.slice(0, 8)}{item.link.recordId.length > 8 ? "…" : ""}</option>)}</select>
      {!candidates.length && <p>引用可能な関連記録はありません。保存済み根拠の関連付け・欠落・保護状態を確認してください。</p>}
      {record && <><p>選択したメモ：{candidate?.memoTitle}（メモID：{candidate?.link.memoId}）</p><RecordInfo record={record} /><label htmlFor={`${prefix}-block`}>引用するブロック</label><select id={`${prefix}-block`} value={block ? blockId : ""} disabled={blocked} onChange={event => { setBlockId(event.target.value); setPrepared(null); }}><option value="">ブロックを選択</option>{record.blocks.map((item, index) => <option key={item.blockId} value={item.blockId}>ブロック{index + 1}：{item.blockId.slice(0, 8)}{item.blockId.length > 8 ? "…" : ""}</option>)}</select></>}
      {block && record && <><p>選択ブロックID：{block.blockId}</p><BlockInfo block={block} executionOrder={record.blocks.indexOf(block) + 1} record={record} /></>}
      <button type="button" disabled={blocked || !block} onClick={prepare}>引用の挿入前プレビュー</button>
      {error && <p role="alert">{error}</p>}
      {prepared && <><p>引用時点の記録全体を追跡用に含めます。カーソル位置（範囲選択時は先頭）へ追加し、選択した文章も消しません。挿入だけでは保存・確認・再計算しません。</p><section aria-label="引用の挿入前プレビュー"><MarkdownContent content={prepared.markdown} /></section><button type="button" disabled={blocked} onClick={() => onInsert(prepared.markdown)}>この引用を本文へ挿入</button></>}
      <button type="button" onClick={onClose}>引用選択を取り消す</button>
    </section>
  </Modal>;
}

/** Shared read-only tracking for draft Markdown and saved detail, using only the supplied snapshot. */
export function FormulaQuoteStatus({ body, formulaId, links, source, onRefresh, insertion, onCompareOpen }: { body: string; formulaId: string; links: FormulaReportEvidenceLink[]; source: Source; onRefresh?: () => void; insertion?: DifferenceInsertion; onCompareOpen?: () => void }) {
  const assessments = useMemo(() => readQuoteAssessments(body, formulaId, source.notes, { error: source.error, stale: source.stale }), [body, formulaId, source.notes, source.error, source.stale]);
  const [opened, setOpened] = useState<number | null>(null);
  const [comparing, setComparing] = useState<number | null>(null);
  const selected = opened === null ? undefined : assessments[opened];
  const snapshot = selected?.snapshot;
  const current = snapshot && !source.error && !source.stale ? resolveReportEvidence(source.notes, [{ memoId: snapshot.memoId, recordId: snapshot.record.id }])[0] : undefined;
  const currentBlock = current?.record?.blocks.find(item => item.blockId === snapshot?.blockId);
  if (!assessments.length) return null;
  return <section className="quote-tools" aria-label="計算根拠引用の状態">
    <h4>計算根拠引用の状態（{assessments.length}件）</h4>
    <p>保存原本取得日時：{source.fetchedAt}。一致は取得時点の記録との比較だけで、数学的証明・真正性・利用者の明示確認ではありません。現在のメモ本文や新しく追加された別IDの記録は自動追跡しません。引用を自動更新しません。</p>
    <p>引用本文や追跡情報の編集・削除で照合不能になり得ます。追跡用フェンス全体を削除した通常テキストは自動認識できません。</p>
    <ol>{assessments.map((item, index) => <li key={`${item.start}-${index}`}>
      <p role="status">引用{index + 1}：{item.reason}</p>
      {item.snapshot && <><p className="quote-identity">引用ID：{item.snapshot.quoteId}　引用日時：{item.snapshot.citedAt}</p><p>メモID：{item.snapshot.memoId}　記録ID：{item.snapshot.record.id}　ブロックID：{item.snapshot.blockId}</p>
        {!links.some(link => link.memoId === item.snapshot!.memoId && link.recordId === item.snapshot!.record.id) && <p>現在の保存済み根拠リンクにはありません。引用時点の本文は保持しています。</p>}
        <button type="button" disabled={!!source.error || !!source.stale || resolveReportEvidence(source.notes, [{ memoId: item.snapshot.memoId, recordId: item.snapshot.record.id }])[0].status !== "available"} onClick={() => setOpened(index)}>引用元の保存記録・ブロックを開く</button>
        <button type="button" disabled={item.status === "invalid"} onClick={() => { onCompareOpen?.(); setComparing(index); }}>別の保存記録と比較</button></>}
    </li>)}</ol>
    {comparing !== null && assessments[comparing] && <FormulaQuoteComparison quote={assessments[comparing]} formulaId={formulaId} body={body} links={links} source={source} onRefresh={onRefresh} insertion={insertion} onClose={() => setComparing(null)} />}
    {opened !== null && <Modal title="引用元の保存記録・ブロック" onClose={() => setOpened(null)} wide><section className="formula-report quote-tools"><p>現在取得した保存原本です。引用時点の内容と一致するとは限りません。取得日時：{source.fetchedAt}</p>{current?.record && currentBlock ? <><RecordInfo record={current.record} /><p>ブロックID：{currentBlock.blockId}</p><BlockInfo block={currentBlock} executionOrder={current.record.blocks.indexOf(currentBlock) + 1} record={current.record} /></> : <p role="alert">対象ブロックが欠落・参照不能、または根拠未照合です。別の記録で代用しません。</p>}<button type="button" onClick={() => setOpened(null)}>引用元表示を閉じる</button></section></Modal>}
  </section>;
}
