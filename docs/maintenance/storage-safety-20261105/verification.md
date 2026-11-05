# Stage 3B-1 検証・証拠台帳

2026-11-05 JST、自己検証。独立レビューは別担当。Refs #122 / #121。最終commitのActionsはPR Checks/後続コメントで確認し、この文書commit自身の成功を先取りしない。

**訂正：d8416dcの独立受入はR-1/P2によりFAIL。** 解放例外後のUNKNOWNが再構築でOBSERVED_MATCHになり、writerが再開した。旧自己検証の成功や「過去の読戻し事実」という説明では受入条件を満たしていなかった。[根因・順序変更・同条件RED→GREEN・複合障害](r1-correction.md)を優先する。以下の49/15/30等は旧版の時点記録で、修正SHAの受入を先取りしない。独立原本はraw非公開・読取り専用で保持。

## 調査

AGENTS.md、docs/agent/github-workflow.md/verification-policy.md、e2e/README.md、README/LOG、json-backup/json-restore/recovery-copy-manager/selective-restore-preview/plan/execution-safety、lib/storage/restore-storage/selective-restore-safety、対応単体/GUI/workflowを確認。PR #107/#109/#111/#113/#115/#117/#118/#120とIssue #105/#116/#119/#121をGitHub取得。#117 merged、#118 closed/unmerged、#120は#117へmerged。開始時main a37eb9b/tree26c09e8。main commitのworkflow API取得0件を、#117受入HEADの再実行と呼ばない。6job fail-closed/1128 checks/592 geometry/132 PNG契約は不変更。

## 区分

| 区分 | 自己検証・実行 | 限界 |
| --- | --- | --- |
| 状態単体/合成故障 | npm test -- tests/storage-safety.test.ts、初回44/45→修正45/45、Windows Node24.20.0 | 実browser/disk保証ではない |
| 隔離browser storage | node e2e/storage-safety-browser.mjs、空HTTP origin/新規context/prefix remap、各engine14ケース | 最終CIの実結果参照。未実行をPASSにしない |
| 既存回帰 | 全Vitest/lint/tsc/normal・Pages build、Node契約 | Windows Node24とUbuntu24 Node22.13を区別 |
| 正式GUI | 6独立job＋既存集約、不変条件/件数 | 旧3worker欠測/R2根因の解決ではない |
| Stage2/3A/preview | 既存workflow維持、最終SHA実行 | 各workflow/artifactで別判断 |
| 独立レビュー | 親担当が別担当を手配 | 自己検証で代用しない |

## 初回失敗の保持

- 固有45件中capacity1件FAIL（OBSERVED_MATCH、期待REFUSED）。fixtureがraw長だけで作られ、新copyを含めても実serialized合計が上限未満。製品/上限不変更、serialized overheadからoccupied totalを上限−100へ設定し新copyで超過する前提をassert。期待値緩和ではなく故障発火前提修正。修正45/45。
- 型検査1件: DOM LockManagerの二重Promise推論をasync/awaitで平坦化。修正後exit0。
- ローカルbrowser初回は固定engine実行ファイル不在、両engine起動失敗exit1/case0。`gui-evidence/storage-safety-a37eb9b231f7-2026-11-04T23-19-27-246Z-f76d4e4e-ad3c-4603-92c9-b49ce4f8e939/`へJSON/provenance/bundle保全。browser取得初回はTLS leaf検証不能exit1。検証無効化はしない。
- 後続の依存/全単体/lint/browser/build/CI結果はPRへ追補し、初回失敗を取り消さない。証拠は実行毎exclusive directory、artifactはHEAD/attempt別・7日。

## 故障と負対照

計画/原文/backup/選択/未保存/参照/rule/candidate失効、slot/容量/破損、保全quota/書込後例外/drop/不一致/read例外、primary前/後例外/不一致/read失敗、journal失敗、same/other-tab/lock取得失敗、通知ABA/通知なしABA、final gap非協調write、読戻し後変更、intent中断/restart、UNKNOWN再要求/ordinary HOLD、復旧承認/copy改変/write失敗/正常、初回failure保持、偽成功履歴を検査。FaultStoreは実get/setとfire数/primary呼出し数も検査。REFUSEDだけを故障発火証明としない。

通知なしABA/final gapは防止成功ではない。OBSERVED_MATCHでもCOOPERATIVE_OBSERVATION_ONLY/executionAllowed=falseであり、実保存安全性PASSにしない反例。実データで許容していない。

