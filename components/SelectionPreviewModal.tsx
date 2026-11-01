"use client";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { parseSelectionBackup, parseSelectionCurrent, comparePreviewItem, inspectPreviewReferences, type PreviewDocument, type PreviewItem, type PreviewReference } from "../lib/selection-preview";
import { MAX_RESTORE_FILE_BYTES } from "../lib/restore-validation";
import { STORAGE_KEY } from "../lib/storage";
import { RECOVERY_CHANGED_EVENT } from "../lib/recovery-manager";
import { Modal } from "./Modal";

const PAGE_SIZE = 20;
const DETAIL_SIZE = 4000;
const SELECTION_LIMIT = 200;
type Availability = "ready" | "stale" | "read-error" | "invalid" | "unacquired";
type Snapshot = { raw: string | null; generation: number; capturedAt: string; document: PreviewDocument };

function ReferenceList({ references }: { references: PreviewReference[] }) {
  const [page, setPage] = useState(0);
  return <div><p>検出した参照 {references.length}件（対応範囲内のみ）。{references.length === 0 ? "未対応の任意参照が存在しないことの保証ではありません。" : ""}</p><ul>{references.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((ref, index) => <li key={index}>{ref.namespace}: {ref.status} / {ref.target} / {ref.message}</li>)}</ul>{references.length > PAGE_SIZE && <nav className="recovery-actions" aria-label="参照一覧ページ"><button type="button" disabled={page === 0} onClick={() => setPage(value => value - 1)}>前の参照</button><span>{page + 1} / {Math.ceil(references.length / PAGE_SIZE)}</span><button type="button" disabled={(page + 1) * PAGE_SIZE >= references.length} onClick={() => setPage(value => value + 1)}>次の参照</button></nav>}</div>;
}

