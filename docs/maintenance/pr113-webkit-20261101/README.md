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

正式scenario.mjsと検査基準は変更しない。診断用copyをTypeScript ASTで生成し、
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
