"use client";

import { useState } from "react";
import type { PlainCalculationNote, PlainNoteDraft } from "../lib/types";
import { blocksToMarkdown, recalculateMemoBlocks, resolveMemoBlocks } from "../lib/memo-blocks";
import { MemoBlockEditor } from "./MemoBlockEditor";
import { Modal } from "./Modal";

type Props = {
  initial: PlainNoteDraft | PlainCalculationNote;
  onSave: (draft: PlainNoteDraft) => void;
  onClose: () => void;
  onOpenGuide: (insert: (latex: string) => void) => void;
};

export function PlainNoteModal({ initial, onSave, onClose, onOpenGuide }: Props) {
  const [draft, setDraft] = useState<PlainNoteDraft>({
    title: initial.title,
    content: initial.content,
    blocks: resolveMemoBlocks({ id: "id" in initial ? initial.id : "draft", content: initial.content, blocks: initial.blocks }),
  });
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const blocks = recalculateMemoBlocks(draft.blocks ?? []);
    onSave({ title: draft.title.trim(), blocks, content: blocksToMarkdown(blocks) });
  };
  return (
    <Modal title="プレーン計算メモを編集" onClose={onClose} wide>
      <form className="note-form" onSubmit={submit}>
        <label>タイトル <small>任意</small><input value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} placeholder="例：平方完成による解の導出" /></label>
        <MemoBlockEditor blocks={draft.blocks ?? []} onChange={(blocks) => setDraft((current) => ({ ...current, blocks }))} onOpenGuide={onOpenGuide} />
        <div className="modal-actions"><button type="button" className="button-secondary" onClick={onClose}>キャンセル</button><button type="submit" className="button-primary" disabled={!draft.title.trim() && !(draft.blocks?.length)}>保存する</button></div>
      </form>
    </Modal>
  );
}
