"use client";

import { useRef, useState } from "react";
import { CalculationTrialPreview } from "./CalculationTrialPreview";
import { useCalculationTrial } from "./useCalculationTrial";
import { DependencyGraph } from "./DependencyGraph";
import { buildCalculationStatus, type CalculationAttempt } from "../lib/calculation-status";
import { CalculationStatusDetails, DependencyMermaidExport } from "./CalculationStatusDetails";
import { analyzeBlockDependencies, isManualMemo, markCalculationsStale, recalculateReferenceMemo, REFERENCE_MODE, staleBlockIds } from "../lib/block-references";
import { VariableIdentification } from "./Identification";
import type { MemoBlock } from "../lib/types";
import { calculateMemoBlock, describeCalculationBlock, recalculateMemoBlocks } from "../lib/memo-blocks";
import { KatexFormula, validateLatex } from "./KatexFormula";
import { MarkdownContent } from "./MarkdownContent";

type Props = {
  memoKey?: string;
  sourceRevision?: string;
  blocks: MemoBlock[];
  manual?: boolean;
  onChange: (blocks: MemoBlock[]) => void;
  onOpenGuide: (insert: (latex: string) => void) => void;
};

const makeBlockId = (kind: MemoBlock["type"]) => `${kind}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

export function MemoBlockEditor({ blocks, onChange, onOpenGuide, manual = false, memoKey = "editor", sourceRevision = "" }: Props) {
  const [attempt, setAttempt] = useState<CalculationAttempt>();
  const [baseline, setBaseline] = useState<MemoBlock[]>(blocks);
  const [baselineKnown, setBaselineKnown] = useState(() => !isManualMemo(blocks) || staleBlockIds(blocks).size === 0);
  const [graphSelected, setGraphSelected] = useState<string>();
  const trialButton = useRef<HTMLButtonElement>(null);
  const cards = useRef(new Map<string, HTMLElement>());
  const manualMode = manual || isManualMemo(blocks);
  const stale = staleBlockIds(blocks);
  const graph = analyzeBlockDependencies(blocks);
  const statusReport = buildCalculationStatus(blocks, { baseline, baselineKnown, attempt });
  const { trial, trialMessage, validTrial, pendingTrial, preview, applyTrial, invalidateTrial, clearTrial } = useCalculationTrial({
    blocks, memoKey, sourceRevision, baseline, baselineKnown,
    onApply: result => { onChange(result.blocks); setAttempt(result); setBaseline(result.blocks); setBaselineKnown(true); trialButton.current?.focus(); },
  });
  const locate = (id: string) => {
    const card = cards.current.get(id);
    if (!card || !blocks.some(block => block.id === id)) return;
    setGraphSelected(id);
    card.focus({ preventScroll: true });
    // Selection adds explanatory UI above the cards. Scroll after that layout
    // commit so the destination is not shifted out of view by our own update.
    requestAnimationFrame(() => {
      const current = cards.current.get(id);
      if (current !== card || !current.isConnected) return;
      (current.querySelector(".block-graph-location") ?? current).scrollIntoView({ block: "center", behavior: "auto" });
    });
  };
  const change = (next: MemoBlock[], calculationChanged = true) => {
    invalidateTrial();
    setAttempt(undefined);
    const result = manualMode || isManualMemo(next)
      ? calculationChanged ? markCalculationsStale(next) : next
      : recalculateMemoBlocks(next);
    if (!manualMode && !isManualMemo(next)) {
      setBaseline(result);
      setBaselineKnown(true);
    }
    onChange(result);
  };
  const recalculate = () => {
    clearTrial();
    const result = recalculateReferenceMemo(blocks);
    onChange(result.blocks);
    setAttempt({ ...result });
    if (result.success) {
      setBaseline(result.blocks);
      setBaselineKnown(true);
    }
  };
  const addBlock = (type: MemoBlock["type"], legacyVariables = false) => {
    const id = makeBlockId(type);
    const block: MemoBlock = type === "text"
      ? { id, type, content: "" }
      : type === "formula"
        ? { id, type, latex: "" }
        : legacyVariables
          ? calculateMemoBlock(id, "", "note-variables")
          : { id, type: "calculation", evaluationMode: REFERENCE_MODE, references: { version: 1, entries: [] },
            expression: "", displayExpression: "", result: null, resultText: "", error: null };
    change([...blocks, block], type === "calculation");
  };

  const updateBlock = (id: string, update: (block: MemoBlock) => MemoBlock) => {
    change(blocks.map((block) => block.id === id ? update(block) : block), blocks.find(b => b.id === id)?.type === "calculation");
  };

  const removeBlock = (id: string) => change(blocks.filter((block) => block.id !== id), blocks.find(b => b.id === id)?.type === "calculation");

  const moveBlock = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= blocks.length) return;
    const next = [...blocks];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    change(next);
  };

  return (
    <div className="memo-block-editor">
      <div className="block-add-toolbar" aria-label="ブロックを追加">
        <span><strong>本文ブロック</strong><small>文章・数式・計算を順番に組み立てます</small></span>
        <div>
          <button type="button" onClick={() => addBlock("text")}>＋ 文章</button>
          <button type="button" onClick={() => addBlock("formula")}>＋ 数式</button>
          <button type="button" onClick={() => addBlock("calculation")}>＋ 計算</button>
          <button type="button" onClick={() => addBlock("calculation", true)}>＋ 旧変数計算</button>
        </div>
      </div>

      {!blocks.length && <div className="empty-state block-empty"><span>＋</span><h3>最初のブロックを追加</h3><p>文章、KaTeX数式、評価できる計算式を自由な順序で混在できます。</p></div>}

      {manualMode && <div className="block-reference-controls">
        <button type="button" onClick={recalculate}>メモ全体を再計算</button>
        <button ref={trialButton} type="button" onClick={preview} disabled={pendingTrial}>試算する</button>
        <p className="block-help">再計算は成功時に編集内容へ即時反映します。試算は結果を変えずに比較し、「結果を反映」で一括反映します。どちらも永続保存は「保存する」です。</p>
        {pendingTrial && <p role="status">試算中です。結果はまだ反映していません。</p>}
        {trialMessage && <p role="status">{trialMessage}</p>}
        {trial && <CalculationTrialPreview trial={trial} blocks={blocks} valid={validTrial} onApply={applyTrial} onLocate={locate} />}
        <p role="status">{stale.size ? "メモ全体は再計算待ちです。表示中の結果は保持されています。変更・影響の内訳は各ブロックで確認できます。" : "計算結果は確定済みです。"}</p>
        {statusReport.globalMessages.map((message, index) => <p className={message.startsWith("一括確定を停止:") ? "block-transaction-notice" : "block-help"} role="status" key={index}>{message}</p>)}
        <details><summary>ⓘ 参照と再計算について</summary><p>参照は同じメモのブロックIDに結び付き、上下移動しても参照先は変わりません。参照モードは変数を定義せず、変数を使うブロックの結果を選択して利用します。このメモは手動再計算方式を維持します。編集・保存では再計算しません。全体が成功したときだけ結果を一括確定します。無関係の空式やエラーがある場合も確定を停止します。「一括確定を停止」はメモ全体の通知で、各ブロック自身の計算エラーを意味するものではありません。</p></details>
      </div>}
      <p className="block-help">「＋ 計算」はID参照方式です。数値だけの式も使え、参照先は一覧から選べます。旧方式で名前付き変数を追加する場合は「＋ 旧変数計算」を選びます。既存の変数はこのメモ内だけで有効です。変数モードだけは従来どおり上から順に評価します。ID参照の評価順は依存関係で決まります。再代入は後のブロックだけに反映され、文章・数式ブロックは変数を定義しません。再代入に失敗した場合は以前の有効な値を維持します。</p>
      {blocks.some(block => block.type === "calculation") && <><DependencyGraph blocks={blocks} report={statusReport} onLocate={locate} /><DependencyMermaidExport text={statusReport.mermaid} /></>}
      <div className="block-editor-list">
        {blocks.map((block, index) => {
          const calculation = block.type === "calculation" ? (block.evaluationMode === "note-variables" ? describeCalculationBlock(block.expression) : { expression: block.expression }) : null;
          const label = block.type === "text" ? "文章" : block.type === "formula" ? "数式" : "計算";
          return (
            <article className={`block-editor-card ${block.type} ${graphSelected === block.id ? "block-graph-selected" : ""}`} data-block-id={block.id} key={block.id} tabIndex={-1} ref={element => { if (element) cards.current.set(block.id, element); else cards.current.delete(block.id); }}>
              <header>
                <div><span className="block-order">{index + 1}</span><strong>{label}ブロック</strong></div>
                <div className="block-card-actions">
                  <button type="button" onClick={() => moveBlock(index, -1)} disabled={index === 0} aria-label={`${label}ブロックを上へ移動`}>↑ 上へ</button>
                  <button type="button" onClick={() => moveBlock(index, 1)} disabled={index === blocks.length - 1} aria-label={`${label}ブロックを下へ移動`}>↓ 下へ</button>
                  <button type="button" className="danger" onClick={() => removeBlock(block.id)} aria-label={`${label}ブロックを削除`}>削除</button>
                </div>
              </header>

              {block.type === "text" && <>
                <label>Markdown文章<textarea rows={5} value={block.content} onChange={(event) => updateBlock(block.id, (current) => current.type === "text" ? { ...current, content: event.target.value } : current)} placeholder="説明、証明、計算過程などをMarkdownで入力" /></label>
                {block.content.trim() && <div className="block-live-preview"><span>プレビュー</span><MarkdownContent content={block.content} /></div>}
              </>}

              {block.type === "formula" && (() => {
                const formulaError = validateLatex(block.latex);
                return <>
                  <div className="label-row"><label htmlFor={`formula-${block.id}`}>KaTeX入力</label><button type="button" onClick={() => onOpenGuide((latex) => updateBlock(block.id, (current) => current.type === "formula" ? { ...current, latex: `${current.latex}${latex}` } : current))}>数式ガイドから挿入</button></div>
                  <textarea id={`formula-${block.id}`} className="code-input" rows={3} value={block.latex} onChange={(event) => updateBlock(block.id, (current) => current.type === "formula" ? { ...current, latex: event.target.value } : current)} placeholder="\frac{a}{b}" />
                  {formulaError ? <p className="field-error" role="status">{formulaError}</p> : <div className="block-live-preview formula"><span>表示例</span><KatexFormula latex={block.latex} block /></div>}
                  <p className="block-help">表示専用です。数値の計算結果は生成しません。</p>
                </>;
              })()}

              {block.type === "calculation" && <>
                {graphSelected === block.id && <div className="block-graph-location"><span>図・診断から移動: ブロック {index + 1}</span><button type="button" onClick={() => cards.current.get(block.id)?.querySelector<HTMLInputElement>("input.code-input")?.focus()}>選択ブロックの計算式を編集</button></div>}
                <CalculationStatusDetails blockId={block.id} blocks={blocks} report={statusReport} onLocate={locate} />
                {block.evaluationMode !== REFERENCE_MODE && <button type="button" onClick={() => updateBlock(block.id, current => current.type === "calculation" ? { ...current, evaluationMode: REFERENCE_MODE, references: { version: 1, entries: [] } } : current)}>参照モードに切替（メモを手動再計算にする）</button>}
                {block.evaluationMode === REFERENCE_MODE ? <div className="block-reference-controls">
                  <label>参照先を選んで式に挿入<select value="" onChange={event => {
                    const target = event.target.value;
                    if (!target) return;
                    const entries = block.references?.entries ?? [];
                    const existing = entries.find(e => e.blockId === target);
                    const slot = existing?.slot ?? Array.from({ length: 128 }, (_, i) => i + 1).find(n => !entries.some(e => e.slot === n));
                    if (!slot) return;
                    updateBlock(block.id, current => current.type === "calculation" ? { ...current, expression: `${current.expression}@{${slot}}`, references: { ...current.references!, entries: existing ? entries : [...entries, { slot, blockId: target }] } } : current);
                  }}><option value="">計算ブロックを選択</option>{blocks.filter(b => b.type === "calculation").map(b => <option key={b.id} value={b.id} disabled={(block.references?.entries.length ?? 0) >= 128 && !block.references?.entries.some(e => e.blockId === b.id)}>ブロック {blocks.indexOf(b) + 1}: {b.type === "calculation" ? b.expression || "式未入力" : ""}</option>)}</select></label>
                  <p className="block-help">参照モード：@&#123;番号&#125; は選択した計算結果です。掛け算は * を入力します。変数名・登録式名を呼び出す機能ではありません。</p>
                  {(block.references?.entries.length ?? 0) >= 128 && <p role="status">参照枠の上限128件です。新しい参照先は追加できません。既に登録した参照は選択できます。</p>}
                  <ul>{block.references?.entries.map(e => <li key={e.slot}>@{`{${e.slot}}`} → {blocks.some(b => b.id === e.blockId) ? `ブロック ${blocks.findIndex(b => b.id === e.blockId) + 1}` : "参照先削除済み"}</li>)}</ul>
                  {graph.errors.has(block.id) && <p className="field-error" role="status">再計算前の解析: {graph.errors.get(block.id)}</p>}
                </div> : block.evaluationMode === undefined ? <div className="block-help">
                  <p>従来の計算モードです。変数モードでは x/X は変数になり、掛け算は * で入力します。</p>
                  <button type="button" onClick={() => updateBlock(block.id, (current) => current.type === "calculation" ? { ...current, evaluationMode: "note-variables" } : current)}>変数を使う</button>
                </div> : <p className="block-help">変数モード：掛け算は * で入力します。x/X は変数名です。</p>}
                <label>計算式<input className="code-input" value={block.expression} onChange={(event) => updateBlock(block.id, (current) => current.type === "calculation" ? { ...current, expression: event.target.value } : current)} placeholder={block.evaluationMode === REFERENCE_MODE ? "例：1200 * 5 または @{1} * 5" : "例：price = 1200 または price * 5"} /></label>
                {block.evaluationMode === "note-variables" && <VariableIdentification expression={block.expression} assignment />}
                <p className="calculation-expression"><span>計算式</span> <code>{calculation?.expression || "式未入力"}</code></p>
                <div className={`calculation-live-result ${block.error ? "has-error" : ""}`} aria-live="polite">
                  <span>{statusReport.states.get(block.id)?.oldResult ? "旧結果（保持中・未確定）" : "計算結果"}{calculation?.variableName && <> <code>{calculation.variableName}</code></>}</span>
                  {block.error ? <p role="status">{block.error}</p> : <strong>= {block.resultText}</strong>}
                </div>
                {(attempt?.blocks === blocks ? attempt.diagnostics : []).filter(d => d.blockId === block.id && !graph.errors.has(block.id)).map((diagnostic, i) =>
                  <p key={i} role="status" className="field-error block-attempt-diagnostic">{diagnostic.code === "blocked-reference" ? "今回の依存エラー" : "今回の計算エラー"}: {diagnostic.message}</p>)}
                <p className="block-help">使用可能: 数値、四則、小数、括弧、負数、累乗（<code>^</code>）、sqrt・abs（1引数）、定数pi・e。%は従来の四則式だけで使用できます。変数名は英字で始め、英数字と_を使用します（例：subtotal = price * quantity）。LaTeX、その他の関数は使用できません。</p>
              </>}
            </article>
          );
        })}
      </div>
    </div>
  );
}