/** Pure inspection UI: intentionally has no save, restore, download or recovery mutation capability. */
export function SelectionPreviewModal({ onClose, generation, getGeneration }: { onClose: () => void; generation: number; getGeneration: () => number }) {
  const [backup, setBackup] = useState<PreviewDocument | null>(null);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [readIssue, setReadIssue] = useState("");
  const [startedAt] = useState(() => new Date().toISOString());
  const [loading, setLoading] = useState(false);
  const [availability, setAvailability] = useState<Availability>("unacquired");
  const [current, setCurrent] = useState<Snapshot | null>(null);
  const [category, setCategory] = useState("all");
  const [page, setPage] = useState(0);
  const [detail, setDetail] = useState<PreviewItem | null>(null);
  const detailHeading = useRef<HTMLHeadingElement>(null);
  const [detailPage, setDetailPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectionMessage, setSelectionMessage] = useState("");
  const snapshot = useRef<Snapshot | null>(null);
  const activeBackup = useRef<PreviewDocument | null>(null);
  const alive = useRef(true);
  const fileRequest = useRef(0);
  const getGenerationRef = useRef(getGeneration);
  useLayoutEffect(() => { getGenerationRef.current = getGeneration; }, [getGeneration]);

  const invalidate = (state: "stale" | "read-error") => {
    snapshot.current = null; setReadIssue(state === "read-error" ? "読取失敗（UNKNOWN）: 保存領域を取得できません。" : "");
    setCurrent(null); setAvailability(state); setSelectionMessage("");
  };
  const verify = () => {
    const prior = snapshot.current;
    if (!prior) return false;
    try {
      if (getGenerationRef.current() !== prior.generation || window.localStorage.getItem(STORAGE_KEY) !== prior.raw) { invalidate("stale"); return false; }
      return true;
    } catch { invalidate("read-error"); return false; }
  };
  const verifyRef = useRef(verify);
  useLayoutEffect(() => { verifyRef.current = verify; });
  useEffect(() => {
    alive.current = true;
    const changed = (event: StorageEvent) => { if (event.key === STORAGE_KEY || event.key === null) invalidate("stale"); };
    const sameTab = () => invalidate("stale");
    const check = () => { verifyRef.current(); };
    window.addEventListener("storage", changed);
    window.addEventListener(RECOVERY_CHANGED_EVENT, sameTab);
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    // Non-cooperating same-tab writes have no storage event. Polling only verifies an
    // already captured raw value; it never adopts new data or refreshes comparison.
    const timer = window.setInterval(check, 500);
    return () => { alive.current = false; window.clearInterval(timer); window.removeEventListener("storage", changed); window.removeEventListener(RECOVERY_CHANGED_EVENT, sameTab); window.removeEventListener("focus", check); document.removeEventListener("visibilitychange", check); };
  }, []);
  useEffect(() => { if (snapshot.current && generation !== snapshot.current.generation) { const timer = window.setTimeout(() => verifyRef.current(), 0); return () => window.clearTimeout(timer); } }, [generation]);

  useEffect(() => { if (detail) { detailHeading.current?.focus(); detailHeading.current?.scrollIntoView?.({ block: "start" }); } }, [detail]);

  const chooseFile = async (file: File | undefined) => {
    const request = ++fileRequest.current;
    activeBackup.current = null;
    setBackup(null); setSelected(new Set()); setDetail(null); setCategory("all"); setPage(0); setError(""); setSelectionMessage("");
    snapshot.current = null; setReadIssue(""); setCurrent(null); setAvailability("unacquired");
    setFileName(file?.name ?? ""); setLoading(false);
    if (!file) return;
    if (!Number.isSafeInteger(file.size) || file.size > MAX_RESTORE_FILE_BYTES) { setError("ファイル容量が上限（16 MiB）を超えています。読み込んでいません。"); return; }
    setLoading(true);
    try {
      const text = await file.text();
      if (!alive.current || request !== fileRequest.current) return;
      const result = parseSelectionBackup(text, file.size);
      if (result.ok) { activeBackup.current = result.preview; setBackup(result.preview); } else setError(result.message);
    } catch { if (alive.current && request === fileRequest.current) setError("ファイルを読み取れません。UNKNOWN。旧ファイルの選択は失効しました。"); }
    finally { if (alive.current && request === fileRequest.current) setLoading(false); }
  };
  const acquire = () => {
    if (!backup || activeBackup.current !== backup) return;
    snapshot.current = null; setReadIssue(""); setCurrent(null); setAvailability("unacquired"); setSelectionMessage("");
    try {
      const before = getGenerationRef.current();
      const raw = window.localStorage.getItem(STORAGE_KEY);
      const result = parseSelectionCurrent(raw);
      if (!result.ok) { setAvailability("invalid"); setReadIssue(`検証不能（UNKNOWN）: 原文は取得しましたが、${result.message}`); return; }
      if (getGenerationRef.current() !== before || window.localStorage.getItem(STORAGE_KEY) !== raw) { invalidate("stale"); return; }
      const next = { raw, generation: before, capturedAt: new Date().toISOString(), document: result.preview };
      snapshot.current = next; setCurrent(next); setAvailability("ready"); setError("");
    } catch { invalidate("read-error"); }
  };
  const effectiveAvailability: Availability = current && generation !== current.generation ? "stale" : availability;
  const compare = (item: PreviewItem) => comparePreviewItem(item, backup!, current?.document ?? null, effectiveAvailability);
  const filtered = useMemo(() => backup?.items.filter(item => category === "all" || item.category === category) ?? [], [backup, category]);
  const chosen = useMemo(() => backup?.items.filter(item => selected.has(item.key)) ?? [], [backup, selected]);
  const summary = useMemo(() => {
    const statuses: Record<string, number> = {}; const types: Record<string, number> = {};
    let missing = 0; let unknownRefs = 0;
    for (const item of chosen) {
      const status = comparePreviewItem(item, backup!, current?.document ?? null, effectiveAvailability).status;
      statuses[status] = (statuses[status] ?? 0) + 1; types[item.category] = (types[item.category] ?? 0) + 1;
      for (const ref of inspectPreviewReferences(item, backup!)) { if (ref.status === "missing") missing++; if (ref.status !== "found" && ref.status !== "missing") unknownRefs++; }
    }
    return { statuses, types, missing, unknownRefs };
  }, [chosen, backup, current, effectiveAvailability]);
  const toggle = (key: string) => {
    if (!backup || activeBackup.current !== backup) return;
    if (snapshot.current) verify();
    setSelected(previous => { const next = new Set(previous); if (next.has(key)) next.delete(key); else if (next.size < SELECTION_LIMIT) next.add(key); return next; });
    setSelectionMessage(selected.size >= SELECTION_LIMIT && !selected.has(key) ? `一度に選べる候補は${SELECTION_LIMIT}件までです。解除してから選択してください。` : "");
  };
  const currentDetail = detail && current && effectiveAvailability === "ready" && detail.identity !== null && ["same", "different"].includes(compare(detail).status) ? current.document.items.filter(item => item.identity === detail.identity && item.category === detail.category && item.scope === detail.scope) : [];
  const detailText = useMemo(() => detail ? JSON.stringify(detail.value, null, 2) ?? "UNKNOWN" : "", [detail]);
  const availabilityText = { ready: "取得時点の比較（継続的な同一性保証ではありません）", stale: "比較失効: 現在データの変更を検知しました。明示的に再取得してください。", invalid: readIssue || "現在原文は検証不能（UNKNOWN）です。", "read-error": readIssue || "現在データ: UNKNOWN。比較の成功表示を取り消しました。", unacquired: "現在データは未取得（UNKNOWN）" };
  return <Modal title="選択復元プレビュー" onClose={onClose} wide><div className="selection-preview">
    <p><strong>第1段階・読み取り専用です。今回は復元できません。</strong>候補の選択はこの画面内だけで、閉じると消えます。安全に復元できることを保証しません。</p>
    <p>現在の保存原文・バックアップ原文・保全コピーは変更しません。数式や本文を実行せず、固定 snapshot も再生成しません。</p>
    <p>プレビュー開始: {startedAt}（この時点では現在保存原文を取得しません）</p>
    <label className="restore-file">バックアップファイル<input type="file" aria-label="バックアップファイル" accept=".json,application/json" onChange={event => { void chooseFile(event.target.files?.[0]); event.target.value = ""; }} /></label>
    {fileName && <p>ファイル: {fileName}</p>}{loading && <p role="status">検証中</p>}{error && <p role="alert">{error}</p>}
    <section aria-label="現在保存データとの比較"><h3>現在保存データとの比較</h3><p data-testid="preview-comparison-state" role="status">{availabilityText[effectiveAvailability]}</p>
      <button type="button" className="button-secondary" disabled={!backup || loading} onClick={acquire}>現在データを明示的に再取得して比較</button>
      {current && <><p>取得日時: {current.capturedAt} / アプリ世代: {current.generation}</p><p>現在原文: {current.raw === null ? "保存キーなし" : `${current.raw.length.toLocaleString()} UTF-16コード単位`} / 検証状態: {current.document.validation === "valid" ? "対応範囲で検証済み" : "UNKNOWN を含む"}</p>{current.document.warnings.length > 0 && <details><summary>現在データの検証上の制約</summary><ul>{current.document.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></details>}</>}
      <p>比較は JSON の構造・値です。原文の文字列一致ではありません。保存変更の監視には通知と500ms間隔の原文照合を用います。取得直後の変更や非協調クライアントの変更を完全には防げません。保存済みデータのみを比較し、未保存の編集内容は含めません。</p>
    </section>
    {backup && <><p>バックアップ原文: {backup.raw?.length.toLocaleString()} UTF-16コード単位 / 検証状態: {backup.validation === "valid" ? "対応範囲で検証済み" : "UNKNOWN を含む"}</p>
      {backup.warnings.length > 0 && <details><summary>検証上の制約・警告 {backup.warnings.length}件</summary><ul>{backup.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></details>}
      <section aria-label="復元候補の概要"><h3>復元候補 {chosen.length}件（上限 {SELECTION_LIMIT}件）</h3><p>選択可能は復元可能を意味しません。曖昧な ID を既存データへ自動的に対応付けません。</p>
        {Object.entries(summary.types).map(([key, count]) => <p key={key}>{backup.categories.find(entry => entry.category === key)?.label ?? key}: {count}件</p>)}
        <p>現在データに存在しない: {summary.statuses.absent ?? 0}件 / 一意で内容一致: {summary.statuses.same ?? 0}件</p>
        <p>同一 ID の内容差異（衝突・内容変更の可能性）: {summary.statuses.different ?? 0}件 / ID 対応が曖昧: {summary.statuses.ambiguous ?? 0}件 / 判定不能・未取得・失効: {(summary.statuses.unknown ?? 0) + (summary.statuses["read-error"] ?? 0) + (summary.statuses.unacquired ?? 0) + (summary.statuses.stale ?? 0)}件</p>
        <p>バックアップ内の参照先不足: {summary.missing}件 / 参照判定不能・未対応: {summary.unknownRefs}件</p>
        {selectionMessage && <p role="status">{selectionMessage}</p>}
      </section>
      <label className="preview-filter">データ分類<select aria-label="データ分類" value={category} onChange={event => { setCategory(event.target.value); setPage(0); }}>{[{ category: "all", label: "すべて", count: backup.items.length }, ...backup.categories].map(entry => <option key={entry.category} value={entry.category}>{entry.label}（{entry.count === null ? "UNKNOWN" : `${entry.count}件`}）</option>)}</select></label>
      <p>{filtered.length}件中 {filtered.length ? page * PAGE_SIZE + 1 : 0}〜{Math.min(filtered.length, (page + 1) * PAGE_SIZE)}件を表示</p>
      {filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map(item => <article key={item.key} data-preview-key={item.key}>
        <h3>{item.title}</h3><p>識別子: {item.id ?? "UNKNOWN（ID なし）"}</p><p>種別: {backup.categories.find(entry => entry.category === item.category)?.label ?? item.category} / 検証: {item.validation === "valid" ? "対応範囲で検証済み" : "UNKNOWN"}</p>
        <p>作成: {item.createdAt ?? "UNKNOWN"} / 更新: {item.updatedAt ?? "UNKNOWN"}</p><p data-comparison={compare(item).status}>{compare(item).message}</p>
        <div className="recovery-actions"><button type="button" className="button-secondary" onClick={() => { if (activeBackup.current !== backup) return; verify(); setDetail(item); setDetailPage(0); }}>個別詳細</button><button type="button" className="button-secondary" aria-pressed={selected.has(item.key)} onClick={() => toggle(item.key)}>{selected.has(item.key) ? "候補から解除" : "復元候補に選択"}</button></div>
      </article>)}
      {!filtered.length && <p>この分類の項目はありません。</p>}
      <nav className="recovery-actions" aria-label="一覧ページ"><button type="button" disabled={page === 0} onClick={() => setPage(value => value - 1)}>前の一覧</button><button type="button" disabled={(page + 1) * PAGE_SIZE >= filtered.length} onClick={() => setPage(value => value + 1)}>次の一覧</button></nav>
      {detail && <section className="preview-detail" aria-label="個別詳細"><h3 ref={detailHeading} tabIndex={-1}>個別詳細: {detail.title}</h3><p>識別子: {detail.id ?? "UNKNOWN"} / {compare(detail).message}</p><p>解析済み内容の読み取り専用 JSON 表示です（表示用に整形。原文の再生成ではありません）。数値表記などは原文とは異なる場合があります。本文・未知フィールドを含み、保存原文は変更しません。</p><pre>{detailText.slice(detailPage * DETAIL_SIZE, (detailPage + 1) * DETAIL_SIZE)}</pre><p>詳細 {detailPage + 1} / {Math.max(1, Math.ceil(detailText.length / DETAIL_SIZE))}ページ</p><div className="recovery-actions"><button type="button" disabled={detailPage === 0} onClick={() => setDetailPage(value => value - 1)}>詳細の前ページ</button><button type="button" disabled={(detailPage + 1) * DETAIL_SIZE >= detailText.length} onClick={() => setDetailPage(value => value + 1)}>詳細の次ページ</button><button type="button" onClick={() => setDetail(null)}>詳細を閉じる</button></div>
        <h4>参照関係（バックアップ内）</h4><p>参照先の存在は復元後の整合性の保証ではありません。現在データの参照先と混ぜません。</p><ReferenceList key={`backup-${detail.key}`} references={inspectPreviewReferences(detail, backup)} />
        <h4>参照関係（現在データ内）</h4>{effectiveAvailability !== "ready" ? <p>現在の参照点検: UNKNOWN / {availabilityText[effectiveAvailability]}</p> : currentDetail.length !== 1 ? <p>現在データ内の対象を一意に特定できません（UNKNOWN）。</p> : <ReferenceList key={`current-${current!.capturedAt}-${detail.key}`} references={inspectPreviewReferences(currentDetail[0], current!.document)} />}
      </section>}
    </>}
    <div className="modal-actions"><button type="button" className="button-secondary" onClick={onClose}>プレビューを閉じる</button></div>
  </div></Modal>;
}