## RED→GREENの範囲

既存restoreRawを実際に呼び、caller valid=true、原文A→B→A、外部epoch増加の入力ではverified。新coordinatorは同じ通知済ABAをStage3A epochで拒否しprimary write0。旧helperはcaller失効管理を要求するので、これはhelper単独を判定に使う旧方式との比較であり、既存製品UIの欠陥とは断定しない。通知なしABAの解決とも称さない。状態負対照は合成契約であり歴史的製品bugではない。

## 未検証

実データ、実機Safari、VoiceOver、OS拡大、soft keyboard、ブラウザ全体kill/電源断/長期保存はNOT_TESTED。Linux Playwright WebKitはiPhone Safariではない。Windows Node24とCI Ubuntu24 Node22.13/Playwright1.56.1を同一環境としない。ledger同期IO/長文化/checkpointは競合timingを変える。実browser成功もCAS/非協調writer封鎖/disk flushへ昇格しない。

## 提出前自己検証の追補

- 固有47/47（ordinary正常とlock release後例外の初回failure/HOLDを追加）、型検査exit0。新Node契約13/13。契約初回は実装が分散集計する件数を文字列literalで探した誤assert1件FAIL、既存集約器の固定件数へ参照先を修正し13/13。製品の件数や期待値は変更しない。
- Windowsの既存cacheに固定Chromium141.0.7390.37/WebKit26.0が存在したため、専用空origin・新規contextを使って両14/14、pageerror0を実行。28件には12内部対照/engine＋実別pageのWeb Lock拒否/storage通知＋実page close後再起動HOLDを含む。localStorageの製品キーは使わず全logical keyをprefix remap。原文を戻す再初期化を、UNKNOWN解除と呼ばない。
- 全単体初回は121files・2711件中2704成功/7失敗。6件は5秒timeout、1件は保存済Markdown fixtureのCRLF対生成LF差。失敗した6filesを条件不変・worker1で診断し127/127。これは全単体成功の代用ではない。CRLFとtimeoutを製品修正/skip/延長で成功化しない。正式全体結果は最終SHAのLinux CIで確認。
- 初回lintは新browser生成bundle.jsまで走査してvendor由来48errors、その後browser cacheの生成JSでも1error。bundleの保存拡張子をtxtにし生成物の同一性はSHA256で記録。ローカルsource lintは`npm run lint -- --ignore-pattern gui-evidence`でexit0/既存3warnings。これは新生成証拠/cacheを除外したローカルcommandであり、CIの既存npm lintは変更せず別clean jobで実行する。
- 通常build・Pages buildはexit0。既存bundle size等のwarningは保持。ブラウザ取得はOS CAを使う`--use-system-ca`でTLS検証を維持し成功。default sandboxのcache移動はAccess deniedで完了せず、実試験は固定既存cacheで実行。証拠の削除はしていない。
- [保存したローカル原ログ/JSON](local/)を参照。全体回帰・CI・独立レビューはPRの後続記録とChecksへ追記する。

## ロック所有権喪失の有界追加点検

- 初回提出2799686の隔離CI [41934177983](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/41934177983)は成功。既存単体/lint/typesもそのHEADでは成功。これを後続HEADの検証に流用しない。
- async callback待機中のlock request rejectを2条件（PRESERVED/WRITING）で注入すると、外側の停止後にcallbackがterminalへ再遷移し例外になる反例を検出。旧版がprimaryを上書きしたと断定しない（RED理由はterminal二重遷移の例外）。同じ2入力へ明示active fenceとterminal初回failure保持を追加してGREEN、全49/49・skip0。REDの`-t`指定で他47件は未実行、最終の49成功は別の全固有実行である。製品の歴史的欠陥ではなく今回試験基盤の修正。
- 実ブラウザの別pageからWeb Locks stealを実行し、両engineでUNKNOWN＋遅延primaryCalls0＋original保持。既存各14から**各15、計30ケース**へ追加。過去28結果はそのまま保存。新集約もlate-primary、例外付きPASS等を拒否する（最終新契約15件）。
- 初回CIと今回の修正理由/RED/GREENを残して再pushする。終盤の文書だけのpushで実行中GUIを繰返し取消す運用はしない。最終HEADのCI/正式GUIと独立レビューは後続報告に分離する。
