# PR #95: 同一ID終端の曖昧さと内部記録漏出

## 着手確認（2026-10-26 22:13 JST）
- 基準・GitHub最新HEAD: `d7d6031b8a7e4bb5a296ba199febf04d5b073592`。対象 `feat/audit-comparison-fixed-insertion`、既存PR #95はDraft/open/未マージ。作業前のこのクラウドworktreeはclean、他worktreeを変更しない。Windowsは操作しない。
- Issue #94、既存独立レビュー、旧最終CI `40322568773` attempt 1のsuccessを確認。旧2110単体/41契約/966GUI/568geometry/120PNGは修正前の検証範囲であり、今回の終端一意性を証明したものではない。
- 同じクラウド環境の別案件が時間計測中のため、最初はソース読解と試験・文書追加だけを行う。実行前の推測を実測と混同しない。

## 再現仮説・先行する期待値
正規記録A → 資料M開始 → 同ID正規終端の早期複製 → 内部記録B/引用/差分 → 本来の同ID終端。
現scannerは最初の終端で完全領域を返し、後続孤立終端からだけ不完全領域を作る。この処理順序では間のBが除外されない。LF/CRLF/CRそれぞれ、外側Aと外側引用を残し、M開始からEOFを不完全領域として保護し、B・内部引用/差分を除外する期待値を製品変更前に追加した。UIはStrictModeで両方の選択欄を確認する。

## 実装前の選択肢
- 第一希望: 既存Markdown blockの厳密な開始/終端JSONから、同じ開始に対する正規終端の一意性を先に確認する。曖昧なら元の開始から既存の不完全EOF保護へ落とす。文字列の削除・推測修復・新形式は導入しない。
- 次善策: 後方孤立終端の検出後に先行の完全領域へ戻って保護範囲を訂正する。ただし既にpoisonedになった領域や別資料をまたぐ場合の探索が複雑になるため、事前検査を優先する。
- 単純な全体同ID終端数判定は、正常に閉じた資料が同IDで二つある既存ケースの間の独立根拠を消すおそれがあるため採らない。厳密な開始区間を区別し、既存の重複資料ID判定は維持する。

## 検証状況
この文書の初期記録時点では追加テスト未実行・製品未修正。RED/GREEN、独立レビュー、正式CI、最終HEADと成果物は実施後の記録で確定する。既存のローカル100ms fixture、WebKit時間変動、PR #85位置ずれ全原因未特定、実機Safari/VoiceOver/OS文字拡大未検証は保持する。

## 同一期待値による再現・修正（22:27–22:31 JST）
- 実装担当RED: 48件中6失敗/42成功、Vitest28.60秒、コマンド実経過32.169秒。新規core3/StrictMode UI3の全改行条件で失敗。`red-own.log` / `red-own-timing.json`。
- 独立担当RED: 18件中12失敗/6成功、Vitest13.57秒、実経過19.949秒。別ID/未知/不正start介在、全体start/end数均衡でも漏出を検出。`red-independent.log` / `red-independent-timing.json`。
- 第一希望を採用。変更は製品 `lib/formula-report-audit-comparison-record.ts` 一つ。正規marker一覧を既存blockから抽出し、一意性を判定してから従来の領域scannerへ渡す。早期終端を採用することなくM開始からEOFをinvalid/closed:falseとする。正常な別資料や、個別に閉じた重複ID資料の従来扱いは変えない。
- 実装担当GREEN: 同じ48件48成功、Vitest25.06秒、実経過29.048秒。`green-own.log` / `green-own-timing.json`。
- 独立担当GREEN: 同じ18件18成功、Vitest20.58秒、実経過26.497秒。`green-independent.log` / `green-independent-timing.json`。
- 合計66件は18失敗/48成功→66成功。新規は24件（18欠陥検出＋6正常対照）、既存42件の期待値不変更。性能比較を目的とした測定ではない。
- 旧結果では通常段落のgapへの挿入も許可されていた。Bそのものの内部を対象にすると旧点検record保護で拒否され、負例として弱いため、RED前に通常段落の位置へ訂正した。成功期待値の弱体化ではなく、今回の欠陥を直接検出するための独立レビュー改善。
- 独立レビューの実行範囲・制限は [independent-review.md](independent-review.md)。単体/契約/両buildと最終HEAD正式CIは別工程として記録する。

