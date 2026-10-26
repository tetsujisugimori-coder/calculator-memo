# PR #93 GUI修復の独立レビュー

## 担当と範囲

2026-10-26 JST。製品の横超過修正担当・計測担当とは別のレビュー担当が確認する。基準HEADは `5cbaf6f74ae15d7afccb73f50c64c0ce0380756c`。本記録は途中の観測も保持し、変更後の確認結果を追記する。

現時点ではソース・試験契約・既存成果物の読解であり、独立担当自身の実ブラウザ再実行や正式CI成功を意味しない。最終製品差分と正式CI結果が出るまでは受入判定を保留する。

## 基準証拠の独立照合

旧run `40261949353` attempt `1` のローカル実ZIPを再計算: 29,679,135 bytes、SHA-256 `87ca9c6869e3210a48bda53bbfe2ae08bbcfddfe04f71aaa38564186f744fd4c`。提供されたAPI digestと一致。展開済み6条件のserved identityはすべて基準HEAD/run/attemptと一致。

独立集計は770検査・487geometry・99PNG・失敗trace1。Chromium touch390はfailed、WebKit390はrunningのままであり、全GUI成功ではない。旧成果物の数字を修正後の成功へ読み替えない。

## 初期ソースレビュー（15:33 JST）

- 6条件/DPR/幅、既存912検査、562geometry、114代表PNG、成功trace非保存、3worker、単一30分jobの定義を確認。途中の計測差分ではこれらを変更していない。
- activation計測は既存 `locator.tap()` / `locator.click()` とtouchstart増分確認を保持。新しいperformance.now採取は出力用で、入力・待機・判定の置換ではない。
- プロセス観測はLinux `/proc` のdriverを根とする可視子孫を追跡。user/system clock tickを秒へ推測変換しない。RSS合計を固有メモリや全ブラウザ使用量と断定しない。
- この段階で保存処理、比較判定、Markdown builder、engine/schema/snapshot/確認履歴への差分はない。

### 指摘と処置待ち

| 重要度 | 指摘 | 必要な対応 | 状態 |
| --- | --- | --- | --- |
| P3 | `/proc` のVmRSSがない場合0へ変換すると未取得と実測ゼロを混同する | nullを保持し、契約でも有限数/欠測を明示的に区別する | 計測担当へ連絡済み・再確認待ち |
| P3 | 同期/proc観測と増加するJSONのpersistは計測自体の負荷を加える | 計測コストを観測または限界として明示し、製品処理時間へ誤帰属しない | 計測担当へ連絡済み・再確認待ち |

新規のP0〜P2を初期計測差分からは確認していない。ただし横超過修正のRED/GREEN、WebKit遅延因果・正式完走は未確認であり、元の阻害事項が解消したという結論ではない。

## 実アプリRED・局所修正の再レビュー（15:37 JST）

実装担当の `gui-evidence/overflow-before-exact/provenance.json` と同一期待値の単体REDログを独立に読んだ。current HEAD `5cbaf6f...` / local / attempt1 の実アプリに対して、既存横超過assertがmodal390/388・子P372/352で失敗している。診断で過去のUUIDを固定した経路であり、正式GUIのランダムUUID経路の結果ではない。この区別を維持する。

`FormulaDifferenceSources.tsx` の差分は差分ID・元引用ID・登録式IDの同一全文を1つのtemplate literalとして渡す変更のみ。既存全角空白・文字列の順序を保ち、Reactによるtext node分割を避ける。CSS、hidden、横スクロール、ID切捨ては導入していない。取得や判定、保存、履歴、snapshot、builderへの変更はない。原因に対応した最小修正として妥当と判断するが、修正後のnative geometryと正式CIはまだ別途必要。

追加単体3件は通常ID・長いUnicode/結合文字/全角空白・Markdown風文字とLF/CRLFを、全文一致/1text node/入力非変更/再取得callback非発火で検査する。修正前は3件とも1node期待に対する6nodeで失敗したログを確認した。jsdomのnode構造検査をnative幅測定と混同しない。

