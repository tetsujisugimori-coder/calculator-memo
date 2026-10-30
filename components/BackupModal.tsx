"use client";
import { useEffect, useRef, useState } from "react";
import { collectBackup, serializeBackup, type BackupResult } from "../lib/backup";
import { STORAGE_KEY } from "../lib/storage";
import { Modal } from "./Modal";

export function BackupModal({ onClose }: { onClose: () => void }) {
  const [result, setResult] = useState<BackupResult | null>(null);
  const [message, setMessage] = useState("");
  const invalidated = useRef(true);
  const currentSnapshot = useRef<BackupResult | null>(null);
  useEffect(() => {
    const changed = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY || event.key === null) { invalidated.current = true; setResult({ status: "changed" }); setMessage(""); }
    };
    window.addEventListener("storage", changed);
    return () => window.removeEventListener("storage", changed);
  }, []);
  const read = () => { invalidated.current = true; currentSnapshot.current = null; try { const next = collectBackup(window.localStorage); currentSnapshot.current = next; invalidated.current = next.status !== "ready"; setResult(next); } catch { setResult({ status: "unavailable" }); } setMessage(""); };
  useEffect(() => { const timer = window.setTimeout(read, 0); return () => window.clearTimeout(timer); }, []);
  const download = () => {
    if (result?.status !== "ready" || invalidated.current || currentSnapshot.current !== result) return;
    setMessage("");
    const unchanged = () => {
      try {
        if (window.localStorage.getItem(STORAGE_KEY) === result.backup.entries[0].raw) return true;
        invalidated.current = true; currentSnapshot.current = null; setResult({ status: "changed" });
      } catch {
        invalidated.current = true; currentSnapshot.current = null; setResult({ status: "unavailable" });
      }
      return false;
    };
    let url: string | null = null;
    let link: HTMLAnchorElement | null = null;
    try {
      if (!unchanged()) return;
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, "0");
      const name = `calculator-memo-backup-${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}.json`;
      const blob = new Blob([serializeBackup(result.backup)], { type: "application/json;charset=utf-8" });
      if (!unchanged()) return;
      url = URL.createObjectURL(blob);
      link = document.createElement("a"); link.href = url; link.download = name; document.body.append(link); link.click();
      setMessage(`ダウンロードを要求しました（${name}）。端末への保存完了は確認できません。ファイルを確認してください。`);
    } catch { setMessage("書き出しを開始できませんでした。保存データは変更していません。"); }
    finally { link?.remove(); if (url) { const objectUrl = url; window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000); } }
  };
  const errors = { missing: "保存キーがありません。バックアップを作成できません。", unavailable: "保存領域を読み取れません。", "too-large": "保存データが上限（2,097,152 UTF-16コード単位）を超えています。書き出しを中止しました。", changed: "取得中または確認後に保存データが変わりました。再取得してください。" };
  const entry = result?.status === "ready" ? result.backup.entries[0] : null;
  return <Modal title="データのバックアップ" onClose={onClose}>
    <p>保存済みデータのみが対象です。未保存の編集内容は含まれません。</p>
    <p>私的なメモや計算記録が含まれる場合があります。ファイルの保管・共有に注意してください。</p>
    <p>取得は完全な原子的スナップショットではありません。別タブや古いアプリによる変更を全て検出できる保証はありません。</p>
    {result === null ? <p>取得中</p> : result.status !== "ready" ? <p role="alert">{errors[result.status]}</p> : <div>
      <p>対象キー: {entry!.key}</p><p>保存形式version: {result.backup.appStorageVersion ?? "不明"}</p><p>原文容量: {entry!.utf16CodeUnits.toLocaleString()} UTF-16コード単位（{(entry!.utf16CodeUnits * 2).toLocaleString()}バイト相当）</p>
      <p>検証状態: {entry!.validation === "ok" ? "現行ローダーで受入可能（全内容の完全性を保証するものではありません）" : `正常と確認できません (${entry!.validation})。原文を保全します。`}</p>
      {entry!.counts && <p>履歴 {entry!.counts.history.toLocaleString()}件、メモ {entry!.counts.notes.toLocaleString()}件、登録式 {entry!.counts.formulas.toLocaleString()}件、レポート {entry!.counts.reports.toLocaleString()}件、実行入力 {entry!.counts.executions.toLocaleString()}件</p>}
    </div>}
    <div className="modal-actions backup-actions"><button className="button-secondary" onClick={read}>再取得</button><button className="button-primary" disabled={result?.status !== "ready"} onClick={download}>JSONを書き出す</button></div>
    {message && <p role="status" style={{ overflowWrap: "anywhere" }}>{message}</p>}
  </Modal>;
}
