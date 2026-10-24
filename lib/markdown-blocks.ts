/** Original JavaScript string (UTF-16) positions; end is exclusive. Heading ranges exclude the line break. */
export type MarkdownSourceRange = { start: number; end: number };

export type MarkdownHeading = MarkdownSourceRange & {
  kind: "heading";
  level: number;
  text: string;
  /** One-based document order, recomputed when the source changes. Not a saved ID. */
  ordinal: number;
  id: string;
};

export type MarkdownBlock = MarkdownHeading | (MarkdownSourceRange & (
  | { kind: "paragraph"; text: string }
  | { kind: "quote"; text: string }
  | { kind: "list"; ordered: boolean; items: string[] }
  | { kind: "code"; language: string; text: string }
  | { kind: "math"; text: string }
  | { kind: "rule" }
));

type SourceLine = MarkdownSourceRange & { text: string };

function sourceLines(markdown: string): SourceLine[] {
  const lines: SourceLine[] = [];
  let start = 0;
  for (const match of markdown.matchAll(/\r\n?|\n/g)) {
    const end = match.index;
    lines.push({ text: markdown.slice(start, end), start, end });
    start = end + match[0].length;
  }
  lines.push({ text: markdown.slice(start), start, end: markdown.length });
  return lines;
}

function openingFence(line: string): { marker: string; length: number; language: string } | undefined {
  const match = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
  if (!match || (match[1][0] === "`" && match[2].includes("`"))) return undefined;
  return { marker: match[1][0], length: match[1].length, language: match[2].trim() };
}

function closesFence(line: string, fence: { marker: string; length: number }): boolean {
  const match = line.match(/^ {0,3}(`+|~+)[ \t]*$/);
  return Boolean(match && match[1][0] === fence.marker && match[1].length >= fence.length);
}

/**
 * The existing MarkdownContent block parser, shared by rendering and navigation.
 * This is deliberately not a new/CommonMark engine: ATX headings must start at
 * column zero, have 1–6 # characters, whitespace, and nonempty text. Setext,
 * nested-container headings, and raw HTML headings remain unsupported. Inline
 * markup stays in `text` and is interpreted only by the existing renderer.
 *
 * Fences accept 3+ backticks or tildes with up to three leading spaces. A closing
 * fence must use the same marker, be at least as long, and have only trailing
 * whitespace. Unclosed fences consume the rest of the document. Code body
 * whitespace is preserved (no CommonMark indentation removal). Code/math content
 * cannot become navigation headings. Display text keeps the renderer's LF
 * normalization while source ranges retain original CRLF/CR and UTF-16 offsets.
 */
export function parseMarkdownBlocks(markdown: string): MarkdownBlock[] {
  const source = sourceLines(markdown);
  const lines = source.map(line => line.text);
  const blocks: MarkdownBlock[] = [];
  let index = 0;
  let ordinal = 0;
  const range = (first: number, after: number): MarkdownSourceRange => ({
    start: source[first].start,
    end: source[after - 1].end,
  });
  while (index < lines.length) {
    const first = index;
    const line = lines[index];
    if (!line.trim()) { index += 1; continue; }
    const fence = openingFence(line);
    if (fence) {
      const body: string[] = [];
      index += 1;
      while (index < lines.length && !closesFence(lines[index], fence)) body.push(lines[index++]);
      index += index < lines.length ? 1 : 0;
      blocks.push({ kind: "code", language: fence.language, text: body.join("\n"), ...range(first, index) });
      continue;
    }
    if (line.trim() === "$$") {
      const body: string[] = [];
      index += 1;
      while (index < lines.length && lines[index].trim() !== "$$") body.push(lines[index++]);
      index += index < lines.length ? 1 : 0;
      blocks.push({ kind: "math", text: body.join("\n"), ...range(first, index) });
      continue;
    }
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      ordinal += 1;
      blocks.push({ kind: "heading", level: heading[1].length, text: heading[2], ordinal, id: `heading-${ordinal}`, ...range(first, index + 1) });
      index += 1;
      continue;
    }
    if (/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line)) {
      blocks.push({ kind: "rule", ...range(first, index + 1) });
      index += 1;
      continue;
    }
    if (/^>\s?/.test(line)) {
      const body: string[] = [];
      while (index < lines.length && /^>\s?/.test(lines[index])) body.push(lines[index++].replace(/^>\s?/, ""));
      blocks.push({ kind: "quote", text: body.join("\n"), ...range(first, index) });
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
      blocks.push({ kind: "list", ordered, items, ...range(first, index) });
      continue;
    }
    const paragraph = [line];
    index += 1;
    while (index < lines.length && lines[index].trim() && !openingFence(lines[index]) && lines[index].trim() !== "$$" && !/^(#{1,6})\s+|^\$\$|^>\s?|^\s*(?:(?:\d+)\.|[-*+])\s+/.test(lines[index])) {
      paragraph.push(lines[index++]);
    }
    blocks.push({ kind: "paragraph", text: paragraph.join("\n"), ...range(first, index) });
  }
  return blocks;
}

export function extractMarkdownHeadings(markdown: string): MarkdownHeading[] {
  return parseMarkdownBlocks(markdown).filter((block): block is MarkdownHeading => block.kind === "heading");
}

/** Use the same unique viewer prefix for its navigation and MarkdownContent. */
export function markdownHeadingDomId(prefix: string, id: string): string {
  return `${prefix}-${id}`;
}