P3再確認: VmRSS欠測はnullへ修正され、契約でも有限数と欠測を明示的に区別。`observationDurationMs` と `persistDurationMs` が追加され、stage時間内の観測負荷を記録できる。両P3のソース対応を確認した。動的ブラウザ子孫捕捉、観測負荷実測は計測担当の結果待ちであり、契約テストのroot process観測だけから保証しない。

## 局所native検査スクリプトのレビュー（15:42 JST）

`overflow-fixture.ts` は既存の引用/追跡差分builderを再利用する合成データだけを作り、計算根拠の新しい判定を実装しない。`overflow-native.mjs` は新しいcontextへfixtureをseedした後は実tap/click/keyboardでアプリを開閉する。CSS文字倍率とテーマを診断条件として設定し、入力のDOM直接書換えは行わない。全文一致・保存JSON不変・44px操作・Escape/フォーカス復帰を検査する。6条件×2 ID fixtures×2テーマ×2文字倍率の48組は正式912検査の代替ではない。

独立担当からのP3補強提案として、空のscenario選択が成功扱いになる経路の拒否と、外枠のviewport/document/body/dialog寸法検査追加を依頼。実装担当が反映し、従来の `+1px` 境界を緩めていないことを確認した。Native実行結果はまだ未確認。

この時点のソースSHA-256:
- `components/FormulaDifferenceSources.tsx`: `612211c4c5f55adff8b7d4edb24dd7aa60110c2e3f586423054e42dbf21e7b80`
- `e2e/scenario.mjs`: `1161b2e9bc11c515411e4163342122660efb95963ac7cfe3ed3146c6d29230fc`
- `e2e/runtime-resources.mjs`: `acb586e5b82782f413c3aee81fcbc04f1434603f339ee4e0bc58e0aa67cdbdac`
- `overflow-native.mjs`: `ecf5cd658f279f7b9c60a696760a104d75d7ffc689714411185cbe85ba1e491d`

`git diff --check` は成功。これは静的差分検査であり、GUI/CIの実行ではない。

## WebKit単独診断traceの独立分析（16:01 JST）

計測担当が実行した `/tmp/pr93-timing-baseline390-r1.json.trace.zip` の `trace.trace` を、独立担当が `before/after/log` の実記録時刻だけから解析した。ブラウザ再実行ではなく既存traceの独立読解である。引用単独シナリオ76tapを対象とし、旧正式CIのquotes＋後続3機能の186tapとは仕事量が異なる。

| locator.tap 内の区間 | 全76件合計 |
| --- | ---: |
| call start→end | 210.135秒 |
| visible/enabled/stable待機開始→成立 | 186.991秒（全体の約89.0%） |
| scrolling into view→done | 0.628秒 |
| performing tap→tap done | 13.785秒 |
| scheduled navigation待機 | 0.047秒 |

actionability区間の中央値は2.130秒。例: `call@3405` の「根拠2の本文へ移動」は5.905秒中4.954秒、`call@3485` の「根拠1の詳細」は5.572秒中5.360秒がこの区間だった。余りはselector解決/記録/dispatch準備等であり、上表だけで全内訳を捏造しない。

この観測ではscrollやnavigation完了待ちが主な遅延ではなく、要素解決後のactionability成立待ちが支配的だった。ただしPlaywrightログはvisible/enabled/stableをひとまとめにしているため、内部のどのチェックが時間を使ったか、描画・CPU・CSS・フレーム配送の根因までは確定できない。`force`等で安全待機を飛ばす修正は認めない。

## 修正後の独立単体とnative証拠読解（16:04 JST）

独立担当が `npx --no-install vitest run tests/formula-difference-source-layout.test.ts` を実行し、同じ3件が全成功、失敗/skip0、Vitest 5.03秒（process 8.18秒）。実装担当のGREENとは別の実行ログ `/tmp/pr93-independent-layout-test.log` を保持。

