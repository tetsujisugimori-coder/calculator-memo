"use client";

import { VariableIdentification } from "./Identification";
import { describeCalculationBlock } from "../lib/memo-blocks";
import type { MemoBlock } from "../lib/types";
import { KatexFormula } from "./KatexFormula";
import { MarkdownContent } from "./MarkdownContent";

export function MemoBlocks({ blocks, compact = false }: { blocks: MemoBlock[]; compact?: boolean }) {
  if (!blocks.length) return <p className="markdown-empty">本文はまだありません。</p>;
  return (
    <div className={`memo-blocks ${compact ? "memo-blocks-compact" : ""}`}>
      {blocks.map((block) => {
        if (block.type === "text") {
          return <section className="memo-content-block text-block" key={block.id}><MarkdownContent content={block.content} /></section>;
        }
        if (block.type === "formula") {
          return <section className="memo-content-block formula-block" key={block.id} aria-label="数式ブロック"><span className="block-kind-label">数式</span><KatexFormula latex={block.latex} block /></section>;
        }
        const calculation = block.evaluationMode === "note-variables" ? describeCalculationBlock(block.expression) : { expression: block.displayExpression || block.expression };
        return (
          <section className={`memo-content-block calculation-block ${block.error ? "has-error" : ""}`} key={block.id} aria-label="計算ブロック">
            <span className="block-kind-label">計算</span>
            {block.evaluationMode === "note-variables" && <VariableIdentification expression={block.expression} assignment />}
            <p className="calculation-expression"><span>計算式</span> <code>{calculation.expression || "式未入力"}</code></p>
            {block.error
              ? <p className="block-error" role="status">{block.error}</p>
              : <div className="calculation-saved-result"><span>計算結果{calculation.variableName && <> <code>{calculation.variableName}</code></>}</span><strong>= {block.resultText}</strong></div>}
          </section>
        );
      })}
    </div>
  );
}
