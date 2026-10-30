"use client";
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { collectBackup, MAX_RAW_CODE_UNITS, serializeBackup, type BackupResult } from '../lib/backup';
import { STORAGE_KEY, withStorageWriteLock } from '../lib/storage';
import { MAX_RESTORE_FILE_BYTES, validateRestoreBackup } from '../lib/restore-validation';
import { preserveRestoreSource, readRecoveryCopies, restoreRaw, type RecoveryCopy } from '../lib/restore-storage';
import type { StoredData } from '../lib/types';
import { Modal } from './Modal';

type Candidate = Extract<ReturnType<typeof validateRestoreBackup>, { ok: true }>;
type Preview = { candidate: Candidate; currentRaw: string | null; current: BackupResult; filename: string; bytes: number; generation: number; token: number };
export function RestoreModal({ onClose, blockedReason, generation, canApply, onApplied, onUncertain }: {
  onClose: () => void; blockedReason: string; generation: number; canApply: () => boolean;
  onApplied: (raw: string, data: StoredData) => void; onUncertain: () => void;
}) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [copy, setCopy] = useState<RecoveryCopy | null>(null);
  const [copies, setCopies] = useState<RecoveryCopy[]>([]);
  const [approved, setApproved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [problem, setProblem] = useState('');
  const [terminal, setTerminal] = useState(false);
  const [invalid, setInvalid] = useState(true);
  const current = useRef<Preview | null>(null);
  const preserved = useRef<RecoveryCopy | null>(null);
  const token = useRef(0); const approval = useRef(false); const working = useRef(false); const finished = useRef(false);
  const alive = useRef(true); const callbacks = useRef({ canApply, onApplied, onUncertain });
  useLayoutEffect(() => { callbacks.current = { canApply, onApplied, onUncertain }; }, [canApply, onApplied, onUncertain]);
  const invalidate = (reason: string) => {
    token.current++; current.current = null; preserved.current = null; approval.current = false;
    setInvalid(true); setCopy(null); setApproved(false); setMessage(''); setProblem(reason);
  };
  useEffect(() => {
    alive.current = true;
    const changed = (e: StorageEvent) => {
      if (!finished.current && (e.key === null || e.key === STORAGE_KEY || e.key?.startsWith('calculation-memo:restore-recovery:v1:')))
        invalidate('別タブから保存通知を受けたため確認と承認を失効しました。ファイルを選び直してください。');
    };
    window.addEventListener('storage', changed);
    const timer = window.setTimeout(() => { try { setCopies(readRecoveryCopies(localStorage)); } catch { setProblem('既存の復旧コピーを読み取れません。復元は保全確認に成功するまで行えません。'); } }, 0);
    return () => { alive.current = false; window.clearTimeout(timer); window.removeEventListener('storage', changed); };
  }, []);
  useEffect(() => {
    if (current.current && current.current.generation !== generation && !finished.current)
      invalidate('アプリ状態が変わったため確認を失効しました。この画面を閉じて開き直し、ファイルを選択してください。');
  }, [generation]);
  const valid = (p: Preview) => alive.current && !finished.current && token.current === p.token && current.current === p && callbacks.current.canApply();
  const select = async (file: File | undefined) => {
    if (working.current || finished.current) return;
    invalidate(''); setPreview(null);
    if (!file) { setMessage('ファイル選択を取り消しました。保存内容は変更していません。'); return; }
    if (file.size > MAX_RESTORE_FILE_BYTES) { setProblem('ファイル容量が上限（16 MiB）を超えています。読み込みません。'); return; }
    const selectedToken = token.current;
    working.current = true; setBusy(true);
    try {
      const text = await file.text();
      if (!alive.current || token.current !== selectedToken) return;
      const checked = validateRestoreBackup(text, file.size);
      if (!checked.ok) { setProblem(checked.message); return; }
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw !== null && raw.length > MAX_RAW_CODE_UNITS) throw Error('現在原文が保全上限を超えています。復元を停止しました。');
      const now = collectBackup(localStorage);
      if (now.status === 'unavailable' || now.status === 'changed' || now.status === 'too-large' || localStorage.getItem(STORAGE_KEY) !== raw) throw Error('現在の保存原文を安定して読み取れません。復元を停止しました。');
      const p: Preview = { candidate: checked, currentRaw: raw, current: now, filename: file.name, bytes: file.size, generation, token: selectedToken };
      current.current = p; setInvalid(false); setPreview(p); setMessage('ファイルを検証しました。プレビューだけでは保存内容を変更しません。');
    } catch { if (alive.current) setProblem('ファイルまたは現在保存原文を読み取れません。保存内容は変更していません。端末内のJSONファイルで再選択してください。'); }
    finally { working.current = false; if (alive.current) setBusy(false); }
  };
  const preserve = async () => {
    const p = current.current;
    if (!p || !valid(p) || working.current) return;
    working.current = true; setBusy(true); setMessage(''); approval.current = false; setApproved(false);
    try {
      const result = await withStorageWriteLock(() => preserveRestoreSource(localStorage, p.currentRaw, () => valid(p)));
      if (!result.ok) { invalidate(`保全できないため上書きしません。${result.message}`); return; }
      if (!valid(p)) return;
      preserved.current = result.copy; setCopy(result.copy); setCopies(readRecoveryCopies(localStorage)); setProblem(''); setMessage('独立キーの復旧コピーを作成・読戻し照合しました。端末外の保管も推奨します。');
    } catch { invalidate('保全用ロックまたは保存領域を利用できません。保存原文は置き換えていません。'); }
    finally { working.current = false; if (alive.current) setBusy(false); }
  };
  const execute = async () => {
    const p = current.current; const c = preserved.current;
    if (!p || !c || !approval.current || !valid(p) || working.current) return;
    working.current = true; setBusy(true); setMessage(''); setProblem('');
    let writeOutcomeObserved = false;
    try {
      const result = await withStorageWriteLock(() => restoreRaw(localStorage, p.candidate.raw, p.currentRaw, c, () => approval.current && valid(p)));
      if (result.status === 'aborted') { invalidate(result.message); return; }
      writeOutcomeObserved = true; finished.current = true; setTerminal(true); approval.current = false; setApproved(false);
      if (result.status === 'unknown') { callbacks.current.onUncertain(); setProblem(result.message); return; }
      try {
        callbacks.current.onApplied(p.candidate.raw, p.candidate.data);
        setMessage('保存原文の書込みと読戻し一致を確認し、画面状態を更新しました。端末ディスクへの永続化や他タブとの完全な原子性は保証しません。');
      } catch { callbacks.current.onUncertain(); setProblem('保存原文は照合しましたが画面状態の更新を確認できません（UNKNOWN）。自動保存を停止しています。復旧コピーを保管し、明示的に再読み込みしてください。'); }
    } catch {
      if (writeOutcomeObserved) {
        finished.current = true; setTerminal(true);
        try { callbacks.current.onUncertain(); } catch { /* keep terminal UI protection */ }
        setProblem('書込み後の画面状態を確認できません（UNKNOWN）。復旧コピーを保持し、自動再試行は行いません。');
      } else invalidate('保存用ロックを取得できません。復元は開始していません。');
    }
    finally { working.current = false; if (alive.current) setBusy(false); }
  };
  const exportCopy = (item: RecoveryCopy) => {
    let url: string | null = null;
    try {
      if (localStorage.getItem(item.key) !== item.serialized) throw Error('changed');
      if (item.raw === null) { setMessage('この復旧コピーは「保存キーなし」を記録しています。復元用データのJSONはありません。'); return; }
      const result = collectBackup({ getItem: () => item.raw });
      if (result.status !== 'ready') throw Error('unavailable');
      url = URL.createObjectURL(new Blob([serializeBackup(result.backup)], { type: 'application/json;charset=utf-8' }));
      const a = document.createElement('a'); a.href = url; a.download = `calculator-memo-recovery-${item.createdAt.replace(/[:.]/g, '-')}.json`; document.body.append(a); a.click(); a.remove();
      setMessage('復旧コピーのダウンロードを要求しました。端末への保存完了は確認できません。ファイルを確認してください。');
    } catch { setProblem('復旧コピーの読取・書出しを確認できません。既存コピーは削除していません。'); }
    finally { if (url) { const value = url; window.setTimeout(() => URL.revokeObjectURL(value), 60_000); } }
  };
  const currentEntry = preview?.current.status === 'ready' ? preview.current.backup.entries[0] : null;
  const countRows = [['history','計算履歴'],['notes','数学メモ'],['formulas','登録式'],['executions','実行入力'],['reports','レポート']] as const;
  return <Modal title="JSONバックアップから復元" onClose={onClose} closeDisabled={busy}>
    <div className="restore-content" onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); } }}>
      <p>復元すると、現在保存されているデータ全体がバックアップの内容に置き換わります。未保存編集は自動保存・破棄しません。編集画面を閉じ、保存状態を確認してから進んでください。</p>
      <p>復旧コピーはこのブラウザの独立キーに最大8件・合計4 Mi UTF-16コード単位まで保持し、自動削除しません。サイトデータ全体の消去や端末故障では両方失われます。私的な記録を含むため、端末外にも書き出し、保管・共有に注意してください。</p>
      {blockedReason && <p role="alert">{blockedReason}</p>}
      <label className="restore-file">JSONファイルを選択<input aria-label="復元JSONファイル" type="file" accept=".json,application/json" disabled={busy || terminal || !!blockedReason} onChange={e => { void select(e.target.files?.[0]); e.target.value = ''; }} /></label>
      <p>上限16 MiB。拡張子だけでは判定せず内容を検証します。クラウド上のファイルを読めない場合は端末内へ保存して再選択してください。</p>
      {preview && <section aria-label="復元プレビュー">
        <p>選択ファイル: {preview.filename}（{preview.bytes.toLocaleString()} bytes）</p>
        <p>作成日時: {preview.candidate.createdAt} ／ 取得日時: {preview.candidate.acquiredAt}</p>
        <p>形式: calculator-memo-backup v1 ／ 保存形式: v1</p>
        <p>原文比較: {preview.currentRaw === preview.candidate.raw ? '完全一致' : '異なります'}。同じ件数でも内容の一致とは限りません。</p>
        <table className="restore-comparison"><thead><tr><th>項目</th><th>現在</th><th>復元予定</th></tr></thead><tbody>
          <tr><th>保存状態</th><td>{currentEntry?.validation ?? preview.current.status}</td><td>構造検証済み</td></tr>
          <tr><th>UTF-16長</th><td>{preview.currentRaw === null ? 'キーなし' : preview.currentRaw.length.toLocaleString()}</td><td>{preview.candidate.raw.length.toLocaleString()}</td></tr>
          {countRows.map(([key,label]) => <tr key={key}><th>{label}</th><td>{currentEntry?.counts?.[key]?.toLocaleString() ?? 'UNKNOWN'}</td><td>{preview.candidate.counts[key].toLocaleString()}</td></tr>)}
        </tbody></table>
        <p>構造検証は数学的正しさ・参照先の現存性・真正性の証明ではありません。</p>
        <button type="button" className="button-secondary" disabled={busy || terminal || !!blockedReason || invalid} onClick={() => void preserve()}>現在データを保全する</button>
        <p>保全状態: {copy ? '独立コピー読戻し確認済み（実行直前にも再確認）' : '未確認 — 復元不可'}</p>
        <label className="restore-approval"><input type="checkbox" checked={approved} disabled={!copy || busy || terminal || !!blockedReason} onChange={e => { approval.current = e.target.checked; setApproved(e.target.checked); }} />全体置換と保全状態を確認し、復元を承認します</label>
        <button type="button" className="button-primary" disabled={!copy || !approved || busy || terminal || !!blockedReason} onClick={() => void execute()}>復元を実行する</button>
        <p>Enterでは実行しません。ボタンをタップするか、フォーカスしてSpaceで明示操作してください。</p>
      </section>}
      {busy && <p role="status">処理中です。重複操作は受け付けません。</p>}
      {problem && <p role="alert">{problem}</p>}{message && <p role="status">{message}</p>}
      {copies.length > 0 && <section aria-label="復旧コピー"><h3>保持中の復旧コピー</h3>{copies.map((item,i) => <div key={item.key}><p>{item.createdAt} — {item.raw === null ? '保存キーなし' : `${item.raw.length.toLocaleString()} UTF-16コード単位`}</p><button type="button" className="button-secondary" disabled={busy} onClick={() => exportCopy(item)}>復旧コピー {i+1} を書き出す</button></div>)}<p>正常なコピーは書き出したファイルを同じ検証手順で復元できます。破損・未知形式の原文は書出しによる保全だけを行い、自動修復しません。復旧コピーの削除機能はありません。</p></section>}
      <div className="modal-actions"><button type="button" className="button-secondary" disabled={busy} onClick={onClose}>閉じる</button></div>
    </div>
  </Modal>;
}
