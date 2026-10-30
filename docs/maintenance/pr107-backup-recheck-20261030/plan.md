# PR #107 修正・限定再検証計画

記録日: 2026-10-30 JST。基準 HEAD: b4ad743b5e495ec813a36a11251d66d3dca2b1ad。Issue #106 / Draft PR #107。

## 先に固定する範囲

- 仮説: 旧成功表示は同タブ原文変更をdownload直前照合で検出した分岐で消されていない。成功→変更→要求→再取得→要求と、読取失敗→再取得の合成回帰で確認する。保存処理は追加しない。
- バックアップGUI: Chromium/WebKit ×375/390px ×light/dark、CSS文字200%の8条件、各1回。要求前後のページ/modal幅・長いファイル名・ボタン44pxとhit-test到達性・原文一致・別page変更失効。実機Safari、VoiceOver、OS文字拡大は範囲外。
- 独立jobはUbuntu24.04 / Node22.13.0、固定lockfile/Playwright。job15分、依存/build4分、ブラウザ準備5分、実GUI5分、後処理余裕を残す。最初の失敗で後続case停止、ケースJSONを逐次保存。timeout/途中終了/running/8未満は成功としない。自動再試行なし。ログと既得PNGをalwaysで7日artifactへ保存。
- 正式GUIの旧証拠を先に比較する。旧HEAD成功を新HEAD成功にしない。最終push1回で既定PR workflowの正式jobも起動する。目的は状態表示修正後の既定回帰と独立job構成の検証であり、遅延根因の探索ではない。正式6条件/1128検査/592geometry/132PNG/touch各1337/3workers/30分を変更せず1回だけ、無条件rerunなし。正式jobの失敗やtimeoutでbackup jobを依存停止させない。未完走時は未確認項目を残す。
- Pages workflowはmain push/手動起動のみ。今回は作業branch pushだけ、main変更・公開・マージ・Draft解除・auto-mergeなし。skip指定やpath除外で正式保護を弱めない。
- 原文取得・比較によるABA検出限界を維持。ダウンロード開始は端末保存完了の証明でない。過去の失敗・timeout証拠を消さない。

## 判定

機能固有の受入と正式GUI全体を別判定にする。保存非干渉違反または新P1/P2製品不具合はマージ不可。独立GUI未実行も未完了。既存遅延だけが残れば限定範囲PASS・総合PARTIALとして人間が判断できる資料を揃える。

## ローカル環境

接続済みdesktopが取得できず、既存taskへの継続呼出はbackend error（新turnなし）。別のcloud checkoutで作業。Node24.22.1、Linuxの試験は指定Ubuntu/Node22 CIと区別する。既存作業ディレクトリは変更しない。初回npm/browser installは既定home cacheディレクトリ作成不能で失敗、許可された/tmp専用cacheへ切替（依存版不変更）。

今回の限定照合とローカル結果: [旧正式GUI証拠](formal-evidence.md)、[ローカル検証](local-verification.md)。最終CIの証拠はPRコメント。
