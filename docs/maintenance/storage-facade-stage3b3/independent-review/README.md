# Stage 3B-3 independent adversarial review

記録日: 2026-11-06 JST。実装担当と別担当が、製品コードを変更せず、独自の反例・試験と修正後再検証を実行した。

## 判定と対象

**限定したコード/契約レビュー: PASS。全受入判定: PARTIAL（実GUIと最終commitのCI/artifact対応は別途確認待ち）。**

未解決の既知P1/P2は、このレビュー範囲では0件。下記P2は修正後に独立再実行済み。これは任意JavaScriptを完全解析した証明、完全な保存アーキテクチャの完成、マージ承認ではない。

- 基点HEAD: `41c2c0db0ec2b7dde81ada15c98de5316ab690ce`、branch `feat/stage3b3-storage-facade`。
- 審査対象はこの基点に対する **dirty source**。基点HEAD/treeを新実装のcommit/treeとして扱わない。
- 審査確定sourceは [reviewed-source-manifest.json](reviewed-source-manifest.json) の各ファイルSHA-256。製品全120ソースと変更された検査・workflow・試験ソースを収録した。最終commitに含まれる同名ファイルとの照合が必要。
- `AGENTS.md`、検証方針、Stage3B2 writer/architecture設計、Stage3B3設計、関係する製品差分、保存/復元/保全/選択UI、scanner、追加GUI runner/workflowを参照。
- 親担当がGitHub/最終CI/artifactを確認する。本担当はpush、公開、mergeを行っていない。

## 最終stage時のbyte差分再確認

2026-11-06 JST、最終stage後に旧manifest全141 sourceを再照合した。差分は `lib/storage-format.ts` と `lib/recovery-records.ts` の末尾LF各1 byte除去だけだった。現ファイルにLFを1 byte追加したSHA-256が旧hashと一致することを確認し、内容行の不変をbyte単位で検証した。manifestの該当2hashとaggregateを更新した。新aggregateは `9551d1023b018186984524c8d9a8aba2471df92b99ce81d0ceb137ddf47d443d`。

新規 `.gitattributes` の例外は `/docs/maintenance/storage-facade-stage3b3/**/*.log -whitespace` に限定される。原ログのbyteは書き換えず、製品sourceや他領域のwhitespace検査は緩和しない。`git diff --cached --check` はexit0。末尾空行だけの変更に対する新たな動作試験は実施せず、前記最終実行の対象との内容同一性確認を根拠とする。詳細はmanifestの `stagingAmendment`。

## 初回CIのharness修正に対する独立再確認

2026-11-06 JST追記。旧HEAD `bec0c6b958dc75174f77096e958df091aa3739b3` の追加GUI [run 42126158616](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/42126158616) 原resultsを再集計し、8 matrix ×6 contextは **32 PASS / 16 FAIL** と確認した。happy/autosave-unknown各8件は、初期closedのnative details内のtextboxへ直接fillしてtimeout。Chromium/WebKit375の原traceには先行summary操作がなく、snapshotのDETAILSにopen属性もなかった。製品の初期状態とも一致し、この失敗から製品不具合は確定していない。

変更は `e2e/storage-facade-browser.mjs` と `e2e/storage-facade-ci.node-test.mjs` のみ。実click/tapでsummaryを開き入力の可視を確認してからfillし、reload後は閉じたtextboxでなく可視の計算buttonを待つ。計算値、raw一致、HOLD、retry回数、timeout、matrix/context数の期待は弱化していない。独立 `node --test e2e/storage-facade-ci.node-test.mjs` は **6/6 PASS**。これは修正後の実GUI成功ではなく、新HEADのCI再実行待ちである。原REDを保持し、旧32 PASSを新HEAD全体成功へ流用しない。

製品hashは全て不変。manifestは該当2fileのみ更新し、新aggregateは `beb75a849e5001057d53d2fd37bdf62155e194f4e374d9a1b0f9ae3d64189f32`。旧commit/旧hashは `ciHarnessAmendments` に保持した。先行の「GUI未確認」という記述は当時の状態であり、本追記は旧HEADの一部実行結果を追加するもの。総合PARTIAL・マージ推奨NO・選択保存NOを維持。