## 全量ローカル検証と手順上の失敗
- Node v24.22.1、Vitest `--maxWorkers=2`、既存5000ms上限で全2134件を実行。2126成功/8失敗、92files中85成功/7失敗、skip0。Vitest828.29秒、wrapper841.792秒。失敗8件はいずれも5000ms timeoutで、単独GREENだった今回のStrictMode LFケース1件も含む。既存dependency SVG、pending evidence2件、storage削除export、storage変更audit、quote更新、large evidence UI。原因は未確定。環境由来と決めつけず `unit.log` に保持し、正式CIの結果と区別する。
- 最初の契約実行は32/41。証拠出力先 `GUI_STAGE_EVIDENCE_DIR` を外側wrapperに指定したまま子fixtureへ継承したため、fixtureが期待する `gui-evidence` と異なる場所へ書いた手順不備を確認した。子環境だけ `env -u GUI_STAGE_EVIDENCE_DIR` で解除し、検査内容不変更で再実行。40/41へ戻り、既存100ms acquisition fixtureがstdoutより先にTERMになる失敗だけ残った。初回ログを削除しない。
- lint成功166.308秒、TypeScript成功30.328秒、通常build成功157.089秒、Pages build成功7.828秒。計測はwrapper単調時計、日時は各JSONのUTC表記。通常build警告は既存chunkサイズ等で、成功を警告なしとは表現しない。
- 最終ローカル配信物と対象scannerのSHA-256は `local-build-sha256.json`。この時点の全量ローカル結果はPARTIALであり、先行CIや局所GREENで上書きしない。

## 局所追加確認と未解決境界
- 失敗位置の同期待値・worker1診断: 7ファイルから10条件を選択、7成功/3 timeout、94条件は診断選択外（正式検査をskipへ変更したものではない）。今回の候補UI3改行は全成功、既存pending evidence2件とlarge evidence1件のtimeoutは残る。Vitest145.47秒。単純な並列競合を原因と断定しない。`timeout-diagnostic.log` / timing。
- 最終Pages buildに局所native Chromium touch390（141.0.7390.37、DPR3）を実行。既存preview/挿入取消2群は成功したが、既存第3群の編集欄 `fill` がvisible/enabled/editable待機30秒でtimeout。新しい終端負例には到達していない。2/9群、17実tap、pageerror0、13:57:11–13:58:09 UTC。製品・手順・環境のどれが根因かは未確定。`native-chromium390.json` / `.log`。成功扱い・時間延長・検査削除はしない。
- native helperは前回の局所実行用ハーネスを再利用し、新1群追加による期待件数だけ9群/71tapへ更新した。正式CIハーネスとは分けて扱う。正式6条件は最終HEADの既存workflowで実行し、局所未完走の代替成功とせずそれぞれ結果を記録する。
- nativeのfinallyでcontext/browser close、preview停止後に所有port4391の接続拒否111を確認し、13:59 UTCに他案件へCPU枠を解放した。以後の正式CIはGitHub隔離runnerでありローカル並行計測へ混入しない。

## 提出時の判定
局所scanner/選択候補の同期待値修正と独立レビューは成功したが、ローカル品質ゲート・native未完走を保持するため、提出時点は **PARTIAL / マージ推奨NO**。最終commitの実CI・全972GUI/568geometry/120PNG/成功trace0・ZIP/API digest/served identity照合をPR #95とIssue #94へ追記する。文書追記のため別HEADを作り、先行CI成功を流用しない。

## commit前の追加P2: metadata消失による重複IDの格上げ
前方の正常M1と、同IDの後方M2（早期終端/B/本来終端）がある場合、初回修正はM2のmetadataを不完全化で消すため、完成rangeのmetadataだけから重複IDを数える旧処理ではM1がinvalidからcompleteへ戻った。独立担当と静的確認後、3改行の同期待値負例を追加して21件中3失敗/18成功を再現した。M1の範囲を広げるのではなく、重複ID計数を厳密に検証済みのstartMetadata一覧に分離する最小補正を採る。

