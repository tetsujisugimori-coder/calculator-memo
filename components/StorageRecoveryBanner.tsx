"use client";

import type { StorageLoadFailureReason, StorageProtectionReason } from "../lib/storage";

type StorageRecoveryBannerProps = {
  reason: StorageLoadFailureReason;
  message: string;
  protectionReason?: StorageProtectionReason;
  canCopy: boolean;
  onCopy: () => void;
  onReset: () => void;
  onExport: () => void;
};

const reasonLabels: Record<StorageLoadFailureReason, string> = {
  "invalid-json": "保存データのJSONが壊れています。",
  "unsupported-version": "このアプリでは未対応の保存形式です。",
  "invalid-data": "保存データの必須項目を確認できません。",
  "storage-unavailable": "ブラウザの保存領域を利用できません。",
};

const protectionLabels: Record<StorageProtectionReason, string> = {
  "unsupported-block": "対応していないブロック形式",
  "unsupported-mode": "対応していない計算モード",
  "invalid-structure": "保存データの構造異常",
  "duplicate-id": "メモまたはブロックIDの重複",
};

export function StorageRecoveryBanner({ reason, message, protectionReason, canCopy, onCopy, onReset, onExport }: StorageRecoveryBannerProps) {
  return (
    <section className="storage-recovery" role="alert" aria-labelledby="storage-recovery-title">
      <div>
        <span className="eyebrow">LOCAL DATA PROTECTION</span>
        <h2 id="storage-recovery-title">このメモは保護されています</h2>
        <p className="protection-caption">{protectionReason ? protectionLabels[protectionReason] : reasonLabels[reason]}</p>
        <p>元データを守るため、保存とメモの編集を停止しています。全メモ・履歴・設定を一つに保存しているため、正常なメモを含む全体を保護しています。</p>
        <details className="storage-recovery-details">
          <summary>保護の詳細・復旧方法</summary>
          <p>保存データを読み込めませんでした。{message} 最初に確認された原因を表示しています。他にも異常が含まれる可能性があります。元データを退避し、原因を解消した後に再読み込みしてください。安全性を再検証するまで編集・再計算・保存は再開しません。</p>
          <p>エクスポートは検出時の原本全体です。未対応の情報や空白も変更しません。取得後に別タブで変更された内容は含みません。</p>
        </details>
        {!canCopy && <p>原本JSONを取得できていないため、コピーとエクスポートはできません。</p>}
      </div>
      <div className="storage-recovery-actions">
        {canCopy && <><button className="button-secondary" onClick={onExport}>原本JSONをエクスポート</button><button className="button-secondary" onClick={onCopy}>元データをコピー</button></>}
        <button className="button-danger" onClick={onReset}>保存データを初期化</button>
      </div>
    </section>
  );
}
