# CI 計測・証拠軽量化（PR #43 予定）

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
