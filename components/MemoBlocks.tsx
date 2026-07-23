"use client";

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
        return (
          <section className={`memo-content-block calculation-block ${block.error ? "has-error" : ""}`} key={block.id} aria-label="計算ブロック">
            <span className="block-kind-label">計算</span>
            <code>{block.displayExpression || block.expression || "式未入力"}</code>
            {block.error
              ? <p className="block-error" role="status">{block.error}</p>
              : <strong>= {block.resultText}</strong>}
          </section>
        );
      })}
    </div>
  );
}
