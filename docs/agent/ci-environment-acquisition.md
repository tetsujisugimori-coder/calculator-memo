# PR #60: GUI 環境準備の取得障害と対策

## 範囲と調査基準（2026-10-23 JST）

Issue #59 の本文は初回依頼の正本として変更しない。既存 PR #60 / `feat/formula-math-reports`、基準 HEAD `b3ebe0c8591078071f7fe55f2506553492fa2f60` に対する CI 限定修正。main は PR #58 を含む `93180027baef45acf57f886b3adf37280a900bfd`、着手時の作業ツリーは clean。

計算・保存・関連数学レポート・テスト期待値・lockfile は変更しない。required check 名、30 分上限、Chromium/WebKit 全6条件、624 検査・550 配置検査・mobile 各855実タップ、114 PNG、成功 trace 非保存、失敗前からの trace 収集、artifact 7日保持を維持する。

## 公式ログの比較

- [#118 成功 / job120045413678](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/39841897542/job/120045413678)
- [#119 attempt1 / job120057135610](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/39845374995/job/120057135610)
- [#119 attempt2 / job120073134181](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/39845374995/job/120073134181)

3回とも完全に同じ HEAD、Node 22.13.0、Playwright 1.56.1、Ubuntu 24.04.5 / runner 2.338.0。成功は centralus / image `20261012.334.1`、attempt1 は westus / `20261018.339.1`、attempt2 は westus3 / `20261012.334.1`。成功と attempt2 は同じ image であり、image 更新だけでは説明できない。地域の差は相関であり原因の証明ではない。

以下は GitHub Jobs API の step 開始/終了差（秒、丸めあり）。command wrapper の精密時間とは測定境界が異なる。

| 工程 | #118 | #119 attempt1 | #119 attempt2 |
|---|---:|---:|---:|
| app npm ci | 37 | 17 | 9 |
| CI 契約 | 0 | 0 | 1 |
| 単体 | 21 | 34 | 18 |
| lint | 7 | 9 | 5 |
| 型 | 5 | 8 | 4 |
| 通常 build | 10 | 15 | 7 |
| Pages build | 2 | 2 | 1 |
| GUI npm ci | 0 | 1 | 1 |
| OS + browser 準備 | 79 | 1716・cancelled | 1757・cancelled |
| GUI | 896・成功 | 未開始 | 未開始 |
| artifact upload | 2 | 1 | 1 |

job 開始/完了（UTC）は #118 19:40:19–19:58:14、attempt1 20:02:41–20:33:03、attempt2 20:33:58–21:04:20。準備 step は順に19:41:51–19:43:10、20:04:21–20:32:57、20:34:57–21:04:14。JST は翌10月23日+9時間。cancel 後の always 診断/upload により job 終了は30分を少し超える。

全回 APT は119 MB、181新規・8更新を予定。多くの Chromium 共通ライブラリは already newest で再取得されず、WebKit の GStreamer/codec/font 等の依存と推移依存を導入する。成功回は119 MBを9秒（13.3 MB/s）。失敗回も apt update の index 取得自体は約1秒、停止箇所はその後の .deb 取得。

attempt1 は libflite1 13.6 MB を20:23:09から取得、20:30:50に Ign。attempt2 は libglib2.0、fonts-freefont/unifont/wqy、libproxy、glib-networking、libcodec2、librsvg、libavcodec 等でも Ign、libflite1 は20:57:33→21:00:52 Ign。通信先は `http://azure.archive.ubuntu.com/ubuntu`。両方ともジョブ上限で取り消され、ブラウザ CDN ダウンロードと GUI へ到達しなかった。Ign は取得再試行/無視の観測であり、単独で特定のサーバ内部故障を示さない。

### 原因の確度

- **事実**: アプリの単体/lint/型/両buildは3回成功。失敗2回の律速は APT archive 取得であり GUI assertion 失敗はない。最新CI成功ではない。
- **強い推定**: Azure archive ミラーまたは当該runnerからの通信経路の性能/応答問題が主要因。ソース変更なしで9秒→28分超となる。アプリ変更に起因する失敗を示す証拠はない。
- **設計上の再発要因**: 旧 workflow は OS/browser 準備を一つの無個別期限コマンドにまとめ、APT の待機/再試行が30分全体予算を消費し得た。これは外部障害の根因とは別の増幅要因。
- **未検証仮説**: ミラー内部の障害、特定リージョン経路、DNS/接続先、帯域制限の寄与。packet/サーバ側記録や同時対照実験がなく唯一の根因は未確定。

## 候補比較と判断

| 候補 | 利点 | 制約・判断 |
|---|---|---|
| A 現runnerの取得改善 | Node/OS/browser/test実行条件を維持、変更小 | C/Eを組み合わせて第一希望として採用 |
| B 公式 Playwright image | browser/OS依存を事前収録できる | package版との一致、digest確認、user/IPC/fonts/toolchain差、image pull時間の実証が必要。今回未導入の次善策 |
| C 公式ミラーへ切替 | 観測されたAzure専用経路を避ける | archive.ubuntu.com の永続無障害を保証しない。正確なUbuntu URIだけHTTPS公式archive/securityへ置換 |
| D キャッシュ | browser/npm再取得削減 | npm cacheは既存利用、browser cacheではAPTを省けない。OS cacheはimage/署名/更新整合と保守負担が増すため今回不採用 |
| E 有界取得と診断 | 環境障害を早く確定し証拠を残す | 期限は正常完走を保証しない。30分を増やさずOS5分/browser3分で失敗を返す |

第一希望は同じrunnerで正規依存を全て導入して安定化すること。採用した妥協は、Azureの地域最適化経路を使わず公式archiveへ固定すること。Docker切替や依存削減より既存GUI環境との差が小さい。新しい依存・Action・containerは導入しない。

## 実装と安全境界

`e2e/configure-ci-apt.mjs` は root / GitHub Actions / Ubuntu24.04 を確認してから動く。既存 .list/.sources の正確な Azure Ubuntu URI のみを読み替え、suite/component/options/Signed-By と他社・security既存sourceを保持。Azureの noble-security 単独 stanza は公式 security.ubuntu.com へ、それ以外の既知 noble suites は archive.ubuntu.com へ。未知URI/混合security/未対応wrapped URIs・Suitesは失敗、全candidateを検査してから書く。既存Azure sourceが消えた新imageも確認を要求するため失敗する。fresh hosted runnerを前提とし、同じ変更済runnerへの再適用は保証しない。

専用 apt.conf.d snippet は HTTP/HTTPS無通信timeout20秒、取得retry1回、update error-mode any。TLS/署名検証を緩めず、鍵・権限・認証設定は変更しない。読戻しと apt-config の実効値を照合する。システム変更は破棄されるGitHubrunnerだけで、利用者PC/本番へは適用しない。

OSは固定Playwright CLI `install-deps chromium webkit` を root-owned GNU timeout 300秒で実行し、TERM後10秒でKILL。root timeout が root APT 子孫へシグナルを送れるようにする。browserは通常ユーザーで `install chromium webkit`、180秒+10秒。同じ1.56.1が選ぶpackage集合・browser revisionを利用し、独自package一覧や未検証な削減はしない。旧 `install --with-deps` と同じ二段階を明示分離したものである。

`apt-config` / `os-install` / `browser-install` ごとに既存stage wrapperのlog・開始/終了・exit・所要時間を保存。124は時間上限（強制KILL等は別非zero）。後工程へ進まず、既存 always outcome/inventory/upload は実行する。OS取得失敗、browser CDN失敗、GUI失敗をstageで分離できるが、根因は各logで確認する。ブラウザCDNは既存Playwright経路のまま。全体30分制約は不変で、遅いGUIまで常に完走できる保証ではない。

## 検証・残る条件

新契約は正規URIと未知構造拒否、suite/signature保持、実行環境制限、準備各段階の非zero伝播、OS/browser別期限、同一ユーザー子孫を含む模擬timeoutとlog/timing保持を検査する。模擬試験は実APT通信やroot子孫停止の実証ではない。

独立レビューで folded Suites の未知/混合suiteが見落とされる指摘を受け、該当fieldの継続行を明示拒否し回帰fixtureを追加した。Signed-By等他fieldの継続行を一律破壊しない。

ローカル Node24.19.0: 単体1127件/50files、CI契約36件、lint 0error（既存warning1）、型、通常/Pages両build、js-yaml構文解析が成功。CIの固定Node22.13.0は維持。正式な修正後HEADでのAPT導入・全6条件GUI・実行時間・artifact件数/容量の結果は PR #60 Checks/コメントへ記録する。未実行の成功を先取りしない。文書コミット後の最終HEADを照合する。

実機iPhone Safari/VoiceOver/native OS文字拡大は引き続き未検証。1回の成功は外部配布元の恒久復旧や全地域経路の健全性を証明しない。正規archive自体の停止、runnerimage drift、browserCDN、30分総予算超過のリスクは残る。失敗時は新しいログを調べ、無根拠なwhole-job rerunはしない。

## 戻し方

CI限定差分を作業ブランチ上でrevertし、既存の `install --with-deps chromium webkit` workflowへ戻す。アプリ/保存データのmigrationや復旧操作は不要。次のfresh runnerではsystem変更も残らない。元のミラー取得リスクが戻ることを記録し、人間レビューを経る。main直接push/merge/本番公開は行わない。

## 一次資料

- 固定npm packageの `playwright-core/lib/server/registry/dependencies.js` / `nativeDeps.js` / `cli/program.js`（1.56.1）。`apt-get update` と `apt-get install -y --no-install-recommends`、Chromium/WebKit集合の重複排除を確認。
- [Playwright CI](https://playwright.dev/docs/ci)、[公式Docker説明](https://playwright.dev/docs/docker)。online最新版を導入版と混同しない。
- [APT設定仕様](https://manpages.debian.org/bookworm/apt/apt.conf.5.en.html)、[公式Ubuntu archive](https://archive.ubuntu.com/ubuntu/)。Ubuntu manpage取得は今回timeoutのためAPT上流manpageを補助参照。
