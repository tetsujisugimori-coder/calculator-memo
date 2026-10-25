"use client";

import { useEffect, useMemo, useState } from "react";
import { parseReportAudit, assessReportAudit, type AuditItem, type AuditAcquisition } from "../lib/formula-report-audit";
import { loadData, STORAGE_KEY } from "../lib/storage";
import { Modal } from "./Modal";
import { RecordInfo, BlockInfo } from "./EvidenceRecordDetails";
import { FormulaQuoteComparison, type QuoteSource } from "./FormulaQuoteComparison";
import { DifferenceSourceDialog } from "./FormulaDifferenceSources";

type Acquisition = AuditAcquisition & { fetchedAt: string; raw: string | null };
type Props = { body: string; formulaId: string; editing: boolean; disabled?: boolean; onNavigate: (start: number, end: number) => void };
const bodyLabels = { intact: "本文対応あり", edited: "本文編集・対応未保証", invalid: "未知・不正／対応不明", untracked: "追跡情報不足" };
const sourceLabels = { unverified: "未照合", matched: "保存記録と一致", changed: "保存記録の変更", missing: "記録・ブロック欠落", invalid: "未知・不正", unavailable: "取得失敗" };
const short = (value: string) => value.length > 24 ? `${value.slice(0, 24)}…` : value;

/** Mounted for one report/body/definition/link/original generation by the editor.
 * No original is read until the user explicitly requests one acquisition. */
export function FormulaReportAudit({ body, formulaId, editing, disabled, onNavigate }: Props) {
  const [open, setOpen] = useState(false);
  const [acquisition, setAcquisition] = useState<Acquisition>();
  const [stale, setStale] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState("all");
  const inventory = useMemo(() => parseReportAudit(body, formulaId), [body, formulaId]);
  const items = useMemo(() => assessReportAudit(inventory, stale ? undefined : acquisition), [inventory, acquisition, stale]);
  useEffect(() => {
    const observe = (event: StorageEvent) => {
      if ((event.key === STORAGE_KEY || event.key === null) && acquisition && event.newValue !== acquisition.raw) {
        setStale(true); setSelected(null);
      }
    };
    window.addEventListener("storage", observe);
    return () => window.removeEventListener("storage", observe);
  }, [acquisition]);
  const refresh = () => {
    setSelected(null);
    const loaded = loadData();
    const fetchedAt = new Date().toISOString();
    setAcquisition(loaded.status === "error"
      ? { notes: [], links: [], raw: loaded.raw, fetchedAt, error: "保存原本を取得・検証できません。欠落とは断定しません。", invalidData: loaded.reason !== "storage-unavailable" }
      : { notes: structuredClone(loaded.data.notes), links: structuredClone(loaded.data.formulaReports?.entries.find(report => report.formulaId === formulaId)?.evidence?.links ?? []), raw: loaded.status === "ok" ? loaded.raw : null, fetchedAt });
    setStale(false);
  };
  const selectedItem = items.find(item => item.key === selected);
  const source: QuoteSource = acquisition && !stale ? acquisition : { notes: [], fetchedAt: "未取得（未照合）", stale: true };
  const links = acquisition && !stale ? acquisition.links : [];
  const reviewCount = items.filter(item => item.needsReview).length;
  const visible = items.filter(item => filter === "all" || (filter === "review" ? item.needsReview : item.sources.some(source => source.status === "unverified")));
  return <section className="quote-tools report-audit-entry" aria-label="レポート全体の根拠点検">
    <button type="button" disabled={disabled} onClick={() => setOpen(true)}>根拠点検</button>
    {open && <Modal title="レポート全体の根拠点検" onClose={() => { setOpen(false); setSelected(null); }} wide>
      <section className="formula-report quote-tools report-audit">
        <p>{editing ? "編集中の本文が対象です。未保存の本文だけを一覧化し、保存本文とは混在させません。" : "現在表示しているレポート本文が対象です。"}</p>
        <p>出典一致・本文対応・利用者の明示確認・数学的正しさは別です。保存記録の変更だけで過去の引用が誤りとは判定しません。閲覧・照合・移動では保存も再計算も行いません。</p>
        <button type="button" onClick={refresh}>保存記録と照合</button>
        {!acquisition || stale ? <p role="status">未照合です。{stale ? "保存原本の更新を検知したため以前の結果と詳細を失効しました。" : "照合は明示操作で開始します。"}</p> : <p>原本の観測取得日時：{acquisition.fetchedAt}。保存日時・計算日時・利用者確認日時ではありません。</p>}
        {acquisition && !stale && acquisition.error && <p role="alert">{acquisition.invalidData ? "保存原本が未知・不正な形式です。" : "保存原本の取得に失敗しました。"}古い成功結果では代用しません。</p>}
        <p role="status">認識できた出現 {items.length}件／見直し対象 {reviewCount}件。分母は本文上の出現数です。複数の問題がある項目も見直し対象は1件として数えます。未照合も見直し対象です。</p>
        <p role={inventory.complete ? undefined : "alert"}>{inventory.reason}</p>
        {!items.length && <p>列挙できる根拠項目がありません。全件一致・点検完了を意味しません。</p>}
        <label>表示する状態<select value={filter} onChange={event => setFilter(event.target.value)}><option value="all">すべて</option><option value="review">見直し対象</option><option value="unverified">未照合の出典あり</option></select></label>
        <ol aria-label="本文順の根拠一覧">{visible.map(item => {
          const snapshot = item.quote?.snapshot ?? item.difference?.snapshot?.quote;
          const identifier = item.quote?.snapshot?.quoteId ?? item.difference?.snapshot?.differenceId;
          return <li key={item.key} value={item.order}>
            <h3>{item.order}. {item.kind === "quote" ? "固定引用" : "比較差分"}{identifier ? `：${short(identifier)}` : "：識別情報を検証できません"}</h3>
            <p>本文状態：{bodyLabels[item.bodyStatus]}</p><p>{item.reason}</p>
            {snapshot && <details><summary>識別情報の全文</summary><p>ID：{identifier}／メモID：{snapshot.memoId}／引用時記録ID：{snapshot.record.id}／ブロックID：{snapshot.blockId}</p>{item.difference?.snapshot && <p>比較先記録ID：{item.difference.snapshot.after.id}</p>}</details>}
            {!item.sources.length && <p>出典：追跡情報不足または未知・不正のため照合できません。</p>}
            {item.sources.map(state => <div key={state.side}><p>{state.side === "before" ? "比較元" : state.side === "after" ? "比較先" : "引用元"}：{sourceLabels[state.status]}</p><p>{state.reason}</p>{state.linked === false && <p>関連付け解除・保存済み根拠リンクなし（記録欠落とは別）。自動追加しません。</p>}</div>)}
            <div className="modal-actions"><button type="button" onClick={() => setSelected(item.key)}>根拠{item.order}の詳細</button><button type="button" disabled={!item.canNavigate} onClick={() => { setSelected(null); setOpen(false); onNavigate(item.start, item.end); }}>根拠{item.order}の本文へ移動</button></div>
            {!item.canNavigate && <p>本文との対応位置を安全に確定できないため移動できません。</p>}
          </li>;
        })}</ol>
        {items.length > 0 && !visible.length && <p>この絞り込みに該当する項目はありません。点検完了の判定ではありません。</p>}
        <p>原本の常時最新性・任意の外部書込みとの原子的整合性は保証しません。変更を検知したときは明示照合が必要です。</p>
        <button type="button" onClick={() => { setOpen(false); setSelected(null); }}>根拠点検を閉じる</button>
        {selectedItem && <AuditDetails item={selectedItem} body={body} formulaId={formulaId} source={source} links={links} onRefresh={refresh} onClose={() => setSelected(null)} />}
      </section>
    </Modal>}
  </section>;
}

