// @vitest-environment jsdom
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { MarkdownContent } from "../components/MarkdownContent";
import { extractMarkdownHeadings, markdownHeadingDomId, parseMarkdownBlocks } from "../lib/markdown-blocks";

afterEach(() => document.body.replaceChildren());

describe("shared Markdown block parser", () => {
  it("retains the existing block kinds, content, and LF display normalization", () => {
    const source = "# 題名\r\n\r\n第一行\r第二行\n\n> 引用\n> 続き\n\n- 一\n- 二\n\n1. 三\n2. 四\n\n```js\nconst x = 1;\n```\n\n$$\nx^2\n$$\n\n---";
    const blocks = parseMarkdownBlocks(source);
    expect(blocks.map(block => {
      if (block.kind === "heading") return { kind: block.kind, level: block.level, text: block.text };
      const { start, end, ...content } = block;
      expect(start).toBeGreaterThanOrEqual(0);
      expect(end).toBeLessThanOrEqual(source.length);
      return content;
    })).toEqual([
      { kind: "heading", level: 1, text: "題名" },
      { kind: "paragraph", text: "第一行\n第二行" },
      { kind: "quote", text: "引用\n続き" },
      { kind: "list", ordered: false, items: ["一", "二"] },
      { kind: "list", ordered: true, items: ["三", "四"] },
      { kind: "code", language: "js", text: "const x = 1;" },
      { kind: "math", text: "x^2" },
      { kind: "rule" },
    ]);
    for (const block of blocks) {
      expect(block.end).toBeGreaterThan(block.start);
      expect(source.slice(block.start, block.end)).not.toMatch(/[\r\n]$/);
    }
    expect(source.slice(blocks[1].start, blocks[1].end)).toBe("第一行\r第二行");
    expect(source.slice(blocks[5].start, blocks[5].end)).toBe("```js\nconst x = 1;\n```");
  });

  it("preserves the existing paragraph/rule and ATX subset instead of adding another engine", () => {
    const source = "文章\n---\n\nSetext\n===\n\n  # 字下げ\n\n####### 深すぎる\n\n#空白なし\n\n# \n\n## 有効 ###";
    expect(parseMarkdownBlocks(source)[0]).toMatchObject({ kind: "paragraph", text: "文章\n---" });
    expect(extractMarkdownHeadings(source).map(heading => heading.text)).toEqual(["有効 ###"]);
  });

  it("keeps Japanese, mathematical, inline, HTML-like, and duplicate heading text verbatim", () => {
    const texts = ["和算の由緒", "**証明** $x^2 + y^2$ と `a_b`", "!? & <img src=x onerror=alert(1)> / #", "和算の由緒", "和算の由緒"];
    const source = texts.map((text, index) => `${"#".repeat(index + 1)} ${text}`).join("\n");
    const headings = extractMarkdownHeadings(source);
    expect(headings.map(heading => heading.text)).toEqual(texts);
    expect(headings.map(heading => heading.level)).toEqual([1, 2, 3, 4, 5]);
    expect(headings.map(heading => heading.ordinal)).toEqual([1, 2, 3, 4, 5]);
    expect(headings.map(heading => heading.id)).toEqual(["heading-1", "heading-2", "heading-3", "heading-4", "heading-5"]);
    expect(new Set(headings.map(heading => heading.id)).size).toBe(headings.length);
    expect(extractMarkdownHeadings(source)).toEqual(headings);
  });

  it("reports exact original UTF-16 ranges through CRLF, CR, LF, and astral characters", () => {
    const rawHeadings = ["# 😀 一", "### 重複", "###### 数学 $πr^2$", "## 重複"];
    const source = `前書き😀\r\n\r\n${rawHeadings[0]}\r\n説明\r${rawHeadings[1]}\n${rawHeadings[2]}\r\n${rawHeadings[3]}\r\n`;
    const headings = extractMarkdownHeadings(source);
    expect(headings.map(heading => source.slice(heading.start, heading.end))).toEqual(rawHeadings);
    let from = 0;
    headings.forEach((heading, index) => {
      const start = source.indexOf(rawHeadings[index], from);
      expect(heading.start).toBe(start);
      expect(heading.end).toBe(start + rawHeadings[index].length);
      from = heading.end;
    });
    expect(headings[0].start).toBe("前書き😀\r\n\r\n".length);
  });

  it.each(["", " \r\n\t", "本文だけ", "> # 引用", "- # 箇条書き", "$$\n# 数式内\n$$", "$$\n# 未閉鎖の数式内"])("returns no navigation headings for %j", source => {
    expect(extractMarkdownHeadings(source)).toEqual([]);
  });

  it("recomputes positional IDs and exact source locations after reorder, insertion, and deletion", () => {
    const first = extractMarkdownHeadings("# 第一\n\n## 第二\n\n### 第三");
    const reorderedSource = "### 第三\r\n# 追加\r\n## 第二";
    const reordered = extractMarkdownHeadings(reorderedSource);
    expect(first.map(heading => heading.text)).toEqual(["第一", "第二", "第三"]);
    expect(reordered.map(heading => [heading.id, heading.level, heading.text])).toEqual([
      ["heading-1", 3, "第三"], ["heading-2", 1, "追加"], ["heading-3", 2, "第二"],
    ]);
    expect(reordered.map(heading => reorderedSource.slice(heading.start, heading.end))).toEqual(["### 第三", "# 追加", "## 第二"]);
  });

  it.each([
    ["`", 3, 0], ["`", 4, 1], ["`", 5, 2], ["`", 6, 3],
    ["~", 3, 0], ["~", 4, 1], ["~", 5, 2], ["~", 6, 3],
  ] as const)("ignores headings inside %s fences of length %i with %i spaces", (marker, length, indent) => {
    const open = `${" ".repeat(indent)}${marker.repeat(length)} text`;
    const close = `${" ".repeat(indent)}${marker.repeat(length + 1)} \t`;
    const source = `# 前\n通常の段落\n${open}\n# コード内\n## 同じ見出し\n${close}\n###### 後`;
    expect(extractMarkdownHeadings(source).map(heading => [heading.text, heading.id])).toEqual([["前", "heading-1"], ["後", "heading-2"]]);
    expect(parseMarkdownBlocks(source).find(block => block.kind === "code")).toMatchObject({ language: "text", text: "# コード内\n## 同じ見出し" });
  });

  it("does not close a fence on a shorter run, a different marker, excessive indent, or trailing content", () => {
    const source = "# 前\n````js\n```\n# 短い\n~~~~\n# 違う記号\n    ````\n# 字下げ\n```` suffix\n# 後続文字\n`````\n# 後";
    expect(extractMarkdownHeadings(source).map(heading => heading.text)).toEqual(["前", "後"]);
    const code = parseMarkdownBlocks(source).find(block => block.kind === "code");
    expect(code?.kind === "code" && code.text).toContain("# 後続文字");
  });

  it.each(["```", "   ````lang", "~~~text", "  ~~~~~"])("unclosed fence %j consumes all remaining heading-like lines", fence => {
    const source = `# 前\n${fence}\n# コード\n## 末尾\n`;
    expect(extractMarkdownHeadings(source).map(heading => heading.text)).toEqual(["前"]);
    const code = parseMarkdownBlocks(source).find(block => block.kind === "code");
    expect(code?.end).toBe(source.length);
  });

  it("does not treat invalid fence openings as valid or add indented-code parsing", () => {
    expect(extractMarkdownHeadings("```bad`info\n# 有効").map(heading => heading.text)).toEqual(["有効"]);
    expect(extractMarkdownHeadings("    ```\n# 有効").map(heading => heading.text)).toEqual(["有効"]);
    expect(extractMarkdownHeadings("``\n# 有効").map(heading => heading.text)).toEqual(["有効"]);
  });

  it("parses large reports without truncating headings or mistaking fenced examples for headings", () => {
    const count = 2500;
    const source = Array.from({ length: count }, (_, index) => `## 節 ${index}\r\n本文😀\r\n\r\n`).join("") + "~~~~\r\n" + "# コード内\r\n".repeat(5000) + "~~~~\r\n# 最後";
    const headings = extractMarkdownHeadings(source);
    expect(headings).toHaveLength(count + 1);
    expect(headings.at(-1)).toMatchObject({ id: `heading-${count + 1}`, text: "最後", start: source.lastIndexOf("# 最後"), end: source.length });
    expect(new Set(headings.map(heading => heading.id)).size).toBe(count + 1);
  });
});