## 第二CI失敗の正式契約・tablet修正に対する独立再確認

2026-11-06 JST追記。旧HEAD `715808cfbc889018a1443d2364c487d4fea0e8fe` の正式 [run 42128709991](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/42128709991) 原6条件を独立再集計し、成功完了0/6、144 checks・154 geometry・36 PNGと確認した。各原traceのquota後は「保存保護」と「UNKNOWN再試行停止」の2 alertsであり、旧単一alert/同runtimeでのretry期待が現安全契約と不一致だった。別の追加GUI [run 42128710003](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/42128710003) は43/48成功、5失敗。optional保存container未生成時のpoll例外3件と、765pxのcalculatorによるnotes新規作成buttonのpointer interception2件を区別する。原765px failure PNGを実見し、製品layout不具合を確認した。

修正審査結果:
- 正式quotaは1 mutation attempt、保存生raw・title/body/remarks/根拠ID保持、両save disabledを確認。API復旧後のdraft再編集と1600ms観測でも1attempt/no retryを保持する。明示reload後の新runtimeへ未保存remarks/linkを実UIで再入力し、元のpending-lockと確認履歴assertへ戻る。製品HOLD解除や保存fixtureの差替えを使わない。
- 追加7回の実UI操作を区間で照合し、mobile touch契約を1337から1344へ増やす。旧1337を誤受理しない負対照も追加。
- CSS変更は既存2列+notes次行の `max-width:1080px` 内でcalculatorをstaticにする2行のみ。storage実装は全hash不変。1365pxは従来sticky/28±1を保持し、721/800pxは自然flow・notes非重なり・button center hit/有効/viewportへ既存checkpoint内で検査を更新する。
- optional containerのnullsafe pollは未生成時undefinedを返し、従来と同じ固定式 `x+1` /本文一致を待つ。期待値やtimeoutを緩めていない。
- 765pxの旧sticky一時注入→実CSSへの復帰をnative hitで比べ、styleをfinallyで復旧し、生raw/mutationログ不変も検査する。ただし、この新しいブラウザ対照は次CIでの実行待ちであり、実GUI GREEN済みとは呼ばない。

独立実行: [正式/追加harness等4suite最終87件PASS](second-ci-controls-green.log)。別途、live scenario assertionを抽出した自作30反例（欠落/余分attempt、raw字句変更、draft欠落、保存有効化、旧sticky、座標drift、notes重なり、hit不成立、desktop誤gap等）も全拒否を確認した。[独立ログ](second-ci-independent-oracles-green.log)。AST再照合でpassed呼出125→125（layout名1件のみ改称）、screenshot呼出68→68（全引数不変）。正式aggregate source自体は不変更で、**1128/592/132と6条件の完遂要求は維持**。これらはブラウザ実行の成功を代替しない。

原REDは [保存済み第二CI証拠](../evidence/ci-second-red/) に保持。manifestは新CSS、正式scenario/contract、追加負対照とworkflow配線を含む148ファイルへ拡張し、9変更sourceを照合した。新aggregateは `7257c88abf5f04c1d30c07c08a039188233c49f35a74f90b9e947965bda3b853`。全storage製品sourceの審査hashは不変。限定コード変更は次CI検証へ進められるが、新layoutの実GUI修正確認と正式/追加全条件の原artifact再集約は未了のため、**PARTIAL・merge NO・選択実保存NOを維持**。

## 発見事項とRED → GREEN

### IR-1 / P2: scannerの単純なStorage逃がしと除外領域importを誤受理

初期実装はfile単位aliasを追うのみで、次の4例を `failures=[]` とした。

1. `const store=localStorage; export {store}` と別fileのimport後の `store["x"]="y"`。
2. local関数のuntyped/any引数へStorageを渡し、引数上でproperty代入。
3. 別fileからimportした `type Store=Storage` 引数上のproperty代入。
4. `@/tests/...` のpath alias経由で除外されたfake writerを製品からimport。

初回修正後の限定した再レビューで、さらにpropertyへの参照代入 `box.store=localStorage` と、別fileのdefault untyped functionへStorageを渡す2例が残った。これらも別の固定反例として記録した。再レビューはこの追加ラウンドまでに限定した。