実装担当の `/tmp/pr93-overflow-native-green/results.json` は6条件×2fixtures×2テーマ×2文字倍率=48組、status passed、pageerror合計0であることを独立集計した。source SHA-256は上記 `612211c4...` と一致。修正後served JSは `index-pyvqzGKu.js` / `53e4df16395dfb2e362c6d7358b13d83a2e245dc11e3a6f9b5c69c0f33e8c61c`、CSSは `index-BaMopeiA.css` / `137bf021506b6fedd572ffc642628bafd9e3034c87ccef2d79fa93d0954078f0`。provenanceのgit HEADは未commit基準SHAであり、修正後buildはasset/source hashで区別する。これは独立担当自身のnative再操作ではなく、担当の実測証拠の読解である。

## pinned Playwrightのactionability実装読解

インストール済み `playwright-core` **1.56.1** を変更せず確認した。
- `lib/server/dom.js:339–345`: traceに現れるvisible/enabled/stable待機開始・成立ログの間で、injected `checkElementStates` をawaitする。
- `lib/generated/injectedScriptSource.js` の `checkElementStates` はstable検査を先にawaitし、続いてvisible/enabledを確認する。
- 同 `_checkElementIsStable` はrequestAnimationFrameで矩形を採取し、次callbackの同一矩形でstable counterを進める。矩形が変化した場合はfalseで外側retryへ返す。
- `lib/server/webkit/wkPage.js:870` のstable countはLinuxで1（Windowsのみ5）。`lib/server/chromium/crPage.js:252` も1。Linuxでは最初の矩形と次の同一矩形という2つのcallbackが必要である。
- 当該76tap traceではnot stable/not visible/not enabled/retrying tapのログを確認しなかった。矩形移動の繰返しが主因という証拠はない。

フレームcallback配送・utility評価等の遅延は候補として残るが、このコード読解だけではWebKitレンダラーやblurの因果を特定しない。依存コードの変更、force入力、安定性待機の省略は行っていない。

## 同context対照traceの独立集計（16:08 JST）

`/tmp/pr93-fixed-paired390-r1.json.trace.zip` の40tapをJSONの40activationと順序照合し、4bootstrap＋18 trial×2tapの区間を一致させた。

| 条件 | trial数 | trial wall中央値 | 2tap actionability中央値 | 実tap処理中央値 |
| --- | ---: | ---: | ---: | ---: |
| baseline | 9 | 3.226秒 | 2.627秒 | 0.056秒 |
| no-blur | 3 | 1.177秒 | 0.658秒 | 0.060秒 |
| nested-only | 6 | 3.252秒 | 2.614秒 | 0.057秒 |

差はactionability区間に集中した。nested-onlyの改善証拠はなく、全blur除去は1block/3trialの対照である。これは診断用CSS差替えの観測であり、正式検査のCSSを変更した結果や広域の製品修正を承認するものではない。

## 生成CSSの差分確認

旧 `index-CmODrOnu.css` と新 `index-BaMopeiA.css` を独立比較。追加はTailwindの `.backdrop-filter` utility、9個の `--tw-backdrop-*` property登録と全称初期値で、既存 `.modal-backdrop` の直接blur指定は不変。新しい診断資料内のtokenをauto-discoveryが拾ったという説明と整合する。app/components/tests/e2eで当該utilityをclass指定するソースは確認しなかった。

P3の不要生成CSS増分として記録する。機能阻害の証拠はないが、全称初期化の性能影響を完全ゼロと証明したわけではない。同一buildのAB比較を守り、旧buildとの差を1段落修正の性能効果へ帰属させない。今回広域Tailwind設定変更は提案しない。

## 事前計画9試行matrixと製品候補の審査（16:26 JST）

`/tmp/pr93-fixed-matrix-plan.json` の事前順序（baseline/no-blur/stack-no-blur/no-blur/stack-no-blur/baseline/stack-no-blur/baseline/no-blur）と実際の9出力を独立照合。同じ診断script hash `adf8deaf...`、fixture hash `ace26622...`、immutable旧buildを使用。baselineは3/3、stack-no-blurは3/3が各16tap（4setup＋3往復×4tap）成功。全blur除去は1/3成功・2/3がgoto時点timeout、0tapであり、これを除外して全案成功とはしない。

