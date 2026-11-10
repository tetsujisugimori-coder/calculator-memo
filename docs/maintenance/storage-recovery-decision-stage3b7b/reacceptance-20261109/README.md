# PR #137 fixture修正と独立再受入

記録日: 2026-11-09 JST。対象 Issue #135 / Draft PR #137。Stage 3B HOLD。

## 原因と変更
- 旧HEAD `d247d721fb35bd3ce1ccef6efdbef53d47119e21`、CI [42420517862](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/42420517862) の checks job `128548429839` を原ログから確認。3001/3002単体成功、指定1件で `invalid-or-executable-candidate`。その後のlint/型/両buildはSKIPPED。GUI6ジョブの成功だけではgate/audit失敗を覆さない。
- 候補2が `raw='different'`（9 UTF-16コード単位）なのに、候補1のlength=18とダミーhashを引き継いでいた。拒否条件が正しく働いた合成fixture不備である。候補1もダミーhashだったため、両方を原文から独立Node cryptoで生成する。
- 元の不正候補は負対照として残す。実装builder・既存拒否条件・製品コード・正式GUI契約は変更しない。新たに不正hash書式、全候補/所見保持、参照分離、実reconcileEvidence由来のCONFLICT+UNKNOWNと全digest照合を追加。
- 最新main `bfa35325c784d49cd8af520f9eb3cd6a47be2f92` にPR #136統合済み。既存作業枝へmergeし、LOG.mdだけの競合は双方の記録を保全して解決。mainへ書込みやPR mergeはしていない。

## RED/GREEN
同一Linux/Node v24.22.1/lockfile/Vitest 3.2.4で旧HEADと修正後を実行。
- 旧: focused 8/9、exit1、指定不正候補拒否。
- 新: focused16/16、exit0。旧不正候補そのものは引き続き拒否される。
- 原CIはNode22.13.0。ローカルNode24の結果をCIの実測へ置き換えない。

詳細原ログ・SHA256は同directoryのlocal-evidence.json参照。旧CIログは圧縮原票で保持。全体の最終HEAD CI、正式6条件原ZIP・1128 checks/592 geometry/132 PNG照合と独立レビューは、PRの後続記録へ実際の実行結果として記載する。この文書commitの成功は先取りしない。

## 範囲と残件
hash書式の検査とhash再計算は別。builderは前者だけ、上流reconcilerは後者。独立接続試験は双方を混同しない。最新観測への自動失効・製品UIは未実装。実機Safari/private browsing/実quota/物理媒体/OS強制終了はNOT_TESTED。

executionAllowed=false / writeAllowed=false / authority=NOT_ESTABLISHED / selectedCandidate=nullを維持。実データ移行・救出・復旧書込み・本番切替・削除・UNKNOWN自動retry・自動復旧は禁止のまま。Issue #135は残件ありとして維持し、Draftのまま人間のマージ判断を待つ。

## ローカル全体検証（11/09 19:37 JST確定）
- コードcommit ce4e839eb822b908709827b5b05cd1f70065b218 / tree cce2822244af0c3b333a739371b57809db5f3b69。後続は記録日の訂正と証拠文書だけ。
- 全単体132ファイル・3015件成功、型検査exit0、lint exit0（既存warning3）、通常build・Pages buildともexit0。
- Node契約一括並列実行は321/322、100msタイムアウト負対照で子Nodeの標準出力前にTERMとなり1件失敗。この原失敗を保存し、期待値・タイムアウト・テストは緩和していない。
- CIと同じ68契約グループは68/68成功。全322件を `node --test --test-concurrency=1 e2e/*.node-test.mjs` で独立ファイル逐次実行し322/322成功。実行負荷による起動時刻の差と整合するが、並列一括の初回失敗は取り消さない。
- 実装担当と別のreviewerがコードcommitを別checkoutへ取得し、修正16試験＋独自6試験（32所見組合せ・実reconciler・Unicode等）を22/22成功。最終レビュー/CIの記録は別。
- GitHub保存は許可審査が安全flagをリポジトリ書込み禁止と解釈して停止中。GitHubの最新HEADは旧d247d72のままであり、この修正がremote提出済みとは扱わない。final CI・正式GUI6条件はNOT_TESTED。実データへのwrite禁止と、GitHub検証資料commitの許可範囲の確認待ち。
