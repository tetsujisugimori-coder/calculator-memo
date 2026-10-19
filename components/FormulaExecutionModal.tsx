"use client";

import { useState } from "react";
import { inspectFormulaDefinition } from "../lib/calculator";
import { executeFormula, noteVariableInputs, type ExecutionDraft, type ExecutionResult } from "../lib/formula-execution";
import { formulaExecutionHelp } from "../lib/formula-execution-help";
import type { Memo, RegisteredFormula } from "../lib/types";
import { Modal } from "./Modal";

type Props = {
  formula?: RegisteredFormula;
  draft?: ExecutionDraft;
  notes: Memo[];
  writable: boolean;
  onDraftChange: (draft: ExecutionDraft) => void;
  onHistory: (result: ExecutionResult) => void;
  onMemo: (result: ExecutionResult) => void;
  onClose: () => void;
};

export function FormulaExecutionModal({ formula, draft, notes, writable, onDraftChange, onHistory, onMemo, onClose }: Props) {
  const [inputs, setInputs] = useState<Record<string, string>>(draft?.inputs ?? {});
  const [result, setResult] = useState<ExecutionResult | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [sourceNote, setSourceNote] = useState("");
  const [help, setHelp] = useState(false);
  let variables: string[] = [];
  let definitionError = "";
  try { if (formula) variables = inspectFormulaDefinition(formula.expression); }
  catch (cause) { definitionError = cause instanceof Error ? cause.message : "式を確認してください"; }
  const validResult = result && formula && result.expression === formula.expression && result.title === formula.title && variables.every((name) => result.inputs[name] === inputs[name]) ? result : null;
  const definitionChanged = draft && formula && draft.expression !== formula.expression;
  const plainNotes = notes.filter((note) => note.type === "plain-calculation");
  const updateInputs = (next: Record<string, string>) => {
    const currentInputs = Object.fromEntries(variables.map((name) => [name, Object.hasOwn(next, name) ? next[name] : ""]));
    setInputs(currentInputs); setResult(null); setError(""); setNotice("");
    if (formula && writable) onDraftChange({ formulaId: formula.id, expression: formula.expression, inputs: currentInputs });
  };
  const run = (event: React.FormEvent) => {
    event.preventDefault();
    if (!formula || definitionError) return;
    setResult(null); setError(""); setNotice("");
    try { setResult(executeFormula(formula, inputs)); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "計算できませんでした"); }
  };
  const transfer = (kind: "history" | "memo") => {
    if (!validResult || !writable || !validResult.boundExpression) return;
    try {
      if (kind === "history") { onHistory(validResult); setNotice("確定した計算を履歴に追加しました。"); }
      else onMemo(validResult);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "受け渡しできませんでした"); }
  };
  return <Modal title="登録式の実行" onClose={onClose} wide>
    <div className="formula-execution">
      {!formula ? <p role="alert">この登録式は削除されています。ライブラリに戻って選び直してください。</p> : <>
        <div className="execution-heading"><h3 className="identity-item identity-registered"><span className="identity-label">登録式</span>{formula.title}</h3><button type="button" aria-label="登録式の実行の説明" aria-haspopup="dialog" onClick={() => setHelp(true)}>i</button></div>
        <div className="library-expression"><strong>使用する計算式</strong><pre>{formula.expression}</pre></div>
        <p>式の定義は変更しません。値を入力して「計算する」で結果を確定します。単位換算は行いません。</p>
        {!writable && <p role="alert">保存領域を確認できません。入力値はこの画面内だけに保持され、履歴・メモには保存できません。</p>}
        {definitionChanged && <p role="status">保存時から式の定義が変わっています。現在の式と入力値を確認し、計算し直してください。</p>}
        {definitionError && <p className="field-error" role="alert">登録式の構文エラー：{definitionError}</p>}
        {variables.length > 0 && <div className="execution-note-source">
          <label htmlFor="execution-note-source">初期値の取得元ノート</label>
          <select id="execution-note-source" value={sourceNote} onChange={(e) => setSourceNote(e.target.value)}><option value="">ノートを選択</option>{plainNotes.map((note) => <option key={note.id} value={note.id}>{note.title || "無題の計算ノート"}</option>)}</select>
          <button type="button" disabled={!sourceNote} onClick={() => {
            const note = plainNotes.find((entry) => entry.id === sourceNote);
            if (!note) { setError("選択したノートが見つかりません。"); return; }
            try {
              const values = noteVariableInputs(note); const next = { ...inputs }; let count = 0;
              for (const name of variables) if (!(next[name] ?? "").trim() && Object.hasOwn(values, name)) { next[name] = values[name]; count++; }
              updateInputs(next); setNotice(`${count}件の変数を空欄に取り込みました。入力済みの値は変更していません。`);
            } catch (cause) { setError(cause instanceof Error ? cause.message : "ノートを確認してください"); }
          }}>ノートの変数を取り込む</button>
        </div>}
        <form className="execution-inputs" onSubmit={run}>
          {variables.map((name, index) => <label className="identity-item identity-variable" key={name} htmlFor={`execution-variable-${index}`}><span className="identity-label">変数</span><code>{name}</code><input id={`execution-variable-${index}`} aria-label={`変数 ${name} の値`} type="text" inputMode="decimal" autoComplete="off" spellCheck={false} maxLength={2000} value={inputs[name] ?? ""} onChange={(e) => updateInputs({ ...inputs, [name]: e.target.value })} /></label>)}
          {!variables.length && !definitionError && <p>入力が必要な変数はありません。</p>}
          <button className="button-primary" type="submit" disabled={!!definitionError}>計算する</button>
        </form>
        {error && <p className="field-error" role="alert">{error}</p>}
        {notice && <p role="status">{notice}</p>}
        {validResult ? <section className="execution-confirmed" aria-label="確定した計算結果">
          <h4>確定した計算結果</h4><div className="calculation-saved-result identity-item"><span className="identity-label">計算結果</span><strong>{validResult.resultText}</strong></div>
          <p>使用した式</p><pre>{validResult.expression}</pre>
          <dl>{Object.entries(validResult.inputs).map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{value}</dd></div>)}</dl>
          {validResult.transferError && <p role="status">{validResult.transferError}</p>}
          <div className="modal-actions"><button type="button" disabled={!writable || !validResult.boundExpression} onClick={() => transfer("history")}>履歴に追加</button><button type="button" disabled={!writable || !validResult.boundExpression} onClick={() => transfer("memo")}>単独計算メモを作成</button></div>
        </section> : <p role="status">計算結果：未確定。入力値を確認して計算してください。</p>}
      </>}
      {help && <Modal title={formulaExecutionHelp.title} onClose={() => setHelp(false)}>{formulaExecutionHelp.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</Modal>}
    </div>
  </Modal>;
}
