"use client";

import { isManualMemo } from "../lib/block-references";
import { useRef, useState } from "react";
import type { PlainCalculationNote, PlainNoteDraft } from "../lib/types";
import { blocksToMarkdown, resolveMemoBlocks } from "../lib/memo-blocks";
import { evaluateLegacyMemoWithEvidence, EVIDENCE_LIMITS, makeEvidenceCandidate, type EvidenceCandidate } from "../lib/calculation-evidence";
import { MEMO_LABELS } from "../lib/memo-labels";
import { MemoBlockEditor } from "./MemoBlockEditor";
import { Modal } from "./Modal";

type Props = {
  initial: PlainNoteDraft | PlainCalculationNote;
  sourceRevision?: string;
  onSave: (draft: PlainNoteDraft, candidates?: EvidenceCandidate[]) => void | string | Promise<void | string>;
  onClose: () => void;
  onOpenGuide: (insert: (latex: string) => void) => void;
};

export function PlainNoteModal({ initial, onSave, onClose, onOpenGuide, sourceRevision = "" }: Props) {
  const [draft, setDraft] = useState<PlainNoteDraft>({
    title: initial.title,
    calculationPolicy: initial.calculationPolicy,
    content: initial.content,
    blocks: resolveMemoBlocks({ id: "id" in initial ? initial.id : "draft", content: initial.content, blocks: initial.blocks, calculationPolicy: initial.calculationPolicy }),
  });
  const [pendingEvidence, setPendingEvidence] = useState<EvidenceCandidate[]>([]);
  const [pendingRevision, setPendingRevision] = useState(sourceRevision);
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const evidenceValid = pendingRevision === sourceRevision;
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (savingRef.current) return;
    savingRef.current = true; setSaving(true); setSaveError("");
    try {
      const evaluated = draft.calculationPolicy?.mode === "manual" ? undefined : evaluateLegacyMemoWithEvidence(draft.blocks ?? []);
      const blocks = evaluated?.blocks ?? draft.blocks ?? [];
      const candidates = evaluated?.evidence?.length ? [makeEvidenceCandidate(blocks, evaluated.evidence)] : evidenceValid ? pendingEvidence : [];
      const message = await onSave({ title: draft.title.trim(), calculationPolicy: draft.calculationPolicy, blocks, content: blocksToMarkdown(blocks) }, candidates);
      if (message) setSaveError(message);
    } catch (cause) { setSaveError(cause instanceof Error ? cause.message : "保存できませんでした。編集内容は保持しています。"); }
    finally { savingRef.current = false; setSaving(false); }
  };
  return (
    <Modal title={`${MEMO_LABELS.blocks}を編集`} onClose={() => { if (!savingRef.current) onClose(); }} closeDisabled={saving} wide>
      <form className="note-form" onSubmit={submit}>
        {saving && <p role="status">保存処理中です。完了まで編集と取消を停止しています。</p>}
        <fieldset disabled={saving} style={{ display: "contents", border: 0, padding: 0, margin: 0 }}>
        <label>タイトル <small>任意</small><input value={draft.title} onChange={(event) => { setPendingEvidence([]); setPendingRevision(sourceRevision); setDraft((current) => ({ ...current, title: event.target.value })); }} placeholder="例：平方完成による解の導出" /></label>
        <MemoBlockEditor memoKey={"id" in initial ? initial.id : "new-memo"} sourceRevision={JSON.stringify([initial, draft.title, sourceRevision])} manual={draft.calculationPolicy?.mode === "manual"} blocks={draft.blocks ?? []} onChange={(blocks) => { setPendingEvidence([]); setPendingRevision(sourceRevision); setDraft((current) => ({ ...current, blocks, calculationPolicy: isManualMemo(blocks) ? { ...current.calculationPolicy, version: 1, mode: "manual" } : current.calculationPolicy })); }} onEvidence={(blocks, candidate) => { const next = [...(evidenceValid ? pendingEvidence : []), candidate]; if (next.length > EVIDENCE_LIMITS.records || new TextEncoder().encode(JSON.stringify(next)).length > EVIDENCE_LIMITS.bytes) { setSaveError("未保存の根拠候補が上限（100件・500000バイト）を超えるため反映を停止しました。既存候補と編集結果は保持しています。保存するか、編集を取り消してから再実行してください。"); return false; } setSaveError(""); setPendingEvidence(next); setPendingRevision(sourceRevision); setDraft(current => ({ ...current, blocks, calculationPolicy: { ...current.calculationPolicy, version: 1, mode: "manual" } })); }} onOpenGuide={onOpenGuide} />
        <p role="status">計算根拠の保存待ち: {evidenceValid ? pendingEvidence.length : 0}件。再計算・試算反映だけでは履歴は保存されません。本文や計算の編集・計算失敗・取消では未保存候補を破棄します。</p>
        {saveError && <p className="field-error" role="alert">{saveError}</p>}
        <div className="modal-actions"><button type="button" className="button-secondary" onClick={onClose}>キャンセル</button><button type="submit" className="button-primary" disabled={saving || (!draft.title.trim() && !(draft.blocks?.length))}>保存する</button></div>
        </fieldset>
      </form>
    </Modal>
  );
}
