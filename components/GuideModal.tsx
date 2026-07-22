"use client";

import { useMemo, useState } from "react";
import { guideCategories, guideItems, type GuideCategory } from "../lib/katex-guide";
import { KatexFormula } from "./KatexFormula";
import { Modal } from "./Modal";

export function GuideModal({ onClose, onCopy, onInsert }: { onClose: () => void; onCopy: (text: string) => void; onInsert?: (latex: string) => void }) {
  const [category, setCategory] = useState<GuideCategory>("基本");
  const [query, setQuery] = useState("");
  const items = useMemo(() => guideItems.filter((item) => (!query ? item.category === category : `${item.name}${item.latex}${item.description}`.toLowerCase().includes(query.toLowerCase()))), [category, query]);
  return (
    <Modal title="KaTeX 数式ガイド" onClose={onClose} wide>
      <div className="guide-toolbar"><label className="search-label"><span>検索</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="分数、行列、\\sqrt など" /></label></div>
      <div className="guide-categories" aria-label="数式カテゴリ">{guideCategories.map((name) => <button key={name} className={category === name && !query ? "active" : ""} onClick={() => { setCategory(name); setQuery(""); }}>{name}</button>)}</div>
      <div className="guide-grid">{items.map((item) => <article className="guide-card" key={`${item.category}-${item.name}`}>
        <span className="eyebrow">{item.category}</span><h3>{item.name}</h3>
        <code>{item.latex}</code><div className="guide-preview"><KatexFormula latex={item.latex} block /></div><p>{item.description}</p>
        <div className="item-actions"><button onClick={() => onCopy(item.latex)}>コピー</button>{onInsert && <button className="insert-button" onClick={() => { onInsert(item.latex); onClose(); }}>編集中の欄へ挿入</button>}</div>
      </article>)}</div>
      {!items.length && <div className="empty-state"><h3>一致する項目がありません</h3><p>別のキーワードで検索してください。</p></div>}
    </Modal>
  );
}
