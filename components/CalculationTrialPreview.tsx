"use client";
import type { CalculationTrial } from '../lib/calculation-trial';
import type { MemoBlock } from '../lib/types';
import { CalculationStatusDetails } from './CalculationStatusDetails';

export function CalculationTrialPreview({ trial, blocks, valid, onApply, onLocate }: {
  trial: CalculationTrial; blocks: MemoBlock[]; valid: boolean; onApply: () => void; onLocate: (id: string) => void;
}) {
  return <section className="calculation-trial" aria-label="試算・差分プレビュー">
    <h3>試算・差分プレビュー（未反映）</h3>
    <p role="status">{valid ? trial.report.coverage : 'この試算は失効しました。入力が変わったため、再試算してください。'}</p>
    <p className="block-help">現在値は編集中のメモが保持している結果です。反映は編集内容への一括確定で、永続保存は「保存する」で行います。差分は丸め前の内部値の比較・減算です（浮動小数点の精度）。</p>
    <button type="button" onClick={onApply} disabled={!valid || !trial.evaluation.success}>結果を反映</button>
    {trial.report.globalMessages.map((message, index) => <p key={index} className="block-help">{message}</p>)}
    <div className="calculation-trial-cards">{trial.rows.map(row => <article key={row.blockId} data-trial-block-id={row.blockId}>
      <h4>ブロック {row.number}: <code>{row.expression || '式未入力'}</code></h4>
      <small>内部ID: {row.blockId}</small>
      <p>{row.state === 'success' ? '試算成功・未反映' : row.state === 'failed' ? '試算失敗・未反映' : '数値評価は未試行'}</p>
      <dl>
        <div><dt>現在保持している結果</dt><dd>{row.previousEvidence === 'saved-error' ? '保存・保持しているエラー（現在式の失敗とは限りません）' : row.previous === null ? '比較できる数値なし' : `${row.previousText}（内部値: ${String(row.previous)}）`}{row.previousEvidence === 'old' && '／旧結果・メモ全体は未確定'}</dd></div>
        <div><dt>試算結果</dt><dd>{row.state === 'success' ? `${row.resultText}（内部値: ${String(row.result)}）` : row.error ?? '未試行（数値結果は未確認）'}</dd></div>
        <div><dt>数値差分</dt><dd>{row.differenceState === 'same' ? '0（内部値が同じ）' : row.differenceState === 'changed' ? `${row.difference! > 0 ? '+' : ''}${String(row.difference)}` : '比較不可（成功した新旧の有限数値が必要です）'}</dd></div>
      </dl>
      {valid && <CalculationStatusDetails blockId={row.blockId} blocks={blocks} report={trial.report} onLocate={onLocate} context="trial" />}
    </article>)}</div>
  </section>;
}
