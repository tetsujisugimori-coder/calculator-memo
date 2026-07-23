"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { appendInput, clearEntry, toggleSign } from "../lib/calculator";
import { formatExpression, formatNumber } from "../lib/format";
import { historyText } from "../lib/copy";
import { createHistoryEntry } from "../lib/history";
import { defaultData, loadData, saveData, type StorageLoadResult } from "../lib/storage";
import type { CalculationNote, HistoryEntry, Memo, NoteDraft, Panel, PlainCalculationNote, PlainNoteDraft, StoredData, Theme } from "../lib/types";
import { CalculatorPad } from "./CalculatorPad";
import { HistoryPanel } from "./HistoryPanel";
import { NotesPanel } from "./NotesPanel";
import { NoteModal } from "./NoteModal";
import { GuideModal } from "./GuideModal";
import { CopyModal } from "./CopyModal";
import { KatexFormula } from "./KatexFormula";
import { Modal } from "./Modal";
import { StorageRecoveryBanner } from "./StorageRecoveryBanner";
import { PlainNoteModal } from "./PlainNoteModal";
import { CreateMemoModal } from "./CreateMemoModal";
import { MarkdownContent } from "./MarkdownContent";
import { MemoBlocks } from "./MemoBlocks";
import { resolveMemoBlocks } from "../lib/memo-blocks";

type NoteEditor = { draft: NoteDraft | CalculationNote; editingId?: string } | null;
type PlainNoteEditor = { draft: PlainNoteDraft | PlainCalculationNote; editingId?: string } | null;
type ConfirmState = { title: string; message: string; confirmLabel: string; action: () => void } | null;
type StorageIssue = Extract<StorageLoadResult, { status: "error" }>;

const blankResult = { value: 0, text: "0", displayExpression: "" };
const makeId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

function noteDraftFromCalculation(expression: string, displayExpression: string, value: number, resultText: string): NoteDraft {
  return { title: "", expression, displayExpression, latexExpression: null, result: value, resultText, unit: "", note: "", tags: [], relatedMemoName: "", displayMode: "plain" };
}

