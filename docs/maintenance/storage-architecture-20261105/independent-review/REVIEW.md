# Stage 3B-2 独立レビュー

実装担当とは別のレビュー担当による記録。2026-11-05 JST。

## 初回固定HEAD

- HEAD `525c383efbb0251fe097431ca68c6674f1c70224`、tree `d66ebb3aa3c7a25df8e360b81dbe7807399f46ca`。
- base main `120a265f539c0e6762f9eae6eedb52d8b922fbf6`、branch `test/stage3b2-storage-architecture`。
- Windows / PowerShell、既存Node `v24.20.0`。新規install/設定変更/実ブラウザprofile使用なし。
- レビュー対象: root AGENTS、docs/agent/github-workflow・verification-policy、README/e2e手順、writer台帳、設計比較/10判断/移行条件、PoC/model、native runner/contract、専用workflow。
- 製品app/components/lib/db/worker/public、両lockfile、既存正式GUI workflowのbaseとの差分0を独自に確認。

## 独自反例と実行結果

実行: `node --test docs/maintenance/storage-architecture-20261105/independent-review/independent.node-test.mjs`。
初回 **11/12成功、1失敗、skip0/cancel0、exit1**。[原ログ](initial-525c383.log)、[独自runner](independent.node-test.mjs)。

| 入力/反例 | 実結果・解釈 |
| --- | --- |
| root必須7fieldを個別削除 | 全てinspect/transition UNKNOWN、mutationなし |
| genesis/次receiptの7fieldを各削除、copy4field各削除 | 全18変種UNKNOWN、mutationなし |
| 3writerの全6順序、全員が同じ初回token | 最初のみPREPARED、後続2件REFUSED、g1 |
| rawが同じ3連続commit後に古い復旧token | g3へ進み、古い復旧REFUSED |
| receipt再読取 | COMMIT_RECORD_OBSERVEDとack UNKNOWN/durability NOT_PROVENを分離 |
| 整合した過去snapshotへの全巻戻し | 古いsnapshot自体はCONSISTENT、消えた操作照合UNKNOWN。検出不能限界の再確認 |
| 手動駆動transaction adapterでput準備後complete保留 | Promise未解決。complete後のみCOMMITTED_OBSERVED |
| request成功後abort/put直後abort | UNKNOWN、旧root世代不変。native IDBの再現とは区別 |
| root消失/承認なしbootstrap/既存destination/bootstrap | root消失UNKNOWN、無承認/既存destinationはREFUSED、自動作成なし |
| test prefix外DB名 | openDatabase同期拒否 |
| token field順序だけ変更 | conservative REFUSED。可用性の余地あり、安全な更新を誤許可する問題ではない |
| native証拠の同世代2writerが両COMMITTED_OBSERVEDとの矛盾 | **validatorがerrors=[]として受理。独自負対照FAIL** |

別途、作者のmodel/contractを同HEADで独立実行し23/23成功。[ログ](author-tests-525c383.log)。これを独自反例と混同しない。

## 指摘

### R2-1 / P2 / 修正必要: 証拠validatorが空・矛盾観測を受理

`e2e/storage-architecture-contract.mjs` はcase名/status/observationの存在だけを検証している。
全caseを`observation:{}`にし、`same-generation-two-tabs`だけ
`{outcomes:[{status:'COMMITTED_OBSERVED'},{status:'COMMITTED_OBSERVED'}],generation:1}`とした入力でもerrors=[]。
runner内のassertは現在これを防いでいるが、保存artifactの集約器としてのoracleが不十分。
各caseの必要な観測構造と重要値を検証し、空/矛盾データを負対照で拒否すべき。実製品writerの障害ではない。

### R2-2 / P2 / 台帳訂正必要: W16の同タブ通知

writer台帳W16の「結果後RECOVERY_CHANGED_EVENT」は現行ソースと異なる。
`notifyRecoveryChanged` は`lib/recovery-manager.ts:24`の定義のみで呼出0。RecoveryManagerModal.executeにもdispatchなし。
定義/購読があることと、製品削除経路で発火することを分離して記載する。製品コード修正は本stageの範囲外。
[独自検索](source-search.txt)と関数/呼出の目視追跡を併用した。

## 設計・棚卸しの判定

6sink（setItem5/removeItem1）とCalculatorApp各setData/explicit save、子modal callback、起動empty初期保存、保全作成/復元/削除、未使用公開saveDataをソースから確認した。D1 insertはopt-in exampleで製品app routeにない。新たな製品永続sinkの漏れは発見しなかった。
通常/復元が既に同じロック名へ参加している事実と、旧クライアント/非対応fallback/永続世代未統合を区別する設計は妥当。
旧LS writerの排除不能、同origin任意変更、移行中の分岐、LS→IDB跨ぎ非原子、全消失/整合巻戻し、receiptとUI ackの分離を隠していない。
B(IDB)＋D(明示片方向移行)の推奨は、全writer統合・容量/履歴/復旧・実機受入を条件とする設計候補として妥当。製品実装完了の認定ではない。

P1新規unsafe mutationは独自25欠落変種・順序/ack反例では発見なし。製品統合/移行/媒体永続化等の既存P1は設計に残る。
P2上記2件が初回受入の修正対象。P3: token object順序比較は将来の明示field比較で可用性を改善可能、今回安全性阻害ではない。

## 未実施・CI

本担当のnative Chromium/WebKit実行はローカル依存なしのためNOT_TESTED。installせず、Actionsの固定HEAD結果/原artifactの別確認待ち。
初回HEADのconnected GitHub確認時、専用run `41999033337`、正式GUI `41999033084`、Stage3A `41999033208`、Stage2 `41999032985`、Stage3B-1 `41999032998` はin_progressだった。成功認定していない。
実機Safari/VoiceOver/長期sleep/自然通知欠落/eviction/電源断/SharedWorker実運用はNOT_TESTEDを維持。

**初回総合PARTIAL、マージ推奨NO（R2-1/R2-2修正・再レビューと最終HEAD CI待ち）。実選択復元の保存許可NO。**
修正後は固定HEADを別記し、初回FAILを保持したまま同じ反例と追加負対照で再レビューする。
