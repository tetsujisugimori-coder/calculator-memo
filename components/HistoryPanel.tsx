"use client";

import { groupDate } from "../lib/format";
import type { HistoryEntry } from "../lib/types";

type Props = {
  history: HistoryEntry[];
  onRestore: (item: HistoryEntry) => void;
  onNote: (item: HistoryEntry) => void;
  onCopy: (item: HistoryEntry) => void;
  onDelete: (id: string) => void;
  onClearAll: () => void;
};

export function HistoryPanel({ history, onRestore, onNote, onCopy, onDelete, onClearAll }: Props) {
  const groups = history.reduce<Record<string, HistoryEntry[]>>((all, item) => {
    const key = groupDate(item.createdAt);
    (all[key] ||= []).push(item);
    return all;
  }, {});
  return (
    <div className="panel-body">
      <div className="panel-title-row"><div><span className="eyebrow">RECENT</span><h2>計算履歴</h2></div>{history.length > 0 && <button className="text-danger" onClick={onClearAll}>すべて削除</button>}</div>
      {!history.length && <div className="empty-state"><span>↗</span><h3>計算はここに残ります</h3><p>「=」で確定した式を、あとから復元したりメモにできます。</p></div>}
      {Object.entries(groups).map(([date, items]) => (
        <section className="history-group" key={date}>
          <h3>{date}</h3>
          {items.map((item) => <article className="history-item" key={item.id}>
            <button className="history-formula" onClick={() => onRestore(item)} aria-label={`${item.displayExpression}を電卓に戻す`}>
              <span>{item.displayExpression}</span><strong>= {item.resultText}</strong>
            </button>
            <time>{new Intl.DateTimeFormat("ja-JP", { hour: "2-digit", minute: "2-digit" }).format(new Date(item.createdAt))}</time>
            <div className="item-actions"><button onClick={() => onRestore(item)}>戻す</button><button onClick={() => onNote(item)}>メモ</button><button onClick={() => onCopy(item)}>コピー</button><button className="danger" onClick={() => onDelete(item.id)}>削除</button></div>
          </article>)}
        </section>
      ))}
    </div>
  );
}
