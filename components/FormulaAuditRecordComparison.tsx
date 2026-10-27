"use client";

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { scanAuditRecordEnvelopes, type AuditRecordEnvelope, type AuditRecordMetadata } from "../lib/formula-report-audit-record";
import { compareAuditRecords, validateAuditComparisonSnapshot, type AuditComparisonItem, type AuditRecordComparison } from "../lib/formula-report-audit-comparison";
import { EVIDENCE_CHANGE_LABELS, type EvidenceComparison } from "../lib/evidence-comparison";
import { bodyLabels, sourceLabels } from "../lib/formula-report-audit-export";
import { STORAGE_KEY } from "../lib/storage";
import { RecordInfo, BlockInfo } from "./EvidenceRecordDetails";

import { buildAuditComparisonMarkdown, formatAuditComparisonStates as states } from "../lib/formula-report-audit-comparison-export";
import { createAuditComparisonRecordMarkdown } from "../lib/formula-report-audit-comparison-record";
import { downloadMarkdownReport, type MarkdownReport } from "../lib/markdown-report";

const sideName = (value: string) => value === "quote" ? "引用元" : value === "before" ? "比較差分の比較元" : "比較差分の比較先";
const checkedLabel = (value?: string) => value === "checked" ? "当時は照合操作を実行（取得成否は別）" : value === "stale" ? "当時の照合結果失効" : value === "unverified" ? "当時は未照合" : "記録なし";
const entryKey = (entry: AuditRecordEnvelope) => `${entry.start}:${entry.end}`;
export type ComparisonMaterialInsertion = { key: string; disabled: boolean; title: string; prepare: (markdown: string, materialId: string) => { start: number; end: number; isCurrent: () => boolean; insert: () => void }; onInserted: () => void };
type Props = { insertion?: ComparisonMaterialInsertion; body: string; formulaId: string; reportId?: string; savedContextChanged?: boolean; generation?: string | number; onNavigate: (start: number, end: number) => void };
type Selection = { token: number; context: string; epoch: number; a: string; b: string; result: AuditRecordComparison | null; error: string };

