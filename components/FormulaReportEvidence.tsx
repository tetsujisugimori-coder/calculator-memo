"use client";

import { useState } from "react";
import type { FormulaReportEvidenceLink, FormulaReportConfirmation, Memo } from "../lib/types";
import { resolveReportEvidence, reportEvidenceSignature } from "../lib/formula-report-evidence";
import { RecordInfo, BlockInfo } from "./EvidenceRecordDetails";

const key = (link: FormulaReportEvidenceLink) => JSON.stringify([link.memoId, link.recordId]);
/** All values come from the parent's single, explicitly acquired saved snapshot. */
export function FormulaReportEvidence({ notes, links, onChange, disabled, generation, recordsChanged }: { notes: Memo[]; links: FormulaReportEvidenceLink[]; onChange: (links: FormulaReportEvidenceLink[]) => void; disabled: boolean; generation: number; recordsChanged: boolean }) {
  const [showCurrent, setShowCurrent] = useState(false);
  const [selected, setSelected] = useState("");
  const choices = notes.flatMap(note => note.type === "plain-calculation" ? (note.calculationEvidence?.records ?? []).map(record => ({ link: { memoId: note.id, recordId: record.id }, label: `${note.title} / ${record.calculatedAt} / ${record.id}` })) : []);
  const resolved = resolveReportEvidence(notes, links);
  const add = () => {
    const choice = choices.find(item => key(item.link) === selected);
    if (choice && !links.some(link => key(link) === selected) && links.length < 20) { onChange([...links, choice.link]); setSelected(""); }
  };
  return <section aria-label="保存済み計算記録の根拠" className="formula-report-evidence">
    <p>保存済み原本の計算記録を参照します。未保存の編集・試算は含みません。選択変更は「レポートを保存」または確認保存まで未保存です。記録自体を変更・再計算しません。</p>
    <label htmlFor="report-evidence-choice">関連付ける保存済み計算記録</label>
    <select id="report-evidence-choice" value={choices.some(item => key(item.link) === selected) ? selected : ""} disabled={disabled} onChange={event => setSelected(event.target.value)}><option value="">記録を選択</option>{choices.map(item => <option key={key(item.link)} value={key(item.link)}>{item.label}</option>)}</select>
    <button type="button" disabled={disabled || !selected || links.length >= 20 || links.some(link => key(link) === selected)} onClick={add}>根拠に追加</button>
    <p>関連付け {links.length}/20件。{choices.length === 0 ? "参照可能な保存済み計算記録はありません。" : "参照先はメモIDと記録IDの組で識別します。"}</p>
    {!links.length && <p>計算記録は未関連付けです。式との対応の確認とは別です。</p>}
    {recordsChanged && <p role="alert">確認時と根拠記録の内容が一致しません。同じIDの記録でも当時の値とは扱いません。再確認する場合は現在の記録として内容を確認してください。</p>}
    {recordsChanged && !showCurrent && <button type="button" onClick={() => setShowCurrent(true)}>現在取得した記録として表示</button>}
    {resolved.map(item => <div key={`${generation}:${key(item.link)}`} className="formula-report-evidence-item">
      <p>メモID：{item.link.memoId}　記録ID：{item.link.recordId}</p>
      <button type="button" disabled={disabled} onClick={() => onChange(links.filter(link => key(link) !== key(item.link)))}>この根拠の関連付けを外す</button>
      {item.status !== "available" || !item.record ? <p role="alert">参照不能：{item.reason} 現在のメモで補完しません。</p> : recordsChanged && !showCurrent ? <p>差し替えの可能性があるため、以前の確認根拠として詳細を表示しません。</p> : <details><summary>{recordsChanged ? "未確認・現在取得した" : ""}計算記録の詳細：{item.memoTitle}</summary><RecordInfo record={item.record} />{item.record.blocks.map((block, index) => <details key={block.blockId}><summary>ブロック {block.blockId}</summary><BlockInfo block={block} executionOrder={index + 1} record={item.record!} /></details>)}</details>}
    </div>)}
  </section>;
}

/** Historical links are read-only and never reattached as a side effect of viewing. */
export function HistoricalReportEvidence({ confirmation, notes }: { confirmation: FormulaReportConfirmation; notes: Memo[] }) {
  const [open, setOpen] = useState(false);
  const changed = confirmation.evidenceSignature !== reportEvidenceSignature(notes, confirmation.links);
  return <details onToggle={event => setOpen(event.currentTarget.open)}><summary>この確認時に参照した記録の詳細</summary>{open && (changed
    ? <p role="alert">確認時の参照記録を同じ内容で取得できません。欠落・破損・変更の可能性があるため当時の値として表示しません。</p>
    : resolveReportEvidence(notes, confirmation.links).map(item => <details key={key(item.link)}><summary>保存記録 {item.link.memoId} / {item.link.recordId}</summary>{item.status !== "available" || !item.record
      ? <p role="alert">参照不能：{item.reason}</p>
      : <><RecordInfo record={item.record} />{item.record.blocks.map((block, index) => <details key={block.blockId}><summary>ブロック {block.blockId}</summary><BlockInfo block={block} executionOrder={index + 1} record={item.record!} /></details>)}</>}</details>))}</details>;
}
