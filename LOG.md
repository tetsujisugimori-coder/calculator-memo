# Calculator Memo 開発履歴・設計判断


## 2026-10-21 (JST): 保存済み計算メモのMarkdownレポート
- 基点: PR #46マージ済みmain `08d92a2`、専用枝 `feat/saved-markdown-report`。[Issue #47](https://github.com/tetsujisugimori-coder/calculator-memo/issues/47)。同目的の既存Issue/PRなしを確認。PR番号/正式CIは未確定。
- 保存済み詳細画面から明示操作で既存loadDataの原本を再取得し、読み取り専用ソース確認・全文コピー・.mdダウンロード要求を提供。draft/未反映試算/メモリfallbackを使わず、再計算/保存/履歴更新なし。保存形式・評価器・rollback・SVG処理は変更なし。
- 既存依存解析/署名照合/Mermaidを再利用。本文順、LaTeX、式、保存表示値と内部数値、安定ID、診断を出す。署名のない旧結果は状態不明。失敗/古い記録を確定扱いしない。未知構造は出力拒否、付随情報は原本に保持しレポートが完全backupでないことを明示。
- 安全処理: 動的フェンス、HTML文字化、未閉鎖境界補完、数式の安全な原文コードfallbackと警告、独自実行directiveの文字化、100万入力文字上限、80文字/200UTF8bytesファイル名、孤立サロゲートのdownload拒否。
- 独立レビュー: 数式内フェンス/LaTeX実体参照変換/長いUnicode名/current+attemptError矛盾を検出し修正。再レビュー60関連テスト成功、標準Markdown parserでも後続章保持を実測、阻害指摘なし。HTML-bearing inlinecode等の表示差と第三者rendererの限界は設計に記録。
- 検証: ローカル全813単体の成功後、mathfence2件と実生成例1件を追加し全件再確認中。関連60件、26 CI契約、lintエラー0（既存warning1）、TypeScript、通常/Pages build成功。新testのeach配列型とthisalias lint指摘は修正済み。実測最終件数は正式CIで確定する。
- GUI: 既存6条件へ各5検査・3geometry追加、予定462検査/490横幅/mobile729touch。代表PNG114枚/成功trace非保存/2worker/30分/7日保持は維持。ローカル公式Chromium取得が不正ZIP/公式mirror503で失敗し実GUI未実施。正式CIで補完するまで成功扱いしない。
- Memo Nexus repo memo main c32d3a42を読取確認。Markdown/Mermaid/$$対応コードはあるが、独自calcは再評価、jsonフェンスをニュース取込へ変換する経路、escape表示差がある。手動本文貼付けを基本とし、全表示互換/直接取込は保証しない。Memo Nexusの書込み/コード/MCP変更なし。
- [設計](docs/agent/markdown-report.md)、[実生成例](docs/examples/markdown-report-example.md)と合成fixtureを追加。生成例は100→150→300、原本不変をテストする。参照: AGENTS/README/LOG/運用・検証・e2e/CI/関連実装、software-engineering guide、江戸弁ガイド関連抜粋。憲法/辞典全文は未読として記録し、読了を偽らない。
- 実iPhone Safari/VoiceOver/Memo Nexus実ブラウザ/OS保存完了は未検証。PDF/印刷/直接送信/自動同期/新数学関数は対象外。保存形式移行不要、本PRのrevertで戻せる。マージは人間が判断する。

