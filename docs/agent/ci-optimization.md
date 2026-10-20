# CI 計測・証拠軽量化（PR #43）

## 範囲と維持する保証

最新 main `be2d34a35bad21f8f9c17970f46a6a1ed404d44f`（PR #42 マージ）を基点とする CI 専用変更。アプリの計算・保存・UI は変更しない。既存 658 単体テスト、372 GUI 検査、Chromium 4 条件・WebKit 2 条件、実タッチ、横はみ出し、実行時/外部通信エラー、exact PR HEAD の検証を維持する。required check `Checks and Chromium GUI`、30 分 timeout、artifact 7 日保持、権限・本番設定も変更しない。

## 改善前の測定方法と比較条件

公式 GitHub Actions の job ログ、artifact ZIP、provenance、Playwright trace を読み合わせた。比較する 2 回は同一 HEAD `61e67d0cd07a503af4176f3ac87fe98bfe6a9d2a`、Node 22.13.0、runner 2.337.0、Ubuntu 24.04 image `20261012.334.1`、Chromium 141.0.7390.37 / WebKit 26.0。

- [基準 run 39428583982](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/39428583982)、[artifact 12268780867](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/39428583982/artifacts/12268780867)
- [同じコードの再実行 39453279925](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/39453279925)、[artifact 12281181061](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/39453279925/artifacts/12281181061)

前者 ZIP SHA256: `fac1320242917e5713571747c950368af4c8fb80da8f2ff251e895b79f488225`。後者: `b3ffbbadd0cdd8e5416089e4ad662bf02a723d8d2853b51e5e9ae639d3c850a0`。両方とも取得した ZIP と公式 digest が一致した。

同じコードでも GUI 時間は 1,217.213 秒から 903.859 秒へ約 25.7% 変動した。古い遅い run だけを対照にして、差のすべてを最適化効果と主張しない。runner の名称・image の一致は、負荷や実効性能の一致を保証しない。PR #40 / #41 のユーザー提示値は参考値であり、この調査で再取得した実測値とは区別する。

### 段階別の実測値（秒）

ログの各 step 開始から次の step 開始までの差。小さな step 切替 overhead を含み、CPU 時間ではない。

| 段階 | 基準 run | 同じコードの再実行 |
|---|---:|---:|
| npm ci（アプリ） | 31.114 | 19.482 |
| 単体テスト | 14.432 | 9.370 |
| lint | 6.968 | 4.718 |
| 型検査 | 5.767 | 3.785 |
| 通常 build | 12.867 | 8.340 |
| Pages build | 1.644 | 1.280 |
| npm ci（GUI） | 0.634 | 0.485 |
| ブラウザ・OS library 導入 | 50.216 | 35.718 |
| GUI step | 1,217.289 | 903.921 |
| artifact action（準備・圧縮・upload・確定の合計） | 14.824 | 10.722 |

job の最初から最後のログは約 22.71 分 / 16.74 分。旧記録には圧縮だけ、通信だけ、trace 生成だけの独立タイマーがないため、これらを分離した数値は未計測とする。trace の DOM snapshot 収集や screenshot 呼出時間は GUI 操作と重なり、全時間へ単純加算しない。

### 条件別 GUI 実測値

provenance の `startedAt` / `finishedAt` の差。成功 trace の export を含み、context の close は含まない。

| 条件 | 基準 秒 | 再実行 秒 | GUI checks | PNG |
|---|---:|---:|---:|---:|
| Chromium desktop 1365×1000 DPR1 | 111.937 | 82.475 | 62 | 76 |
| Chromium narrow 390×1000 DPR1 | 94.834 | 76.195 | 61 | 74 |
| Chromium mobile 390×844 DPR3 | 170.505 | 132.518 | 62 | 74 |
| Chromium mobile 375×667 DPR2 | 144.733 | 121.666 | 62 | 74 |
| WebKit mobile 390×844 DPR3 | 450.814 | 316.580 | 62 | 74 |
| WebKit mobile 375×667 DPR2 | 241.692 | 172.301 | 63 | 76 |
| 合計 | 1,214.515 | 901.735 | 372 | 448 |

