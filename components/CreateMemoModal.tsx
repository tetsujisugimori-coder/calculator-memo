"use client";

import { Modal } from "./Modal";

export function CreateMemoModal({ canCreateCalculation, onCalculation, onPlain, onClose }: { canCreateCalculation: boolean; onCalculation: () => void; onPlain: () => void; onClose: () => void }) {
  return (
    <Modal title="新しいメモ" onClose={onClose}>
      <div className="memo-type-grid">
        <button type="button" onClick={onCalculation} disabled={!canCreateCalculation}>
          <span className="eyebrow">CALCULATION</span>
          <strong>計算メモ</strong>
          <span>電卓の式・結果・補足を保存します。{!canCreateCalculation && " 先に電卓で計算してください。"}</span>
        </button>
        <button type="button" onClick={onPlain}>
          <span className="eyebrow">PLAIN / MARKDOWN</span>
          <strong>プレーン計算メモ</strong>
          <span>文章、複数の式、証明や計算過程を自由に記録します。</span>
        </button>
      </div>
    </Modal>
  );
}