baseline9往復wall中央値5.546秒、stack-no-blur9往復2.186秒。各6traceを独立解析したところ、4tap合計のactionability中央値は4.265秒→0.941秒、実tap処理0.133秒→0.105秒。computed style記録はbaseline3層全てblur(3px)、stack-no-blur3層全てnoneで計画通り。保存JSON一致、入替時旧結果失効、明示再比較後の変更/内部値/理由不明の期待値も維持されている。

この証拠は「多層モーダルの装飾blurが対象native操作のactionability遅延に寄与する」という局所因果を支持する。全WebKitの遅延、goto timeout、CI30分未完の根因をすべて確定したものではない。

候補CSSは、入れ子モーダルがある間だけ祖先・子モーダルの装飾blurを外し、単独モーダルのblurと全backdropの暗色/固定配置/z-indexを維持するもの。保存/比較/DOMイベントを触らず、状態管理追加も不要で、観測に対応する最小案として条件付きで妥当と判断した。ただしfilter除去はcontaining-block作用も変えるため、全6条件geometry、入れ子開閉後の単独blur復帰、focus/keyboardを必ず検証する。fixed＋z-indexによるstacking contextは残る。正式CIの全量成功は引き続き必要。

## 候補製品・正式GUI差分の再レビュー（16:32 JST）

実装されたCSSは3行追加のみ。入れ子祖先と子のfilterをnoneにし、単独filter、背景色、固定配置、z-index、イベント/保存処理は不変更。JSでモーダル状態を二重管理しない。

正式GUIは既存libraryの削除→取消の2activationを再利用し、single/nested/単独復帰のfilter、固定/z-index、viewport、44px touch target、focus復帰、保存JSON不変を検査する。既存の式表示assertと後続実削除も残り、入力回数1101は不変。1検査×6条件を追加し918（旧912＋6）、geometry562、PNG114、成功trace0、3worker、30分は維持。旧CSSはnestedのnone期待で失敗する契約だが、実際のRED/GREENと最終CIを別途確認する。

確認範囲で新規P0〜P2指摘なし。診断scriptのFunction生成は信頼したリポジトリ内既存試験関数を明示bindingsで呼び出すものであり、製品へ追加されない。lint無効化や本試験の期待値削除は確認しなかった。`git diff --check` 成功。

候補hash:
- globals.css `61919536e52db6c3180ceb8865f2659bc71f508232e316494f227cda91916ff4`
- FormulaDifferenceSources.tsx `612211c4c5f55adff8b7d4edb24dd7aa60110c2e3f586423054e42dbf21e7b80`
- scenario.mjs `05e53fa8466aebb6ee882e1db1399681e0294e264b12c09f0fa0cf71cf039bca`
- ci-contract.mjs `bf757f62dd80f22e7caa3379819683f9ab58f6384d25dcb1d421a57c73e808c5`

最終HEADと成果物の対応、正式CI全量成功は未確認のまま維持する。

## 最終CSS版native証拠の独立照合（16:48 JST）

検証担当の `/tmp/pr93-overflow-final-green/results.json` を再読し、48 layout cases、60 backdrop phase checks（5経路×12fixture）、pageerror 0を確認した。全backdrop rectangleを各scenarioのwidth/height±1pxと独立照合し、違反0。Chromium touch390・正確な旧ID・文字200%では両テーマともmodal 388/388、段落352/352であり、修正前390/388・372/352と区別できる。これは保存証拠の独立読解であり、レビュー担当自身によるnative再操作ではない。

5経路は単独library blur→report入れ子none→source三層none→source閉鎖二層none→library単独blur/focus復帰。旧CSSのnegative control `/tmp/pr93-overflow-css-red/results.json` は100%時の入れ子none期待で失敗した。旧CSS試験はlayout実行前に停止したためlayout成功証拠には数えない。

最終nativeのserved assets:
- JS `index-DVc8aHr-.js`: `7306c56f8fe4abd53943f2c7d9de26fd35f16525f1a710dc5337241d75253cfd`
- CSS `index-CbF8FLsK.css`: `ee46801777c05830802bd0c59afdc6f0a1da860b84331a436308df244adda962`