mobile 4 条件の touch activation は各 629。すべて成功、runtime/network errors は空。6 条件全体にはブラウザ起動・切替等の追加時間がある。

## 成果物容量の実測値

「ZIP 内圧縮後」は外側 artifact ZIP の各 entry の圧縮サイズ。trace 自体も ZIP なので二重圧縮である。各分類の圧縮後合計と artifact 全体との差は ZIP 管理情報等。

| 分類 | 件数 | 基準 非圧縮 bytes | 基準 ZIP 内圧縮後 bytes | 再実行 非圧縮 bytes | 再実行 ZIP 内圧縮後 bytes |
|---|---:|---:|---:|---:|---:|
| PNG | 448 | 159,274,229 | 146,479,100 | 159,036,952 | 146,191,730 |
| trace ZIP | 6 | 300,232,168 | 285,302,860 | 296,844,519 | 283,285,010 |
| log | 10 | 155,942 | 23,711 | 155,456 | 23,452 |
| JSON | 2 | 194,194 | 10,968 | 194,194 | 10,968 |
| 合計 / artifact ファイル | 466 | 459,856,533 | 431,903,525 | 456,231,121 | 429,598,046 |

大きい 6 ファイルは trace ZIP（基準 35.0～65.3 MB）。最大は Chromium mobile375 trace 65,283,749 bytes、次は desktop trace 59,386,746 bytes。大きい PNG は WebKit390 の登録式入力画面等で約 1.5 MB/枚。ログ・JSON は約 0.35 MB で、重複削減だけでは容量目標への寄与が小さい。

同じコード再実行の trace 内部をさらに集計すると、screencast JPEG 10,847 個は非圧縮 332,114,676 bytes / trace 内圧縮後 281,814,824 bytes。DOM/action trace 6 個は 117,272,000 / 11,735,579 bytes、network 6 個は 2,492,198 / 74,408 bytes、source 6 個は 920,772 / 190,626 bytes、その他 resource 38 個は 3,313,721 / 589,502 bytes。これらは外側 trace ZIP の内訳であり、上表へ重ねて足さない。screencast の占有が大きく、操作・DOM・通信の履歴を保持したまま画像連続収集を止める案には容量上の根拠がある。

## WebKit 390px の遅延原因の切り分け

実測では、再実行の WebKit390 の 316.580 秒中、629 `tap` 呼出の累計が 192.82 秒、74 `screenshot` が 29.64 秒、51 `reload` が 14.70 秒。375 はそれぞれ 93.26 / 13.53 / 10.91 秒。同じ 629 タッチで大差がある。

trace の tap 内ログでさらに区切ると、390 の visible/enabled/stable 待ちは累計 158.580 秒（中央値 215.522 ms、p90 533.053 ms）。375 は 53.113 秒（中央値 70.466 ms、p90 157.701 ms）。タッチ送信部分は 8.823 対 6.672 秒、scroll は 1.336 対 0.876 秒。Chromium mobile の安定待ちは各約 13 秒だった。旧 run でも tap 全体が 271.61 対 118.11 秒で傾向は同じ。

確認できる事実は「WebKit390 条件の操作前安定待ちが主要な差」であり、固定 sleep やネットワークだけが原因とはいえない。390 と375は幅だけでなく viewport の高さ、DPR（3対2）、描画pixel量が違う。ブラウザ描画、runner負荷、trace screencast との因果寄与をそれぞれ独立した A/B 試験で分離できたわけではない。`force` で安定待ちを飛ばす、実タッチを click に置き換える、DPR を落とすのは今回の最適化としない。

全 6 条件の screenshot 呼出累計は旧 142.852 秒 / 再実行 89.377 秒。DOM snapshot 収集の報告値は旧 167.838 秒 / 再実行 110.200 秒で操作と重なる。成功時に trace ファイルを保存しないことと、実行中の screencast 生成を止めることは別の変更として扱う。

