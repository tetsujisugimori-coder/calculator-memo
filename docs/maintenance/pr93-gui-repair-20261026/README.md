# PR #93 GUI受入阻害の修復・検証（2026-10-26 JST）

## 範囲と着手確認

[Issue #92](https://github.com/tetsujisugimori-coder/calculator-memo/issues/92) / [Draft PR #93](https://github.com/tetsujisugimori-coder/calculator-memo/pull/93) を継続する。横超過とWebKit390遅延を別々に診断し、証拠に対応する最小修正だけを行う。比較判定・builder・保存形式・計算エンジン・本文・snapshot・確認履歴は変更対象外。マージ、auto-merge、main push、公開は行わない。

2026-10-26 15:28 JST のGitHub/APIおよび `git fetch origin main feat/audit-comparison-markdown-export` 後:

- main: `2a91599fa8454e097d2eca3a5d552f115da68819`。
- 対象branch: `feat/audit-comparison-markdown-export`、local/remote HEAD `5cbaf6f74ae15d7afccb73f50c64c0ce0380756c`、tree `e447f4b8dfcd3008aa90c81e05c440c381be5d76`。
- 着手時作業ツリーclean。既存PR91 worktreeを保全。Issue92 open、PR93 open/Draft/未マージ。並行PR80/71は対象外で変更しない。
- AGENTS、GitHub運用、検証方針、GUI手順、比較出力設計と独立レビュー、README、LOGの関連記録を確認。

## 失敗基準の再照合

[run 40261949353 attempt 1](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/40261949353) は `cancelled`。単体2008/契約37/lint/型/通常・Pages build成功はこの旧HEADの事実であり、今回変更後へ流用しない。

[artifact 12625379653](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/40261949353/artifacts/12625379653) の実ZIP SHA-256 `87ca9c6869e3210a48bda53bbfe2ae08bbcfddfe04f71aaa38564186f744fd4c` を再計算しAPI digestと一致。29,679,135 bytes。provenanceのHEAD/run/attempt/served identityを照合した。[集約した原観測](baseline-ci.json)を保持する。原ZIP/trace/PNGを改変しない。

- GUI 770/912、geometry487/562、PNG99/114、失敗trace1。
- Chromium touch390: 32検査/27geometryで既存出典確認200%横超過。modal scroll390/client388、子段落372/352。失敗画像とtraceを再読。
- WebKit390: 130検査/84geometryで未完。WebKit375は153検査/95geometry完走。
- quotes stage: WebKit390 717.9秒、375 391.9秒。`timings.input` の186件は **tap/click activation** であり、文字入力やReact更新そのものの所要時間ではない。集計461.6/203.7秒から入力処理の根因を断定しない。旧stageは引用関数の後に実行する点検保存・固定点検記録・2時点比較も含むため、引用単機能の所要時間とも断定しない。今回の診断ではサブ段階を分離する。
- スクリーンショットの総時間は390 26.6秒 / 375 28.0秒。今回の旧観測では差が小さいが、一般に描画負荷がないことの証明ではない。

## 判定の原則

同条件のREDとGREEN、実アプリ操作と最小DOM対照、ローカル診断と正式6条件CIを区別する。正式6条件912以上/geometry562/PNG114/成功trace0、3worker、DPRと画面幅、30分job、期待値を維持する。実機Safari、VoiceOver、OS文字拡大・背景化は未検証。原因未確定はUNKNOWNとし、途中成功だけで受入PASSとしない。

## 現在状態

局所修正・全量ローカル検証・独立ソースレビュー済み。最終HEADの正式CIと成果物照合は未完了で、総合受入判定は保留。結果は以下の追記とPR/Issueの最終HEADチェックへ記録する。

## 単独実ブラウザ診断の中間結果

同じ修正前Pages build / WebKit26.0を用い、既存 `exerciseFormulaQuotes` 全体の13確認・76実tapを実行。正式旧quotes stageの186tap合算とは範囲が異なる。

| 単独条件 | 結果 | 関数wall時間 | activation合計 |
| --- | --- | ---: | ---: |
| WebKit touch390 DPR3 | 13確認/76tap成功、pageerror0 | 356.07秒 | 225.81秒 |
| WebKit touch375 DPR2 | 13確認/76tap成功、pageerror0 | 196.22秒 | 88.83秒 |

幅・高さ・DPRが異なるため、この差だけでは原因を確定しない。入力の大半は `locator.tap` 内で、touch確認pollの寄与は小さいという途中観測がある。React専用の処理時間は未分離。詳細カテゴリ/反復/A-B対照は別診断文書へ記録する。

2件の別A/B準備経路は末尾close操作の10秒actionability待機で失敗し、対照には未到達。旧fullquotesで成功した経路の成功へ置換せず、その失敗traceを保持する。正式close検査・timeoutは変更しない。具体的なactionability原因はUNKNOWN。

旧buildを `/tmp/pr93-baseline-dist-5cbaf6f/` へコピーし、全file SHA-256 manifestを保持。以降の製品buildと診断buildを混同しない。

## 生成CSSの由来に関する独立確認

識別段落だけの修正後buildでも、CSS asset hashは旧 `8b86a4b0…` から `137bf021…` へ変わった。Tailwindの自動検出が今回の診断資料中の `backdrop-filter` 語を候補とし、未使用の同名utilityと9個の `--tw-backdrop-*` 登録/初期値を追加したためである。独立差分確認では既存 `.modal-backdrop` の直接 `blur(3px)` 規則は不変、アプリ側に当該utility class使用はない。機能阻害の証拠はないが、全称custom-property初期化を完全に無影響と断定しない。

今回の原因対照は同一の保全build内で行う。旧buildと修正buildの時間差を、識別段落1行修正だけの性能効果と帰属しない。無関係なTailwind全体設定の変更は行わず、最終成果物hashと実GUIを別途照合する。

実アプリRED用の当作業生成一時script `gui-evidence/overflow-scenario.mjs` は、原stack traceの実行時pathをそのまま保持し、後に `/tmp/pr93-overflow-diagnostic-source/overflow-scenario.mjs` へ移した。移動前後SHA-256 `85f914048347fa1bf7dc74dbc18eb192937670a8681c1d673b010179de75e3ab` が一致。診断用に切り出した未使用関数が通常lintへ混入しないための所在整理であり、失敗証拠・既存試験・期待値の削除ではない。再実行用の小さなfixture/scriptは本ディレクトリに保持する。

## 候補版の全量ローカル検証

[local-validation.json](local-validation.json) にコマンド・単調時間・終了code・source/build SHA-256を記録。単体2011/2011（旧2008＋新3、87files、worker2）、lint/型/通常・Pages build成功。契約39中38成功、既存100ms Node起動fixture1失敗を保持する。ローカルNode24.22.1と正式CIのpinned22.13.0は別環境であり、同39件の最終HEAD CI成功はまだ確認していない。

CSS後のcandidate assets: JS `7306c56f8fe4abd53943f2c7d9de26fd35f16525f1a710dc5337241d75253cfd`、CSS `ee46801777c05830802bd0c59afdc6f0a1da860b84331a436308df244adda962`。前のtext-nodeだけの48局所GUIと、この後の重複filter修正込みの検証を区別する。

## 最終CSS候補のnative回帰

[overflow-final-native-summary.json](overflow-final-native-summary.json): 6条件×2ID×両テーマ×文字100/200%の48 layout成功、12 fixtureのsingle→nested→source→nested→single 60 phase成功、pageerror0。全文・44px・focus・保存bytes不変。旧CSSのnested filter省略期待は文字100%でも失敗するnegative controlを保持。独立担当は実操作を代行したのではなく、全48/60証拠とviewport矩形・SHAを独立照合した。正式6条件全シナリオの代替ではない。