export function CalculatorApp() {
  const [data, setData] = useState<StoredData>(defaultData);
  const [storageStatus, setStorageStatus] = useState<"loading" | "ready" | "error">("loading");
  const [storageIssue, setStorageIssue] = useState<StorageIssue | null>(null);
  const [expression, setExpression] = useState("");
  const [result, setResult] = useState(blankResult);
  const [error, setError] = useState("");
  const [afterEquals, setAfterEquals] = useState(false);
  const [noteEditor, setNoteEditor] = useState<NoteEditor>(null);
  const [plainNoteEditor, setPlainNoteEditor] = useState<PlainNoteEditor>(null);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [guideInsert, setGuideInsert] = useState<((latex: string) => void) | undefined>();
  const [copyNote, setCopyNote] = useState<CalculationNote | null>(null);
  const [viewNote, setViewNote] = useState<Memo | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [toast, setToast] = useState("");

  const showToast = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2200);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const loaded = loadData();
      if (loaded.status === "error") {
        setStorageIssue(loaded);
        setStorageStatus("error");
        return;
      }
      setData(loaded.data);
      setStorageStatus("ready");
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (storageStatus !== "ready" || saveData(data)) return;
    const timer = window.setTimeout(() => showToast("ローカル保存に失敗しました"), 0);
    return () => window.clearTimeout(timer);
  }, [data, storageStatus, showToast]);
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = data.settings.theme;
    if (data.settings.theme === "system") delete root.dataset.theme;
  }, [data.settings.theme]);

  const displayExpression = useMemo(() => expression ? formatExpression(expression) : result.displayExpression, [expression, result.displayExpression]);
  const displayResult = useMemo(() => {
    if (afterEquals || error) return result.text;
    const current = expression.match(/-?\d*\.?\d+%?$/)?.[0]?.replace("%", "") ?? "0";
    const numeric = Number(current);
    return Number.isFinite(numeric) ? formatNumber(numeric) : current;
  }, [afterEquals, error, expression, result.text]);

  const changeExpression = useCallback((input: string) => {
    setError("");
    if (afterEquals) {
      if (/^[0-9.(]$/.test(input)) {
        setExpression(appendInput("", input)); setResult(blankResult); setAfterEquals(false); return;
      }
      if (/^[+\-*/]$/.test(input)) {
        setExpression(`${result.value}${input}`); setAfterEquals(false); return;
      }
    }
    setExpression((current) => appendInput(current, input));
    setAfterEquals(false);
  }, [afterEquals, result.value]);

  const calculate = useCallback(() => {
    try {
      const now = new Date().toISOString();
      const item = createHistoryEntry(expression, makeId("history"), now);
      setResult({ value: item.result, text: item.resultText, displayExpression: item.displayExpression });
      setError(""); setAfterEquals(true);
      setData((current) => {
        const previous = current.history[0];
        if (previous && previous.expression === item.expression && new Date(item.createdAt).getTime() - new Date(previous.createdAt).getTime() < 2000) return current;
        return { ...current, history: [item, ...current.history].slice(0, 200) };
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "計算できませんでした");
      setAfterEquals(false);
    }
  }, [expression]);

  const restore = useCallback((item: Pick<HistoryEntry, "expression" | "result" | "resultText" | "displayExpression">) => {
    setExpression(item.expression); setResult({ value: item.result, text: item.resultText, displayExpression: item.displayExpression }); setError(""); setAfterEquals(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const copy = useCallback(async (text: string, label = "式と結果") => {
    try { await navigator.clipboard.writeText(text); showToast(`${label}をコピーしました`); }
    catch { showToast("クリップボードへのコピーに失敗しました"); }
  }, [showToast]);

  const openNoteForHistory = useCallback((item: HistoryEntry) => setNoteEditor({ draft: noteDraftFromCalculation(item.expression, item.displayExpression, item.result, item.resultText) }), []);
  const openCurrentNote = useCallback(() => {
    if (!afterEquals || error) return;
    setNoteEditor({ draft: noteDraftFromCalculation(expression, result.displayExpression, result.value, result.text) });
  }, [afterEquals, error, expression, result]);

  const saveNote = useCallback((draft: NoteDraft) => {
    const now = new Date().toISOString();
    setData((current) => {
      if (noteEditor?.editingId) {
        return { ...current, notes: current.notes.map((note) => note.id === noteEditor.editingId ? { ...note, ...draft, updatedAt: now } : note) };
      }
      const note: CalculationNote = { ...draft, id: makeId("calc-note"), schemaVersion: 1, type: "calculation", createdAt: now, updatedAt: now };
      return { ...current, notes: [note, ...current.notes] };
    });
    setNoteEditor(null); showToast(noteEditor?.editingId ? "計算メモを更新しました" : "計算メモを保存しました");
  }, [noteEditor, showToast]);

  const savePlainNote = useCallback((draft: PlainNoteDraft) => {
    const now = new Date().toISOString();
    setData((current) => {
      if (plainNoteEditor?.editingId) {
        return { ...current, notes: current.notes.map((note) => note.id === plainNoteEditor.editingId && note.type === "plain-calculation" ? { ...note, ...draft, updatedAt: now } : note) };
      }
      const note: PlainCalculationNote = { ...draft, id: makeId("plain-note"), type: "plain-calculation", createdAt: now, updatedAt: now };
      return { ...current, notes: [note, ...current.notes] };
    });
    setPlainNoteEditor(null);
    showToast(plainNoteEditor?.editingId ? "プレーン計算メモを更新しました" : "プレーン計算メモを保存しました");
  }, [plainNoteEditor, showToast]);

  const requestDelete = useCallback((kind: "history" | "note", id: string) => {
    setConfirm({
      title: kind === "history" ? "履歴を削除しますか？" : "メモを削除しますか？",
      message: "この操作は取り消せません。必要な内容は先にコピーしてください。", confirmLabel: "削除する",
      action: () => { setData((current) => ({ ...current, [kind === "history" ? "history" : "notes"]: current[kind === "history" ? "history" : "notes"].filter((item) => item.id !== id) })); setConfirm(null); showToast("削除しました"); },
    });
  }, [showToast]);

  const setPanel = (panel: Panel) => setData((current) => ({ ...current, settings: { ...current.settings, activePanel: panel } }));
  const setTheme = (theme: Theme) => setData((current) => ({ ...current, settings: { ...current.settings, theme } }));
  const handleTabKey = (event: React.KeyboardEvent<HTMLButtonElement>, panel: Panel) => {
    if (!["ArrowLeft", "ArrowRight"].includes(event.key)) return;
    event.preventDefault();
    const nextPanel: Panel = panel === "history" ? "notes" : "history";
    setPanel(nextPanel);
    document.getElementById(`${nextPanel}-tab`)?.focus();
  };

  const confirmStorageReset = () => setConfirm({
    title: "保存データを初期化しますか？",
    message: "読み込めなかった元データを削除し、空の履歴と計算メモで開始します。この操作は取り消せません。必要であれば先に元データをコピーしてください。",
    confirmLabel: "初期化する",
    action: () => {
      const cleanData: StoredData = { ...defaultData, history: [], notes: [], settings: { ...defaultData.settings } };
      if (!saveData(cleanData)) {
        setConfirm(null);
        showToast("保存データを初期化できませんでした");
        return;
      }
      setData(cleanData);
      setStorageIssue(null);
      setStorageStatus("ready");
      setConfirm(null);
      showToast("保存データを初期化しました");
    },
  });

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) || target.isContentEditable || noteEditor || plainNoteEditor || createMenuOpen || guideOpen || copyNote || viewNote || confirm) return;
      if (/^[0-9+\-*/.()%]$/.test(event.key)) { event.preventDefault(); changeExpression(event.key); }
      else if (event.key === "Enter" || event.key === "=") { event.preventDefault(); calculate(); }
      else if (event.key === "Backspace") { event.preventDefault(); setExpression((current) => current.slice(0, -1)); setError(""); }
      else if (event.key === "Delete" || event.key === "Escape") { event.preventDefault(); setExpression(""); setResult(blankResult); setError(""); setAfterEquals(false); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [calculate, changeExpression, noteEditor, plainNoteEditor, createMenuOpen, guideOpen, copyNote, viewNote, confirm]);

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="wordmark" href="#calculator" aria-label="Calculation Memo ホーム"><span className="wordmark-mark">CM</span><span><strong>Calculation Memo</strong><small>計算を、意味のある記録へ。</small></span></a>
        <div className="header-actions"><button onClick={() => { setGuideInsert(undefined); setGuideOpen(true); }}>数式ガイド</button><label className="theme-select"><span>テーマ</span><select aria-label="テーマ" value={data.settings.theme} onChange={(e) => setTheme(e.target.value as Theme)}><option value="system">自動</option><option value="light">ライト</option><option value="dark">ダーク</option></select></label></div>
      </header>

      {storageIssue && <StorageRecoveryBanner reason={storageIssue.reason} message={storageIssue.message} canCopy={storageIssue.raw !== null} onCopy={() => storageIssue.raw && copy(storageIssue.raw, "元の保存データ")} onReset={confirmStorageReset} />}

      <section className="workspace" id="calculator">
        <aside id="history-panel" role="tabpanel" aria-labelledby="history-tab" className={`side-panel history-panel ${data.settings.activePanel === "history" ? "mobile-active" : ""}`}>
          <HistoryPanel history={data.history} onRestore={restore} onNote={openNoteForHistory} onCopy={(item) => copy(historyText(item))} onDelete={(id) => requestDelete("history", id)} onClearAll={() => setConfirm({ title: "すべての計算履歴を削除します", message: `${data.history.length}件の履歴を削除します。計算メモは削除されません。`, confirmLabel: "すべて削除", action: () => { setData((current) => ({ ...current, history: [] })); setConfirm(null); showToast("履歴をすべて削除しました"); } })} />
        </aside>

        <div className="calculator-column">
          <div className="mobile-tabs" role="tablist" aria-label="表示切り替え"><button id="history-tab" role="tab" aria-selected={data.settings.activePanel === "history"} aria-controls="history-panel" tabIndex={data.settings.activePanel === "history" ? 0 : -1} className={data.settings.activePanel === "history" ? "active" : ""} onKeyDown={(event) => handleTabKey(event, "history")} onClick={() => setPanel("history")}>履歴 <span>{data.history.length}</span></button><button id="notes-tab" role="tab" aria-selected={data.settings.activePanel === "notes"} aria-controls="notes-panel" tabIndex={data.settings.activePanel === "notes" ? 0 : -1} className={data.settings.activePanel === "notes" ? "active" : ""} onKeyDown={(event) => handleTabKey(event, "notes")} onClick={() => setPanel("notes")}>メモ <span>{data.notes.length}</span></button></div>
          <CalculatorPad expression={expression} displayExpression={displayExpression} resultText={displayResult} error={error} onInput={changeExpression} onCalculate={calculate} onClear={() => { setExpression(""); setResult(blankResult); setError(""); setAfterEquals(false); }} onClearEntry={() => { setExpression((current) => clearEntry(current)); setError(""); }} onBackspace={() => { setExpression((current) => current.slice(0, -1)); setError(""); }} onToggleSign={() => { setExpression((current) => toggleSign(current)); setError(""); }} onCreateNote={openCurrentNote} canCreateNote={afterEquals && !error} />
          <p className="keyboard-hint"><kbd>Enter</kbd> 計算　<kbd>Esc</kbd> クリア　数字・演算子はそのまま入力</p>
        </div>

        <aside id="notes-panel" role="tabpanel" aria-labelledby="notes-tab" className={`side-panel notes-panel ${data.settings.activePanel === "notes" ? "mobile-active" : ""}`}>
          <NotesPanel
            notes={data.notes}
            onCreate={() => setCreateMenuOpen(true)}
            onView={setViewNote}
            onEdit={(note) => note.type === "calculation" ? setNoteEditor({ draft: note, editingId: note.id }) : setPlainNoteEditor({ draft: note, editingId: note.id })}
            onRestore={restore}
            onCopy={(note) => note.type === "calculation" ? setCopyNote(note) : copy(note.content, "Markdown")}
            onDelete={(id) => requestDelete("note", id)}
          />
        </aside>
      </section>

      {noteEditor && <NoteModal initial={noteEditor.draft} onSave={saveNote} onClose={() => setNoteEditor(null)} onOpenGuide={(insert) => { setGuideInsert(() => insert); setGuideOpen(true); }} />}
      {plainNoteEditor && <PlainNoteModal initial={plainNoteEditor.draft} onSave={savePlainNote} onClose={() => setPlainNoteEditor(null)} onOpenGuide={(insert) => { setGuideInsert(() => insert); setGuideOpen(true); }} />}
      {createMenuOpen && <CreateMemoModal canCreateCalculation={afterEquals && !error} onClose={() => setCreateMenuOpen(false)} onCalculation={() => { setCreateMenuOpen(false); openCurrentNote(); }} onPlain={() => { setCreateMenuOpen(false); setPlainNoteEditor({ draft: { title: "", content: "" } }); }} />}
      {guideOpen && <GuideModal onClose={() => setGuideOpen(false)} onCopy={(text) => copy(text, "LaTeX")} onInsert={guideInsert} />}
      {copyNote && <CopyModal note={copyNote} onCopy={copy} onClose={() => setCopyNote(null)} />}
      {viewNote && <Modal title={viewNote.title || (viewNote.type === "calculation" ? viewNote.displayExpression : "無題のメモ")} onClose={() => setViewNote(null)} wide={viewNote.type === "plain-calculation"}><div className="note-detail">{viewNote.type === "calculation" ? <>{viewNote.displayMode === "katex" && viewNote.latexExpression ? <KatexFormula latex={viewNote.latexExpression} block /> : <p className="detail-expression">{viewNote.displayExpression}</p>}<strong className="detail-result">= {viewNote.resultText}{viewNote.unit}</strong>{viewNote.note && <div><span className="eyebrow">前提・補足</span><p>{viewNote.note}</p></div>}{viewNote.relatedMemoName && <div><span className="eyebrow">関連メモ名</span><p>{viewNote.relatedMemoName}</p></div>}{viewNote.tags.length > 0 && <div className="tags">{viewNote.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div>}</> : viewNote.blocks !== undefined ? <MemoBlocks blocks={resolveMemoBlocks(viewNote)} /> : <MarkdownContent content={viewNote.content} />}<div className="modal-actions"><button className="button-secondary" onClick={() => setViewNote(null)}>閉じる</button><button className="button-primary" onClick={() => { if (viewNote.type === "calculation") setCopyNote(viewNote); else copy(viewNote.content, "Markdown"); setViewNote(null); }}>コピー</button></div></div></Modal>}
      {confirm && <Modal title={confirm.title} onClose={() => setConfirm(null)}><div className="confirm-body"><p>{confirm.message}</p><div className="modal-actions"><button className="button-secondary" onClick={() => setConfirm(null)}>キャンセル</button><button className="button-danger" onClick={confirm.action}>{confirm.confirmLabel}</button></div></div></Modal>}
      <div className={`toast ${toast ? "visible" : ""}`} role="status" aria-live="polite">{toast}</div>
    </main>
  );
}