## 改善案と測定上の注意

- 全チェックと横はみ出し検査を維持した上で、撮影のみを代表場面へ絞る。成功画像の省略は検査の省略ではない。
- 操作開始前から DOM snapshot・source・通信と操作履歴を収集する。失敗後に tracing を開始しても過去は戻らない。成功 export の省略と screencast の省略を区別して測る。
- 独立した browser context / localStorage / port / 証拠名 / provenance を持つ条件を、同じ runner の限定並列で実行する。wall time の短縮と CPU・メモリ・条件別時間の増加を区別する。
- npm cache 等は lock に基づき、cold/warm を区別する。ブラウザ cache と OS library 導入は同じではなく、cache の準備・復元負荷も測定する。
- 最適化前後の検査件数だけでなく、条件、チェック内容、SHA、未実行条件、非ゼロ終了、失敗前 trace を照合する。

ここまでの改善案は効果の保証ではない。最適化後の正式 CI、隔離失敗試験、独立レビューの結果は実測後に記録する。

## 実装方針と品質境界

- アプリ本体・計算意味論・保存形式・両lockfileは変更しない。
- 6条件を独立Node processと新規browser/contextで実行し、同一runnerで最大2並列。各workerのserver port、localStorage、証拠directoryを分ける。共有buildのidentity markerはcoordinatorが開始前に一度だけ生成し、全workerが読み照合する。
- 既存GUI本体のassertion/期待値/tap/stability waitを残す。過去448撮影checkpoint全てで横はみ出しを検査し、成功時PNGは各条件18代表画像へ限定。撮影省略と検査省略は別。
- traceは操作開始前からDOM/action/network/sourceを収集、巨大な連続screencast JPEGだけを省く。失敗時には過去操作を含むtraceをexport、成功時はexport/圧縮を省く。worker内coverage確認後のみ成功traceを破棄し、未実行/重複/誤SHA/条件不一致を全体でも再検査する。
- stage wrapperでcommand壁時計時間と終了値、ログ保存失敗を記録。PNGのgeometry/capture/overlay時間を区別。trace API start/stop/export時間と継続snapshot収集overheadを混同しない（後者未分離）。
- npm download cacheを両lockfileのkeyで利用しnpm ciを維持。browser cacheはOS依存導入を安全に省けず今回採用しない。ブラウザreuseも測定上主因でなくprocess分離を優先。
- upload compression level 0にし、既圧縮PNG/ZIPの再圧縮を避ける。retention7日、required check名、timeout30分、permissions/deployを変更しない。
- 同一runner内の並列化は同時CPU/メモリ需要を増やす。worker時間合計はCPU時間ではない。正式CIのGNU timeでprocess-tree user/system CPU・peakRSSを記録するが、旧runには同等CPU計測がなく増減率は未確認。

## 独立レビューと失敗経路

独立レビューで、共有provenance markerの並列write競合、coverage未達発見前の成功trace破棄、PNG時間とgeometry/overlay時間の混同を指摘し修正した。ログstreamエラー時の終了待ちと一方worker失敗時の待ち合わせも修正。アプリ検証本体と期待値は変更していない。

CI契約26件では、隔離subprocessでunit/normal build/Pages build/browser installの非zeroとログ、証拠書込失敗、process起動失敗、missing/duplicate contexts、誤SHA、異なる条件、未実行/重複checksとgeometry、touch減少、runtime/network errorを拒否する。アプリ658件と別件数である。

隔離した実Chromium fault probeでは、GUI途中故障でexit1・failure PNG・故障前128操作/242 DOM snapshots、撮影故障でexit1・failure PNG・故障前18操作/26 snapshotsを保持。SHA不一致はbrowser起動前exit1とprovenanceを保持した。故意不具合はtemp copyだけに挿入し、通常scenario/アプリへ混入しない。

