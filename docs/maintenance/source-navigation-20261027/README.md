# Issue #96 固定比較資料の出典追跡 検証記録

## 着手（2026-10-27 13:43 JST）
- GitHub main `6e3fa736b9ee335ab5c61b96cc5b52c0b8073868` / tree `2505d2f6a81a44d60484be03fc6725683dc8a91c` を API と fetch で確認。PR #95 は 2026-10-27 12:59:41 JST に merged、提出 HEAD `8cd244410db436dfa8597e1e8fff9efaa450850a`。
- 既存クラウド worktree は clean、別 worktree `calculator-source-navigation` と `feat/audit-comparison-source-navigation` を main 基点に作成。Windows は未操作。
- open Issue/PR 一覧、関連検索、#94 本文を照合し、専用追跡画面は従来対象外で同目的なし。Issue #96 を作成。AGENTS/README/LOG/開発・検証規則/e2e手順と既存scanner/UIを参照。
- 既存 2137 単体 / 41 契約 / 972 GUI / 568 geometry / 120 PNG の契約を確認。実行はまだしていない。共有環境の別作業と重い試験は競合させない。
- 固定比較 v1 に状態・理由の構造化情報はない。既存本文全文を保持し、不足は不足として説明。再比較や文意の逆解析は行わない。

## 証拠と制約
新規実行結果をここへ追記する。過去 CI の成功は今回の成功へ流用しない。WebKit 時間変動・ローカル100ms fixture環境差・過去選択ずれ根因・実機Safari/VoiceOver/OS文字拡大は未解消/未検証のまま。

## 新機能の実測（2026-10-27 13:43〜14:00 JST）

- pure45、UI12、実CalculatorApp/jsdom11は全成功。新規68件。実装中の4境界（本文ABA・select未通知・record交差・破損領域内同IDstart）は同期待値RED→GREEN。既存PR95scanner本体を壊したという意味ではない。
- 独立担当自身が独自probe12、既存PR95を含む136件を再実行し全成功。Chromium141／WebKit26の390px touch、dark root CSS200%、固定全文／readOnly／Tabfocus／Bへの正確移動／保持本文・storage bytes不変を別scriptで実操作。独立画像2枚は正式PNG契約とは別。未解消P0〜P2なし（最終HEAD・CIは後続確認）。
- 実装担当局所native：Chromium141.0.7390.37／WebKit26.0、390px DPR3 touch、各7群／2geometry／1PNG／44tap成功、pageerror・想定外通信・requestfailed0。正式6条件の代替ではない。初回runner about:blank、exec終了によるserver消失、通知後に監査dialogが閉じるという余分な期待をそれぞれ失敗記録。実際の通知後は詳細失効・未確認表示・保持本文再選択であり、製品修正はせず検査を仕様へ訂正。
- 正式契約予定は1014 GUI／580geometry／126PNG／mobile1216操作。旧972群・568geometry・120PNGは削減なし。追加7群×6／2theme geometry×6／代表詳細PNG×6。全6条件、DPR、3worker、30分上限、成功trace0を維持。
- local Node24.22.1/npm11.9.0、Playwright1.56.1、既存同revbrowserを明示起動。CIは既存pin Node22.13.0。WebKitは既存一時展開の依存をLD_LIBRARY_PATHで使用し、OSインストールや設定変更なし。
- 初回全2205単体成功・型成功・通常/Pagesbuild成功。lintのrender中ref参照1errorをstate/ref分離で局所修正し全工程を再実行。初回契約はrun-stage出力env継承によるfixtureログ所在不整合で失敗、子からenvを除いて再実行。失敗を削除せず初回と再検証を区別。
- Git CLI push dry-runは認証なしexit128で未送信。認証済GitHub connectorによるblob/tree/commitと非強制branch作成を使用し、localtreeを照合してfetch後fast-forwardのみで同一HEADへ進める。

raw機械ログのUTC ISO日時は原出力のまま保持し、本文の日時・判断記録はJSTで示す。

## 提出前再検証（2026-10-27 13:59〜14:01 JST）

最終製品コードで全単体2205/2205（95files）、lint0error、型、通常build、Pagesbuild、契約41/41が成功。skipなし。local-validation.jsonに初回失敗と再実行のexit/durationを保存。100ms fixtureが今回は成功したことは、既存環境差の根本解消を意味しない。正式最終HEAD CI・成果物照合はPRへ追記する。

保存済み確認履歴・snapshot・schema・計算エンジン・比較builder・固定挿入creatorの変更なしを差分確認。新実App11件と既存PR95独立69件も成功。現段階の保証は上記ローカルと独立操作の範囲に限る。
