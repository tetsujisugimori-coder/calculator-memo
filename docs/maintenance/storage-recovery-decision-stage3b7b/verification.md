# Stage 3B-7B 検証台帳

## 変更内容
- 合成限定で既存Stage 3B-6報告を入力とする、pure decision sheet builderを追加。
- 出力は原文を含まない候補メタデータ、全所見、未取得証拠、因果関係と環境別保証状態。
- CONSISTENTを含め、HOLD・writeAllowed=false・executionAllowed=false・authority=NOT_ESTABLISHED・selectedCandidate=nullを維持。復旧実行系APIなし。
- Vitest合成反例7系統。異なる代表状態/併存/偽許可/産地scope/環境PASSの証拠不足/重複を拒否。

## 初期実行結果
- TypeScript型検査、Vitest、lint、両build、正式GUI、独立レビュー、CI原成果物照合：本台帳起票時点ではNOT_TESTED。
- Stage 3B-7A Issue #134 の実機環境検証もNOT_TESTED。自動テストの成功を実機保存安全性と混同しない。
- 使用したreportはテスト用の合成構造で、ブラウザ診断の成功事実ではない。

## 残る受入項目
1. 実際のreconcileEvidenceの生成結果から全フィールドを正しく受け継げることを独立確認。
2. source改変・新UNKNOWN・候補欠損を、事前に古い資料へ混入させないテストと証拠検査器の負対照を増やす。
3. 他担当による独立レビュー、最終HEAD上で既存正式GUI6条件と原成果物を照合。初期失敗と修正後の結果を分離して台帳更新。
4. 未来の製品UI接続は今PRの受入範囲ではない。依頼者の別承認がない限り実復旧不可。

## 戻し方
今回の試験専用TS・テスト・文書・LOG差分をrevert。本番保存スキーマ/データの逆移行は不要。
