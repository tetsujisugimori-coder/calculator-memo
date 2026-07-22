"use client";

import katex from "katex";

export function KatexFormula({ latex, block = false }: { latex: string; block?: boolean }) {
  let html = "";
  let failed = false;
  try {
    html = katex.renderToString(latex, {
      displayMode: block,
      throwOnError: true,
      trust: false,
      strict: "warn",
      output: "htmlAndMathml",
    });
  } catch {
    failed = true;
  }
  if (failed) return <span className="formula-error" role="alert">数式を表示できません <code>{latex}</code></span>;
  return <span className="katex-safe" dangerouslySetInnerHTML={{ __html: html }} />;
}

export function validateLatex(latex: string): string | null {
  if (!latex.trim()) return "LaTeXを入力してください";
  try {
    katex.renderToString(latex, { throwOnError: true, trust: false, strict: "warn" });
    return null;
  } catch (error) {
    return error instanceof Error ? error.message.replace(/^KaTeX parse error:\s*/, "") : "KaTeX構文を確認してください";
  }
}