これによりpoison/交差によるmetadata除去は、観測済みのID重複を消さない。未知・破損startや通常コード内の文字列は数えず、nestedな正規startは構造上のID重複として数えるが保護を解除しない。外側AとM1の前後境界を変更しない。新しい試験総数予定は2137（基準2110＋新27）。初回の全量2134・build・局所nativeはこの追加補正前の証拠であり、最終補正後の全量・型/lint/build・正式6条件は最終HEADのCIで確認する。`local-build-sha256.json` も初回補正時のローカル配信物として保持し、最終CI配信identityへ流用しない。

追加P2の独立同一期待値結果は **3失敗/18成功 → 21成功**（skip0）。GREEN Vitest45.93秒、wrapper57.392秒、試験本体447ms。`red-duplicate-status` / `green-duplicate-status` の各log/timingを保存した。前方M1はinvalidのまま、後方M2だけEOF保護、間のAは保持、Bは候補外。起動/collect時間を製品処理時間と混同しない。14:16:07 UTCで実行終了後CPU枠を返却した。

## 2026-10-27 04:36 JST: 承認待ち後の環境差異と証拠回収
19:31 UTCに既存設計文書の旧本文保持＋P2説明7行の承認を受領。再開時、旧クラウドworktreeと一時実行storeが存在しなくなっていた。原因は未確定。Windowsや別の利用者環境には移らず、同じ利用可能クラウドworkspaceの別directoryへ同一remote/baselineを取得した。製品・全追加テスト・GUI契約・主要文書16ファイルと承認設計文書を、以前保存したGitHub blobの完全SHA一致で復元した。設計文書の既存部分もbaselineとbyte一致し、承認後の1回再試行でblob保存が成功した。

旧44ファイル候補treeは再現できていない。残り27ファイルのrawログ/計測JSONはblob一覧が失われて回収不能であり、上記の歴史的結果説明と参照先を削除せず保持するが、存在しない旧ログを現在取得済みとは扱わない。回収できた旧証拠は追加P2のRED/GREEN各log/timing、独立レビュー、通常build.logである。新しい実測を旧ログ名で再生成せず、recovery-接頭辞の別証拠として保存する。製品コード・期待値は復元前と完全一致、再検証は新環境の結果として別集計する。最終CIは実際にpushした最終HEADで再確認する。

初回npm ci --ignore-scriptsは既定cache /home/agent/.npmへのmkdir ENOENTで終了254。cacheだけを書込み可能な/tmp/pr95-npm-cacheへ指定し同じlockfileで再試行した。依存版やintegrityは緩和しない。新環境の契約試験は既存100ms fixture以外40/41成功。環境差異・失敗を製品修正の成功と混同しない。[回収provenance](recovery-provenance.json)。

新環境で最終製品コード全単体は2137/2137・92 files・skip0、Vitest59.30秒（wrapper59.778秒）成功。旧環境の8 timeoutを再現しなかった事実であり根因解明・恒久解消ではない。回収できない初回REDを代替保存した扱いにせず、baseline d7d6031 の別detached worktreeへ同一69局所テストを配置して新たにREDを実行、21失敗/48成功、2.36秒で内部漏出と重複状態を再確認した。新REDログは recovery-red.log、全量成功は recovery-unit.log。製品・期待値を変えず、現候補側の単体全量には同じ69条件を含む。

同一期待値69局所の新GREENは69/69・2.83秒、RED21失敗→GREEN0失敗を確認。lint11.193秒、型7.706秒、通常build46.131秒、Pages build1.650秒は全て成功（wrapper実時間）。依存警告・chunk警告は保持。最終scannerと新Pages成果物のSHA-256はrecovery-build-sha256.jsonに保存し、旧ビルドや将来CIのserved identityと混同しない。新環境でnativeブラウザは未再実行、正式6条件はこの最終コードと文書を含むHEADのCIで確認する。契約100ms fixtureと旧環境8 timeout・native第3群未完走の根因はUNKNOWNを維持する。
