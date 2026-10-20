"use client";

import { isManualMemo } from "../lib/block-references";
import { useState } from "react";
import type { PlainCalculationNote, PlainNoteDraft } from "../lib/types";
import { blocksToMarkdown, recalculateMemoBlocks, resolveMemoBlocks } from "../lib/memo-blocks";
import { MEMO_LABELS } from "../lib/memo-labels";
import { MemoBlockEditor } from "./MemoBlockEditor";
import { Modal } from "./Modal";

type Props = {
  initial: PlainNoteDraft | PlainCalculationNote;
  sourceRevision?: string;
  onSave: (draft: PlainNoteDraft) => void;
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
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const blocks = draft.calculationPolicy?.mode === "manual" ? draft.blocks ?? [] : recalculateMemoBlocks(draft.blocks ?? []);
    onSave({ title: draft.title.trim(), calculationPolicy: draft.calculationPolicy, blocks, content: blocksToMarkdown(blocks) });
  };
  return (
    <Modal title={`${MEMO_LABELS.blocks}を編集`} onClose={onClose} wide>
      <form className="note-form" onSubmit={submit}>
        <label>タイトル <small>任意</small><input value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} placeholder="例：平方完成による解の導出" /></label>
        <MemoBlockEditor memoKey={"id" in initial ? initial.id : "new-memo"} sourceRevision={JSON.stringify([initial, draft.title, sourceRevision])} manual={draft.calculationPolicy?.mode === "manual"} blocks={draft.blocks ?? []} onChange={(blocks) => setDraft((current) => ({ ...current, blocks, calculationPolicy: isManualMemo(blocks) ? { ...current.calculationPolicy, version: 1, mode: "manual" } : current.calculationPolicy }))} onOpenGuide={onOpenGuide} />
        <div className="modal-actions"><button type="button" className="button-secondary" onClick={onClose}>キャンセル</button><button type="submit" className="button-primary" disabled={!draft.title.trim() && !(draft.blocks?.length)}>保存する</button></div>
      </form>
    </Modal>
  );
}