function AuditDetails({ item, body, formulaId, source, links, onRefresh, onClose }: { item: AuditItem; body: string; formulaId: string; source: QuoteSource; links: AuditAcquisition['links']; onRefresh: () => void; onClose: () => void }) {
  const [comparing, setComparing] = useState(false);
  if (item.difference) {
    const assessment = { ...item.difference, before: item.sources.find(value => value.side === "before"), after: item.sources.find(value => value.side === "after") };
    // Existing detail vocabulary uses stale for an explicitly unverified source.
    const adapt = (value: typeof assessment.before) => value ? { ...value, status: value.status === "unverified" ? "stale" as const : value.status } : undefined;
    return <DifferenceSourceDialog assessment={{ ...assessment, before: adapt(assessment.before), after: adapt(assessment.after) }} source={source} links={links} onRefresh={onRefresh} onClose={onClose} />;
  }
  const snapshot = item.quote?.snapshot;
  const current = item.sources[0]?.record;
  return <Modal title="引用の根拠詳細" onClose={onClose} wide><section className="formula-report quote-tools saved-evidence">
    <p>本文状態：{bodyLabels[item.bodyStatus]}。{item.reason}</p>
    {snapshot ? <><h3>引用時点の固定記録</h3><p>引用ID：{snapshot.quoteId}／メモID：{snapshot.memoId}／ブロックID：{snapshot.blockId}／引用日時：{snapshot.citedAt}</p><p>本文編集後の文章そのものではなく、追跡情報に固定された記録です。</p><RecordInfo record={snapshot.record} />{snapshot.record.blocks.filter(block => block.blockId === snapshot.blockId).map(block => <BlockInfo key={block.blockId} block={block} record={snapshot.record} executionOrder={snapshot.record.blocks.indexOf(block) + 1} />)}
      <h3>現在取得した保存記録</h3><p>{item.sources[0]?.reason}</p>{current ? <><RecordInfo record={current} />{current.blocks.map((block, index) => <details key={block.blockId}><summary>ブロックID：{block.blockId}</summary><BlockInfo block={block} record={current} executionOrder={index + 1} /></details>)}</> : <p>現在記録は未取得または参照不能です。固定記録で代用しません。</p>}
      <button type="button" onClick={() => setComparing(true)}>引用時の記録と別の保存記録を比較</button></> : <p>追跡情報を検証できません。不正なsnapshotの詳細を推測して表示しません。</p>}
    <button type="button" onClick={onClose}>根拠一覧に戻る</button>
    {comparing && item.quote && <FormulaQuoteComparison quote={item.quote} formulaId={formulaId} body={body} links={links} source={source} onRefresh={onRefresh} onClose={() => setComparing(false)} />}
  </section></Modal>;
}
