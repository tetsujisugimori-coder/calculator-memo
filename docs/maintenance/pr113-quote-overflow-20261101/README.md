# PR #113: 固定引用の3px横はみ出し

2026-11-01 JST 記録。Issue #112 / Draft PR #113。最終受入・マージ判断は最終HEADのCIとPR追補を参照し、この提出前ローカル結果だけではPASSにしない。

## 原因と比較

元HEAD `730d55e83920da50f7249e1f9adfab674b1e9a57` / tree `0b932472f88153a87864550e803aa9a07aec1d66`、main `2549c8c15d9a5e4cea052eabc0020ad03104b49a` は開始時GitHub現物と一致。新規cloneと独立main worktreeを使用し、既存作業を変更していない。

[失敗run 41192402203 attempt 1](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/41192402203) / job `124511722122` のartifact `13040192575` を取得。完全ZIP 42,000,858 bytesのSHA256は `36a196553c1db89f51ef8ca1fbf39ebc199112a160c4a314a8a0e10aaa8e4e91` でAPI digestと一致、ZIP全CRCも確認。保持期限2026-11-07T10:51:25Z。failure trace、PNG、worker.logを読み、trace `call@3780` の合成保存状態（10メモ・49履歴）、2回の引用本文、UUID・日時、原本取得日時を試験側fixtureへ固定した。

引用1 `eb903e94-df54-4b5a-a815-70a5696ef5c5` / `2026-10-31T10:35:25.558Z`、引用2 `5122c088-f45f-491e-aaf0-8d39573ff0f5` / `2026-10-31T10:35:28.037Z`、原本取得 `2026-10-31T10:35:24.268Z`。各本文1844文字の完全一致を検査する。製品のUUID・日時生成は変更していない。

mainとPRの独立buildを同じWindows / Node24.20.0 / Playwright1.56.1 / Chromium141.0.7390.37、ja-JP / Asia/Tokyo、非touch390×1000 / DPR1で比較。挿入→取消→再挿入後、両テーマCSS200%で双方391/388を再現した。既存引用実装・正式scenarioはmainと同一、PRの従来追加CSSはpreview限定。したがって今回のfixtureで示されたのは**既存引用表示の入力依存問題**であり、新previewの新規回帰ではない。CIのUbuntu24.04 / Node22.13.0 / Linuxフォント / 3workersとは環境差があるため、CI自体の成功は別に確認する。

## 局所因果の実測

引用状態一覧の「引用ID：…　引用日時：…」段落が幅352pxに対しscrollWidth373px。段落rect左19 / 右371、モーダルcontent左1 / 右389 / client388、左右padding18px。U+3000全角空白が行末で右へ出て、Range左359.671875 / 右391.671875（段落右端から20.671875px）。他の文字を含め、TreeWalkerで全Textノードの文字別Rangeを計測した。親のスクロール領域が391pxとなる3px超過と一致する。

|同一状態への診断側だけの介入|content scroll/client|段落scroll/client|
|---|---|---|
|変更前|391/388|373/352|
|閉じdetailsのsummary以外を非表示|391/388|373/352|
|当該段落だけ非表示|388/388|0/0|
|当該段落だけline-break:anywhere|388/388|352/352|
|元へ復元|391/388|373/352|

閉じdetails内346要素は実際の可視要素から分離。既存診断の巨大grid幅は、この3px超過の原因ではなかった。診断の非表示介入は因果確認のみで、製品には含めない。

## 修正とRED→GREEN

製品変更は `FormulaReportQuotes.tsx` の当該段落へ `quote-identity` classを追加し、`globals.css` でそのclassだけに `line-break:anywhere` を指定する2行。ID・日時・日本語・全角空白を欠落させず折返す。幅上限緩和、overflow隠蔽、保存処理、他モーダルの共通CSSは変更していない。

独立回帰 `e2e/quote-overflow.mjs . <label> --expect-fit` は修正前に391/388でexit1、修正後は全checkpointでcontent388/388、exit0。同じfixture・操作・横幅述語（scroll <= client + 1）を使用。修正後に当該段落だけ旧line-break:autoを一時復元する負の対照も391/388を検出。raw全キー一致、アプリのset/remove/clear各0、ブラウザエラー0。

