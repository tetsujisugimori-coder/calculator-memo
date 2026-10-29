# PR #103 限定診断計画

**未実行。** 新規 `workflow_dispatch` workflowはGitHub仕様上default branchにファイルが必要で、現mainに存在しない。main変更・公開workflow流用・正式GUI再試行をしない。別Ubuntu環境で同じCLIを実行する場合も以下の固定条件を守る。計測器の完了と根因確定は別である。

## 仮説と固定条件

対象アプリSHA `52f4f6914fcd3c72b0829018842f653f06abe5f2`、Ubuntu 24.04 x64、Node 22.13.0、両lockfile、Playwright 1.56.1同梱WebKit。実checkout SHA・diagnosticコードSHA・run/attemptまたはlocal ID・ブラウザ配信identityを記録・検証する。別環境はkernel、CPU/メモリ、アクセス権、依存取得、時間枠、費用、証拠保存・取得を記録し、不明はUNKNOWN。コンテナはhost kernel/resourceを共有しGitHub runnerと同一視しない。

過去のrun 40671009347両attemptで共通に遅い `formula-audit-record-comparison` の既存helperを、既存fixtureと全11 `passed` 群・assertion・native tapを使ってfresh contextで実行する。前後の全体suiteは実行しない。long prefixの再現はないため蓄積の否定はできない。2幅はheight 844・DPR3・touch・locale・コード・操作を固定し幅だけ変える。これは正式375条件（height667・DPR2）と異なるため正式CIの時間比と直接同等ではない。

幅差が特定区間の要求→完了やdispatch時間で現れるなら、fresh条件下で幅に関連する遅延の手掛かり。差が見えなければ、この短い条件で観測されなかっただけで、既存CIの原因やDOM蓄積は否定できない。dispatchはactionability待機とbrowser処理を含み、それだけでは因果分離不能。resource観測は可視子孫の累積CPU tickとRSSで、終了・reparent・不可視プロセスは欠落し得る。host/Node値だけでbrowser原因としない。

## 実施順と上限

|順|幅|DOM観測|回数|先行範囲|
|---|---:|---|---:|---|
|0|375|なし|1|fresh context、対象helperのみ|
|1|375|あり|1|同上|
|2|390|なし|1|同上|
|3|390|あり|1|同上|

各caseは300秒で停止要求、後処理の猶予を別計上し、CLIの新規開始判断上限1200秒、job上限30分（準備・開始待ち・GUI・後処理を分離）。総残時間が次caseの上限未満なら開始しない。終了処理による1200秒超過はあり得る。観測有無は同じ操作とassertionで、helper前・最初の比較成功時・helper後のDOM総数・dialog数・page数と採取時間を記録。全caseでtap要求・dispatch開始終了・touch観測完了・終了を記録し、チェック・操作ごとの進捗保存自体の負荷は両群に共通。page評価やselect、keyboard、assertion個別の内部待機は区別できず、欠測として扱う。観測あり／なし各1回の差は変動を含むため計測負荷の厳密な推定ではない。順序効果・少数回・worker単独の限界を明記する。

開始前に既存46契約試験が全成功しなければGUIに進まない。各caseで識別不一致、assertion失敗、予期せぬbrowser/network error、採取失敗、timeout、終了シグナル、証拠欠落、cleanup失敗があれば停止し以降は未実施。自動retry・追加caseなし。timeoutは未完了でありPASSではない。実行に先立って本計画と計測器をcommitし、そのSHAを記録する。結果はrun/attempt・環境・実測値・exit・artifact ID/SHAを記載し、ZIP再取得と過去引用を区別する。

各caseは独立childとして進捗とログを逐次保存し、timeout/cancelでTERM、猶予後KILLを送る。Linuxではprocess groupへ送信。証拠のuploadは失敗時も試みるが、runner強制終了や権限障害では保存を保証しない。取得不能はUNKNOWN。mock検証は実browser計測や正式GUI成功を意味しない。

全caseで20 tapごと（0、20、40…番）の要求直後・dispatch前に可視process treeを採取し、case内の単調時刻・操作番号・採取時間を保存する。DOM観測の有無とは独立した共通負荷で、厳密な個別操作のCPU帰属ではない。PID・コマンド名・累積tick・RSSを保持し、WebKit等の名前を含むprocessがない場合も欠測として数える。終了・reparent・不可視processは含まれない。request→終了とdispatch時間の集計は欠落を0とせず件数を記録し、必須の操作時刻・採取やDOM観測が欠落すればcaseは失敗する。名前だけによるbrowser推定は保証しない。

進捗保存の回数・時間は前回までの書込み分を累計し、最終書込み自体は含まない。case全体とhelper本体の所要時間を別記録。Linuxではchild終了後も元のprocess groupの存在を確認し、残存時はTERM後KILLを試み、namespace内で消失を確認できなければ失敗する。別groupに離脱した子やnamespace外は確認できず完全cleanupを保証しない。process groupのLinux実動作、browserでの操作完遂、計測負荷の妥当性、artifact保存・再取得は未検証であり、最初の実行結果で確認する。

## 実行入口と制約

workflowは診断branchの計測器と固定アプリを別checkoutし、46契約の後にPages buildと固定WebKitを用意して `node control/e2e/diagnostic-supervisor.mjs` を起動する。手動実行には別途default branchへの登録が必要で、今回行わない。別Ubuntu環境ではアプリを上記SHAにcheckoutし、両lockfileを `npm ci --ignore-scripts` で導入、`npm run build:pages`、固定WebKitとOS依存を用意したうえで `DIAG_APP_ROOT`、`DIAG_OUTPUT`、40桁 `DIAG_CODE_SHA` を指定する。契約46件を先に実施し全成功時だけCLIを起動。計測器側のmock試験は別集計。環境・費用・権限が不明なら実行しない。

正式6条件・3workers・job30分・1128検査・592 geometry・132 PNG・touch各1337・成功trace非保存は不変。force click、固定sleep、期待値削減、失敗隠蔽なし。iPhone Safari実機・VoiceOver・OS文字拡大未検証。
