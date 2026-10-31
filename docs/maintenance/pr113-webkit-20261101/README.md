# PR #113 WebKit 390px 正式未完走の調査（2026-11-01 JST）

対象は Issue #112 / Draft PR #113。開始時のlocal/origin/PR HEADは
`94e657b311740a1ae5803fe008c969a598c43969`、tree
`583fc0771b08a1cd2a5cb1c90ab164f5a7b47857`、mainは
`2549c8c15d9a5e4cea052eabc0020ad03104b49a`。作業ツリーcleanを確認した。
総合PARTIAL・マージ推奨NOから開始し、新しいHEADへ旧成功を継承しない。

## 旧証拠の保全と取消理由の訂正

旧run [41217834472 attempt1](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/41217834472) の
6成果物ZIP（計71,224,548 bytes）をconsumerのWindows workspace内へ複製し、GitHub APIの
サイズ・SHA-256と一致、ZIP CRCと全内部ファイルのサイズ・SHA-256を確認した。
全6 jobの取得可能なログ、run/jobs/check-run/annotations/同branchのrun一覧も保存した。
取得・保全日時、出典、HEAD、attempt、保持期限、全内部ファイル一覧は
`old-evidence-manifest.json.gz`。初回ダウンロードの正確な時刻が記録されていなかったものは
推定せずnullとし、今回の再検証・保全日時を別に記録した。

正式job `124586042954` は16:04:15Z開始、16:34:33Z終了、conclusion cancelled。
check annotationに **The job has exceeded the maximum execution time of 30m0s** がある。
GUI開始16:08:29Z、最後の成功16:34:05Z、取消ログ16:34:28Z。
取消時刻に新しい同branch runはない。従来のログだけによる「直接理由UNKNOWN」を、
今回取得したAPI注記に基づき「30分job上限超過」と訂正する。
これはWebKit遅延の根因の証明とは別である。

旧結果は5/6、1108/1128 checks、584/592 geometry、130/132 PNG。
WK390はsaved-record-comparisonで168/188、90/98、20/22のまま終了。
gui-timing.jsonは欠落、gui-resources.logは0 bytes、未完走contextのtrace exportもない。
これらを補完したことにはしない。旧成果物URL・digest・期限はmanifestを参照。

## 有限診断計画（実行前に固定）

1. A：基準94e657bのWebKit390をUbuntu24.04 / Node22.13.0 / 同lockfile / PW1.56.1で
   1 workerとして一度実行。全prefix、全assertion、全geometry/PNG条件を原本のまま使用する。
   最大20分、job30分、開始から27分で診断を打ち切り証拠保存時間を確保する。
2. Aがtarget開始まで到達した場合だけ、その保存fixtureを後続対照へ使用する。
   必要なfocused対照はPR WK390 / PR WK375 / PR Chromium390 / main WK390各一回、各150秒上限。
   fresh contextとfull prefixの差は明示し、未取得fixtureを推定で補わない。
3. E：既存正式並列runを資源・時間配分の対照として保持する。
   追加の正式実行が発生した場合もすべて保存し、成功だけを選別しない。

診断Aでは基準94の正式scenario.mjsと検査基準を変更しない。診断用copyをTypeScript ASTで生成し、
Node側の指定関数のawaitだけを開始・終了・エラー計測で包む。
browserへ渡すcallbackなどの入れ子関数は変換しない。原本hash・派生hash・計測箇所表を保持する。
各行にはUTC/monotonic時刻、親操作、直前checkpoint、待機式、stage、browser/page状態がある。
計測の同期I/O時間・追加async/microtaskの影響を認め、診断値を原本と同等とは断定しない。
target開始時に保存raw・draft入力・選択・dialog/details・viewport・DOM数も取得する。
入力のselection範囲、focus、select選択、aria選択状態、page/modalのscrollも取得する。
React内部の取得世代は公開DOMから観測できなければNOT_OBSERVABLEとする。
成功時も診断traceを保存する。強制終了時に未出力のtrace等があれば欠落として記録する。

提出前Windowsのharness起動確認（Node24.20 / Chromium390 / 旧引用の合成seed）は
focused15checks、約31秒、exit0。Ubuntu比較結果・正式受入ではない。
診断専用4契約（派生構文、browser callback不変、既存assert/timeout保持、source drift拒否）はPASS。
既存2480単体・57契約へ置換や削減はない。

## 判定境界

この段階では製品を変更しない。正式6条件1128/592/132、保存保護、終了上限は維持する。
原因を確認できた場合だけ最小修正を行い、最終HEADの全CI・成果物と独立レビューで再判定する。
旧Space短間隔2失敗UNKNOWN、実機Safari/VoiceOver/OS文字拡大/softkeyboardはNOT_TESTED。
Draft・未マージを維持し、Issue105へ投稿しない。

## Aの実測と有限対照

[A run41250143451 attempt1](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/41250143451)、
job124681755718はsuccess。application94/tree583fc07、診断code
`af47b42a80e5f31171d565d4a8502a6eb0732145`、Ubuntu24.04/Node22.13.0/PW1.56.1/WK26.0、
390x844/DPR3。原本source bytesはGit基準94と一致した。
**588.859秒、188/188 checks、98/98 geometry、22/22 PNG、1337 touch、errors0**、
正常exit0・打切りなし・Linux process group消失確認。

保存記録比較は49.948秒。70tapの観測dispatchは36.287秒、geometryチェック6件0.789秒、
再読込3件0.813秒、fixture投入観測0.027秒。親・子操作のinclusive時間を加算してwall時間にしない。
全体1337操作の既存dispatch時計は361.574秒、median0.236秒。
6903 begin/endは全対応し、pending/errorなし。emit同期I/O計0.549秒は総観測負荷ではない。
source/derived copy・fixture raw・start画面・全operation時刻・traceを保全した。

