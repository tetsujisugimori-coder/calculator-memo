"use client";

import { useRef, useState } from "react";
import { MarkdownContent } from "./MarkdownContent";

type Props = {
  value: string;
  onChange: (value: string) => void;
  onOpenMathGuide: (insert: (latex: string) => void) => void;
};

export function MarkdownEditor({ value, onChange, onOpenMathGuide }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [mobilePane, setMobilePane] = useState<"edit" | "preview">("edit");

  const insertAtCursor = (text: string) => {
    const textarea = textareaRef.current;
    const start = textarea?.selectionStart ?? value.length;
    const end = textarea?.selectionEnd ?? value.length;
    const spacer = start > 0 && !value.slice(0, start).endsWith("\n\n") ? "\n\n" : "";
    const insertion = `${spacer}$$\n${text}\n$$`;
    onChange(`${value.slice(0, start)}${insertion}${value.slice(end)}`);
    window.requestAnimationFrame(() => {
      const caret = start + insertion.length;
      textarea?.focus();
      textarea?.setSelectionRange(caret, caret);
    });
  };

  return (
    <div className="markdown-editor">
      <div className="editor-toolbar">
        <div className="editor-tabs" role="tablist" aria-label="本文の編集表示">
          <button type="button" className={mobilePane === "edit" ? "active" : ""} onClick={() => setMobilePane("edit")}>編集</button>
          <button type="button" className={mobilePane === "preview" ? "active" : ""} onClick={() => setMobilePane("preview")}>プレビュー</button>
        </div>
        <button type="button" className="math-guide-button" onClick={() => onOpenMathGuide(insertAtCursor)}>数式ガイド</button>
      </div>
      <div className="editor-split">
        <label className={`editor-pane editor-input ${mobilePane === "edit" ? "mobile-pane-active" : ""}`}>
          <span>Markdown入力</span>
          <textarea ref={textareaRef} rows={16} value={value} onChange={(event) => onChange(event.target.value)} placeholder={"文章と数式をMarkdownで入力できます。\n\n例：二次方程式の解は $x=\\frac{-b\\pm\\sqrt{b^2-4ac}}{2a}$ です。"} />
        </label>
        <section className={`editor-pane editor-preview ${mobilePane === "preview" ? "mobile-pane-active" : ""}`} aria-label="Markdownプレビュー">
          <span>プレビュー</span>
          <MarkdownContent content={value} />
        </section>
      </div>
      <p className="editor-help">インライン数式は <code>$...$</code>、独立した数式は <code>$$</code> で囲みます。本文はMarkdownのまま保存されます。</p>
    </div>
  );
}
