# A/B比較資料固定挿入：検証記録（2026-10-26 JST）

Issue [#94](https://github.com/tetsujisugimori-coder/calculator-memo/issues/94)。基点main `969d173c16aba208d727f088641712e5b4a0856d`。製品とテストは専用branchのクラウドworktreeで変更。利用者Windowsや実機iPhoneは操作していない。

- [設計](../../agent/formula-report-audit-comparison-insertion.md)
- [独立レビュー](../../agent/formula-report-audit-comparison-insertion-independent-review.md)：容量不明のP2負例をRED→GREEN、追加9件。独立担当のnative実操作ではない。
- [局所UI試験timeout履歴](insertion-ui-local-timeout.json)：旧試験上限は変更せず、成功回だけを採らない。

新純粋境界42件、新統合43件（40件は実CalculatorApp、3件は制御propsのFormulaReportModal）、独立9件を追加。jsdomのstorage eventと実ブラウザの別ページ通知を区別する。途中の試験修正は、Unicode文字列の途中に挿入した後も連続文字列を求めた誤り、実Appの保存競合中に挿入可能と考えた誤り、既存v1の選択適格性、コピー中の無効操作の4種であり、製品の失敗→修正証拠には数えない。

正式GUI契約は既存918確認に48追加=966、既存562geometryに新プレビュー撮影6追加=568、既存114PNGに6追加=120。成功trace0、3worker、30分job上限、6条件の幅/DPR/実操作を維持。局所native診断は全量CIの代替ではない。

全量結果と最終HEADのCI・成果物は確定後に追記する。現在は未確認。PR #93のCI成功を今回へ流用しない。

## 全単体の同期待値確認

`npm test -- --maxWorkers=2` は2105/2105成功、90files、失敗/skip0、320.96秒。既存2011＋新core42＋統合43＋独立9。局所43件の1timeoutも同じ上限・期待値で今回43件すべて成功したが、局所失敗を消さず環境変動の根因UNKNOWNを維持する。正式CIの既定並列は別に確認する。

[ローカル全量機械記録](local-validation.json)：通常/Pages build、型、lint成功。契約41件は40成功/既存0.4秒fixture1失敗を再確認。上限や期待値は未変更。Node24.22.1ローカルと正式Node22.13.0を区別する。
