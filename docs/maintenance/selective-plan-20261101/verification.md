# 第2段階の実装・自己検証記録

2026-11-01 JST。Issue [#114](https://github.com/tetsujisugimori-coder/calculator-memo/issues/114)。Draft PR未作成、独立レビュー未実施。

## 基準と承認範囲

- fresh isolated clone: `C:/Users/tetsu/Documents/Codex/2026-11-01/task-6/repo`、branch `feat/selective-restore-plan`。
- remote main `528a6a0a9a51077c5a81bf78c8a6724b5eb1da77`、tree `17ae5b5532754e6da005f39c33520b8598f66538`。#113 mergedをAPIで確認。実行計画の既存Issue/PR重複なし。
- Library `libfile_febf5aa6df648191ae12d1b610910ed7`、全492行/has_more=false/version nullのread内容をそのままIssue本文へ保存し、別fetchで全文一致。原本バイナリ同一性とは区別。
- 既存checkoutは読取のみ。新機能は計画・検証・表示まで。保存実行、main push、merge、auto-merge、Ready、公開を行わない。

## 事前設計と方式

[12受入条件・型別規則](../../design/selective-restore-plan.md)を製品実装前に固定。既存の厳密JSON/数値比較/参照parser/復元構造検証を再利用。pure関数はストレージ能力を受け取らず、候補データはメモリ内だけ。lossless編集方式は未確立なので変更計画は原文保持BLOCKED。UNCHANGED事前検証PASSも実行承認ではない。

## ローカルの実測（提出前dirty作業版）

Windows 10.0.26300 / Node24.20.0 / npm11.17.0、固定Playwright1.56.1。CIのUbuntu24.04/Node22.13.0と区別する。

- 通常npm ciは証明書chain検証で失敗。TLS検証を無効化せず、Node `--use-system-ca`で固定依存導入成功。依存導入完了前の最初の型/試験はmathjs等未解決（試験0件）で、製品REDではない。既存lockfile変更なし。
- 初期新規core36＋既存preview35/UI21＝92件成功。追加後core43/UI23＝66件成功。構造候補の成立/失敗、子だけの変更禁止、親全体への包含、scope別ID、確認履歴、未選択reportの参照消失、意味変更UNKNOWN、-0/巨大数値、原文保持、生成途中失効を検査。
- 全単体初回は116 files、2532件中2531成功/1失敗。既存 `markdown-report-example.md` のcheckout CRLFとGit正本LFの差。正本blobをそのまま読戻してローカルファイルを修正（リポジトリ内容差なし）し、対象46＋core43＝89件成功。最終全単体は後記/PRへ追記。
- 初回lintはrender中のref参照を検出し、選択stateオブジェクトの同一性で失効を判定する方式へ補正。型検査・通常build・Pages build成功。最終変更後は再確認中。既存observerのunused警告2件は基準にも存在し対象外。
- 初回独立GUI: Chromium4/4成功、WebKit375lightで読取失敗を注入するとpollが先に生成ボタンを無効化し、試験側tapがtimeout。旧JSON/trace/PNGを `outputs/gui-first` に保存。試験の操作先だけを常時有効な明示再取得へ補正。禁止操作をforceせず、期待値/timeoutは不変。
- 補正後GUI: Chromium4条件成功、WebKit375lightで閉室後フォーカスが入口に戻らないことを検出。既存Modalはtouchでfocusしない入口を取得できずbodyへ戻す。専用単体 `returns focus to the preview launcher even when touch did not focus it` を修正前RED（1失敗/22skip）で確認。プレビュー入口ref＋閉室後effectの局所修正後、同じ単体を含むUI23/core43成功。共有Modal・他モーダルは変更しない。第2回証拠は `outputs/gui-second`。修正後8条件は確認中。
- 既存CI契約の初回はcheckout CRLFでworkflowのLF splitが不成立。workflowをGit正本bytesへ戻すと50/59成功・9失敗。9件はLinuxの `bash`/`timeout`/signal exit契約をWindowsで実行した経路差で、正式Ubuntu結果へ引き継ぐ。新規契約2件は成功。期待値は変更しない。

## 保存非干渉と残余

### 提出後の自己点検P2と修正（2026-11-01 JST）

- 初回提出47eb804/tree1b77ea9fの独立計画CI [41303393061](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/41303393061) は8/8成功。artifact13081574106の完全ZIP3,205,224bytes、SHA256 `ba2af3ca506e0cb9879dd8331029279e7ab901738e537c22639cf4bf5c040aa9` をAPIと一致確認。ZIP CRC全35file・16PNGのchunk CRC/IDAT展開、provenanceのHEAD/tree/dirty=false/run/attemptを照合。保持期限2026-11-08T11:50:02Z。旧HEADの証拠として保持する。
- 追加自己点検で、設定・履歴formulaExecution・メモcalculationPolicyの未知の入れ子参照がUNCHANGED計画でPASSになるP2を3件の振舞い試験で再現（期待UNKNOWN/実PASS）。独立レビューの発見とは称しない。
- ローダーが保持する未知の入れ子情報を参照なしとは推測せず、計画専用の追加検査でUNSUPPORTED/UNKNOWNへ。既存第1段階parser・保存形式・保存処理は緩和しない。設定の未知fieldは未選択でも検査し、参照不明件数を別表示。3件RED→GREEN、未知設定のUIと200選択/20DOMページの受入も追加した。
- 修正後ローカル全単体 **116files/2538 PASS**（core46/UI25）、lint/error0・型・両build PASS。旧CIのunit2533・旧独立8/8を修正後成功へ流用しない。最終HEADの正式/独立CIと成果物を再確認する。
- 旧正式run41303393058は提出後点検時点で5独立job success、正式jobはunit/lint/type/両build/契約を通過してGUI準備中。今回P2修正pushで既存concurrencyによる旧run中止が発生したら、その旧結果を保持し、新HEADの正式完走へ混算しない。推測性能修正・無根拠rerun・上限変更は行わない。
- タスクへのPR添付はローカルapp応答が返らず、確認readも応答なし。実行結果は不確定、再送なし。GitHubのDraft PR115自体の作成・全文/HEAD読戻しは確定。コード作業やCIを阻害しない。
- 同じ参照安全性の追加対照で、UNCHANGEDの選択レポートがバックアップと現在で異なる参照先内容を持つ場合も偽PASSとなる1件をRED再現。変更不要でも選択項目の参照出典はバックアップとして比較する1行補正でUNKNOWNへ。対象core47/preview35/UI25＝107件GREEN、全116files/2539件PASS、lint/type/Pages build PASS。通常buildは確認後PRへ記録。旧76484bbの8条件CI成功も新候補へ流用しない。
- 依存影響の受入を順序違いで追加し、直接UNKNOWNとなる登録式→選択レポート、および子を親より先に選ぶ場合の3件が、全体BLOCKEDは維持しながら関連行ADDのままになることをRED再現。直接判定後に有限の逆依存グラフで伝播する方式へ局所補正。関連行と復元後の参照をUNKNOWN/BLOCKEDへ揃える。無関係行の診断は維持する。
- 上記補正後、全116files/2542件（core50/UI25）・lint/type/両build PASS。P2修正は全て振舞いRED→GREENに基づくもので、性能推測変更や成功選別のCI再試行ではない。最終候補の正式6条件を別HEADで終端確認する。
- [正負対照の追跡表](negative-controls.md)に参照7件と、別枠の数値4件・focusを対応付けた。数値4例はf5250c7で実効UNKNOWNでも予定REPLACEを残す表示をRED再現し、厳密検証validの時だけ予定を設定する1条件の補正でGREEN。全2542件・lint/type/両build PASS、試験数を増やして同じ試験を二重計上しない。
- 親指定の旧bed取消根拠: job124842187086は12:02:26–12:21:10 UTC（18m44）。API注記が `Canceling since a higher priority waiting request for pr-gui-115 exists` と明示。旧/新run actorとtriggering_actorは共にtetsujisugimori-coder（取消実行者fieldとは別）。f5250c7 commitは12:20:45Z、新run41306053588は12:20:51Z起動、取消logは12:21:04.662Z。公開events APIから当該PushEventは取得できず、pushの秒単位を推測しない。metadata/注記/decoded log/全ZIPを保全。
- 旧bed正式artifact13082939361は18,078,872bytes/sha256 `9d44c59140909a34034d5bb8ffc905b5c83161434c4c8b19f5ba30c53e1e491c`。保存562checks/282geometry/64PNG、desktop1完走・narrow/WK375/WK390の3途中、他2条件は証拠なし。未完了をPASS/製品FAILにしない。最終HEADの結果とは別に保管する。

### 提出直前の確定結果（11:44 UTC）

- 全単体: **116 files / 2533件 PASS**、121.68秒。新規core43/UI増分10を含む。初回CRLF差1失敗は取り消さず上記に保存。最終型検査・lint（error0/既存warning2）・通常/Pages build PASS。
- 修正後の独立GUIは **8/8 PASS、88 touch、16 PNG**。Ch/WK×375/390×light/dark・CSS200%。全条件で保存不変/app set/remove/clear=0、keyboard生成focus、入口へのfocus復帰、失効と明示再生成、page/modal横幅を確認。11:42:57–11:44:08 UTC。元結果JSON・16枚のSHA256 manifestはignored `outputs/local-gui-manifest.json` と `gui-evidence/` に保持。基準HEADのdirty作業版であり、最終commit CIの証明へ流用しない。
- 修正前フォーカスREDは `outputs/focus-red.log`、修正後は `outputs/focus-green.log`。GUI第1/第2失敗も別保存。最後にrunnerの証拠へtreeと配信bundle SHA256を追加し、新規契約2件PASS。最終commitのGUIはCIで別確認する。
- 提出直前remote mainは同じ528a6a0a、専用remote branch不存在。最終HEAD/tree・Draft PR・正式CIは作成後追記する。独立レビュー未実施。

core/UI spyと完了したGUI条件で、現在原文・バックアップ原文・保全slot・他キー不変、アプリset/remove/clear=0。fixture設置と独立writerだけが合成データを変更し、アプリ書込と混算しない。実利用者データは一切操作しない。

正式6条件/1128検査/592geometry/132PNG/3workers/30分、既存workflow・scenarioに内容差なし。WebKit遅延根因UNKNOWNを保持し、前PRの一度の正式完走を恒久改善としない。正式CI、成果物、最終HEAD/tree、最終自己検証はDraft PRから追跡する。実機iPhone Safari/VoiceOver/OS文字拡大/ソフトキーボードは未検証。自己検証は独立レビューではない。
