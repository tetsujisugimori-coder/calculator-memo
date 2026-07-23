"use client";

import type { ReactNode } from "react";
import { KatexFormula } from "./KatexFormula";

type Block =
  | { kind: "heading"; level: number; text: string }
  | { kind: "paragraph"; text: string }
  | { kind: "quote"; text: string }
  | { kind: "list"; ordered: boolean; items: string[] }
  | { kind: "code"; language: string; text: string }
  | { kind: "math"; text: string }
  | { kind: "rule" };

function parseBlocks(markdown: string): Block[] {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const blocks: Block[] = [];
  let index = 0;
  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) { index += 1; continue; }
    if (line.startsWith("```")) {
      const language = line.slice(3).trim();
      const body: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].startsWith("```")) body.push(lines[index++]);
      index += index < lines.length ? 1 : 0;
      blocks.push({ kind: "code", language, text: body.join("\n") });
      continue;
    }
    if (line.trim() === "$$") {
      const body: string[] = [];
      index += 1;
      while (index < lines.length && lines[index].trim() !== "$$") body.push(lines[index++]);
      index += index < lines.length ? 1 : 0;
      blocks.push({ kind: "math", text: body.join("\n") });
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      blocks.push({ kind: "heading", level: heading[1].length, text: heading[2] });
      index += 1;
      continue;
    }
    if (/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line)) {
      blocks.push({ kind: "rule" });
      index += 1;
      continue;
    }
    if (/^>\s?/.test(line)) {
      const body: string[] = [];
      while (index < lines.length && /^>\s?/.test(lines[index])) body.push(lines[index++].replace(/^>\s?/, ""));
      blocks.push({ kind: "quote", text: body.join("\n") });
      continue;
    }
    const list = line.match(/^\s*(?:(\d+)\.|[-*+])\s+(.+)$/);
    if (list) {
      const ordered = Boolean(list[1]);
      const items: string[] = [];
      while (index < lines.length) {
        const item = lines[index].match(/^\s*(?:(\d+)\.|[-*+])\s+(.+)$/);
        if (!item || Boolean(item[1]) !== ordered) break;
        items.push(item[2]);
        index += 1;
      }
      blocks.push({ kind: "list", ordered, items });
      continue;
    }
    const paragraph = [line];
    index += 1;
    while (index < lines.length && lines[index].trim() && !/^(#{1,6})\s+|^```|^\$\$|^>\s?|^\s*(?:(?:\d+)\.|[-*+])\s+/.test(lines[index])) {
      paragraph.push(lines[index++]);
    }
    blocks.push({ kind: "paragraph", text: paragraph.join("\n") });
  }
  return blocks;
}

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

export function MarkdownContent({ content, compact = false }: { content: string; compact?: boolean }) {
  if (!content.trim()) return <p className="markdown-empty">本文はまだありません。</p>;
  const blocks = parseBlocks(content);
  return (
    <div className={`markdown-content ${compact ? "markdown-compact" : ""}`}>
      {blocks.map((block, index) => {
        const key = `${block.kind}-${index}`;
        if (block.kind === "heading") {
          const Heading = `h${block.level}` as keyof React.JSX.IntrinsicElements;
          return <Heading key={key}>{inline(block.text)}</Heading>;
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