- 根拠/固定試験: [scanner-independent.node-test.mjs](scanner-independent.node-test.mjs)、[scanner-escape-independent.node-test.mjs](scanner-escape-independent.node-test.mjs)。6例すべて、発見時から期待を変更していない。
- 原RED: [scanner-original-red.log](scanner-original-red.log)（4/4失敗）、[scanner-escape-red.log](scanner-escape-red.log)（2/2失敗）。
- 修正: `e2e/storage-writer-boundary.mjs` の型alias/import解決、path alias解決、export/property escape拒否、typed function parameter境界（現審査版148–198行付近）。未解決/型消去を安全側へ拒否する。
- 独立GREEN: [scanner-final-green.log](scanner-final-green.log)、6/6 PASS。
- 正当経路: [repository-boundary-final.json](repository-boundary-final.json)、347対象source中120製品source・違反0。既存負対照/CI契約も57/57 PASS。

### IR-2 / P2: outer recovery lease喪失後にqueued deleteが実行可能

故障LockManagerでexclusive recovery-session callbackを開始し、inner write lockを待機させた後にouter requestをrejectすると、呼出元はUNAVAILABLEを受けた。その後inner callbackを解放すると、既存 `guarded.valid` はouter requestのlifetimeを見ず、保全copyの `removeItem` が1回実行された。

- 根拠: `tests/storage-facade-independent.test.ts` の最後の試験。初期 `lib/storage-facade.ts:185`。
- 原RED: [facade-original-red.log](facade-original-red.log)、14 PASS / 1 FAIL。返却後のremove 1回を実測。
- 修正: `guarded.valid` に `live` を含め、inner lock待機後に再検証（審査版同185行）。
- 独立GREEN: [facade-green.log](facade-green.log)、15/15。最終sourceでも下記278件の一部として再PASS。対象deleteの0回という期待、UNAVAILABLE返却、元copy存在の期待は不変更。
- これは故障注入によるlifetime反例。正常なnativeブラウザLockManagerで同じ故障が発生すると主張していない。

### IR-3 / P2: Node24 native LockManagerでqueue回復試験が停止

既存 `tests/evidence-storage.test.ts:52` が、独立回帰実行および単独実行とも5秒timeout。同期throwのLockManager callbackから次のrequestが進まないことを、製品に依存しないNode24.22.1実験でも切り分けた。

- 原失敗: [targeted-regression-failure.log](targeted-regression-failure.log)、[evidence-storage-isolated.log](evidence-storage-isolated.log)。
- 最小機構反例: [native-lock-callback-repro.mjs](native-lock-callback-repro.mjs)。[sync/RED](native-lock-sync-red.log) はexit1、[async/GREEN](native-lock-async-green.log) はthrow捕捉後の次requestまで到達・exit0。
- 修正: `lib/storage-lock.ts:29–32` は従来同様のasync callbackで `invoke()` を呼ぶ。timeout延長・期待緩和ではない。
- 独立再実行: 既存7件を含む最終278件PASS。Node24で観測した互換回帰であり、Node22 CIや実ブラウザで同じ不具合があるという判定ではない。

## その他の独立確認

- W1–W12のautosave/明示メモ/レポート、W13 reset、W14保全、W15全体復元、W16個別削除、未使用公開saveData helperを旧台帳から末端へ追跡した。既知sinkの末端はFacade → adapterに集約され、製品のnative set/removeはadapter内のみ。
- `storage-format.ts` の旧reader部分は、必要な関数export以外の実質変更がないことを旧sourceとの差分で確認。default v1、unknown field、原文保持の既存境界は維持。
- 自作15件は通常save/競合・不正先拒否、正確な原文/数値字句/バックアップrecord形、8copy/9件目拒否、無関係key不変、ordinary/reset/preserve/full-restoreのthrow-after → UNKNOWN/HOLD、delete throw-after/no retryを含む。
- sync Facadeと注入adapterの両方からrecovery-deleteを直接呼んでもBLOCKED・remove0。private capabilityは公開同期窓口に渡されない。
- selective-restoreへruntimeで `executionAllowed:true` を偽装しても同期/非同期ともBLOCKED・write/remove0。実際の選択UI29件も再実行した。
- lock取得失敗の無lock fallbackなし、late callback書込み0、release例外後のUNKNOWN/HOLD、同期wrapperのlock失敗後uncertain伝播を独立試験した。
- `CalculatorApp` のautosave/明示メモ/レポートはlock完了後に成功を公開し、明示保存中にapp状態が変わった場合はUNKNOWNとしてdraftを保持する差分を確認した。`RestoreModal` のpreservation UNKNOWNはterminalへ伝播。
- resetの旧boolean wrapperは互換のため残るが、製品UIはchecked結果を利用する。falseを未書込み証明として扱わない。

