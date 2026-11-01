# PR #113 WebKit待機区間の継続診断（2026-11-01 JST）

本人の再依頼により、前回の有限診断を繰り返すのではなく未分離のtap内部を点検する。
開始時PR/local/origin HEADは `6e34a40fec28e5d6e8531d2476ce8abb231b4370`、tree
`8997f8d2cf9dfefb587d94769c2545f5456506a0`、mainは`2549c8c15d9a5e4cea052eabc0020ad03104b49a`。
新しい独立cloud checkoutでcleanを確認。Windows PCは接続一覧に存在せず、旧作業を変更しない。

## 証拠の再取得

旧6runの21 ZIP（251,393,260 bytes）と21 decoded jobログ、GitHub job/artifact metadataを
cloud executorに保全した。全ZIPのAPI size/SHA-256/CRC一致、旧13 ZIPは旧manifestの全内部
path/hash/size一致、最終8 ZIPはPR本文digest一致を別担当が確認した。
`evidence-reacquisition-manifest.json.gz` に出典・取得UTC・HEAD・run/attempt・期限を記録。
jobログはconnector decoded UTF-8でありGitHubの元圧縮bytes一致を主張しない。
旧/最終正式と取消重複Aのtrace ZIPは欠測。Windowsの原本を取得したとは扱わない。

前回最終正式は5/6、1106/1128検査、583/592geometry、130/132 PNG。
30分job上限注記は取消理由の根拠であり、WebKit内部遅延根因の証明ではない。

## 新たな静的・既存trace分析

固定Playwright 1.56.1のtapは既に`waitAfter: disabled`で、noWaitAfter追加は解決にならない。
Linux WebKitのstableRafCount=1でも、初回rect取得と次frame比較には最低2回のRAFが必要。
旧A成功traceの1337 tapはAPI合計353.516秒、visible/enabled/stable合成待機299.165秒
（84.6%）、scroll1.369秒、performing→done18.950秒、その他34.031秒。
これは実dispatchだけが律速という説明に反するが、合成待機をRAF単独原因と断定しない。
23callに94 retryがあり、notstable54・sticky topbarのhit interception33などが観測された。
安全なactionability判定・retryを削除せず、forceやmouse代替を行わない。

## 診断設計と有限境界

正式scenario、期待値、保存保護、6条件/1128/592/132/3workers/30分は変更しない。
診断派生workerだけでtap前後のopt-in observerを追加し、対象rect・RAF間隔・visibilityを記録。
sample1200、lifecycle100、1tap10秒上限でcleanupする。observer取得不能はNOT_OBSERVABLEとし、
元tap失敗を上書きしない。実行helperのcopy/hash/dirty/終了時同一性を記録する。
追加evaluate往復、RAF callback、layout読取、同期I/Oが実行に与える影響は残る。

まずlocalで同じ旧A fixtureを使い無観測→観測を各1回（各150秒）実行した。
Debian13/Node24.22.1と公式Playwright WebKit2215、ユーザー領域の公式Debian依存libを使用。
OSインストールはsu認証を要求したため中止し、既存の許可済み/tmp展開物を読取利用した。
Ubuntu24.04/Node22.13.0の正式CIとは区別する。

両方15検査/6geometry、exit0。無観測78.320秒、観測67.994秒。
**PNG実数は両方0**（focused checkpointはretained:false）、traceは保存。
初報の「3PNG」は実数未確認の誤りであり、訂正して成功に数えない。
無観測実行のhelper実体copy不足は制約として記録し、後版を旧版の証拠として補完しない。
観測344frameはvisible、初RAF遅延median330ms/p95 570ms、前後host往復3.051秒、rect取得21ms。
rect変化はscroll/操作後を含み、retry0のこのrunから不安定根因を確定しない。
無観測より速い差も順序・warmup・観測負荷の交絡があり、改善因果ではない。
共有hostで無観測中に短い契約試験も実行され、CPU/cgroup上限は未取得。負荷隔離された比較ではない。
旧Eの成功WebKit traceは既定で保持されておらず、A/EのAPI内部phase比較はBLOCKED。
今回のpairも並列資源競合の因果証明には用いない。集計スクリプトanalyze-trace.pyを併記する。

次に固定Ubuntu24.04/Node22.13.0/同lock/同runnerで同fixtureの無観測→観測を各1回だけ行う。
各150秒、pair全体420秒、job15分。job先頭から12分の共通期限を設け、
残予算190秒未満なら当該caseをNOT_RUNにして証拠保存時間を確保する。全結果・失敗・欠測を保存し、正式受入には流用しない。
この提出HEADの既定正式CIを1回確認する。根因が未確定なら推測製品修正・green狩りは行わず
PARTIALとして残す。最終結果は同HEADのPR Checksと報告で確認し、ここでは成功を先取りしない。

## 既知の診断workflow重複起動

旧A/旧controlsのPR pathsは累積差分に一致し各pushで再実行されることが実証されていた。
この2つだけをworkflow_dispatchへ変更し、checkout/outcome/artifactのSHAをdispatchへ整合。
元診断の上限・権限・always証拠保存は維持。main未統合のため手動UI起動不可の制約があり、
今回はNOT_RUN。正式verify-pr-guiは無変更であり、旧成功で新HEADを補完しない。

## 独立点検・残件

非実装者がobserver上限/元例外保持/helper実体同一性を指摘し、修正後8契約を独立実行した。
予備点検のP2（job予算合計と証拠余裕、raw同一性）を局所修正した。
元fixtureの末尾LFを除いた文字列とcaptured rawを厳密照合し、数値表記・空白差は拒否。
診断専用13契約（既存とは別）の負対照を追加した。最終HEADのCI・成果物レビューは別途必要。
製品・保存原文・backup・保全コピー・ID・snapshotは変更しない。
旧Space2失敗UNKNOWN、実機Safari/VoiceOver/OS文字拡大等NOT_TESTEDを維持する。
Issue112/Draft PR113のみ更新し、Issue105新投稿・main push・merge・auto-merge・公開をしない。
