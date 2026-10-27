"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { parseReportAudit, assessReportAudit, type AuditItem, type AuditAcquisition } from "../lib/formula-report-audit";
import { buildAuditMarkdown, bodyLabels, sourceLabels } from "../lib/formula-report-audit-export";
import { captureAuditComparison } from "../lib/formula-report-audit-comparison";
import { FormulaAuditRecordComparison, type ComparisonMaterialInsertion } from "./FormulaAuditRecordComparison";
import { createAuditRecordMarkdown } from "../lib/formula-report-audit-record";
import { downloadMarkdownReport } from "../lib/markdown-report";
import { loadData, STORAGE_KEY } from "../lib/storage";
import { Modal } from "./Modal";
import { RecordInfo, BlockInfo } from "./EvidenceRecordDetails";
import { FormulaQuoteComparison, type QuoteSource } from "./FormulaQuoteComparison";
import { DifferenceSourceDialog } from "./FormulaDifferenceSources";

type Acquisition = AuditAcquisition & { fetchedAt: string; raw: string | null };
export type AuditRecordInsertion = { prepare: (markdown: string) => { start: number; end: number; insert: () => void }; disabled?: boolean; onOpen: () => void };
type Props = { comparisonInsertion?: Omit<ComparisonMaterialInsertion, "onInserted">; insertion?: AuditRecordInsertion; body: string; formulaId: string; formulaTitle?: string; reportId?: string; reportTitle?: string; editing: boolean; unsavedChanges?: boolean; savedContextChanged?: boolean; disabled?: boolean; onNavigate: (start: number, end: number) => void };
const short = (value: string) => value.length > 24 ? `${value.slice(0, 24)}…` : value;

/** Mounted for one report/body/definition/link/original generation by the editor.
 * No original is read until the user explicitly requests one acquisition. */
