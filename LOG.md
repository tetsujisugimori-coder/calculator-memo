# Calculator Memo 開発履歴・設計判断

## 2026-11-10 (JST): 判断資料の自動失効研究（Issue #138）

- PR #137のマージを確認し、main `6173c9a3507195b476a8c1db356e1611702802db` から独立ブランチを作成。既存reconcilerと判断資料builderをそのまま再利用する。
- 隔離合成fixtureにVALID／STALE／UNKNOWN、fingerprint・世代・authority・backup・選択条件照合、通知と利用直前再照合、非同期応答無効化、明示再生成を追加した。既存製品コード・保存領域・正式GUI契約は変更しない。
- 初版39単体と全3054単体・lint・型検査・両buildがローカル成功。独立レビューで、並行照合により観測済みABAを捨てるP2を再現し、同IDの照合を直列化。同じ反例の旧版REDを保全し、修正後再検証を追加。最終HEADの全CI・6条件原票・独立レビューはDraft PRのSHA付き結果で確認する。本記録では未完了を成功扱いしない。
- [Issue #138](https://github.com/tetsujisugimori-coder/calculator-memo/issues/138)。設計・再現手順は `docs/maintenance/storage-decision-lifecycle-stage3b8/README.md`。[Draft PR #139](https://github.com/tetsujisugimori-coder/calculator-memo/pull/139)。
- 未観測ABA、非協調writer、複数保存先の非原子的読取、照合後TOCTOU、実機Safariは保証対象外。Stage 3B HOLD、実書込み禁止、マージ禁止を維持する。


## 2026-11-10 (JST): PR #137 再開と最終HEAD再受入

- 最新mainを再取得し、`bfa35325c784d49cd8af520f9eb3cd6a47be2f92` が保全済み修正 `500f4a302a3a5eb926dc560233a7c8a61e5a27e5` の祖先であることを確認。PR #136側とPR #137側の記録は両方保持する。製品コード、builder、workflow、lockfileは再開時に変更していない。
- 検証fixtureと判断資料のGitHub保存を再開。過去の停止記録・旧HEAD失敗・ローカル原ログは削除せず保持する。READMEに試験専用層と未実装境界を追記。
- この記録を含む最終remote HEADの全CI、正式GUI原6成果物、別担当レビューの結果は [PR #137](https://github.com/tetsujisugimori-coder/calculator-memo/pull/137) のSHA・run付き追補へ記録する。本記録時点は再確認中で、過去HEADの成功を流用しない。
- [Issue #135](https://github.com/tetsujisugimori-coder/calculator-memo/issues/135) 全体は未完。Stage 3B HOLD、Draft維持、マージ・本番公開・実データ書込みなし。検証結果と限定マージ可否は別に判定する。

## 2026-11-09 (JST): PR #137 Stage 3B-7B fixture整合性修正

- 旧CI 42420517862の原票から候補2のraw9文字/length18の不整合を確定。builderの拒否は正しく、fixtureを原文由来のlength/hash/algorithmへ修正。旧反例拒否と実reconciler接続を含む16単体をローカルで確認。
- 最新mainのPR #136統合を既存枝へ取り込み、LOG競合は双方保全。製品・builder拒否条件・正式GUI契約は不変更。
- [原因・原失敗・再現と限界](docs/maintenance/storage-recovery-decision-stage3b7b/reacceptance-20261109/README.md)。全体CI・原GUI artifact照合・独立レビューはPR #137の最終HEAD記録で判定し、先取りしない。
- Issue #135 / PR #137。Stage 3B HOLD、executionAllowed=false、writeAllowed=false、authority=NOT_ESTABLISHED。hashの真正性、最新観測への失効、製品UI、実機環境は別の未検証範囲。Draft維持、merge/本番実書込みなし。

## 2026-11-09 (JST): PR #136 行内部分実行のP2局所修正

- 必須8ケースの名前・一意性・GREENと、engine/width必須8条件の完全一致を検査する。順序変更は許容し、欠落・重複・未知値・終了失敗は拒否。製品・保存形式の変更なし。
- 旧HEAD 91b0a7392a93193ad3af967472341870f35f8d02の原証拠を保持。独立再受入と最終CIは確認待ち。
- 関連 Issue #134 / PR #136。Stage 3B HOLD、executionAllowed=false、writeAllowed=false、authority=NOT_ESTABLISHEDを維持。実機Safari/private/実quota/媒体/OS強制終了はNOT_TESTED。


## 2026-11-07 (JST): Stage 3B-7A 未検証環境の安全確認（準備・原票補強）

- [Issue #134](https://github.com/tetsujisugimori-coder/calculator-memo/issues/134)。PR #133統合後のmainから独立branchで開始。実機Safari/private browsing/実quota/強制終了/媒体永続性は未検証（NOT_TESTED）、安全な隔離環境がないまま破壊的試験は行わない。
- [設計](docs/design/storage-environment-stage3b7a.md)・[検証台帳](docs/maintenance/storage-environment-stage3b7a/verification.md)。Stage 3B-6独立runnerの初期ロード失敗でrow/エラー/途中証拠が消えないよう局所修正し、未完走/欠落を成功にしない。
- 自動検証・独立再レビュー・正式GUI・最終CIはPR作成前時点で未実行。既存1128/592/132は期待契約のみ。executionAllowed=false、Stage 3B HOLD、実書込み/実移行/実救出NO。Draft PRで提出、マージ・公開なし。


## 2026-11-07 (JST): Stage 3B-7B 手動復旧判断資料の純粋生成（実行なし）

- [Issue #135](https://github.com/tetsujisugimori-coder/calculator-memo/issues/135)。PR #133統合後mainからStage 3B-7Aとは別branch。Stage 3B-6合成診断結果の全候補/全所見/未取得情報を落とさず復旧判断用資料に変換し、勝者選択/復旧実行はしない。
- [設計](docs/design/storage-recovery-decision-stage3b7b.md)・[検証台帳](docs/maintenance/storage-recovery-decision-stage3b7b/verification.md)。source/targetをsynthetic namespaceに制限し、CONSISTENTでもHOLD、executionAllowed=false、writeAllowed=false、authority=NOT_ESTABLISHED。環境未検証はNOT_TESTED、候補原文は判断資料から除外。
- 合成unit反例を追加。Vitest/型・lint/両build/正式GUI/最終HEAD CI・別担当独立レビューは実行前時点でNOT_TESTED。従来GUI1128/592/132は過去の契約期待値で、今回実施として数えない。製品保存経路不変更、マージ・公開なし。


## 2026-11-07 (JST): Stage 3B-6 読取り専用照合と手動復旧判断基盤

- [Issue #132](https://github.com/tetsujisugimori-coder/calculator-memo/issues/132)。PR #131統合main ce87b7cから専用branchで開始。既存records/journal形式とvalidatorを再利用し、製品差分・実データwriteなし。
- [設計](docs/design/storage-reconciliation-stage3b6.md)と[検証台帳](docs/maintenance/storage-reconciliation-stage3b6/verification.md)。複数所見を保持し、CONSISTENTと実行許可を分離。欠落receipt/全消失/巻戻り/ABA/捕捉gapをUNKNOWN等で保持し、勝者推測や未捕捉原文再構成をしない。
- 初期dirty局所29単体・26Node証拠契約・型検査成功。最終HEAD CI・正式GUI・独立レビュー前のためマージ推奨NO。既存1128/592/132の過去成功は加算しない。
- HOLD、executionAllowed=false、実移行/救出/統合/本番切替NO。Draft解除・merge・公開なし。

## 2026-11-06 (JST): Stage 3B-5 片方向移行・分岐救出の隔離検証を開始

- [Issue #130](https://github.com/tetsujisugimori-coder/calculator-memo/issues/130)。最新 main `eb8fd95bb28e992963aba3b47a14529949736058` と Stage 3B-4 #128 / #129、実装・レビュー・CI台帳を確認し、別 checkout / `feat/stage3b5-isolated-migration` を作成。同目的の Issue/PR/branch は見つからなかった。
- 目的は合成 localStorage snapshot から隔離 IDB への片方向移行、旧 writer 由来の分岐検出と非破壊保全。Stage 3B-4 原子的 adapter を再利用し、跨 backend の原子性は主張しない。状態と故障注入、読み取り専用 preview、独立レビュー、最終 HEAD CI・原 GUI 成果物監査を実施予定。
- [設計](docs/design/storage-migration-stage3b5.md) / [検証台帳](docs/maintenance/storage-migration-stage3b5/verification.md)。着手時点の実装・各検査は NOT_TESTED、Draft PR は未作成。過去 1,128 checks / 592 geometry / 132 PNG は期待契約であり今回成功ではない。
- 初期 local commit `feedd810` の独立反例で journal の namespace / genesis 照合不足と、救出後失敗＋診断保存失敗時の再起動 HOLD 欠落を発見。原 RED と修正後の独立4件 GREEN、旧／新 native driverを保持。証拠検査器も failed summary / null observation / dirty / 不正時刻を拒否へ修正。ローカル型・lint・両 build・既存 Node 契約261件・新 validator24件は成功。native はローカル IPC 拒否により未実行で、Actions を待つ。詳細と正確な対象は検証台帳へ記録する。
- 本番保存経路、実ユーザーデータ、選択復元 `executionAllowed=false` / Stage 3B HOLD を維持。旧原文の削除・自動統合・UNKNOWN 自動 retry・本番 authority 切替・Draft解除・merge・auto-merge・公開は行わない。隔離受入と限定 merge 推奨は別判定、実データ移行許可は必ず NO。

## 2026-11-06 (JST): Stage 3B-4 隔離IndexedDB基盤・authority/UNKNOWN停止

- [Issue #128](https://github.com/tetsujisugimori-coder/calculator-memo/issues/128)・[Draft PR #129](https://github.com/tetsujisugimori-coder/calculator-memo/pull/129)。開始HEAD `a68dd5a6ecb3ca1ad57015d835c84266f053d0a4`、main `f22b854c3ef564513b6aace8f0da1b48a47c461c`、cleanな別checkoutを確認。製品Facade/localStorage/全writerは不変更。
- [設計](docs/design/storage-idb-stage3b4.md)・[検証台帳](docs/maintenance/storage-idb-stage3b4/verification.md)。同期FacadeのPromise化を避け、試験領域に独立非同期adapterを追加。永続intent完了後、同一IDB transaction内でcurrent/token/copy/receipt/intentを検証・更新しcompleteで確定を観測。原文保持、8コピー上限、世代/operation/incarnation照合、read-only authorityと旧LS分岐検出を実装。
- 独立反例で外側lock失敗後のUNKNOWN再起動許可、矛盾intent、root-relative import迂回のREDを保全。永続診断・live instanceの観測分離・async境界fence・scanner正規化で修正し、修正後の独立再受入とCIを別記する。過去READBACK_MATCHだけでは新instanceを許可せずHOLD。復旧unlock APIは未実装。
- ローカル全既存2820試験/239 node契約、型、通常/Pages buildは成功。新規単体44件は成功。ローカル既設Chromiumはdirty source実測、WebKit取得は環境CDN拒否で未実施。初回専用CI42200515926は作者両engine成功・独立WKのDB列挙oracle失敗を記録。直接openのversion0/schemaなしと正常DB負対照へ改め、元FAILを保全。別環境レビューのclose後旧queue復活と遅延authorizeを独立RED再現し、固有session識別で遅延処理・結果返却もfence。Vite globの独立反例を追加して拒否、正常browser再起動とkeepalive付きnative transaction中の実page終了を4幅で追加検証。正式GUI原6artifactを別runnerで取得し公式集約器をimportせず再集約する独立監査jobを追加。PNG原bytesのCRC/展開/寸法/SHA256・元inventory・1128/592/132を照合し、22反例と既存79契約成功。全Node261件で追加job配置による旧4契約の文字列混入REDを検出し、条件を変えずjobを移動して261/261成功、原ログ保持。最終HEADの両browser/正式6条件/原artifact照合は最終CIと台帳・PR本文で実測を追記する。未完了を先取りしない。
- executionAllowed=false / Stage 3B HOLD / 選択復元実保存NOを維持。移行・二重write・本番authority切替・公開・main直接push・Draft解除・mergeなし。実機Safari/媒体永続化/実quota/transaction中の終了・復旧UX等は未検証または次工程。

## 2026-11-06 (JST): Stage 3B-3 全writerを共通Storage Facadeへ統合

- [Issue #126](https://github.com/tetsujisugimori-coder/calculator-memo/issues/126)・[Draft PR #127](https://github.com/tetsujisugimori-coder/calculator-memo/pull/127)。PR #125 merge後のmain `41c2c0db0ec2b7dde81ada15c98de5316ab690ce`を新規checkout、重複PRなしを確認し `feat/stage3b3-storage-facade` で実装。main直接変更・マージ・デプロイなし。最終HEADのCIとartifact確認はPRのChecks/最終本文へ実測を追記する。
- [設計・全writer追跡](docs/design/storage-facade-stage3b3.md)。6 sink / W1〜W16と未使用saveDataを共通Facadeへ接続。ordinary/reset/preserve/full-restore/recovery-deleteを区別し、read-only codec・既存queue/Web Locks・唯一のlocalStorage adapterへ分離。JSON v1/原文/保全8slot互換を保持。
- 従来のset返却後attempt記録と保存後不一致CONFLICTを変更し、mutation呼出前attempt・例外/不一致UNKNOWN・同Storage identityのruntime HOLDへ。初期化と保全失敗にもUNKNOWNを伝播する。同期delete迂回とlock例外の反例を独立確認対象にした。永続世代/receipt/再起動HOLD/IDB本番切替は未実装。
- [検証・原失敗・残件台帳](docs/maintenance/storage-facade-stage3b3/verification.md)。AST静的契約、隔離gitへ実writer追加のRED→GREEN、単体/故障注入、Chromium/WebKit追加8条件と既存正式6条件を別評価。局所結果を正式1128checks/592geometry/132PNGの代用にしない。
- 初回ローカル全単体2726中2709成功/17失敗（runtime HOLDを同じjsdomで継承するfixture等）を保持し、原因修正と最終回帰を別記する。初回npm既定cache作成不能は許可済tmp cacheへ変更。ローカルChromium起動EPERMは同一試験の承認済escalationでも継続し、起動0を成功扱いしない。CIの隔離runnerで最終確認する。
- 選択復元 executionAllowed=false / Stage 3B HOLD / 実書込み許可NO。旧タブ・非協調writer・ABA・TOCTOU、長期永続化は未解決。実機Safari等NOT_TESTED。独立レビュー・最終HEAD CI完了前のマージ推奨NO、Draftを維持する。
- 提出前再検証は全124files/2820tests、型、lint（error0/既存warning3）、通常/Pages buildが成功。静的/独立scanner/新harness計63契約、既存formal失敗伝播57契約も成功。独立R1の6escape・R2の外側lease喪失後遅延削除・R3のNode24同期lock callback回帰を修正し元REDとGREENを保存。正式GUIと追加8条件は最終PR headのCI原artifactを正本として別確認し、ローカル成功へ混ぜない。
- 初回CI `bec0c6b` の追加GUIは48context中32PASS/16FAIL。原artifact/hashを検証し、閉じたdetails内textboxを開かずfillしていたハーネス不備をtrace/製品sourceから特定。実summaryのclick/tapと可視ready待機を追加し、製品コード・保存oracle・timeoutは不変更。原REDを保存、独立再レビューと新6契約PASS。既存全体復元8条件/Stage3A8条件/Stage3B2隔離試験は同旧HEADで成功したが、新HEADの最終成功とは分離する。
- 第2回 `715808c` は追加GUI43/48。未保存中optional値のpoll不備3件と、765pxの既存sticky電卓がメモ作成を覆う実配置不具合2件を原trace/PNGで区別。中間幅だけstatic化し、展開入力のまま操作可能を検証する。正式6条件はquota後の旧retry期待で停止し、原ZIP/hash一致・144checks/154geometry/36PNGの部分結果と元集約FAILを保存。新UNKNOWN/HOLD・retry0を先に検査し、明示reload後の新操作へ旧確認assertを引き継ぐ。1128/592/132は維持し、増える実touch7回だけ契約へ反映。CI成功を得るため製品HOLDを解除しない。

## 2026-11-05 (JST): Stage 3B-2 全writer・旧タブ・世代管理設計と隔離PoC

- [独立最終限定レビュー](docs/maintenance/storage-architecture-20261105/independent-review/REVIEW-final-limited.md)でR2-1/R2-2再受入PASS。実summaryの厳密同入力RED→GREEN/独自192変種拒否/60試験成功、未実装controller等のscope訂正を確認。修正1df6f24の[専用CI41999757708](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/41999757708)はCh/WK各15、pageerrors0で原artifactを双方照合。総合PARTIAL/実保存NO。証拠commit自身の全CIはPR #125 Checksと最終報告で終端確認し、それを条件に試験/設計差分限定のマージ推奨YES。Draft/人間のマージ判断を維持。
- PoCのHOLD値は宣言でruntime gateではなく、UNKNOWN操作の永続intent/失敗保存・後続通常writerの停止controller・protocol gateは未実装と明記。独自反例でabort後の別commit/外側例外の非永続/任意writer labelを確認。設計状態図は次工程の製品facade要求で、coreのtx整合性観測と製品全体のUNKNOWN停止を混同しない。
- [Draft PR #125](https://github.com/tetsujisugimori-coder/calculator-memo/pull/125)。初回525c383のnative CIは成功したが、独立R2-1/P2で証拠validatorが同token2writerの二重commitを受理する誤PASSを検出。各15caseの観測oracleと負対照を追加し作者45/45成功。R2-2/P2の「削除後通知発火」誤記も現行呼出0へ訂正。原FAIL/初回run/別担当レビューを保全し、修正後固定HEADの独立再レビュー・全CIを別に確認する。製品差分0/実保存NOを維持。
- [Issue #124](https://github.com/tetsujisugimori-coder/calculator-memo/issues/124)。最新main `120a265f539c0e6762f9eae6eedb52d8b922fbf6`、cleanな専用cloneから`test/stage3b2-storage-architecture`を作成。既存Issue/PRに同一成果なし。Draft PRは作成前、最終SHA CI/独立レビューは確認待ち。
- [全writer表/呼出図](docs/design/storage-writers-stage3b2.md)を現行ソースから作成。通常/復元/保全は既に共通名Web Lockへ参加するが、API不在fallback・公開helper・旧タブ・永続世代/履歴未統合が残る。起動empty初期保存、登録式input自動保存、explicit memo/report、保全remove、opt-in D1例も区分。
- 従来のStage3B-1試験coordinatorを製品へ適用したものではない。今回の比較により、同IDB transactionへcurrent/token/copy/receiptを結合するBと、旧LSを自動再importしない明示的片方向移行Dを**条件付き推奨**。[方式比較/10判断/次工程](docs/design/storage-architecture-stage3b2.md)。旧タブの完全排除、移行中ABA/旧編集分岐、全消失・媒体永続化は未解決。Workerの名前だけで単一writerとは判断しない。
- 試験専用PoC・23件の合成/証拠契約をローカルで実行し成功。原失敗/訂正と[証拠台帳](docs/maintenance/storage-architecture-20261105/verification.md)を保存。Chromium/WebKitのnative複数page/transactionと故障注入は専用Actionsで区別して確認する。文書更新commit自身の最終CIはPR Checksを正本とし、成功を先取りしない。
- 製品writer/保存形式/lockfile/既存正式GUI契約は不変更。executionAllowed=false、Stage3B実保存HOLD、実選択復元の保存許可NO。P1全writer統合/旧側分岐/跨ぎ原子性、P2容量/復旧/互換adapter、P3実機・長期保存は残す。独立レビュー前はマージ推奨NO、Draft/未公開/未マージ。

## 2026-11-05 (JST): Stage 3B-1 保存安全性の隔離検証基盤

- 独立レビューR-1/P2を受入阻害として確認。従来はcallback内の永続OBSERVED_MATCHを信頼し、後の解放例外がメモリUNKNOWNだけとなって再構築後にwriterを許可した。旧「過去の一致」説明では安全性を満たさなかった。保存は非終端READBACK_MATCHまでとし、lock正常終了は当該インスタンスのvolatile結果へ分離。正常終了済みでも新インスタンスはUNKNOWN/HOLD。外側handlerの専用追記診断も失敗した場合はfirstFailure詳細を取得不能と明示し、成功やwriter許可へ昇格しない。製品形式・実保存経路は不変更。
- 独立原本は読取り専用・raw非公開。出力先だけを作業領域へ変更した同じ反例を自己再実行し、旧UNKNOWN→再構築OBSERVED_MATCH/追加write（2回）を再現、新版は再構築UNKNOWN/追加拒否（1回）、初回障害保持。独立再レビュー自体は別担当待ち。[R-1記録](docs/maintenance/storage-safety-20261105/r1-correction.md)。旧失敗とCIを保持し、新しい最終SHAの回帰/CIはPR Checksと後続報告で確認する。

- 追加点検でknown lock loss後の遅延callbackがterminal二重遷移する反例2件を検出。active fenceと初回failure保持で同条件GREEN、全固有49件。実Web Locks stealでもChromium/WebKitの遅延primary0を確認し、隔離受入は各15/計30へ追加。初回2799686のCI成功は後続SHAと別記録。原RED/初回CI/旧28件を保存し、製品実保存許可へ昇格しない。

- [Issue #122](https://github.com/tetsujisugimori-coder/calculator-memo/issues/122)を作成し[#121](https://github.com/tetsujisugimori-coder/calculator-memo/issues/121)へ相互参照。最新main a37eb9b/tree26c09e8から専用branchで開始。既存checkout・証拠は保持。
- 従来はStage3Aのpure準備と小さな合成故障モデル。保存順序・中断・通常writerとの整合を検査するため、4方式を比較し、製品と分離した試験専用共通coordinatorを採用。[設計比較・状態・保証限界・人手復旧](docs/design/selective-restore-storage-safety.md)。既存保全形式/8slot/容量/厳密読戻しを共有、同タブgateと同名Web Locks、単一write、intent/結果ledger、UNKNOWN HOLDと別復旧recordを実装。製品保存形式・実write経路は変更しない。
- 自己検証の初回固有44/45（容量fault前提の誤り）→serialized容量を実測した対照で45/45。型の二重Promiseを修正しtsc成功。ローカルbrowser初回はengine不在、取得時TLS検証失敗。全単体/回帰/CI/実browser/独立レビューは[台帳](docs/maintenance/storage-safety-20261105/verification.md)とPR後続記録へ実測を追記する。文書commit自身のCI成功は先取りしない。
- helper単独ではcal…135980 tokens truncated…958b始直後の選択読戻しを追加し、位置不一致をその場で診断する。拒否文言の OR 化、検査削減、時間上限延長、成功扱いはしない。再実行結果は最終 HEAD の PR / CI 記録へ追記する。
- 失敗 artifact ZIP SHA-256 `d1c22394f956e6b6faca8de5768f8f2d6c94d6293042b7054695e53a6c4765ed` を取得ファイルで照合済み。PNG 101・失敗 trace 1。成功時 trace 抑制は維持。

### Issue #98 / Draft PR #99 初回正式CIの初回未照合状態を修正
- run40520394267の全6条件で、初回点検前の変更を旧結果失効と表示する後退を確認。closed context変更とopen/休止中の失効を分離し、既存GUI期待を維持。
- 実App3件同期待RED→GREEN、活動中失効維持1件追加。全2251単体・41契約・lint・型・両build成功、独立再検証29件成功。正式CI再成功はPR Checks/結果コメントで確認する。
- 失敗ZIP取得SHA256/API一致と最小診断をmaintenance記録に保全。Draft・未マージを維持。
記録：2026-10-27 23:38 JST。

### Issue #98 / PR #99：任意npm cache後処理によるCI取消への対処
- HEAD55e4893のattempt2は全6GUI1056／592geometry／132PNG／trace0を完走したが、成果物保存後のsetup-node npm cache保存で30分上限cancel。検査成功とjob成功を分離して記録。
- PR workflowの任意cacheを無効化（package-manager-cache:false）。lockfile npm ci・Nodepin・全検査・artifact・worker3・上限30分は維持、公開workflow不変更。cache予算契約を1件追加、42件へ。
- 旧失敗・cancel・UNKNOWNを残し、変更後HEADの実CIを待つ。
記録：2026-10-28 00:59 JST。

## 正式CIで検出した既存固定資料移動の回帰と修正

- `e8e096b67bddf2469e85ec374715ec81ed35fefb` の [run 40653849236](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/40653849236) は正式6条件すべて同じ既存 `audit-comparison-navigation.mjs:88` で失敗。unit/契約/lint/型/両build/ブラウザー準備は成功。成果物12800868795、ZIP SHA256 `93de08d6e059118d2282e0834818c5d2d861ce3b04803342c39ba521c1dd2184` をダウンロード照合した。失敗成果物を成功成果物と扱わない。
- 製品回帰: 新しい点検取得結果の失効guardを共通本文移動入口へ追加したため、独立した固定A/B資料が保存通知後に明示再選択され、保持本文から厳密再照合できても拒否していた。独立レビューでも同じ原因を確認。
- 修正: `navigateAuditItem` に点検項目専用のstale/ref guardを限定。共通入口の保存中制限と完全範囲capture、固定資料の独立generation/選択context/epoch/再解析による一意照合を維持。古い点検項目の順送りを復活させる変更ではない。
- 同一の既存GUI helper/期待値を変更せずChromium375/touchで修正前selection0..0のRED→修正後7群/44native操作/pageerror0 GREEN。ログ `comparison-regression-red.log` / `comparison-regression-green.log`。新機能未実装REDと区別する。新項目前後の失効・ABA・同値通知停止は別テストで維持する。正式全6条件は新HEADの実CIで改めて照合し、局所成功で代用しない。

2026-10-28 17:19 JST

## Issue #102：本文確認中の根拠点検前後ナビゲーション

- PR #101 のmerge `7cdda5ce627fb431aec1a70ddd909e7fa01fdd3c` と取得した最新mainの一致を実確認。既存worktreeを保全し専用 `feat/audit-body-item-navigation` で開始。同目的の未完了Issue/PRがないことを調べてIssue #102を作成。設計を先行して記録。
- 点検側の絞り込み・本文順・出現keyを共用し、本文側に現在名/位置と前後操作を追加。完全一意範囲を確認後、実選択完了callbackでだけ選択/戻り先/強調をまとめて更新。失敗・連打・遅延・保存中は古い成功を上書きしない。現在項目詳細への復帰と必要時だけの一覧スクロール、端でのfocus保持を維持。
- 編集/ABA/同値通知/取得世代/切替で失効し、旧位置を有効と表示しない。固定A/B資料の独立した移動入口と既存3引数callback契約は維持。schema/engine/Markdown/容量/専用取消不変更。
- 新機能23試験は基点で22 FAIL/1 PASS。初期実装の比較再実行4回を捕捉し、同じ0回期待を保ったまま、既存inventoryと本文/formula/reportに厳密束縛した私有一時候補contextへ修正。前後移動＋通常復帰まで再比較・原本取得・保存0回を確認。新機能未実装REDと既存不具合再現を混同しない。
- 全体初回は2296 PASS/2 FAIL（固定資料callback引数の互換性期待）。固定資料は従来3引数を維持して同一期待で解消。lint初回20エラーは新UIのrender時ref参照/layout同期state更新であり、表示stateとイベント同期guardを分離して解消。検査抑制やassertion緩和なし。
- 最終実装のローカル全単体2298件/104ファイル、型検査、lint、通常build/Pages build成功。追加独立2件は偽context/異入力inventory/前後加筆/削除/改変/重複/未知/別対象でcachedと従来経路の同値と安全停止を確認。独立レビュー阻害（比較4回）を解消し、再レビュー阻害未解消0。
- focused Chromium375 touchは6群/31 native操作/pageerror0。light/dark CSS文字200%の局所画像を実視認。初回preview未起動・aria-disabledへのtap待機は試験環境/操作選択の失敗として区別し、端の検査をfocus+Enter/Spaceへ訂正。時間延長・強制clickなし。
- 正式GUI期待値は既存全6条件を維持して1128検査/592geometry/132PNG/mobile各1337操作。契約46成功。3workers/30分上限/成功trace0は不変更。最終HEADの実CI、run/attempt/artifact SHAと件数はPR結果コメントで照合し、ローカル局所成功を正式結果の代用にしない。
- WebKit時間変動は既存別残件で今回解決していない。実機iPhone Safari/VoiceOver/OS文字拡大は未検証。CLI push dry-runは認証情報なしで未送信のため、認証済GitData connectorによる同一tree送信と取得照合を使用する。権限変更・マージ・Draft解除・auto-merge・公開は行わない。

記録：2026-10-28 18:52 JST。

## Issue #102 / Draft PR #103：初回正式CIで検出した一覧往復回帰

- HEAD `b81b8a375105b7604188c6e6bbd0e3e078697f7e` / [run40668482705 attempt1](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/40668482705) はunit/契約/lint/型/両build成功、GUI全6条件で既存 `audit-roundtrip-navigation.mjs:71` が失敗。30分取消や既存WebKit時間変動とは区別する。
- 原因：一覧から初回本文移動しただけでもonArrivedで選択を確定したため、元は未選択だった一覧へ戻る際に詳細modalを暗黙表示し、次の一覧操作を遮った。
- 修正：初回成功では本文側の現在keyだけ確定し、元のselected/selectedTarget（未選択も）を維持。本文側前後操作が成功したときだけ新しい項目詳細を復帰先にする。安全照合・失効・保存保護を緩めない。
- 独立回帰試験で修正前REDを取得。既存GUI helper無変更のChromium375 touchでも同じtap遮断/30秒timeoutを再現。新機能未実装REDではなく今回の製品回帰である。失敗を盲目的再試行や時間延長で消さない。
- 失敗artifact12807947356（PNG54、失敗trace6）を取得し、ZIP SHA256 `305da7438cfb86e0aa8012e3fba9103a86f085bd36aee7a01551c594eb1a3a14` とAPI値が一致。診断・既存assertは保持し、修正後新HEADの全6条件を再確認する。

記録：2026-10-28 19:15 JST。
- 修正後：同一独立回帰試験GREEN、関連45件を独立再実行して成功。既存roundtrip helper無変更の同一Chromium375 touchで7群GREEN、新body helper6群GREEN、両pageerror0。全単体2299件/105ファイル・lint・型・通常/Pages build成功。正式全6条件の成功は新HEADのCIと成果物を確認するまで保留。

追記：2026-10-28 19:16 JST。

### 2026-10-29 限定診断 run 40885754090 attempt 1

- 登録済み main 計測器 `d25410379d669350c6fdc10ced225cfd1644b17a`、アプリ `52f4f6914fcd3c72b0829018842f653f06abe5f2`。Ubuntu 24.04.5 x64、Node 22.13.0、runner image 20261026.354.1。固定 checkout と配信前の識別確認は成功。
- 追加試験 7/7、既存契約 46/46（ともに skip 0）。過去 Windows 8失敗の同名テストはいずれも成功したが、個々の原因を確定したわけではない。
- 限定 GUI は case 0 がプレビューの HTTP 200 待機で 30秒 timeout、case 1–3 は計画に従い未開始。URL が preview.log に出力されたことと応答成功は別であり、原因 UNKNOWN。WebKit 操作や幅差・DOM 負荷は測れていない。再試行なし。
- ジョブ 13:51:09–13:53:12 UTC、依存準備 13:51:22–13:52:34、診断 13:52:34–13:53:07、証拠保存 13:53:07–13:53:09。artifact 12902617118、22,612 bytes、7日保持、SHA-256 `a4453238a262e9c18973e1cc9fd6879776fff4144621bdb5028bbaf9ada85fd7`。ZIP再取得後の SHA が API digest と一致。Linux process group は namespace 内不在を確認。trace は採取対象外。
- この限定診断は正式 GUI 成功を意味しない。PR #103 は Draft・PARTIAL・マージ推奨 NO を維持。実機 iPhone Safari、VoiceOver、OS 文字拡大は未検証。

## 2026-11-11 Stage 3B-9 synthetic recovery race verification (Issue #140)

- Reuse merged Stage 3B-8 lifecycle; add isolated session/presentation epoch and 14 deterministic async scenarios, six-condition browser raw evidence, and two defective implementation controls.
- Preserve all production paths and formal GUI contract. HOLD and real-write prohibition remain.
- CI, artifacts and independent final-HEAD acceptance are pending. Synthetic verification does not establish real-data safety.
