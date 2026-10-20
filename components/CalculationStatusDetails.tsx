"use client";

import { useId, useState } from "react";
import type { CalculationStatusReport } from "../lib/calculation-status";
import type { MemoBlock } from "../lib/types";

type Props = {
  context?: "trial";
  blockId: string;
  blocks: MemoBlock[];
  report: CalculationStatusReport;
  onLocate: (id: string) => void;
};

/** Presentation only: every diagnosis comes from the read-only status report. */
export function CalculationStatusDetails({ blockId, blocks, report, onLocate, context }: Props) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const state = report.states.get(blockId);
  if (!state) return null;
  const number = blocks.findIndex(block => block.id === blockId) + 1;
  const name = (id: string) => {
    const index = blocks.findIndex(block => block.id === id);
    const block = blocks[index];
    return block?.type === "calculation"
      ? `ブロック ${index + 1}: ${block.expression || "式未入力"}`
      : "削除済み・存在しないブロック";
  };
  const related = (ids: string[]) => ids.length ? <ul className="block-diagnostic-links">{[...new Set(ids)].map(id => <li key={id}>
    {blocks.some(block => block.id === id) ? <button type="button" onClick={() => onLocate(id)}>{name(id)}へ移動</button> : <span>{name(id)}</span>}
    <small>ID: {id}</small>
  </li>)}</ul> : <span>確認できた対象なし</span>;
  return <section className="block-status" data-state-kind={state.kind}>
    <div className="block-status-summary">
      <span className={`block-state-badge state-${state.kind}`}>{state.label}</span>
      {state.change === "changed" && state.kind !== "changed" && <span className="block-state-badge state-changed">変更あり・未再計算</span>}
      {state.change === "affected" && state.kind !== "affected" && <span className="block-state-badge state-affected">変更の影響あり・未再計算</span>}
      {state.uncertain && <span className="block-help">影響は未確定の候補</span>}
      <button type="button" className="block-info-button" aria-label={`ブロック ${number} の状態とエラー詳細`} aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(value => !value)}>i</button>
    </div>
    {open && <div id={panelId} className="block-diagnostic-details">
      <h4>ブロック {number} の状態と診断</h4>
      <p>{state.label}{state.uncertain ? "。影響範囲には未確定の候補を含みます。" : "。"}</p>
      <p className="block-help">内部ID: {blockId}</p>
      <p>{report.coverage}</p>
      {report.impact && state.change !== "none" && <section className="block-diagnostic-item">
        <h5>この編集画面で確認した変更</h5>
        <p>{state.change === "changed" ? "このブロックの式・参照などが比較元から変わっています。" : state.change === "affected" ? "変更前後の依存関係から、再計算が必要となる可能性があります。" : "以前の変更前データがなく、このブロックの変更元は確定できません。"}</p>
        <dl>
          <div><dt>変更元（メモ全体）</dt><dd>{related(report.impact.changedIds)}</dd></div>
          <div><dt>変更・影響候補（メモ全体）</dt><dd>{related(report.impact.affectedIds)}</dd></div>
        </dl>
        <p className="block-help">上の一覧はメモ全体で確認できた範囲です。すべてがこのブロックだけを原因とする、という意味ではありません。</p>
      </section>}
      {!state.details.length && <p>{state.oldResult ? "表示している値は保持中の結果です。今回の編集内容でメモ全体の確定はまだ完了していません。" : "このブロックについて確認できた問題はありません。"}</p>}
      {state.details.map((detail, index) => <section className="block-diagnostic-item" key={`${detail.category}-${detail.phase}-${index}`}>
        <h5>{detail.title}</h5>
        <p className="block-diagnostic-phase">{detail.phase === "before" ? "再計算前の解析" : detail.phase === "attempt" ? context === "trial" ? "今回の試算で確認（未反映）" : "今回の再計算で確認" : "保存・保持している結果の記録"}</p>
        <dl>
          {detail.phase === "saved"
            ? <div><dt>過去の式・影響範囲</dt><dd>過去の失敗時の式・影響範囲は、この記録だけでは確定できません。</dd></div>
            : <div><dt>問題となった式</dt><dd><code>{detail.expression || "式未入力"}</code></dd></div>}
          <div><dt>説明</dt><dd>{detail.message}</dd></div>
          <div><dt>{detail.phase === "saved" ? "記録されているブロック（現在の表示）" : "原因・参照先"}</dt><dd>{related(detail.sourceIds)}</dd></div>
          {detail.phase !== "saved" && <div><dt>影響を受けるブロック</dt><dd>{related(detail.affectedIds)}</dd></div>}
          <div><dt>確認・修正すること</dt><dd>{detail.remedy}</dd></div>
        </dl>
      </section>)}
    </div>}
  </section>;
}

export function DependencyMermaidExport({ text, comparison = false }: { text: string; comparison?: boolean }) {
  const [copyResult, setCopyResult] = useState<{ text: string; message: string }>();
  const copyMessage = copyResult?.text === text ? copyResult.message : "";
  const copy = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(text);
      setCopyResult({ text, message: "Mermaid文字列をコピーしました。" });
    } catch {
      setCopyResult({ text, message: "コピーできませんでした。下の文字列を選択して手動でコピーしてください。" });
    }
  };
  return <details className="block-mermaid-export" onToggle={() => setCopyResult(undefined)}>
    <summary>{comparison ? '比較図をMermaidで取り出す' : '依存関係をMermaidで取り出す'}</summary>
    <p className="block-help">{comparison && '比較図には変更前の削除線・ノードも含みます。＋追加・−削除のラベルと数値比較の状態を確認してください。'}図は現在の式・参照と、ここで確認できた状態を表します。点線は未確定の依存候補です。数値計算やMemo Nexusへの送信は行いません。</p>
    <textarea aria-label={comparison ? "Mermaid変更比較図" : "Mermaid依存関係図"} readOnly rows={7} value={text} spellCheck={false} />
    <button type="button" onClick={copy}>Mermaid文字列をコピー</button>
    {copyMessage && <p role="status">{copyMessage}</p>}
  </details>;
}
