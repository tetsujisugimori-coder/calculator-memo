"use client";
import type { SafetyCandidate, PreflightResult } from '../lib/selective-restore-safety';

export function RestoreSafetyPanel({ candidate, preflight, stale, disabled, onPrepare, onCheck }: {
  candidate: SafetyCandidate | null; preflight: PreflightResult | null; stale: boolean; disabled: boolean; onPrepare: () => void; onCheck: () => void;
}) {
  return <section className="restore-plan" aria-label="Stage 3A 実行準備（読み取り専用）">
    <h3>Stage 3A 実行準備（読み取り専用）</h3>
    <p><strong>事前検証の成功は実行許可ではありません。選択復元の実行は禁止中です。</strong>保存原文・保全コピーを変更しません。</p>
    <button type="button" disabled={disabled} onClick={onPrepare}>原文保持候補を明示的に生成</button>
    <p role="status" data-testid="restore-safety-state">{stale ? 'STALE: 前提が変更されたため旧判定を撤回しました。' : candidate ? `原文保持・候補生成: ${candidate.status}` : '原文保持・候補生成: 未検証（UNKNOWN）'}</p>
    {candidate && !stale && <>
      <p>非変更区間: {candidate.status === 'PASS' ? `${candidate.preserved.length}区間でUTF-16原文完全一致` : '未証明'} / 変更対象: {candidate.edits.reduce((n, edit) => n + edit.keys.length, 0)}件 / 変更不要選択: {candidate.unchangedKeys.length}件</p>
      <p>判定理由: {(candidate.reasons[0] ?? candidate.unknowns[0] ?? "UNKNOWN").slice(0, 240)}</p>
      <details><summary>変更対象・非変更対象と拒否理由</summary>
        <p>変更区間の外側はすべて現在原文のままです。親全体の選択にはその子データを含みます。</p>
        <ul>{candidate.edits.map((edit, index) => <li key={index}>{edit.keys.join(', ')}: UTF-16 [{edit.start}, {edit.end})</li>)}</ul>
        <ul>{[...candidate.reasons, ...candidate.unknowns].map((reason, index) => <li key={index}>{reason}</li>)}</ul>
      </details>
      <button type="button" disabled={disabled || candidate.status !== 'PASS'} onClick={onCheck}>実行直前条件を読み取り専用で再検証</button>
      <p role="status" data-testid="restore-safety-preflight">直前再検証: {preflight?.status ?? '未実施（UNKNOWN）'}</p>
      {preflight && <p>{preflight.reasons.join(' ')}</p>}
    </>}
    <p>未対応: 欠けた保存配列の生成、子だけの変更、設定・未知領域。参照不足・矛盾・不明は停止します。</p>
    <p>次段階には明示承認・保全コピーの読戻し・排他と単一書込み後の照合が必要です。localStorageに原子的CASはなく、Web Locksでも非協調タブの変更や確認後の競合は防げません。</p>
  </section>;
}