describe("MarkdownContent heading navigation agreement", () => {
  function render(content: string, headingIdPrefix?: string): HTMLDivElement {
    const host = document.createElement("div");
    host.innerHTML = renderToStaticMarkup(createElement(MarkdownContent, { content, headingIdPrefix }));
    document.body.append(host);
    return host;
  }

  it("renders exactly the extracted headings with optional unique IDs and focus targets", () => {
    const source = "# 同名\n## **同名** $x^2$\n~~~~\n# 非見出し\n~~~~\n###### <script>alert(1)</script>";
    const headings = extractMarkdownHeadings(source);
    const host = render(source, "report-viewer");
    const nodes = [...host.querySelectorAll<HTMLHeadingElement>("h1,h2,h3,h4,h5,h6")];
    expect(nodes).toHaveLength(headings.length);
    nodes.forEach((node, index) => {
      expect(node.id).toBe(markdownHeadingDomId("report-viewer", headings[index].id));
      expect(node.tagName).toBe(`H${headings[index].level}`);
      expect(node.tabIndex).toBe(-1);
      node.focus();
      expect(document.activeElement).toBe(node);
    });
    expect(host.querySelectorAll("[tabindex]")).toHaveLength(headings.length);
    expect(host.querySelector("script")).toBeNull();
    expect(nodes[1].querySelector("strong")?.textContent).toBe("同名");
    expect(nodes[1].querySelector(".katex")).not.toBeNull();
    expect(host.querySelector("pre")?.textContent).toBe("# 非見出し");
  });

  it("leaves legacy renderers unchanged without a prefix and isolates concurrent viewers", () => {
    const source = "# 同名\n\n## 同名";
    const legacy = render(source);
    expect(legacy.querySelector("[id], [tabindex]")).toBeNull();
    const first = render(source, "first");
    const second = render(source, "second");
    const ids = [...first.querySelectorAll("[id]"), ...second.querySelectorAll("[id]")].map(node => node.id);
    expect(new Set(ids).size).toBe(4);
    expect(ids).toEqual(["first-heading-1", "first-heading-2", "second-heading-1", "second-heading-2"]);
  });

  it("retains inline code, emphasis, safe links, literal HTML, and unsupported-link safety", () => {
    const source = "# `code` *強調* [参照](https://example.com) [不可](javascript:alert) <img src=x>";
    const host = render(source, "safe");
    expect(host.querySelector("code")?.textContent).toBe("code");
    expect(host.querySelector("em")?.textContent).toBe("強調");
    expect(host.querySelectorAll("a")).toHaveLength(1);
    expect(host.querySelector("a")?.getAttribute("href")).toBe("https://example.com");
    expect(host.querySelector("a")?.getAttribute("rel")).toBe("noreferrer");
    expect(host.querySelector("img")).toBeNull();
    expect(host.textContent).toContain("[不可](javascript:alert) <img src=x>");
  });
});

it("excludes indented display math immediately following a paragraph", () => {
  const source = "paragraph\n  $$\n# not a heading\n  $$\n\n# real heading";
  expect(extractMarkdownHeadings(source).map(heading => heading.text)).toEqual(["real heading"]);
  expect(parseMarkdownBlocks(source).map(block => block.kind)).toEqual(["paragraph", "math", "heading"]);
});