## 2026-10-21 (JST): PR #46 初回正式CI・6条件GUI成功
- [PR #46](https://github.com/tetsujisugimori-coder/calculator-memo/pull/46)、HEAD `bee01cd80eba56bca12fb99e156eae82faa44d40` の [CI 39586945342](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/39586945342) は全工程成功。固定Node22.13.0で755単体/30files、26契約、lint既存warning1・エラー0、型、通常/Pages build、Chromium4/WebKit2を確認。
- 全6条件のexpected/served/actual SHA一致、errors=[]、追加percent4チェック各条件実行、432GUI/472横幅、mobile4条件各698touchを成果物で照合。旧保存データ読み込み・4式の全入口評価・明示保存と再読込・未知情報保持を含む。既存グラフ/試算/削除ノード/モバイルスクロール回帰を削除しない。
- [artifact 12340243030](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/39586945342/artifacts/12340243030): ZIP32,952,029 bytes、SHA256 `3261b939abc2183e6d43d675a8724d0434d444efa4a03e6ffdfea6144fae939c`。代表PNG114枚32,107,701 bytes、成功trace保存0、GUI実時間626.376秒。WebKit390 dark文字拡大の代表画像を視認。%追加地点は横幅checkpointのみであり、保存PNGを増やさない。
- ローカルブラウザ配布失敗は正式CIでは再現せず、正式6条件で補完できた。Node24ローカルをNode22正式実行と混同しない。公開tree `92660417629c0b94bd07742f8f875bf218295003` はローカル検証treeと一致。通常git pushは認証経路不足だったため既存GitHub接続で同一treeを公開し、内容同一を照合した。
- 独立レビューの未解消阻害指摘なし。比較corpus33,467式は両方成功の値差0、通常モード新拒否2件は不正な複数小数点のみ。拒否同士のエラー文は解析到達段階が変わるため一部異なる。oracle9,479式は厳密一致。既存Issue本文は追記権限の確認で停止し未変更、PR本文の関連リンクで追跡する。
- この追記は文書のみ。記録commit自身の最終HEADも [PR Checks](https://github.com/tetsujisugimori-coder/calculator-memo/pull/46/checks) で別途確認し、その後Readyへ移行する。実iPhone Safari/VoiceOverは未検証、マージは人間が判断する。

## 2026-10-21 (JST): Issue #19 ネスト括弧・先頭小数点の後置%を修正
- 基点: PR #45 merge済みmain `fdf10ee6ee7453f583f0c6c92d3e2c06b71dfcb6`、独立枝 `fix/nested-postfix-percent`。[Issue #19](https://github.com/tetsujisugimori-coder/calculator-memo/issues/19)。PRは未作成。
- 根因/方式: 旧正規表現が内部括弧を含む対象と `.5%` を扱えなかった。mathjsの直接% ASTは相対加算/剰余となり既存仕様と違うため不採用。数値トークンと括弧対応を走査して `(対象/100)` へ変換し、その後のAST許可検査・予算・評価器を維持。[比較/境界/互換性](docs/agent/percent-parser.md)。保存・ID/旧変数・試算・rollbackの実装、lockfileとworkflowは変更なし。
- Red/green: 4式 `((50+50))%`, `(50+(25+25))%`, `(5%+5%)%`, `.5%` は旧mainで全て共通構文エラー、修正後1/1/0.001/0.005。最初の60回帰は旧コード12失敗/48成功、修正後60成功。追加境界4件と統合10件を含め全755単体/30files成功。初回複合式の小数リテラル期待誤差は独立演算式の厳密期待へ訂正し、丸め/近似で隠さない。旧Issue19失敗固定2テストは今回の正しい値へ更新。
- 互換性判断: 独立比較で `50%%%` と `(50)%%` の新規受入を検出し旧拒否へ戻した。`50%%`、普通電卓の暗黙乗算、旧変数モードの空白/暗黙乗算拒否は維持。不正な `1.2.3%` が旧変換で0.023になる副作用は不正十進数として拒否し、仕様拡大とは区別して記録。
- ローカル: cloud Linux Node24.19.0、26 CI契約成功、lintエラー0（既存aria-description warning1）、型・通常/Pages build成功。正式CIのNode22.13.0とは別環境。Playwrightブラウザ導入が公式配布の破損ZIP/503で失敗し、ローカルGUI未実施。配布ログを保持し正式CI6条件で補完予定、成功扱いしない。
- GUI追加: 4再現式を通常電卓/URL/保存済み単独メモ/旧ブロックで検査。既存6条件・図/試算/モバイル/スクロール回帰を維持し、契約432検査/472横幅/mobile各698touch。代表PNG114/成功trace非保存/失敗前trace/7日保持/30分timeoutを維持。実ブラウザ結果は確認待ち。
- 独立レビュー: 33,467式の旧新比較で共通成功の数値差なし。独立算術oracle9,479式でObject.is一致。混在制限/構文予算を確認し、expanded AST深度の有効な入れ子%回帰を補強。GUI/統合差分と件数契約も独立確認し、未解消の阻害指摘なし。実GUIは正式CIで別途確認する。
- 文書参照: repo AGENTS/README/LOG/GitHub運用/検証/e2e/workflow、Issue19/PR45を確認。software-engineering skillはこの環境で参照不可、江戸弁guideの関連抜粋のみ参照。憲法/辞典全文の確認とは扱わない。
- 残件: Draft PR公開、正式最終HEAD CI・成果物照合、Readyへの移行。実iPhone Safari/VoiceOverは未検証。人間の判断なくマージしない。戻す場合は本PRをrevert、データ移行不要。

## 2026-10-21 (JST): P2修正 PR #45 の正式6条件検証成功
- [PR #45](https://github.com/tetsujisugimori-coder/calculator-memo/pull/45)、HEAD `116f5f5195166cfc5d90a0c56c90217715b2eba2` の [CI 39540924934](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/39540924934) は全工程成功。681単体/28files、26 CI契約、lintエラー0・既存warning1、型、通常/Pages build、Chromium4/WebKit2の408 GUI検査を確認。
- 全6条件のexpected/served/actual SHA一致、errors=[]、460横幅checkpoint、mobile4条件各671touchを成果物で照合。全削除A→B・一部削除A→B→C・元から計算なし・新ID追加・古い試算失効の追加チェックも全6条件に存在し成功。
- [artifact 12320220548](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/39540924934/artifacts/12320220548): ZIP33,184,271 bytes、SHA256 `d872a47d0893d1d510de9f71e3bf322ab92d9f2161d7d0d514d147fc0699c842` を照合。代表PNG114枚32,361,132 bytes、成功trace保存0、GUI618.776秒。全削除の追加geometryは画像を保存せず検査し、PR43の軽量化を維持。
- WebKit390実画像で既存比較図の状態ラベル/有界スクロールを視認。新しい全削除状態は実SVGノード2件・参照線1件・削除ラベル・移動拒否・コピー源・保存書込み0をGUI assertionで確認しており、専用成功PNGは増やさない。
- ローカルでもChromium4条件271検査/306横幅/mobile各671touch成功。WebKit2条件はOS libraries不足で起動前失敗し、今回の正式Ubuntu CIで実行を補完。ローカル未実行と正式成功を混同しない。公開tree `b718ae2dcad48fd3e5126b3a523a690316712a01` はローカル検証commitと一致。
- 独立コードレビューの未解消指摘なし。この結果追記は文書のみ。記録commit自身の最終HEADは [PR Checks](https://github.com/tetsujisugimori-coder/calculator-memo/pull/45/checks) で別途成功を確認し、レビュー待ちへ移行する。以前のSHA成功で代用しない。実iPhone Safari/VoiceOverは未検証。マージは人間が判断する。


## 2026-10-21 (JST): 全計算ブロック削除時の比較図入口を維持（P2）
- 基点: PR #44 merge済み最新main `a5ad20dcc0b0e7dc412edf8192781da3d86106bd`。独立修正枝 `fix/deleted-calculation-graph-entry`。[元P2指摘](https://github.com/tetsujisugimori-coder/calculator-memo/pull/44#discussion_r4331602692)。PR #44への追加commit、Issue #19や他機能は対象外。
- 根因: MemoBlockEditor が現在の計算ブロック存在だけで子グラフをmountしていた。比較基点に旧ノード・参照線が残っても、現在0件では比較UIへ入れなかった。現在または既存baselineに計算ブロックがある場合の表示へ条件1か所を修正。両方0件は非表示。削除表示/移動拒否/解析/試算/保存/安全描画は既存処理を変更しない。
- Red/green: 親UIのA全削除/B一部削除/C元から0件/D追加し直し/E古い試算の5回帰を追加。旧条件でA/Eが入口nullのため失敗、B/C/D成功。条件修正後5件成功。保存handler/Storage書込みなし、安定ID、削除ノード移動不可、未反映試算復活なしを確認。Mermaid layoutだけmockし、実描画はGUIで別確認する。
- ローカル: Node24.19.0、681単体/28files、26 CI契約、lintエラー0（既存aria-description warning1）、TypeScript、通常/Pages build成功。正式CIのNode22.13.0とは別環境として扱う。
- GUI追加: 既存6条件に各4チェック・横幅1checkpointを追加、想定408チェック/460横幅、mobile各671touch。代表PNG114/成功trace非保存、2worker/SHA照合/30分/7日保持を維持。実ブラウザ実行は未確認。ローカルGUI依存/ブラウザ導入が別の障害監視タスクの禁止文を理由に拒否され、関連作業指示による一度の再申請も拒否。迂回せず停止後、今回P2検証限定の導入について利用者から明示許可を受けたため再開。未実施を成功扱いしない。
- 独立レビュー: 別担当が差分/基点ライフサイクル/validTrial/安全境界/GUI件数を確認し、67関連単体と26 CI契約を独立実行して成功。阻害指摘なし。6条件GUIの実行結果は未確認。
- 文書参照: AGENTS、README、LOG、GitHub運用/検証/e2e文書、software-engineering skillを確認。江戸弁guide関連抜粋は参照したが憲法/辞典全文は未確認。参照できた範囲以上を読了と扱わない。
- 残件: 実GUI、修正PR公開、正式最終HEAD CI、証拠照合とP2対応報告。実iPhone Safari/VoiceOverは未検証。保存形式移行不要、戻す場合は本修正をrevertする。人間の承認なくmergeしない。


## 2026-10-21 (JST): PR #44 修正HEADの正式検証成功
- 修正HEAD `3395ded953e574a674b637becb637c64eda025fe` の [CI 39511725875](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/39511725875) は全工程成功。676単体/27files、26 CI契約、lintエラー0・既存warning1、型、通常/Pages build、Chromium4/WebKit2の384 GUI検査を確認。全6workerのexpected/served/actual SHAを照合、errors=[]、454横幅checkpoint、mobile4条件各645touch。
- [artifact 12306482730](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/39511725875/artifacts/12306482730): ZIP32,938,421 bytes、SHA256 `771dcb04f566bc7ea5f30e175e72a91986727dbc1db30272d442e6435b167f17`。代表PNG114枚32,127,801 bytes、成功trace保存0。GUI561.172秒。PR43の代表画像/失敗前trace/全geometry方針を維持し、追加は各条件1画像。自然変動があるため単一runの速度から最適化効果を主張しない。
- 本番distのChromium375最小診断でも、CSS注入なしの実tapでsummary open、changed/error・affected/blockedクラス、storage不変を確認。これは全GUIの代用とせず、上記正式6条件で回帰を確認。初回失敗と原因/修正記録は残す。
- WebKit390とdesktopの実画像で、影響対象/数値変化あり/数値変化なし、保持旧結果→未反映試算を確認。図は既存の有界スクロール領域で一部分を表示する方式であり、一画面に全ノードが収まるとはしない。実iPhone Safari/VoiceOver/実OS clipboardは未検証。
- 独立再レビューの阻害指摘なし。[PR #44](https://github.com/tetsujisugimori-coder/calculator-memo/pull/44) は未マージ。この成功記録だけの最終文書commitについても [PR Checks](https://github.com/tetsujisugimori-coder/calculator-memo/pull/44/checks) を別途確認してからレビュー可能化する。記録commit自身の未確認成功を先取りしない。

## 2026-10-21 (JST): PR #44 初回正式CIで複合状態の描画不備を検出
- [PR #44](https://github.com/tetsujisugimori-coder/calculator-memo/pull/44) をDraftで公開。HEAD `c807b78f663af2fc50373e02249e9b9e65513723` の [CI 39508607943](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/39508607943) は675単体・26 CI契約・lint・型・両build成功、GUIは6条件とも試算失敗後の比較図で停止。前段の比較値/不変/無関係、辺追加削除、保存再読込検査は通過。全GUI成功とは扱わない。
- 原因の一つ: Mermaid 11.12.2は `class A changed,error;` を2クラスでなく単一名 `changed,error` と解釈し、既存SVG安全境界がclass属性を除去していた。実parserのDB検査を先に失敗させ、状態ごとのclass文へ訂正。通常図/比較図とも複合状態を維持し、単一状態の出力、ID、辺、ラベル、計算・保存は不変。安全フィルタを緩めず、GUIの `g.node` 期待も維持する。
- 修正後ローカル676単体/27files、関連23件の成功を確認。失敗artifactは38,936,091 bytes、SHA256 `34eddc2607070f421d9134f24a568a73b379b0e46c06123fd7fbfaf3ebd56690` を照合し、失敗前trace6本とPNGを取得。Chromium mobile2条件はsummaryのfocus時にscroll anchoringが約2200px移動させ、mouseup/clickが別要素へ配送されて開かなかった。最小fixtureで実tapのイベント/座標を比較し、編集部だけの `overflow-anchor: none` でscroll位置維持とopenを確認（graphだけの除外は不足）。編集部に限定して適用し、実tap・open確認・複合class確認を維持。固定待機・force操作・期待値緩和は行わず、正式CIは再検証待ち。
- 独立再レビューはclass修正とeditor限定のscroll anchoring除外を確認し、関連28件を別実行して成功。新テストの許容union外状態は型検査で検出し既存許容状態へ訂正、再型検査成功。未解消のコード阻害指摘なし、6条件GUIと最終HEAD正式CIの成功は別途確認する。

## 2026-10-21 (JST): 依存関係の変更比較と試算連携（PR #44 予定）
- PR #43 merge済み最新main `8923e0c85f685a8631f5967e25e40894f0d043ba` から `feat/graph-trial-impact` を作成。PR未作成、正式CI未実行。実採番はGitHubに従う。
- 既存解析/影響追跡と有効試算rowsを使う表示専用比較モデルを追加。＋追加/−削除/変更不明の辺、変更元/影響対象/影響なし/不明と、数値変更/不変/比較不可を分離。変更前はeditor開始・最後の一括確定時点で保存済み原本とは異なる。通常図/出力/ナビ/明示編集/診断/fallbackを維持し比較コピーと一覧を追加。計算エンジン、試算の有効性/適用、保存形式、未知情報、旧変数意味論は変更しない。[設計記録](docs/agent/dependency-comparison.md)。
- ローカル: 675単体/27files（既存658維持）、CI契約26、lintエラー0・既存aria-description warning1、型検査、通常/Pages build成功。独立担当は関連7files/96件を別実行し成功。比較モデル最終文言修正後も675単体/lint/type/Pagesを再確認。
- 独立レビュー: global解析制限でnodesが空でも実在blockを削除扱いしない修正、変更前由来の式の明示、追加辺太線CSSの修正と回帰検査を確認。コード上の未解消阻害なし、正式GUI/最終HEAD CIは未確認。
- GUI初回: Chromium3条件は既存zoom selectorが新表示切替も拾う多重一致で停止、対象をzoom操作部へ限定し125%/100%期待を維持。375は比較前の既存scrollTo後のscrollY=19（期待0）で停止。traceで現象を確認、根因未解明。
- GUI修正後: desktop/narrowは比較前の既存load/button待機でtimeout、390も既存reloadでtimeout。375は先のscroll検査を通過し新比較/数値区別/コピー/移動の検査を通過した後、新規pickerのラベル完全一致待機で停止。select一意指定へ訂正する。既存timeout/期待値は緩めず、別run成功を根因解消と扱わない。各失敗trace/PNGを保持。local WebKit2条件は必須OS libraries不足、公式install-depsはroot認証待ちで入力せず中止。正式Ubuntu CIで全6条件を補完する。
- CIは既存6条件/検査を維持し比較を既存stageへ統合、予定384checks/454geometry/114代表PNG（各1枚追加）。PR #43の成功trace非保存、失敗前からのtrace、2worker、SHA照合、30分timeout、7日保持を維持。最終実測は公開後記録に追記する。
- 参照: AGENTS/README/LOG/検証/GitHub運用/e2e/workflow、software-engineering、江戸弁運用ガイド抜粋・憲法/辞典の関連箇所を参照。全文参照とはしない。実iPhone Safari/VoiceOver/実OS clipboardは未検証。新しい計算方式/CI再最適化/Memo Nexus送信は対象外。mergeは行わない。

## 2026-10-21 (JST): PR #43 初回公開後の正式検証
- [PR #43](https://github.com/tetsujisugimori-coder/calculator-memo/pull/43) をDraftで作成。公開HEAD `ff9d37b3bb3a2582432f8cf9c900804416bc0f87`、[CI 39462748334](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/39462748334) 成功。ローカル実装commitとはmetadata差があるがtree `b336ec0bb78a6b19b450b20f20dd251627aa493a` 一致。
- 658単体/26files、26 CI契約、lint既存warning1、型検査、通常/Pages build成功。全6条件372 GUIの本文/順序も旧証拠と一致、448横はみ出しcheckpoint、mobile各629touch、errors=[]。代表108 PNG、成功trace保存0。
- [artifact 12284500565](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/39462748334/artifacts/12284500565) は31784933 bytes、SHA256 `9a9c399a2786c485d540c63da65dd3d17c0121e6608c6bdeac27e9821ff4f5ba`、取得ZIPと全workerのexactHEAD照合済み。容量約92.6%減、GUI556.566秒、job約10分52.6秒。旧2run双方と比較しGUI54.3%/38.4%短縮。Ubuntu image差・自然変動・個別WebKit時間増加・総CPU比較不能を区別する。
- 実画像でWebKit375 dark/文字拡大の130・差+10・状態ラベル、390のgraph-end診断を確認。実iPhone/VoiceOver等は未検証。詳細A–L時間/容量/失敗8経路の実証範囲は[CI設計記録](docs/agent/ci-optimization.md)。
- 独立レビューの阻害指摘は修正、26契約も独立成功。localの間欠操作停滞は逐次390でも発生し原因未分離、正式CI成功で解消したと扱わない。実GitHub uploadサービス故障は未実証。記録commitの最終HEADは[PR Checks](https://github.com/tetsujisugimori-coder/calculator-memo/pull/43/checks)で別途成功を確認してからReadyへ進め、人間承認なくmergeしない。


## 2026-10-21 (JST): CI 計測・証拠容量と実行時間の最適化
- 基点: PR #42 merge済み最新main `be2d34a35bad21f8f9c17970f46a6a1ed404d44f` をcloneし確認。作業枝 `perf/ci-evidence-optimization`。PR未作成、正式CI未実行。CI専用の単一範囲でPRに受入条件を集約し、既存アプリIssueや計算仕様は変更しない。
- 実測: 同一PR42 HEADの正式CI2回は22.71分/16.74分、GUI1217.213秒/903.859秒、artifact431903525/429598046 bytes。自然変動約26%があり古い1回だけで改善率を断定しない。WebKit390の主な差はtap安定待ち（新run158.580秒対375の53.113秒）、DPR等の因果寄与は未分離。trace連続画像が大半を占めた。[計測方法と内訳](docs/agent/ci-optimization.md)。
- 変更: 全658単体・全6条件372GUI・448撮影時geometry・touch629×4を維持し、検査と撮影を分離。成功PNGは各18代表画像、操作前からDOM/action/network/source traceを収集し失敗時export、成功時exportと連続screencastを省く。2worker限定並列、port/context/storage/証拠分離、共有served marker一度生成、全件coverage/SHA照合。工程/撮影/trace API計測、resource記録、inventory、npm cache、upload無再圧縮。アプリ/lockfile/required check/30分timeout/7日保持/権限/本番を維持。
- 判断変更: 従来は成功時も全PNG/6trace保存。今回は解析で容量主因を確認し、全検査と失敗前診断を維持しつつ成功証拠を選別する。連続画像がなくなる制約、setup/trace終了後の失敗ではtraceがない場合を明記。
- ローカル: Node24.19.0、658単体/26files、lint既存aria-description warning1、型検査、通常/Pages build成功。CI制御契約26件成功（アプリ件数と別）。隔離実Chromium故障3例でGUI途中/撮影失敗のexit1・故障前trace・failurePNG、SHA不一致の起動前停止を実証。GitHub上の故意unit/build/install失敗とartifactサービス実障害は未実証、ローカル伝播とworkflow failclosed確認を区別する。
- 失敗記録: 初回全量のdesktop preview timeoutはFetch禁止port4190が原因と追加診断で確定し4280〜4285へ訂正、全portのtransport前許可を契約test追加。初回375tap後dialog未表示も検出、traceでheader遮蔽待ち/tap後19.5秒の空白を確認、追加診断の同時負荷との因果は未確定。期待値/timeout/操作は弱めず初回証拠を保持して追加診断なしで確認中。単独desktop62checks/76geometry/18PNG成功。ローカルWebKitはOS libraries不足で起動不可、正式CIで補完予定。
- 独立レビュー: 共有marker競合、coverage確認前の成功trace破棄、PNG計測にgeometry混在を修正。stream失敗終了待ち/allSettled/checkpoint重複も修正。既存検査本体/期待値を独立照合しコード上の未解消阻害なし、正式最終HEADの全量検証は確認待ち。
- 参照: AGENTS/README/LOG/検証/GitHub運用/e2e/workflow/両packageとlockfiles確認。software-engineeringは子側で参照成功、pull-main skillは当時cloud skills利用不可。親で江戸弁運用guide関連範囲参照成功、今回の憲法/辞典Library読込はtimeoutで未確認。以前の参照を今回全文読了と扱わない。
- 残件: PR作成後の正式CIとZIP比較、実PR結果のLOG追記、最後の文書commitのCI確認。実iPhone Safariは対象外、マージしない。戻す場合はCI専用差分をrevert、データ移行不要。


## 2026-10-20 (JST): PR #42 公開後の正式検証結果
- 関連: [PR #42](https://github.com/tetsujisugimori-coder/calculator-memo/pull/42) を作成済み。公開HEAD `01b92131964928babe384cd22688c0e145d98d95`、[CI 39425183509](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/39425183509) が成功。
- 正式検証: Node22.13.0、658単体/26files、lint既存warning1、型検査、通常/Pages build成功。Chromium4/WebKit2の全6条件372 GUIチェック成功、runtime/network errors=[]、touch4条件各629activation。ローカルWebKit未実行を、このCI実行で補完した。
- 証拠: [artifact 12266194107](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/39425183509/artifacts/12266194107)、ZIP SHA256 `74f924e289dc1464385bad863326ce4bb3f92db3853d863d18763a4bb3e7727e` を照合。provenanceのsha/expectedSha/servedIdentityが公開HEADと一致、448 PNG/6 tracesを取得。
- 実画像: WebKit375px dark/文字200%で試算130・差+10・状態ラベルと枠を確認、390px成功画面で保持100・試算120・差+20・未反映/別途保存の説明を確認。縦scrollで閲覧するカードであり、全文や全カードの1画面表示を保証しない。実iPhone Safari/OSキーボード/VoiceOverは未検証。
- 公開tree `dd48ab114fcbf3da531b871877db8c783ec655b6` はローカル実装commit `f9eac2a0a35dab306fbd61d736508c0e71a67a18` と一致。独立レビューの阻害3件は修正・再検証済み、未解消阻害なし。旧main比較600ケースも差分なし。
- この追記は文書のみ。結果記録commit自身の最終HEADは [PR #42 Checks](https://github.com/tetsujisugimori-coder/calculator-memo/pull/42/checks) で別途検証し、上記SHAの成功で代用しない。mergeせずレビュー待ちで停止する。

## 2026-10-20 (JST): 計算メモの試算・差分プレビュー
- 基点: PR #41 merge済みmain `1d43eccb49bdc81177d4d6c122290d455d174b71` をfetch/ff-only pullして確認。作業枝 `feat/calculation-trial-preview`。PR未作成、正式CI未実行。単一機能の範囲・受入条件・残件をPRで管理し、既存Issue #19（%）等は対象外として変更しない。
- 変更: 既存評価本体を純粋な `evaluateReferenceMemo` として共有し、実数値評価の観測だけを一時結果へ追加。旧 `recalculateReferenceMemo` は戻り値の形・順序・停止・優先error・rollbackを維持する。試算モデル、未反映カード、内部値差分、既存i診断と移動、明示的全件反映を追加。
- 安全境界: 試算ではonChange/保存を呼ばず、反映は全成功＋対象/世代/全snapshot照合＋既存engineの再評価一致だけ。入力・参照・並替え・追加削除・元メモ/タイトル・unknown metadata変更で失効。旧非同期完了はrequest/mount/世代照合で破棄し、試算一時情報はJSONへ保存しない。反映先は編集draft、永続保存は既存「保存する」である。
- 互換性/判断: 標準の手動計算メモへ導線を追加し、旧自動メモの入力時/保存時評価は変更しない。混在旧変数の逐次scope/再代入失敗、ID依存/canonical順、数値精度、全件確定、未知field、非破壊読込、図/Mermaidを維持。部分確定・自動試算・cache・差分図・Memo Nexus送信なし。
- 独立レビュー: apply後focusが消える点、A→B→Aで古い試算が有効表示に戻る点、取消済みpending表示が再浮上する点を修正。最後のpendingは修正前失敗を独立再現し、世代照合で回帰成功。独立16件成功、未解消阻害なし。重複applyは1回だけ反映し、成功表示も維持する。
- ローカル検証: Node24.19.0で658単体/26files（既存602を減らさず追加56）成功、lint既存aria-description warning1のみ、型検査成功。mainの旧評価ソースを一時fixtureとして600ケース（正常/数値/構文/参照切れ/循環/旧変数/表示順）比較し、旧入口の全戻り値・元データの差分なし。比較fixtureは一時検証後削除し、通常テスト件数へ合算しない。重複apply表示guard・親の現在原本revision配線・card border変数訂正後の最終通常/Pages buildも成功。正式CIは公開後に確認する。
- GUI: 新規試算シナリオの先行Chromium desktop/375px touch成功、runtime/network errors=[]。保持値・storage不変、storage write呼出0、内部微小差分、変更/影響/無関係、失効、反映/保存/reload、旧変数/ID失敗と未試行、適用後focusを確認。全量harnessのChromium4条件247チェック成功、errors=[]、298PNG/4trace、mobile2条件は各629touchactivation。WebKitはOS library不足で起動不可、2条件未実行でharness exit1。全量は直前buildを対象とし、最終3差分のうち保存原本revisionと重複applyは単体で確認済み、最新buildのfocused desktop/375pxも2条件成功、errors=[]。375px dark/200%画像で試算130・差+10・状態ラベルとcard境界を実視認し、全カードは縦scrollで閲覧する。
- 参照: AGENTS/README/LOG/設計/検証/GUI/workflow、software-engineeringとpull-mainを実参照。親側で憲法v2関連範囲、江戸弁ガイド、辞典v19/行動algorithmv4冒頭関連範囲を参照済み（全文読了ではない）。追加React review skillは当時利用不可で参照失敗、独立実コードreviewを継続。
- 詳細/残件: [試算・失効・保存境界](docs/agent/calculation-trial.md)。実iPhone Safari/OSキーボード/VoiceOverは未検証。既存のchunkサイズwarningは別課題。公開後実PR/CI結果を追記し、最後の記録commitのCIも確認して未mergeレビュー待ちで停止する。戻す場合は本PRをrevert、保存形式移行は不要。


## 2026-10-20 (JST): PR #41 公開後の正式検証結果
- 関連: [PR #41](https://github.com/tetsujisugimori-coder/calculator-memo/pull/41) を作成済み。以下の実装開始時点の「PR未作成・CI未実行」を、公開後の実測結果で補う。
- 対象: 公開HEAD `aeaf836c76abc61ba62ffe8160b21f4537f6d598`、[CI 39408931086](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/39408931086)。Node22.13.0で602単体/23files、lint（既存warning1）、型検査、通常/Pages buildが成功。Chromium4/WebKit2の全6条件・348 GUIチェック成功、runtime/network errors=[]。
- 証拠: [artifact 12259276392](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/39408931086/artifacts/12259276392) のZIP SHA256 `5da724fc69a97ce7813c965151771e2850a2b55c967541a7c825cc6b7d303879` を一致確認。provenanceのsha/expectedSha/servedIdentity.shaは対象公開HEADと一致。412 PNG/6 tracesを取得、各条件12回の移動先geometry/hit-testが成功し、touch4条件は各597activation。
- 実画像: 同artifactのWebKit375px dark/390px light・文字200%の図と移動先、375px診断詳細、390px上限fallbackの計6枚を確認。選択ブロック3の番号・強調・明示編集操作が視認でき、図は専用領域内の横scrollとなる。大きい図全体や長い診断全文を1画面で視認したという意味ではない。実iPhone Safari、OSキーボード/VoiceOver、実OSクリップボードは未検証。
- 独立レビュー: ローカル実装commit `5743bf40800b92bf2b48fc09a0bd4813097b55c4` と公開HEADは同tree `195f43bc1dff4ecb71dc6648b6e1695b267a8e4a`。安全性・ID対応・非同期取消・モバイル移動等の指摘を修正し、未解消の実装阻害事項なし。独立19件と大図/異常系/実描画例外の詳細は以下の記録を参照。
- この追記は文書のみ。結果記録commit自身の最終HEADのCIは [PR #41 Checks](https://github.com/tetsujisugimori-coder/calculator-memo/pull/41/checks) で別途確認し、上記HEADの成功で代用しない。エージェントはmergeせず、人間レビュー待ちで停止する。

## 2026-10-20 (JST): 読み取り専用の依存関係図とブロック選択
- 基点: PR #40 merge後main `3339d978acd9518976a8954e77be4f8bcf50d6b4` をfresh clone/fetch/ff-only pull、枝 `feat/dependency-graph-navigation`。PR未作成、CI未実行。
- 変更: PR #38/#40のgraph/status/Mermaid/i診断を再利用し、折り畳み図・scroll/zoom・安定IDノード選択・カード強調・明示編集focusを追加。計算/保存/エンジンコードを変更せず、図操作からonChangeや再計算を呼ばない。
- 安全: strict Mermaid、固定placeholderによるlayoutとSVG textContent表示を分離、SVG要素/属性許可リスト、HTML/CSS/event/外部URL除去、完全ID対応検査、非同期取消、削除済み対象検査。128nodes/256edges/入力25万文字/SVG4MB/寸法5万上限で一覧fallback。
- 設計判断: 非HTML Mermaidでは既存数値entityが文字として露出することを実ブラウザで再現したため描画専用projectionを追加。export原文は不変。式preview80文字＋全状態ラベル、全文は移動先・accessible名・exportで確認。辺labelは種類へ短縮するが依存辺/不確定性を変えない。直接Memo Nexus送信、自動/部分再計算、依存編集なし。
- 参照: AGENTS/README/設計/運用/検証と、憲法v2・江戸弁ガイド・辞典v19の関連範囲を実参照。全文読了とは称さない。
- ローカル検証: 修正後602単体/23files成功、lint既存warning1のみ、型検査、通常/Pages build成功。ローカル全GUI harnessはChromium4条件231チェック成功、runtime/network errors=[]、274PNG/4trace（以前のfailure画像/traceは除外）。各条件12回の移動先geometry/hit-test成功、touch390/375は各597activation。WebKit両条件はlibrary不足で未実行、harness全体exit1。実画像で375px/200% darkの選択番号/強調/編集操作の可視性とdiagram専用scrollを確認。実Chromiumで日本語ノードとgeometryを確認。独立adversarial19件成功、長文label枠内・drag抑止/Enter選択・実SVG描画例外fallbackの式/結果/storage不変を実測。128node/127edge鎖の実描画・末端ID選択・目印の可視性・全値/storage不変も成功（初回描画1,625msは当環境1回測定で一般性能保証ではない）。自己/2node循環/その下流/missingを含む6node図も診断共有・全値/storage不変を独立確認。
- 環境: npm既定cache不可は/tmp cacheで解消。Node24.19.0のローカルとNode22.13.0のCIを区別。WebKit起動はOS共有library不足、公式install-depsはsuエラー、escalated実行はsandbox初期化エラーで未実行。Chromiumを先行検証しWebKitはCIで確認予定。未検証を成功と扱わない。
- レビュー/GUIで発見した修正: SVG寸法保持、点線復元、並替え後accessible番号、引用符付きedge entity、長文W幅を修正。7node図によるmodal横溢れを再現しgrid最小幅/専用scrollへ封じ込め。focus成功だけでは移動先の視認を保証しない画像を確認し、選択UIのlayout後rAF scrollと目印の実可視位置検査へ強化。375px/200%ではカード先頭+固定余白で編集目印が画面外へ出るため、番号付き目印そのものを中央へscrollする方式に修正。旧変数fixtureの不正referencesと実線selectorの誤包含はテスト側不備として修正し、計算期待値を弱めず再検証。正式公開SHAの全6条件CI/実PR URL/最終文書commit CIは実確認後追記する。ローカルGUIは未commit作業tree基点3339d97の証拠であり、公開最終SHA成功とは称さない。

## 2026-10-20 (JST): 計算ブロックの変更状態・エラー詳細・Mermaid出力
- 基点: PR #39 merge後main `ebb0bef872f7ef033d3529047aa94366ab2b34a0`をfresh fetch/ff-only pull、新枝`feat/calculation-state-diagnostics`。[PR #40](https://github.com/tetsujisugimori-coder/calculator-memo/pull/40)を作成済み。
- 変更: 既存前後依存解析を再利用する純派生statusモデル、直接変更/影響候補/無関係/不明、構造確認/今回試行/保存済みerrorを分離。i詳細に日本語説明・式・原因/影響・対処・試行範囲・該当カード移動。全体rollback通知を上部へ集約し、旧結果captionと個別原因を区別。
- 判断: 従来の全件staleは一括確定の互換性上維持するが、個別警告には流用しない。編集開始/成功時snapshotで前後比較し、stale保存を開き直したときは過去baselineがないため不明を明示。比較元・詳細試行は非保存、既存JSON変更なし。旧自動変数計算は互換動作を維持し、新しい自動再計算は追加しない。
- Mermaid: 既存生成の通常出力は維持し、任意nodeStatesで変更/影響/原因/下流/不明を表現。安定ID/順序/escapingを保持。readonly文字列とcopy操作、失敗時手動選択案内。Memo Nexus送信はしない。
- 互換性: エンジン・評価順・停止条件・全成功一括確定・rollback・未知field・内部精度・安全制限・非破壊読込・登録式/履歴の処理コード変更なし。
- 独立レビュー: 保存旧errorを修正後式へ誤帰属する表示と、旧自動計算の確定errorを未実行と呼ぶlabelを再現し修正。失敗時式/範囲は不明と明示、保存済みerror優先labelへ。回帰テストを追加。追加で循環＋参照切れが合流する下流の既知原因欠落を再現し、全構造原因の確定到達を統合するよう修正。自分自身の別原因がある場合も上流原因を残す回帰を追加。最終独立25件成功、未解消阻害なし。正式CIは確認後追記する。
- ローカル検証: Node24.19.0、588単体/21files成功（既存551期待値不変、新37）、lint既存aria-description warning1のみ、types成功、通常build成功。最終ソース通常/Pages buildも成功。詳細設計は[calculation-status.md](docs/agent/calculation-status.md)。
- 初回GUI: 旧結果保持は正しいがcaptionから『旧結果』語がなく既存assert失敗。ユーザーの旧結果明示要件に合わせ『旧結果（保持中・未確定）』へ修正し、数値期待値は変えず再検証で解消。初回setupはe2e依存リンク/browserpath不足で未開始、既存隔離依存と既存browserpath指定で開始。
- ローカルGUI: Chromium4条件で215チェック成功（新20）、errors[]、246PNG/4trace。実画像4枚で原因/下流/旧値、狭幅dark/light200%詳細、Mermaidを確認。WebKitはOS共有ライブラリ不足で両条件未実行、全harnessはexit1。最後の撮影位置調整後を含む最終公開SHAはCI全6条件で正式確認し、ローカル作業treeの証跡を最終SHA成功と称さない。
- 正式検証: 公開HEAD `e9f1513adbf5cd5d565ba456aba1b545405fa772` の [CI 39368747494](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/39368747494)で588単体/21files、lint、型、通常/Pages build、Chromium4/WebKit2の324 GUIチェックが成功、errors=[]。artifact 12241505818のZIP digest一致、provenanceのsha/expectedSha/servedIdentity.shaを公開HEADと照合。370 PNG/6 traces、実PNG8枚でWebKit375px dark/390px lightの200%表示、原因/下流/旧値/i詳細/Mermaid等を確認。長い詳細は縦scrollであり画面外全文を視認済みとはしない。
- 検証時間の調整: 上記jobは19分40秒で既存20分上限へ接近したため、追加GUIシナリオ分の余裕としてtimeout-minutesだけ30へ延長。検査項目/期待値/通常の実行量は不変。結果追記と設定調整を含む最終commit自身のCIは [PR #40 Checks](https://github.com/tetsujisugimori-coder/calculator-memo/pull/40/checks)で別途確認し、上記HEAD成功で代用しない。
- 未解決・対象外: 過去baseline復元/永続診断履歴、数値未試行原因の網羅、実iPhone Safari・OSキーボード/VoiceOver・長期保存・全幅は未検証。部分再計算/部分確定/エンジン全面改修なし。PR作成・正式CI後に結果を追記し、最終文書commitのCIも確認して未mergeで停止する。

## 2026-10-20 (JST): PR #39 後日補記（記録のみ）
- 訂正対象: 以下のID実行計画節は公開前の『PR未作成・正式CI確認待ち』が残っていた。公開・検証済みの記録追記が完了処理で漏れていたため、過去本文を保持して事実を補う。PR #39のコード/過去branchは変更しない。
- [PR #39](https://github.com/tetsujisugimori-coder/calculator-memo/pull/39)、最終HEAD `ce22e800e3ba08d54cccfee633c9ccd01adcf274`、[CI 39364179508](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/39364179508)成功。551単体、lint、types、通常/Pages build、Chromium4/WebKit2の294 GUIチェック、独立55検証成功。実画像確認と証跡HEAD照合済み。
- PR #39は人間によるmergeを今回の最新mainで確認。既知制約と意図的な独立IDエラー選択順差分は元設計どおり。今回の追記は2026-10-20の記録訂正であり、新たなPR #39検証実行や再mergeではない。

## 2026-10-20 (JST): ID参照標準導線と共有依存グラフによる実行計画
- 基点: PR #38 merge後のmain `7fd8934ff3a04a3f43cd50ef5cbe77286ff55014`をfetch/ff-only pullして確認。新規作業枝 `feat/id-reference-execution-plan`。PRは未作成、番号未確定。
- 変更: 「＋ 計算」を既存ID参照形式の未評価ブロックへ、「＋ 旧変数計算」を明示互換導線へ分ける。内部ID入力は不要。PR #38の構造解析を共有coreへ分離し、実行計画・依存解析・Mermaidが同じ確定ID辺を使用する。
- 実行: 旧モードは従来の配置順で全件評価し失敗再代入のscopeを保持。旧フェーズ失敗時はID評価へ進まない。IDは依存元優先、ready集合内のcanonical ID順で決定的に評価。変数候補辺と逐次/フェーズ制約を分離し、不確定候補や保存エラーをpreflight失敗へしない。
- 判断変更: 従来のID独立ノードtie順は表示順由来。今回、表示順非依存の実行計画を保証するためID順へ変更。複数独立IDブロックが数値失敗する場合の先頭エラーもID計画順となる。旧変数・構造preflightの優先順位、成功時の数値意味論は維持する。旧変数とID文法の逆向き混合依存は現行文法で成立せず、不正な式を黙って変換しない。
- 異常系: 自己/循環成分/循環下流、参照切れ/参照形式/解析失敗を区別。今回の原因・確定ID下流だけを派生diagnosticsで返し、editorに局所表示。既存attemptErrorは全体rollback通知として維持し、無関係ブロック自身のerrorへ波及させない。編集・再読込では今回診断を引き継がない。
- 互換性: 全成功時のみ一括確定、旧結果rollback、未知metadata、JSON version1、非破壊保護、raw精度、登録式/履歴/メモを維持。保存移行・新依存なし。自動/部分再計算、キャッシュ、Mermaid描画拡張は対象外。
- ローカル検証: Node24.19.0で551単体/20files成功（追加34）。lintは既存aria-description warning1のみ、型、通常/Pages build成功。既存単体の期待値変更なし。既存GUIの旧変数シナリオは新しい明示ボタンへselectorだけ変更し、数値期待値を維持。自己参照の表示検証は区別された診断語へ変更。
- 独立レビュー: 55検証成功。旧mainと同treeの基準で40DAG比較、24表示順の実行順一致、旧scope/rollback、今回診断の局所性を確認し阻害指摘なし。計画のコメント位置を修正。最終CI/GUIは別途確認する。
- GUI: ローカル実アプリChromium4条件で195検証成功（新規16）、218PNG/4trace。新規導線・局所エラー・無関係rollbackの実PNGも確認。全harnessはWebKit起動時のOS共有ライブラリ不足でexit1となり、WebKit2条件は未実施。画面証拠をviewport/該当captionへ絞るハーネス変更後の最終SHAは既存隔離CIで6条件を再検証する。ローカルは未commit作業treeの探索検証であり最終公開SHA成功とは扱わない。iPhone Safari実機・OSキーボード/VoiceOver・長期保存は未検証。
- 詳細: [実行計画・優先順位・図との違い](docs/agent/execution-plan.md)。単独PRで受入条件を追跡し別Issueは作らない。公開後のPR本文に最終SHA/CIを記載する。戻す場合は本PRをrevert、保存移行不要。マージ・本番公開は行わない。

## 2026-10-20 (JST): 読み取り専用依存解析・変更影響・Mermaid文字列
- 基点: PR #37 merge後のmain `83ae24cc4b921b67a785c2e0160e7b8f63a2972c`。新規作業枝 `feat/dependency-analysis-mermaid`。[Draft PR #38](https://github.com/tetsujisugimori-coder/calculator-memo/pull/38)を作成済み。
- 変更: ID参照と旧変数を実際の構文検査経路で解析し、directed graph・診断・変更前後の影響閉包を返す内部API。Mermaid文字列はブロックIDの衝突しない符号化、全ラベルentity化、安定順/重複排除、状態文字を含む。画面描画/コピーUIは追加しない。
- 判断: 数値評価をしないため、`x=2`も成功を特例認定せず、成功しうる先行代入と未定義の可能性を不確定として保持。失敗再代入が残す旧scopeを推測で落とさない。配置変更自体と、配置による変数束縛変更を別報告。未知metadata/未使用slot/表示だけの変更は数値影響にしない。
- 互換性: 新解析は既存preflightと分離。手動全体stale、一括確定、rollback、旧エラー優先、raw精度、version1/未知metadata/非破壊保護は不変。既存parserを共有するため構文専用入口だけ抽出し、計算順・演算を変更しない。保存済みエラーは現在式の評価と区別する。
- レビュー: 独立レビューでmetadataだけの変更の過大包含、保存エラー表示、壊れた参照entries/current状態の例外、無効→有効構造修復の影響漏れを検出し修正。45対象テストを独立再実行して成功、未解決の正当性指摘なし。
- 検証: Node24.19.0で517単体（実Mermaid11.12.2 parserを使う8テスト含む）成功。lintは既存aria-description warning1のみ、型検査・通常/Pages build成功。Mermaid/jsdomはdev依存だけで、既存784依存entryのversion/integrity等は不変。最終commit自身のCIとGUI結果は[PR #38 Checks](https://github.com/tetsujisugimori-coder/calculator-memo/pull/38/checks)で確認待ち。
- GUI実施状況: 初回ローカル実行のChromium desktopシナリオ通過後、並行Pages rebuildがtest-only provenanceを消し次contextでJSON parse失敗。アプリassertion不良ではなく検証実行の干渉と切り分け。残りの5条件と最終SHAはPRの隔離CIで再検証する。ローカルWebKitは今回未到達（過去にOS共有ライブラリ不足）、Safari実機も未検証であり成功扱いしない。
- 詳細/残件: [設計/API/静的解析の限界](docs/agent/dependency-analysis.md)。全ての旧変数候補を残す保守的過大包含は意図的。自動/部分再計算、グラフUI、外部送信、Excelエンジンは対象外。作業枝の公開とDraft PR #38作成は実施済み。mainへのマージ・本番デプロイは行わず、人間レビュー待ち。戻す場合は本PRをrevert、保存移行は不要。

## 2026-10-20 (JST): PR #37 旧評価フェーズ失敗後の参照評価を停止
- 判定: 旧モード内の失敗後継続は、失敗再代入が従前のscopeを残す既存仕様を守る。一方、旧フェーズ終了時に全体失敗が確定した後のID参照評価は確定結果に使われない不要な処理だった。
- 修正: 旧モードを配置順にすべて評価した後、失敗があれば参照フェーズ前で全体rollback。旧フェーズ内の評価順・scope・全成功時のみ一括確定・未知metadata保持は不変。診断は後続の間接参照エラーではなく最初の旧モードエラーを優先する。
- 評価記録: ID参照は数値評価呼出し直前に記録し、throwした試行も含める。旧モードの記録は従来どおりcalculateMemoBlock呼出し単位であり、代入名検査などで内部数値評価に達しない失敗も含む。構造検査/参照元確認だけで停止した参照は記録しない。
- テスト先行: 変更前に不要な参照評価3ケースとthrow記録漏れ1ケースの4失敗を確認。追加9ケースで実calculator呼出し順/回数、正常再代入、失敗再代入後のscope保持、検査段階の失敗、混在参照、旧結果全rollback、修正復帰、丸め前精度、未知metadata、JSON保存再読込、未知形式の非破壊保護を検査。
- 検証: Node24.19.0で481単体、lint（既存warning1）、型検査、通常/Pages build成功。GUI・最終公開SHAのCIは既存PR Checksで確認待ち。今回UI変更なし。独立ソースレビューでもphase境界と記録範囲を再確認。
- 関連: [PR #37](https://github.com/tetsujisugimori-coder/calculator-memo/pull/37)。新規PR・マージ・本番公開なし。リモート12c6c031と同treeのローカル52304108から作業し、公開は既存PRへ同差分を反映する。

## 2026-10-20 (JST): 参照selectのWebKit native描画を修正
- 再確認: `e20216d` のCI 39339028663は6条件270チェック成功でも、375/390px WebKit dark拡大画像では参照selectが白地・淡色文字のままだった。前回のCSS色指定/computed style検証だけではnative描画を検出できなかった。
- 修正: 参照selectに限定してappearanceを外し、既存テーマ色・CSS矢印・右余白を明示。select要素、選択肢、native選択操作、ラベル、44px以上の高さ、focus-visibleは保持。計算・保存処理は変更しない。
- 回帰: 両テーマ200%拡大で、select screenshotの実PNGをCanvasへ読込み、文字/矢印を避けた上部内側の背景色と文字色の出現を検査。computed CSS成功だけを視認性の根拠にしない。
- ローカル検証: Node24.19.0で472単体、lint（既存warning1）、型検査、通常/Pages build成功。Chromium375pxの分離したnative select診断で両テーマの描画画素と選択値変更を確認。実アプリ全GUI再実行とは区別する。
- 未検証: 今回の修正後WebKit画像/6条件GUI/最終SHA CIはPR #37 Checksで確認待ち。ローカルWebKitはgtk4/graphene/woff2/harfbuzz-icu/hyphen/manette/GLESv2の共有ライブラリ不足で起動不可。iPhone Safari実機・OS picker/VoiceOverは未検証。
- 関連: [PR #37](https://github.com/tetsujisugimori-coder/calculator-memo/pull/37)。マージ・本番公開なし。

## 2026-10-20 (JST): 同一メモのID参照・手動一括再計算
- 基点: main `b1a590aa74808e82c7c3dfe3e02fa13984338450`（PR #36 merge）。
- 変更: GUIでslot→block ID参照を挿入する新mode、非再帰依存解析、循環/欠損検出、永続manual方針、旧結果/stale表示、全成功時のみ一括確定。既存engine/丸めを変更せず内部数値を参照。
- 判断: 旧検討の前方ブロックだけという制限は採用せず、任意配置のID参照へ。旧変数の逐次束縛は互換性のため別段階に維持。部分closureより全体atomicを採用し、無関係の空式も確定を止める制約を明示。詳細は [設計記録](docs/agent/block-references.md)。
- 非破壊性: 未知形式の原本保護/保存拒否、既存付随情報保持を継続。登録式取り込みの裏再評価を止め、手動メモは確認済み値のみ取り込み可能。
- ローカル検証: Node24.19.0で472単体、lint（既存warning1）、型検査、通常/Pages build成功。独立レビューの追加5件（2,880 DAG数値比較を含む）成功、現時点阻害指摘なし。GUI6条件と最終SHA CIはPR Checksへ追記する。
- GUI診断: ローカルChromium既存4条件で179チェック成功、各条件のbrowser/runtime/network error 0。WebKitはOS共有ライブラリ不足で起動不可。作業差分のローカル画像はbase SHA overlayのため、公開候補SHAの正式証跡として扱わない。
- 正式検証: [PR #37 Checks](https://github.com/tetsujisugimori-coder/calculator-memo/pull/37/checks)で最終head自身のNode22.13.0、両build、Chromium/WebKit6条件を確認し、SHA・実測結果・artifactをPR本文へ記録する。200%文字拡大は上部だけでなくpicker/結果までスクロールした画像も追加。
- 関連: [PR #37](https://github.com/tetsujisugimori-coder/calculator-memo/pull/37)。CLI push認証不足のため公式GitHub接続で公開、local/remote tree一致を検査。新Issueは作成しない。
- 独立画像レビュー: 初回候補CI 39336687992 は472単体/GUI6条件270チェック成功したが、WebKit375px dark拡大画像で新参照selectの白背景/淡色文字を確認。新参照selectとbuttonのテーマ背景・文字・枠色を明示し、両テーマCSS期待値をGUIへ追加。テスト成功と視認性を分けて判断し、修正後の最終CIを再確認する。
- 未検証: iPhone Safari実機、OS入力/VoiceOver/長期保存。実ユーザーデータ損失を確認したものではない。

## 2026-10-20 (JST): 保護理由キャプションと原本JSONエクスポート
- 基点: PR #34マージ済みmain b81d27ce15709e1f599888b78d884f8a6f6b902f。Issue #35。既存読込/保存保護を再利用し、全データ保護の説明、未対応type/mode・構造異常・重複IDの理由、既存復旧UIの詳細と原本ダウンロードを追加。
- 保存形式/計算規則変更なし。原本文字列をUTF-8へ欠落なく往復できる場合のみファイル化。空文字原本も扱い、取得不能/孤立サロゲートは成功扱いしない。単一キーのため正常兄弟メモもロックする既存制約を画面と文書に明記。
- 予防対策であり実ユーザーデータ損失は未確認。修正前8失敗は診断コード未実装の期待値であり、既存保護のデータ損失再現ではない。
- ローカルNode24.19.0で434単体、lint（既存warning1）、型検査成功。両ビルドとGUI、独立レビューの確定結果は後続記録を参照。
- 江戸弁運用ガイド現行本文と保存済み辞典の冒頭を参照。最新辞典全体は未取得。iPhone Safari実機、OS文字拡大/clipboard/ダウンロードUIは未検証。
- 正式検証: SHA `41e5af14efef64dc50971ae25bc2e9c54aeec5d4` の[Actions 39291019054](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/39291019054)でNode22.13.0、434単体、lint/型/通常・Pages build全成功。GUIは2026-10-20 02:06:23〜02:19:31 JST、Chromium4/WebKit2の既存6条件、234チェック、browser/runtime/network error 0。原本エクスポートは7種の異常についてUTF-8バイト完全一致。
- [成果物256画像・6trace](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/39291019054/artifacts/12206467085)のSHA256 `264066e0d53fb5d1c7ffad6113b0558a8cabab6ff9abfcd67e48afefcbe7574c` をAPI digestと照合し、checkout/配信SHA一致を確認。独立レビューがソースと成果物を別途確認し阻害指摘なし。WebKit375/390、両テーマ、拡大文字で保護理由と操作の折返し/可読性を確認。7日保持。
- ローカルChromium4条件155チェック成功。ローカルWebKitはOS共有ライブラリ不足で起動不可、正式6条件は上記Actionsで検証。公開はCLI認証不足のため公式GitHub接続を使用し、ローカル/公開tree一致を確認。
- この証跡追記は文書のみ。最終コミット自身のCIを[PR #36 Checks](https://github.com/tetsujisugimori-coder/calculator-memo/pull/36/checks)で別途確認し、PR本文へ最終SHAと結果を記録する。マージは利用者判断。


このファイルは開発履歴と重要な設計判断の正本（作業の証跡）です。現在有効な行動規則は [AGENTS.md](AGENTS.md) と関連設定・運用手順を参照してください。新しい記録はこの説明の直後へ追加します。旧記録に含まれる「現在」や追記形式は当時の内容であり、現行規則ではありません。


## 2026-10-19 (JST): PR #34追加レビュー対応・再計算時の付随情報保持
- 対象: [レビュー5570559182](https://github.com/tetsujisugimori-coder/calculator-memo/pull/34#pullrequestreview-5570559182)、基点 `cd020509f26d93e188c7d8837c49a5ced32ff847`。読込境界だけでなくPlainNoteModal保存、MemoBlockEditor追加/編集/削除/上下移動の再計算経路を確認。
- 再現: production修正前に回帰20件を追加し、付随情報保持12件が失敗、計算結果/不正拒否8件が成功。proofRef/sourceId/入れ子metadata等の消失経路を確認。実ユーザーデータの損失確認ではない。
- 修正: 元ブロックをcopyしてから計算エンジンの完全なsnapshotを重ね、付随情報を保持しつつ既知の結果/error/displayを更新。原オブジェクトや入れ子を変更しない。新たな型/保存形式/評価規則は追加しない。
- 契約訂正: 追加キーは意味を解釈しない記述的付随情報。保持は変更後の式への証明/出典の適合性を認定しない。計算意味の変更はversion/type/mode等の明示的互換境界が必要。未知type/mode/不正構造は従来通り保護停止。詳細は[非破壊保存契約](docs/agent/nondestructive-storage.md)。
- ローカル: 420単体・lint（既存warning1）・型・通常/Pages build成功。Chromium375touchの新規GUI診断で無変更編集保存、他ブロック編集/追加削除/上下移動、式error→復帰、JSON再読込と付随情報保持を確認。正式6条件・最終SHA CIは[PR #34 Checks](https://github.com/tetsujisugimori-coder/calculator-memo/pull/34/checks)へ記録する。独立再レビュー結果と正式GUI証跡は下記。
- 正式GUI: SHA `0f257312a97d6a5b55dda92b2386ae1909ef2890` の[CI39247191200](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/39247191200)全工程成功。2026-10-19 20:48:48〜20:57:47 JST、Chromium/WebKit既存6条件、216チェック、browser/runtime/network error0。追加情報は保存JSONで直接比較し、画面だけで保持を推測しない。
- [238画像・6trace](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/39247191200/artifacts/12184980090)を取得、ZIP SHA256 `0109ff32c618baec579a12ce3801e7f83ddbb128fa53e31495a93be07168feb3`とAPI digest一致。checkout/配信SHA一致、WebKit375画像確認。7日保持。最終文書SHAの結果はPR Checksへ記録する。
- 独立再レビュー: 420単体と追加10ライフサイクルを別途実行。完全な既知field更新、入れ子不変、未知mode拒否、編集経路と保存JSON保持を確認し、ソース阻害指摘なし。
- 残存制約: iPhone Safari実機、OS入力/clipboard/支援技術/長期保存未検証。付随情報のdeep cloneは不要と判断し、入れ子は不変参照共有。江戸弁ガイド現行箇所と保存済み辞典v19冒頭を参照。

## 2026-10-19 (JST): メモ・ブロックの非破壊読込・保存保護
- 基点: main `8c861b786b2972468398b05d8732ee00740615d9`（PR #32）。AGENTS/README/関連手順/Actions/既存Issue・設計書を確認。
- 変更内容: notesとblocksの構造・非空/一意ID・対応形式を検証。原JSONを保持して保存全体を停止。保存入口で既存データと候補を再検査し、既存の明示初期化を別経路へ分離。復旧UIを再利用し、保護中の編集と全体キー操作を停止。
- 判断変更: 従来は不正ブロックを落としてMarkdown本文へ縮退、不正メモは除外。成功読込後の自動保存により構造を失う経路があるため、全体fail-closedへ変更。実ユーザーデータ損失は未確認。正常version1/旧本文/空blocksを維持、式評価・丸め変更なし。
- 採用理由: 保存は単一キーの一括更新。ノート単位部分編集は安全なマージ契約を要するため今回採用せず全体保護を選択。将来の部分編集は別設計。詳細は[設計・検証](docs/agent/nondestructive-storage.md)。
- 検証結果: cloud Node24.19.0で全400単体、lint（既存warning1）、型、通常/Pages build成功。独立レビューでlocalStorage getterがtry外になる例外漏れを修正し回帰追加、最終阻害指摘なし。既存失敗期待を無根拠に変更せず、旧縮退方針から新保護方針への変更として回帰を追加。
- GUI証跡: SHA `8c3dde7e5d394f15f4eafd8b3b4ef49abb554ecd` の[Actions 39237123675](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/39237123675)全工程成功。2026-10-19 19:25:09〜19:36:00 JST、既存6条件（Chromium desktop/390 narrow/390・375 touch、WebKit390・375 touch）、198チェック、browser/runtime/network error 0。未知/混在/重複/不正blocks、再読込、取消、原JSONコピー、修復後正常編集、起動後破損の保存拒否、明示resetを追加。
- [232画像・6trace](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/39237123675/artifacts/12180301473)のZIP SHA256 `97e60ff49cf7fc56e235b98565b5d82caf49ed1f10976fdf1d93685a56d1b615`をAPI digestと照合。checkout/配信SHA一致、画像を確認。7日保持。最終文書コミットのCIは[PR #34 Checks](https://github.com/tetsujisugimori-coder/calculator-memo/pull/34/checks)で別途確認する。
- 初回診断: GUI title selectorが「任意」付きlabelに不一致、次に正常fixtureの空日時が既存formatter例外を誘発。selectorとfixtureを修正し期待値を緩和せず全条件再検証。日時意味検証は既存同様対象外の制約として記録。ローカルWebKitはOS共有library不足、正式検証はActionsを使用。コピーは合成clipboard sinkを検査し実OS clipboardは未検証。
- 関連: [Issue #33](https://github.com/tetsujisugimori-coder/calculator-memo/issues/33)。[PR #34](https://github.com/tetsujisugimori-coder/calculator-memo/pull/34) 検証中。
- 未解決/対象外: 多タブ完全な原子的競合解決、未知データの部分編集、iPhone Safari実機/OS入力/長期保存、Issue #19。江戸弁ガイド現行箇所と辞典v19冒頭を参照。初回npm既定cacheは書込不可、workspace cacheを使って成功。


## 2026-10-19 (JST): 登録式の実行・変数入力
- 基点: PR #30マージ済みmain `e5e87046c1c7671636f1a53d00c559cc4a81b4d9`。AGENTS/運用手順/README/LOG/Issueと評価器・変数・ライブラリ・保存方式を確認。
- 変更: 登録式選択→実行画面、構文から変数入力生成、明示選択したノートの有効値を空欄に取込、既存エンジンで確定計算。入力変更で結果を無効化し、定義と実行値・結果を分離。識別表示設定/native入力/i説明を踏襲。
- 保存: version1のoptional formulaExecutionsに未完入力をIDごと保存。再読込時は入力のみ復元、結果は再計算。不正追加データは元raw保持し自動保存停止。定義ID/既存データは不変。
- 判断: 履歴・単独メモはAST内の変数に丸め前数値を束縛した自己完結式と実行時記録を受渡し。通常エンジンでObject.is一致を確認し、展開による既存上限超過は結果を残して受渡だけ停止。表示は各既存formatterを維持するため整数近傍の文字列差はあり得る。代入失敗時の初期値は既存ノートと同じく以前の有効値を使う。詳細は[設計](docs/agent/formula-execution.md)。
- 検証: 全376単体（追加39）、型検査、lint（既存aria-description warning 1）、通常/Pages build成功。追加500式の独立JS比較。独立レビューでも376単体と別の6000式/6000履歴受渡が内部値完全一致、阻害指摘なし。初回CIも同一項目すべて成功。
- GUI: 初回HEAD `b306037bce2e8b7c712be0c0f6b8d41a5214accf`の[run 39200045405](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/39200045405)で既存6条件・156検証成功、実行時/通信エラー0。2026-10-19 13:34:35〜13:42:44 JST。[208画像・6trace](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/39200045405/artifacts/12163372883)を取得しZIP SHA256/API digestとcheckout/配信SHAを照合。7日保持。画像確認後、200%文字で下部操作をスクロール撮影し実tap受渡を確認する検証を追加。最終コミットも[PR #32 Checks](https://github.com/tetsujisugimori-coder/calculator-memo/pull/32/checks)で別途確認する。
- ローカル補足: 全体GUIは既存識別表示の撮影で10秒timeout、新規部分未到達。期待値/timeoutを緩めず記録。先行ビルドの新規限定診断はChromium desktop/375touchの8検証成功。正式な全6条件・SHA証跡は上記Actionsを使用。
- 独立比較の再現条件: i=1..1000、a=(i-501)/16、b=(i%23)/8、c=i%19+1。a+b*c、(a+b)/c、-a^2+b、sqrt(abs(a))+b/c、a*(1+b)、abs(a-b)^2をJS算術/Mathで直接評価し、生値と履歴転送値をObject.is比較。
- 関連: [Issue #31](https://github.com/tetsujisugimori-coder/calculator-memo/issues/31)。登録式間参照・関連レポート・科学記数法・単位換算は対象外、Issue #19維持。
- 未検証: iPhone Safari実機、OSソフトキーボード/IME/支援技術、長期保存。江戸弁運用ガイド現行箇所・辞典v19冒頭を参照。通常git pushは認証なしで失敗。公式connectorで同一tree SHAを照合して作業branchへ公開した。


## 2026-10-19 (JST): 変数・登録式の識別表示基盤
- 基点: PR #28マージ済みmain `040cd3683cafaa5d0aaa89ff3be421470b1184cc`、AGENTS/関連手順/README/LOG/Actions/Issueを確認。
- 変更内容: 3表示モード、720px以下初期色のみ、手動値は保存固定。変数青/登録式紫/式黄/結果緑と上側の小ラベル、i説明本文を独立ファイル化。
- 第一希望/採用判断: 入力文字への直接装飾よりnative入力の安定性を優先し、別表示の代入先/参照一覧を既存AST構文検査で生成。計算評価器・丸め変更なし。登録式はID付き項目だけを識別し、式内の同名変数を登録式参照と扱わない。登録式実行/関連レポートは後続。
- 保存: 既存version1 settingsへoptional identificationMode。欠落/不正値は幅連動初期値、手動noneを含む有効値は固定。旧数値/メモ/ライブラリ不変。
- 検証結果: 337単体（追加20件）・lint・型検査・通常/Pages build成功。独立レビューのヘルプ中の背面キー操作抑制、代入式全体の入力長検査の2指摘を修正し、追加阻害指摘なし。GUI/CIの最終結果と証跡はPR Checksへ記録する。
- GUI追加: 既存6条件を維持し、3モード/自動初期値の幅跨ぎ/手動固定/保存復元/両テーマ/構文エラー時の識別解除/未知変数/改名削除/nativeカーソル/ヘルプ中キー操作とfocus復帰を検証。色のみは視覚ラベルを隠し支援技術向け文字を残す。
- 関連: [Issue #29](https://github.com/tetsujisugimori-coder/calculator-memo/issues/29)、[PR #30](https://github.com/tetsujisugimori-coder/calculator-memo/pull/30)。
- 未検証: 実機iPhone Safari・実OS IME/キーボード・支援技術の実機操作。cloud skillは提供状態変動のため未参照、repo規則を優先。江戸弁ガイドの最新原文参照は本作業では未確認。


## 2026-10-19 (JST): 登録式ライブラリの基礎
- 前提確認: main `693277454e13202a1aa8d9368e40768036b68a36` はPR #26変数機能まで。利用者が登録式/表示設定もマージ済みとの前提を訂正し、登録ライブラリ基礎を明示承認したため再利用実行は含めない。
- 変更内容: 名前/式の登録・一覧・選択（詳細確認）・編集・確認付き削除/直前undo。未束縛変数は構文から抽出し数値結果を作らない。定義と将来の実行入力を混ぜない。
- 判断: 既存parser/AST許可検証を共有するvalidate-only経路を追加。評価器は不変、1/0等の数値成立は検査しない旨をUI/READMEで明示。代入、任意関数、暗黙乗算を禁止し入力/深度/ノード制限を維持。%既存問題#19は別件。
- 保存: top-level version1のoptional formulaLibrary（内側version1）。旧データ欠落は空、未知version/壊れた定義/選択は元raw保持し自動保存停止。対応versionの追加metadataは保持。旧アプリによる新フィールド喪失は制約として明記。
- 第一希望/採用: 既存変数と共通の構文規則・小さい追加領域を採用。仮の変数値で計算検査する案や、実行/表示設定の先回りは不採用。未確定編集はmodal内に保持するがreload後draft復元は次段階。
- 検証: 317単体・lint・型検査・通常/Pages build成功。基点mainとの2029式比較（旧1000式含む）で値/表示/エラー差分0。独立レビューでも317単体・型検査成功、5760評価の値(Object.is含む)/表示/エラー差分0、阻害指摘なし。フォームlabelを明示関連付けに修正し、下部操作/両theme/文字2倍の追加画像を補強した。
- Actions: [run 39184182970](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/39184182970)、初回HEAD `07e8609ff22bbf7f42cac53a1563dac0d660d7b2`で全工程成功。2026-10-19 10:13:00〜10:20:09 JST、Chromium4条件（1365px、非touch390px、touch390/375px）とWebKit touch390/375pxの計6条件126検証、ブラウザエラー0。[124画面・6trace・診断](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/39184182970/artifacts/12157458309)を取得、ZIP SHA256をAPI digestと照合し、checkout/配信SHA・branch/runを確認。7日保持。証拠補強/本記録の最終コミットは[PR Checks](https://github.com/tetsujisugimori-coder/calculator-memo/pull/28/checks)で別途確認する。
- ローカルGUI: Chromium4条件83検証成功、WebKitはOS依存不足で起動不可。初回375pxの既存メモ開始tap後dialog不在、別診断ではscrollY=0期待に15が残る失敗を観測。traceにsmoothscroll中の不安定/ヘッダー遮蔽があり、同一アプリ再確認/上記Actionsでは成功。期待値やアプリ挙動を変更せず記録する。追加したlibrary限定375px診断で両theme/2倍文字/下部操作の表示は成功（OS文字拡大・実機検証ではない）。通常git push認証なしのため公式connectorで同一treeを照合し作業branchへ公開。
- 関連: [Issue #27](https://github.com/tetsujisugimori-coder/calculator-memo/issues/27)。[PR #28](https://github.com/tetsujisugimori-coder/calculator-memo/pull/28)。
- 未検証/制約: 実機iPhone Safari、OSキーボード、長期保存は未検証。ライブラリ200件・タイトル120文字。江戸弁ガイド現行箇所/辞典v19冒頭参照済み。クラウドengineering skill読取は利用不能で未参照、repo運用規則を確認した。


## 2026-10-19 (JST): ノート単位の明示的な変数モード
- 変更内容: 計算ブロックへ変数定義・参照・再代入を追加。既存AST全検証→一回評価を再利用し、ノートごと空のMapで上から評価。編集・移動・削除・追加は全体再計算。本文/KaTeX/通常電卓/単独メモ/URLへscopeを流さない。
- 従来方針 / 変更理由 / 新方針: x/Xを乗算にする旧式と合法変数名ex2が衝突するため、推測的な式判別を不採用。optional evaluationModeを持つ新ブロックと明示切替のみ変数評価し、欠落した旧ブロックは旧解釈のまま。保存version1は維持、未知modeは実行エラー。旧版アプリで新modeの再編集・再計算は非対応。
- 第一希望 / 採用策: ノート単位scopeと旧データ保全を小さい加算変更で実現。共有scope、依存graph、大規模schema移行は採用しない。失敗再代入は以前の有効値を保持し、以降を継続。設計詳細・次表示設定への引継ぎは [note-variables.md](docs/agent/note-variables.md)。
- 表示判断: 変数/式/結果を淡青/黄/緑と文字ラベルで分離。新modeの非zero整数近傍だけ2*EPSILON*abs(value)以内の丸めノイズを表示で整える。total例は表示6,600、内部6600.000000000001を保持。広い有効桁丸めは大整数を変えるため不採用。旧表示は変更しない。
- 検証結果: cloud Node24.19.0で286単体・lint・型検査成功。通常/Pages build成功。main c02861c4a5e30df2095a0bc4180407050bfe173dとの2029式（旧1000式含む）比較で内部値・表示・エラー文差分0。GUIは既存6条件へ変数・旧mode・保存・順序・scope・両theme/拡大/折返しを追加。下記初回Actionsで成功し、最終commitはPR Checksで別途確認する。
- 独立レビュー: 初稿でmathjsの非十進数tokenが通過する指摘を受け、変数modeで明示拒否と回帰追加。独立286単体成功、旧新8,008式差分0、逐次scope500ケース確認、blocking指摘なし。最終追加は未知mode保存回帰と画像撮影位置の補強のみ。
- Actions確認: [run 39175545041](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/39175545041)、対象 `ebacc41324f57299c985d7347bf59ef4bdd542d1`。Node22.13.0で286単体・lint・型・両build・GUI全工程成功。2026-10-19 08:14:12〜08:20:26 JST、Chromium/WebKit既存6条件120検証・エラー0。[106画面・6trace・診断](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/39175545041/artifacts/12154676326)のZIP SHA256をAPI digestと照合、provenanceのexpected/配信SHA・branch/runを確認。7日保持。最終追記では長い変数名/結果が画面内へ入る撮影位置を追加し、最終SHAは[PR Checks](https://github.com/tetsujisugimori-coder/calculator-memo/pull/26/checks)で再確認する。
- local GUI補足: Chromium4条件79検証成功、WebKitはOSライブラリ不足で起動失敗。ActionsをWebKit検証の根拠とする。git CLI認証なしのため公式connectorで同一treeを照合して作業branchを公開した。
- 関連: [Issue #25](https://github.com/tetsujisugimori-coder/calculator-memo/issues/25)、基点mainでPR #24のmergeを確認。[PR #26](https://github.com/tetsujisugimori-coder/calculator-memo/pull/26)。依頼でPR #25と呼んだ機能は実採番ではIssue #25 / PR #26。予定の表示設定は次工程（番号未確定）で今回未実装。
- 未解決事項: Issue #19、変数等と%混在、科学記数法、他アプリへのscope交換は対象外。iPhone Safari実機は未検証。既存chunkサイズ警告は残る。ローカル/tmp容量不足は余裕ある作業領域で依存導入をやり直し解消。江戸弁ガイドは参照済み、辞典の直接参照は256KiB上限で失敗したため2026-10-18更新ローカル写し冒頭を参照（最新同一性は未確認）。


## 2026-10-19 (JST): AST検証と一回評価を分離
- 変更内容: 全ASTの許可検証後、後順の子値Mapを再利用する評価器へ最小変更。数値演算は既存mathjsの固定許可関数を使用し、本番の計測コード・依存追加・UI/保存schema変更はない。
- 従来方針 / 変更理由 / 新方針: 検証済み各ノードのnode.evaluateは子孫も再計算していた。31項加算は991実行、31括弧は528実行を実測。一度評価へ整理し、それぞれ61/32実行へ削減した。構文の全体検証を先に終え、左→右の数値エラー順序を維持する。
- 第一希望 / 採用判断: mathjsの既存数値意味を保った小さい内部整理を第一希望として実現。汎用フレームワーク化、結果キャッシュ、新エンジンは不要と判断し採用しない。制約による暫定仕様は追加しない。
- 検証結果: cloud Node24.19.0で245単体、lint、型検査、通常/Pages build成功。旧1000式を含む2029式比較で内部値(Object.is、-0含む)・表示・エラー文の差分0。長さ2000/深度32/ノード256/指数絶対値10000境界、全構文検証優先、非有限中間値拒否、最終のみ最大安全値を回帰追加。[再現手順と性能実測](docs/agent/ast-evaluation.md)。31項加算の1式中央値0.350→0.148msはこの環境での参考値。
- 独立レビュー: 独立生成11,078式（成功8,559/拒否2,519、seed79037）の旧新差分0、245単体成功、blocking指摘なし。最終SHAのActionsと既存6条件GUIはPR Checksで別途確認予定であり、未実行を成功扱いしない。
- Actions確認: [run 39163728584](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/39163728584)、対象 `26053f792e8b992e84b2d0a0eeea6f9b2a7e4151`。Node22.13.0で245単体・lint・型・両build・GUI全工程成功。2026-10-19 05:33:41〜05:38:37 JST、Chromium/WebKit既存6条件102検証・エラー0。[88画面・6trace・診断](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/39163728584/artifacts/12150350848)のZIP SHA256をAPI digestと照合、provenanceのhead/expected/配信SHA・branch/runを確認。7日保持。この結果追記コミット自身は[PR #24 Checks](https://github.com/tetsujisugimori-coder/calculator-memo/pull/24/checks)で別途最終確認する。
- local GUI補足: 同一treeのlocal commitでChromium4条件67検証成功、WebKitは既知のOSライブラリ不足で起動失敗。上記ActionsをWebKit検証の証拠とする。通常git push認証が利用できず、公式GitHub connectorで同一treeを検証して作業branchへ公開した。
- 関連: [Issue #23](https://github.com/tetsujisugimori-coder/calculator-memo/issues/23)。[PR #24](https://github.com/tetsujisugimori-coder/calculator-memo/pull/24)。基点main `6f835985e7e53d2f58c89d15bac04352b3bbc5bd` でPR #22のマージを確認。
- 未解決事項: Issue #19、新数学構文と%混在、科学記数法は対象外のまま。実機iPhone Safari、OSキーボード、長期保存は未検証。既存buildのchunkサイズ警告は残存。江戸弁ガイド現行箇所と辞典v19冒頭を参照し、割合ノルマは設けない。


## 2026-10-18 (JST): 基本数学関数を安全な共通評価経路へ追加
- 変更内容: mathjs既存parser/evaluationを維持し、累乗・sqrt/abs・pi/eを明示AST許可。通常電卓へ折畳み式入力欄、^の継続/編集を追加。履歴・単独メモ・計算ブロック・保存・URLは共通評価器を使用し保存形式を変更しない。
- 理由・境界: 将来の関数電卓/数学文書の基礎を小規模独立PRで整える。`2^3^2=512`、`-2^2=-4`、`(-2)^2=4`。結果からの^は負値を括弧化する。数値の表示丸めを計算/保存へ流用しない。
- 従来方針 / 変更理由 / 新方針: 数字・四則・括弧・%の文字検証だけから、新しい名前を安全に扱う必要があるため、限定文字列＋mathjs AST全体検証へ進める。代入/任意関数/変数/非数値を拒否し、正規化前長さ2000/深度32/ノード256/指数絶対値10000、各中間有限実数/最終既存最大安全値に制限。数値だけの旧暗黙乗算は維持、新構文は明示*を要求。過大式・非有限中間値の新拒否をREADMEに明記。
- 第一希望 / 制約 / 採用策: 将来は関数結果・累乗と%も一貫して扱いたいが、旧置換は`sqrt(100)%`を誤算させる。Issue #19と評価器全面改修は今回対象外のため、新構文と%の混在を明示拒否し、既存%変換そのものは変更しない。後続の後置%構文対応で見直す。CE/±の末尾数値契約も維持し、閉括弧/定数への限界を説明。
- 検証結果: cloud Node24.19.0で228単体・lint・型検査・通常/Pages build成功。ローカルChromium4条件67検証成功。ローカルWebKitはOSライブラリ不足で起動失敗し、下記Actionsで代替検証した。新単体は仕様/安全性/資源制限/旧%/編集/内部精度/履歴/両メモ/保存/URLを対象。GUI既存6条件へ新数学シナリオを追加する。
- 関連: [Issue #21](https://github.com/tetsujisugimori-coder/calculator-memo/issues/21)。[PR #22](https://github.com/tetsujisugimori-coder/calculator-memo/pull/22)。基点main `6754813bad54a917bd111e0931de4adce016c54d`でPR #20マージを確認。
- Actions確認: [39133495835](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/39133495835)、head `4002c5083085c3773b35e6e7d527772077373e95`、Node22.13.0で228単体・lint・型・両build・GUI全工程成功。2026-10-18 22:54:38〜22:59:31 JST、Playwright1.56.1 / Chromium141.0.7390.37 / WebKit26.0 の既存6条件102検証・エラー0、mobile4条件各228touchを確認。[88画面・6trace・診断](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/39133495835/artifacts/12139191810)を取得しZIP SHA256・provenanceのhead/配信SHA/branch/run一致を照合。成果物は7日保持。この結果追記コミット自身のCIは[PR #22 Checks](https://github.com/tetsujisugimori-coder/calculator-memo/pull/22/checks)で別途確認し、前SHAの成功を流用しない。
- 独立レビュー: 実装と最終help文差分にblocking指摘なし。独立228単体、旧main比1000の四則/括弧/%合成式差分0、極端入力と禁止ASTの拒否を再確認。任意のinput maxLength案は貼付け式の黙った切断を避け不採用、共通評価器で全入力を明示拒否する。GUIで発見した旧「累乗・関数未対応」の説明2か所を現仕様へ訂正した。
- 公開方法: 通常git pushは認証が利用できず失敗。同repoの公式GitHubコネクタでmainを親に同一treeをcommitし作業枝を公開、fetch後にローカルtree一致を確認。認証・権限設定は変更しない。
- 未解決事項: Issue #19、実機iPhone Safari/OSキーボード/長期保存、新関数と%混在、関数パレット・三角/対数/階乗・グラフ等。Memo-Nexus側変更なし。依存警告は別件。
- 参照: AGENTS/関連docs/README/LOG/コード/Actions/既存Issueを確認。江戸弁ガイドの現行方針と辞典v19冒頭を参照（辞典全読ではない）。software-engineering skillは親の取得時package unavailable。利用者PCを使用せずcloud/隔離Actionsで検証する。

## 2026-10-18 19:33 (JST): PR20の元文字列オフセットを追加確認（不具合再現なし）
- 基点: PR #20 head `1b40bfea68c4ccab3d5fa3b7dea7de59cea9ebff`、最新main `f6ae38a972575858db7236ad1a9846a61ec16e88`を再確認。cloud既存checkoutの全tree `4cc32e301254ea2a7560eba5e4aceeff12884b40`とremote headのtreeが一致。AGENTS・README・関連docs・workflow・Issue #19・PR #20を読んだ。
- 変更内容/理由: 指定6式について元文字列の負号位置・抽出start/text・±・CEの期待値を固定した回帰を追加。[期待＝実測の全6式表と位置の根拠](docs/agent/calculator-state-audit.md#pr-20-マージ前追加確認-元文字列の位置2026-10-18-jst)を記録。改行例は実改行を使用。元文字列の位置不整合は未変更実装で再現せず、アプリ修正は行わない。正規化後の添字流用やrefactorなし。
- 検証結果: cloud Node24.19.0で132単体（既存126＋追加6）・lint・型・通常/Pages buildがすべて成功。既存chunk-size/proxy/vinext分類警告は残る。独立エージェントがソースと6式の期待値を照合し阻害指摘なし。人間の独立レビュー完了とは扱わない。
- GUI影響判断: アプリ/レイアウト/状態処理は無変更で、新規GUI操作の追加は不要。既存Chromium/WebKit全6条件・78検証を最終remote SHAのActionsで再実行する。現在は新SHAのCI未実行、結果は[PR #20 Checks](https://github.com/tetsujisugimori-coder/calculator-memo/pull/20/checks)および追記コメントで確認する。過去SHAの成功を流用しない。
- 関連/範囲: [PR #20](https://github.com/tetsujisugimori-coder/calculator-memo/pull/20)、[Issue #18](https://github.com/tetsujisugimori-coder/calculator-memo/issues/18)。評価器/%変換、[Issue #19](https://github.com/tetsujisugimori-coder/calculator-memo/issues/19)、PR20既存の状態遷移・小さい結果の十進展開・保存形式・workflow・依存は変更なし。新規PR・main push・マージ・deployなし。既存作業枝へ追記し独立レビュー待ちで停止する。
- 制約: 既存snapshotはGit remote/認証を持たないため、既存公式GitHubコネクタで基点headを親にcommitし同じ枝へ非強制更新する。権限/認証の変更や制限回避なし。実機Safari/OSキーボード/native文字拡大/長期保存と既存依存警告は引き続き未検証・残存。



## 2026-10-18 17:40 (JST): 計算状態の境界を調査し小さい結果の継続・輸入式の訂正を修正
- 基点: PR #17は17:31:52 JSTにマージ済み。最新main `f6ae38a972575858db7236ad1a9846a61ec16e88` と83blobのGit SHAを照合してcloud作業snapshotを作成。AGENTS・README・関連docs・workflow・LOG・Issue/PRを確認。
- 変更内容: 確定結果の継続用文字列を表示丸めなしの十進表記へ展開。URL式の末尾空白/Unicode負号を末尾数値の検出・±/CEにも反映する。PR13のboolean・元式編集・共通入力遷移・メモ無効化は維持。
- 変更理由: `1/10000000=`の後`*2=`は`1e-7*2`が許可文字違反、演算子BS後の±は`1e--7`になる。`12 * - 34 ` / `12 × − 34 `は評価できるのに編集時の数値/符号を誤認した。修正前の指数回帰14件中10件失敗、修正後成功。
- 設計判断: 数値結果の文字列だけを展開する最小変更を採用。表示値を再利用する丸め、評価器へ指数構文を追加する案、全面状態機械化は不要。有限・最大安全値の制約と保存形式を維持。状態表・境界・理由は[調査記録](docs/agent/calculator-state-audit.md)へ記載。
- 検証結果: cloud Node24.19.0で126単体・lint・型・通常/Pages build成功。独立数値探索10,021有限値で変換同値、許容範囲5,454件でmathjs評価同値。−0・正負極小・正負指数・最大安全値・非有限/範囲外の拒否も確認。GUIに小さい正負結果継続、URL訂正、括弧エラー復帰、単純括弧%、履歴/メモpayloadと再読込を追加。最初のローカルGUIは既存ブラウザcache未指定で起動失敗したため成功扱いせず、既存cacheを明示して再実行中。最終remote SHAのGUI/CIはまだ未確認。
- 関連: [Issue #18](https://github.com/tetsujisugimori-coder/calculator-memo/issues/18)。[PR #20](https://github.com/tetsujisugimori-coder/calculator-memo/pull/20)。独立レビューはblocking指摘なし。追加1,080組のUnicode/空白/演算子組合せで数値位置・CE・符号反転を確認。指摘により−MIN_VALUEの永続回帰と%直前空白の検出を補強した。
- 未解決事項: ネスト括弧の%は既存の評価器変換の問題で、計算ブロック・メモ保存にも影響するため[Issue #19](https://github.com/tetsujisugimori-coder/calculator-memo/issues/19)へ別件化。再現/期待/影響と分離理由を記録し、解決済みとは扱わない。実機Safari・OSキーボード/native text zoom・長期保存、依存警告は残る。レイアウト・保存形式・workflow・依存変更なし。
- CI実測: head `9d39a0cd3b18728cbeb36f30a680c16c5ed417be` の[39112512860](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/39112512860)は126単体/lint/型/通常・Pages build/全GUI成功。17:44:41〜17:48:19 JST、Chromium141.0.7390.37/WebKit26.0の6条件78検証、mobile各187tap、エラー0。[58画面・6trace・ログ](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/39112512860/artifacts/12130169627)のZIP SHA256 `e4eee343626b35c104b6d4262024d0d18e6c59a5d7a684bdc1fcb48a0913da71` と配信SHAを照合（7日保持）。sticky全12測定も28px。ローカルはChromium4条件の暫定snapshot操作を確認したが再buildとの同時進行があり最終SHA証明には使用せず、WebKitはlibgtk等の不足で起動未実施。上記Actionsで全6条件を実証した。
- 証拠の補強: 初回WebKitの追加full-page画像にはスクロール位置によりsticky headerが画像途中へ描画された。UI/CSS変更による退行とは断定せず、追加2場面だけ撮影前に上端へ戻しscrollY0と既存header包含検査を行う。既存sticky stressは変更しない。この記録/撮影補強後の最終SHA全CIは[PR #20 Checks](https://github.com/tetsujisugimori-coder/calculator-memo/pull/20/checks)で再確認する。
- 環境と参照: 工程ガイドは参照済み。江戸弁ガイド/辞典の指定Library参照は可視性エラーで本文未確認、作業継続。既存GitHubコネクタで同repo・基点commitを親にする公開を利用し、認証/権限は変更しない。破壊的操作・main push・マージ・公開deployなし。




## 2026-10-18 16:51 (JST): PR17レビュー判定を訂正し可変ヘッダーとsticky位置を同期
- 訂正する判断: 下の初回記録とPR/Issueで721px・文字200%時の重なりを受入外の残件として扱い、採用を推奨したが、基点比較が不足していた。独立再比較により今回導入した退行と確定し、採用推奨を撤回して修正を継続した。
- 比較根拠: 同じCSS-only stressの721/800px・200%・scrollY250で、基点mainはheader下端76px/電卓上端104px（28px間隔）、初回案はheader下端154px/電卓上端104px（50px被覆）。mainのガイド/ブランド上端欠けは別の既存問題であり、新しい電卓被覆を既存扱いできない。
- 変更内容・判断: headerのborder-box実高をResizeObserverでapp-shellのCSS変数に同期し、電卓sticky topを実高+28pxとする。縮小・幅変更・文字サイズ変更にも追従し、cleanupでobserver解除。mobileのstatic配置、計算/保存stateは変更しない。固定幅条件を増やす案やsticky機能の全面解除より、既存挙動を維持する最小限のUI測定を選んだ。
- 回帰検証: 実アプリの721/800/1365px、文字200%→100%、scrollY250と上端復帰をChromium/WebKitハーネスへ追加。テスト専用workspace高2000pxでsticky親終端を分離し、スクロール後の間隔28px±1を検査して縮小追従も保証する。font/fixture/viewportはfinallyで復帰。721px拡大・復帰画像とstickyGeometryを保存。ネイティブ文字ズーム/実機Safariの検証とは区別する。
- 失敗検出: 新回帰を修正前のPages成果物へ実行すると間隔−64pxで失敗し、退行を実際に検出した。先のCSS-only比較50pxとの差は実アプリの書体/line-height等の条件差であり、期待値を緩めて解消しない。
- 検証結果: 追加修正のcloud91単体・lint・型・通常/Pages build成功。実アプリの独立Chromium確認では721/800px・200%のheader168px/電卓top196px、100%復帰時76px/104px、1365px・200%時108px/136pxと、全て28px間隔を確認。375/390への往復でもmobile static・CSS変数の追従・横overflowなし・JSエラー0。Observerのcleanupと計算state非干渉、回帰の縮小追従検査も独立レビューし阻害指摘なし。追加修正前のCI39108553790成功を今回の成功に流用しない。最終SHAの[PR #17 Checks](https://github.com/tetsujisugimori-coder/calculator-memo/pull/17/checks)を別途確認する。
- 追加修正CI: head `8dbb5c935eecb5d0f0a5fef6bfd2df48bb45bacb` の[39109312309](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/39109312309)は91単体・lint・型・両build・GUI全工程成功。Chromium/WebKitの6条件66検証、46画面・6trace、エラー0。WebKitでも721/800px・200%の184px/212px、100%復帰76px/104pxと28px間隔を確認。[成果物](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/39109312309/artifacts/12130405002)のSHA256 `fd6c85aa15b6bd3eff15ec3df1dcf9e304337baa68536e1994a30efd090d917d` と配信SHAを照合（7日保持）。この結果記録コミット自身の最終CIはPR Checksで別途確認する。
- 関連: [Issue #16](https://github.com/tetsujisugimori-coder/calculator-memo/issues/16)、[PR #17](https://github.com/tetsujisugimori-coder/calculator-memo/pull/17)。計算ロジック/保存形式/本番workflowは変更なし。実機Safari、OSキーボード、native text zoom、長期保存の限界は残る。マージはしない。

## 2026-10-18 (JST): 狭幅ヘッダーの数式ガイド折返し・上端欠けを修正
- 変更内容: 固定高のヘッダーをmin-height＋内容に応じた高さへ変更し、操作グループを必要時に次行へ回す。ガイド・テーマの縮小を防ぎラベルを一行保持、実selectを含め44pxの操作高を確保する。375px専用の条件は追加しない。計算・保存ロジックと公開workflowは変更しない。
- 変更理由・再現: PR #15は2026-10-18 16:24:27 JSTにマージ済み、main `8ca5c1031f384794c6d7dc4f4f596707e833fa43` を確認。固定64pxとflex縮小が原因。mainのChromium375pxではガイドが2行、320pxではボタン高84.5px・上端−10.75px。PR15最終[CI39104790329](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/39104790329)のWebKit375px画像でも縦折返し・上端欠けを再確認した。今回は旧結果を修正後の成功として流用しない。
- 検証結果: cloud Node24.19.0で91単体・lint・型検査・通常/Pagesビルド成功。Chromium375px touchを既存5条件へ追加し、ヘッダーの文字実寸・領域包含・非重複・hit-test、ガイド検索/分類/スクロール/閉じる、テーマtap/切替/再読込を回帰化。既存計算・編集・履歴・両メモ検証を保持。ローカルChromium4条件は成功。WebKitはlibgtk-4等のOS依存不足で起動できずGUI未実施、公式--with-depsを利用するActionsで確認した。ローカルのGUIは作業snapshotに対する検証であり、remote SHAの検証と区別する。
- 独立レビュー: ソースとハーネスを別担当が照合。テーマlabelだけでなく実selectの44px高、ヘッダー兄弟非重複を補強。通常320/375/390/721/1365pxと文字拡大150/200%の独立CSS-only補助probeではmobile375/390の横overflowなし。受入範囲の阻害指摘なし。初回CI成果物の12画像（Chromium/WebKit375/390のヘッダー・ガイド、desktop、履歴、両メモ）と全headerGeometryを独立再確認し、欠け・重なり・回帰の阻害指摘なし。最終文書SHAのCIは別途確認する。
- 関連 Issue・PR: [Issue #16](https://github.com/tetsujisugimori-coder/calculator-memo/issues/16)。[PR #17](https://github.com/tetsujisugimori-coder/calculator-memo/pull/17)。
- Actions・画像: head `2a036527544d2574cffa1819c925f102126bd7bd` の[CI39108159477](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/39108159477)で91単体/lint/型/通常・Pages build/全GUI成功。2026-10-18 16:35:33〜16:37:26 JST、Chromium141.0.7390.37/WebKit26.0、6条件・64検証記録・ブラウザエラー0、mobile4条件各132tapのtouchstart実配信を確認。[42枚の画面・6trace・全ログ](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/39108159477/artifacts/12129093330)をダウンロードしSHA256と配信headを照合。375/390pxはheader高113pxに自然伸長し、ガイド一行・上端欠けなし、desktopは76px/3カラムを維持。証拠は7日保持。この記録とREADME補足後の最終SHAは[PR #17 Checks](https://github.com/tetsujisugimori-coder/calculator-memo/pull/17/checks)で別途再確認し、初回成功と混同しない。
- 未解決事項: 実機iPhone Safari、ソフトキーボード、Safari UI、safe-area、回転、長期保存は未検証。独立CSS stressで721px・文字200%時の既存desktop電卓sticky top104pxと増高headerの重なりを確認（通常375/390pxの今回受入とは別、ブラウザの実文字ズーム試験ではない）。既存指数表記チェーン制約・依存警告も対象外。
- 環境・参照: AGENTS/関連docs/README/LOG/workflow/Issue/PRを確認。新しいcloud作業snapshotを全83blobのGit SHA照合で復元した。通常git fetchは権限審査タイムアウトのため成功扱いせず、既存のGitHubコネクタで同repoの読取・基点commitを親にする公開を利用する。認証・権限を変更しない。江戸弁ガイド/辞典本文は今回未参照、作業継続。大規模変更・破壊的操作なし。マージは利用者が判断する。

## 2026-10-18 (JST): モバイル WebKit・タッチ回帰検証を追加
- 変更内容: 既存GUIハーネスをChromium desktop 1365px / narrow 390px / mobile 390pxとWebKit mobile 390/375pxへ拡張。mobileはisMobile/hasTouchを有効化し、ボタン・タブをtap、touchstart実配信と横はみ出しを検査。各scenarioのエンジン・実行条件・時刻・画面・traceを区別して記録する。
- 変更理由: 従来390px検証はマウスclickのChromiumであり、WebKitとtouchを確認できていなかった。基点main `0fe78372917793ffccc755f4ac998e7ce4d62260` はPR #13の05:56:48 UTCマージをAPIで確認した。
- 従来の方針 / 新しい方針: Chromium両幅の回帰を共通期待値のまま維持し、従来狭幅のマウス条件も保持した上でmobile/touchとWebKitを必須追加。check名は既存の必須チェック参照を壊さないため保持。public Pagesのworkflow、アプリ、保存形式、依存lockは変更しない。
- 第一希望 / 制約と採用策: iPhone Safari実機での確認が最終的な補完目標。今回は実端末操作環境がなく、再現可能なLinux Actions上のWebKit mobile/touchを採用する。これは実機検証の代替完了ではなく追加証拠である。
- 検証結果: cloud Node 24.19.0で91単体テスト・lint・型検査・通常/Pagesビルド成功。GUIの正確なSHAとActions結果は下記に記録する。ローカルWebKitは必要OSライブラリ不足を検出し、正規の--with-depsが利用できるActionsを最終検証環境とする。独立レビューで既存狭幅条件保持・失敗scenario状態・モーダル内部はみ出し検査を補強した。最初のローカルnpm ciは既定cache `/home/agent/.npm` が利用できず失敗し、作業可能な一時cacheへ切替えた。セキュリティ制限の解除はしていない。
- 関連 Issue・PR: [Issue #14](https://github.com/tetsujisugimori-coder/calculator-memo/issues/14)。[PR #15](https://github.com/tetsujisugimori-coder/calculator-memo/pull/15)。
- 初回CIの失敗と訂正: [39104018483](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/39104018483)、head `d48a8b45fb0bc905e480904c963b1401f498fa7b` は単体・lint・型・両build・ブラウザインストール・Chromium3条件が成功。WebKit26のmaxTouchPoints=0（coarsePointer=true）をテストが誤って未対応と扱い、アプリ操作前に失敗した。pinned PlaywrightはhasTouchをWebKit touch emulationへ渡していることを確認。maxTouchPointsの値はそのまま記録し、各tapのtouchstart実配信を必須にする検証へ訂正する。アプリの計算・保存期待値は変更しない。再検証は下記のCIで成功した。
- Actions再検証: [39104300480](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/39104300480)、head `79ea3ade4623effabf2d91722f11c3d688c9d1fe`、Node22.13.0 / Playwright1.56.1で91単体テスト・lint・型検査・通常/Pagesビルド・GUI全工程成功。2026-10-18 15:32:40〜15:34:00 JSTにChromium141.0.7390.37とWebKit26.0の5条件、48検証記録、エラー0を確認。3つのmobile条件で各126回のtapとtouchstart配信を確認し、配信SHAも一致。[25枚の画面・5本のtrace・ログ](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/39104300480/artifacts/12127866708)は7日保持。成果物をダウンロードしSHA256とprovenanceを照合した。この記録追記後の最終SHAは[PR #15 Checks](https://github.com/tetsujisugimori-coder/calculator-memo/pull/15/checks)で別途再検証する。
- 未解決事項: iPhone Safari実機、ソフトキーボード、Safari UI、セーフエリア、画面回転、長期保存/プライベートモード。既存の指数表記チェーン制約と依存警告は対象外。

## 2026-10-18 (JST): 計算確定後の編集・エラー復帰を統一
- 変更内容: BS/CE/±とキーボード編集を共通の入力遷移へ接続し、編集後のafterEquals・エラー・旧結果を無効化する。両メモ入口は再計算まで無効。保存形式・評価エンジン・Memo-Nexus連携は変更しない。
- 変更理由: main `53a36d5beda76ad04395091a93c1e982c69dcdf9`（PR #11反映済み）では編集後にafterEqualsが残り、数字再入力や表示と内部状態、メモ作成可否が食い違う。
- 仕様と判断: 従来の元式編集を維持する。12+3=15→BS/CE→4→=16、±→=9。未編集なら+2=17。数字/小数点/左括弧は新規式、再＝は同式評価。エラー後の数字等は新規開始、BS/CE/±/演算子は失敗式を訂正する。
- 設計比較: 第一希望は既存の操作意味を保つ最小修正。boolと既存errorを維持し、純粋な遷移関数で共通化した。全面的な状態機械化は変更範囲が大きく不要、確定数値自体の編集は元式編集の意味を変えるため採用しない。状態種類が増えたとき再検討する。
- 検証結果: 再開後のcloud Node 24.19.0で91単体テスト、lint、型検査、通常/Pagesビルド成功。初回[CI 39098914729](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/39098914729)はhead `7cec8cd982419074da98712f215d65a1642b141d`で全工程成功。2026-10-18 13:59:29〜13:59:46 JST、Playwright 1.56.1 / Chromium 141.0.7390.37で1365/390pxの18検証記録・エラー0、配信SHA一致を確認。[スクリーンショット・trace・診断](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/39098914729/artifacts/12126250194)は7日保持。この記録追記後の最終SHA CIは[PR #13 Checks](https://github.com/tetsujisugimori-coder/calculator-memo/pull/13/checks)で別途確認する。単体は正常/境界/異常遷移、GUI追加は両幅の編集・履歴不変・再計算メモpayload・再入力・エラー復帰を対象とする。独立レビューでGUIセレクタ2種類を実UIに合わせて訂正し、blocking指摘なし。
- 関連 Issue・PR: [Issue #12](https://github.com/tetsujisugimori-coder/calculator-memo/issues/12)、[PR #13](https://github.com/tetsujisugimori-coder/calculator-memo/pull/13)。[Issue #10](https://github.com/tetsujisugimori-coder/calculator-memo/issues/10)はPR #11マージ後の受入確認コメントを追記、closed維持。
- 未解決事項: iPhone Safari実機は未検証。指数表記結果の既存チェーン制約、既存依存警告、保護設定、負の対照CI実験は対象外。対話的Cloud Browserの接続成功とは扱わない。
- 再開時の事実: 前回未公開のローカル作業場所が残っていなかったため、同じmainから仕様に沿って再構築・再検証した。GitHubに同目的PR/branchがないことを確認。

## 2026-10-18 (JST): 末尾数値の符号反転・CE・入力中表示を修正
- 変更内容: 二項減算と単項符号を識別する共通の末尾数値抽出を導入し、±・CE・入力中 LCD に適用した。小数点末尾、％、括弧内数値、URL の空白付き単項負数も扱う。評価エンジン・保存形式・レイアウトは変更しない。
- 変更理由: main `d453a9d4eb3b6f12897b3d83e6cdd5724dbba67f` の既存51テストは成功したが、追加回帰例のうち8件が失敗した。`12-34` の±が `1234`、CE が `12` となる数値結合を防ぐため。
- 比較と判断: 四則演算・履歴・メモは既存テストを保持。入力後状態の問題や小画面の全面変更より、再現済みで小さな共通処理に限定できる末尾数値編集を優先した。従来の正規表現は減算記号を符号として扱っていたが、新処理は直前文脈で二項演算子を保持する。
- 検証結果: cloud Node 24.19.0 のローカルで69単体テスト、lint、型検査が成功。通常/Pagesビルドも成功。初回 [CI 39094065581](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/39094065581) は `ef8a7047da9dae592fb70783f8f1611f75367fef` で全工程成功。Chromium 141.0.7390.37 / Playwright 1.56.1 の1365/390pxで14検証記録・エラー0、両幅のスクリーンショットとtraceを取得し、配信成果物のSHAも一致した（2026-10-18 12:34:56〜12:35:06 JST）。成果物はCI内で7日保持。この結果追記コミットのCIは [PR #11 Checks](https://github.com/tetsujisugimori-coder/calculator-memo/pull/11/checks) で別途確認する。GUI に編集/再入力/小数点/キーボード/連続計算/URL受信/履歴の検証を追加した。
- 関連 Issue・PR: [Issue #10](https://github.com/tetsujisugimori-coder/calculator-memo/issues/10)。[PR #11](https://github.com/tetsujisugimori-coder/calculator-memo/pull/11)。
- 未解決事項: 計算確定後のBS/CE/±で afterEquals が残る別問題は今回変更しない。iPhone Safari 実機操作は未実施。既存の依存警告や保護設定、負の対照CI実験も対象外。
- 第一希望と検証環境: 修正ブランチの実ブラウザ検証を行う。既存の隔離 Actions + Chromium を採用し、対話的Cloud Browserのlocalhost到達やiPhone実機を検証したとは扱わない。

## 2026-10-18 (JST): エージェント開発運用と LOG.md 管理規則を導入
- 変更内容: root `AGENTS.md` を作成し、各 PR のログ更新、記録項目、判断変更と暫定策の区別、最新順、履歴保持、参照リンク、PR 前の更新要否確認、行動規則との役割分離を定義した。GitHub 開発運用と検証方針を docs/agent に作成し、Issue・PR・コメント・レビュー・CI・承認境界・人間のマージ後の整理を明文化した。README と GUI 検証手順から接続した。既存 `Log.md` は `LOG.md` に統一し、旧本文を末尾にそのまま保持した。
- 変更理由: 開発履歴・重要な設計判断を継続して追跡できるようにするための依頼に基づく。履歴と現在有効な規則の混同、および大小文字違いの二重管理を防ぐ。
- 検証結果: 作成前に main `bfd0665d4cde2dd5228a9e8f5f8bea734ac2f49d` と open PR 0 件、既存の文書を確認した。旧本文 20,645 bytes の完全保持と、新規文書リンクの解決を確認した。独立レビューで 8 要件・関連運用規則の整合性を確認し、blocking 指摘はなかった。[初回 CI](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/39092388598) は対象 SHA `d794f32992207588a0b72faa3fe269fbfd7dd329` で成功（単体テスト・lint・型検査・通常/Pages ビルド・1365/390px Chromium GUI）。この結果追記後の最終 SHA の CI は [PR #9 の Checks](https://github.com/tetsujisugimori-coder/calculator-memo/pull/9/checks) で別途確認・報告する。ローカルでアプリテストを再実行したとは扱わない。
- 関連 Issue・PR: [Issue #8](https://github.com/tetsujisugimori-coder/calculator-memo/issues/8)。今回の [PR #9](https://github.com/tetsujisugimori-coder/calculator-memo/pull/9)。基点は [PR #7](https://github.com/tetsujisugimori-coder/calculator-memo/pull/7) のマージコミットであり、その過去の検証結果を今回の検証結果として流用しない。
- 未解決事項: 結果追記コミットの CI 結果は、追記時点では未確認であり PR の Checks と最終報告で確認する。旧記録の全主張・日時を再検証したわけではなく、過去の記載として保持する。main へのマージは人間が判断する。
- 従来の方針: 既存 `Log.md` に日付・目的・変更内容・検証・関連コミットを追記する説明があった。root `AGENTS.md` は存在しなかった。
- 変更理由と新しい方針: 上記依頼に従い、証跡は `LOG.md`、行動規則は `AGENTS.md` 等に分離し、以後の記録を最新順に管理する。
- 第一希望: 日付と判断根拠を確認できる履歴を最新順に追えること。
- 制約と採用策: 既存本文には日時不明の初期記録や当時の状態説明が混在するため、推測で日付付与・再配列を行わず旧本文を一括保持する。これは移行時の保全策であり、新規記録を末尾追記する方針ではない。過去の日時・根拠が確認できた場合は出典を付けて新たな記録で補足する。

## 移行前の記録（2026-10-18 に Log.md から内容を保持）
以下は基点コミットの `Log.md` 全文です。内容・並び順を保存しており、新たな検証済み事実や現行規則として再認定していません。移行元: [Log.md at bfd0665](https://github.com/tetsujisugimori-coder/calculator-memo/blob/bfd0665d4cde2dd5228a9e8f5f8bea734ac2f49d/Log.md)。

# Calculation Memo 開発ログ

このファイルは、Calculation Memoで実施した実装、修正、検証、運用上の判断を記録するためのログです。
新しい変更を行った際は、日付、目的、変更内容、検証結果、関連コミットを追記します。

## 現在の状態

- 本番ブランチ: `main`
- GitHub Pages: https://tetsujisugimori-coder.github.io/calculator-memo/
- 公開方式: GitHub ActionsによるVite静的ビルドのデプロイ
- 自動デプロイ条件: `main`へのpush
- 手動デプロイ: `workflow_dispatch`で実行可能
- データ保存先: ブラウザの`localStorage`
- アプリ構成: 通常電卓、計算履歴、計算メモの3カラム

## 初期実装

### 主な機能

- リアル路線の卓上電卓UIを実装した。
- 計算履歴、電卓本体、計算メモの3カラムレイアウトを実装した。
- 四則演算、括弧、小数、符号反転、パーセント計算に対応した。
- キーボード入力と電卓キー操作に対応した。
- 計算式と結果を確認しながら計算できる液晶表示を実装した。
- 計算結果を履歴へ保存し、電卓への復元、コピー、削除、メモ作成を可能にした。
- タイトル、単位、タグ、前提、関連メモ名を持つ計算メモを実装した。
- KaTeXによる数式表示と数式ガイドを実装した。
- ライト、ダーク、自動のテーマ切り替えを実装した。
- ブラウザの`localStorage`へ履歴、メモ、テーマを保存するようにした。
- PC、狭いPC、スマートフォン向けのレスポンシブ表示を実装した。

### 関連コミット

- `6f69b64` — `Build Calculation Memo web app`

## 依存関係の保守

- `mathjs`のセキュリティ対応を反映した。
- `package.json`と`package-lock.json`の整合性を維持した。

### 関連コミット

- `890f0e9` — `Update mathjs security fix`

## 2026-07-23: 初回レビューで見つかった不具合を修正

### モーダルのEscキー競合

- 計算メモ編集画面の上に数式ガイドを開いた状態でEscを押すと、複数のモーダルが同時に閉じる問題を修正した。
- 最前面のモーダルだけがキーボード入力を処理するよう整理した。
- 背景側の計算メモ編集内容が失われないようにした。
- モーダルごとに一意のタイトルIDを割り当て、`aria-labelledby`との対応を維持した。
- モーダルを閉じた後のフォーカス復帰を整備した。

### 保存データ破損時の保護

- `localStorage`の読み込み結果を、正常、データなし、読み込み失敗に区別した。
- JSON破損と未対応データバージョンを内部で区別した。
- データなしの場合だけ空の初期状態で開始するようにした。
- 読み込み失敗時は自動保存を停止し、壊れたデータを空データで上書きしないようにした。
- 利用者へ読み込み失敗を通知するリカバリーバナーを追加した。
- 元データをコピーして退避できるようにした。
- 明示的な確認後にだけ初期化できるようにした。

### パーセント計算の仕様確定

`%`は、直前の数値を100で割る単項演算として扱う仕様に統一した。

| 式 | 結果 |
| --- | ---: |
| `200 + 10%` | `200.1` |
| `200 - 10%` | `199.9` |
| `200 * 10%` | `20` |
| `200 / 10%` | `2000` |
| `10%` | `0.1` |

表示、計算結果、履歴、コピー結果で同じ解釈を使用する。
実機電卓の「200に10%を加えて220」のような相対パーセント計算は採用していない。

### UIとアクセシビリティ

- 計算履歴パネルと計算メモパネルだけに、日本語UI向けゴシック体のフォントスタックを適用した。
- 電卓本体、液晶、キー、ヘッダー、KaTeX数式の書体は変更していない。
- モバイルタブへ`role="tab"`、`aria-selected`、`aria-controls`を設定した。
- 対応するパネルへタブパネル用のroleとIDを設定した。
- ライトモードとダークモードの既存デザインを維持した。
- 3カラム構成とリアル路線の電卓デザインを維持した。

### README

- スターターテンプレートの説明を、Calculation Memo固有の内容へ更新した。
- 通常電卓、計算履歴、計算メモ、KaTeX表示を説明した。
- `%`の仕様と計算例を記載した。
- `localStorage`の利用と、ブラウザデータ削除時の注意を記載した。
- 開発、テスト、lint、ビルドの実行方法を記載した。
- 関数電卓やデータの書き出し・復元は、実装済み機能ではなく今後の候補として分離した。

### 関連コミット

- `56e05ac` — `Fix modal stacking and protect saved data`

## 2026-07-23: GitHub Pages向けの静的ビルドを追加

### 原因

GitHub Pagesがブランチ直下を公開する旧方式になっており、アプリではなくREADMEを基にしたページが表示されていた。
既存の`vinext build`はCloudflare Worker向けの出力であり、GitHub Pagesが必要とする静的な`index.html`を生成しない構成だった。

### 実施内容

- GitHub Pages専用のVite設定`vite.pages.config.ts`を追加した。
- GitHub Pagesのリポジトリ配下でアセットを解決するため、`base`を`/calculator-memo/`に設定した。
- `github-pages/index.html`と`github-pages/main.tsx`を静的SPAのエントリとして追加した。
- 既存の`CalculatorApp`、KaTeX CSS、アプリ共通CSSをPages版でも再利用した。
- Pages版でNext.jsのフォント変数が未定義にならないよう、ローカルフォントのフォールバックを追加した。
- Pages用ビルドコマンド`npm run build:pages`を追加した。
- Pages用出力先を`dist-pages`とし、Gitおよびlintの対象外にした。
- GitHub公式のPages Actionsを利用するデプロイワークフローを追加した。
- `npm ci`で依存関係を導入し、`dist-pages`をartifactとしてデプロイする構成にした。
- Pagesのbuildジョブとdeployジョブを分離し、必要最小限の権限を設定した。
- 同時デプロイの競合を防ぐ`concurrency`設定を追加した。

### 関連コミット

- `7992e77` — `feat: deploy calculator app to GitHub Pages`

### 検証

- `npm run build:pages`: 成功
- `dist-pages/index.html`: 生成確認
- HTML、CSS、JavaScript、KaTeXフォントの参照先が`/calculator-memo/`配下になることを確認
- ビルド成果物内の参照アセット62件について、欠落がないことを確認
- 既存の`npm run build`: 成功
- ローカルブラウザでCalculator Memoが表示されることを確認
- `200 + 10% = 200.1`の計算と履歴追加を確認
- 計算メモ編集画面の表示を確認

## 2026-07-23: GitHub Pagesのデプロイ運用を整備

### 実施内容

- GitHub Pagesの自動デプロイ対象を`main`へのpushだけに限定した。
- GitHub Actions画面からの手動実行用に`workflow_dispatch`を維持した。
- 作業ブランチへのpushやPull Requestの作成・更新だけでは、本番サイトが更新されない構成にした。
- 最初のリモート`main`を、既存履歴の`890f0e9`からforce pushなしで作成した。
- GitHub Pages対応をPull Request経由で`main`へマージした。
- ローカル`main`を`origin/main`へfast-forwardで更新した。

### 関連コミット

- `f356eda` — `ci: deploy GitHub Pages from main only`
- `dfc1d26` — Pull Request #2のマージコミット

### 運用確認

- `main`へのpushを契機に`Deploy GitHub Pages`が起動することを確認した。
- GitHub PagesでCalculator Memo本体が表示されることを確認した。
- 公開画面で電卓、計算履歴、計算メモ、テーマ選択が表示されることを確認した。
- 公開画面のブラウザコンソールに警告・エラーがないことを確認した。

## 2026-07-23: GitHub ActionsをNode.js 24対応版へ更新

### 実施内容

- `actions/configure-pages`を`v5`から`v6`へ更新した。
- `actions/upload-pages-artifact`を`v4`から`v5`へ更新した。
- `actions/deploy-pages`を`v4`から`v5`へ更新した。
- GitHub公式の安定版を使用し、JavaScript Actionの実行ランタイムをNode.js 24対応へ移行した。
- 警告を隠すための`FORCE_JAVASCRIPT_ACTIONS_TO_NODE24`は追加していない。
- アプリ本体、ビルド設定、`main`限定のデプロイ条件、Pages環境設定は変更していない。

### マージとローカル更新

- Pull Request #3を`main`へマージした。
- マージコミットは`defaab544f8f48efec0584a92269bd97b442f748`。
- ローカル`main`を`dfc1d26fb8ee28c5b99927a9e93acba79610908c`からマージコミットへfast-forwardで更新した。
- 更新後の`HEAD`、ローカル`main`、`origin/main`が同じマージコミットを指すことを確認した。
- マージされた差分が`.github/workflows/deploy-pages.yml`と`Log.md`だけであり、アプリ本体やビルド設定などに想定外の変更がないことを確認した。

### GitHub Actionsと公開確認

- `main`へのpushを契機に`Deploy GitHub Pages`が実行された。
- 対象コミットが`defaab544f8f48efec0584a92269bd97b442f748`であることを確認した。
- buildジョブ、deployジョブ、ワークフロー全体、Pages deploymentはいずれも成功した。
- 実行ログで`actions/configure-pages@v6`、`actions/upload-pages-artifact@v5`、`actions/deploy-pages@v5`が使用されたことを確認した。
- 以前表示されていたNode.js 20廃止警告が解消されたことを確認した。
- 公開URLでCalculator Memoが正常に読み込まれることを確認した。
- 電卓、計算履歴、計算メモ、テーマ選択、3カラムレイアウトが表示され、明らかな崩れや横方向のオーバーフローがないことを確認した。
- JavaScriptとCSSが`/calculator-memo/assets/`配下から読み込まれ、ブラウザコンソールに警告やエラーがないことを確認した。

### 残存する警告

Node.js 20廃止警告とジョブエラーは解消したが、Actionsログには次の非致命的な警告が残っている。

- `@esbuild-kit/esm-loader`と`@esbuild-kit/core-utils`のdeprecated警告
- Viteが出力するJavaScriptチャンクサイズ警告
- `actions/deploy-pages@v5`の実行時に出力されるNode.jsの`punycode`モジュール非推奨警告

これらは今回のbuild、deploy、公開画面の動作を失敗させていない。依存関係や公式Action側の更新状況を確認しながら、必要に応じて別の保守作業として対応する。

### 関連情報

- `7b502f5` — `ci: update GitHub Pages actions to Node.js 24`
- `defaab5` — Pull Request #3のマージコミット
- Pull Request #3: https://github.com/tetsujisugimori-coder/calculator-memo/pull/3
- Actions実行: https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/29969668264
- 公開URL: https://tetsujisugimori-coder.github.io/calculator-memo/

## テストと検証の記録

現在の自動テストは次の3ファイルで構成されている。

- `tests/calculator.test.ts`
- `tests/format-copy.test.ts`
- `tests/storage.test.ts`

直近の検証結果:

- Vitest: 3ファイル、33テスト成功
- ESLint: 成功
- TypeScript型チェック: 成功
- vinextビルド: 成功
- GitHub Pages用Viteビルド: 成功
- GitHub Pages公開画面: 表示確認済み

## 保留中・今後の候補

### 機能候補

- 関数電卓
- 計算履歴、計算メモのドロワー化を含む将来レイアウト
- JSONなどによるデータの書き出し・復元
- iCloudやOneDriveなどとの同期

これらは現時点では確定機能ではない。

### 技術上の注意

- Pages用JavaScriptには500KBを超えるチャンク警告がある。現在は動作上の問題になっていないため、公開対応と分離して検討する。
- `localStorage`を削除すると、保存した履歴やメモが失われる可能性がある。
- GitHub Pagesの本番デプロイは`main`へのpushでのみ自動実行する。

## 今後の追記形式

```md
## YYYY-MM-DD: 変更の概要

### 目的

- 変更が必要になった理由

### 実施内容

- 変更した内容

### 検証

- 実行したコマンドと結果

### 関連情報

- コミットID、Pull Request、Issue、公開URLなど

### 残件

- 未完了または次回検討する内容
```

## 2026-07-23: プレーン計算メモへ数式・計算ブロックを追加

### 目的

- 通常の文章、表示専用数式、評価可能な計算式を1つの計算メモ内で混在できるようにする。
- 複数の式や途中計算を、順序を保ったまま編集・保存・再表示できるようにする。
- PR #4で追加したMarkdown／KaTeX本文と既存保存データの互換性を維持する。

### 実施内容

- プレーン計算メモへ、文章、数式、計算の3種類の本文ブロックを追加した。
- 文章ブロックはMarkdown入力とプレビューを使用する。
- 数式ブロックは既存KaTeXレンダラーを再利用し、計算結果を生成しない表示専用ブロックとした。
- 計算ブロックは通常電卓と同じ計算エンジンを使用し、入力時に式、表示式、結果、エラーをブロック単位で更新する。
- 不正な計算式を含むブロックも保存可能とし、他の正常な文章・数式・計算ブロックへ影響しない構造にした。
- 各ブロックの追加、編集、削除、上移動、下移動に対応した。
- ブロックの種類、内容、順序、計算結果、エラーを`blocks`配列へ保存するようにした。
- Markdown互換の`content`を引き続き保存し、ブロック導入前のプレーン計算メモは既存本文を1つの文章ブロックとして編集できるようにした。
- 読み込んだ`blocks`が部分的に壊れている場合は採用せず、既存`content`へフォールバックするようにした。
- 数式ガイドへ「数式ブロック」と「計算ブロック」を追加し、入力例、実表示、用途、利用可能な演算、非対応記法を記載した。
- PCとモバイル向けにブロック編集、操作ボタン、ガイド例のレスポンシブ表示を追加した。

### 検証

- `npm test`: 4ファイル、43テスト成功
- `npm run lint`: 成功
- `npx tsc --noEmit`: 成功
- `npm run build`: 成功
- `npm run build:pages`: 成功（既存のJavaScriptチャンクサイズ警告のみ）
- 文章1件、数式2件、計算2件を1つのメモへ追加し、削除と上下移動を確認した。
- `200*(5%+5%) = 20`と不正式`2+`を同時に保存し、正常結果と局所エラーが互いに影響しないことを確認した。
- 保存後の再読み込みで、数式ブロック2件、計算ブロック2件、順序、結果、エラーが復元されることを確認した。
- 旧形式のMarkdown本文を文章ブロックへ変換するテストと、不正な任意ブロック配列から既存本文へフォールバックするテストを追加した。
- 390px幅でモーダルの横あふれがなく、追加ボタン44px、並べ替え・削除ボタン40pxの高さを確認した。
- 数式ガイドの両ブロック例がPCと390px幅で表示されることを確認した。
- ブラウザのエラーオーバーレイとコンソールエラーがないことを確認した。

### 関連情報

- Pull Request #4: https://github.com/tetsujisugimori-coder/calculator-memo/pull/4
- 本変更はPR #4の既存作業ブランチへ追加コミットとして反映する。

### 残件

- ドラッグ＆ドロップによる並べ替えは未実装。現在はキーボード操作可能な上移動・下移動ボタンを使用する。
- Memo Nexusとの直接連携、共通パッケージ化、表・画像・Mermaid対応は別作業とする。

## 2026-07-23: 計算メモ種別の表示名と新規作成動線を整理

### 目的

- 複数ブロック型を正式な「計算メモ」とし、「計算メモ」を選ぶと複数の計算式を追加できる状態にする。
- 従来の単一式型は、1つの電卓結果を保存する機能だと分かる「単独計算メモ」へ表示名を変更する。
- データ移行を行わず、既存のtype値と保存データを維持する。

### 新旧メモ種別の対応

| 保存上のtype | 以前の表示名 | 新しい表示名 | 用途 |
| --- | --- | --- | --- |
| `plain-calculation` | プレーン計算メモ | 計算メモ | 文章・数式・計算ブロックを複数保持 |
| `calculation` | 計算メモ | 単独計算メモ | 電卓の1つの式と結果を保持 |

### 実施内容

- メモ種別の表示名を共通定義へ集約した。
- 新規作成メニューの先頭へ「計算メモ」を配置し、計算結果の有無にかかわらずブロックエディタを開けるようにした。
- 「単独計算メモ」は電卓で結果を確定した場合だけ作成可能とした。
- 電卓内の作成ボタンと計算履歴のメモ作成ボタンを「単独計算メモ」へ変更した。
- 編集モーダル、メモ一覧の種別バッジ、詳細表示の種別バッジ、保存・更新通知を新しい名称へ統一した。
- 空状態で、計算メモは複数ブロック型、単独計算メモは電卓結果用であることを説明した。
- 数式ガイドで、数式ブロックと計算ブロックが「計算メモ」で使用できることを明記した。
- READMEの機能説明と保存typeの対応関係を更新した。

### 互換性

- `type: "plain-calculation"`と`type: "calculation"`は変更していない。
- トップレベルの保存データバージョン`1`、既存フィールド、ブロック構造も変更していない。
- 今回の変更に伴うデータ移行は行わない。

### 検証

- `npm run lint`: 成功
- `npx tsc --noEmit`: 成功
- `npm test`: 5ファイル、45テスト成功
- `npm run build`: 成功（既存のチャンクサイズ警告のみ）
- `npm run build:pages`: 成功（既存のチャンクサイズ警告のみ）
- 新規作成メニューの「計算メモ」からブロックエディタが開くことを確認した。
- 文章1件、数式1件、計算2件を混在させ、`2+3 = 5`と`10*4 = 40`を保存できることを確認した。
- 再読み込み後も両メモ種別、ブロックの種類・順序・内容・計算結果が復元されることを確認した。
- 従来型の`8*7 = 56`を「単独計算メモ」として作成し、編集・保存・再読み込みできることを確認した。
- カード、詳細、編集モーダル、通知、空状態、数式ガイドの表示名が一致することを確認した。
- ブラウザのエラーオーバーレイとコンソールエラーがないことを確認した。

### 関連情報

- Pull Request #4: https://github.com/tetsujisugimori-coder/calculator-memo/pull/4

## 2026-07-25: Memo Nexusからの計算式受け取り

- URLの`expr`クエリパラメータを`URLSearchParams`で読み取り、初回表示時に既存の計算式stateへ設定する一方向連携を追加した。
- 受け取った式は自動計算せず、結果と履歴も作らない。日本語や未対応記号を含む値も文字列として表示し、既存の計算操作時に従来のエラー処理へ渡す。
- 極端に長い値は2,000文字へ制限し、URL読取処理を`lib/url-expression.ts`へ分離した。
- `npm test`は既存回帰を含む全51件、`npm run lint`、`npx tsc --noEmit`、`npm run build:pages`、`git diff --check`が成功した。Pagesビルドには既存のチャンクサイズ警告だけが出た。
- ブラウザで`expr=2 * (5 + 3)`が入力中の式として表示され、起動直後は結果`0`のまま履歴を追加せず、「=」を押すと既存仕様どおり`16`になること、ダークテーマでの表示、コンソールerror 0件を確認した。接続ブラウザの幅変更が反映されず実画面での3幅比較は未実施。