未commit候補のためgit provenanceは旧HEADのままで、working source hashとserved asset hashを別記している。これを最終HEADの正式CIと称してはならない。正式scenarioのviewport検査には水平・垂直両軸が追加済みで、現在のhashは `d0858f07e6f24a423f986802e8dc9a9657c13f3fbfaa6ad90ce802ce2f74ef90`（上記16:32版からの追補）。正式918/562/114/trace0の全量CIとdigest照合は未確認。新たなP0〜P2指摘は本レビュー範囲ではないが、正式GUI受入判定は保留する。

## 製品修正後WebKit390 traceの独立分解（16:51 JST）

CSS overrideなしの実製品候補 `/tmp/pr93-timing-candidate390-r1.json.trace.zip` と同じ76tapのbaseline traceを同一解析で比較した。両側76件すべてに各ログ区間があり、tap呼出合計210.135→134.861秒、visible/enabled/stable合計186.991→116.103秒（中央値2.130→1.195秒）、scroll合計0.628→0.489秒、実tap13.785→10.139秒、navigation0.047→0.053秒。解析記録 `/tmp/pr93-independent-candidate390-breakdown.json`。

対象quoteシナリオ13検査成功・wall356.074→269.203秒という担当実測と改善方向は整合する。ただしactionability待機は依然存在し、旧CIの186activation集約区間とも範囲が異なる。この局所結果だけで全WebKit遅延の原因確定・30分完走・正式GUI成功とは判断しない。

## 製品修正後WebKit375の失敗保持・文書freeze（16:54 JST）

`/tmp/pr93-timing-candidate375-r1.json` を独立再読。2026-10-26T07:50:26.074Z開始、07:50:50.133Z終了、status failed。最初のgotoは終了したが、fixture準備中の `page.reload` がload待機10000ms上限で失敗（単調時計16379.156→26431.294ms）。events/checksはともに空であり、0/76 activation・0/13 quote検査。pageerror配列が空でも成功ではない。

375の修正後操作時間は未取得として扱い、390の改善で代替しない。原因UNKNOWN、失敗JSON/traceを保持し、再試行成功だけへの置換はしない。正式6条件CIは次の受入ゲートであり、現時点の全体PASS/マージ推奨YESは不可。本独立レビュー文書はここでfreezeし、最終HEAD CI・成果物の後続監査は別の追跡結果として親担当へ報告する。

## 正式CI第1回成果物の独立監査（17:26 JST）

承認された文書追記として、run `40289595913` attempt `1`、実装HEAD `4c30fd663839c30daa297bdefa480100086379d0` の成果物を監査した。ZIP `/tmp/pr93-repair-40289595913.zip` の実SHA-256を再計算し、`4f6634ee472ced4335a793c5429e3370201041855681c3629a2e8031ffd33ba7`、37,678,740 bytesで担当が取得したAPI digest/sizeと一致。API応答自体の取得は親担当、実ZIP再計算と展開内容照合は本レビュー担当が行った。

6条件のprovenance全件でstatus passed、errors 0、SHA/branch/run/attemptとbrowserが取得したservedIdentityが一致。検査数はdesktop153、non-touch390 152、touch390 153、touch375 153、WebKit390 153、WebKit375 154、合計918。geometry checkpointは合計562、実PNG114、trace ZIP0。旧912に追加6件で、既存geometry/PNG件数は維持。全6条件が成功した実CIであり、ローカル診断の代替判定ではない。

unit.logは87 files・2011 tests成功、ci-contract.logは39成功/0失敗/0skip。ci-outcomes.jsonのunit/lint/types/normal_build/pages_build/guiを含む全段階success、failedStages空。3worker契約をroot provenanceで確認。GUI単調時計durationは1102.896秒（18分22.896秒）、08:05:32.917Z〜08:23:55.813Z。これはGUI処理時間であり、job全体の時間と混同しない。

この実装HEADについて正式GUI受入数値は満たされた。今後の文書確定commitは別HEADとなるため、最終HEADのCI再実行と成果物照合を引き続き必要とする。実機Safari/VoiceOver/実OS文字拡大は未検証。375局所reload失敗や旧CI失敗を削除・修正済みへの言い換えはしない。本監査範囲で新規P0〜P2指摘なし。
