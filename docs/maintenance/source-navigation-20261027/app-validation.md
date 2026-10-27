# 出典ナビゲーション実 CalculatorApp 回帰（実装担当）

- 記録日時: 2026-10-27 13:51 JST。
- 対象: `feat/audit-comparison-source-navigation` の未コミット実装。基点 main `6e3fa736b9ee335ab5c61b96cc5b52c0b8073868`。最終 HEAD の試験結果ではない。
- 担当範囲: `tests/formula-report-source-navigation-app.test.ts`。実際の CalculatorApp / React / jsdom 経路、合成 localStorage、制御した requestAnimationFrame で検証。ネイティブ Chromium / WebKit 操作や独立レビューの代替ではない。
- 既存期待値・timeout の変更、テストの `.skip`、retry は追加していない。以下の `-t` は原因切り分けのための選別実行であり、全量成功と混同しない。

## RED 1: 本文編集後に同じ文字列へ戻る ABA 境界

再現: 出典 A への移動を要求し RAF を保留 → 本文へ文字追加 → 元の本文へ戻す → 保留 RAF を実行。
期待: 古い移動は失効し現在の選択位置を保持する。
実際: 現選択 `[996,996]` を古い A 範囲 `[9,337]` へ上書きした。
原因: 本文・文脈文字列が元に戻ると等値比較が通り、編集世代を照合していなかった。

- コマンド: `npx --no-install vitest run tests/formula-report-source-navigation-app.test.ts --maxWorkers=1 --minWorkers=1`
- 10 件中 9 成功 / 1 失敗、終了コード 1、2.90 秒。`app-red.log`。
- 実装担当が既存 `auditEditEpoch` の capture と実行直前照合を追加。
- 同期待値で元 10 件は 10 成功。2.78 秒。`app-green.log`。後追加 1 件は `-t '^(?!a changed native selection)'` で選別対象外なので Vitest の skipped 表示 1 件がある。製品テスト無効化ではない。

## RED 2: native select 通知前の選択変更

再現: A への移動を要求し RAF を保留 → 同じターンで textarea.setSelectionRange(4,7) → select イベント配達前に保留 RAF を実行。
期待: 選択 `[4,7]` を保持する。
実際: 古い A 範囲 `[9,337]` へ上書きした。
原因: native select イベントが更新する位置世代だけではイベント配達前の実選択を確認できない。

- コマンド: 上記に `-t 'a changed native selection'`。
- 選択した 1 件が失敗、他 10 件は選別対象外、終了コード 1、1.93 秒。`app-selection-red.log`。
- 製品修正後、追加を含む 11 件のフィルター無し再実行は確認待ち。

## 既に確認した経路

LF / CRLF / CR の A・B・比較資料の正確な UTF-16 位置から textarea LF 位置への変換、プレビューから編集表示への移動、全文保持、保存原本・確認履歴不変、閲覧移動中の storage getItem / setItem 不発生、実 CalculatorApp の保存更新・削除通知と保持本文、編集・選択・後続要求・閉じるによる古い RAF 破棄。これらは上記実装時点・jsdom 範囲の結果。

## 2026-10-27 13:52 JST: 全 11 件 GREEN

- 実装担当が要求時の実 textarea 選択位置を保存し、RAF の実行直前にも一致を確認する局所修正を追加。preview 時に editor が無い経路は別扱いで既存移動を保持。
- フィルター無しの同一コマンドで 11 / 11 成功、失敗 0、skip 0、終了コード 0、2.96 秒。`app-final-green.log`。
- RED 2 件の期待値は変更していない。最初の 10 件と追加境界 1 件を合わせた結果であり、プロジェクト全量や正式 CI の成功ではない。
