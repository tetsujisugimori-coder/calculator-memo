# ローカル限定検証

2026-10-30 19:23 JST。Linux / Node 24.22.1。基準 b4ad743 に本PR修正を加えた作業ツリー。指定 Ubuntu24.04 / Node22.13.0 CI の成功とは別。

- 修正前 RED: 成功→同タブ原文変更→再書出しで旧成功表示が残る1件FAIL（既存6件PASS）。修正後の同試験はGREEN。
- 修正後: 全単体108ファイル2315件PASS（3 workers）。バックアップ固有16件を含む。原文保全、未保存除外、Enter非干渉、同値通知、同一ターン失効/再取得/ABA、読取失敗と表示復帰、出力失敗を維持。
- 既存CI契約46/46、追加backup CI契約2/2、lint、型、通常build、Pages build PASS。契約2件はjob依存なし/失敗を隠さない静的契約であり、GitHub timeoutの人工実証ではない。
- ローカルGUI Chromium375/390 ×light/dark、CSS200%の4条件PASS。要求前後のページ/modal幅、実ダウンロードのJSON原文一致、ボタン到達、別page失効を実測。WebKitは不足OSライブラリにより起動できず4条件NOT_RUN。全8条件成功ではない。途中JSONはstatus failedで保存。
- 最終remote HEADの独立CI、artifact再取得、独立レビューはPRコメントに記録。本文コミット時に成功を先取りしない。
- 実機iPhone Safari、VoiceOver、OS文字拡大、端末保存完了、WebKit遅延根因は未検証/UNKNOWN。
- 独立静的点検で、SIGTERM済みpreviewのexitを再待機するP3を検出。終了promiseを事前保持しsignalCodeも終了条件に含める最小修正。動的強制終了実証は未実施。
