# PR #107 正式 GUI 未完走区間の限定照合
確認：2026-10-30 19:21 JST。読取・既存成果物照合のみ。CI の新規起動、製品変更なし。

## 結論
**PARTIAL（過去証拠との照合完了、最終修正 HEAD の正式 GUI 成功を意味しない）。**
PR #107 基準 HEAD b4ad743 の WebKit 390px は、PR #103 成功 HEAD 31c5955 の検査列の厳密な先頭 175 / 188 件・geometry 列の先頭 91 / 98 件と一致した。欠けた 13 検査・7 geometry・2 PNG を具体的に特定できた。
同じ停止位置・同じ件数はバックアップ追加前の HEAD 52f4f69 / run 40671009347 attempt 1 にも直接確認できる。ただし、同じ症状であることは同一原因の証明ではない。バックアップ機能との因果関係、WebKit 遅延の原因とも **UNKNOWN**。

## 確認対象と実測
|run / attempt|HEAD|6条件の checks / geometry / PNG|WK390 checks / geometry / touch|状態|
|---|---|---|---|---|
|40972558005 / 1|b4ad743|1115 / 585 / 130|175 / 91 / 1276|5条件 passed、WK390途中|
|40887114420 / 1|31c5955|1128 / 592 / 132|188 / 98 / 1337|6条件 passed|
|40671009347 / 1|52f4f69|1115 / 585 / 130|175 / 91 / 1276|5条件 passed、WK390途中|
|40671009347 / 2|52f4f69|1112 / 585 / 130|172 / 91 / 1262|5条件 passed、WK390途中|

上表は各 ZIP 内の scenario provenance と実ファイル数から集計。過去 attempt 1/2 も今回 raw artifact を再取得したため、再構成メモだけへの依存ではない。
4件とも取得 ZIP の SHA-256 と API の digest が一致。チェック列および geometry 列は、両過去 timeout も PR #103 成功列の厳密な先頭部分と一致。
3 HEAD の e2e/scenario.mjs は同一 Git blob 9f29b4b79e651c7a53f186e600ff1a2b575f2126。テストコードが同一でも製品 HEAD は異なる。

## 欠落 13 検査（WK390 の 176〜188 番）
基準ソース：
https://github.com/tetsujisugimori-coder/calculator-memo/blob/b4ad743b5e495ec813a36a11251d66d3dca2b1ad/e2e/scenario.mjs

|番号|区間と未確認事項|ソース行|
|---|---|---|
|176|保存記録比較：light / dark、CSS文字200%、横幅、図の拡大、キーボード操作、ダウンロードボタン到達、フォーカス復元、原文一致|3556–3606|
|177|計算根拠 version 99 を比較不可として扱い、保護原文を保持|3608–3616|
|178–184|unknown / mixed / duplicate / malformed / mode / missing / multiple の7種：編集停止、ヘッダー/Enter非干渉、原文コピー、原本JSON実ダウンロード一致、初期化キャンセル、reload保全|3731–3789|
|185|合成正常データへテスト側で戻した後の編集・保存・reload、正常メモ画面。直後に sibling 保持 assertion あり|3791–3807|
|186|起動後の保存原文破損時に autosave を拒否し保護へ移行|3808–3816|
|187|合成データを明示確認した初期化経路だけで削除|3817–3826|
|188|シナリオ末尾の browser / runtime / network errors 0 判定|4257|

最後の確定成功は175番「保存記録1件では詳細のみ、履歴欠落を補完しない」（3554行）。
最終 stage は saved-record-comparison。175番後の途中操作がどこまで実行されたかは checkpoint から一意に確定できない。176番以降を「実行して失敗」とは扱わず「完了証拠なし」とする。

## 欠落 7 geometry / 2 PNG
全て接頭辞 webkit-mobile-390px-。
|geometry名|PNG保存対象|画面|
|---|---|---|
|saved-record-comparison-light-200-percent|いいえ|保存記録比較 light 200%|
|saved-record-comparison-dark-200-percent|いいえ|保存記録比較 dark 200%|
|protected-light|いいえ|破損保存原文保護 light|
|protected-light-large-text|いいえ|同、拡大文字|
|protected-dark|いいえ|同 dark|
|protected-dark-large-text|はい|同 dark 拡大文字|
|normal-memos-after-repair|はい|合成データ修復後の通常メモ一覧|