追加のChromium/WebKit×375/390×light/dark、CSS200%、native模擬touch8条件もローカル8/8完了。各UUID2回・本文完全一致・挿入前プレビュー/挿入/取消/再挿入・全モーダル横幅・保存spyを検査。これは提出前dirty buildの結果で、最終HEAD受入ではない。

## 検証・証拠境界

正式 `scenario.mjs` / `scenario-config.mjs` / `smoke.mjs` / `ci-contract.mjs` は変更しない。6条件 / 1128検査 / 592geometry / 132PNG / 3workers / 30分、既存2480単体・57契約を維持。追加した `quote-overflow` jobは独立して非touch固定fixtureと8条件を実施し、正式jobを置換しない。独立診断traceの保存は正式成功trace非保存の契約に含めない。

ローカルlint・型・通常build・Pages build成功。単体初回2479/2480、唯一の失敗はGitのLF原本とWindows checkoutのCRLFになった既存Markdown例の差。checkout bytesを別保全後、同じHEADのGit原本bytesで全115files/2480件が成功し、期待値・テスト内容は変更していない。既存57契約のWindows実行は48成功/9失敗（Linuxコマンド・子process経路の相違）で、Ubuntu契約成功とはしない。最終HEAD CIの2480/57・正式6条件・preview/backup/restore/recovery各8条件・artifact照合はPRに記録する。

初回sandboxのloopback EACCESはホストでの承認済み127.0.0.1実行により解消。追加因果診断の初回load待機timeoutは失敗として保持。診断のreloadは同じ10秒上限でDOMContentLoadedと実コントロール成立を待つ方式へ変更した。正式GUIの待機条件は変更していない。古い成功や反復で得た偶然のPASSを最終結果に選別しない。

配信identityはHEAD/tree/dirtyとbuild assets digestを生成し、ブラウザから読戻す。CIは期待SHA・cleanも必須。これはbuild後の診断マーカーであり、改ざん不能な第三者証明ではない。元main/PR比較と新しい回帰のbuild記録・digestを区別する。

元失敗、main/PR比較、因果、RED/GREEN、8条件の圧縮JSON/ログと代表PNGはこのディレクトリ。[manifest](evidence-manifest.json) にSHA256を記録。完全ZIPとtraceはtask workspaceにも保全。最終CIの成果物・最終SHAはPRのChecksにリンクする。

実装担当とは別担当の独立レビューで初期の因果証拠・局所修正案を確認。全Text測定、build identity、明示横幅assertを補強。製品変更後および最終HEAD CIの独立確認はPRへ追補する。

## 追加診断のCI準備判定補正

候補 `43251958ca6bc39feed6db850d539e9dcc4425b4` のrun `41217286703` attempt1では、追加quote jobだけがブラウザ起動前の準備待機で失敗した。Viteが実際には正しいloopback URLを出していたが、CIのANSI色コードがポート番号の前後へ入っており、追加診断のraw文字列includesはURLを認識しなかった。artifact `13048114500`（112619bytes、SHA256 `1fe0a3388574d1abbea381a127e0086e2b96f1913e1e12a083be161d922af52a`）の完全digest/CRCとserver.log/result.jsonを確認して保持した。GUI測定は0件であり製品FAILでもGUI成功でもない。

新診断の準備判定だけに、既存正式scenarioと同じ `stripVTControlCharacters` を適用する。30秒上限・横幅oracle・ブラウザ条件・製品修正は不変。元CI server.logの実bytesでraw照合false→色コード除去後trueを明示assertした（ci-ansi-readiness-check.json）。`FORCE_COLOR=1` 環境のローカル実GUIも成功したが、そのserver.log自体はplain URLだったためANSI出力の実証には用いない。独立レビュー後、補正commit後の新最終HEADの全CIを判定する。旧runの結果・取消・未完了は保持し、無根拠な同一CI再試行や成功選別を行わない。

Space短間隔の旧2失敗は因果を証明しておらずUNKNOWNのまま。実機Safari・VoiceOver・OS文字拡大・ソフトキーボードは未検証。部分復元・ID再割当・snapshot再生成・自動修復・保存形式変更・永続選択は行っていない。Issue105へ新投稿せず、Draft・未マージ・未公開を維持する。戻し方は当該class/CSSと独立回帰追加のrevertで、保存データ変換は不要。
