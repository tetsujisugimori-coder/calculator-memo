# R-1/P2: 解放例外後のUNKNOWNが再構築で消える問題

2026-11-05 JST、実装者による訂正。独立レビュー対象はd8416dc/tree57e81ded。独立担当が発見した受入阻害であり、旧49件・15契約・30browser・CI成功では検出できなかった。旧自己検証/CI/失敗履歴は保持する。独立原本は読取り専用、rawやコピーをGitHubへ公開しない。

## 根因と訂正

旧実装はlock callback内でOBSERVED_MATCHを永続化し、その後requestがrejectするとUNKNOWN/HOLDをメモリだけに保持した。新インスタンスは永続値を信頼し、初回障害を失い、通常writerを許可した。「歴史的な一致」という説明だけでは、この制御上の問題を防げなかった。

新順序は、保全→intent→単一write→厳密readback→**非終端READBACK_MATCHの保存**→callback終了→lock要求正常終了→**volatileなOBSERVED_MATCH**。永続的な成功/再開許可のreceiptは作らない。同じ生存インスタンスが保持する完了結果も、共有record全文との一致を条件にする。

再構築時は正常終了の操作もUNKNOWN/HOLD。旧v1のOBSERVED_MATCHも再開許可にしない。これにより「成功markerを書いたが、その応答/読戻しで失敗しUNKNOWNとなり、次の起動では成功markerだけを信じる」穴を作らない。通常の正常実行・同じ生存インスタンスの後続writerは正例として維持し、新インスタンスの自動再開は意図的に禁止する。この保守性・人手照合の必要性は製品へまだ導入しない。

初回障害は、所有中なら共有ledgerに、所有権喪失後は外側handlerだけがoperation所有の追記診断slotへ記録する。旧callbackは再開してもstorage IOを行わない。外側handlerも共有ledger/primary/保全slotへ書かない。診断はimmutableで成功/解除値を持たず、失敗しても再起動HOLDを弱めない。具体的な初回例外を全保存不能下で永続化することは保証不能なので、返却メモリで保持し、再構築では取得不能を明示する。原因を推測せず、UNKNOWNのまま停止する。

## 同条件の反例と検証

独立runnerをローカル専用領域にコピーし、import先と出力先だけを変更して旧版/修正版へ自己実行した。独立再レビューとは称さない。独立原本を実行して出力を上書きしていない。公開するのは以下の集計と自作の回帰試験だけで、独立raw、runnerコピー、raw反例はローカル保持。

| 条件 | 旧d8416dc | 修正版自己実行 |
| --- | --- | --- |
| 同じ解放例外 | 返却UNKNOWN | 返却UNKNOWN |
| 新coordinatorのinspect | OBSERVED_MATCH、初回障害なし | UNKNOWN、初回障害あり |
| 新ordinary要求 | OBSERVED_MATCH | REFUSED |
| primary総呼出し | 2 | 1 |
| 独立runnerと同じ有限例外sweep | 78境界、他4項目成功・本反例失敗 | 同78境界・5項目すべて成功 |

自作単体は、解放例外＋診断get/set前/set後/readback/drop/破損、恒久的な診断全IO不能、正常ack後の再構築HOLD、旧OBSERVED_MATCHの扱い、初回primary障害＋後続解放/復旧障害、known-loss後の旧callback IO0を追加。診断が残らない場合もUNKNOWN/追加write0、`failureEvidence=UNAVAILABLE`を要求する。markerの保存失敗を、初回障害の成功保存や成功確認と偽装しない。

browser adapterにも、解放例外後の新coordinator、診断set前/後の複合故障、正常ack後の再構築を追加。これはnative localStorageを包むadapterの解放故障であり、native Web Locks自体の解放失敗実証ではない。実steal/別page/storage通知/page closeは従来どおり別ケース。

自己結果：単体60/60、集約契約19/19、Windows固定Chromium141.0.7390.37/WebKit26.0各19（計38）・pageerror0、型検査、source lint（既存3warnings）成功。[同条件の公開用集計](r1-self-summary.json)、[自作原RED](local/r1-author-red.txt)、[60単体](local/r1-unit-60.txt)、[19契約](local/r1-contract-19.txt)、[browser自己結果](local/r1-browser-38-dirty.json)。当該browserは修正途中dirty版として記録し、最終SHAのclean CIで別に再確認する。

初回の順序変更直後は旧正常history期待と旧OBSERVED_MATCH対象の故障注入が残り、50件中2件FAIL。非終端READBACK_MATCH導入の仕様に従い期待historyと同じ読戻し観測recordへの注入点を変更し、fault実発火をassertした。marker更新失敗を無効化・skipしていない。最終単体60はskip0。独立runnerのrawコピー/反例出力は公開せず、元3原本の変更なしをローカルSHA256照合した。

## 再受入

設計・型・単体・契約・browser・回帰・最終SHA CIを自己確認してから、同じ独立反例で再レビューを受ける。新SHAの結果はPR本文/Checksに追記し、旧d8416dcの成功で代用しない。実保存executionAllowed=false、Draft、未マージを維持する。
