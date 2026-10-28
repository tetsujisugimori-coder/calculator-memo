# 根拠点検項目の前後ナビゲーション 検証記録

## 対象と条件
[Issue #100](https://github.com/tetsujisugimori-coder/calculator-memo/issues/100) / [Draft PR #101](https://github.com/tetsujisugimori-coder/calculator-memo/pull/101)。base `cd8d69039578965c963ffc0f1b1d31eb7174f61f`、専用branch `feat/audit-item-navigation`。PR99 merged 実確認。既存作業は変更せず専用clone。AGENTS/README/設計/運用/検証方針/workflowを参照。repo .agents/skillsは存在しない。憲法v2・江戸弁ガイド・辞典v20の必要箇所も参照し、情報精度を演出より優先した。

## ローカル実測（commit前作業版）
- 全単体: 101files / 2271 tests成功、Vitest3.2.4。
- 新機能同一テスト: base隔離worktreeで15失敗1成功→実装後16成功。`new-feature-baseline-red.log` / `new-feature-green.log`。旧不具合REDとは区別。
- 独立4単体、独自8Chromium GUI。詳細は独立レビュー。
- CI契約44、lint、tsc --noEmit、normal/Pages build成功。既存chunk-size警告は残る。依存更新はしていない。
- 追加正式helperをChromium141/375x667/DPR2/touchで実行: 6群・36native操作成功、pageerror0、両theme CSS200%、保存bytes不変、原本getItem増加0。`gui-focused-green.log`。
- 初回GUI失敗はfixture期待誤り: 原本照合後unverified filterが0件となる正しい空表示を『一覧から』と期待した。空表示を検査後、明示allを選び案内を検査する。`gui-fixture-expectation-failure.log`を保持。新テストの修正で、既存検査削減ではない。
- 通常前後移動はparse/assess/compare/getItem/setItem各0。App往復は本文、snapshot、履歴を含む保存bytes、選択範囲、scroll、focusを照合。ABA・同値storage・遅延callback破棄と再照合後未選択を検査。

## ローカル準備の失敗（製品失敗と区別）
初回の依存準備は作業用キャッシュに書き込めず終了し、テストは実行されなかった。許可された作業領域へキャッシュを置くlocked npm ci --ignore-scriptsで成功した。global導入・依存version変更はない。独立GUIの初回は検証サーバー停止により接続できず、同じサーバー起動期間内で実行して成功した。内部の接続先・私有パスなど、受入検証に不要な環境情報は公開資料から除外した。

## 正式CIの受入契約
全6条件/3worker/30分/成功trace非保存、1092検査（従来1056保持＋36）、592geometry/132PNG、touch各1306native操作。追加契約検査は新群欠落と旧操作数流用を拒否する。最終文書commit後の実SHA・wholejob成否・成果物SHA/条件/件数はPR Checksと結果コメントで照合し、現時点のローカル成功で代用しない。

## 限界
実機iPhone Safari、VoiceOver、OS文字拡大、全幅/全操作は未検証。Linux WebKitとCSS200%は代替保証ではない。既存WebKit時間変動の根本原因は解決していない。閲覧は確認/完了/数学的妥当性ではない。マージ/Draft解除/auto-merge/公開は実施しない。

2026-10-28 16:59 JST
