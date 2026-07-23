"use client";

import { useState } from "react";
import type { PlainCalculationNote, PlainNoteDraft } from "../lib/types";
import { MarkdownEditor } from "./MarkdownEditor";
import { Modal } from "./Modal";

type Props = {
  initial: PlainNoteDraft | PlainCalculationNote;
  onSave: (draft: PlainNoteDraft) => void;
  onClose: () => void;
  onOpenGuide: (insert: (latex: string) => void) => void;
};

export function PlainNoteModal({ initial, onSave, onClose, onOpenGuide }: Props) {
  const [draft, setDraft] = useState<PlainNoteDraft>({ title: initial.title, content: initial.content });
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    onSave({ title: draft.title.trim(), content: draft.content });
  };
  return (
    <Modal title="プレーン計算メモを編集" onClose={onClose} wide>
      <form className="note-form" onSubmit={submit}>
        <label>タイトル <small>任意</small><input value={draft.title} onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))} placeholder="例：平方完成による解の導出" /></label>
        <MarkdownEditor value={draft.content} onChange={(content) => setDraft((current) => ({ ...current, content }))} onOpenMathGuide={onOpenGuide} />
        <div className="modal-actions"><button type="button" className="button-secondary" onClick={onClose}>キャンセル</button><button type="submit" className="button-primary" disabled={!draft.title.trim() && !draft.content.trim()}>保存する</button></div>
      </form>
    </Modal>
  );
}
