"use client";

import { Modal } from "./Modal";
import { MEMO_LABELS } from "../lib/memo-labels";

type Props = {
  canCreateSingleCalculation: boolean;
  onBlocks: () => void;
  onSingleCalculation: () => void;
  onClose: () => void;
};

export function CreateMemoModal({ canCreateSingleCalculation, onBlocks, onSingleCalculation, onClose }: Props) {
  return (
    <Modal title="新しい計算メモ" onClose={onClose}>
      <div className="memo-type-grid">
        <button type="button" onClick={onBlocks}>
          <span className="eyebrow">BLOCKS / MARKDOWN</span>
          <strong>{MEMO_LABELS.blocks}</strong>
          <span>文章、数式、計算ブロックを複数追加し、自由な順序で記録します。</span>
        </button>
        <button type="button" onClick={onSingleCalculation} disabled={!canCreateSingleCalculation}>
          <span className="eyebrow">SINGLE RESULT</span>
          <strong>{MEMO_LABELS.single}</strong>
          <span>電卓で確定した式と結果を1件保存します。{!canCreateSingleCalculation && " 先に電卓で計算してください。"}</span>
        </button>
      </div>
    </Modal>
  );
}