欠落 PNG は protected-dark-large-text.png と normal-memos-after-repair.png（ともに上記接頭辞付き）。
geometry は screenshotCheckpoints の記録であり、非保存設定の5件をPNG欠落と誤認しない。
成功時 trace 非保存の契約であり、trace 0 を欠落エラーに数えない。未完走の必須完了証拠とは区別する。

## 成功・未確認・失敗の分類
- b4ad743 で確認済み：Chromium desktop1365 / narrow390 / mobile375 / mobile390、WebKit mobile375 の5条件完走。WK390 は175 checks /91 geometry/20 PNGまで記録あり。
- 過去 HEAD で確認済み：31c5955 の6条件完走と上記残件の成功。**現行・修正後 HEAD の成功へ読み替えない。**
- 時間切れ未確認：WK390 の上記13/7/2。最終修正 HEAD に本証拠を流用しない。
- 実際の失敗：run40972558005 job123793016107 の正式GUI step は cancelled。job log の 2026-10-30 08:52:38 JST に “The operation was canceled.”。30分 job 上限による未完走。新規 backup GUI step は skipped で未実行。
- 各 provenance の errors[] は0件だが、未完走シナリオ全体の無不具合を証明しない。今回の取得証拠には assertion failure の確定記録は見つからない。
- 正式GUIジョブの単体・lint・type・通常build・Pagesbuild 等の前段は success（ただし b4ad743 の過去結果）。
- 製品非干渉を本調査だけで最終判定できない。親担当の新規 backup GUI 独立CI・単体回帰結果と別途統合する。

## 再実行判断
既存証拠だけで残件の所在と過去同症状を特定できたため、本担当は正式GUI全体を再実行していない。
新規バックアップGUIの独立実行が先決。本証拠だけを根拠に timeout 延長、期待値緩和、正式GUI成功への読み替えは不要・不可。
実機 iPhone Safari / VoiceOver / OS文字拡大をこの Playwright 証拠から認定しない。

## 出典・証拠
- PR107 run: https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/40972558005/attempts/1
- PR103 success: https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/40887114420/attempts/1
- earlier timeout1: https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/40671009347/attempts/1
- earlier timeout2: https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/40671009347/attempts/2
- raw artifact IDs: 12943175094 /12903942985 /12809842419 /12811567671（上記順）
- ローカル証拠：comparison.json、pr107-job.log、pr107/・pr103/・old1/・old2/ の provenance / PNG / logs。

### ZIP SHA-256
- pr107: `11046221d8c9375bf7ea1d524ead44db020f7b61067d54a25147853474bf49d9`
- pr103: `e667138ce7f3126a103b9b45a7c05da7960ef1cd69861db19ae7e45ee8540aaf`
- old1: `04d4e74ef080623cbb6858e5021ce5666748b99485feb56f6c0ab2af0f5b6534`
- old2: `dacd9afc1f80fc1bce7e431f5448bd20187ca7867cf50e332ea9c700819edc71`

### 欠落検査の原文ラベル
176. webkit-mobile-390px: record comparison stays horizontally contained with reachable controls focus restoration and both themes at 200 percent text
177. webkit-mobile-390px: unsupported persisted record version refuses comparison and preserves the exact protected original
178. webkit-mobile-390px: unknown blocks protected across header/keyboard/reset-cancel/copy/exact-file-export/reload
179. webkit-mobile-390px: mixed blocks protected across header/keyboard/reset-cancel/copy/exact-file-export/reload
180. webkit-mobile-390px: duplicate blocks protected across header/keyboard/reset-cancel/copy/exact-file-export/reload
181. webkit-mobile-390px: malformed blocks protected across header/keyboard/reset-cancel/copy/exact-file-export/reload
182. webkit-mobile-390px: mode blocks protected across header/keyboard/reset-cancel/copy/exact-file-export/reload
183. webkit-mobile-390px: missing blocks protected across header/keyboard/reset-cancel/copy/exact-file-export/reload
184. webkit-mobile-390px: multiple blocks protected across header/keyboard/reset-cancel/copy/exact-file-export/reload
185. webkit-mobile-390px: repaired normal dataset supports editing/saving/reload; sibling preserved
186. webkit-mobile-390px: post-ready storage corruption blocks autosave and enters protection
187. webkit-mobile-390px: explicit confirmed reset alone clears protected synthetic data
188. webkit-mobile-390px: zero browser/runtime/network errors
