# A/B比較資料固定挿入：検証記録（2026-10-26 JST）

Issue [#94](https://github.com/tetsujisugimori-coder/calculator-memo/issues/94)。基点main `969d173c16aba208d727f088641712e5b4a0856d`。製品とテストは専用branchのクラウドworktreeで変更。利用者Windowsや実機iPhoneは操作していない。

- [設計](../../agent/formula-report-audit-comparison-insertion.md)
- [独立レビュー](../../agent/formula-report-audit-comparison-insertion-independent-review.md)：容量不明のP2負例をRED→GREEN、R1/R2/R3の負例と最終12件。独立担当のnative実操作ではない。
- [局所UI試験timeout履歴](insertion-ui-local-timeout.json)：旧試験上限は変更せず、成功回だけを採らない。

初版では新純粋境界42件、新統合43件（40件は実CalculatorApp、3件は制御propsのFormulaReportModal）、独立9件を追加した。後の追加・変更は下記の最終受入再精査を参照。jsdomのstorage eventと実ブラウザの別ページ通知を区別する。途中の試験修正は、Unicode文字列の途中に挿入した後も連続文字列を求めた誤り、実Appの保存競合中に挿入可能と考えた誤り、既存v1の選択適格性、コピー中の無効操作の4種であり、製品の失敗→修正証拠には数えない。

正式GUI契約は既存918確認に48追加=966、既存562geometryに新プレビュー撮影6追加=568、既存114PNGに6追加=120。成功trace0、3worker、30分job上限、6条件の幅/DPR/実操作を維持。局所native診断は全量CIの代替ではない。

実装初版の正式CI結果は下記に保存。最終修正HEAD自体のCIは本記録コミット後に確認し、PR #95・Issue #94とChecksへHEAD/run/attempt/digest付きで記録する。先行HEADやPR #93の成功を最終HEADへ流用しない。

## 全単体の同期待値確認

`npm test -- --maxWorkers=2` は2105/2105成功、90files、失敗/skip0、320.96秒。既存2011＋新core42＋統合43＋独立9。局所43件の1timeoutも同じ上限・期待値で今回43件すべて成功したが、局所失敗を消さず環境変動の根因UNKNOWNを維持する。正式CIの既定並列は別に確認する。

[ローカル全量機械記録](local-validation.json)：通常/Pages build、型、lint成功。契約41件は40成功/既存0.1秒fixture1失敗を再確認。上限や期待値は未変更。Node24.22.1ローカルと正式Node22.13.0を区別する。

## 初版CIと最終受入再精査

[初版正式CI](formal-ci-40314584238.json) はHEAD `7a2ff47670153b6d7bfafb9fd55111a6b1ecf3af`、run40314584238 attempt1で成功。966 GUI・568 geometry・120 PNG・trace0、単体2105、契約41。job28分55秒、GUI25分15.951秒であり30分上限までの余裕は65秒。時間変動リスクは残る。

CI成功後の要求精査でP2 R2（既知失効後の取消操作表示）とP2 R3（API指定のUTF-16不正位置）を確認して局所修正。REDと同一期待値GREENは[独立レビュー](../../agent/formula-report-audit-comparison-insertion-independent-review.md)、[取消RED/GREEN](unsafe-undo-red-green.json)へ記録。集合容量の直接拒否試験は[機械記録](insertion-aggregate-capacity.json)を参照。

最終契約は既存2011＋core42＋統合45＋独立12＝2110単体。全量の中断・失敗・再検証は[最終ローカル全単体](full-unit-final.json)に保持する。R3追加後の2109成功/1失敗は、既存選択往復試験のend7が絵文字のsurrogate対を分断していたため。選択往復の期待値を変えず有効境界end8へfixtureを訂正し、不正境界の独立負例は保持した。

[最終局所native](native-r2-r3/README.md) はChromium touch390の追加8群・69実tap・pageerror0、59.666秒。R2で利用不能の取消操作を表示しなくなったため、そのtapだけを除き、欠如＋理由＋本文不変の期待値を追加。正式GUIの966検査は削減しない。最終mobile合計1170tap、その他966/568/120/trace0/3worker/30分は維持。旧native証拠は[native-local](native-local/)に保存し、最終WebKit全量の代用にしない。

本コミットは先行CIの確定結果と最終CI待ちを分ける。最終CI後の記録のみを目的とした追加commitでHEADを変えず、PR/Issue/Checksに最終HEADの結果を残す。

### 記録訂正

初版記録の契約fixture「0.4秒上限」は誤記。実コードは timeout `0.1s` と kill-after `0.2s`、外側spawnSyncは5000msであり、今回いずれも変更していない。初版JSONには訂正情報を追記し、失敗40/41の事実は保持した。
