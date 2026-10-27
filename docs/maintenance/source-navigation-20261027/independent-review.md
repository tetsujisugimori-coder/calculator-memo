# 独立レビュー（実装担当とは別）

- 初回静的確認: 2026-10-27 13:53 JST。
- 対象: Issue #96、main `6e3fa736b9ee335ab5c61b96cc5b52c0b8073868` を基点とする今回作業ツリー。現時点では未commitの実装途中であり、最終HEADのレビューではない。
- レビュー担当は今回の製品実装・既存テスト改修を担当していない。

## 静的に確認した範囲
- 新しい純粋資料一覧／出典resolver、既存2 scannerへの診断export、資料一覧詳細UI、FormulaReportAudit組込、FormulaReportModalの遅延位置移動、追加単体・実App・正式GUI検査、契約件数差分。
- 保存schema、計算エンジン、比較処理、Markdown生成関数の出力処理は変更されていない。既存scanner本体も変更されていない。
- 検証済みmetadataと診断上のclaimedIdを区別。移動候補は通常scannerのcomplete/closed＋式/レポート一致だけ。
- 比較資料内の点検記録は通常scannerから除外。入れ子・交差の補助走査は移動拒否の用途に限定し、そのmetadataを候補へ採用しない。
- 構造化されていない当時の比較状態・理由は復元せず、欠落を明示して固定全文を表示。
- storageアクセス・時計・再比較・再計算は純粋resolver/新UIに含まれない。全文はreadOnly textareaで表示。
- 同期storage世代、現在context、再走査、親のrequest世代・edit世代・選択世代／実位置・実textarea値を移動時に検証する設計。

## 指摘と対応
- 文書と途中コードの補助交差走査のclosed条件が一致していない点を確認依頼。親より「closed vetoのみ、M内部の未閉鎖旧record文字列はinert」の採用設計との回答。最終復元後に再確認する。
- 実装担当自身が検出した本文ABA／selectイベント未通知のREDは、独立担当の発見・再現として扱わない。独立再実行結果は下記へ別記する。

## 実行・証拠の区別
- この段階では実行担当のログ閲覧と静的確認のみ。独立担当自身のテスト再実行・実ブラウザ操作・最終HEAD CI/成果物確認は未実施。
- テスト枠調整後に独立再実行し、実測結果を追記する。

## 暫定判定
最終判定保留。静的確認時点で確定した未解消P0〜P2はないが、途中作業ツリーのため合格保証ではない。実機iPhone Safari、VoiceOver、OS文字拡大、既存WebKit時間変動・100ms契約fixture・過去選択ずれ原因は今回の静的レビューで解消扱いしない。

## 2026-10-27 13:54 JST: 独立担当自身の再実行

- 最新の `record.closed` 限定veto、実選択値capture、editEpochを再読。closed条件の文書／コード不一致は解消。
- 自作純粋probe 12条件成功。3改行、固定資料内Bと後方独立Bの区別、別レポート識別、M内部の未閉鎖旧record風文字列のinert保持、未知出典の移動拒否を独立に実行。`independent-probe-source.txt`、`independent-probe.log`。
- 既存PR95局所69、新pure45、既存envelope11、実CalculatorApp11を独立再実行し **136/136、6 files、skip0、exit0、7.69秒**。`independent-tests.log`。
- コマンド: `npx --no-install vitest run tests/formula-report-audit-comparison-navigation.test.ts tests/formula-comparison-boundary-independent.test.ts tests/formula-comparison-boundary-ui.test.ts tests/formula-report-audit-comparison-record.test.ts tests/formula-report-audit-comparison-envelope.test.ts tests/formula-report-source-navigation-app.test.ts --maxWorkers=1 --minWorkers=1`。
- 独自probe初回は `vite-node` が通常vinext設定を自動読込し、環境の `uv_interface_addresses` で起動失敗（exit7、製品test未到達）。`--config vitest.config.ts` の明示で診断用途に必要な純粋実行へ限定し成功。製品・timeout・assertionを変えていない。
- 実行環境: Node v24.22.1、npm 11.9.0、Vitest 3.2.4。この値はCIのNode 22.13.0ではない。
- M内部の不正なrecord風文字列は現在の出典候補にならず、未識別領域が存在する全体の完全性は別途表示する。識別可能な重複startは移動拒否診断に使用するが未知形式を既知へ変換しない。未知領域に同一IDが潜在するかを内容推測で確定しない。

### 現時点判定
独立再実行対象で未解消P0〜P2なし。これは最終CIの合格や実ブラウザ再操作を意味しない。最終HEAD／成果物照合と正式GUIは実装担当の結果を待ち、独立担当によるnative操作が未実施なら別記を維持する。

## 2026-10-27 13:59 JST: 独立担当自身の実ブラウザ再操作

- Chromium／WebKitの各390×844、touch有効、dark、root CSS font-size 200%で自作操作scriptを実行し、両方成功。正式GUI helperの結果を読むだけでなく、別fixture・別操作scriptで実操作した。
- 固定本文全文の一致、readOnly、Tabで本文移動ボタンへのfocus、document横超過なし、Bへの正確な範囲選択、保持本文不変、保存JSON bytes不変、pageerror0を確認。
- 代表PNG2枚を独立担当が目視確認。大きな文字は折返され、本文移動ボタンのfocus枠／日本語ラベルを認識できる。textareaは縦スクロールを伴う全文閲覧であり、スクリーンショット1枚が全文を表示する証拠ではない。
- Playwright1.56.1、Chromium headless shell1194／WebKit2215の明示executablePath、WebKit依存は既存一時展開ライブラリをLD_LIBRARY_PATHで指定。システムインストールや設定変更なし。Node24.22.1。
- 起動したローカルPages previewは終了済み。ソースは実装途中作業ツリーのPages buildで、公開サイト・最終commitのserved identityではない。
- 証拠: `independent-native-source.txt`、`independent-native.json`、`independent-native.log`、`independent-chromium-390.png`、`independent-webkit-390.png`。この2 PNGは正式GUIの126枚とは別。
- Chromium PNG SHA-256: `dd1b7ca60b57f340e128dec63afee256c2281fcbfaf80f4784aad2378c0a25be`
- WebKit PNG SHA-256: `d8be553e0f3241f8603e915f0af9502292f48a4fc17c2653116baf255845e0f2`
- 全6条件・全操作・実機Safari・VoiceOver・OS文字拡大の独立再実行ではない。
- observedEpoch stateによるrender lint修正を静的再確認。同turn storage拒否は同期ref比較で維持される。正式helperのstorage後dialog閉鎖期待は実際の詳細失効・保持本文の再選択確認へ修正され、製品期待を弱めたものではない。

独立確認対象内の未解消P0〜P2はなし。最終HEAD／正式CI／成果物の同一性確認は引き続き別工程として未確認。
