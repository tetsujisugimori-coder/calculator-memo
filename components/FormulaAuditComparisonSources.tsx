"use client";

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { inspectComparisonMaterials, validSourceRange } from "../lib/formula-report-audit-comparison-navigation";
import { STORAGE_KEY } from "../lib/storage";

const integrityLabels = { complete: "正常・完全", incomplete: "不完全", unknown: "未知形式", malformed: "破損・不正", duplicate: "資料ID重複", ambiguous: "境界が曖昧" } as const;

type Props = { body: string; formulaId: string; reportId?: string; savedContextChanged?: boolean; generation?: string | number; onNavigate: (start: number, end: number) => void };
/** Reads only the held body. Historical prose is never parsed back into a result. */
export function FormulaAuditComparisonSources({ body, formulaId, reportId, savedContextChanged, generation, onNavigate }: Props) {
  const id = useId();
  const inventory = useMemo(() => inspectComparisonMaterials(body, formulaId, reportId), [body, formulaId, reportId]);
  const context = JSON.stringify([body, formulaId, reportId, savedContextChanged, generation]);
  const epoch = useRef(0);
  const [observedEpoch, setObservedEpoch] = useState(0);
  const currentContext = useRef(context);
  const mounted = useRef(true);
  const [selection, setSelection] = useState<{ key: string; context: string; epoch: number } | null>(null);
  const [external, setExternal] = useState(false);
  const [notice, setNotice] = useState("");
  useLayoutEffect(() => { currentContext.current = context; }, [context]);
  useLayoutEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    const observe = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY && event.key !== null) return;
      epoch.current += 1; setObservedEpoch(epoch.current); setExternal(true); setNotice("保存領域の通知で旧追跡位置は失効しました。画面に保持した本文の資料を選び直してください。");
    };
    window.addEventListener("storage", observe);
    return () => window.removeEventListener("storage", observe);
  }, []);
  const active = selection?.context === context && selection.epoch === observedEpoch;
  const selected = active ? inventory.entries.find(entry => entry.key === selection.key) : undefined;
  const navigate = (target: "material" | "before" | "after") => {
    if (!mounted.current || !selection || !active || selection.context !== currentContext.current || selection.epoch !== epoch.current) {
      setNotice("本文・対象・取得世代・保存通知の変化で追跡位置は失効しました。選び直してください。"); return;
    }
    // Resolve again immediately before handing the original UTF-16 range to the editor.
    const fresh = inspectComparisonMaterials(body, formulaId, reportId).entries.find(entry => entry.key === selection.key);
    const range = target === "material" ? fresh : fresh?.[target];
    const eligible = fresh?.status === "complete" && fresh.metadata?.formulaId === formulaId && fresh.metadata.reportId === reportId;
    if (!eligible || !range || (target !== "material" && fresh?.[target].status !== "available") || range.start === undefined || range.end === undefined || !validSourceRange(body, range.start, range.end)) {
      setNotice("資料と出典の一意な位置を確認できません。本文を変更せず移動を停止しました。"); return;
    }
    onNavigate(range.start, range.end);
  };
  return <section className="quote-tools saved-evidence" aria-label="固定A/B比較資料">
    <h3>固定A/B比較資料</h3>
    <p>画面に保持した本文内の固定資料を読み返します。現在の根拠との一致・真正性・数学的正しさを保証しません。閲覧・移動では保存・原本取得・再比較・再計算・確認履歴追加を行いません。</p>
    {(savedContextChanged || external) && <p role="alert">保持本文と現在の保存原本との一致は未確認です。ここで特定する出典は現在画面の本文内だけで、保存原本との照合ではありません。</p>}
    <p role={inventory.complete ? "status" : "alert"}>認識できた固定比較資料 {inventory.entries.length}件。{inventory.reason}</p>
    {!inventory.entries.length && <p>列挙できる固定比較資料はありません。由来不明の文章から資料を推測しません。</p>}
    <ol aria-label="固定A/B比較資料一覧">{inventory.entries.map((entry, index) => <li key={entry.key}>
      <p>資料 {index + 1}：{entry.metadata?.materialId ?? "識別不能"}。完全性：{integrityLabels[entry.status]}。{entry.reason}</p>
      <p>元の比較状態：構造化記録なし（詳細の固定本文を参照）。</p>
      <p>A：{entry.metadata?.beforeRecordId ?? "記録なし・確認不能"} → B：{entry.metadata?.afterRecordId ?? "記録なし・確認不能"}</p>
      <p>準備日時（記録内のタイムゾーン）：{entry.metadata?.preparedAt ?? "記録なし"}。挿入・保存日時ではありません。本文位置：{entry.start}〜{entry.end}（原文UTF-16、終端は含まない）。</p>
      <button type="button" onClick={() => { setSelection({ key: entry.key, context, epoch: epoch.current }); setNotice(""); }}>比較資料{index + 1}の詳細</button>
    </li>)}</ol>
    {(selection && !active) && <p role="status">以前の詳細・追跡位置は失効しました。現在の本文から資料を選び直してください。</p>}
    {notice && <p role="status">{notice}</p>}
    {selected && <section aria-label="固定比較資料の詳細">
      <h4>固定資料：{selected.metadata?.materialId ?? "識別不能"}</h4>
      <p>完全性：{integrityLabels[selected.status]}。{selected.reason}</p>
      <p>元の比較状態・比較不能理由：構造化記録なし。下の固定本文を参照してください。文章から状態を推測したり、現在のA/Bで再比較したりしません。</p>
      <p>登録式：{selected.metadata?.formulaId ?? "記録なし"}／レポート：{selected.metadata?.reportId ?? "記録なし"}</p>
      <label htmlFor={`${id}-body`}>固定比較資料の本文全文</label><textarea id={`${id}-body`} className="code-input" rows={10} readOnly value={selected.markdown} />
      <button type="button" disabled={selected.status !== "complete" || selected.metadata?.formulaId !== formulaId || selected.metadata?.reportId !== reportId} onClick={() => navigate("material")}>この比較資料の本文へ移動</button>
      {([['before', '比較元A'], ['after', '比較先B']] as const).map(([side, label]) => <section key={side} aria-label={`${label}の出典`}>
        <h5>{label}：{side === 'before' ? selected.metadata?.beforeRecordId ?? "記録なし" : selected.metadata?.afterRecordId ?? "記録なし"}</h5>
        <p>{selected[side].reason}</p>
        <button type="button" disabled={selected[side].status !== "available"} onClick={() => navigate(side)}>{label}の出典本文へ移動</button>
      </section>)}
    </section>}
  </section>;
}
