# Stage 3B-2 検証・原失敗・証拠台帳

2026-11-05 JST。Issue [#124](https://github.com/tetsujisugimori-coder/calculator-memo/issues/124)。基点main `120a265f539c0e6762f9eae6eedb52d8b922fbf6`、branch `test/stage3b2-storage-architecture`。
[設計](../../design/storage-architecture-stage3b2.md)・[writer表/依存図](../../design/storage-writers-stage3b2.md)・[検索根拠](source-inventory.json)。

## 開始時確認と変更境界

- latest main/PR #123・Issue #121/#122をソース/connected GitHubで照合。Stage3B-2のIssue/PR重複なし、Issue #124を新規作成。
- 空の専用workspaceへclone。既存ユーザーcheckout/変更/実ブラウザプロファイルを使用していない。git status cleanから専用branch。
- root AGENTS、docs/agent/github-workflow・verification-policy、README、e2e/README、既存storage-safety/selective/正式workflowを読んだ。`.agents/skills`はcheckoutにない。
- 製品保存経路の差分0を維持。lib/selective-restore-safetyのexecutionAllowed:falseを変更しない。PoCはtests以下、app/components/libからimportなし。
- local NodeはWindowsで既存インストールを使用。新しいnpm/browser/system packageのローカルinstallなし。browserは既存の固定Playwright lock/Actions隔離環境で実行する。

## 実行コマンドと証拠

```sh
node e2e/storage-architecture-inventory.mjs
node --test tests/storage-architecture/model.node-test.mjs e2e/storage-architecture-contract.node-test.mjs
node e2e/storage-architecture-browser.mjs
```

最後のbrowser commandは`npm ci --ignore-scripts`/e2e固定lock/browser setup済みのActionsで実行。
専用workflowは既存storage-safetyを複製した隔離job。既存workflow/依存lockfile/正式6条件と1128 checks・592 geometry・132 PNG契約は変更なし。
EXPECTED_SHAとgit HEAD/tree/dirty、source SHA256、Node/OS/run/attempt/engine version、全case名・観測値・pageerrorsをsummaryへ保存。失敗・未起動・欠case・重複engine・旧SHAはfail-closed。
CI artifactの保持期間は7日。raw browser JSONとstage logが根拠であり、PASS文字列や件数だけを実保存安全性の根拠にしない。

初回ローカル合成/証拠契約は23/23、skip0、cancel0。追加変更後の対象HEAD/最終結果はPRのChecksと独立レビュー記録を参照（古いSHA成功の流用なし）。
製品単体/型/lint/normal/Pages build/既存正式GUI・Stage2/3A/3B-1は起動した最終HEAD CIの終端を別に確認する。

## 入力・操作・oracleの対応

全てraw `A`/`B`/`C`等の合成データ。PoCには製品保存キーの文字列も製品module importもない。

| case/入力・前提 | 実操作と期待oracle | 分類・限界 |
| --- | --- | --- |
| same-generation-two-tabs / g0 | 別page・別IDB connectionが同tupleでcommit→一方COMMITTED_OBSERVED/他REFUSED、g1/history2/copy1 | native transaction、到着順は固定しない |
| stale-validation-and-recovery / g0 | Aが古いtoken保持→B更新→A復旧要求→REFUSED | native、sleep長期そのものではない |
| cooperative-aba-token / A/g0 | B→Aを2commit→原文Aでも旧g0要求拒否 | native協調ABA、非協調metadata破壊の対策ではない |
| web-lock-ignored-by-old-tab | A実lock保持→BがLS直接Bへ→更新を観測 | native2page否定反例、旧bundleの全版ではない |
| unobserved-notification-aba | subscriberなしA、BがA→B→A→raw一致で見逃す | nativeLS+通知無観測前提。UA自然欠落/到着前の保証と混同しない |
| final-check-set-gap | A validate(A)→B set(B)→A set(C)→B消失 | nativeLS制御順序。既存製品helper内の数命令gapを強制した実測ではない |
| transaction-abort-preserves-all | g0読取、put準備直後native tx.abort→UNKNOWN、g0/rawA/history1/copy0 | native abortを試験注入、quota/電源断ではない |
| commit-before-page-close-ack | native complete後UI ackを保留しproducer pageを実close、別connectionからreceipt照合 | COMMIT_RECORD_OBSERVED/ack UNKNOWN/durability NOT_PROVEN。browser全killなし |
| exception-after-commit | native complete後に故意throw、catchはUNKNOWN/元例外保持、receipt照合は別観測 | 合成post-complete例外。native completeの失敗とは言わない |
| normal-reopen-new-instance | native保存/connection close/open、root chain/copy照合 | CONSISTENT+receipt observed、過去UI ack/媒体保証はUNKNOWN |
| missing-corrupt-history-generation-copy | 別page txでg削除/history削除/copy改変→次commit UNKNOWN | native保存に合成故障注入。自然媒体故障の再現ではない |
| entire-store-loss-no-auto-bootstrap | 別page vault.clear→commit UNKNOWN、approved=false bootstrap REFUSED | synthetic clear、全消失と初回利用は区別不能のまま |
| idb-authority-legacy-fork | IDB new→旧pageがLS old→IDB new/LS oldが同時存在 | native分岐反例。旧編集救出の自動解決ではない |
| dedicated-workers-not-single-authority | 各pageで同じWorker URL→両sequence1、terminate/restart→再び1 | native専用Worker。SharedWorkerの全条件実証はNOT_TESTED |
| restore-and-ordinary-share-transaction | 同tupleでrestore/ordinary同時→一方commit/他拒否 | nativePoC。製品restore adapter未実装 |
| model: split persistence prefix | raw/g/receipt順と逆順の全非終端prefix→混在 | 合成、diskの実書込順序の証明ではない |
| model: 欠落/不正/再使用/世代超過 | 連続履歴/previous/raw/copy/IDを検査→UNKNOWN/REFUSED | pure model。全整合snapshot巻戻しや同origin悪意ある変更は検出不能 |

固定sleep/無条件retryは使わない。page readinessはbounded waitForFunction、順序はPromise/lock/明示page操作で制御。caseが未実行なら集約失敗。
反例caseのPASSは「上書き/見逃しを期待どおり確認した」こと。競合安全性をPASSにした意味ではない。

## 原失敗・訂正

| 事象 | 原観測 | 対応/判断 |
| --- | --- | --- |
| 初回clone | sandbox内DNS `getaddrinfo() thread failed to start` | 正規のsandbox escalationで同じ対象へclone成功。拒否/セキュリティ制限を迂回したものではない |
| 初回`rg` | executable未搭載 | git grep/Get-Contentへ切替。新規installなし |
| 最初のworkflow参照名 | `verify-storage-safety.yml`不存在 | git ls-filesの実在名`storage-safety.yml`を参照し直した |
| gh auth status | sandbox内はinvalid、同一readのescalated環境では既存認証成功 | 認証を書換えていない。秘密値を収集/保存しない |
| 棚卸し草稿 | recovery-sessionのprefix/未対応時挙動を不正確に記載 | 現行recovery-manager:8/17を再読。`${STORAGE_KEY}:recovery-session`、全体復元fallback ready=true、削除のみ非対応拒否へ訂正。製品コード変更なし |
| 独立R2-1/P2 | 初回525c383のvalidatorが「同token2writerともcommit」の矛盾観測を受理。独自12test中1FAIL | 各15caseの観測値oracle/clean provenanceを追加。二重commit/部分abort/ack捏造/欠fault/自動bootstrap/全case空観測を負対照化。作者再検証45/45。独立再レビューは別記録 |
| 独立R2-2/P2 | W16で削除結果後の同タブ通知を発火済みと誤記 | `notifyRecoveryChanged`は定義のみ・製品呼出0と訂正。製品writerを修正したとはしない |

前段#123のR-1、#121のR1/R2失敗履歴/原因UNKNOWNは本stageの結果で遡及的に成功化しない。

## 未解決と独立レビュー

P1: 非協調旧タブ排除不能、移行中の旧側編集分岐、全writerの製品統合、複数storage跨ぎ、全消失/整合巻戻し、媒体永続化。
P2: 操作記録とUI ackの分離UX、履歴保持/容量/compaction/保全削除、JSON互換adapter、人手照合。
P3 NOT_TESTED: iPhone Safari/VoiceOver/private mode/OS拡大/soft keyboard/長期背景化・eviction/電源断、SharedWorkerの実運用単一性。
実装担当自身の再確認を独立レビューとは呼ばない。別担当へ固定HEAD・ソース・設計・反例・未保証事項を渡し、独自反例と実行結果を記録する。実施前はNOT_TESTED/マージ推奨NO。
初回独立記録は[REVIEW.md](independent-review/REVIEW.md)、原独自FAILとrunnerを保存。初回native CI [41999033337](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/41999033337)は成功だが、独立指摘を解消した意味ではなく、修正後HEADの結果で再判定する。
総合PARTIAL、Draft維持、実保存許可NO。最終HEADの全CIと独立レビュー結果で、試験・設計差分だけの限定マージ推奨を改めて判断する。