## 最終実行結果

1. 独立Facade15件を含む関係12ファイル: **278/278 PASS**。[ログ](targeted-regression-final-green.log)。全リポジトリsuiteの代用ではない。
2. 独立scanner反例: **6/6 PASS**。[ログ](scanner-final-green.log)。
3. 既存writer boundary負対照＋追加GUI CI契約: **57/57 PASS**。[ログ](ci-boundary-final-green.log)。
4. repository static boundary: **120製品source、違反0**。[JSON](repository-boundary-final.json)。
5. `tsc --noEmit`: **exit0**。[ログ](types-final.log)。

実行環境はNode24.22.1/Vitest3.2.4。CI固定Node22.13.0とは区別する。故障注入で意図したconsole errorが含まれるが、suite結果を削除/加工していない。

### Fixture修正の開示

- 独立lease試験の初回作成時、fake callbackへlock引数を渡さずinner branchに到達しなかった。これは製品REDではない。[setup failureログ](facade-harness-setup-failure.log) を分離保持し、引数を修正して実際のdelete反例を得た。
- async lock callback契約復旧後、独立late callback試験は同期throw専用matcherからPromise経由のreject観測へ変更した。同期throw/Promise rejectのどちらも認め、書込み0の安全期待は不変更。[元試験全文](original-facade-controls.ts.txt) を保持。
- 既存selection-preview queued-lock fixtureはcallback前にrequestをresolveしていたため、callback完了までpendingにする正しいlifetimeへ修正された。元データ不変/write0の期待は不変更。差分を読み、29件再PASSを確認。
- quota例外の旧unavailable/再試行期待をUNKNOWN/HOLDへ変えた関係試験は、明文化された新結果契約に沿う。成功を得るためにUNKNOWNを正常扱いする変更ではない。

## GUI・証拠の境界と残件

追加GUI runner/workflowのsource/CI契約を確認した。exact PR head、source/bundle hash、専用loopback、fresh synthetic context、8 matrix ×6 context、失敗trace/結果保持、retention7日、read-only permissionsを含む。ただしsource契約のPASSは実操作のPASSではない。

ローカルの原 `gui-evidence/storage-facade-*` results/runner outcomeを実際に読んだ。全3 runはfailed・cases0。最後のrunはChromiumのsocket EPERMとWebKitの依存共有library不足をengine別に記録している。実行条件はdirty sourceで、baseSHA文字列だけを新実装のcommit保証に使わない。

**Chromium/WebKitの追加GUI成功、正式6条件1128 checks/592 geometry/132 PNG原artifactの再集約、最終commit/tree/CI対応は本報告時点で未確認。** 正式GUI workflow/基本scenarioをこの変更で成功へ読み替えていない。追加GUIは正式GUIの代替ではなく、Playwright WebKitは実機Safariではない。

残る保証外は既存設計通り: 非協調writer/旧bundle、ABA/最終read-write間TOCTOU、読戻し後の変更、ディスクflush、再起動/他tabを跨ぐHOLD、receipt/generation/incarnation、IDB transaction、protocol gate。scannerは規約違反検出であり任意JSや依存packageを封鎖するsandboxではない。新entry/API/型境界はコードレビューを継続する。

この限定コードレビューの既知修正受入は完了。**全体マージ推奨はGUI/最終CI確認までNO、選択復元実保存許可はNO、Draft維持・mergeなし。**