これはlocal failure-path実証であり、GitHub上で実際にunit/build/installを壊した試験ではない。GitHub artifactサービスのupload障害も未実証。ローカル証拠保存失敗の非zeroと、workflowにcontinue-on-error等の成功化がないことを確認した範囲であり、サービス障害を再現したとは主張しない。

## 初回最適化の正式 CI 実測（2026-10-21 JST）

[PR #43](https://github.com/tetsujisugimori-coder/calculator-memo/pull/43)、公開HEAD `ff9d37b3bb3a2582432f8cf9c900804416bc0f87`、[run 39462748334](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/39462748334) 成功。[artifact 12284500565](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/39462748334/artifacts/12284500565) のSHA256は `9a9c399a2786c485d540c63da65dd3d17c0121e6608c6bdeac27e9821ff4f5ba`。取得ZIPのdigest、各workerのsha/expectedSha/servedIdentityを照合した。

Node22.13.0、runner2.337.0、ブラウザversionは旧runと同じ。ただしUbuntu imageは旧 `20261012.334.1` に対し今回 `20261018.339.1`。同等条件の完全なA/B試験ではなく、差の全量を実装による因果効果と断定しない。npm cacheはmissでありwarm cacheの改善を実証していない。

| 指標 | 旧基準 | 同一旧HEADの最新run | 最適化初回 |
|---|---:|---:|---:|
| jobログ範囲（分） | 22.71 | 16.74 | 10.88 |
| GUI wall（秒） | 1217.213 | 903.859 | 556.566 |
| 単体テスト / files | 658 / 26 | 658 / 26 | 658 / 26 |
| CI契約テスト | なし | なし | 26 |
| GUIチェック / 条件 | 372 / 6 | 372 / 6 | 372 / 6 |
| 横はみ出しcheckpoint | 448 | 448 | 448 |
| PNG / trace保存本数 | 448 / 6 | 448 / 6 | 108 / 0 |
| artifact bytes | 431903525 | 429598046 | 31784933 |

job時間は約52.1% / 35.0%、GUIは54.3% / 38.4%、artifactは92.6% / 92.6%減（順に旧基準/最新旧run比較）。目安を上回ったが、上記の自然変動・image差・並列リソース差を含む観測値である。既存372 GUIのチェック配列は本文と順序を含め完全一致。全6条件成功、mobile4条件各629touch、runtime/network errors=[]、lint既存warning1のみ。通常/Pages build、型検査も成功。

### A–L 段階別（秒）

旧値はstep境界、最適化値はcommand wrapper（小さなstep切替分を除く）。厳密な同一計測境界ではない。

| 対象 | 旧基準 | 最新旧run | 最適化 |
|---|---:|---:|---:|
| A アプリ npm ci | 31.114 | 19.482 | 19.693 |
| A GUI npm ci | 0.634 | 0.485 | 0.621 |
| B 単体 | 14.432 | 9.370 | 9.485 |
| C lint | 6.968 | 4.718 | 4.816 |
| D 型 | 5.767 | 3.785 | 3.842 |
| E 通常build | 12.867 | 8.340 | 8.402 |
| F Pages build | 1.644 | 1.280 | 1.170 |
| G browser/OS library | 50.216 | 35.718 | 35.662 |
| H Chromium desktop | 111.937 | 82.475 | 87.212 |
| H Chromium narrow390 | 94.834 | 76.195 | 87.443 |
| H Chromium mobile390 | 170.505 | 132.518 | 119.607 |
| H Chromium mobile375 | 144.733 | 121.666 | 116.768 |
| I WebKit390 | 450.814 | 316.580 | 348.896 |
| I WebKit375 | 241.692 | 172.301 | 258.211 |
| J 撮影API累計 | 142.852 | 89.377 | 22.590 |
| K trace API start/stop | 未計測 | 未計測 | 0.053 |
| L artifact action合計 | 14.824 | 10.722 | 約1.748 |

Jの旧値は従来screenshot呼出、新値はcaptureのみでgeometry/overlayを別記録。Kは成功時start/discardのAPI時間のみ、操作中DOM snapshot生成の負荷を分離した値ではない。Lの圧縮/通信個別時間は未分離。成功traceを保存しないことと収集中のscreencast停止は別変更である。

条件別H/Iはscenario開始/終了境界。起動を含むworker合計1024.524秒に対しwall556.566秒。個別WebKit等は最新旧runより遅く、並列化が各条件を速くしたわけではない。GNU timeのuser132.58秒＋system36.12秒、maxRSS245936KiB（同時全processの総メモリpeakではない）。旧CPU実測がなく総CPU増減は不明、runner同時利用量は増える。課金総リソース削減率は未判定。

### 成果物内訳と代表画像

| 分類 | 最適化件数 | raw bytes | 外側ZIP内 bytes |
|---|---:|---:|---:|
| PNG | 108 | 30984526 | 30984526 |
| trace | 0 | 0 | 0 |
| log | 23 | 160476 | 160476 |
| JSON | 19 | 609237 | 609237 |
| 合計 | 150 | 31754239 | 31754239 |

compression0のためentry容量は同じ、外側ZIP管理情報込み31784933 bytes。最大はWebKit390 basic-math-domain-error PNG1401356 bytes、Chromium390同画像1202591、WebKit390 protected-dark-large-text994508。ログ/JSONは段階計測とworker別provenance追加で増えたが、診断情報を優先した。

実画像でWebKit375 dark/文字拡大の試算130・差+10・未再計算ラベル、WebKit390のgraph-end選択・参照先エラー・複数原因への案内を確認。縦scrollで読む画面であり全文が1画面へ収まる保証ではない。実iPhone Safari/OS keyboard/VoiceOverは未検証。

### 失敗経路の実証範囲と残る制約

| 要求された失敗 | 実施範囲 | 結果 / 未実証 |
|---|---|---|
| 単体失敗 | 隔離commandを実stage wrapperで非zero終了 | CI向け非zeroとログ保持。GitHub上の実単体故障は未注入 |
| build失敗 | 同上、通常/Pages別 | 同上 |
| browser導入失敗 | 同上 | 同上。local WebKit依存不足もharness非zero |
| GUI途中失敗 | temp copyへ故障、実Chromium | exit1、failure PNG、故障前trace保持 |
| 撮影失敗 | temp copyへ撮影故障、実Chromium | exit1、failure PNG、故障前trace保持 |
| artifact保存失敗 | local証拠/log書込失敗 | 非zero。GitHub artifact uploadサービス障害は未実証 |
| 一部scenario未実行 | aggregate/worker契約 | missing/不完全coverage拒否、成功trace破棄前検査 |
| SHA不一致 | 契約＋実harness | browser起動前exit1、provenance保持 |

local Node24環境では、初期preview port4190がFetch禁止portで失敗し4280–4285へ修正、回帰契約を追加した。他にタップ後dialog未出現、touch counter観測5秒timeout、逐次390のtap10秒timeoutを記録した。traceにはtouch到着後のevaluate6.25/40.29秒、逐次tap内の6.77/8.71秒停滞があり、2並列だけが必要条件ではない。同一commitの逐次375は成功、390は失敗。負荷・ブラウザ・hostの因果は未分離で、環境原因と断定しない。ローカル失敗を警告化したり自動retryで消したりしていない。正式CI成功はこの間欠停滞の解消や全環境での安定保証ではない。

独立レビューは共有marker、trace破棄順序、時間分類、終了/ログ処理の指摘を修正後、26契約を独立再実行し成功。未解消コード阻害なし。最終HEADの正式CIとartifact一致確認、上記制約開示を条件に人間レビューへ進める判断。本文追記自体の最終HEADは[PR Checks](https://github.com/tetsujisugimori-coder/calculator-memo/pull/43/checks)で別途検証し、この初回SHA成功で代用しない。
