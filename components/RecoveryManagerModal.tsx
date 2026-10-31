"use client";
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { deleteRecoveryCopy, exportRecoveryCopy, readRecoverySnapshot, RECOVERY_CHANGED_EVENT, type RecoverySlot, type RecoverySnapshot } from '../lib/recovery-manager';
import { MAX_RECOVERY_CODE_UNITS, RECOVERY_KEYS } from '../lib/restore-storage';
import { STORAGE_KEY } from '../lib/storage';
import { Modal } from './Modal';

const labels = { empty:'空き', valid:'保全レコードを識別済み', invalid:'保全レコードが不正（UNKNOWN）', 'unknown-version':'未知の保全形式（UNKNOWN）', unavailable:'取得不能（UNKNOWN）' };
const rows = [['history','計算履歴'],['notes','数学メモ'],['formulas','登録式'],['executions','実行入力'],['reports','関連レポート']] as const;
function Summary({slot}: {slot: RecoverySlot}) {
  const entry=slot.backup?.entries[0];
  return <dl className="recovery-fields">
    <div><dt>識別子</dt><dd>{slot.key}</dd></div>
    <div><dt>作成日時</dt><dd>{slot.copy?.createdAt ?? 'UNKNOWN（日時を補完しません）'}</dd></div>
    <div><dt>保存原文の長さ</dt><dd>{slot.copy ? slot.copy.raw === null ? '保存キーなしの記録' : `${slot.copy.raw.length.toLocaleString()} UTF-16コード単位` : 'UNKNOWN'}</dd></div>
    <div><dt>保全レコードの容量</dt><dd>{slot.serialized === null ? 'UNKNOWN' : `${slot.serialized.length.toLocaleString()} UTF-16コード単位`}</dd></div>
    <div><dt>検証状態</dt><dd>{labels[slot.status]}。{slot.message}</dd></div>
    <div><dt>保存形式 version</dt><dd>{slot.backup?.appStorageVersion ?? 'UNKNOWN'}</dd></div>
    <div><dt>復元用原文の検証</dt><dd>{slot.restoreValid ? '構造検証済み（数学的正しさ・真正性の保証ではありません）' : 'UNKNOWN／復元可能とは認定していません'}</dd></div>
    {rows.map(([key,label])=><div key={key}><dt>{label}</dt><dd>{slot.restoreValid ? entry?.counts?.[key]?.toLocaleString() ?? 'UNKNOWN' : 'UNKNOWN'}</dd></div>)}
  </dl>;
}
export function RecoveryManagerModal({onClose,blockedReason,generation,canApply,canInspect,onUncertain}: {
  onClose:()=>void; blockedReason:string; generation:number; canApply:()=>boolean; canInspect:()=>boolean; onUncertain:()=>void;
}) {
  const [snapshot,setSnapshot]=useState<RecoverySnapshot|null>(null);
  const [lockAvailable,setLockAvailable]=useState(false);
  const [selected,setSelected]=useState<string|null>(null);
  const [confirming,setConfirming]=useState<string|null>(null);
  const [approved,setApproved]=useState(false);
  const [busy,setBusy]=useState(false);
  const [invalid,setInvalid]=useState(true);
  const [terminal,setTerminal]=useState(false);
  const [message,setMessage]=useState('');
  const [problem,setProblem]=useState('');
  const current=useRef<RecoverySnapshot|null>(null);
  const token=useRef(0); const approval=useRef(false); const confirmKey=useRef<string|null>(null);
  const working=useRef(false); const finished=useRef(false); const alive=useRef(true);
  const callbacks=useRef({canApply,canInspect,onUncertain});
  const openedGeneration=useRef(generation);
  useLayoutEffect(()=>{callbacks.current={canApply,canInspect,onUncertain};},[canApply,canInspect,onUncertain]);
  const invalidate=(reason:string)=>{
    token.current++;current.current=null;approval.current=false;confirmKey.current=null;
    setInvalid(true);setApproved(false);setConfirming(null);setSelected(null);setMessage('');setProblem(reason);
  };
  const read=()=>{
    if(working.current||finished.current)return;
    invalidate('');setSnapshot(null);setLockAvailable(typeof navigator!=='undefined'&&!!navigator.locks);
    if(!callbacks.current.canInspect()){setProblem('アプリ状態が変わりました。この画面を閉じて開き直してください。');return;}
    try {
      const next=readRecoverySnapshot(localStorage);current.current=next;setSnapshot(next);setInvalid(!next.complete);
      if(!next.complete)setProblem(next.message || '一覧取得は不完全です。容量と操作可否はUNKNOWNです。');
    } catch {setProblem('保存領域を取得できません（UNKNOWN）。保全コピー0件とは判定していません。');}
  };
  useEffect(()=>{
    alive.current=true;
    const changed=(event:StorageEvent)=>{if(event.key===null||event.key===STORAGE_KEY||event.key.startsWith('calculation-memo:restore-recovery:'))invalidate('保存通知を受けたため、古い一覧・確認・承認を失効しました。一覧を再取得してください。');};
    window.addEventListener('storage',changed);
    const localChanged=()=>invalidate('同一タブの保全変更通知により確認と承認を失効しました。一覧を再取得してください。');
    window.addEventListener(RECOVERY_CHANGED_EVENT,localChanged);
    const timer=window.setTimeout(read,0);
    return()=>{alive.current=false;current.current=null;window.clearTimeout(timer);window.removeEventListener('storage',changed);window.removeEventListener(RECOVERY_CHANGED_EVENT,localChanged);};
    // Snapshot acquisition is explicit; new props must invalidate, never silently reacquire.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[]);
  useEffect(()=>{if(generation!==openedGeneration.current)invalidate('アプリ状態が変わったため確認を失効しました。この画面を閉じて開き直してください。');},[generation]);
  const valid=(s:RecoverySnapshot,t:number)=>alive.current&&!finished.current&&current.current===s&&token.current===t&&s.complete&&callbacks.current.canInspect();
  const select=(item:RecoverySlot)=>{
    const s=current.current;
    if(!s||!valid(s,token.current)||working.current)return;
    approval.current=false;confirmKey.current=null;setApproved(false);setConfirming(null);setSelected(item.key);setMessage('');setProblem('');
  };
  const askDelete=(item:RecoverySlot)=>{
    const s=current.current;
    if(!s||!valid(s,token.current)||working.current||!callbacks.current.canApply()||!navigator.locks||!item.copy)return;
    approval.current=false;confirmKey.current=item.key;setApproved(false);setConfirming(item.key);setSelected(item.key);setMessage('');setProblem('');
  };
  const cancel=()=>{approval.current=false;confirmKey.current=null;setApproved(false);setConfirming(null);setMessage('削除を取り消しました。保存内容は変更していません。');};
  const exportItem=(item:RecoverySlot)=>{
    const s=current.current; const t=token.current;
    if(!s||!valid(s,t)||working.current)return;
    setMessage('');setProblem('');let url:string|null=null;
    try {
      const output=exportRecoveryCopy(localStorage,s,item.key,()=>valid(s,t));
      if(!output.ok){invalidate(output.message);return;}
      url=URL.createObjectURL(new Blob([output.json],{type:'application/json;charset=utf-8'}));
      // URL allocation can fail; revalidate the source immediately before dispatch too.
      const checked=exportRecoveryCopy(localStorage,s,item.key,()=>valid(s,t));
      if(!checked.ok){invalidate(checked.message);return;}
      const a=document.createElement('a');a.href=url;a.download=output.filename;document.body.append(a);
      try{a.click();}finally{a.remove();}
      if(valid(s,t))setMessage(`「${item.key}」のダウンロードを要求しました（${output.filename}）。端末への保存完了は確認できません。ファイルを確認してください。`);
    } catch {invalidate('読取またはダウンロード要求に失敗しました。保存内容は変更していません。一覧を再取得してください。');}
    finally{if(url){const value=url;window.setTimeout(()=>URL.revokeObjectURL(value),60_000);}}
  };
  const execute=async()=>{
    const s=current.current; const key=confirmKey.current; const t=token.current;
    if(!s||!key||!approval.current||!valid(s,t)||!callbacks.current.canApply()||working.current)return;
    working.current=true;setBusy(true);setMessage('');setProblem('');
    try {
      const result=await deleteRecoveryCopy(localStorage,s,key,()=>approval.current&&confirmKey.current===key&&valid(s,t)&&callbacks.current.canApply());
      const lateInvalidation=result.status==='verified'&&!valid(s,t);
      approval.current=false;confirmKey.current=null;setApproved(false);setConfirming(null);
      if(result.status==='unknown'||lateInvalidation){
        finished.current=true;setTerminal(true);invalidate(lateInvalidation?'削除後に確認状態が失効したため結果はUNKNOWNです。自動再試行はしません。':result.message);
        try{callbacks.current.onUncertain();}catch{/* Keep terminal protection even if the parent cannot update. */}return;
      }
      if(result.status==='aborted'){invalidate(result.message);return;}
      token.current++;setSelected(null);
      const next=readRecoverySnapshot(localStorage);current.current=next;setSnapshot(next);setInvalid(!next.complete);
      setMessage(result.message);if(!next.complete)setProblem(next.message);
    } catch {
      // A thrown asynchronous boundary cannot prove that no remove was attempted.
      finished.current=true;setTerminal(true);invalidate('削除結果を確認できません（UNKNOWN）。自動再試行はしません。');
      try{callbacks.current.onUncertain();}catch{/* Keep terminal protection even if the parent cannot update. */}
    } finally {working.current=false;if(alive.current)setBusy(false);}
  };
  const ordered=snapshot?.slots.filter(item=>item.status!=='empty').slice().sort((a,b)=>{
    if(a.copy&&b.copy)return Date.parse(b.copy.createdAt)-Date.parse(a.copy.createdAt)||a.key.localeCompare(b.key);
    if(a.copy)return -1;if(b.copy)return 1;return a.key.localeCompare(b.key);
  })??[];
  const selectedItem=ordered.find(item=>item.key===selected);
  const confirmation=ordered.find(item=>item.key===confirming);
  const disabled=busy||invalid||terminal;
  const usage=invalid?null:snapshot;
  const close=()=>{if(!working.current)onClose();};
  return <Modal title="復旧用保全コピーの管理" onClose={close} closeDisabled={busy}>
    <div className="recovery-manager" onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();e.stopPropagation();}}}>
      <p>復元前の保存原文を、このブラウザの別キーへ保全したコピーです。通常のJSONバックアップとは別に保持され、自動削除・上書きはしません。閲覧だけでは保存内容を変更しません。</p>
      <p>サイトデータの消去・端末故障では現在のデータと一緒に失われる場合があります。私的な内容を含むため、書き出したファイルの保存先・共有先にも注意してください。</p>
      <button type="button" className="button-secondary" disabled={busy||terminal} onClick={read}>一覧を再取得</button>
      {!lockAvailable&&<p>Web Locksを利用できないため個別削除はできません。読み取り専用の確認・書き出しを利用してください。</p>}
      {blockedReason&&<p role="alert">{blockedReason} 読み取り専用の確認と書き出しは可能な範囲で行えます。削除はできません。</p>}
      <section aria-label="保全領域の使用状況">
        <h3>容量・使用状況</h3>
        <p>使用スロット: {usage?.usedSlots??'UNKNOWN'} / {RECOVERY_KEYS.length} ／ 空きスロット: {usage?.freeSlots??'UNKNOWN'}</p>
        <p>合計使用容量: {usage?.usedCodeUnits?.toLocaleString()??'UNKNOWN'} / {MAX_RECOVERY_CODE_UNITS.toLocaleString()} UTF-16コード単位（保全レコード全体）。ファイルのバイト数とは異なります。</p>
        <p>新規コピー作成: {usage?.canCreate==='possible'?'論理上の空きあり。実際の作成時に必要容量・保存可能性を再確認します。':usage?.canCreate==='blocked'?'作成を停止する状態です。満杯・不正な保全レコード等を確認してください。':'UNKNOWN（取得不完全または必要容量未確定）'} ブラウザの実容量は別の制限です。</p>
      </section>
      {!snapshot&&!problem&&<p role="status">一覧を読み取っています。</p>}
      {!invalid&&snapshot?.complete&&ordered.length===0&&<p>保全コピーはありません。</p>}
      {invalid&&snapshot&&<p>表示中の一覧は未確認または失効しています。古い一覧からの操作はできません。</p>}
      <section aria-label="保全コピー一覧">
        {ordered.map(item=><article key={item.key} data-recovery-key={item.key} aria-label={`復旧コピー ${item.key}`}>
          <h3>{item.key}</h3>
          <p>作成日時: {item.copy?.createdAt??'UNKNOWN'}<br />保存原文: {item.copy ? item.copy.raw===null?'保存キーなしの記録':`${item.copy.raw.length.toLocaleString()} UTF-16コード単位`:'UNKNOWN'}</p>
          <p>{labels[item.status]}。{item.message}</p>
          <p>データ概要: {item.restoreValid&&item.backup?.entries[0].counts ? rows.map(([key,label])=>`${label} ${item.backup!.entries[0].counts![key]}`).join(' ／ '):'UNKNOWN（未検証値を0件と表示しません）'}</p>
          <div className="recovery-actions">
            <button type="button" className="button-secondary" disabled={disabled} onClick={()=>select(item)}>詳細を表示</button>
            <button type="button" className="button-secondary" disabled={disabled||!item.copy||item.copy.raw===null||!item.backup} onClick={()=>exportItem(item)}>JSONを書き出す</button>
            <button type="button" className="button-danger" disabled={disabled||!lockAvailable||!!blockedReason||!item.copy} onClick={()=>askDelete(item)}>削除を確認</button>
          </div>
          {!item.copy&&<p>管理対象の同定ができないため削除・書き出しを停止します。占有している領域を自動清掃しません。</p>}
          {item.copy?.raw===null&&<p>元の保存キーがなかったことを記録しています。復元用データのJSONはありません。</p>}
        </article>)}
      </section>
      {selectedItem&&!invalid&&<section aria-label="保全コピーの詳細"><h3>読み取り専用の詳細</h3><Summary slot={selectedItem}/><p>現在保存原文との比較: {snapshot?.complete&&selectedItem.copy ? selectedItem.copy.raw===snapshot.currentRaw?'完全一致':'異なります':'UNKNOWN'}。取得時点の原文比較であり、件数一致を内容一致とは扱いません。</p><button type="button" className="button-secondary" disabled={busy} onClick={()=>{if(!working.current){cancel();setSelected(null);}}}>詳細を閉じる</button></section>}
      {confirmation&&!invalid&&<section aria-label="個別削除の確認" className="recovery-confirmation">
        <h3>この1件を削除しますか</h3><Summary slot={confirmation}/>
        <p>このコピーを削除すると、この原文へ復旧できなくなる可能性があります。必要なら先にJSONを書き出し、端末に保存されたファイルを自分で確認してください。ダウンロード要求だけでは安全な保管の保証になりません。</p>
        <label className="recovery-delete-approval"><input type="checkbox" checked={approved} disabled={disabled||!lockAvailable||!!blockedReason} onChange={e=>{const s=current.current;if(!s||!valid(s,token.current)||working.current||!callbacks.current.canApply())return;approval.current=e.target.checked;setApproved(e.target.checked);}}/>このコピーの削除を承認します</label>
        <p>Enterでは削除しません。承認後に最終ボタンをタップするか、フォーカスしてSpaceで明示操作してください。</p>
        <div className="recovery-actions"><button type="button" className="button-secondary" disabled={busy} onClick={cancel}>削除を取り消す</button><button type="button" className="button-danger" disabled={disabled||!lockAvailable||!!blockedReason||!approved} onClick={()=>void execute()}>このコピーだけ削除する</button></div>
      </section>}
      {busy&&<p role="status">確認・処理中です。重複操作は受け付けません。</p>}
      {problem&&<p role="alert">{problem}</p>}{message&&<p role="status">{message}</p>}
      {terminal&&<p>結果が不明なため、この画面での追加操作を停止しました。コピーや現在原文を勝手に補正・巻戻ししません。閉じて保存状態を確認してください。</p>}
      <div className="modal-actions"><button type="button" className="button-secondary" disabled={busy} onClick={close}>閉じる</button></div>
    </div>
  </Modal>;
}
