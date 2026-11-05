# Stage 3B-3 検証・残件台帳

Issue [#126](https://github.com/tetsujisugimori-coder/calculator-memo/issues/126)。開始main `41c2c0db0ec2`、作業branch `feat/stage3b3-storage-facade`。
[設計と全writer追跡](../../design/storage-facade-stage3b3.md)。**ローカル実装・回帰済み、最終HEADのCI/実GUIはDraft PRのChecks・最終本文で確認する。選択復元実保存NO / HOLD。**

## 提出前の実測結果

ローカルNode24.22.1、開始main上のdirty worktreeを対象とした実測。後続commitのCI成功を先取りしない。

- 全単体/統合: [124 files / 2820 tests PASS](evidence/full-test-final.log)、失敗0/skip0。
- [型検査](evidence/typecheck-final.log)、[lint](evidence/lint-final.log): exit0、error0/既存warning3。
- [通常build](evidence/build-normal.log)、[Pages build](evidence/build-pages.log): exit0、既存bundle size等warningは保持。
- 静的writer境界: [製品120files / 違反0](evidence/writer-final.json)。[作者52 + 独立6 + harness5 = 63契約PASS](evidence/boundary-and-harness-final.log)。独立scannerは元反例を変更せずRED→GREEN。
- 既存[正式GUI/失敗伝播契約57件PASS](evidence/formal-contracts.log)。これは実GUIの6条件成功ではない。
- 既存Stage3B2 model/architecture、Stage3B1 evidence、Stage3A、全体復元/保全managerの[Node契約72件PASS](evidence/existing-safety-contracts-final.log)。製品選択保存非接続の契約も維持。
- 新Facade故障単体68件と独立Facade反例15件は全単体2820に含む。補助fixture3件も含む。
- 独立報告/元RED/再受入GREEN/ソースhashは [independent-review](independent-review/) に保存。レビューと実GUI成功を分離する。
- ローカル追加実GUIは3試行すべてexit1/起動0条件。[全原証拠](evidence/local-browser/)を保存。Chromium socket EPERM（承認済同一試験escalationでも再現）、WebKitはlibgtk-4/libgraphene/libwoff2dec/libharfbuzz-icu/libhyphen/libmanette/libGLESv2不足。実操作はCIでのみ検証する。

## 初回CIの追加GUIハーネス修正

初回HEAD `bec0c6b958dc75174f77096e958df091aa3739b3` / tree `14e7322bff42f530a1c57405d780ae29b5e11c3e` の [run 42126158616](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/42126158616) は追加GUIでFAIL。8幅/engine条件・48contextすべてを実行し、32PASS / 16FAILだった。閉じたnative details内の計算式textboxを開かずにfillしていたため、happy/autosave-unknown各8件が操作前に停止した。reset成功とpreservation/delete/reset UNKNOWN各8件はPASS。

原artifact `13461504020` のSHA-256は `2dfe84e24f5a56c5dfeb60ce17c18965452484c4563de6cc7e4786ebbdb7be2e`。ダウンロードしたZIPのhash一致を確認。原results/provenance/runner/log/診断は [ci-first-red](evidence/ci-first-red/) に保存し、40PNG/16traceを含む全原ZIPも別途保管。製品失敗と断定しない。

ハーネスは実ユーザーと同じsummary click/tapでeditorを開いてからfillし、reload後は既定で可視の計算ボタンを待つよう修正。force/unhide、製品コード変更、保存・HOLDの期待緩和は行わない。再発防止契約を1件追加し、harnessは6件。修正後の実GUI成功は新HEADのCI原artifactで別途確認する。旧HEADの32PASSを新HEADの完了へ流用しない。

## 独立P2と再受入

| ID | 元反例 | 修正・判定 |
| --- | --- | --- |
| R1 | scannerがStorage alias export、any関数引数、imported Storage型、@/test import、object参照代入、imported untyped関数の6経路を受理 | export/参照持出し拒否、@/解決、graph型aliasとtyped引数境界を追加。独立元6反例は変更なし6/6GREEN |
| R2 | recovery outer session requestがinner write lock待機中にrejectし、UNAVAILABLE返却後の遅延callbackが1削除 | guarded.validでouter liveをmutation直前に再検証。独立同反例を含む15/15GREEN、遅延削除0 |
| R3 | Node24 native Locksに同期callbackを渡し、callback throw後に次requestが停止 | 従来のasync callback wrapperを復旧。独立sync RED/async GREENを保存。Node環境回帰であり実ブラウザ欠陥とは未断定 |

R3修正に伴い独立late callback testは同期throw観測をPromise rejection観測へ変更し、mutation0・原文不変の安全oracleは維持。元testも保存。既存selection-preview fixtureはcallback実行前にlock requestをresolveしていたため正しいpending lifetimeへ変更し、書込み0の期待は変更しない。
初回全単体[2709/2726](evidence/full-test-initial.log)、中間[2813/2815](evidence/full-test-intermediate.log)の失敗を保存し、後の全2820成功で過去結果を上書きしない。

## 開始時確認

- 最新mainを新規checkout。PR #125 merged。open PR #80/#71は別目的でStage 3B-3の重複なし。既存ユーザーcheckoutを変更しない。
- AGENTS/README/LOG、docs/agent/github-workflow/verification-policy、Stage3B2設計・writer台帳、既存formal・restore・recovery・storage安全性workflow/試験契約を確認。
- `.agents/skills`はcheckoutにない。参照失敗を成功扱いしない。
- 初回npm ciは既定cache `/home/agent/.npm` 作成不能で失敗。許可済 `/tmp/calculator-npm-cache` にcacheを指定して既存lockfile依存を導入。lockfile変更なし。ローカルNode24.22.1とCI固定Node22.13.0を区別する。

## 証拠区分

- 単体/故障注入: `tests/storage-facade.test.ts` と既存storage/restore/recovery/app回帰。実データを使わない。
- 静的契約: `e2e/storage-writer-boundary.mjs` / `.node-test.mjs`。既知6 sinkの旧main拒否は [baseline-writer-red.json](evidence/baseline-writer-red.json)。隔離git fixtureへ直接writerを追加してCLI exit1、除去後exit0を検査する。
- 追加実GUI: Chromium/WebKit ×375/390/765/1280。新規contextと合成データ、owned loopback origin、source/bundle hash付き固有証拠directory。
- 正式GUI: 既存6条件・1128 checks・592 geometry・132 PNGを不変更。原artifactから既存aggregate-formal-guiで再集約。局所GUIは代用しない。
- 独立レビュー: 実装者と別担当の反例を記録。自己点検を独立PASSと呼ばない。
- 最終HEAD/tree/CI/artifact: 最後のpush後に実測してPR本文/Checksへ追記。前SHAの成功を流用しない。

## 原失敗と設計変更

- 旧保存helperはset返却後にattemptを記録し、throw-after-writeをunavailableへ誤分類し得た。Facadeは呼出前にattemptを記録しUNKNOWN/HOLDへ変更。保存後mismatchもCONFLICTではなくUNKNOWNへ変更。
- 元resetは読戻しなし、保全失敗は一般失敗のみ。新結果契約は読戻しとUNKNOWN伝播を必須にし、UIの自動retryを止める。
- 初期共通APIには同期recovery-deleteからexclusive sessionを迂回できる余地があり、実装中の反例点検で修正対象化。private capabilityと独立負対照で再確認する。
- 初期scannerはメモリ本文挿入の `.prepare/.insert` をDB mutationと誤検出。永続APIとDB接続に検出条件を分け、広いファイル除外では対処しない。
- ローカルGUI初回はChromium sandbox socket Operation not permittedで起動0条件。元failure artifactを保持し、同じ隔離loopback試験の許可されたsandbox承認経路を使う。未起動をPASSにしない。

## 保証外・次工程

実機iPhone Safari、VoiceOver、OS文字拡大、soft keyboard、private mode、電源断、長期保存、browser全killはNOT_TESTED。Playwright WebKitと同一視しない。
UNKNOWNはこのページのruntime HOLD。再起動/他タブを跨ぐ永続HOLDとreceiptは未実装。旧writer/ABA/TOCTOUの解消を主張しない。
後続Stage3B4: transaction-aware IDB adapterの隔離受入、authority reader、永続generation/incarnation/receipt/protocol、明示移行と旧LS分岐救出。今回の機能を本番選択復元へ接続しない。
