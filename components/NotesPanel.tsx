"use client";

import { KatexFormula } from "./KatexFormula";
import { MarkdownContent } from "./MarkdownContent";
import { MemoBlocks } from "./MemoBlocks";
import { resolveMemoBlocks } from "../lib/memo-blocks";
import type { CalculationNote, Memo } from "../lib/types";
import { MEMO_LABELS, memoTypeLabel } from "../lib/memo-labels";

type Props = {
  notes: Memo[];
  onCreate: () => void;
  onView: (note: Memo) => void;
  onEdit: (note: Memo) => void;
  onRestore: (note: CalculationNote) => void;
  onCopy: (note: Memo) => void;
  onDelete: (id: string) => void;
};

export function NotesPanel({ notes, onCreate, onView, onEdit, onRestore, onCopy, onDelete }: Props) {
  return (
    <div className="panel-body">
      <div className="panel-title-row"><div><span className="eyebrow">SAVED</span><h2>計算メモ</h2></div><div className="panel-title-actions"><span className="count-badge">{notes.length}件</span><button className="panel-create-button" onClick={onCreate}>＋ 新規作成</button></div></div>
      {!notes.length && <div className="empty-state"><span>◇</span><h3>最初の{MEMO_LABELS.blocks}を作成</h3><p>文章・数式・計算ブロックを複数組み合わせられます。電卓の結果だけを残す場合は{MEMO_LABELS.single}を選べます。</p><button className="button-primary empty-create-button" onClick={onCreate}>新規作成</button></div>}
      <div className="note-list">
        {notes.map((note) => <article className="note-card" key={note.id}>
          <div className="note-card-top"><span className="note-number">#{note.id.slice(-4).toUpperCase()}</span><time>{new Intl.DateTimeFormat("ja-JP", { month: "numeric", day: "numeric" }).format(new Date(note.updatedAt))}</time></div>
          <span className={`memo-kind ${note.type === "plain-calculation" ? "plain" : ""}`}>{memoTypeLabel(note.type)}</span>
          <h3>{note.title || (note.type === "calculation" ? note.displayExpression : "無題のメモ")}</h3>
          {note.type === "calculation" ? <>
            <div className="note-formula">
              {note.displayMode === "katex" && note.latexExpression ? <KatexFormula latex={note.latexExpression} block /> : <span>{note.displayExpression}</span>}
              <strong>= {note.resultText}{note.unit}</strong>
            </div>
            {note.note && <p className="note-preview">{note.note}</p>}
            {note.tags.length > 0 && <div className="tags">{note.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div>}
          </> : note.blocks !== undefined ? <MemoBlocks blocks={resolveMemoBlocks(note)} compact /> : <MarkdownContent content={note.content} compact />}
          <div className="item-actions"><button onClick={() => onView(note)}>詳細</button><button onClick={() => onEdit(note)}>編集</button>{note.type === "calculation" && <button onClick={() => onRestore(note)}>戻す</button>}<button onClick={() => onCopy(note)}>コピー</button><button className="danger" onClick={() => onDelete(note.id)}>削除</button></div>
        </article>)}
      </div>
    </div>
  );
}