/** Read-only historical comparison. No persistence/retrieval, and no prose parser. */
export function FormulaAuditRecordComparison({ insertion, body, formulaId, reportId, savedContextChanged, generation, onNavigate }: Props) {
  const id = useId();
  const entries = useMemo(() => scanAuditRecordEnvelopes(body), [body]);
  const context = JSON.stringify([body, formulaId, reportId, savedContextChanged, generation]);
  const epoch = useRef(0);
  const actionEpoch = useRef(0);
  const [revision, setRevision] = useState(0);
  const [external, setExternal] = useState(false);
  const [invalidated, setInvalidated] = useState(false);
  const [selection, setSelection] = useState<Selection | null>(null);
  const current = useRef({ context, selection, epoch: revision });
  useLayoutEffect(() => { current.current = { context, selection, epoch: revision }; }, [context, selection, revision]);
  const active = selection?.context === context && selection.epoch === revision ? selection : null;
  if (selection && !active) { setSelection(null); setInvalidated(true); }
  useEffect(() => {
    const observe = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY && event.key !== null) return;
      actionEpoch.current += 1; epoch.current += 1; setRevision(epoch.current); setSelection(null); setExternal(true); setInvalidated(true);
    };
    window.addEventListener("storage", observe);
    // Comparison is synchronous; cleanup has no pending completion to invalidate.
    // Incrementing only the ref here would desynchronize React StrictMode replay.
    return () => window.removeEventListener("storage", observe);
  }, []);
  const reason = (entry: AuditRecordEnvelope) => {
    if (entry.status !== "complete" || !entry.closed || !entry.metadata) return entry.reason;
    if (entry.metadata.formulaId !== formulaId || entry.metadata.reportId !== reportId) return "対象登録式・レポートが異なるため比較対象外です。";
    if (!entry.metadata.comparison) return "旧記録：式・入力・参照・内部結果などの構造化情報不足のため比較不能です。文章から推測復元しません。";
    if (!validateAuditComparisonSnapshot(entry.metadata.comparison)) return "記録形式不明・不正な比較情報のため比較不能です。";
    return "比較対象として選択できます。形式の検証は真正性や数学的正しさの保証ではありません。";
  };
  const eligible = (entry: AuditRecordEnvelope) => entry.status === "complete" && entry.closed && !!entry.metadata && entry.metadata.formulaId === formulaId && entry.metadata.reportId === reportId && !!entry.metadata.comparison && validateAuditComparisonSnapshot(entry.metadata.comparison);
  const select = (key: "a" | "b", value: string) => { actionEpoch.current += 1; setInvalidated(false); setSelection({ token: actionEpoch.current, context, epoch: epoch.current, a: active?.a ?? "", b: active?.b ?? "", result: null, error: "", [key]: value }); };
  const compare = () => {
    actionEpoch.current += 1;
    if (!active || active.epoch !== epoch.current) { setInvalidated(true); return; }
    const a = entries.find(entry => entryKey(entry) === active.a), b = entries.find(entry => entryKey(entry) === active.b);
    if (!a || !b || !eligible(a) || !eligible(b)) { setSelection({ ...active, token: actionEpoch.current, result: null, error: "選択した記録を検証できません。対象を選び直してください。" }); return; }
    try {
      const input = (entry: AuditRecordEnvelope) => ({ ...entry.metadata!, snapshot: entry.metadata!.comparison });
      setSelection({ ...active, token: actionEpoch.current, result: compareAuditRecords(input(a), input(b)), error: "" });
    } catch { setSelection({ ...active, token: actionEpoch.current, result: null, error: "比較処理を完了できません。元の記録・本文は保持しています。" }); }
  };
  return <section className="quote-tools saved-evidence" aria-label="固定点検記録の2時点比較">
    <h3>固定点検記録の2時点比較</h3>
    <p>現在画面に保持している本文内の過去記録を比較します。表示順は本文順で、日時順ではありません。A→Bは明示した順序です。保存原本の再取得・保存・再計算・確認履歴の追加は行いません。</p>
    {(savedContextChanged || external) && <p role="alert">保持本文と現在の保存本文との一致は未確認です。保存領域の通知だけでは対象レポートの変更・削除を断定しません。過去記録同士の比較と現在の出典照合は別です。</p>}
    <p>比較対象は記録内の構造化資料です。後から手編集された説明文の文意は判定しません。記録間の差異がないことは数学的正しさ・証明・真正性の保証ではありません。変更理由は記録されていなければ理由不明です。</p>
    {!entries.length && <p>認識できる固定点検記録はありません。マーカーが除去された文章の由来は推測しません。</p>}
    <ol aria-label="固定点検記録一覧">{entries.map((entry, index) => <li key={entryKey(entry)}>
      <p>本文中 {index + 1}：記録ID {entry.metadata?.recordId ?? "識別不能"}</p>
      <p>記録日時（記録内のタイムゾーン表記）：{entry.metadata?.generatedAt ?? "日時不明"}</p>
      <p>登録式ID：{entry.metadata?.formulaId ?? "不明"}／レポートID：{entry.metadata?.reportId ?? "不明"}</p>
      <p>{reason(entry)}</p>
      {entry.metadata?.comparison && <>
        <p>{checkedLabel(entry.metadata.comparison.state)}。原本取得・形式検証：{entry.metadata.comparison.acquisitionStatus === "ok" ? "成功" : entry.metadata.comparison.acquisitionStatus === "unavailable" ? "取得不能" : entry.metadata.comparison.acquisitionStatus === "invalid" ? "未知・不正な形式" : "成否未記録（成功とは推測しません）"}。</p>
        <p>{entry.metadata.comparison.acquisitionStatus === "ok" ? "原本取得日時" : "原本取得試行日時"}（UTC）：{entry.metadata.comparison.fetchedAt ?? "記録なし（生成日時では代用しません）"}。集計：{entry.metadata.comparison.complete ? "認識できた範囲で完全" : "不完全"}。</p>
        {entry.metadata.comparison.bodyContext ? <p>当時の対象：{entry.metadata.comparison.bodyContext.editing ? "編集中の本文" : "画面に保持した本文"}。レポートの未保存変更（本文以外も含む）：{entry.metadata.comparison.bodyContext.unsavedChanges ? "あり" : "なし"}。{entry.metadata.comparison.bodyContext.savedContextChanged ? "当時、保持本文と保存本文の一致は未確認。出典照合とは別の制約です。" : "保存通知等による一致未確認の記録はありません。外部保存との原子的な一致を保証するものではありません。"}</p> : <p>当時の保持本文・未保存編集の状態は未記録です。保存本文との一致を推測しません。</p>}
      </>}
      <button type="button" disabled={entry.status !== "complete" || !entry.metadata || entry.metadata.formulaId !== formulaId || entry.metadata.reportId !== reportId} onClick={() => {
        const current = scanAuditRecordEnvelopes(body).find(value => entryKey(value) === entryKey(entry));
        if (current?.status === "complete" && current.metadata?.recordId === entry.metadata?.recordId) onNavigate(current.start, current.end);
      }}>点検記録{index + 1}の本文へ移動</button>
      {entry.status !== "complete" && <p>位置・対応を安全に確認できないため移動できません。</p>}
    </li>)}</ol>
    <label htmlFor={`${id}-a`}>比較元A</label><select id={`${id}-a`} value={active?.a ?? ""} onChange={event => select("a", event.target.value)}><option value="">明示的に選択してください</option>{entries.map((entry, index) => <option key={entryKey(entry)} value={entryKey(entry)} disabled={!eligible(entry)}>本文中{index + 1}：{entry.metadata?.recordId ?? "識別不能"}（{entry.metadata?.generatedAt ?? "日時不明"}）{eligible(entry) ? "" : "・比較対象外"}</option>)}</select>
    <label htmlFor={`${id}-b`}>比較先B</label><select id={`${id}-b`} value={active?.b ?? ""} onChange={event => select("b", event.target.value)}><option value="">明示的に選択してください</option>{entries.map((entry, index) => <option key={entryKey(entry)} value={entryKey(entry)} disabled={!eligible(entry)}>本文中{index + 1}：{entry.metadata?.recordId ?? "識別不能"}（{entry.metadata?.generatedAt ?? "日時不明"}）{eligible(entry) ? "" : "・比較対象外"}</option>)}</select>
    <div className="modal-actions"><button type="button" disabled={!active?.a && !active?.b} onClick={() => { actionEpoch.current += 1; if (active && active.epoch === epoch.current) setSelection({ ...active, token: actionEpoch.current, a: active.b, b: active.a, result: null, error: "" }); }}>比較元Aと比較先Bを入れ替える</button><button type="button" disabled={!active?.a || !active?.b} onClick={compare}>選択した2記録を比較</button></div>
    {invalidated && <p role="status">対象・本文・取得世代・保存通知の変化により以前の比較結果を失効しました。保持本文の記録を選び直してください。</p>}
    {active?.error && <p role="alert">{active.error}</p>}
    {!active?.result && <p>比較はまだ実行されていません。AとBを選び、比較ボタンを押してください。</p>}
    {active?.result && <section aria-label="2時点比較結果">
      <h4>総合状態：{states(active.result.states)}</h4>
      {active.a !== active.b && <ComparisonExport insertion={insertion} key={active.token} before={entries.find(entry => entryKey(entry) === active.a)!.metadata!} after={entries.find(entry => entryKey(entry) === active.b)!.metadata!} result={active.result} savedContextChanged={!!savedContextChanged || external} isCurrent={() => actionEpoch.current === active.token && current.current.context === context && current.current.selection === active && epoch.current === active.epoch} />}
      <p>比較元A：{entries.find(entry => entryKey(entry) === active.a)?.metadata?.recordId} → 比較先B：{entries.find(entry => entryKey(entry) === active.b)?.metadata?.recordId}</p>
      {active.result.changes.map((change, index) => <p key={index}>記録間の変化：{change}</p>)}
      <ul>{active.result.limitations.map((limitation, index) => <li key={index}>{limitation}</li>)}</ul>
      {!active.result.rows.length && <p>比較可能な根拠行がありません。0件は点検完了や数学的な一致を意味しません。</p>}
      <ol>{active.result.rows.map((row, index) => <li key={index}>
        <h4>{row.kind === "quote" ? "固定引用" : "比較差分"}：{row.id ?? "ID欠落・対応付け不能"}</h4><p>項目状態：{states(row.states)}</p>
        {row.changes.map((change, n) => <p key={n}>{change}</p>)}
        <ItemDetails label="比較元Aの固定情報" item={row.before} /><ItemDetails label="比較先Bの固定情報" item={row.after} />
        {row.sources.map(source => <section key={source.side}><h5>{sideName(source.side)}</h5><p>{states(source.states)}</p>{source.changes.map((change, n) => <p key={n}>{change}</p>)}
          {source.frozen && <CalculationChanges label="引用・差分snapshot同士" comparison={source.frozen} />}
          {source.observed && <CalculationChanges label="各点検時に取得した原本同士" comparison={source.observed} />}
        </section>)}
      </li>)}</ol>
    </section>}
  </section>;
}
function ItemDetails({ label, item }: { label: string; item?: AuditComparisonItem }) {
  const [open, setOpen] = useState(false);
  return <details onToggle={event => setOpen(event.currentTarget.open)}><summary>{label}</summary>{open && (!item ? <p>この側の記録には列挙されていません。不完全集計の場合は削除・追加と断定しません。</p> : <><p>本文状態：{bodyLabels[item.bodyStatus]}。{item.reason}</p>{item.kind === "difference" && <p>原引用ID：{item.originQuoteId ?? "記録なし"}／原引用対象ブロックID：{item.originBlockId ?? "記録なし"}</p>}{item.sources.map(source => <section key={source.side}>
    <h5>{sideName(source.side)}</h5><p>メモID：{source.memoId}／引用対象ブロックID：{source.blockId ?? "記録全体"}</p><p>当時の出典状態：{sourceLabels[source.status]}。{source.reason}</p><p>当時の関連付け：{source.linked === undefined ? "未確認" : source.linked ? "あり" : "なし"}</p>
    {([['frozen', '引用・差分に固定したsnapshot'], ['observed', '当時取得した保存原本']] as const).map(([key, name]) => { const record = source[key]; return <section key={key}><h5>{name}</h5>{record ? <><RecordInfo record={record} />{record.blocks.map((block, index) => <section key={block.blockId}><p>ブロックID：{block.blockId}</p><BlockInfo block={block} executionOrder={index + 1} record={record} /><p>参照先ID定義：{block.references ? JSON.stringify(block.references) : "記録なし（未使用の定義を推測しません）"}</p></section>)}</> : <p>原本情報不足。固定snapshotで代用しません。</p>}</section>; })}
  </section>)}</>)}</details>;
}
function CalculationChanges({ label, comparison }: { label: string; comparison: EvidenceComparison }) {
  return <section><h5>{label}</h5><p>変更 {comparison.counts.changed}／追加 {comparison.counts.added}／削除 {comparison.counts.removed}／一致 {comparison.counts.unchanged}。内部結果と表示結果は別に比較しています。</p>{comparison.warnings.map((warning, index) => <p key={index}>{warning}</p>)}<ul>{comparison.rows.map(row => <li key={row.blockId}>ブロックID：{row.blockId}／{row.kind === "unchanged" ? "一致" : row.kind === "changed" ? "変更あり" : row.kind === "added" ? "追加" : "削除"}{row.changes.length ? `：${row.changes.map(change => EVIDENCE_CHANGE_LABELS[change]).join("・")}` : ""}</li>)}</ul></section>;
}

