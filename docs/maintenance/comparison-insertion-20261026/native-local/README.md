# 固定比較資料挿入：局所native検証（2026-10-26）

新規GUI helperの初期作業ツリーを検証した診断証拠。正式CI／最終HEADの成功証拠ではない。

| 条件 | 結果 | 実tap | pageerror | 区間（UTC） | 実測秒 |
|---|---|---:|---:|---|---:|
| Chromium 141.0.7390.37 / touch390×844 DPR3 | 8/8成功 | 70 | 0 | 11:01:41.045–11:03:33.898 | 112.853 |
| WebKit 26.0 / touch390×844 DPR3 | 8/8成功 | 70 | 0 | 11:03:48.094–11:08:10.725 | 262.631 |

既存出力とプレビューの全文一致、方向・Unicode、両テーマCSS200%、選択文章保持、専用取消、編集後取消拒否、自己参照除外、実別ページ保存更新・削除の失効と保存競合、再取得・入替失効、両側0件の比較不能理由、明示保存・実再読込、保護領域内拒否を含む。`results.json` に全検査名・時刻・ブラウザ版・範囲を記録。初期配信buildの全ファイルSHA-256一覧は `served-build-files.sha256`。2枚のPNGは全文欄の200%表示を読解した代表画像であり、全文すべてが一画面に入ることを主張しない。縦スクロールは必要。

## 保証境界

- 後追加のkeyboard Tab移動2検査はこの2実行では未実施。
- 後追加の `evidence.error` 容量保護差分はこのbuildには含まれない。
- 旧base上の未commit作業ツリーであり、最終HEAD・実CI・正式全6条件の証拠へ流用しない。
- 時間はローカル診断の実測。WebKitの環境依存変動は解消済みではなく、正式CI時間の予測ではない。
- 実機Safari、VoiceOver、実OS文字拡大・背景化は未検証。

起動adapterは一時領域の `/tmp/pr94-insertion-focused.mjs`。各独立実行は `FOCUSED_SCENARIO=chromium-mobile-390px` または `webkit-mobile-390px`、`FOCUSED_PORT=4394`、native実行ファイルを明示して実行。正式harnessの条件・DPR・閾値・timeout・workerは変更しない。
