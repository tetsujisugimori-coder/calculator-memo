"use client";

import type { ReactNode } from "react";
import { KatexFormula } from "./KatexFormula";
import { markdownHeadingDomId, parseMarkdownBlocks } from "../lib/markdown-blocks";

function safeHref(value: string): string | undefined {
  const href = value.trim();
  return /^(https?:|mailto:)/i.test(href) ? href : undefined;
}

function inline(text: string): ReactNode[] {
  const pattern = /(`[^`\n]+`|\$[^$\n]+\$|\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\n]+\*|_([^_\n]+)_|\[[^\]\n]+\]\([^) \n]+\))/g;
  const nodes: ReactNode[] = [];
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    const position = match.index ?? 0;
    if (position > cursor) nodes.push(text.slice(cursor, position));
    const token = match[0];
    const key = `${position}-${token}`;
    if (token.startsWith("`")) nodes.push(<code key={key}>{token.slice(1, -1)}</code>);
    else if (token.startsWith("$")) nodes.push(<KatexFormula key={key} latex={token.slice(1, -1)} />);
    else if (token.startsWith("**") || token.startsWith("__")) nodes.push(<strong key={key}>{inline(token.slice(2, -2))}</strong>);
    else if (token.startsWith("*") || token.startsWith("_")) nodes.push(<em key={key}>{inline(token.slice(1, -1))}</em>);
    else {
      const link = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      const href = link ? safeHref(link[2]) : undefined;
      nodes.push(href ? <a key={key} href={href} target="_blank" rel="noreferrer">{link?.[1]}</a> : token);
    }
    cursor = position + token.length;
  }
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

export function MarkdownContent({ content, compact = false, headingIdPrefix }: { content: string; compact?: boolean; headingIdPrefix?: string }) {
  if (!content.trim()) return <p className="markdown-empty">本文はまだありません。</p>;
  const blocks = parseMarkdownBlocks(content);
  return (
    <div className={`markdown-content ${compact ? "markdown-compact" : ""}`}>
      {blocks.map((block, index) => {
        const key = `${block.kind}-${index}`;
        if (block.kind === "heading") {
          const Heading = `h${block.level}` as keyof React.JSX.IntrinsicElements;
          return (
            <Heading
              key={key}
              id={headingIdPrefix === undefined ? undefined : markdownHeadingDomId(headingIdPrefix, block.id)}
              tabIndex={headingIdPrefix === undefined ? undefined : -1}
            >
              {inline(block.text)}
            </Heading>
          );
        }
        if (block.kind === "paragraph") return <p key={key}>{inline(block.text)}</p>;
        if (block.kind === "quote") return <blockquote key={key}>{inline(block.text)}</blockquote>;
        if (block.kind === "code") return <pre key={key}><code data-language={block.language}>{block.text}</code></pre>;
        if (block.kind === "math") return <div className="markdown-math" key={key}><KatexFormula latex={block.text} block /></div>;
        if (block.kind === "rule") return <hr key={key} />;
        const List = block.ordered ? "ol" : "ul";
        return <List key={key}>{block.items.map((item, itemIndex) => <li key={`${itemIndex}-${item}`}>{inline(item)}</li>)}</List>;
      })}
    </div>
  );
}
