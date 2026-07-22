"use client";

import type { StorageLoadFailureReason } from "../lib/storage";

type StorageRecoveryBannerProps = {
  reason: StorageLoadFailureReason;
  message: string;
  canCopy: boolean;
  onCopy: () => void;
  onReset: () => void;
};

const reasonLabels: Record<StorageLoadFailureReason, string> = {
  "invalid-json": "保存データのJSONが壊れています。",
  "unsupported-version": "このアプリでは未対応の保存形式です。",
  "invalid-data": "保存データの必須項目を確認できません。",
  "storage-unavailable": "ブラウザの保存領域を利用できません。",
};

export function StorageRecoveryBanner({ reason, message, canCopy, onCopy, onReset }: StorageRecoveryBannerProps) {
  return (
    <section className="storage-recovery" role="alert" aria-labelledby="storage-recovery-title">
      <div>
        <span className="eyebrow">LOCAL DATA PROTECTION</span>
        <h2 id="storage-recovery-title">保存データを読み込めませんでした</h2>
        <p>{reasonLabels[reason]} {message} 元データを守るため、自動保存を停止しています。</p>
      </div>
      <div className="storage-recovery-actions">
        {canCopy && <button className="button-secondary" onClick={onCopy}>元データをコピー</button>}
        <button className="button-danger" onClick={onReset}>保存データを初期化</button>
      </div>
    </section>
  );
}
