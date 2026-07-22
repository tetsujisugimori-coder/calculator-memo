"use client";

import { KatexFormula } from "./KatexFormula";
import type { CalculationNote } from "../lib/types";

type Props = {
  notes: CalculationNote[];
  onView: (note: CalculationNote) => void;
  onEdit: (note: CalculationNote) => void;
  onRestore: (note: CalculationNote) => void;
  onCopy: (note: CalculationNote) => void;
  onDelete: (id: string) => void;
};

export function NotesPanel({ notes, onView, onEdit, onRestore, onCopy, onDelete }: Props) {
  return (
    <div className="panel-body">
      <div className="panel-title-row"><div><span className="eyebrow">SAVED</span><h2>計算メモ</h2></div><span className="count-badge">{notes.length}件</span></div>
      {!notes.length && <div className="empty-state"><span>◇</span><h3>残しておきたい計算を保存</h3><p>単位や前提、タグを添えて、意味のある計算メモにできます。</p></div>}
      <div className="note-list">
        {notes.map((note) => <article className="note-card" key={note.id}>
          <div className="note-card-top"><span className="note-number">#{note.id.slice(-4).toUpperCase()}</span><time>{new Intl.DateTimeFormat("ja-JP", { month: "numeric", day: "numeric" }).format(new Date(note.updatedAt))}</time></div>
          <h3>{note.title || note.displayExpression}</h3>
          <div className="note-formula">
            {note.displayMode === "katex" && note.latexExpression ? <KatexFormula latex={note.latexExpression} block /> : <span>{note.displayExpression}</span>}
            <strong>= {note.resultText}{note.unit}</strong>
          </div>
          {note.note && <p className="note-preview">{note.note}</p>}
          {note.tags.length > 0 && <div className="tags">{note.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div>}
          <div className="item-actions"><button onClick={() => onView(note)}>詳細</button><button onClick={() => onEdit(note)}>編集</button><button onClick={() => onRestore(note)}>戻す</button><button onClick={() => onCopy(note)}>コピー</button><button className="danger" onClick={() => onDelete(note.id)}>削除</button></div>
        </article>)}
      </div>
    </div>
  );
}
