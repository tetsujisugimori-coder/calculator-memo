"use client";

import type { MemoBlock } from "../lib/types";
import { calculateMemoBlock } from "../lib/memo-blocks";
import { KatexFormula, validateLatex } from "./KatexFormula";
import { MarkdownContent } from "./MarkdownContent";

type Props = {
  blocks: MemoBlock[];
  onChange: (blocks: MemoBlock[]) => void;
  onOpenGuide: (insert: (latex: string) => void) => void;
};

const makeBlockId = (kind: MemoBlock["type"]) => `${kind}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

export function MemoBlockEditor({ blocks, onChange, onOpenGuide }: Props) {
  const addBlock = (type: MemoBlock["type"]) => {
    const id = makeBlockId(type);
    const block: MemoBlock = type === "text"
      ? { id, type, content: "" }
      : type === "formula"
        ? { id, type, latex: "" }
        : calculateMemoBlock(id, "");
    onChange([...blocks, block]);
  };

  const updateBlock = (id: string, update: (block: MemoBlock) => MemoBlock) => {
    onChange(blocks.map((block) => block.id === id ? update(block) : block));
  };

  const removeBlock = (id: string) => onChange(blocks.filter((block) => block.id !== id));

  const moveBlock = (index: number, direction: -1 | 1) => {
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= blocks.length) return;
    const next = [...blocks];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    onChange(next);
  };

  return (
    <div className="memo-block-editor">
      <div className="block-add-toolbar" aria-label="ブロックを追加">
        <span><strong>本文ブロック</strong><small>文章・数式・計算を順番に組み立てます</small></span>
        <div>
          <button type="button" onClick={() => addBlock("text")}>＋ 文章</button>
          <button type="button" onClick={() => addBlock("formula")}>＋ 数式</button>
          <button type="button" onClick={() => addBlock("calculation")}>＋ 計算</button>
        </div>
      </div>

      {!blocks.length && <div className="empty-state block-empty"><span>＋</span><h3>最初のブロックを追加</h3><p>文章、KaTeX数式、評価できる計算式を自由な順序で混在できます。</p></div>}

      <div className="block-editor-list">
        {blocks.map((block, index) => {
          const label = block.type === "text" ? "文章" : block.type === "formula" ? "数式" : "計算";
          return (
            <article className={`block-editor-card ${block.type}`} key={block.id}>
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
                <label>計算式<input className="code-input" value={block.expression} onChange={(event) => updateBlock(block.id, () => calculateMemoBlock(block.id, event.target.value))} placeholder="例：200*(5%+5%)" /></label>
                <div className={`calculation-live-result ${block.error ? "has-error" : ""}`} aria-live="polite">
                  <span>計算結果</span>
                  {block.error ? <p role="status">{block.error}</p> : <strong>{block.displayExpression} = {block.resultText}</strong>}
                </div>
                <p className="block-help">使用可能: 数値、＋ − × ÷（<code>+ - * /</code>）、小数、括弧、負数、%。変数、LaTeX、累乗記号 <code>^</code>、関数は使用できません。</p>
              </>}
            </article>
          );
        })}
      </div>
    </div>
  );
}
