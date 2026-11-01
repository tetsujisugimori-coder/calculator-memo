# PR #113 WebKit調査・最小候補の独立prepushレビュー

2026-11-01 JST。実装担当とは別の `independent_review` 担当による提出前レビュー。対象は `af47b42a80e5f31171d565d4a8502a6eb0732145` への作業差分のうち、確認済みの日時oracle補正、独立timestamp probe、A fixtureを使用する有限4対照、記録更新である。**CI責務分割は保留し、この候補に含めない。**

**最小候補の最終prepushコードレビュー判定：未解決の阻害P1/P2指摘なし。** quote独立jobへのprobe追加とREADME/LOGの実scope更新まで確認した。commit/push後の最終HEAD CI・artifact・正式受入は未確認であり、総合PASS・マージ推奨YESの判定ではない。本担当はソースと保存済み証拠を独立に読み、GUIを再実行したり製品コードを編集したりしていない。

## 分割案の保留と正式契約

EのWK390完走もあるため、資源競合の根因や分割の必要性を確定したことにはしない。前回の分割案レビューと全提案ファイルはconsumer taskの `webkit-investigation-20261101/proposed-ci-split` に保全され、preservation.jsonの全10ファイルについてsize/hash一致を独立確認した。以前のprepushレビューは保留案へのコード評価であり、採用・正式受入の根拠として流用しない。

六つのformal分割moduleが候補から除かれたことを確認した。既存正式workflow本体、scenario-config、smoke、ci-contractと既存46契約の原本に分割による変更はない。正式6条件/1128検査/592geometry/132PNG/3workers/30分を維持し、gate23契約や保留案の34契約結果を正式受入へ数えない。製品・保存処理・形式・依存lockも今回の最小候補では変更しない。

## 直接原因が確認できた日時oracle補正

並列E run41250143381/job124681756018/artifact13061008972の完全ZIP40,410,670 bytes、SHA256 `cd2b8645e3d375f0ea1b22a25d78459f3d14b19556c9b1e4de7f2668f2cd5a1c`、全CRC正常を独立に再確認した。desktopのReceived文字列にある999は取得日時 `2026-10-31T22:57:30.999Z` の1箇所だけで、当時内部結果・実使用内部値は-0、当時式にも999はなかった。全dialog否定によるmetadata衝突を製品の値混入と区別できる。

正式scenarioの補正は次の値範囲だけで、期待する歴史値とcheck名・件数、操作順・geometry・PNG・touch・timeoutを変えない。

- pickerの-0正判定と999負判定を、選択した単一BlockInfo `.evidence-block-values` へ限定する。
- sourceの-0正判定と999負判定も単一BlockInfoへ限定する。quote-result識別は引き続きdialog内で検査する。
- comparisonは引用時・比較先の両BlockInfoを含む単一 `differences()` regionへ999負判定を限定する。両側の-0/12等の正判定は維持する。

この補正は計算値oracleの意味を保持し、日時・識別子による偽陽性と日時内-0による偽成功を避けるものとして妥当。comparisonで複数BlockInfoを単一locator扱いするstrict-mode問題も避けている。

`timestamp-oracle-windows-both-sides/result.json` とsupervisorを独立読戻しした。固定`.999Z`のpicker2回/source/comparison全4場面で旧whole-dialog判定RED、新scope判定GREEN。実際の内部結果ddを試験側で999へ変えた負対照は、picker/sourceで各1件、comparisonでは引用時-0と比較先12の両側を個別に実施し、全件reject後に元値へ戻っている。raw不変、app set/remove/clear各0、ブラウザエラー0、子process exit0を確認した。Windows dirty版の診断であり、最終Linux受入ではない。最終quote独立jobの実行・readbackを別に確認する。

## A・Eの実測と有限対照の境界

診断A run41250143451/job124681755718/artifact13060862890は、完全ZIP26,168,717 bytes、SHA256 `5f4e1339310fc3bcfb71aae86be3c26699af28dc51e24af4fffbb1147b78a7ef`、全CRC正常を独立再確認した。保存原本scenarioは基準94e657bのGit blobとraw bytes完全一致、派生hashも記録値と一致。baseline94/tree583fc077と診断codeaf47b42を区別している。

AはNode22.13/PW1.56.1/WebKit26、390×844/DPR3で588.859秒、188/188検査・98/98geometry・22/22PNG・1337touch・errors0を完走。6903 begin/endに欠測・errorはなく、正常終了・timeoutなし・Linux process group cleanupを確認した。比較target49.947523秒、70tap観測span36.286772秒。fixtureファイル末尾改行を除いた13,969文字と実rawは完全一致した。

旧取消runと共通の49stage/1232操作ではdispatch1022.779秒に対しA318.760秒だったが、host/時刻・並列度・観測追加が同時に異なる。emit追記I/O約0.549秒は追加microtask・AsyncLocalStorage等の総観測負荷ではない。EのWK390も188/98/22/1337を完走し、scenario時刻差1037.423秒、dispatch687.081秒・median0.465568秒。Eではdesktop早期失敗により負荷履歴も異なる。これらを「並列なら必ず未完走」「分割だけが唯一必要」「製品性能根因を解消」と解釈しない。

有限controlsは固定A artifact ID13060862890とrun/attempt/code/application identityを確認し、baseline94/main2549の同一helper blobと同fixtureを使用する。v8 downloadのdigest不一致はerror。4条件はPR WK390、PR WK375、PR Chromium390、main WK390を各1回、内部150秒上限で実行する。外側監督と終了猶予は別に記録し、未完了を成功化しない。全15 target検査/6geometry、正常終了・fixture一致を必要とし、結果を正式6条件へ置換しない。

fresh focusedとA full-prefixでは開始DOM・保持state・React取得世代を同等と証明していない。公開DOMの選択範囲・focus・scroll・dialog/details・実rawは捕捉し、React世代はNOT_OBSERVABLEを維持する。375/390は高さ・DPRも異なり、幅だけの因果にはできない。対照の完了・実測はこのレビュー時点で未確認。

必須A入力が欠けた負対照は、4ケースすべてNOT_TESTED・全体diagnostic-failedと非zero終了を記録している。runnerの外側例外経路も、既に実施したケースを保持し、残るケースだけNOT_TESTEDを追記する。推定fixtureで継続したり、欠測を成功化したりしない構造を確認した。

## 残る確認

最小候補にないgate23の成功を追加の正式受入として数えない。既存46契約fileの原本は不変、既存独立11と合わせた57契約を削減しない。Windowsの既存46は37成功/9 Linux実行経路失敗/skip0を確認したが、最終Ubuntuの57成功を先取りしない。追加AST/cleanup等の診断契約も最終CIで別集計する。

最終scopeのREADME/LOGと独立quote jobへのtimestamp probe追加は確認済み。既存workflowとの差分がその3行だけで、正式jobが不変であることも確認した。残る確認はcommit/push後の最終HEAD、既存正式・独立各GUI、単体2480/契約57/lint/type/両build、CI terminal・成果物digest/readbackである。旧timeout、A/E、日時oracle失敗、有限対照の全結果を保持し、成功だけを選別しない。

previewの読み取り専用・保存非干渉・比較失効・非永続選択の境界は不変。旧Space2失敗UNKNOWN、実機Safari/VoiceOver/OS文字拡大/softkeyboard未検証、Draft・未マージ・未公開を維持する。
