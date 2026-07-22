"use client";

import { useMemo, useState } from "react";
import type { CalculationNote, NoteDraft } from "../lib/types";
import { KatexFormula, validateLatex } from "./KatexFormula";
import { Modal } from "./Modal";

const unitOptions = ["", "円", "%", "個", "人", "km", "m", "kg", "g", "時間", "分", "秒"];

export function NoteModal({ initial, onSave, onClose, onOpenGuide }: { initial: NoteDraft | CalculationNote; onSave: (draft: NoteDraft) => void; onClose: () => void; onOpenGuide: (insert: (latex: string) => void) => void }) {
  const [draft, setDraft] = useState<NoteDraft>({
    title: initial.title, expression: initial.expression, displayExpression: initial.displayExpression,
    latexExpression: initial.latexExpression, result: initial.result, resultText: initial.resultText,
    unit: initial.unit, note: initial.note, tags: initial.tags, relatedMemoName: initial.relatedMemoName,
    displayMode: initial.displayMode,
  });
  const latexError = useMemo(() => draft.displayMode === "katex" ? validateLatex(draft.latexExpression ?? "") : null, [draft.displayMode, draft.latexExpression]);
  const update = <K extends keyof NoteDraft>(key: K, value: NoteDraft[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const submit = (event: React.FormEvent) => { event.preventDefault(); if (!latexError) onSave(draft); };
  return (
    <Modal title="計算メモを編集" onClose={onClose} wide>
      <form className="note-form" onSubmit={submit}>
        <div className="form-intro"><span>式</span><strong>{draft.displayExpression}</strong><span>結果</span><strong>{draft.resultText}{draft.unit}</strong></div>
        <label>タイトル <small>任意</small><input value={draft.title} onChange={(e) => update("title", e.target.value)} placeholder="例：大阪出張の交通費" /></label>
        <div className="form-grid">
          <label>単位 <small>任意</small><input list="unit-options" value={draft.unit} onChange={(e) => update("unit", e.target.value)} placeholder="円、個、時間など" /><datalist id="unit-options">{unitOptions.map((unit) => <option key={unit} value={unit} />)}</datalist></label>
          <label>タグ <small>読点区切り</small><input value={draft.tags.join("、")} onChange={(e) => update("tags", e.target.value.split(/[、,]/).map((tag) => tag.trim()).filter(Boolean))} placeholder="出張、交通費" /></label>
        </div>
        <label>前提・補足 <small>任意</small><textarea rows={3} value={draft.note} onChange={(e) => update("note", e.target.value)} placeholder="計算の前提や内訳を残せます" /></label>
        <label>関連メモ名 <small>任意</small><input value={draft.relatedMemoName} onChange={(e) => update("relatedMemoName", e.target.value)} placeholder="例：大阪出張計画" /></label>
        <fieldset><legend>表示形式</legend><div className="segmented"><label><input type="radio" checked={draft.displayMode === "plain"} onChange={() => update("displayMode", "plain")} />標準表示</label><label><input type="radio" checked={draft.displayMode === "katex"} onChange={() => update("displayMode", "katex")} />数式表示（KaTeX）</label></div></fieldset>
        {draft.displayMode === "katex" && <div className="latex-editor">
          <div className="label-row"><label htmlFor="latex-input">LaTeX入力</label><button type="button" onClick={() => onOpenGuide((latex) => update("latexExpression", `${draft.latexExpression ?? ""}${latex}`))}>数式ガイドから挿入</button></div>
          <textarea id="latex-input" className="code-input" rows={3} value={draft.latexExpression ?? ""} onChange={(e) => update("latexExpression", e.target.value)} placeholder="\frac{a}{b}" />
          {latexError ? <p className="field-error" role="alert">{latexError}</p> : <div className="formula-preview"><span>プレビュー</span><KatexFormula latex={draft.latexExpression ?? ""} block /></div>}
        </div>}
        <div className="modal-actions"><button type="button" className="button-secondary" onClick={onClose}>キャンセル</button><button type="submit" className="button-primary" disabled={!!latexError}>保存する</button></div>
      </form>
    </Modal>
  );
}