/** Presentation/export only. A preview is tied to the exact existing result object. */
function ComparisonExport({ insertion, before, after, result, savedContextChanged, isCurrent }: { insertion?: ComparisonMaterialInsertion; before: AuditRecordMetadata; after: AuditRecordMetadata; result: AuditRecordComparison; savedContextChanged: boolean; isCurrent: () => boolean }) {
  const id = useId();
  const insertButton = useRef<HTMLButtonElement>(null);
  const [material, setMaterial] = useState<{ key: string; markdown: string; start: number; end: number; isCurrent: () => boolean; insert: () => void } | null>(null);
  const version = useRef(0);
  const live = useRef(false);
  const busy = useRef(false);
  const [preview, setPreview] = useState<{ result: AuditRecordComparison; output: MarkdownReport } | null>(null);
  const [notice, setNotice] = useState<{ text: string; failed: boolean } | null>(null);
  const [copying, setCopying] = useState(false);
  const [manual, setManual] = useState(false);
  if (material && (material.key !== insertion?.key || insertion?.disabled)) { setMaterial(null); setNotice({ text: "本文・対象・編集位置・保護状態が変わり、挿入プレビューは失効しました。本文は保持しています。", failed: true }); }
  useLayoutEffect(() => {
    live.current = true; version.current += 1; busy.current = false;
    return () => { live.current = false; version.current += 1; busy.current = false; };
  }, []);
  const valid = () => live.current && isCurrent();
  const prepare = () => {
    if (!valid()) return;
    version.current += 1; busy.current = false; setCopying(false); setNotice(null); setManual(false); setMaterial(null);
    try { setPreview({ result, output: buildAuditComparisonMarkdown({ before, after, result, exportedAt: new Date().toISOString(), savedContextChanged }) }); }
    catch (cause) { setPreview(null); setNotice({ text: cause instanceof Error ? cause.message : "比較結果のプレビューを生成できません。元の記録は変更していません。", failed: true }); }
  };
  const output = async (download: boolean) => {
    if (busy.current || !valid() || !preview || preview.result !== result) return;
    const token = ++version.current;
    busy.current = true; setCopying(true); setNotice(null); setManual(false);
    const stillValid = () => valid() && version.current === token;
    try {
      // Use the exact preview bytes; no comparison, source acquisition or save.
      if (!stillValid()) return;
      if (download) downloadMarkdownReport(preview.output);
      else await navigator.clipboard.writeText(preview.output.markdown);
      if (!stillValid()) return;
      setNotice({ text: download ? "比較結果のダウンロードを要求しました。保存完了はブラウザで確認してください。" : "比較結果をコピーしました。プレビュー生成時点の記録です。", failed: false });
    } catch (cause) {
      if (!stillValid()) return;
      setNotice({ text: `${download ? "比較結果のファイル出力に失敗しました。" : "比較結果のコピーに失敗しました。"}${cause instanceof Error ? cause.message : "処理を完了できません。"}全文欄から手動でコピーするか、再試行してください。`, failed: true });
      setManual(true);
    } finally { if (stillValid()) { busy.current = false; setCopying(false); } }
  };
  const shown = preview?.result === result ? preview.output : null;
  const prepareInsertion = () => {
    if (!valid() || !insertion || insertion.disabled || busy.current) return;
    setNotice(null); setMaterial(null);
    try {
      // Reuse the already-visible export, including its generation timestamp.
      const output = shown ?? buildAuditComparisonMarkdown({ before, after, result, exportedAt: new Date().toISOString(), savedContextChanged });
      if (!shown) setPreview({ result, output });
      const materialId = crypto.randomUUID();
      const markdown = createAuditComparisonRecordMarkdown(output.markdown, { materialId, formulaId: before.formulaId, reportId: before.reportId, beforeRecordId: before.recordId, afterRecordId: after.recordId, preparedAt: new Date().toISOString() });
      setMaterial({ ...insertion.prepare(markdown, materialId), key: insertion.key, markdown });
    } catch (cause) { setNotice({ text: cause instanceof Error ? cause.message : "比較資料を準備できません。本文は保持しています。", failed: true }); }
  };
  return <section aria-label="2時点比較結果のMarkdown出力">
    <h4>比較結果のMarkdown出力</h4>
    <p>有効な比較結果をそのまま独立資料として出力します。比較不能・情報不足も理由付きで残します。現在の保存原本の照合や数学的証明ではありません。</p>
    <div className="modal-actions"><button type="button" className="button-secondary" onClick={prepare}>比較結果Markdownをプレビュー</button></div>
    {shown && <><div><label htmlFor={`${id}-preview`}>比較結果Markdown全文{manual ? "（手動コピー用）" : "（プレビュー）"}</label><textarea id={`${id}-preview`} className="code-input" readOnly rows={10} value={shown.markdown} onFocus={event => event.target.select()} /></div>
      <div className="modal-actions"><button type="button" className="button-secondary" disabled={copying} onClick={() => void output(false)}>比較結果Markdownをコピー</button><button type="button" className="button-secondary" disabled={copying} onClick={() => void output(true)}>比較結果を.md出力</button></div></>}
    {insertion && <button ref={insertButton} type="button" className="button-secondary" disabled={copying || insertion.disabled} onClick={prepareInsertion}>比較結果をレポートに挿入</button>}
    {insertion?.disabled && <p>編集位置または保存保護の制約により、現在は比較資料を挿入できません。本文を編集表示にし、制約を確認してください。</p>}
    {material && insertion && <section aria-label="比較資料の固定挿入プレビュー">
      <h4>過去の点検結果同士を比較した固定資料</h4>
      <p>{`対象レポート：${insertion.title}（${before.reportId}）／登録式ID：${before.formulaId}`}</p>
      <p>{`比較方向：A ${before.recordId} → B ${after.recordId}`}</p>
      <p>挿入位置：{material.start}（0始まりUTF-16、textareaの改行正規化後）。選択範囲 {material.start}〜{material.end} の先頭へ追加し、選択した文章は保持します。</p>
      <p>以下は挿入前の本文内A/Bの比較資料です。挿入後の本文を点検した結果ではありません。生成日時は元の出力日時、preparedAtは挿入プレビューの準備日時であり、挿入完了時刻ではありません。資料は自動更新されず、保存・確認は別操作です。数学的正しさ・真正性・変更理由は証明しません。</p>
      <label htmlFor={`${id}-material`}>挿入する比較資料Markdown全文</label><textarea id={`${id}-material`} className="code-input" rows={12} readOnly value={material.markdown} />
      <div className="modal-actions"><button type="button" className="button-secondary" onClick={() => {
        try {
          if (!valid() || insertion.disabled || material.key !== insertion.key || !material.isCurrent()) throw new Error("対象・本文・比較結果・取得世代・位置・保護状態が変わり、プレビューは失効しました。本文は保持しています。");
          material.insert(); insertion.onInserted();
        } catch (cause) { setMaterial(null); setNotice({ text: cause instanceof Error ? cause.message : "挿入できません。本文は保持しています。", failed: true }); insertButton.current?.focus(); }
      }}>比較資料を本文へ固定挿入</button><button type="button" className="button-secondary" onClick={() => { setMaterial(null); insertButton.current?.focus(); }}>比較資料の挿入をやめる</button></div>
    </section>}
    {copying && <p role="status">比較結果を出力しています。対象変更後の古い完了通知は表示しません。</p>}
    {notice && <p role={notice.failed ? "alert" : "status"}>{notice.text}</p>}
  </section>;
}
