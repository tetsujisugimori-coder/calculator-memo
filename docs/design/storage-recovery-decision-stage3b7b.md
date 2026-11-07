# Stage 3B-7B：手動復旧判断基盤（実行なし）

関連：[Issue #135](https://github.com/tetsujisugimori-coder/calculator-memo/issues/135)、[Stage 3B-6](storage-reconciliation-stage3b6.md)、環境検証 [Issue #134](https://github.com/tetsujisugimori-coder/calculator-memo/issues/134)。

## 全体像
Stage 3B-6の読取り専用診断結果を、**合成データに限定した純粋な判断資料**に変換する。ソースは `e2e/fixtures/storage-recovery-decision.ts`。本番アプリからはimportしない。localStorage/IndexedDBへのアクセス、復旧・書込み・保全・自動再照合・authority昇格のAPIは持たない。

## 判断の流れ
1. 既存の固定診断結果を入力する。source/targetのテストnamespace以外は拒否する。
2. HOLD=true、executionAllowed=false、writeAllowed=false、authority=NOT_ESTABLISHEDを必須とする。矛盾があればfail-closed。
3. 代表状態と全所見の優先順位整合を確認し、**すべての所見**と不足証拠、既知/未知の因果関係をそのまま返す。
4. 候補は原本の順序・出典別に保持し、誰も自動選抜しない。判断資料には原文を埋め込まず、長さ・hash・ID等のメタデータを記載する。hash自体を真正性の保証としない。
5. 環境別A1〜A6の原証拠がなければNOT_TESTEDとする。PASSの申告には参照先と限定条件を要求する。ただし参照先の真正性・端末の適格性を自動確認する能力はないため、環境結果には `evidenceVerified=false` を明示し、独立検証済みとして扱わない。Stage 3B-7AのCIが成功しても実機SafariまでPASSへしない。
6. 返却された資料は常にHOLD・selectedCandidate=null。資料を閲覧・コピーしても復旧の実行許可にはならない。

## 過去UNKNOWNと失効
原票が変われば古い診断資料は再利用してはならない。現段階のbuilderは与えられた固定reportの写しを作るだけで、変更通知や更新検出を実装しない。呼出側のセッション/世代管理が将来必要。再確認ができない場合は古い資料を実行判断に使わない。未観測ABA、保存前に失われた原文、媒体flush、権限不明を推測しない。

## 非対象
自動復旧、実機・実データ収集、原文の外部送信、候補の優先順位付け、復元ボタン、実行API、書込み、旧データ削除、本番LS→IDB切替、UNKNOWN再試行。これらは別設計と別承認が必要。

## 受入・残余
単体でCONSISTENTの無権限、競合/UNKNOWN併存、破損/禁止併存、不整合な代表状態、勝者自動選抜なし、実行許可偽装、環境PASS証拠なし/重複拒否を検査する。ブラウザによる実使用時UXと実媒体の安全性は別工程。既存正式GUI6条件(1128/592/132)やStage 3B系列の原CIは別々に照合する。
