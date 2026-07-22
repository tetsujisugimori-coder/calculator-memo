"use client";

import type { CalculationNote } from "../lib/types";
import { noteToJson, noteToMarkdown, noteToPlainText } from "../lib/copy";
import { Modal } from "./Modal";

export function CopyModal({ note, onCopy, onClose }: { note: CalculationNote; onCopy: (text: string, label: string) => void; onClose: () => void }) {
  return <Modal title="コピー形式を選ぶ" onClose={onClose}>
    <div className="copy-options">
      <button onClick={() => { onCopy(noteToPlainText(note), "テキスト"); onClose(); }}><strong>プレーンテキスト</strong><span>チャットやメールに貼り付ける</span></button>
      <button onClick={() => { onCopy(noteToMarkdown(note), "Markdown"); onClose(); }}><strong>Markdown</strong><span>数式と強調を保ってメモへ</span></button>
      <button onClick={() => { onCopy(noteToJson(note), "JSON"); onClose(); }}><strong>JSON</strong><span>Memo Nexus連携用の構造化データ</span></button>
    </div>
  </Modal>;
}