export function FormulaReportAudit({ comparisonInsertion, insertion, body, formulaId, formulaTitle, reportId, reportTitle, editing, unsavedChanges, savedContextChanged, disabled, onNavigate }: Props) {
  const [recordPreview, setRecordPreview] = useState<{ markdown: string; body: string; start: number; end: number; epoch: number; insert: () => void } | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [recordError, setRecordError] = useState("");
  const [open, setOpen] = useState(false);
  const [comparisonGeneration, setComparisonGeneration] = useState(0);
  const [acquisition, setAcquisition] = useState<Acquisition>();
  const [stale, setStale] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [filter, setFilter] = useState("all");
  const [exportNotice, setExportNotice] = useState<{ text: string; failed: boolean } | null>(null);
  const [manualCopy, setManualCopy] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  // A synchronous token invalidates async completion before a queued React render.
  const exportEpoch = useRef(0);
  const staleRef = useRef(false);
  const heldContextRef = useRef(false);
  const [heldContextUncertain, setHeldContextUncertain] = useState(false);
  const bodyContextUncertain = !!savedContextChanged || heldContextUncertain;
  const exportBusy = useRef(false);
  useLayoutEffect(() => () => { exportEpoch.current += 1; }, []);
  const invalidateExport = () => {
    exportEpoch.current += 1; exportBusy.current = false;
    setExporting(false); setExportNotice(null); setManualCopy(null); setRecordPreview(null); setPreparing(false);
  };
  const [lastSavedContext, setLastSavedContext] = useState(savedContextChanged);
  if (lastSavedContext !== savedContextChanged) {
    setLastSavedContext(savedContextChanged);
    setExporting(false); setExportNotice(null); setManualCopy(null); setRecordPreview(null); setPreparing(false);
  }
  useLayoutEffect(() => {
    // Parent storage protection may change without a browser storage event
    // (for example, a failed write confirmation). Never revive old copy UI.
    exportEpoch.current += 1; exportBusy.current = false;
  }, [savedContextChanged]);
  const closeAudit = () => { invalidateExport(); setOpen(false); setSelected(null); };
  const inventory = useMemo(() => parseReportAudit(body, formulaId), [body, formulaId]);
  const items = useMemo(() => assessReportAudit(inventory, stale ? undefined : acquisition), [inventory, acquisition, stale]);
  useEffect(() => {
    const observe = (event: StorageEvent) => {
      if ((event.key === STORAGE_KEY || event.key === null) && (!acquisition || event.newValue !== acquisition.raw)) {
        exportEpoch.current += 1; exportBusy.current = false;
        setExporting(false); setExportNotice(null); setManualCopy(null); setRecordPreview(null); setPreparing(false);
        setComparisonGeneration(value => value + 1);
        staleRef.current = true; setStale(true); setSelected(null);
        heldContextRef.current = true; setHeldContextUncertain(true);
      }
    };
    window.addEventListener("storage", observe);
    return () => window.removeEventListener("storage", observe);
  }, [acquisition]);
  const refresh = () => {
    setComparisonGeneration(value => value + 1);
    invalidateExport();
    setSelected(null);
    const loaded = loadData();
    const fetchedAt = new Date().toISOString();
    setAcquisition(loaded.status === "error"
      ? { notes: [], links: [], raw: loaded.raw, fetchedAt, error: "保存原本を取得・検証できません。欠落とは断定しません。", invalidData: loaded.reason !== "storage-unavailable" }
      : { notes: structuredClone(loaded.data.notes), links: structuredClone(loaded.data.formulaReports?.entries.find(report => report.formulaId === formulaId)?.evidence?.links ?? []), raw: loaded.status === "ok" ? loaded.raw : null, fetchedAt });
    staleRef.current = false; setStale(false);
  };
  const generateMarkdown = (record: boolean, exportedAt = new Date().toISOString()) => {
    return buildAuditMarkdown({ body, formulaId, formulaTitle, reportId, reportTitle, editing, unsavedChanges, savedContextChanged: bodyContextUncertain || heldContextRef.current,
        inventory, items, state: staleRef.current || stale ? "stale" : acquisition ? "checked" : "unverified",
        fetchedAt: !staleRef.current && !stale ? acquisition?.fetchedAt : undefined,
        acquisitionError: !staleRef.current && !stale ? acquisition?.error : undefined, exportedAt, destination: record ? "record" : "file" });
  };
  const prepareRecord = async () => {
    if (!insertion || preparing) return;
    invalidateExport(); setRecordError(""); setPreparing(true);
    const epoch = exportEpoch.current;
    try {
      const generatedAt = new Date().toISOString();
      const output = generateMarkdown(true, generatedAt);
      const comparison = captureAuditComparison(inventory, items, staleRef.current || stale ? "stale" : acquisition ? "checked" : "unverified", !staleRef.current && !stale ? acquisition?.fetchedAt : undefined, !staleRef.current && !stale && acquisition ? acquisition.error ? acquisition.invalidData ? "invalid" : "unavailable" : "ok" : undefined, { editing, unsavedChanges: unsavedChanges ?? editing, savedContextChanged: bodyContextUncertain || heldContextRef.current });
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body));
      if (exportEpoch.current !== epoch) return;
      const bodySha256 = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, "0")).join("");
      const markdown = createAuditRecordMarkdown(output.markdown, { recordId: crypto.randomUUID(), formulaId, reportId: reportId ?? "未登録", generatedAt, bodyLength: body.length, bodySha256, comparison });
      const prepared = insertion.prepare(markdown);
      setRecordPreview({ ...prepared, markdown, body, epoch });
    } catch (cause) {
      if (exportEpoch.current === epoch) setRecordError(cause instanceof Error ? cause.message : "プレビューを生成できません。本文は保持しています。");
    } finally { if (exportEpoch.current === epoch) setPreparing(false); }
  };
  const exportAudit = async (download: boolean) => {
    if (exportBusy.current) return;
    const epoch = ++exportEpoch.current;
    exportBusy.current = true; setExporting(true); setExportNotice(null); setManualCopy(null);
    let markdown: string | undefined;
    try {
      // Synchronous generation freezes one render's body, assessment and acquisition.
      const output = generateMarkdown(false);
      markdown = output.markdown;
      if (download) downloadMarkdownReport(output);
      else await navigator.clipboard.writeText(output.markdown);
      if (exportEpoch.current !== epoch) return;
      setExportNotice({ text: download ? "点検結果のダウンロードを要求しました。保存完了はブラウザで確認してください。" : "点検結果をコピーしました。出力開始時点の記録です。", failed: false });
    } catch (cause) {
      if (exportEpoch.current !== epoch) return;
      setExportNotice({ text: `${download ? "点検結果を出力できませんでした。" : "点検結果のコピーに失敗しました。"}${cause instanceof Error ? cause.message : "出力処理を完了できません。"}${markdown ? "下の全文欄から手動でコピーできます。" : "部分的な点検結果は出力していません。"}`, failed: true });
      setManualCopy(markdown ?? null);
    } finally {
      if (exportEpoch.current === epoch) { exportBusy.current = false; setExporting(false); }
    }
  };
  const selectedItem = items.find(item => item.key === selected);
  const source: QuoteSource = acquisition && !stale ? acquisition : { notes: [], fetchedAt: "未取得（未照合）", stale: true };
  const links = acquisition && !stale ? acquisition.links : [];
  const reviewCount = items.filter(item => item.needsReview).length;
  const visible = items.filter(item => filter === "all" || (filter === "review" ? item.needsReview : item.sources.some(source => source.status === "unverified")));
  return <section className="quote-tools report-audit-entry" aria-label="レポート全体の根拠点検">
    <button type="button" disabled={disabled} onClick={() => { insertion?.onOpen(); setOpen(true); }}>根拠点検</button>
    {open && <Modal title="レポート全体の根拠点検" onClose={closeAudit} wide>
      <section className="formula-report quote-tools report-audit">
        <p>{editing ? "編集中の本文が対象です。未保存の本文だけを一覧化し、保存本文とは混在させません。" : "現在表示しているレポート本文が対象です。"}</p>
        {bodyContextUncertain && <p role="alert">出力対象は画面に保持した本文です。現在の保存本文との一致は未確認です。保存領域の更新等を検知していますが、対象レポートの変更・削除は断定しません。出典の再照合とは別の制約です。</p>}
        {unsavedChanges && !editing && !bodyContextUncertain && <p>本文は保存済みの内容ですが、タイトル・関連付けなどに未保存変更があります。</p>}
        <p>出典一致・本文対応・利用者の明示確認・数学的正しさは別です。保存記録の変更だけで過去の引用が誤りとは判定しません。閲覧・照合・移動では保存も再計算も行いません。</p>
        <FormulaAuditRecordComparison insertion={comparisonInsertion ? { ...comparisonInsertion, onInserted: closeAudit } : undefined} body={body} formulaId={formulaId} reportId={reportId} savedContextChanged={bodyContextUncertain} generation={comparisonGeneration} onNavigate={(start, end) => { closeAudit(); onNavigate(start, end); }} />
        <button type="button" onClick={refresh}>保存記録と照合</button>
        {!acquisition || stale ? <p role="status">未照合です。{stale ? "保存原本の更新を検知したため以前の結果と詳細を失効しました。" : "照合は明示操作で開始します。"}</p> : <p>原本の観測取得日時：{acquisition.fetchedAt}。保存日時・計算日時・利用者確認日時ではありません。</p>}
        {acquisition && !stale && acquisition.error && <p role="alert">{acquisition.invalidData ? "保存原本が未知・不正な形式です。" : "保存原本の取得に失敗しました。"}古い成功結果では代用しません。</p>}
        <p role="status">認識できた出現 {items.length}件／見直し対象 {reviewCount}件。分母は本文上の出現数です。複数の問題がある項目も見直し対象は1件として数えます。未照合も見直し対象です。</p>
        <p role={inventory.complete ? undefined : "alert"}>{inventory.reason}</p>
        {!items.length && <p>列挙できる根拠項目がありません。全件一致・点検完了を意味しません。</p>}
        <p>コピー・.md出力は絞り込みや詳細選択に関係なく、認識できた全項目を本文順に出力します。本文・snapshot全文は含めず、元データの復元用ではありません。ファイル名のみ安全化・短縮し、出力内のタイトル・IDは省略しません。</p>
        <div className="modal-actions"><button type="button" disabled={exporting} onClick={() => void exportAudit(false)}>点検結果をコピー</button><button type="button" disabled={exporting} onClick={() => void exportAudit(true)}>点検結果を.md出力</button></div>
        {insertion && <button type="button" disabled={insertion.disabled} aria-disabled={preparing || undefined} onClick={event => { event.currentTarget.focus(); void prepareRecord(); }}>レポートへ挿入</button>}
        {preparing && <p role="status">対象本文と固定記録のプレビューを準備しています。</p>}
        {recordError && <p role="alert">{recordError}</p>}
        {recordPreview && <Modal title="点検結果の固定記録を挿入" onClose={() => setRecordPreview(null)} wide><section className="formula-report quote-tools">
          <p>登録式：{formulaTitle}（{formulaId}）／レポート：{reportTitle}（{reportId}）</p>
          <p>挿入位置：{recordPreview.start}（0始まりUTF-16、textareaの改行正規化後）。選択範囲 {recordPreview.start}〜{recordPreview.end} の文章は保持します。固定記録は自動更新されず、保存・確認・証明とは別です。</p>
          <label htmlFor="audit-record-target-body">点検対象本文（挿入前の全文）</label><textarea id="audit-record-target-body" readOnly className="code-input" rows={6} value={recordPreview.body} />
          <label htmlFor="audit-record-markdown">挿入するMarkdown全文</label><textarea id="audit-record-markdown" readOnly className="code-input" rows={12} value={recordPreview.markdown} />
          <button type="button" onClick={() => { try { if (exportEpoch.current !== recordPreview.epoch) throw new Error("プレビューは失効しました。生成し直してください。"); recordPreview.insert(); closeAudit(); } catch (cause) { setRecordPreview(null); setRecordError(cause instanceof Error ? cause.message : "挿入できません。本文は保持しています。"); } }}>固定記録を本文へ挿入</button>
          <button type="button" onClick={() => setRecordPreview(null)}>挿入をやめる</button>
        </section></Modal>}
        {exporting && <p role="status">出力開始時点の点検結果をコピーしています。対象変更後の完了通知は表示しません。</p>}
        {exportNotice && <p role={exportNotice.failed ? "alert" : "status"}>{exportNotice.text}</p>}
        {manualCopy !== null && <div><label htmlFor="audit-export-manual-copy">点検結果Markdown全文（手動コピー用）</label><textarea id="audit-export-manual-copy" readOnly className="code-input" rows={10} value={manualCopy} onFocus={event => event.target.select()} /></div>}
        <label>表示する状態<select aria-label="表示する状態" value={filter} onChange={event => setFilter(event.target.value)}><option value="all">すべて</option><option value="review">見直し対象</option><option value="unverified">未照合の出典あり</option></select></label>
        <ol aria-label="本文順の根拠一覧">{visible.map(item => {
          const snapshot = item.quote?.snapshot ?? item.difference?.snapshot?.quote;
          const identifier = item.quote?.snapshot?.quoteId ?? item.difference?.snapshot?.differenceId;
          return <li key={item.key} value={item.order}>
            <h3>{item.order}. {item.kind === "quote" ? "固定引用" : "比較差分"}{identifier ? `：${short(identifier)}` : "：識別情報を検証できません"}</h3>
            <p>本文状態：{bodyLabels[item.bodyStatus]}</p><p>{item.reason}</p>
            {snapshot && <details><summary>識別情報の全文</summary><p>ID：{identifier}／メモID：{snapshot.memoId}／引用時記録ID：{snapshot.record.id}／ブロックID：{snapshot.blockId}</p>{item.difference?.snapshot && <p>比較先記録ID：{item.difference.snapshot.after.id}</p>}</details>}
            {!item.sources.length && <p>出典：追跡情報不足または未知・不正のため照合できません。</p>}
            {item.sources.map(state => <div key={state.side}><p>{state.side === "before" ? "比較元" : state.side === "after" ? "比較先" : "引用元"}：{sourceLabels[state.status]}</p><p>{state.reason}</p>{state.linked === false && <p>関連付け解除・保存済み根拠リンクなし（記録欠落とは別）。自動追加しません。</p>}</div>)}
            <div className="modal-actions"><button type="button" onClick={() => setSelected(item.key)}>根拠{item.order}の詳細</button><button type="button" disabled={!item.canNavigate} onClick={() => { closeAudit(); onNavigate(item.start, item.end); }}>根拠{item.order}の本文へ移動</button></div>
            {!item.canNavigate && <p>本文との対応位置を安全に確定できないため移動できません。</p>}
          </li>;
        })}</ol>
        {items.length > 0 && !visible.length && <p>この絞り込みに該当する項目はありません。点検完了の判定ではありません。</p>}
        <p>原本の常時最新性・任意の外部書込みとの原子的整合性は保証しません。変更を検知したときは明示照合が必要です。</p>
        <button type="button" onClick={closeAudit}>根拠点検を閉じる</button>
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