旧取消runの共通完了49stage/1232操作にそろえるとdispatch1022.779秒、Aは318.760秒。
しかしhost/時刻・並列度・観測追加が同時に違うので、資源競合やWebKit内部原因の確定とはしない。
次の有限focused A2/B/C/Dは、Aの13,969文字の実rawと一致するfixtureだけを使う。
fresh contextとfull prefixの差を明示し、mainにないpreviewの受入へ流用しない。

A artifact [13060862890](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/41250143451/artifacts/13060862890)、
26,168,717 bytes、SHA256 `5f4e1339310fc3bcfb71aae86be3c26699af28dc51e24af4fffbb1147b78a7ef`、
保持2026-11-07T23:04:56Z。完全ZIP/CRC・全22PNG decode/CRCを確認した。
job-outcomes.stepsはstep id未設定により空だった。APIのsuccessと原本・全操作を別途確認し、
後続workflowには明示idを付けた。欠けたstep詳細を補完したことにはしない。

## 同HEAD正式Eで確認した別の試験誤検出

[E run41250143381 attempt1](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/41250143381)、
正式job124681756018はexit1 failure。新しいcancelではない。WK390は188/98/22/1337を
約1039秒で完走し、desktopだけ引用元表示で31checks/29geometryまでで失敗した。
合計971/1128 checks、521/592 geometry、通常115/132 PNG＋failure1。
独立5jobsはsuccess、単体2480・既存57契約・lint/type/両buildも成功だが、この正式FAILを相殺しない。

直接原因は `source` dialog全体への `not.toContainText("999")` が、
**取得日時2026-10-31T22:57:30.999Z** のmetadataに一致したこと。
Received文字列の999はそこだけで、当時内部結果・実使用内部値は-0だった。
picker/sourceは単一BlockInfoへ、comparisonは両側のBlockInfoを含む単一差分regionへ
値の否定検査を限定する。picker/sourceの-0正判定も同じ値領域へ限定し、日時による偽成功も防ぐ。
製品・表示・保存データ・正式6条件・1128/592/132・期待する歴史値は変更しない。

試験側の固定日時probeでpicker2回/source/comparison全4ケースについて、
旧whole-dialog判定RED→値領域判定GREENを確認した。比較のbefore=-0/after=12をそれぞれ
999へ変える負対照は両方rejectし、restore後再びGREEN。現在raw不変、app set/remove/clear各0。
最初のprobeと両側へ補強したprobeの結果を両方保持する。これはWindows提出前確認で、
最終HEADのUbuntu quote独立jobでも再実行する。

E artifact [13061008972](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/41250143381/artifacts/13061008972)、
40,410,670 bytes、SHA256 `cd2b8645e3d375f0ea1b22a25d78459f3d14b19556c9b1e4de7f2668f2cd5a1c`、
保持2026-11-07T23:13:41Z。全6ZIPと全6jobログ、failure trace/PNG/geometry/タイミングを保全した。
A/E計7 ZIPと7 jobログの出典・サイズ・全内部file SHA256・再検証日時は
`a-e-evidence-manifest.json.gz`。正確な初回transport完了時刻が未記録だったものはnullとし、
local assemblyのfilesystem時刻と今回の保全確認日時を別に残した。後生成の分析と原本も分けている。
EのWK390 dispatchは687.081秒、median0.466秒。旧取消run/A/Eで変動しており、
desktop早期失敗による負荷履歴の差もあるため、「並列なら必ず未完走」とは判断しない。

## CI責務分割の評価案は保留

3runner/各1worker・shared Pages build digest・共通27/30分clock・132PNG実体集計の案を
ローカルで評価したが、**未commit・未push**で保留した。正式EでもWK390が完走し、
資源競合の因果や分割の必要性は未確定だからである。予算安定化案が唯一必要とも記さない。
評価用コード・23gate契約・旧review・byte/hash manifestはconsumer workspaceの
`webkit-investigation-20261101/proposed-ci-split/`へ保全し、提出候補から除いた。
この評価の成功を製品・正式CIの受入に数えない。

今回提出する最小候補は、確認済み日時oracleの値領域補正、固定日時probe、Aの実fixtureによる
有限focused A2/B/C/Dだけである。正式smoke/scenario-config/coverage契約と元3worker/30分は保持し、
正式scenarioの変更は上記3箇所の負判定と関連する-0正判定のscope補正に限定する。
既存2480単体・57契約、6条件/1128checks/592geometry/132PNGを削減しない。

Windows提出前は診断AST4契約PASS、既存正式46は37pass/9Linux実行経路失敗、
固定日時probe4ケースの旧RED/補正GREEN/誤値負対照（比較両側）成功。
評価案の追加34契約実行は33pass/1Linux-only skipだが、現候補の正式契約へ混ぜない。
YAML parse・lint・各構文も確認する。最終HEADで旧構成の正式6条件と全独立GUIを一度実行し、
terminal・成果物digest/PNG実体・保存保護・独立レビューまで確認する。
旧成功の自動継承も、成功だけを選別する無根拠な反復も行わない。

実測と直接原因、構成案保留は[PRコメント6550609404](https://github.com/tetsujisugimori-coder/calculator-memo/pull/113#issuecomment-6550609404)へ投稿し、
PR本文にも同じ根拠を反映した。最終HEAD・最終CIはこのcommit自身のChecksと後続最終報告で確認し、
ここでは受入成功を先取りしない。
