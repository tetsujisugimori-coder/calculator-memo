# Calculator Memo 開発履歴・設計判断

## 2026-10-26 JST: 固定A/B比較資料の本文挿入と専用取消（Issue #94）

- 着手: PR #93のmergeと最新main `969d173c16aba208d727f088641712e5b4a0856d` をAPI/fetchで確認。既存worktreeを保持し、クラウドの独立worktree/専用branchで作業。Windowsのローカルmainは操作していない。単一点検の#88、独立出力の#92との対象差を確認し、[Issue #94](https://github.com/tetsujisugimori-coder/calculator-memo/issues/94) を実装前に作成。
- 第一希望: 同じ比較result/metadata/世代で作った既存Markdownの全文を再利用し、最小の専用境界で固定。再比較/暗黙取得/自動保存/再計算/利用者確認/履歴追加を行わない。既存点検記録形式の流用はA/B候補への自己参照を生むため不採用。出力日時とプレビュー準備日時を区別する。
- 保護: 外側の正規根拠は維持し、固定資料内部は引用/差分/点検記録候補から除外する。未知/破損/入れ子/偽終端を推測修復しない。選択文章を保持して先頭へ挿入し、本文・位置・対象・取得/通知世代を実行直前にも照合。取消は同一本文・対象・編集世代・ID/正確な範囲だけで照合し、検索削除しない。
- 保存通知: 実CalculatorAppのstorageConflictによる既存writable=falseを維持し、再比較/明示取得で挿入保護や保持本文と保存本文の一致未確認を解除しない。初期テストの「通知後再挿入可能」という仮定は既存契約と不一致のため訂正し、製品保護は緩和しない。
- 検証: 新core42/42、既存含むaudit/quote/diff597/597、既存UI32/32成功。全単体2105/2105・90files成功（既存2011＋42core＋43UI＋9独立、worker2、320.96秒）。局所UI43中1timeoutも同一条件で全量中成功したが失敗履歴は保持。正式CIは確認待ち。既存ローカル契約0.4秒fixtureのstdout前timeoutを記録、期待値や上限を変更しない。
- 新UIは追加modalなしのinline全文プレビュー。正式GUIは既存918検査・562geometry・114PNGを削減せず、新48検査とプレビュー証拠各条件1枚を追加予定。3worker・30分・成功trace0を維持。
- 独立P2: 原本取得失敗時に集合不明を空集合で容量判定する境界を負例で再現。新挿入に取得失敗拒否を追加し、同一期待値8成功/1失敗→9/9成功。歴史比較/exportは保持。追加未解消P0〜P2なし（静的/独立jsdom範囲）。
- 最終ローカル: 通常build71.093秒、Pages21.316秒、型12.606秒、lint77.636秒成功。契約41中40成功/既存0.4秒fixture1失敗、4.451秒。正式CIの環境と混同しない。[機械記録](docs/maintenance/comparison-insertion-20261026/local-validation.json)。局所native390両browser各8/8群/70tap/pageerror0だが最終guard・後追加Tabは正式CI待ち。
- [設計](docs/agent/formula-report-audit-comparison-insertion.md)。PRは未作成。既存WebKit時間変動、ローカル契約fixture環境差、PR #85位置ずれ全原因未確定、実機Safari/VoiceOver/OS文字拡大未検証は維持する。マージ/公開は人間判断。

## 2026-10-26 JST: PR #93 正式GUI阻害の局所修復と時間診断（Issue #92）

- 基準: 最新main `2a91599fa8454e097d2eca3a5d552f115da68819`、PR #93 / branch `feat/audit-comparison-markdown-export` のHEAD `5cbaf6f74ae15d7afccb73f50c64c0ce0380756c` とclean treeをAPI/fetchで照合し、既存worktreeを保全。旧run40261949353 attempt1のcancelled、770/912検査・487/562geometry・PNG99/114・失敗trace1を維持。ZIP/API digestとHEAD/run/attempt/served identityを再確認。
- 横超過: Chromium touch390/文字200%の実アプリで同UUIDを用いた局所再現。隣接text node先頭U+3000の行外突出によりmodal390/388・段落372/352となる。既存折返しCSSは有効。全文を単一template literalにする1段落だけの修正で388/388・352/352へ改善。CSSによる隠蔽・切捨て・保存処理変更なし。新unit3件を同一期待値RED→GREEN、独立3件も成功。局所native6条件×2ID×両theme×100/200%=48組成功、全文・44px・開閉/focus・保存bytes不変。
- 遅延の粒度訂正: 旧186「input」はtap/clickで、旧quotes stageには点検保存/固定記録/2時点比較も含まれる。文字入力・引用単機能の時間とはしない。同build単独引用76tap/13確認は390で356.07秒、375で196.22秒。別反復/準備の10秒timeoutも保持し、未達を成功へ置換しない。
- 独立trace解析: 390のtap210.135秒中visible/enabled/stable待機186.991秒（89%）。scroll/navigationではなくactionability区間が主。Playwright1.56.1 LinuxのrAF安定確認を一次sourceで確認し、矩形移動retryのログはない。WebKit内部や環境変動の全原因はUNKNOWNを維持。
- 事前計画9trial: baseline3/3と多重時filter省略3/3は同fixture/保存不変・実操作で成功、同4tap往復中央値5.546→2.186秒。独立traceでもactionability4.265→0.941秒。常時全filter省略は1/3成功・2件goto失敗、子のみ省略は無効、親だけ省略も不安定として不採用。
- 採用: 単一Modalのblur3pxを保持し、入れ子Modal表示中だけ装飾backdrop filterを省く3行CSS。背景の暗化・fixed/z-index・操作・保存/比較意味論は維持。広いUI再設計・worker増加・検査削減・timeout緩和は行わない。正式既存delete/cancel操作にsingle→nested→singleのstyle/幅/focus/44px/保存不変を各条件1検査追加し、912既存＋6=918、geometry562/PNG114/成功trace0/3workers/30分を維持。
- 計測: 単調時計でtapの前後、サブstage、観測/保存処理時間を分離。Linux可視子processの生CPUtick/RSSをNode自身と区別し、欠測はnull。診断用成功traceは正式成果物外で解析根拠として保全。新CI契約2件を追加し既存37＋2=39。
- 全量ローカル: 2011/2011単体・87files成功（旧2008＋新3、worker2、257.39秒）。契約39中38成功/1失敗は既存100ms Node起動fixtureの最初のログ前timeoutで、上限/期待値不変更。lint（41.09秒、警告なし）・型（13.82秒）・通常build（52.31秒）・Pagesbuild（7.33秒）成功。既存chunk警告を維持。正式CIの既定unitと全39契約は別に照合する。[機械記録](docs/maintenance/pr93-gui-repair-20261026/local-validation.json)。
- 修正版そのものの単独時間対照: WebKit390は同76操作/13確認成功、356.074→269.203秒（局所診断で約24.4%短縮）。独立traceのactionability合計186.991→116.103秒。WebKit375は最初の操作前reloadが10000ms timeoutし0/76・0/13、時間比較不能。失敗を残し、全遅延解消や正式全量PASSとはしない。
- 最終CSSの局所native: 同じ6条件/2ID/両theme/100・200%で48/48 layout、単一→二重→三重→二重→単一の60/60 backdrop phase成功、pageerror0。旧CSSの同じnested none期待は100%でもRED。独立担当が結果・矩形・hashを読み直し、新規P0〜P2なし（静的/証拠読解/独立unitの範囲）。最終HEADの正式CIは未確認で、局所成功や旧HEADの結果を流用しない。結果は以下の追記と最終PR Checks/Issueへ記録する。
- 証拠/設計/残余: [今回の調査索引](docs/maintenance/pr93-gui-repair-20261026/README.md)、[横超過](docs/maintenance/pr93-gui-repair-20261026/overflow.md)、[時間診断](docs/maintenance/pr93-gui-repair-20261026/webkit-timing.md)、[独立レビュー](docs/maintenance/pr93-gui-repair-20261026/independent-review.md)。実機Safari/VoiceOver/OS文字拡大・背景化、WebKitの低層原因、PR85初回選択位置問題は保証外。最終CI受入未達ならPARTIAL/マージNOを維持。[Issue92](https://github.com/tetsujisugimori-coder/calculator-memo/issues/92) / [Draft PR93](https://github.com/tetsujisugimori-coder/calculator-memo/pull/93)、マージ/公開は人間判断。

### 修復実装HEADの正式CI確認（2026-10-26 17:26 JST）

- HEAD `4c30fd663839c30daa297bdefa480100086379d0` / tree `75a14724494c5cbb3e847d4201b2d5d8936efe6d`、[run40289595913 attempt1](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/40289595913) は成功。単体2011/87files、契約39、lint/型/通常・Pages build成功。ローカル100ms fixture失敗は削除せず、正式Node22.13.0で同39期待値が成功したことを区別する。
- 全6条件GUI918/918（旧912＋新6）、geometry562/562、PNG114/114、trace0、3worker。検査/geometryはdesktop153/95、non-touch390152/93、touch390153/93、touch375153/93、WebKit390153/93、WebKit375154/95。全mobile1101実touchを維持。
- job 08:02:54–08:24:03 UTC＝21分09秒、GUI単調時計1102.896秒＝18分22.896秒。既存30分上限内、前回PR91の24分16.672秒よりGUIは353.776秒短いが、別HEAD/runの参考比較であり恒常性能保証ではない。
- WebKit390の旧quotes集約と同範囲の4stage合算は717.9→256.700秒、同186tap461.6→126.504秒。375は391.9→157.510秒、203.7→58.036秒。単独診断と3worker正式測定の環境を混同しない。390全worker1102.834秒、375713.070秒。低層待機原因UNKNOWNとローカル375開始前timeoutは保持。
- [artifact12636514116](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/40289595913/artifacts/12636514116)、37,678,740 bytes、実ZIP SHA-256 `4f6634ee472ced4335a793c5429e3370201041855681c3629a2e8031ffd33ba7` がAPI digest一致。全条件HEAD/run/attempt/served identity一致。[機械記録](docs/maintenance/pr93-gui-repair-20261026/formal-ci-40289595913.json)。ZIPにはserved identity/build logを含むがbuild asset全bytesは含まないため、ローカルasset SHAと同一の測定とは称しない。
- この追記は実装HEADの結果であり、文書追記commit自身の正式CI成功は先取りしない。最終文書HEADを再度全量検証し、PR/Issueの最終Checks・成果物照合へ記録する。Draft維持、マージと公開は行わない。

## 2026-10-26 JST: 固定点検記録の2時点比較結果Markdown出力（Issue #92）

- 着手: PR #91 merged、最新main `2a91599fa8454e097d2eca3a5d552f115da68819` を確認。既存clean worktreeを保持し、別worktree / `feat/audit-comparison-markdown-export`。open/関連closedの重複確認後 [Issue #92](https://github.com/tetsujisugimori-coder/calculator-memo/issues/92) を実作成。
- 第一希望: 同じmetadata/result/世代を使う純粋Markdown builderと既存出力helperを再利用。出力時の再比較/暗黙取得という次善策は世代混同と非明示操作を招くため不採用。表示状態と情報不足をそのまま保持し、0件を一致へ格上げしない。
- 保存保護: 本文/固定記録/snapshot/原本/確認履歴/schema/容量/engineを不変更。選択/入替/本文/対象/取得世代/storage/再比較で失効し、非同期コピーの古い完了を拒否する。将来の本文挿入は対象外。
- 設計: [出力設計](docs/agent/formula-report-audit-comparison-export.md)。builder33/UI16/独立9の計58件成功、独立担当の確認範囲で新規P0〜P3なし。初回hooks lint3件と既存h4順序試験1件は製品側修正、期待値を維持して成功。初回全単体1984/1986成功の既存2timeoutと、local CI契約100ms起動fixtureの失敗を保持し、静穏再実行/最終CIで別照合する。最終CIは未確定。
- 全単体: 既定並列初回1984/1986、独立9件追加後1994/1995（既存別件5秒timeout）。worker2で同じ全1995件/85files成功・失敗/skip0、初回184.84秒、最終UI版223.42秒。期待値/5秒上限/CI既定並列は不変更。lint/型/通常・Pages build成功、既存chunk警告は保持。正式CIは別に確認する。
- 実GUI: 最終Pages buildの局所実GUIはChromium141のdesktop1365/non-touch390/touch390/touch375、WebKit26.0のtouch390/touch375の既存6条件で各11群、計66成功、各mobile65実tap、pageerror0、全process exit0。プレビュー/copy/native .md bytes同一、両theme/CSS200/focus/44px操作/別page storage/非破壊性を確認。clipboard成功・失敗は注入sinkでありOS許諾未検証。正式全GUIは24群追加の912検査、geometry562、PNG114、成功trace0、30分上限を維持し最終HEADで別照合する。
- 提出: [Draft PR #93](https://github.com/tetsujisugimori-coder/calculator-memo/pull/93)。CLI pushは認証不足のため認可済みGitHub connectorで同一tree `2877189304554c496dfb905396fff07ea26a969a` を提出。初回remote commit `f5d465842b2ea6edc98e78a3ef917d9ff72ea8b7`、製品差分なしのPR関連付け追記後HEADでも実CIを確認する。正式CI結果はPR Checks/追記コメントを正本として照合し、本文記録commit自身の成功を先取りしない。
- 正式CI初回: HEAD `0a1cdb58a9369ce78930a73cd06398fe2d8b42d4` / [run40248969572 attempt1](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/40248969572) は30分job上限でcancelled。1995単体/37契約/型/lint/両build成功。Chromium4とWebKit375完走、WebKit390は既存manual-block-referencesの86/152検査で未完・errors0、追加出力検査未到達。PNG100/114、全GUI成功とはしない。既存quotes stageが390で583秒/375で318秒等の広い遅延を観測し、環境負荷の可能性はあるが根本原因未確定。artifact12620372751のZIP実測digest `ec9d081d57de521349bc78a746947132c158c844980ab0db4a71db311d1a328d` とAPI一致、HEAD/run/attempt一致。履歴を保存し、製品・検査・上限を変えずこの記録更新HEADで再検証する。
- 全GUI再検証: run40251667766も30分cancelled。Chromium narrow390の既存999不在検査が生成UUID中999へ衝突した試験誤判定を独立確認、厳密metadata除外と両側根拠値完全比較へ修正しnegative controlを追加。WK390の既存stage遅延は原因未確定。2worker/全6条件/DPR/検査/30分を保持してWK先行queueと入力時間計測を追加し、次の最終HEADで再検証。[詳細](docs/agent/formula-report-audit-comparison-export.md)。
- 安定化検証: 全2006単体/86files（既存1937＋出力58＋試験negative control11）成功・失敗/skip0、worker2・191.79秒。lint/型/構文成功。local契約は既知100ms起動fixtureのみ失敗を保持。独立担当が11対照/queue契約を確認、製品hash不変更。
- 試験修正後native確認: Chromium non-touch390の全151検査/93geometryを同一製品buildで再実行して完走、errors0・exit0。既存sourceAudit誤判定箇所を含めた全経路を確認。正式6条件/30分内完走とは別に扱う。
- 3worker承認: 2026-10-26 11:49 JST、本人の「よいです」により同じjob/30分/全検査を維持する3worker案を承認。先行2worker run40255569307は両WebKit/desktop/narrow完走だがtouch2条件未完、644/912検査・405/562geometry・PNG83/114、artifact12623158459 digest `5c18fe88458da5208390f4d618e31655f8f06c2b0684f04175f97d8c6bdc8df8`/HEAD照合済み。失敗を消さず、3workerとCPU/memory/worker時刻記録を追加。製品・画面DPR・検査数・上限不変更、時間内完走/遅延根因解消は未確認として次HEADを検証する。
- 承認後最終local確認: 全2008単体/86files（既存1937＋機能58＋試験安定化13）成功・失敗/skip0、worker2・330.42秒。対象lint/型/独立13契約成功、新P0〜P2なし。local100ms契約fixtureは失敗として保持し、新HEAD実CIで37件を別照合する。
- 残余: 実機Safari/VoiceOver/OS文字拡大未検証。PR #85 初回選択位置ずれ原因未特定を維持。数学的証明/真正性/変更理由/原子的外部一致を保証しない。

## 2026-10-26 JST: PR #91 正常取得0件の誤一致を修正（Issue #90）

- 着手: 最新PR HEAD `eae5cc1882bb1f97647d63cf6f5b11eb28993d5c`、main `9c42e3750d2ebf8fd0f01c1d459d4269f2c4827f`、Draft/未マージを確認。専用clean cloneで同じ `feat/audit-record-comparison` を継続し既存作業を保護。
- 再現・原因: 別recordId/同じformulaId/reportIdで双方checked・取得ok・完全・items空のとき、差分statesが空でmatchedへfallbackした。取得失敗0件の前回修正だけでは正常取得0件を覆えていなかった。coreの正常空判定1件/空制約3件、実CalculatorAppの誤一致表示1件を修正前REDで確認。
- 第一希望採用: 形式検証後、両側items空に既存incomparableと理由を付与する6行の最小修正。早期returnせず取得成否/未記録/失効/不完全と状態変化を併記。片側0件の追加/削除やstable ID、frozen/observed分離は不変更。新しいempty状態追加は互換/UI契約増加が不要なため不採用。
- 互換・保護: schema/version/容量/engine、旧v1/v2本文/snapshot/原本/確認履歴を不変更。比較は非保存・非再計算・非挿入。calculatedAt/persistedAtだけの差は既知計算根拠差の対象外と設計へ明記し2回帰で確認。
- ローカル検証: 全1937単体/82files（従来1906＋core13＋実アプリ1＋独立17）成功、失敗/skip0、52.68秒。lint/TypeScript/通常・Pages build成功。独立担当の関連97件成功、P0〜P3新規残存指摘なし（ソース/jsdom範囲）。同一期待値のRED→GREENを保持。
- CI契約: ローカル36成功/1失敗。既存100ms合成timeoutでNodeが最初のログ前に停止（静穏再実行でも再現）。単純Node起動の実測170/351/218msは100ms超で、timeout終了124とログ欠落を区別した。期待値/上限は変更せず、正式CIの同37件を別に照合する。
- 実GUI: local Chromium141.0.7390.37/WebKit26.0の既存6条件で比較専用7検査ずつ計42成功、pageerror0、各mobile53tap、process exit0。空同士の比較不能/理由/0行、両テーマCSS200%、focus/keyboard/Escape復帰、storage不変と既存比較経路を確認。既存全館GUIへ各1検査を追加（882→888、geometry562/PNG114/成功trace0/30分保持）。最終HEADの正式全GUI・契約37・CI成果物はPR Checksと追記結果を参照し、記録commit自身の成功を先取りしない。
- 関連: [Issue #90](https://github.com/tetsujisugimori-coder/calculator-memo/issues/90)、[Draft PR #91](https://github.com/tetsujisugimori-coder/calculator-memo/pull/91)、[設計](docs/agent/formula-report-audit-comparison.md)。今回の検証結果と最終CIの更新はこの追補/PRへ記録する。旧レビュー結論は当時の範囲に限る。
- 残余: #85初回選択位置ずれの全原因未特定、実機Safari/VoiceOver/OS文字拡大の未検証を維持。数学的証明/真正性/外部原本の原子的整合は保証しない。main push/merge/auto-merge/公開は行わない。

## 2026-10-25 JST: 固定点検記録の2時点比較（Issue #90）

- 基点: PR #89 merged、最新main `9c42e3750d2ebf8fd0f01c1d459d4269f2c4827f` をAPI/fetchで確認。旧clean worktree保持、新worktree/branch `feat/audit-record-comparison`。関連 [Issue #90](https://github.com/tetsujisugimori-coder/calculator-memo/issues/90)。
- 実装前調査: v1固定記録には完全な構造化計算根拠がなく、人間向けMarkdownから復元しない。第一希望の既存scanner/共有assessment/計算差分engine再利用を採用、新規本文内v2だけ比較資料を保持。旧v1は不変/比較資料不足。別保存領域は移行/二重管理負担により不採用。保存schema/容量/engine意味論を維持。[設計](docs/agent/formula-report-audit-comparison.md)。
- 明示A/B・入替・同一性/適格性の処理側検証、安定ID対応、引用時と点検取得時の資料分離。式/入力/参照/内部値/表示値/状態変化を分離し、同結果でも根拠変更を隠さない。重複/欠落/未知/不正/不完全は推測補完せず、変更理由不明を表示。
- 保護: 過去記録/本文/snapshot/原本/確認履歴を比較操作では変更しない。選択/本文/対象/照合/通知で旧結果失効。取得成功だけで保持本文を現在の保存本文へ格上げしない。自動保存/再計算/確認/本文挿入なし。
- 独立レビュー修正: 0件取得成否の欠落P2（正常/失敗を一致へ誤分類）と、比較差分の原引用ID/対象block変更漏れP2を独立赤各2件→修正。記録全体の取得状態と原引用識別を保持し、旧不足は推測しない。StrictModeのeffect cleanup世代ずれも独立赤1件→不要加算除去。実GUIのselectラベル混入も修正。詳細と最終検証は設計文書へ記録。
- 検証: 全1906単体/81files（既存1824＋新82）、lint/型/通常Pages build、CI契約37成功。局所Chromium141両幅6検査/50tap/pageerror0、localWebKit26.5はassertion後cleanup停止で完走PASSとしない。正式6条件へ各6追加し882checks/geometry562/mobile1086/PNG114/成功trace0/30分を維持。独立P2×2/P3×1は赤→緑、確認範囲で阻害残件なし。最終HEAD実CI・artifact照合はDraft PRへ記録し、未実行を成功としない。PR85初回CI全原因未特定、実機Safari/VoiceOver/OS文字拡大未検証を継続。

## 2026-10-25 JST: 根拠点検結果の本文内固定記録（Issue #88）

- 着手: PR #87 merged / 最新main `a3ca0f5f6b993a5df8d0a5648b794b1acefd2f9c` を確認。旧作業tree clean、別worktree `calculator-fixed-audit` / `feat/audit-fixed-record` で保全。新規 [Issue #88](https://github.com/tetsujisugimori-coder/calculator-memo/issues/88)。
- 第一希望を採用: 共有inventory/assessment/Markdown builder、厳密block解析、既存挿入保護を再利用。最小v1追跡領域だけを既存本文へ保持し、保存schema変更・独立判定・暗黙取得なし。次善策の別保存領域は互換/移行/二重判定負担により不採用。実装前比較は `docs/agent/formula-report-audit-record.md`。
- プレビューは対象本文全文・全件Markdown・出力/取得時刻・未照合/失効/保持本文一致未確認を区別。SHA計算は対象世代へ固定、storage/取得/closeで古い完了を抑止。指定位置追加は選択文章を残し、保存/確認/再計算/確認履歴追加なし。正確な本文一致と編集世代で専用取消を保護。
- 自己参照対策: 固定記録内部の引用/差分を新出現へ数えず、正常な外側根拠を保持。未知/破損/重複/不完全境界は推測回復せず不完全集計。独立レビューが異種領域入れ子の完全性漏れP2を赤テストで再現、外側不正行保持・不完全集計へ修正し独立試験で再確認。
- ローカル検証: 全1824単体/77files（新規49、既存1775維持）、型/lint/通常Pages build成功。独立6試験と再レビューでP0〜P3残件なし（ソース/jsdom範囲）。Chromium375/390各6checks成功、非同期preview focus欠落も再現修正。local WebKit26.5はassertion後close停止で完走未確認。6GUI条件へ各6checks追加し、既存PNG114/成功trace0/30分上限を維持。最終件数・GUI・独立レビュー・最終HEAD実CIは設計/PRへ記録し先取りしない。
- 制限: 数学的証明/真正性/現在の原本一致/外部writerとの原子的整合を保証しない。PR85初回CI全原因未特定を維持、PR87の古いcaret取消を保持。実機Safari/VoiceOver/OS文字拡大は未検証。main直接push/merge/auto-merge/公開なし。

## 2026-10-25 JST: PR #87 最終CI中の選択位置ずれ再発・遅延caret保護

- `9d3a16c` の実CI run40182162352 attempt1は30分付近でGUI取消、attempt2はWebKit390の既存引用picker選択assertionで失敗。他5条件完了。取消・失敗のartifactとdigestを検証記録へ保存し、成功に置換しない。上限・検査数・期待値は不変更。
- traceの期待4432..4434に対し実測6525..6525は、本文末尾ではなく直前の差分挿入caretと一致。新storage回帰helper実行前の既存経路。既存traceだけでは原因未確定のため、局所RAF/event/setter計測を追加して調査した。
- 局所WebKit26.5で後続本文編集後にも古い差分挿入RAFがcaretを動かす事実を観測。旧buildの当該callbackだけを新選択後まで保留→解放すると、tapより前にCIと同値の上書きを因果再現した。自然tap10回では再現0、固定CI26.0との版差と歴史的#85初回の全原因未確定は区別する。
- 最小修正：引用/差分で共有する遅延caret要求の取消＋epoch/本文同一性ガード。後続入力・選択・操作・storage通知・unmountで失効。本文生成・挿入位置規則・保護範囲・安全取消・保存契約は変更しない。待ち時間増加/検査削減/上限延長は不採用。
- 新規9件：取消済みcallback強制実行を含む赤6件→緑、正規挿入focus/caretの正対照2件も成功。独立レビューでヘッダー×→破棄確認へのfocusを古いcallbackが奪うP3を追加再現し、close共通入口の取消で修正、回帰1件追加。差分/引用の既存49件を含む58件・独立4件成功、残件なし。修正後の局所WebKit26.5/Chromium141各390px・heldRAF10回は選択保持。最終全単体1775件/73files・lint/型/通常/Pages build成功。既存sentinel999検査とランダムUUIDの衝突は当該fixtureのID/日時だけ決定化し期待値を維持、独立確認済み。負荷時CI契約100ms合成timeout1件失敗後、同条件を静穏下で37件全成功。最終HEAD実CIはPRへ記録する。

## 2026-10-25 JST: PR #87 再レビュー P2・実 storage 通知後の保持本文

- 着手時：作業ツリー clean、PR #87 Draft/open、branch `feat/audit-markdown-export` と remote HEAD `ad15bfffe5104779cda707c36fa2ae75926c6233` 一致。main `9c1cbd2c77131e9d717b6206ac54c7a6c389d235`。既存追加変更の破棄なし。
- 訂正：下段の前回「外部変更/削除後の保持本文P2修正済み」は report props を差し替える試験経路だけだった。実 CalculatorApp は storage 通知後も旧 data/confirmedSerialized を保持するため警告が伝播せず、未修正だった実経路を今回独立再現した。前回の履歴は消さず保証範囲をここで訂正する。
- 修正前：実 CalculatorApp 統合の本文変更/削除2件が失敗。別 build の旧 HEAD を Chromium 141/375px で起動し、同 browser context の別ページから保存データを実更新した2件でも旧本文を「現在表示中の保存済み本文」と出力することを確認。
- 原因／修正：親の既存保存保護を Library→Report→Audit に伝播。storage 通知に対する本文一致未確認は一時状態として保持し、出典再照合では解除しない。同期通知→描画前出力と遅延コピー完了も既存epochで保護。対象変更・削除とは断定せず、未保存編集との差を別表示。第一希望の既存通知再利用を採用、追加取得による比較は暗黙取得と編集基準の複雑化を避け不採用。
- 保存保護：旧本文・タイトル・関連付け・snapshot・保存原本・確認履歴は不変。既存上書き停止、共有判定、保存schema/容量/engine/挿入取消契約を変更しない。出力からの保存領域read/writeを追加しない。
- 独立再レビュー：実装担当と別 agent がソース＋jsdom を点検、関連57件と独立3件成功、P0/P1/P2/P3新規指摘なし。描画前storage→出力、Library未mount時更新→元bytes復帰、storage通知なし親保護変更→遅延コピーを独立検証。実ブラウザ／CIの証拠とは区別する。
- 最終ローカル：全単体1766件/73files・関連57件・CI契約37件・lint・型・通常/Pages build成功。focused Chromium141/375・390各6チェック成功、local WebKit26.5は後処理close停止で完走成功とはしない。詳細は `docs/agent/formula-report-audit-storage-verification.md`。最終HEAD実CIはPR本文へ追記し、この記録コミット前に先取りしない。実機Safari/VoiceOver未検証、PR #85初回CI選択位置ずれ原因未特定を維持。

## 2026-10-25 JST: 根拠点検結果の Markdown 出力（Issue #86）

- 着手: PR #85 の 14:41:57 JST merge と main `9c1cbd2c77131e9d717b6206ac54c7a6c389d235` を確認。新規 clean clone から `feat/audit-markdown-export`、既存作業ツリーは不変。重複Issueを検索し [Issue #86](https://github.com/tetsujisugimori-coder/calculator-memo/issues/86) を作成。
- 調査・設計: 既存 inventory/assessment と Acquisition.fetchedAt を再利用。第一希望は同じ世代の全項目を純粋builderへ渡す方式で採用。DOM抽出/別parser/暗黙再取得/新規永続化は不採用。設計を実装前に `docs/agent/formula-report-audit-export.md` へ記録。
- 実装: 絞り込み非依存の全件コピー/.md出力、本文種別・未保存状態・ID・出力/取得時刻・未照合/失効・両側の状態理由・集計制約。既存 safe fence/上限/filename/download を再利用し、失敗時は全文手動コピー欄。失効/閉鎖/切替/再取得の同期epochで遅い通知と旧全文欄を無効化。
- 非破壊: 本文/snapshot/原本/確認履歴・schema/version/容量/計算engine/挿入取消は不変。出力は独立記録で、数学的正しさ・真正性や常時最新性を保証しない。開始済みOS clipboard書込取消・OSファイル保存完了は保証外。
- ローカル検証: 追加47件（pure33/UI14）、全単体1756件/72files、CI契約37件、型検査・lint・通常/Pages build成功。ローカルNode24.22.1とCI固定22.13.0を区別する。初回依存取得は既定cache不在で失敗し、一時cache指定で成功。Chromiumは実行環境のsocket制約により起動前停止、GUI成功とは扱わない。最終HEAD実CI・実GUI結果はPRへ追記する。
- 独立レビュー: 同IDの保存レポート外部変更/削除後に保持中の旧本文を現在の保存済み本文と誤認させるP2を独立再現し修正。再照合後も保持本文/保存競合の制約を記載し、本文編集とタイトル等の未保存変更を分離。独立再検証47件成功、P1/P2残件なし。比較基準の文言も直近保存で更新される編集基準本文へ訂正。
- focused GUIで手動コピー欄の暗黙ラベルが全文をaccessible nameへ含める問題を再現し、明示label/textarea関連へ修正。全文・失敗判定・exact label検査は維持。
- 未検証/残余: 実機Safari/VoiceOver/OSソフトキーボード。#85初回CIの選択位置ずれは原因未特定を維持し、今回成功で根本解決としない。既存6条件/30分/画像trace方針を変更しない。


## 2026-10-25 JST: レポート全体の根拠点検（Issue #84）

- 着手: PR #83 merged を API で確認、clean な作業ツリーを main `163e31dbdc07c37da49da5f2b5741cfa3bba4f2b` へ fast-forward し `feat/report-evidence-audit` を作成。既存の根拠点検 Issue は検索0件のため [Issue #84](https://github.com/tetsujisugimori-coder/calculator-memo/issues/84) を作成。
- 方針: parser / strict scanner / snapshot検証 / 原本照合 / 既存詳細表示を再利用。点検専用の一時 inventory と明示取得世代を分離し、本文順・出現単位、本文編集と現在出典を独立表示する。単純な既存一覧結合は不採用。設計・次善策・保証境界は `docs/agent/formula-report-audit.md`。
- 保存形式・容量・確認履歴・計算エンジン・挿入/専用取消は変更しない。実装・検証結果は後続に記録する。
- 実装: 本文解析を共有した出現単位inventory、初期未照合と単一明示取得、本文/出典の独立表示、片側ごとの状態、関連解除、絞り込み、既存詳細と厳密位置移動。親アプリの確定保存世代と storage event により詳細/結果を失効し、明示再照合のみ許可する。
- ローカル: 追加49件（pure30/UI19）、全単体1709件/70files、CI契約37件、型検査・lint・通常/Pages build成功。既存保存writer/schema/確認条件/engineは変更しない。既存挿入/取消境界も回帰を継続。
- 独立レビュー: 未取得リンクを不存在扱いするP2、本文移動RAF待ち中の世代変更で古い位置を選択するP2を独立に再現。取得済み/非stale時だけリンク不存在を表示し、layout更新context-refと単調増加のstorage通知epochで遅延位置移動を守る。最終レビューで別タブ更新の同種レースも再現し、繰返し通知を含む回帰を追加した。独立再検証3件＋関連258件/型/diff確認成功、P0/P1/P2残件なし（実CIは別途確認）。
- 実GUI: 隔離Playwright Chromium touch375/390pxで各13検査・71touch成功。両テーマ200%、長い記録ID、混在一覧・詳細/絞り込み/本文移動・Escape/フォーカス、実際の別タブからの原本変更→失効→明示再照合、固定snapshot/未保存本文/原本/履歴保持を確認。初回は引用前後の文章まで選択する誤った試験期待値で失敗し、引用だけの厳密範囲へ訂正。製品の位置判定は緩めていない。
- CI: 全6条件を維持し各2検査追加、契約762検査/mobile986touch/geometry562、代表PNG114・成功trace非保存・30分上限は維持。最終HEAD実Actionsの結果はPRに記録し、未実行/実行中を成功扱いしない。ローカルWebKitは利用可能なbrowser実体がないため未実施、実CIのWebKitと区別する。
- 未検証: 実機iPhone Safari/VoiceOver/OSソフトキーボード。通常buildのchunk-size警告、ローカルlintの既存/一時GUIコピーに由来するunused警告は残る（エラー0）。任意外部writerとの原子的排他、常時最新性、数学的正しさ・真正性は保証しない。rollbackはコードrevertで本文移行不要。

## 2026-10-25 JST: PR #83 P2 比較差分フェンスの境界保護

- 対象: [PR #83](https://github.com/tetsujisugimori-coder/calculator-memo/pull/83)、[review 5640533497](https://github.com/tetsujisugimori-coder/calculator-memo/pull/83#pullrequestreview-5640533497)、行コメント4368884046。開始時remote/local HEADは `4e6a49ef99399a11b8df8f5cdf16797233ce6cba` 一致、作業ツリーclean。既存枝を継続しIssue #82を再利用、新PRなし。
- 修正前再現: 正規の両固定snapshotを持つ差分の開始/終端間に `calculator-memo-difference-preview` を追加し、その後・正規終端より前へ挿入。引用/差分の両経路 × LF/CRLFの4回帰すべて旧実装で拒否されず失敗した。UIの両経路でも本文変更または不正な挿入プレビューを再現。原因は予約接頭辞だけで終了を判定するガードで、読取側にも同種の早期解除があった。
- 採用: 完全一致v1開始/終端、実フェンス閉鎖、既存validator、同一IDを共通scannerで確認。未知・破損・将来版・重複/入れ子で曖昧になれば元の開始からEOFまで保護し、後続のもっともらしい終端で復旧しない。両挿入と出典状態表示を同一境界へ統一する。循環依存を避けるためsnapshot型/validatorだけ中立モジュールへ移動し既存exportを維持。
- 第一希望/妥協: 安全な境界だけを許す。壊れた差分以降の無関係な文章にも挿入できない場合があるが、推測回復より原本保全を優先する。通常v1直前/直後、複数正常差分間は維持。マーカーが完全削除された文章の元範囲復元は対象外。詳細は `docs/agent/formula-report-diff-tracking.md`。
- 不変: snapshot・既存Markdown・追跡情報の自動更新/修復/削除なし。保存schema/version/容量/計算エンジン/確認判定/確認履歴、専用取消を変更しない。選択は削除しないため開始位置だけを挿入境界とする既存契約を維持。
- 検証: 追加境界74件（両経路、LF/CRLF、UTF-16日本語/絵文字、未来/破損/未知/入れ子/欠落、正常境界、選択、原情報不変）が成功。全単体1660件/68ファイル、CI契約37件、lint/型検査/通常・Pages build成功。独立再レビューは影響237件と追加927境界assertionsでP0/P1/P2残件なし。実Chromium375/390pxのfocused検査各11件・61touchで両テーマ200%、本文/選択/原本/確認履歴不変とフォーカス復帰を確認。全6条件Chromium/WebKitはこの記録を含む最終HEADの実CIで確認し、結果をPRへ記録する。未完了を成功扱いしない。
- CI方針: 既存6条件を維持し異常挿入拒否1群/条件を追加。30分上限、代表PNG114枚、成功trace非保存、保存上限は変更しない。実機Safari/VoiceOver/OSソフトキーボードは未検証。

## 2026-10-25 JST: 比較差分の出典追跡・根拠確認（Issue #82）

- 着手調査: 最新 main `5e003bfc5e7a543a7b686f1997eafb8beec0b7aa` と PR #81 のマージ（2026-10-24 23:58 JST）を確認し、専用枝 `feat/82-difference-source-tracking` を作成。依頼全文を [Issue #82](https://github.com/tetsujisugimori-coder/calculator-memo/issues/82) に保持し、読戻し一致を確認。既存 checkout は変更しない。
- 第一希望: 既存引用・根拠表示を拡張し、通常 Markdown 内の厳密なバージョン付き開始/終了メタデータに、両保存記録の固定 snapshot と元引用の識別情報を保持する。既存 validator/comparison/parser、詳細表示、保存原本の取得・失効・容量 preflight を再利用する。保存スキーマ/version/容量、確認履歴、計算エンジンは変更しない。
- 従来 PR #81 の差分は追跡用 snapshot を持たない通常 Markdown。新情報を推測して移行せず「追跡情報不足」とする。新規差分の出典は構造化 ID と検証済み記録で追跡し、表示本文の一致だけで対応付けない。本文編集と出典の現在状態は別々に表示する。
- 変更予定: `lib/formula-report-diff-tracking.ts`、レポート編集画面・出典 UI・既存比較表示の最小共通化、単体/統合/GUI 境界テスト、README・設計文書。別メタデータ保存は既存の未知フィールド保護を変えるため不採用。全履歴の自動復元/自動追従/再確認は対象外。
- 検証: 実装前。PR 未作成、CI 未実行。最終 HEAD の結果と独立レビューは後続記録/PR に明記する。
- 実装・ローカル検証: 両固定記録の追跡・本文編集の別判定・現在の出典詳細/明示比較・取得世代失効を実装。全単体1584件/67ファイル（追加コア38/UI34）、CI契約37件、型検査、通常/Pages build成功。保存writer/schema/確認判定/計算エンジンの変更なし。
- 独立レビュー: 同一登録式のレポートID切替で旧出典dialogが残るP2、両現在記録から引用ブロックが消えた際の残存詳細選択P2を修正。独立89件再検証で残るP0/P1/P2なし。不正JSON/未知version/不正構造と実Storage取得例外も分離した。
- 実GUI: pinned Playwright Chromium desktop1365/375px touchで引用/差分/出典8群とprovenance/errors（各10検査）成功。両テーマ200%、長いID/式、詳細往復とフォーカス、他タブ更新/再取得、固定snapshot/未保存本文/原本不変を検証。mobile実touch55操作。6条件契約は744検査/mobile各970操作/geometry562、30分・114PNG・成功trace非保存を維持。フルChromium/WebKitは最終HEAD実CIで確認する。
- 初回GUIで共通化時の片側欠落説明の退行を検出して元のラベル付き文言に修正。次の失敗は試験で先行注入した他タブ更新が既存安全ガードを正しく発火したため、既存編集検査後に注入する順序へ訂正。期待値・安全ガードは弱めていない。初回依存導入は既定cache書込不可で失敗し作業用cacheで復旧、system Chromium起動制約は公式pinned headless shellで代替した。
- 未検証: 実機iPhone Safari/VoiceOver/OSソフトキーボード、任意外部writerの原子的排他、数学的正しさ・真正性。旧差分の後付け追跡は対象外。新規依存なし。設計と次善策・rollbackは `docs/agent/formula-report-diff-tracking.md`。
- [Draft PR #83](https://github.com/tetsujisugimori-coder/calculator-memo/pull/83) を作成。Git CLI pushは認証不足exit128、remote branch不存在を確認後、認証済み個別blob/tree/commit/refで公開。検証済みローカルtree `fbf48125a13e801881cf0e15756d4c4ce96177f3` との完全一致を確認。初回ファイル転送処理の停滞は結果を照合してから再開し、不確定writeを盲目的に再送していない。
- 互換性: 旧アプリには新しい追跡UIはないが本文は通常Markdownとして保持される。新アプリも未知version/未知フィールドの追跡情報を修復・削除せず照合不能として保持する。新しいプレビュー準備日時/差分IDはその操作自身の情報であり、記録に欠ける確認日時・保存完了時刻を生成したものではない。
- この文書追記後の最終HEADについて実Actionsの6条件と成果物を確認し、結果はPR Checks/完了コメントへ記録する。未実行・実行中を成功として先取りしない。Draftを維持し、人間のレビュー/マージ判断を待つ。




## 2026-10-24 JST: 比較差分を関連レポートへ挿入（Issue #78）

- 着手: cleanな新規clone、最新main `2087868b572b707de86635a88306dc010a2a544f`（PR #77 merge）から `feat/78-report-diff-insertion`。本人の添付全文を [Issue #78](https://github.com/tetsujisugimori-coder/calculator-memo/issues/78) に原文で保存。PR #71には依存しない。
- 調査・予定: `compareQuoteToRecord` / `compareEvidenceRecords`、検証済み固定引用snapshot、既存Markdown parser/renderer・挿入境界・保存原本取得を再利用。新規 `lib/formula-report-diff.ts`、比較/引用状態/レポート編集UI、単体・GUI境界テスト、README/関連設計文書を変更予定。
- 整合性: 引用時snapshotは不変。差分説明は通常Markdownの未保存本文編集。プレビューを本文/引用/選択/取得世代/レポート識別に結び付け、明示挿入前に保存原本を再照合する。引用全範囲を保護し、専用取消は挿入直後の完全一致だけ許可。保存schema/version/容量/確認履歴/計算エンジンは変更しない。
- 実装: 全文プレビューから明示挿入、取得条件失効、全引用範囲の保護、専用取消、全レポート容量preflight、通常Markdownのコピー/出力保持を実装。日時欠落は現行v1 validatorが不正として拒否するため部分生成しない。次善策とrollbackは `docs/agent/formula-report-diff-insertion.md`。
- ローカル検証: 全単体1512件/65ファイル成功（新規純粋32件・UI27件）。型検査・lint・通常/Pages build成功。lintのrender中ref更新指摘はlayout effectへ修正し、UI27件とlint/型を再確認。UI試験の初回fixture誤り（閉鎖フェンス直後への改行欠落）はfixture修正で解消し、製品期待値は緩めていない。
- CI契約は36/37成功。未変更の100ms合成timeout検査がローカルNode24の起動ログ前に終了した。検査削減・上限延長は行わず、固定Node22の実CIで確認する。通常buildの既存chunk-size警告は残る。
- 独立レビュー: 固定snapshot、原本取得時点、古いpreview、専用取消、保存境界、未知/容量/敵対文字列を確認しP0/P1阻害指摘なし。独立実行の新規57件も成功。
- GUIは既存6条件へ2検査群を追加し、732検査・mobile958操作・geometry562、30分・114PNG・成功trace非保存を維持。最終HEAD実CIは確認中。実機iPhone Safari/VoiceOver/OSソフトキーボードは未検証。
- 実ブラウザ初回: Chromium desktopで記録ID/日時のバックスラッシュ表示を発見。既存rendererを変更せず、動的値専用コードフェンスへ変更して正確表示を保証する回帰を追加。再レビューP2の「値が引用ラベルで始まると偽引用扱い」は専用language分離で修正し、32件再試験と独立再レビューで残るP0/P1/P2なし。
- ローカルGUI: 最終language/CSS修正後のChromium desktop1365と375px touchで重点6群が各成功。mobile実操作43（従来30+13）、両テーマ200%の挿入前/挿入後プレビュー、全文折返し、Escape/フォーカス、原本不変を確認。更新coverage契約17件成功。フル6条件は実Actionsで確認する。
- Issue原文はAPI読戻しで添付全文と一致確認。PR #71はopen/unmergedであり依存しない。[Draft PR #81](https://github.com/tetsujisugimori-coder/calculator-memo/pull/81) を作成。Git CLI pushは認証不足で失敗し、認証済みAPIのblob/tree/commit/refで公開、ローカル検証ツリーとの完全一致を確認した。最終文書更新後のHEADについて実CIを確認し、結果はPR Checks/完了コメントへ記録する。
- ローカルWebKitは今回もOS依存不足で起動失敗。実Actionsの6条件と区別し、成功と扱わない。本PRはDraftのまま人間のレビュー待ちとし、自動merge・本番公開は行わない。


## 2026-10-24 JST: 固定引用と明示選択した保存記録の比較（Issue #76）

- 着手: 最新main `1f2e90267ec8832dca9f4b77b6b9ae83bf91cba3`、PR #75 merge済みを確認。cleanな新規cloneから `feat/76-quote-record-comparison`。PR #71には依存しない。[Issue #76](https://github.com/tetsujisugimori-coder/calculator-memo/issues/76) に依頼原文を保存し、本文を保持する。
- 調査: 固定引用はMarkdown内の検証済み全記録snapshotを保持し、既存 `compareEvidenceRecords` は安定ブロックID、式/モード/実使用元/内部値/表示値/順序を比較できる。根拠候補は保存済みリンクからだけ解決できる。元記録の取得成功を比較元の条件とせず、同じメモIDの別記録だけを利用者が選ぶ。
- 採用案: 既存比較関数とRecordInfo/BlockInfo表示を再利用する読み取り専用比較モーダル。別メモの推測対応、日時順の自動選択、新しい影響分析、独立した再取得経路は追加しない。親の原本取得経路を共有し、世代変更/未照合時は選択・差分を失効させる。本文編集時は追跡snapshot比較と明示する。
- 変更予定: `lib/formula-quote-comparison.ts`、引用状態/比較UI、既存editor/detailの再取得接続、必要なCSS、単体/GUI境界回帰、README・設計文書。本体評価器、保存schema/version/制限、assessment、確認履歴の条件は変更しない。
- 検証: ローカル全単体1453件/63ファイル（追加境界/UI33件）、lint・型検査・通常/Pages build成功。独立レビューで引用切替時の選択失効と選択解除通知を修正し、33件再確認で阻害指摘なし。既存CI契約は36/37、未変更の100ms合成timeout試験がNode24の起動中に終了し期待ログを取得できず失敗。期限や期待値は緩めず、固定Node22の実CIで確認する。
- GUIは既存6条件に各2検査群と9操作を追加し、720検査・mobile945操作・geometry562、30分・114PNG・成功trace非保存を維持。最終結果はPR Checksへ記録する。ローカルWebKitは必要なOSライブラリ不足で起動不可、実機iPhone Safari/VoiceOverは未検証。
- ローカル重点GUI: 隔離Playwright Chromium desktop1365と375px touchで引用4群（既存2+新規2）成功、touch30操作（従来21+追加9）を実測。両テーマ200%、モーダルTab/復帰、本文編集の説明、stale/再取得、原本不変を確認。WebKitローカル未実行を成功と混同しない。
- [Draft PR #77](https://github.com/tetsujisugimori-coder/calculator-memo/pull/77) を作成。Git CLI pushは認証不足で失敗したため、認証済みGitHub経由のblob/tree/commit/refで公開しローカル検証ツリーとの一致を確認。最終HEADの実CIはPR Checksと完了コメントへ記録する。この文書更新後の成功を先取りしない。
- Issue原文は読戻し一致を確認。保存schema/version/制限・確認履歴・assessment・計算エンジン変更なし。比較表示は読み取り専用で、rollbackはコードのみrevert、データ移行不要。


## 2026-10-24 JST: 計算根拠の固定引用（Issue #74）

- 最新main `e46c5e2`（PR #73 merge）を新規checkoutで確認し、専用枝 `feat/74-calculation-evidence-quotes` を作成。[Issue #74](https://github.com/tetsujisugimori-coder/calculator-memo/issues/74) に初回依頼原文を掲載・読戻し確認、本文は以後保持する。
- 調査: EvidenceRecordには登録式IDがない。既存レポートの保存済み `evidence.links` だけが確実な関連付けであり、式文字列・名前による推測はしない。既存の `resolveReportEvidence`、RecordInfo/BlockInfo、Markdown共通parserと保存/競合/読戻し経路を再利用する。
- 第一希望: 引用本文とversion付きスナップショットを通常Markdown内の安全なコードフェンスで保持する。別metadata/既存link拡張は保存schemaと旧版の未知フィールド保護に影響するため不採用。現行JSON version1、本文100,000文字・全体1MB・確認20件を変更しない。大きな引用は切り捨てず挿入を拒否する。
- 比較範囲: 保存リンク先の記録全体と選択ブロック。計算記録は既存契約上、全件成功の確定記録だけであり、未保存試算やエラー記録を捏造しない。原本変更/欠落/取得不能、本文とmetadataの不一致を別表示する。引用は真正性・数学的証明を保証しない。
- 変更対象: `lib/formula-report-quotes.ts`、引用UI部品、FormulaReportModal/FormulaDetailView、CSS、単体/GUI回帰、READMEと設計文書。本体評価器・保存validator・assessmentは原則変更しない。
- 検証: 全単体1419件（61ファイル）、引用専用64件とUI19件を含む。lint・型検査・通常/Pagesビルド・CI契約37件成功。独立レビューの阻害2件（引用コード折返しのCSS優先度、未閉鎖コード/数式末尾への挿入）を修正し、83件再実行と再レビューで解消。既存Markdown parserは変更せず、閉じたブロック外への挿入だけを許す。
- GUIは既存6条件に引用の保存/再読込/変更/欠落と長いID・式の両テーマ200%折返し検査を追加。契約708確認・モバイル936操作・既存幾何562確認、PNG114枚と成功時traceなし・30分上限を維持。実ブラウザは最終HEADのGitHub Actionsで検証する。現時点で実CI成功は先取りしない。実機iPhone Safari/VoiceOver、OSクリップボードは未検証。
- [Draft PR #75](https://github.com/tetsujisugimori-coder/calculator-memo/pull/75)、初回実CI [40061627915](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/40061627915) はGUI失敗。6条件とも新規テストが通常レポートに孤立レポート用のタイトルボタンを誤指定し、引用操作前にタイムアウト。正規の「関連レポートを閲覧・編集」へセレクターを修正。製品不具合とは断定せず、検査/操作数を維持して全条件を再実行する。
- 2回目の実CI [40062438140](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/40062438140) はChromium4条件が完走、WebKit375/390で引用候補の200%表示が横幅超過。引用コードの折返し検査は成功し、長いnative optionの幅が親へ漏れる挙動と推定。候補表示を番号+短いIDにし、全文は既存詳細へ保持、既存selectのappearance描画を共用する修正を追加。外側全体のoverflow隠しや検査緩和は行わない。長いID/式の選択詳細・metadata保持をUI単体へ追加し、引用64+UI20件、全単体1420件となる。
- Draft PRで人間のレビュー待ちとする。最終コミットの実CI結果はPR Checksと完了コメントに記録し、この記録自体に将来の成功を捏造しない。


## 2026-10-24 JST: 数学レポートのテンプレートと章一覧（Issue #72）

- 最新main `bdadd3dede1f15857fc0217bfe09147e46ba9666`（PR #70 merge）から専用枝。PR #71 は未マージで依存しない。[Issue #72](https://github.com/tetsujisugimori-coder/calculator-memo/issues/72) へ初回依頼原文3510文字を掲載し読戻し一致、本文は変更しない。
- 第一希望の末尾追加式6章テンプレートと既存Markdown parser共通化を採用。新規初期本文は6章へ更新、保存済み本文は自動変更しない。ネイティブUndoの互換性を保証せず、直前の追加だけの安全な取消を提供。後続編集・保存後に古い内容へ戻さない。[設計・範囲・戻し方](docs/agent/report-template-navigation.md)。
- 表示専用位置IDで同名見出しを区別、編集行選択／プレビューfocus、折りたたみ式章一覧。原本保存形式、確認履歴・備考、assessment、20件/1MB、計算エンジンは変更なし。
- 独立レビューで、段落直後の字下げ付き独立数式境界の既存不整合を発見。共通parserの段落終了条件を修正し、数式内の # を章にしない回帰試験を追加。長文の編集行移動は選択だけに頼らず、同じ文字組みの一時要素で表示位置を測定する。
- 検証: 単体1336件/59ファイル、lint、型、通常/Pagesビルドを実施して成功。37契約は初回成功、最終再試験では36/37。未変更の0.1秒合成timeout試験が子Nodeの出力前に終了し期待ログ不一致（独立レビュー環境でも同じ症状）。期待値や期限は緩和せず、実CIで別途確認する。独立レビューの51重点試験成功、数式境界修正を再確認し残るソース上の阻害なし。最終HEADの結果はPR Checksと完了コメントを参照し、この記録時点で成功は先取りしない。GUIは既存6条件と全既存検査を維持し、新規操作群1件/条件を追加。期待計696チェック、562geometry、mobile915操作、PNG114・成功trace0・30分上限は維持。
- 初回npm ciは既定cacheの書込不可で失敗。専用/tmp cacheへ変更して723依存の取得成功。依存version/lock変更なし。
- 未検証: 実機iPhone Safari・VoiceOver。ローカルブラウザはsocket権限でページ起動前停止。実GUIは既存GitHub Actionsで確認する。[Draft PR #73](https://github.com/tetsujisugimori-coder/calculator-memo/pull/73) を作成。CLI認証不足のためGitHubコネクタで公開し、ローカルとGitHub tree一致を検証。マージ/公開/main pushは行わない。



## 2026-10-23 21:00 JST: 明示確認時の任意備考（Issue #69）

- PR #68 merge済みの最新main `07f7e259c621685a30b587c957259da876bddbe9` とcleanを確認。[既存Issue #69](https://github.com/tetsujisugimori-coder/calculator-memo/issues/69) の本文は依頼原文と照合し変更せず、専用枝 `feat/69-confirmation-remarks` を作成。
- 第一希望の確認レコード optional `remarks` を採用。旧version 1のまま旧欠落/新空欄を区別し、500 UTF-16コード単位を厳格検査。備考は利用者の申告であり、変更イベント/数学的保証/現在状態の照合条件ではない。[設計・変更範囲・互換性・ロールバック](docs/agent/formula-confirmation-remarks.md)。
- 通常保存は備考を渡さず、明示確認だけ新規履歴へ付加。既存共有ロック・競合検知・checked読戻しを再利用。保存待ちは入力固定、失敗/保護/キャンセル/通常保存後は備考を保持、確認成功時だけクリア。閉じる警告も備考を含む。過去の履歴は変更せず通常テキストとしてタイムライン/既存履歴へ表示。
- 未知フィールド保護、履歴20件、全体1MBは不変。空欄remarksも旧版では未知キーとして保護停止する。コードrevertのみでは旧版編集へ戻らないため、全原本JSONを退避し備考の削除や初期化で回避しない。
- 検証: この変更ツリーで単体1285件/57ファイル、lint、TypeScript、通常/Pagesビルド、CI契約37件成功。独立レビューが104件を実行。追加GUIのstatusセレクター重複を阻害指摘として修正し再レビューで解消、製品コードに阻害なし。GUIは初回ブラウザ未配置で起動前停止、公式ブラウザ取得後の再試験中（WebKit OS依存不足を確認）。[Draft PR #70](https://github.com/tetsujisugimori-coder/calculator-memo/pull/70) を作成。公開ツリーSHAはローカルと一致。ローカル再試験はChromiumの2マウス条件を完走したが、並行commitによるHEAD変更で後続4条件はSHA整合チェック停止（実装側の検証進行ミス）。全条件成功とは扱わない。固定最終HEADの実CI結果はPR Checksを参照し、この記録コミットの成功は先取りしない。
- GUIは既存6条件を維持し確認失敗→再試行・備考境界/Unicode/文字列表示を追加。操作増加に合わせtouch期待数906→907（検査緩和ではない）。PNG114、成功traceなし、30分上限は変更しない。
- 未検証: 実機iPhone SafariとVoiceOver。WebKit自動試験とは区別。マージ/本番公開/mainへのpushは行わない。

## 2026-10-23 19:10 JST: 根拠・確認履歴タイムライン（Issue #67）

- PR #66 merge と最新main `5cfee354167c51bf6d1021ef9df337bbae338291`、cleanを確認。重複検索後 [Issue #67](https://github.com/tetsujisugimori-coder/calculator-memo/issues/67) へ依頼原文2421文字を掲載し読戻し一致。本文は変更しない。専用枝 `feat/confirmation-timeline`。
- 変更日時/理由/途中経過/当時の判定結果は保存されていない。第一希望の変更イベント込み表示は推測なしでは成立しないため、確認履歴中心+取得原本との差分という依頼内の次善策を採用。[事実/条件付き/不足・設計](docs/agent/formula-confirmation-timeline.md)。保存形式拡張と過去イベント生成は不要。
- 式・本文タイトル・リンクの独立差分を表示し、判定は既存formulaReportAssessmentを再利用。過去一致を現在承認へ格上げせず、snapshotのstale/取得失敗/未知不正保護と取得日時を共有。時差付き日時昇順/同時刻保存順、時差なしは全保存順で限界明示。保存配列末尾の既存最新判定は不変。
- ローカル全単体1267件/56ファイル成功（追加12件）。CI契約37件成功。独立レビューは製品差分に阻害指摘なし、関連54件を独立実行し成功。通常/Pagesビルド・GUI・最終HEAD CIは進行中で、実測結果をPRへ記録する。
- CI環境/30分/6条件/114PNG/trace方針・計算エンジン・writer・保存形式・明示確認条件は変更しない。実機iPhone Safari/VoiceOver未検証。revertはUI/表示投影/テスト/文書のみ、データ移行なし。
- 19:15 JST追記: [PR #68](https://github.com/tetsujisugimori-coder/calculator-memo/pull/68) をDraft作成。13blob/tree一致を確認し認証済みGitHub経由で公開。型/lint/通常・Pagesビルド成功。重点GUIはChromium/WebKit各desktop1365/375/390、両テーマ200%文字とkeyboard、他タブ更新/失敗/再取得、原本不変の計42確認成功。正式最終HEADの6条件CIは未確認でPR Checks/結果コメントへ記録する。

## 2026-10-23 16:16 JST: PR #66 保存原本取得の順序追加検証

- 開始HEAD `f1e488f8ab598d4a08d348ee93bad7180bd36498`、同じ `feat/65-formula-evidence-status`、Ready・未マージ・cleanを確認。Issue #65 原文は変更せず、新規PRを作らない。
- 先に formula-snapshot-ordering.test.ts へ10件追加。pendingSave/外部通知/完了の別commitと同一バッチ両順序、同期refresh前後の通知、取得失敗から両再取得ボタンで復帰、原本・履歴不変を検証。製品未変更で成功し、再現した製品不具合なし。
- 実保存の競合拒否は既存CalculatorAppテストと区別して確認。同期getItem内にstorageイベントを直接dispatchする人工的再入を実障害扱いしない。第一希望を維持し製品修正不要、予防的な状態判定や保存経路の追加は行わない。詳細と限界は [設計](docs/agent/formula-status-list.md) に追記。
- 独立再レビューは追加10件と実保存12件の計22件成功、阻害指摘なし。jsdom順序模擬と実ブラウザ配送、全Reactスケジューリング網羅、Web Locks非参加クライアント、実機Safari/VoiceOverは区別して未保証とする。
- ローカル全単体1255件/55ファイル、CI契約37件、TypeScript、lint（警告0）、通常/Pagesビルド成功。
- 最終コミットの全CI・GUI結果はPR #66 Checksと結果コメントへ記録する。30分・6条件・114PNG・trace方針、製品コード・保存形式・計算・明示確認条件は変更しない。ロールバックは今回のテストと文書差分のみrevert、データ移行不要。


## 2026-10-23 15:08 JST: 登録式の根拠状態一覧・絞り込み（Issue #65）

- PR #64 の merge と最新 main `f77ae781a2d5e033db40beadd42c0e6bb41d43ae`、clean を確認。関連Issue/PR検索で同一依頼なし、[Issue #65](https://github.com/tetsujisugimori-coder/calculator-memo/issues/65) に初期依頼2140文字を原文掲載し読戻し完全一致。本文は変更しない。専用枝 `feat/65-formula-evidence-status`。
- AGENTS、README、LOG、保存/根拠/詳細/GUI/CI方針と実装を調査。第一希望の小規模統合を採用し、PR #64 の読み取り専用snapshotを共通化。一覧と詳細が同一原本・更新検知を使い、既存 formulaReportAssessment の結果だけを表示分類へ写像する。根拠なしと未確認を区別し、5グループの絞り込みをローカル状態で提供する。
- 未保存編集・試算は根拠へ渡さず、保存成功後の取得と外部更新後の明示再取得を区別。取得失敗/未知/不正原本を確認済みへ格上げしない。式の計算・保存形式・writer・確認条件・削除後の原本保全は変更しない。[設計・次善策・復旧](docs/agent/formula-status-list.md)。
- 実装・検証・独立レビュー・PR・最終HEAD CIはこの記録時点で未完了。実測を後続記録へ追記する。main push・merge・公開なし。
- 15:20 JST追記: [PR #66](https://github.com/tetsujisugimori-coder/calculator-memo/pull/66) をDraft作成。接続済みGitHubで全13blobとtree `9bf8dcad1fb73c995c9d367e9207b78592441cf3` の同一性を確認して公開。最終HEADの実CI結果はPR本文/コメント/Checksへ記録し、この文書commit自身の成功を先取りしない。
- 15:14 JST追記: 一覧専用回帰25件を追加、全単体1245件/54files、CI契約37件、型、lint、通常/Pages buildが成功。独立レビューは6関連suite149件を実行し阻害指摘なし。状態の読み上げ説明をvisible labelのaria-describedbyで補強。
- 作業ツリーの重点GUIはChromium desktop15チェック・375px touch16チェック/80操作、両テーマ200%文字、実2ページ更新・全状態絞り込み・保存原本不変が成功。全6条件は672チェック/562幾何確認/mobile各903操作を要求し、114PNG・30分・trace方針を維持。正式最終HEADの実Actionsは未確認。実機iPhone Safari/VoiceOverは未検証。

## 2026-10-23 13:34 JST: PR #64 更新検知・未知データ保護の追加検証

- 検証開始時の PR #64 は未マージ、HEAD `251ebd7c8355d717f891a477d55213ee6eee7236`、同じ `feat/63-formula-detail` で clean。Issue #63 本文は変更しない。
- 同一タブは storage event に依存せず、登録式編集終了と pendingSave の遷移で詳細を再マウント、レポート終了では detailRevision で再取得する。名称変更／式・変数変更／本文保存／明示確認成功／編集破棄を実UIと保存処理を通して検証した。
- 他タブ保存時は取得時点の古い内容を明示し「根拠未照合」に移行、明示再取得で新しい式・本文・状態になる。詳細の再取得はアプリ全体の競合保護を解除しない。実ブラウザの同一context内の2ページで双方のUI保存を行う検証を追加した。
- loadData → readFormulaReports → readReportEvidence の検証により、不正な confirmation.definition / links / confirmations は描画前に拒否する。未知version、不正構造、欠落根拠で例外・確認済みへの格上げ・原本変更がない。対応済versionの追加report metadataと登録式の未知属性は通常保存でも保持される。未知属性を含む式は判定不能を維持する。
- 第一希望「再現時のみ最小修正」に従い、製品不具合は再現しなかったため製品コードを変更しない。代替の防御ロジック追加や重複判定は不要。保存形式・計算・再計算・確認保存条件・CI環境・時間上限・PNG/trace方針は無変更。
- 回帰テスト20件追加。単体1220件/53ファイル、CI契約37件、型検査、lint成功（既存warning1件/error0）。独立再レビューで阻害指摘なし、詳細UIと更新経路43件および契約37件を独立実行して成功。
- ローカルChromium375px全109確認が成功（約171秒、合成データ、製品は開始HEADで未コミットの検証差分を実行）。最終HEADの成功とは別証拠。GUIは各条件2確認追加で6条件654確認、mobile888操作へ増加、既存114 PNG・成功trace0・30分上限を維持。最終HEADの全6条件と両ビルドを含む正式CIは、この記録を含むコミットのPR Checksと追加結果コメントで追跡する。
- 未検証: 実機iPhone Safari、VoiceOver、外部配布元障害の恒久的解消。ロールバックは今回の検証・文書差分のみrevert可能で、保存データの移行・復旧操作は不要。
- 関連: [PR #64](https://github.com/tetsujisugimori-coder/calculator-memo/pull/64)、[Issue #63](https://github.com/tetsujisugimori-coder/calculator-memo/issues/63)。修正不要の根拠と最終CIはPRコメントに残し、人間の再レビュー待ちとする。

## 2026-10-23 12:28 JST: Issue #63 登録式詳細の保存済み原本閲覧

- PR #60 / #62 のマージと最新main `e1714b7ff9b9ed64df894f16e750cf32f0e91957` を確認し、cleanな作業領域から `feat/63-formula-detail` を作成。既存Issue #63は依頼と同じ要件が見出し・箇条書きで整形されていたため重複Issueを作らず本文を保持する。
- 第一希望の小規模な既存ライブラリ統合を採用。保存済み原本のみを読む詳細、既存assessment/Markdown/履歴根拠/出力の再利用、ローカル選択による閲覧時autosave除去を追加。新保存形式・計算エンジン・再計算・明示確認の保存経路は変更しない。
- 次善の別画面・選択状態の追加永続化は不要。変数説明は現行保存形式にないため推測せず不在を表示。原本更新時は未照合へ戻し、未保存propsを根拠へ混入させない。詳細は取得時点の表示で、再取得は読み取りのみ。
- 新規UI単体23件と既存report UI25件を独立実行し48件成功、独立レビューで阻害指摘なし。初回全体実行の追加fixture文言不一致1件は正しい表示文言へ修正（既存製品期待値の緩和なし）。全単体1200件、CI契約37件、TypeScript、lint、通常/Pages build成功。実GUI・最終HEAD CI結果は後続記録へ追記する。
- GUI受入を1件/条件追加（642件）、タップ6回/条件追加（872回）。6条件・562スクリーンショット幾何チェック・114PNG上限・trace・30分は維持。実機Safari/VoiceOverは未検証。原本JSON保全を維持し、ロールバックはUI/テスト/文書コミットのrevertのみ。


## 2026-10-23 10:38 JST: PR #62 実GUIの識別子衝突による誤検出修正

- [CI #125](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/39882922876) / `0d1f2ed9e8974d479d84d6c6fdfca6f0d187253b` は準備・単体・型・lint・両build成功、GUI 6条件中Chromium mobile390だけ失敗。全体約21分、GUI18分30秒で30分timeoutではない。artifactは101PNG/失敗trace1件（947,993 bytes）、ZIP29,951,289 bytesで既存上限/失敗時保存方針内。
- worker logの実際値を確認すると、過去の選択記録は式z=-0・内部値-0のままであり、選択候補の別記録UUID `30e3bdc3-011f-4c1f-99ba-99936dfbc9af` が広すぎる「根拠section全体に999がない」検査に一致していた。未保存値混入や環境取得障害ではなく、受入検査の対象範囲の誤り。
- 第一希望の実使用値検査を維持し、次善の無条件再実行や期待値削除は採用しない。選択記録の詳細1件へ同じnot999検査を限定し、候補ID `unselected-record-999` を固定fixtureへ追加して衝突を毎回検証する。実使用値/-0確認、保存原本のdeepEqualは維持。製品コード・条件数・timeout・画像/trace予算は変更しない。
- ローカルChromiumのDOM再現で旧selector失敗、新selector成功、選択詳細に実999を注入すれば新selectorも失敗を確認。既存GUI固定fixtureにも同衝突を組み込み、実6条件の再実行は新HEADで実施する。構文/CI契約37件成功。実機Safari/VoiceOverは未実施。初回ローカル起動は既定cacheにbrowserがなく未実行、既存の専用browser保存先を指定して再現を実施した。
- この追補の独立再レビューで阻害指摘なし。追加ローカル全scenario起動はbuild provenance未作成のため開始前停止し、実GUI成功とは数えない。新HEAD実CIは後続PRコメントに結果を記録する。旧失敗を削除せず、成功を先取りしない。

## 2026-10-23 10:13 JST: PR #62 根拠照合経路・未知フィールド保護のレビュー修正

- 対象 [review 5622765828](https://github.com/tetsujisugimori-coder/calculator-memo/pull/62#pullrequestreview-5622765828) / HEAD `0cb3251e554fa9a73f6eff594d931d9db91dc4a2` と既存作業枝・clean状態を照合。mainは `4b87b370e348740c090c0ed7ec4a9a1c6f8067d8` のまま。Issue #61依頼原文は変更しない。
- Aの事実: `formulaReportCorrespondence` の呼出しはテストだけで、現在UIの誤判定経路は確認されなかった。UIは `acquireEvidence/loadData` の複製した保存原本、保存処理は共有ロック内の再読込原本notesをassessment/saveへ渡す。未使用互換APIを削除するより2引数互換を残し任意savedNotesを転送する最小補強を採用。未取得はunknownのまま「根拠未照合」と理由表示し、取得済み欠落・同ID不一致とは区別する。
- Bの不具合: readerは未知キーを複製保持していたが、現在リンクの明示削除で未知キーが消える保存経路と、未知確認履歴へ新しい対応済み確認を追記して判定が正常へ進む経路を再現。全履歴ではなく最後だけの判定では不十分だった。
- 方針訂正: 未知キーを残しつつ通常編集する従来策から、根拠領域/現在・過去リンク/全確認履歴/確認式定義の未知キーを読込・候補作成時に拒否し、既存非破壊保護で原本JSONを救出する方針へ変更。キーの削除や自動移行はしない。第一希望は将来意味を理解した編集だが現行仕様では不可能なため、次善策として保存全体を保護する。レポート本体/上位の付随未知metadata保持・evidenceなしの旧形式は従来どおり。
- 修正前回帰: 追加16件のうち15件失敗（転送1、未知場所6×読込/保存候補、リンク削除1、確認格上げ1）、根拠なし1件成功。修正後は追加17件（アプリ保護1件を含む）成功。既存の未知根拠metadata受理テスト1件は上記方針変更に基づき原本保持/読込停止を検査するよう変更。アプリ保護試験の初回「ライブラリ閲覧入口も無効」期待は実仕様と違ったため、閲覧入口は維持し保存拒否/書込み0/原本不変を実経路で検証した。
- ローカル検証: 単体1177件/51files、CI契約37件、型、lint（既存warning1のみ）、通常/Pages build成功。根拠なし/正常リンク/notes未取得/欠落/同ID差替/式・変数・本文変更/未知6階層/旧形式/競合/保存失敗/readback不確定/20件と容量上限を関連回帰で確認。独立担当の4関連ファイル105件実行成功、A/B差分に阻害指摘なし。
- 計算エンジン・UI操作・自動再計算・writer・保存項目/上限・workflow・6GUI条件・30分・114PNG・trace方針に変更なし。今回の最終HEAD実Actions/Chromium・WebKit全条件はこの記録時点で未確認、結果はPR本文/コメントへ実測追記する。実機iPhone Safari/VoiceOver未検証。
- 戻し方: 原本JSONを退避して本修正commitをrevertできるが、旧コードは未知根拠を再び編集可能にするため、未知情報を含むデータを旧版で保存しない。根拠を削る移行は行わない。mainへのpush、merge、本番公開なし。




## 2026-10-23 08:42 JST: 登録計算式レポートの根拠追跡と変更検知（Issue #61）

- 08:55 JST追記: [PR #62](https://github.com/tetsujisugimori-coder/calculator-memo/pull/62) をDraft作成。CLI pushは資格情報がなく未実行終了したため、接続済みGitHubの各blob SHAとtree `0630d3c17a4ae310825d319b98ce3a3dd8d138d9` 完全一致を確認して公開。初期公開HEAD `367ce9930877eba58fd21c6531dbee07350fc995`。旧確認情報に通常保存だけで空の新領域が追加されても、日時/変数不足の判定不能を維持する追加回帰を実施。追加後の単体1160件・型・lint・両buildも成功。この追記を含む最終HEADのCI結果はPR Checks/コメントへ記録し、未確認の成功を先取りしない。

- PR #60 の merge と最新 main `4b87b370e348740c090c0ed7ec4a9a1c6f8067d8`、作業ツリー clean を確認し `feat/formula-report-evidence` を作成。関連 Issue/PR を照合し、[Issue #61](https://github.com/tetsujisugimori-coder/calculator-memo/issues/61) に依頼本文2,542文字を改変せず掲載し読戻し完全一致を確認。初回依頼正本は変更しない。
- AGENTS、README、LOG、登録式/レポート/保存保護/保存記録比較、GUI/CI運用を調査。登録式に独立した変数定義欄はないため、既存構文解析の参照変数を式定義の一部としてversion付きで保存し、実行入力値とは分離する。式名称変更は意味変更と区別する。
- 第一希望: 既存レポートの optional 根拠領域に安定したメモID+記録IDと追記確認履歴を保持し、保存原本を固定して閲覧する。確認履歴には式・変数・本文/タイトル・選択根拠・日時・確認IDを保持。本文変更でも旧確認履歴を消さず、現在の本文を以前の確認で承認しない。旧確認式だけのデータは日時/変数を推測せず新基準で比較不能とする。
- 制約/次善策: 本文複製で容量を消費するが、衝突可能な短いハッシュや再計算で置き換えず、件数と既存1MB総容量に収める。上限時は保存を停止し、自動削除・過去確認の上書きをしない。詳細は [設計](docs/agent/formula-report-evidence.md)。
- 明示保存とreadback成功の境界、未知/不正形式保護、旧データ、原本競合を維持する。計算エンジン、保存済み根拠履歴、未保存編集・試算、PR #60のCI準備/30分/6条件/114PNG/trace運用は変更しない。
- 実装・検証・独立レビュー・PR・最終HEAD CIは着手時点で未完了。結果を先取りせず後続記録へ追記する。mainへのpush/merge/本番公開は行わない。
- 08:50 JST追記: 確認式/抽出変数/対象本文/記録内容照合情報の追記履歴、ID関連付け、状態比較と読み取り専用詳細を実装。単体1159件/51ファイル、CI契約37件、型、lint（既存warning1のみ）、両buildが成功。独立レビュー84件・型・差分検査で阻害指摘なし。初報の同ID差替と旧確認消失リスクを修正し回帰追加。
- ローカル重点GUI Chromium desktop/375pxは両テーマ200%文字・タッチ/キーボード・原本不変・-0・欠落再取得が成功。WebKitはlibGLESv2.so.2不足で起動前停止し、ホスト検査を無効化せず実Actionsで検証する。正式全6条件/最終HEAD CIは未確認。GUIに2受入群と2配置地点/条件を追加し636検査/562配置/mobile各866touchを要求、既存114PNG・30分は不変。

## 2026-10-23 07:40 JST: PR #60 CI環境取得タイムアウトの原因検証と最小修正

- 基準HEAD `b3ebe0c8591078071f7fe55f2506553492fa2f60`、[成功#118](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/39841897542)と[失敗#119両attempt](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/39845374995)の公式job/logを照合。全回119MB/181新規+8更新、成功9秒、失敗はAPT archive取得で1716/1757秒を消費しGUI未開始。成功とattempt2は同image、リージョンは異なるが通信経路/ミラー内部どちらが唯一の根因かは未確定。
- 従来はOS/browser一括準備が30分全体予算まで待てた。第一希望の同runner/正規全依存維持を採用し、Azureの正確なUbuntu URIだけ公式HTTPS archive/securityへ変更、APT timeout/retry有界化、OS5分/browser3分の段階別log/timingへ分離する。公式containerは環境差とimage取得検証が必要な次善策、cacheではAPT問題を代替できず今回は未採用。[比較・根拠・安全境界・復旧](docs/agent/ci-environment-acquisition.md)。
- 変更はCI準備script/workflow/契約テスト/文書のみ。製品、lockfile、30分、6条件624検査/550配置/mobile各855touch、114PNG、trace/7日artifact方針を維持。署名/TLS検証を緩めず未知source構造は停止する。
- 独立レビューのSuite継続行見落としを修正し回帰fixtureを追加、再レビューでコード上の阻害指摘なし（実CI成功は別条件）。CI契約36件成功（既存28+追加8）。単体1127件/50files、lint 0error（既存warning1）、型、通常/Pages両build、YAML構文検査が成功。修正後実GitHub Actions全完走は未確認であり、最終HEADの成功はPR Checks/コメントで確認する。模擬timeoutは実ネットワーク障害の再現とは別。
- 07:48 JST追記: 初回修正HEAD `9c4a1085c100287aa917292019787fa59af24a3f` / [CI #120](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/39867226720) は直接Azure URIを前提にした設定ガードで失敗。公式runner-imageのmirror+file構造を確認し、正確な既知URIだけへの対応と設定優先順を修正。未知構造拒否は維持、外部障害と区別して記録。37契約で回帰し、新HEAD実CIを確認する。
- Issue #59本文は保持、既存PR #60/作業branchにのみ反映する。main直接push/merge/本番公開なし。rollbackはCI限定差分revertとfresh runnerで行い、保存原本に変更不要。1回の成功で外部通信の恒久的解消を断定しない。

## 2026-10-23 04:26 JST: 登録式の関連数学レポート（Issue #59）

- 04:37 JST追記: [PR #60](https://github.com/tetsujisugimori-coder/calculator-memo/pull/60) をDraft作成。実装tree `489277a8634a46aeb982a4197ac79837493548b2` を各blob SHAと照合してGitHubへ公開。コードcommit `118e87620f53535da772eee2ab7c5ba8862d122b`。この文書追記コミットを含む最終HEADの全6条件GUI・CI結果はPR Checks/コメントで確認する。過去HEADの成功は流用しない。初期GUI重点Chromium desktop/WebKit375、契約28件は成功。mainへのpush/merge/本番公開なし。

- PR #58 merged / 最新 main `93180027baef45acf57f886b3adf37280a900bfd`、新規 checkout clean を確認し `feat/formula-math-reports` を作成。初回依頼正本 [Issue #59](https://github.com/tetsujisugimori-coder/calculator-memo/issues/59) の本文は変更しない。
- 実装前に既存登録式/実行/Markdown/保存保護/CIを調査し、独立 optional `formulaReports` 領域、既存描画・保存ロック/readback再利用、明示確認・孤立レポート保全の方針を報告。[調査・第一希望・互換性/復旧](docs/agent/formula-reports.md)。
- 依頼文の top-level schemaVersion=1 は実コードでは version:1。フィールド名を変更せず追加領域で互換性を維持する。未知root/settings付随キーを保持する補強を行い、未知version/不正構造の保護は緩めない。
- 実装・単体/GUI・独立レビュー・最終HEAD CIは着手時点で未完了。成功結果は実測後に追記する。PR未作成。
- 04:32 JST追記: 関連レポートの独立保存・安定ID・生Markdown編集/既存安全プレビュー・本文コピー/.md・明示確認・式変更の要確認・名称変更の区別・削除後孤立レポート救出を実装。本文/タイトル編集は確認を無効化。保存成功はロック内の原本/式/レポート照合とreadback後にのみ表示する。
- 単体1127件/50ファイル、lint 0 error（既存aria-description警告1）、型検査が成功。通常/Pagesビルド成功。独立レビューは関連109テスト・型・diff検査で阻害指摘なし。指摘された超過本文preview負荷と競合時の確認済み誤表示は防止し回帰追加。実ブラウザ最終6条件・対象HEAD CIは確認待ちであり、この時点で成功扱いしない。
- GUIは既存6条件・30分・114 PNG・成功trace非保存を維持して5受入群を追加。実機iPhone Safari/VoiceOver/OS文字拡大は未検証。ローカルNode24.19.0、CIの固定Node22.13.0は変更なし。新しい依存パッケージ追加なし。初回npm cache書込み失敗は専用/tmp cacheで再実行して解消。
- 旧版は新しい領域を落とす可能性があるため、rollback前に原本JSONを退避し旧版で新データを上書きしない。説明の正しさ、数学的証明、出典の信頼性は自動保証しない。Issue #59本文は原文維持。PRは未作成、最終HEADの検証は後続PR Checksへ記録する。

## 2026-10-22 20:20 JST: 保存記録の影響経路図（Issue #57）

- PR #56 merged と最新 main `2c1b55db104afa60ab1fb61ab2b73507de4043af`、作業ツリーcleanを確認し `feat/saved-impact-graph` を作成。関連Issue/PRを照合しIssue #57に目的/範囲/受入条件を記録した。
- 既存分析を唯一の判断元とし、前後別実使用辺/代表経路の表示アダプタと専用UIを追加する方針を実装前に報告。現在メモの編集移動を持つUI全体再利用ではなく、安全なMermaid直列描画/SVG再構築だけの共有を採用。分類/探索/engine/schemaは変更しない。
- 図選択・起点別経路・全体/経路表示・前後詳細・世代取消を実装。描画上限は分析上限と別表示し、小さな選択経路と既存一覧/Markdownへ退避。非破壊性と数値精度を維持する。
- 予備検証: 新規表示モデル20件、既存/追加UI32件、SVG12件成功。型検査とPagesビルド成功。全単体・通常ビルド・実GUI6条件・独立レビュー・最終HEAD CIは後続に実測記録し、現時点で完了としない。


- 20:30 JST追記: 全単体1071件、CI契約28件、lint（エラー0・既存aria-description警告1）、型検査、通常/Pagesビルド成功。独立レビューの遅延SVG完了によるフォーカス奪取を修正し回帰追加。空経路/描画失敗で古い成功状態・件数を残さないよう修正。レビュー再検証66件成功、残存阻害指摘なし（最終GUI/CI成功を条件とする）。
- GUI検証の判断変更: 最初の文字拡大試験は既存DOMだけを拡大し、側切替で再生成したSVGが拡大対象から外れるとレビューで判明。root文字サイズと再生成後の図幅/文字幅2倍の実測を組み合わせた試験へ補強。Chromium desktopの対象操作は成功、WebKit375は200%時のページ横幅465pxで厳格検査失敗、原因調査中。成功として記録せず、条件/上限を緩めない。


- 20:34 JST追記: 横幅超過を既存の識別表示selectに特定。WebKit375/root200%の空画面でもlabel幅299px/scrollWidth453px、document465pxを再現。図の不具合という見立ては採用しない。grid/max-widthだけでは解消せず、native外観変更と切捨てを避け、既定選択肢を「初期設定」に短縮して意味を可視説明/aria-describedbyへ分離する次善策を採用。実ブラウザ試作でdocument375px/label scroll299px。設定値・保存は変更せず回帰試験を追加し、最終全条件を再実行する。

- 20:37 JST追記: 修正後の全単体1072件/47ファイル、lint（既存警告1のみ）、型検査、通常/Pagesビルド成功。新規識別表示UI1件の独立レビュー成功。製品ビルドのfocused Chromium desktop/WebKit375が両テーマ・root200%で成功し、再生成SVG/文字の2倍拡大とページ幅375px、フォーカス、図操作、コピー/ダウンロード、取得世代の非混入を確認。正式6条件と最終HEAD CIは確認待ち。


- 21:20 JST追記: [PR #58](https://github.com/tetsujisugimori-coder/calculator-memo/pull/58)をDraft作成、[Issue #57](https://github.com/tetsujisugimori-coder/calculator-memo/issues/57)へ紐付け。ローカル検証HEAD `4e375e56ac8be574b4aa40a7229d312c0eeafa7a` と公開HEAD `7ec1420c01b22c38d66abb1733fc00dd068efe6f` はtree `bf033bb6cf5fde5d40c4992a7092a9ba2dbba017` が完全一致（commit作成日時等のみ異なる）。CLI pushは資格情報なしで未実行終了、一括tree送信は応答不明で停止後に存在確認404。小分けblobとSHA照合で公開を完了し、main/保存データには変更なし。
- ローカル正式GUIは上記検証HEADでChromium/WebKit6条件すべて成功: 594検査、横幅538地点、19画像×6=114枚、モバイル各824タッチ、ブラウザ/ネットワークエラー0。並列2で27分9秒、既存30分枠・画像予算・成功trace非保存を維持。375/390px、デスクトップ、両テーマ、root200%文字と再生成SVG2倍、タッチ/キーボード、原本不変・世代切替・旧経路非混入を確認。
- 独立レビューはモデル20/UI33/SVG13/識別UI1=67件を独立実行し成功。フォーカス/非同期取消/世代境界を再確認し阻害指摘なし、最終公開HEADの正式CI成功を条件にマージ可との推奨。全GUIの実行は実装側であり、独立実行と混同しない。
- 代表画面（PCのA→B→C/当時B使用値150・C結果300、Chromium390経路全体、WebKit375暗色200%詳細）は実画素を確認し、人工保存fixture・期待値・検証集計とともに利用者へレビュー資料として用意。fixture/期待値のリポジトリ内参照は[設計文書](docs/agent/saved-impact-graph.md)に記載。図の縮小は既存50〜200%操作で行い画像内容は加工していない。
- 正式リモートCI: 初回公開HEADの[run 39777291797](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/39777291797)開始を確認。このLOG追記コミット自身のCIは未確認で、最終結果はPR Checks/本文とIssueへ実測後に記載する。以前のHEADやローカル成功を最終リモート成功としない。実機iPhone Safari/VoiceOver/native OS文字拡大、全経路の列挙/原因証明は未検証または対象外。マージ/本番公開は行わず人間のレビュー待ちとする。


## 2026-10-22 17:30 JST: 保存済み計算記録の変更影響分析（Issue #55）

- PR #54 mergeとmain e9601e43e68f32328b4a42296e868cd84c7071c0を確認。従来作業場所がこの環境にないため既存の別作業ツリーを変更せずfresh cloneし、clean mainからfeat/saved-record-impactを作成。Issue #55を目的/範囲/完了条件とともに作成した。
- 調査後、既存比較/validator/数値表現/辺型/Markdown/保存取得境界を再利用。現在メモの候補解析や前後辺合成は過去の実使用に意味が合わないため採用せず、前後別の実使用inputsアダプタと有界代表経路を追加する設計を報告してから実装した。
- 直接観測差、波及候補、結果、順序、判定不能を独立表示。使用値差を直接編集や最初の原因としない。v1は成功・先行参照だけで、循環/欠損/重複ID/未対応状態は既存保護を維持する。
- 独立設計レビューで、形が有効でも使用値/元結果・参照枠の不整合があり得ると指摘。再評価せず確認できる不整合を明示し、該当経路を認定しない。全経路列挙の爆発を避け、各側100,000探索/10,000経路ノード上限で不完全を表示する。
- engine/writer/保存schema/上限/試算/rollback変更なし。実装・検証の途中結果を成功完了とせず、最終実測とCIをこの後記録する。cloud software-engineering/pull-main技能はこの実行で利用不可、作業規約/関連設計/CIはリポジトリから確認した。初回npm ciはhome cache不存在で失敗し、同一公式lockfileを一時cache指定で導入成功。システム設定変更なし。


## 2026-10-22 13:06 JST: PR #54 WebKit選択肢の実測と表示分離

- 第2回正式CI `39718507428`（HEAD `18964015621956cc62dd5a95ae5e84b5e6240e59`）はChromium全4条件成功、WebKit375/390失敗。追加診断によりgrid列/label境界は337/352px内だが、3つのselectを包むlabelのscrollWidth500/514pxを確認。grid幅だけが原因という初期仮説を訂正した。
- ローカルWebKit26.0の不足ライブラリは公式Debianの署名済み配布情報で検証して一時作業領域へ展開し起動確認。システム・CI設定は変更せず、実アプリでbaseline/appearance:none/既存参照select装飾/短い選択肢を個別比較した。
- 第一希望のCSS調整は不十分: local375でmodal scroll502/client373、appearance:noneと既存装飾でも497。200%文字では973→968に留まった。text-overflow:ellipsisも解消しない。次善策の一意な追記順番号だけの選択肢は375/390、両テーマ200%でmodal373/388、label337/352へ収まり、同じ7機能検査が成功した。native selectの長い選択肢文字が境界外へ影響することを実測し、コンテナ隠蔽では解決しない。
- 採用: 選択肢は「記録 N」、追記順との対応をaria-describedbyで説明。valueは完全な記録IDのまま。完全ID・計算日時・保存要求時刻・ブロック数は一覧と選択記録/比較情報に保持し、詳細選択の情報は折りたたみ外で確認可能にする。旧記録と再取得後の追記番号をIDと混同しない回帰を追加する。妥協点はpicker内で日時/IDを直接読めなくなることだが、本文の折返し可能な情報へ分離することで読みやすさと操作可能性を維持する。
- 100記録で同じID先頭を持つ選択肢も番号は一意、value/全IDは不変。明示再取得で番号が変わってもIDで選択維持、消失時は比較を停止する2回帰を追加。単体UI23件成功。製品buildへの反映後のGUI/正式CIはこの後に確認し、runtime実験を最終実装成功とは混同しない。
- 実装後のローカル検証: 単体995件/43ファイル（モデル41・UI23）、CI契約28件、型検査、通常/Pages build成功。lintはエラー0、既存aria-description警告1件。実際の製品buildを使うWebKit375/390で新機能各7検査・横幅3検査・両テーマ200%文字成功、ブラウザエラー0。実験用のDOM/CSS差替えは使っていない。全体GUIと正式CIの最終HEAD結果はPR本文に追記する。

- 独立再レビュー: 追加変更の阻害指摘なし。focused64件・CI契約28件を独立実行し成功。古い未計測記述を履歴上の仮説として明示し、後続実測との矛盾を修正した。

## 2026-10-22 12:41 JST: PR #54 初回GUI失敗の修正

- 公開HEAD `9cf653331ae0da792a7154381d5ec887d4ffe9e9` の正式CI `39715830851` は単体993件・CI契約26件・lint・型・両build成功、GUI3条件成功/3条件失敗。Draftを維持し、成功扱いせずartifact `12399468520`（SHA256 `570cc091992d28ddafa9a313fa0db5324c0475e6da7ee98cd7583fbed565d6cc`）と失敗traceを確認した。
- WebKit375/390で新規比較modal-contentのscrollWidth532、clientWidth373/388を検出。ページ全体はviewport内、200%拡大前、長いIDは折返し済み。traceには子要素の幅がなく、特定select単体の原因とは断定しない。暗黙auto gridとnative selectの最小内容幅の相互作用を疑い、比較コンテナとlabelの列をminmax(0,1fr)へ明示する。overflow隠蔽や検査緩和は行わず、正式WebKit再検証で判定する。
- desktopは既存通常電卓試験の新規メモ保存直後に、カード描画済みでもlocalStorageに新メモがない非同期保存境界をtraceで確認。明示保存した式/表示値の永続化を局所確認してから従来の内部精度assertionを行う。共通storage読取は即時のまま、読取専用・pending-write試験を待機で隠さない。回帰契約を追加する。
- 修正後ローカル再検証: 単体993件/43ファイル、CI契約28件、型検査、通常/Pages build成功。lintはエラー0、既存aria-description警告1件。独立レビューで検査緩和・保存境界変更・overflow隠蔽なしを確認し阻害指摘なし。正式WebKit再検証は未完了。
- 初回ローカルdesktopの404は並行Pages buildによる出力差替えで、安定buildで93検査成功。mobile375も93検査成功。ただしこの成功は上記正式WebKit失敗を打ち消さない。最終HEADの再検証結果・CI URLはPR本文へ実測記録する。


## 2026-10-22 12:07 JST: 保存済み計算記録の一覧・2記録比較（Issue #53）

- PR #52のmergeとmain `939828ca6673530d4b855b51479ed7e7a403996d` を確認し、cleanな作業ツリーから専用branchを作成。既存の根拠記録/validator/原本読込/Modal/Markdown補助を再利用し、現在値の参照レポート#49（完了済み）とは別の過去2記録比較として#53へ目的・範囲・完了条件を記録した。
- 開いた時点の保存原本を固定し、一覧/詳細/比較/Markdownを同じ取得世代へ統一。外部更新は通知だけ、明示再取得で消えた選択は解除し代用しない。初期2件は追記順、時計の逆転では並べ替えない。保存要求時刻を保存完了時刻としない。
- 安定IDで式/モード/実使用参照元/実使用内部値/表示結果/内部結果/本文順/実行順を独立に比較。結果不変の式・参照変更、同表示の内部差、-0を隠さない。追加/削除は記録間だけ。現在の未保存編集・試算・現在ブロック情報で補完せず、記録にない情報は確認不能、未知項目は未比較。
- 純粋モデルを複製・凍結して画面とMarkdownで共有。全文確認/コピー/.mdは既存escaping/fence/filename/output上限を再利用し超過時停止。再計算/検証/保存/記録追記/日時更新なし。計算エンジン・writer・保存形式・100件/500,000bytes上限・確定境界に変更なし。
- 追加61件を含む992単体/43files、型検査、通常/Pages build成功。初回追加UI試験15件の失敗はfixtureの現ブロック必須displayExpression/error欠落による読込保護で、fixtureを正規型へ直して20件成功。既存期待値は変更していない。
- 新GUI部分はChromium desktop/390px/375pxで各7検査・3横幅確認、モバイル各38追加touch成功。ローカルWebKitはOSライブラリ不足で起動前失敗、成功扱いしない。既存CI6条件・時間制限・PNG114枚・成功trace非保存の枠を維持し正式CIへ送る。全体GUIと最終HEAD/独立レビューの結果はPR本文へ実測追記する。
- 独立レビューで上限内1,500ブロック×2記録の閉じた詳細の大量DOMをP2リスクとして指摘。展開時だけ本文をmountする方式へ修正し、原本不変/全文出力を維持。独立再検査62/62成功、同337,911bytes fixtureのDOM要素138,127→6,114、未展開BlockInfo0。阻害指摘は解消。これはbrowser応答時間の実測ではない。追加UI大容量回帰を含む総単体件数は最終確認結果をPRへ記録。
- 実生成したA100→120/B150→170/C300→340の比較Markdown例と設計を追加。差分は因果関係・真正性・数学的証明ではない。実iPhone/VoiceOver、OS保存完了、Memo Nexus実画面は未検証。機能ロールバックは本PR revertのみ、保存移行・記録削除不要。

## 2026-10-22 10:23 JST: テーマ変更の保存境界をGUIで明示（Issue #51 / PR #52）

- HEAD `afd60efd863a4399490d74fec5a6d262e612b9ff` の正式CI `39703103323` は事前工程成功・GUI5条件成功/ WebKit375失敗。追加した未保存表示/遅延ロック/離脱guardの回帰は全6条件で成功した。手元desktop/mobile390も各86検査成功。
- 失敗traceの保存JSONを独立に比較し、レポート表示前後の唯一の差は直前に操作した `settings.theme` の light→dark と確認。notes/history/根拠記録等は完全一致した。DOMのテーマ反映だけを待って採った比較基点に、明示テーマ変更の非同期保存が遅着していた。
- 読取専用操作の計測区間より前で、指定テーマが保存済みになったことを明示確認する。計測区間内に保存待機を入れず、全文raw比較/書込み回数/timeout/6条件を維持する。同種の意図的変更と比較基点の境界をシナリオ全体で監査する。製品コードを変更するものではない。
- 全体監査で正常theme/識別表示/panel選択、library登録・undo、同式再計算の旧ID誤一致も補完した。保護中の意図的失敗操作、即時storage getter、原本不変/ゼロwrite検査は維持。構文/26契約成功、独立レビュー阻害なし。検査総数516・横幅502・画像予算は不変。
- 監査で追加した通常電卓のnewID必須条件は、既存の同式2秒以内重複抑止を見落とした試験側の誤りだった。手元desktop/mobile375がその条件で失敗し、製品は変更せず元の式/表示値/内部数値確認とpending解除へ修正した。根拠スナップショットの同式追記とは別の仕様であり、sleepで回避しない。他のnewID確認5箇所は直前成功式が別式であることを再監査した。
- 最終HEADの正式CI/成果物と独立レビュー結果はPR本文へ実測記録する。失敗を成功扱いせず、Draftのまま再検証する。


## 2026-10-22 09:55 JST: 非同期保存待ちの離脱回帰を修正（Issue #51 / PR #52）

- HEAD `e4b4d9b89ee6f3398a7f00adf7527770fef09ab7` の正式CI `39698976503` は全工程成功（929単体、26契約、510GUI/502横幅/各754touch、PNG114/trace0、全SHA一致）。Ready切替後の同一HEAD CI `39700993461` では5条件成功、desktop登録式draftの即時reloadで直前入力へ戻る回帰を検出し、Draftへ戻した。
- 入力開始から約20msでreloadしたtraceと独立レビューに基づき、共有lock追加で広がった未保存喪失窓と判断した。単なるtest同期問題という扱いを訂正する。旧状態の遅延書込み自体は取消/最新data照合で抑止するが、未保存中の離脱を黙って許可しないため、中央の未保存表示とbeforeunload警告を追加する。
- 保存成功を先取りする通知を避け、保存失敗/新しい入力がある場合は未保存を維持する。離脱時にロックを迂回して書かない。モバイルや強制終了で警告/保存が必ず成立するとは保証しない。
- 補完後の931単体/41files、26 CI契約、lint（既存warning1）、型検査、通常/Pages buildが成功。独立レビュー51関連単体＋26契約、阻害指摘なし。常設の短い状態表示を登録式の両dialogにも設け、切替時に配置が動かないようにした。
- 遅延ロック下の連続入力、最新値の保存、原本不変、離脱ガード、保存失敗を単体/GUIで検証する。既存の再読込試験は実保存した対象入力を確認後にreloadし、期待値は変えない。本追補の件数・正式CI結果・最終HEADは検証後にPR本文へ記録する。


## 2026-10-22 09:18 JST: 保存完了・比較図切替のGUI同期を補完（Issue #51 / PR #52）

- 文書追記HEAD `17acbfea0afe05c70fedb10a9d00d09866868219` の正式CI `39697349680` は、単体929件・CI契約26件・lint・型検査・両ビルド成功、GUI4条件成功/2条件失敗。成功扱いせず、失敗traceを独立に確認した。
- desktopは明示的な第2メモ保存の完了前に試験がstorage比較基点を採取したため、再読込後の正しい保存済み原本との差を誤判定。保存成功後のdialog閉鎖を観測してから比較基点を取る。
- Chromium mobile390は通常図の初期描画によるレイアウト変動中に比較ボタンへtouchし、切替が成立しないまま比較SVGを待っていた。通常図準備完了後のtouchと比較選択状態を確認する。図の描画・保存製品コード、最終SVG/原本不変assertion、timeout、6条件、画像予算は変えない。
- 既存の全6条件成功記録 `39695357161` はその実装HEADの実測であり、本追記後HEADの成功を意味しない。本変更の最終HEAD、独立レビュー、正式CI結果はPR本文に実測で記録する。


## 2026-10-22 (JST): PR #52 根拠スナップショット正式6条件成功
- [PR #52](https://github.com/tetsujisugimori-coder/calculator-memo/pull/52)、実装・同期修正HEAD `dd298ab071cefe086f94f99c973d8f2c3fdd4de7` の [CI 39695357161](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/39695357161) が全工程成功。追加91件を含む929単体/41files、26 CI契約、lintエラー0（既存warning1）、型検査、通常/Pages build成功。
- 全6条件のexpected/served/actual SHA一致、errors=[]。510 GUI検査、502横幅checkpoint、モバイル4条件それぞれ754touch。実使用値の確定保存、旧記録保持、同式再計算の新ID、preview/draft/失敗/取消での不追記、容量/保存競合拒否、原本読取レポートと明示再現検証を確認した。前述の非同期保存baseline競合も最終差分で解消。
- [artifact 12391262641](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/39695357161/artifacts/12391262641): ZIP33,281,240 bytes、SHA256 `f3169bceb04ac9c78e2f3e392c564bc2ce326cdf12803b1939344ddc4d37bf28`。PNG114枚32,393,226 bytes、成功trace0、GUI769.339秒。代表375px WebKitダーク拡大画面を確認。6条件/timeout/画像予算/worker数は変更していない。
- 独立レビュー: 25逆境テストを含む保存・UI・レポートの検証と追補49件、最終GUI同期差分のレビューを完了し阻害指摘なし。保存された記録の範囲で式・実使用内部値・参照元・結果・順序を追跡できるが、履歴なし過去値の復元、暗号学的真正性、数学的証明は保証しない。
- ローカルWebKitはOSライブラリ不足のまま、正式CIの両条件成功で補完。実iPhone Safari/VoiceOver、OS物理保存、旧版/外部非協調writerとの完全排他、Memo Nexus実画面は未検証。既存audit指摘は依存変更なしで未解消。上限100回/500,000 bytes到達時は黙って削除せず拒否する。
- この追記は文書のみ。記録commit自身の最終HEADとReady切替後の同一HEADの正式CIも別途確認し、PR本文と完了報告へ実在URLを記す。mainへマージしない。

## 2026-10-22 (JST): 非同期保存後のGUI比較基点を厳密化
- [PR #52](https://github.com/tetsujisugimori-coder/calculator-memo/pull/52) の HEAD `6cd35cf990b16229db44309cae6fb54cd13f4e77` はローカルChromium4条件339checks/334geometry/mobile各754touch成功。WebKitはOSライブラリ不足で起動不可。
- 同HEADの正式 [CI 39693381832](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/39693381832) は単体929/契約26/lint/型/両build成功、WebKit2条件171checks成功。一方Chromium4条件は、直前の明示計算の非同期保存が不変比較基点の取得後に完了するテスト競合で失敗した。全体成功とは扱わない。旧HEADのCI 39692397713は新HEADに伴い自動cancelled。
- 保存完了を待たず取得していた5か所を監査し、明示計算前の履歴IDから変化し、かつ正確な式と内部値が一致した時だけ比較基点を採る。独立レビューで同式の旧record即一致を検出し、新ID条件を補強。URL/不完全式/編集操作のfull deepEqualは維持し、no-write判定自体には待機を追加しない。
- 途中のテスト案はUnicode入力の保存原式「12 × 2」をASCII「12 * 2」と誤期待して失敗したため、元入力方式ごとの正確な式へ修正。製品の変換規則・計算処理は変更しない。契約26件と構文検査成功。最終の新ID条件付き差分は次の正式CIで検証し、未実施を成功扱いしない。

## 2026-10-22 (JST): 根拠記録GUIで見つかった保存保護の回帰修正
- [PR #52](https://github.com/tetsujisugimori-coder/calculator-memo/pull/52)をDraft作成。初回HEAD `feb868e8796ed3ee1bb57dcf8c524de06e5e8255` はCLI pushの認証経路不足のためGitHub接続で同一検証tree `fe077f4bee5b8ccdcbec089d692285df49255453` を公開した。
- 固定HEADのローカルGUIで255checks成功（3条件は新規根拠6checks成功）後、起動後に壊れた原本へ差し替わったとき一般競合通知が既存復旧UIを隠す回帰を検出。原本の構造保護を優先し、autosave/storageevent/明示保存の3経路で元rawを変更しないテストを追加した。
- 通常電卓の非同期Web Locks保存が完了する前に後続操作の不変比較基点を採るテスト競合も検出。直前の意図した式と正確な値が保存されるまでpollし、その後の履歴全体deepEqualを維持する。期待値や6条件を緩めていない。ローカルWebKit2条件は既存OSライブラリ不足で起動不可、成功と扱わない。初回browser既定path不足は既存browser path指定で解消し、新規導入はしていない。
- 追加91件を含む929単体/41files成功。独立追補レビュー49件と26 CI契約成功、阻害指摘なし。初回正式[CI 39692397713](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/39692397713)と修正後GUIの結果は確認中。後続の実測結果を追記する。

## 2026-10-22 (JST): 計算確定時の根拠スナップショット
- 調査基点: 最新 main `bf09f8d9398f79046bafbf20aeb30a4a6185f749`、PR #50 mergeを確認し、clean treeから `feat/calculation-evidence-snapshots` を作成。[Issue #51](https://github.com/tetsujisugimori-coder/calculator-memo/issues/51)。PR未作成。AGENTS、README、LOG、関連設計/保存形式/Actionsを実読。江戸弁の関連指針全文は今回参照できておらず、確認済みとはしない。
- 従来は現在値だけを表示し、当時使用値は確認不能だった。新方針は実評価で読んだ旧変数/IDの内部値を観測し、全件成功候補を明示保存の成功後だけ記録する。試算preview/draft/失敗/rollbackでは確定記録を追加せず、同式再計算は別IDで追記。過去記録を改変せず、既存履歴なしの値を推定しない。設計は実装前に提示し [根拠記録設計](docs/agent/calculation-evidence.md) に記録した。
- 任意のnote単位version1、トップ保存version不変。最大100回/500,000 UTF-8 bytes、上限時は保存拒否し黙って削除しない。原本文字列照合・現行writerのWeb Locks直列化・保存中編集禁止・不確定読戻しでの再送停止を追加。完全CAS/非協調writer/物理flushは保証しない。未知履歴は非破壊保護する。
- Markdownは現在値と保存記録を分離し、内部値/表示値、実使用元、本文順/実行順、日時を出す。通常出力は再計算なし。明示ボタンのみ同じ評価器で記録を再現検証し、暗号学的真正性/数学的証明は主張しない。Memo Nexus直接通信/PDF/AI生成は対象外。
- ローカル検証: 追加88件を含む926単体/41files成功。26 CI契約・lint（既存warning1）・型・通常/Pages buildも成功。6条件GUIの回帰を追加したが、正式CIは未実行。独立レビューで実入力・候補整合・129以上の旧block再現・保存境界を確認し、指摘を修正。独立25件を含む保存/UI/レポート68件の最終再検証も成功し、阻害指摘なし。
- 未検証: 実iPhone Safari/VoiceOver、OS保存完了、非協調writer完全排他。既存依存のaudit指摘は今回依存を変更せず、解消したとは主張しない。最終HEADと実在PR/CI結果は検証後に追記する。mainへはマージしない。

## 2026-10-22 (JST): PR #50 初回正式CI・根拠情報6条件成功
- [PR #50](https://github.com/tetsujisugimori-coder/calculator-memo/pull/50)、実装HEAD `8cdebf434b2bb79ed17fac91b34a6123bc22ec78` の [CI 39680436913](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/39680436913) が全工程成功。追加22件を含む838単体/34files、26 CI契約、lintエラー0（既存warning1）、型検査、通常/Pages buildを確認。
- 6条件のexpected/served/actual SHA一致、errors=[]。474 GUI検査、490横幅checkpoint、モバイル4条件それぞれ729touch。参照元内部/丸め値、直接参照と未使用mapping、旧変数再代入候補、参照元変更後の古い結果、使用値確認不能、保存不変・draft/試算不混入、全文確認/copy/downloadを確認。独立レビューの阻害指摘なし。
- [artifact 12385041720](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/39680436913/artifacts/12385041720): ZIP32,970,211 bytes、SHA256 `6e4f7a403c1d95061d9e277f6adec93dbf2595f61aa8ba519b7e0d0f430cda35`。PNG114枚32,101,475 bytes、成功trace0、GUI707.210秒。代表375pxダーク拡大画面を確認。新規PNGなし、CI条件/timeoutは不変。
- ローカル初回GUIは実行中にHEADを変更したため後半4条件をprovenance検査が拒否し失敗記録。固定HEAD再実行ではChromium4条件成功、WebKit2条件はOSライブラリ不足で起動失敗。正式CIの両WebKit成功で補完し、ローカル失敗を成功扱いしない。今後はGUI実行中にHEADを動かさない。
- git pushは資格情報経路不足で未実行。既存GitHub接続でローカル検証tree `2bc0abb030bc201415434cfb33fc83aab4f9a18f` と同一treeを公開。既存lockのnpm audit表示43件（low2/moderate13/high25/critical3）はこの変更で依存を変更せず、実到達性の調査は未実施。セキュリティ解消済みとは主張しない。
- この追記は文書のみ。記録commit自身の最終HEADとReady切替後の同一HEADのCIもPR Checksで確認する。実iPhone/VoiceOver、Memo Nexus実画面、OS保存完了は未検証のまま。マージは人間が判断する。


## 2026-10-22 (JST): 保存済みMarkdownレポートの根拠情報・追跡可能性
- 基点: PR #48 マージ済みmain `4059953b63e1b6cca13bdd0cfc7c33606e318e09`。専用枝 `feat/report-provenance`。[Issue #49](https://github.com/tetsujisugimori-coder/calculator-memo/issues/49)。既存Issue検索で同目的なしを確認し、調査結果を実装前に設計へ記録。
- PR #48 の本文順/ID/入力式/保存内部値・表示値/状態/図/全文確認/コピー/downloadを再利用。追加は直接参照元の本文位置、ID、現在の保存式/内部数値/表示値/状態。既存AST slot検査とgraph.bindingsを使い、独自式解析なし。未使用対応表と直接依存、旧変数の再代入候補/未定義可能性を区別。
- 計算時使用値の検証可能な履歴は未保存。署名には状態照合用snapshotが含まれるが、過去の実使用値としてdecode/推定しない。「計算時の使用値は確認不能」、依存図は履歴証明でないと明記。エンジン/評価/参照/試算/rollback/保存形式/UI変更なし。
- 独立レビューの出力増幅指摘を修正。長い参照元全文は一度だけ再掲し以降は本文位置を案内。内部数値/状態は維持。生成400万文字上限を集約時にも検査し、明示エラーで停止。部分出力を完全レポートと偽らず、解析/図fallbackで上限エラーを隠さない。
- 検証: 既存816件に追加回帰を加えて全件再確認。26 CI契約成功、lintエラー0（既存aria-description warning1）、型検査、通常/Pages build成功。最終件数/正式CIは次の記録で確定。独立レビュー82関連テスト成功後、集約時上限の最終差分を再確認中。
- GUI: 既存6条件を維持し根拠区別/参照元変更後の古い値を各2件追加。予定474GUI/490geometry/mobile各729touch、PNG114枚/成功trace0/2worker/30分を維持。ローカル公式ブラウザ取得は完了したがWebKit用OSライブラリ不足があり、正式CIで補完するまで成功扱いしない。
- 実生成Markdown例と既存合成fixtureを同期。未検証: 実iPhone Safari/VoiceOver、Memo Nexus実画面連携、OS保存完了。将来の実使用値履歴には実行ID/原子的確定/移行/改ざん耐性等の設計が必要、今回は保存しない。rollbackは本PRrevertで前版レポート維持。
- 参照: AGENTS/README/LOG/設計/CI/テスト/PR #48、江戸弁ガイド関連抜粋。憲法と辞典全文は未読として記録し、読了を偽らない。


## 2026-10-21 (JST): PR #48 初回正式CI・保存済みレポート6条件検証成功
- [PR #48](https://github.com/tetsujisugimori-coder/calculator-memo/pull/48)、実装HEAD `5384610f8eafd0f7903a06623d9f30dbc1a260c2` の [CI 39616743551](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/39616743551) が全工程成功。816単体/33files、26 CI契約、lintエラー0（既存warning1）、型検査、通常/Pages build、Chromium4/WebKit2を確認。
- 全6条件のexpected/served/actual SHA一致、errors=[]。462GUI検査、490横幅checkpoint、モバイル4条件それぞれ729touch。保存原本の混在順序/内部精度/依存図、コピーとdownload内容一致、失敗通知、未保存draft・未反映試算の不混入、保護中原本の拒否、出力前後storage完全一致を検証。375px/390px・ライト/ダーク・文字拡大・既存スクロール回帰を維持。
- [artifact 12353278910](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/39616743551/artifacts/12353278910): ZIP33,215,762 bytes、SHA256 `cd8ce84a3bce3367fc240cf8e88e1bd21c04373e07bc0b206f3dae9b9e25101a`。PNG114枚32,349,444 bytes、成功trace保存0、GUI実時間988.666秒。追加レポート地点はgeometryのみで成功PNGを増やさない。所要時間の改善は主張しない。
- ローカル公式ブラウザ取得失敗は正式CI6条件で補完。独立レビューの阻害指摘は修正後再レビューで解消済み。実生成Markdown例と合成fixtureの完全一致・原本不変を追加テストで確認。公開tree `8012d668d87b37a6db2e5e63b53697e61bff0b0a` はローカル検証treeと同一。git pushの認証経路不足により、既存GitHub接続で同一treeを公開した。
- この追記は文書のみ。記録commit自身の最終HEADも [PR Checks](https://github.com/tetsujisugimori-coder/calculator-memo/pull/48/checks) で別途確認し、Ready切替後の同一HEAD検証も確認する。実iPhone Safari/VoiceOver、Memo Nexus実ブラウザ、OS保存完了は未検証。マージは人間が判断する。


## 2026-10-21 (JST): 保存済み計算メモのMarkdownレポート
- 基点: PR #46マージ済みmain `08d92a2`、専用枝 `feat/saved-markdown-report`。[Issue #47](https://github.com/tetsujisugimori-coder/calculator-memo/issues/47)。同目的の既存Issue/PRなしを確認。PR番号/正式CIは未確定。
- 保存済み詳細画面から明示操作で既存loadDataの原本を再取得し、読み取り専用ソース確認・全文コピー・.mdダウンロード要求を提供。draft/未反映試算/メモリfallbackを使わず、再計算/保存/履歴更新なし。保存形式・評価器・rollback・SVG処理は変更なし。
- 既存依存解析/署名照合/Mermaidを再利用。本文順、LaTeX、式、保存表示値と内部数値、安定ID、診断を出す。署名のない旧結果は状態不明。失敗/古い記録を確定扱いしない。未知構造は出力拒否、付随情報は原本に保持しレポートが完全backupでないことを明示。
- 安全処理: 動的フェンス、HTML文字化、未閉鎖境界補完、数式の安全な原文コードfallbackと警告、独自実行directiveの文字化、100万入力文字上限、80文字/200UTF8bytesファイル名、孤立サロゲートのdownload拒否。
- 独立レビュー: 数式内フェンス/LaTeX実体参照変換/長いUnicode名/current+attemptError矛盾を検出し修正。再レビュー60関連テスト成功、標準Markdown parserでも後続章保持を実測、阻害指摘なし。HTML-bearing inlinecode等の表示差と第三者rendererの限界は設計に記録。
- 検証: ローカル全813単体の成功後、mathfence2件と実生成例1件を追加し全件再確認中。関連60件、26 CI契約、lintエラー0（既存warning1）、TypeScript、通常/Pages build成功。新testのeach配列型とthisalias lint指摘は修正済み。実測最終件数は正式CIで確定する。
- GUI: 既存6条件へ各5検査・3geometry追加、予定462検査/490横幅/mobile729touch。代表PNG114枚/成功trace非保存/2worker/30分/7日保持は維持。ローカル公式Chromium取得が不正ZIP/公式mirror503で失敗し実GUI未実施。正式CIで補完するまで成功扱いしない。
- Memo Nexus repo memo main c32d3a42を読取確認。Markdown/Mermaid/$$対応コードはあるが、独自calcは再評価、jsonフェンスをニュース取込へ変換する経路、escape表示差がある。手動本文貼付けを基本とし、全表示互換/直接取込は保証しない。Memo Nexusの書込み/コード/MCP変更なし。
- [設計](docs/agent/markdown-report.md)、[実生成例](docs/examples/markdown-report-example.md)と合成fixtureを追加。生成例は100→150→300、原本不変をテストする。参照: AGENTS/README/LOG/運用・検証・e2e/CI/関連実装、software-engineering guide、江戸弁ガイド関連抜粋。憲法/辞典全文は未読として記録し、読了を偽らない。
- 実iPhone Safari/VoiceOver/Memo Nexus実ブラウザ/OS保存完了は未検証。PDF/印刷/直接送信/自動同期/新数学関数は対象外。保存形式移行不要、本PRのrevertで戻せる。マージは人間が判断する。

## 2026-10-21 (JST): PR #46 初回正式CI・6条件GUI成功
- [PR #46](https://github.com/tetsujisugimori-coder/calculator-memo/pull/46)、HEAD `bee01cd80eba56bca12fb99e156eae82faa44d40` の [CI 39586945342](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/39586945342) は全工程成功。固定Node22.13.0で755単体/30files、26契約、lint既存warning1・エラー0、型、通常/Pages build、Chromium4/WebKit2を確認。
- 全6条件のexpected/served/actual SHA一致、errors=[]、追加percent4チェック各条件実行、432GUI/472横幅、mobile4条件各698touchを成果物で照合。旧保存データ読み込み・4式の全入口評価・明示保存と再読込・未知情報保持を含む。既存グラフ/試算/削除ノード/モバイルスクロール回帰を削除しない。
- [artifact 12340243030](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/39586945342/artifacts/12340243030): ZIP32,952,029 bytes、SHA256 `3261b939abc2183e6d43d675a8724d0434d444efa4a03e6ffdfea6144fae939c`。代表PNG114枚32,107,701 bytes、成功trace保存0、GUI実時間626.376秒。WebKit390 dark文字拡大の代表画像を視認。%追加地点は横幅checkpointのみであり、保存PNGを増やさない。
- ローカルブラウザ配布失敗は正式CIでは再現せず、正式6条件で補完できた。Node24ローカルをNode22正式実行と混同しない。公開tree `92660417629c0b94bd07742f8f875bf218295003` はローカル検証treeと一致。通常git pushは認証経路不足だったため既存GitHub接続で同一treeを公開し、内容同一を照合した。
- 独立レビューの未解消阻害指摘なし。比較corpus33,467式は両方成功の値差0、通常モード新拒否2件は不正な複数小数点のみ。拒否同士のエラー文は解析到達段階が変わるため一部異なる。oracle9,479式は厳密一致。既存Issue本文は追記権限の確認で停止し未変更、PR本文の関連リンクで追跡する。
- この追記は文書のみ。記録commit自身の最終HEADも [PR Checks](https://github.com/tetsujisugimori-coder/calculator-memo/pull/46/checks) で別途確認し、その後Readyへ移行する。実iPhone Safari/VoiceOverは未検証、マージは人間が判断する。

## 2026-10-21 (JST): Issue #19 ネスト括弧・先頭小数点の後置%を修正
- 基点: PR #45 merge済みmain `fdf10ee6ee7453f583f0c6c92d3e2c06b71dfcb6`、独立枝 `fix/nested-postfix-percent`。[Issue #19](https://github.com/tetsujisugimori-coder/calculator-memo/issues/19)。PRは未作成。
- 根因/方式: 旧正規表現が内部括弧を含む対象と `.5%` を扱えなかった。mathjsの直接% ASTは相対加算/剰余となり既存仕様と違うため不採用。数値トークンと括弧対応を走査して `(対象/100)` へ変換し、その後のAST許可検査・予算・評価器を維持。[比較/境界/互換性](docs/agent/percent-parser.md)。保存・ID/旧変数・試算・rollbackの実装、lockfileとworkflowは変更なし。
- Red/green: 4式 `((50+50))%`, `(50+(25+25))%`, `(5%+5%)%`, `.5%` は旧mainで全て共通構文エラー、修正後1/1/0.001/0.005。最初の60回帰は旧コード12失敗/48成功、修正後60成功。追加境界4件と統合10件を含め全755単体/30files成功。初回複合式の小数リテラル期待誤差は独立演算式の厳密期待へ訂正し、丸め/近似で隠さない。旧Issue19失敗固定2テストは今回の正しい値へ更新。
- 互換性判断: 独立比較で `50%%%` と `(50)%%` の新規受入を検出し旧拒否へ戻した。`50%%`、普通電卓の暗黙乗算、旧変数モードの空白/暗黙乗算拒否は維持。不正な `1.2.3%` が旧変換で0.023になる副作用は不正十進数として拒否し、仕様拡大とは区別して記録。
- ローカル: cloud Linux Node24.19.0、26 CI契約成功、lintエラー0（既存aria-description warning1）、型・通常/Pages build成功。正式CIのNode22.13.0とは別環境。Playwrightブラウザ導入が公式配布の破損ZIP/503で失敗し、ローカルGUI未実施。配布ログを保持し正式CI6条件で補完予定、成功扱いしない。
- GUI追加: 4再現式を通常電卓/URL/保存済み単独メモ/旧ブロックで検査。既存6条件・図/試算/モバイル/スクロール回帰を維持し、契約432検査/472横幅/mobile各698touch。代表PNG114/成功trace非保存/失敗前trace/7日保持/30分timeoutを維持。実ブラウザ結果は確認待ち。
- 独立レビュー: 33,467式の旧新比較で共通成功の数値差なし。独立算術oracle9,479式でObject.is一致。混在制限/構文予算を確認し、expanded AST深度の有効な入れ子%回帰を補強。GUI/統合差分と件数契約も独立確認し、未解消の阻害指摘なし。実GUIは正式CIで別途確認する。
- 文書参照: repo AGENTS/README/LOG/GitHub運用/検証/e2e/workflow、Issue19/PR45を確認。software-engineering skillはこの環境で参照不可、江戸弁guideの関連抜粋のみ参照。憲法/辞典全文の確認とは扱わない。
- 残件: Draft PR公開、正式最終HEAD CI・成果物照合、Readyへの移行。実iPhone Safari/VoiceOverは未検証。人間の判断なくマージしない。戻す場合は本PRをrevert、データ移行不要。

## 2026-10-21 (JST): P2修正 PR #45 の正式6条件検証成功
- [PR #45](https://github.com/tetsujisugimori-coder/calculator-memo/pull/45)、HEAD `116f5f5195166cfc5d90a0c56c90217715b2eba2` の [CI 39540924934](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/39540924934) は全工程成功。681単体/28files、26 CI契約、lintエラー0・既存warning1、型、通常/Pages build、Chromium4/WebKit2の408 GUI検査を確認。
- 全6条件のexpected/served/actual SHA一致、errors=[]、460横幅checkpoint、mobile4条件各671touchを成果物で照合。全削除A→B・一部削除A→B→C・元から計算なし・新ID追加・古い試算失効の追加チェックも全6条件に存在し成功。
- [artifact 12320220548](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/39540924934/artifacts/12320220548): ZIP33,184,271 bytes、SHA256 `d872a47d0893d1d510de9f71e3bf322ab92d9f2161d7d0d514d147fc0699c842` を照合。代表PNG114枚32,361,132 bytes、成功trace保存0、GUI618.776秒。全削除の追加geometryは画像を保存せず検査し、PR43の軽量化を維持。
- WebKit390実画像で既存比較図の状態ラベル/有界スクロールを視認。新しい全削除状態は実SVGノード2件・参照線1件・削除ラベル・移動拒否・コピー源・保存書込み0をGUI assertionで確認しており、専用成功PNGは増やさない。
- ローカルでもChromium4条件271検査/306横幅/mobile各671touch成功。WebKit2条件はOS libraries不足で起動前失敗し、今回の正式Ubuntu CIで実行を補完。ローカル未実行と正式成功を混同しない。公開tree `b718ae2dcad48fd3e5126b3a523a690316712a01` はローカル検証commitと一致。
- 独立コードレビューの未解消指摘なし。この結果追記は文書のみ。記録commit自身の最終HEADは [PR Checks](https://github.com/tetsujisugimori-coder/calculator-memo/pull/45/checks) で別途成功を確認し、レビュー待ちへ移行する。以前のSHA成功で代用しない。実iPhone Safari/VoiceOverは未検証。マージは人間が判断する。


## 2026-10-21 (JST): 全計算ブロック削除時の比較図入口を維持（P2）
- 基点: PR #44 merge済み最新main `a5ad20dcc0b0e7dc412edf8192781da3d86106bd`。独立修正枝 `fix/deleted-calculation-graph-entry`。[元P2指摘](https://github.com/tetsujisugimori-coder/calculator-memo/pull/44#discussion_r4331602692)。PR #44への追加commit、Issue #19や他機能は対象外。
- 根因: MemoBlockEditor が現在の計算ブロック存在だけで子グラフをmountしていた。比較基点に旧ノード・参照線が残っても、現在0件では比較UIへ入れなかった。現在または既存baselineに計算ブロックがある場合の表示へ条件1か所を修正。両方0件は非表示。削除表示/移動拒否/解析/試算/保存/安全描画は既存処理を変更しない。
- Red/green: 親UIのA全削除/B一部削除/C元から0件/D追加し直し/E古い試算の5回帰を追加。旧条件でA/Eが入口nullのため失敗、B/C/D成功。条件修正後5件成功。保存handler/Storage書込みなし、安定ID、削除ノード移動不可、未反映試算復活なしを確認。Mermaid layoutだけmockし、実描画はGUIで別確認する。
- ローカル: Node24.19.0、681単体/28files、26 CI契約、lintエラー0（既存aria-description warning1）、TypeScript、通常/Pages build成功。正式CIのNode22.13.0とは別環境として扱う。
- GUI追加: 既存6条件に各4チェック・横幅1checkpointを追加、想定408チェック/460横幅、mobile各671touch。代表PNG114/成功trace非保存、2worker/SHA照合/30分/7日保持を維持。実ブラウザ実行は未確認。ローカルGUI依存/ブラウザ導入が別の障害監視タスクの禁止文を理由に拒否され、関連作業指示による一度の再申請も拒否。迂回せず停止後、今回P2検証限定の導入について利用者から明示許可を受けたため再開。未実施を成功扱いしない。
- 独立レビュー: 別担当が差分/基点ライフサイクル/validTrial/安全境界/GUI件数を確認し、67関連単体と26 CI契約を独立実行して成功。阻害指摘なし。6条件GUIの実行結果は未確認。
- 文書参照: AGENTS、README、LOG、GitHub運用/検証/e2e文書、software-engineering skillを確認。江戸弁guide関連抜粋は参照したが憲法/辞典全文は未確認。参照できた範囲以上を読了と扱わない。
- 残件: 実GUI、修正PR公開、正式最終HEAD CI、証拠照合とP2対応報告。実iPhone Safari/VoiceOverは未検証。保存形式移行不要、戻す場合は本修正をrevertする。人間の承認なくmergeしない。


## 2026-10-21 (JST): PR #44 修正HEADの正式検証成功
- 修正HEAD `3395ded953e574a674b637becb637c64eda025fe` の [CI 39511725875](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/39511725875) は全工程成功。676単体/27files、26 CI契約、lintエラー0・既存warning1、型、通常/Pages build、Chromium4/WebKit2の384 GUI検査を確認。全6workerのexpected/served/actual SHAを照合、errors=[]、454横幅checkpoint、mobile4条件各645touch。
- [artifact 12306482730](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/39511725875/artifacts/12306482730): ZIP32,938,421 bytes、SHA256 `771dcb04f566bc7ea5f30e175e72a91986727dbc1db30272d442e6435b167f17`。代表PNG114枚32,127,801 bytes、成功trace保存0。GUI561.172秒。PR43の代表画像/失敗前trace/全geometry方針を維持し、追加は各条件1画像。自然変動があるため単一runの速度から最適化効果を主張しない。
- 本番distのChromium375最小診断でも、CSS注入なしの実tapでsummary open、changed/error・affected/blockedクラス、storage不変を確認。これは全GUIの代用とせず、上記正式6条件で回帰を確認。初回失敗と原因/修正記録は残す。
- WebKit390とdesktopの実画像で、影響対象/数値変化あり/数値変化なし、保持旧結果→未反映試算を確認。図は既存の有界スクロール領域で一部分を表示する方式であり、一画面に全ノードが収まるとはしない。実iPhone Safari/VoiceOver/実OS clipboardは未検証。
- 独立再レビューの阻害指摘なし。[PR #44](https://github.com/tetsujisugimori-coder/calculator-memo/pull/44) は未マージ。この成功記録だけの最終文書commitについても [PR Checks](https://github.com/tetsujisugimori-coder/calculator-memo/pull/44/checks) を別途確認してからレビュー可能化する。記録commit自身の未確認成功を先取りしない。

## 2026-10-21 (JST): PR #44 初回正式CIで複合状態の描画不備を検出
- [PR #44](https://github.com/tetsujisugimori-coder/calculator-memo/pull/44) をDraftで公開。HEAD `c807b78f663af2fc50373e02249e9b9e65513723` の [CI 39508607943](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/39508607943) は675単体・26 CI契約・lint・型・両build成功、GUIは6条件とも試算失敗後の比較図で停止。前段の比較値/不変/無関係、辺追加削除、保存再読込検査は通過。全GUI成功とは扱わない。
- 原因の一つ: Mermaid 11.12.2は `class A changed,error;` を2クラスでなく単一名 `changed,error` と解釈し、既存SVG安全境界がclass属性を除去していた。実parserのDB検査を先に失敗させ、状態ごとのclass文へ訂正。通常図/比較図とも複合状態を維持し、単一状態の出力、ID、辺、ラベル、計算・保存は不変。安全フィルタを緩めず、GUIの `g.node` 期待も維持する。
- 修正後ローカル676単体/27files、関連23件の成功を確認。失敗artifactは38,936,091 bytes、SHA256 `34eddc2607070f421d9134f24a568a73b379b0e46c06123fd7fbfaf3ebd56690` を照合し、失敗前trace6本とPNGを取得。Chromium mobile2条件はsummaryのfocus時にscroll anchoringが約2200px移動させ、mouseup/clickが別要素へ配送されて開かなかった。最小fixtureで実tapのイベント/座標を比較し、編集部だけの `overflow-anchor: none` でscroll位置維持とopenを確認（graphだけの除外は不足）。編集部に限定して適用し、実tap・open確認・複合class確認を維持。固定待機・force操作・期待値緩和は行わず、正式CIは再検証待ち。
- 独立再レビューはclass修正とeditor限定のscroll anchoring除外を確認し、関連28件を別実行して成功。新テストの許容union外状態は型検査で検出し既存許容状態へ訂正、再型検査成功。未解消のコード阻害指摘なし、6条件GUIと最終HEAD正式CIの成功は別途確認する。

## 2026-10-21 (JST): 依存関係の変更比較と試算連携（PR #44 予定）
- PR #43 merge済み最新main `8923e0c85f685a8631f5967e25e40894f0d043ba` から `feat/graph-trial-impact` を作成。PR未作成、正式CI未実行。実採番はGitHubに従う。
- 既存解析/影響追跡と有効試算rowsを使う表示専用比較モデルを追加。＋追加/−削除/変更不明の辺、変更元/影響対象/影響なし/不明と、数値変更/不変/比較不可を分離。変更前はeditor開始・最後の一括確定時点で保存済み原本とは異なる。通常図/出力/ナビ/明示編集/診断/fallbackを維持し比較コピーと一覧を追加。計算エンジン、試算の有効性/適用、保存形式、未知情報、旧変数意味論は変更しない。[設計記録](docs/agent/dependency-comparison.md)。
- ローカル: 675単体/27files（既存658維持）、CI契約26、lintエラー0・既存aria-description warning1、型検査、通常/Pages build成功。独立担当は関連7files/96件を別実行し成功。比較モデル最終文言修正後も675単体/lint/type/Pagesを再確認。
- 独立レビュー: global解析制限でnodesが空でも実在blockを削除扱いしない修正、変更前由来の式の明示、追加辺太線CSSの修正と回帰検査を確認。コード上の未解消阻害なし、正式GUI/最終HEAD CIは未確認。
- GUI初回: Chromium3条件は既存zoom selectorが新表示切替も拾う多重一致で停止、対象をzoom操作部へ限定し125%/100%期待を維持。375は比較前の既存scrollTo後のscrollY=19（期待0）で停止。traceで現象を確認、根因未解明。
- GUI修正後: desktop/narrowは比較前の既存load/button待機でtimeout、390も既存reloadでtimeout。375は先のscroll検査を通過し新比較/数値区別/コピー/移動の検査を通過した後、新規pickerのラベル完全一致待機で停止。select一意指定へ訂正する。既存timeout/期待値は緩めず、別run成功を根因解消と扱わない。各失敗trace/PNGを保持。local WebKit2条件は必須OS libraries不足、公式install-depsはroot認証待ちで入力せず中止。正式Ubuntu CIで全6条件を補完する。
- CIは既存6条件/検査を維持し比較を既存stageへ統合、予定384checks/454geometry/114代表PNG（各1枚追加）。PR #43の成功trace非保存、失敗前からのtrace、2worker、SHA照合、30分timeout、7日保持を維持。最終実測は公開後記録に追記する。
- 参照: AGENTS/README/LOG/検証/GitHub運用/e2e/workflow、software-engineering、江戸弁運用ガイド抜粋・憲法/辞典の関連箇所を参照。全文参照とはしない。実iPhone Safari/VoiceOver/実OS clipboardは未検証。新しい計算方式/CI再最適化/Memo Nexus送信は対象外。mergeは行わない。

## 2026-10-21 (JST): PR #43 初回公開後の正式検証
- [PR #43](https://github.com/tetsujisugimori-coder/calculator-memo/pull/43) をDraftで作成。公開HEAD `ff9d37b3bb3a2582432f8cf9c900804416bc0f87`、[CI 39462748334](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/39462748334) 成功。ローカル実装commitとはmetadata差があるがtree `b336ec0bb78a6b19b450b20f20dd251627aa493a` 一致。
- 658単体/26files、26 CI契約、lint既存warning1、型検査、通常/Pages build成功。全6条件372 GUIの本文/順序も旧証拠と一致、448横はみ出しcheckpoint、mobile各629touch、errors=[]。代表108 PNG、成功trace保存0。
- [artifact 12284500565](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/39462748334/artifacts/12284500565) は31784933 bytes、SHA256 `9a9c399a2786c485d540c63da65dd3d17c0121e6608c6bdeac27e9821ff4f5ba`、取得ZIPと全workerのexactHEAD照合済み。容量約92.6%減、GUI556.566秒、job約10分52.6秒。旧2run双方と比較しGUI54.3%/38.4%短縮。Ubuntu image差・自然変動・個別WebKit時間増加・総CPU比較不能を区別する。
- 実画像でWebKit375 dark/文字拡大の130・差+10・状態ラベル、390のgraph-end診断を確認。実iPhone/VoiceOver等は未検証。詳細A–L時間/容量/失敗8経路の実証範囲は[CI設計記録](docs/agent/ci-optimization.md)。
- 独立レビューの阻害指摘は修正、26契約も独立成功。localの間欠操作停滞は逐次390でも発生し原因未分離、正式CI成功で解消したと扱わない。実GitHub uploadサービス故障は未実証。記録commitの最終HEADは[PR Checks](https://github.com/tetsujisugimori-coder/calculator-memo/pull/43/checks)で別途成功を確認してからReadyへ進め、人間承認なくmergeしない。


## 2026-10-21 (JST): CI 計測・証拠容量と実行時間の最適化
- 基点: PR #42 merge済み最新main `be2d34a35bad21f8f9c17970f46a6a1ed404d44f` をcloneし確認。作業枝 `perf/ci-evidence-optimization`。PR未作成、正式CI未実行。CI専用の単一範囲でPRに受入条件を集約し、既存アプリIssueや計算仕様は変更しない。
- 実測: 同一PR42 HEADの正式CI2回は22.71分/16.74分、GUI1217.213秒/903.859秒、artifact431903525/429598046 bytes。自然変動約26%があり古い1回だけで改善率を断定しない。WebKit390の主な差はtap安定待ち（新run158.580秒対375の53.113秒）、DPR等の因果寄与は未分離。trace連続画像が大半を占めた。[計測方法と内訳](docs/agent/ci-optimization.md)。
- 変更: 全658単体・全6条件372GUI・448撮影時geometry・touch629×4を維持し、検査と撮影を分離。成功PNGは各18代表画像、操作前からDOM/action/network/source traceを収集し失敗時export、成功時exportと連続screencastを省く。2worker限定並列、port/context/storage/証拠分離、共有served marker一度生成、全件coverage/SHA照合。工程/撮影/trace API計測、resource記録、inventory、npm cache、upload無再圧縮。アプリ/lockfile/required check/30分timeout/7日保持/権限/本番を維持。
- 判断変更: 従来は成功時も全PNG/6trace保存。今回は解析で容量主因を確認し、全検査と失敗前診断を維持しつつ成功証拠を選別する。連続画像がなくなる制約、setup/trace終了後の失敗ではtraceがない場合を明記。
- ローカル: Node24.19.0、658単体/26files、lint既存aria-description warning1、型検査、通常/Pages build成功。CI制御契約26件成功（アプリ件数と別）。隔離実Chromium故障3例でGUI途中/撮影失敗のexit1・故障前trace・failurePNG、SHA不一致の起動前停止を実証。GitHub上の故意unit/build/install失敗とartifactサービス実障害は未実証、ローカル伝播とworkflow failclosed確認を区別する。
- 失敗記録: 初回全量のdesktop preview timeoutはFetch禁止port4190が原因と追加診断で確定し4280〜4285へ訂正、全portのtransport前許可を契約test追加。初回375tap後dialog未表示も検出、traceでheader遮蔽待ち/tap後19.5秒の空白を確認、追加診断の同時負荷との因果は未確定。期待値/timeout/操作は弱めず初回証拠を保持して追加診断なしで確認中。単独desktop62checks/76geometry/18PNG成功。ローカルWebKitはOS libraries不足で起動不可、正式CIで補完予定。
- 独立レビュー: 共有marker競合、coverage確認前の成功trace破棄、PNG計測にgeometry混在を修正。stream失敗終了待ち/allSettled/checkpoint重複も修正。既存検査本体/期待値を独立照合しコード上の未解消阻害なし、正式最終HEADの全量検証は確認待ち。
- 参照: AGENTS/README/LOG/検証/GitHub運用/e2e/workflow/両packageとlockfiles確認。software-engineeringは子側で参照成功、pull-main skillは当時cloud skills利用不可。親で江戸弁運用guide関連範囲参照成功、今回の憲法/辞典Library読込はtimeoutで未確認。以前の参照を今回全文読了と扱わない。
- 残件: PR作成後の正式CIとZIP比較、実PR結果のLOG追記、最後の文書commitのCI確認。実iPhone Safariは対象外、マージしない。戻す場合はCI専用差分をrevert、データ移行不要。


## 2026-10-20 (JST): PR #42 公開後の正式検証結果
- 関連: [PR #42](https://github.com/tetsujisugimori-coder/calculator-memo/pull/42) を作成済み。公開HEAD `01b92131964928babe384cd22688c0e145d98d95`、[CI 39425183509](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/39425183509) が成功。
- 正式検証: Node22.13.0、658単体/26files、lint既存warning1、型検査、通常/Pages build成功。Chromium4/WebKit2の全6条件372 GUIチェック成功、runtime/network errors=[]、touch4条件各629activation。ローカルWebKit未実行を、このCI実行で補完した。
- 証拠: [artifact 12266194107](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/39425183509/artifacts/12266194107)、ZIP SHA256 `74f924e289dc1464385bad863326ce4bb3f92db3853d863d18763a4bb3e7727e` を照合。provenanceのsha/expectedSha/servedIdentityが公開HEADと一致、448 PNG/6 tracesを取得。
- 実画像: WebKit375px dark/文字200%で試算130・差+10・状態ラベルと枠を確認、390px成功画面で保持100・試算120・差+20・未反映/別途保存の説明を確認。縦scrollで閲覧するカードであり、全文や全カードの1画面表示を保証しない。実iPhone Safari/OSキーボード/VoiceOverは未検証。
- 公開tree `dd48ab114fcbf3da531b871877db8c783ec655b6` はローカル実装commit `f9eac2a0a35dab306fbd61d736508c0e71a67a18` と一致。独立レビューの阻害3件は修正・再検証済み、未解消阻害なし。旧main比較600ケースも差分なし。
- この追記は文書のみ。結果記録commit自身の最終HEADは [PR #42 Checks](https://github.com/tetsujisugimori-coder/calculator-memo/pull/42/checks) で別途検証し、上記SHAの成功で代用しない。mergeせずレビュー待ちで停止する。

## 2026-10-20 (JST): 計算メモの試算・差分プレビュー
- 基点: PR #41 merge済みmain `1d43eccb49bdc81177d4d6c122290d455d174b71` をfetch/ff-only pullして確認。作業枝 `feat/calculation-trial-preview`。PR未作成、正式CI未実行。単一機能の範囲・受入条件・残件をPRで管理し、既存Issue #19（%）等は対象外として変更しない。
- 変更: 既存評価本体を純粋な `evaluateReferenceMemo` として共有し、実数値評価の観測だけを一時結果へ追加。旧 `recalculateReferenceMemo` は戻り値の形・順序・停止・優先error・rollbackを維持する。試算モデル、未反映カード、内部値差分、既存i診断と移動、明示的全件反映を追加。
- 安全境界: 試算ではonChange/保存を呼ばず、反映は全成功＋対象/世代/全snapshot照合＋既存engineの再評価一致だけ。入力・参照・並替え・追加削除・元メモ/タイトル・unknown metadata変更で失効。旧非同期完了はrequest/mount/世代照合で破棄し、試算一時情報はJSONへ保存しない。反映先は編集draft、永続保存は既存「保存する」である。
- 互換性/判断: 標準の手動計算メモへ導線を追加し、旧自動メモの入力時/保存時評価は変更しない。混在旧変数の逐次scope/再代入失敗、ID依存/canonical順、数値精度、全件確定、未知field、非破壊読込、図/Mermaidを維持。部分確定・自動試算・cache・差分図・Memo Nexus送信なし。
- 独立レビュー: apply後focusが消える点、A→B→Aで古い試算が有効表示に戻る点、取消済みpending表示が再浮上する点を修正。最後のpendingは修正前失敗を独立再現し、世代照合で回帰成功。独立16件成功、未解消阻害なし。重複applyは1回だけ反映し、成功表示も維持する。
- ローカル検証: Node24.19.0で658単体/26files（既存602を減らさず追加56）成功、lint既存aria-description warning1のみ、型検査成功。mainの旧評価ソースを一時fixtureとして600ケース（正常/数値/構文/参照切れ/循環/旧変数/表示順）比較し、旧入口の全戻り値・元データの差分なし。比較fixtureは一時検証後削除し、通常テスト件数へ合算しない。重複apply表示guard・親の現在原本revision配線・card border変数訂正後の最終通常/Pages buildも成功。正式CIは公開後に確認する。
- GUI: 新規試算シナリオの先行Chromium desktop/375px touch成功、runtime/network errors=[]。保持値・storage不変、storage write呼出0、内部微小差分、変更/影響/無関係、失効、反映/保存/reload、旧変数/ID失敗と未試行、適用後focusを確認。全量harnessのChromium4条件247チェック成功、errors=[]、298PNG/4trace、mobile2条件は各629touchactivation。WebKitはOS library不足で起動不可、2条件未実行でharness exit1。全量は直前buildを対象とし、最終3差分のうち保存原本revisionと重複applyは単体で確認済み、最新buildのfocused desktop/375pxも2条件成功、errors=[]。375px dark/200%画像で試算130・差+10・状態ラベルとcard境界を実視認し、全カードは縦scrollで閲覧する。
- 参照: AGENTS/README/LOG/設計/検証/GUI/workflow、software-engineeringとpull-mainを実参照。親側で憲法v2関連範囲、江戸弁ガイド、辞典v19/行動algorithmv4冒頭関連範囲を参照済み（全文読了ではない）。追加React review skillは当時利用不可で参照失敗、独立実コードreviewを継続。
- 詳細/残件: [試算・失効・保存境界](docs/agent/calculation-trial.md)。実iPhone Safari/OSキーボード/VoiceOverは未検証。既存のchunkサイズwarningは別課題。公開後実PR/CI結果を追記し、最後の記録commitのCIも確認して未mergeレビュー待ちで停止する。戻す場合は本PRをrevert、保存形式移行は不要。


## 2026-10-20 (JST): PR #41 公開後の正式検証結果
- 関連: [PR #41](https://github.com/tetsujisugimori-coder/calculator-memo/pull/41) を作成済み。以下の実装開始時点の「PR未作成・CI未実行」を、公開後の実測結果で補う。
- 対象: 公開HEAD `aeaf836c76abc61ba62ffe8160b21f4537f6d598`、[CI 39408931086](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/39408931086)。Node22.13.0で602単体/23files、lint（既存warning1）、型検査、通常/Pages buildが成功。Chromium4/WebKit2の全6条件・348 GUIチェック成功、runtime/network errors=[]。
- 証拠: [artifact 12259276392](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/39408931086/artifacts/12259276392) のZIP SHA256 `5da724fc69a97ce7813c965151771e2850a2b55c967541a7c825cc6b7d303879` を一致確認。provenanceのsha/expectedSha/servedIdentity.shaは対象公開HEADと一致。412 PNG/6 tracesを取得、各条件12回の移動先geometry/hit-testが成功し、touch4条件は各597activation。
- 実画像: 同artifactのWebKit375px dark/390px light・文字200%の図と移動先、375px診断詳細、390px上限fallbackの計6枚を確認。選択ブロック3の番号・強調・明示編集操作が視認でき、図は専用領域内の横scrollとなる。大きい図全体や長い診断全文を1画面で視認したという意味ではない。実iPhone Safari、OSキーボード/VoiceOver、実OSクリップボードは未検証。
- 独立レビュー: ローカル実装commit `5743bf40800b92bf2b48fc09a0bd4813097b55c4` と公開HEADは同tree `195f43bc1dff4ecb71dc6648b6e1695b267a8e4a`。安全性・ID対応・非同期取消・モバイル移動等の指摘を修正し、未解消の実装阻害事項なし。独立19件と大図/異常系/実描画例外の詳細は以下の記録を参照。
- この追記は文書のみ。結果記録commit自身の最終HEADのCIは [PR #41 Checks](https://github.com/tetsujisugimori-coder/calculator-memo/pull/41/checks) で別途確認し、上記HEADの成功で代用しない。エージェントはmergeせず、人間レビュー待ちで停止する。

## 2026-10-20 (JST): 読み取り専用の依存関係図とブロック選択
- 基点: PR #40 merge後main `3339d978acd9518976a8954e77be4f8bcf50d6b4` をfresh clone/fetch/ff-only pull、枝 `feat/dependency-graph-navigation`。PR未作成、CI未実行。
- 変更: PR #38/#40のgraph/status/Mermaid/i診断を再利用し、折り畳み図・scroll/zoom・安定IDノード選択・カード強調・明示編集focusを追加。計算/保存/エンジンコードを変更せず、図操作からonChangeや再計算を呼ばない。
- 安全: strict Mermaid、固定placeholderによるlayoutとSVG textContent表示を分離、SVG要素/属性許可リスト、HTML/CSS/event/外部URL除去、完全ID対応検査、非同期取消、削除済み対象検査。128nodes/256edges/入力25万文字/SVG4MB/寸法5万上限で一覧fallback。
- 設計判断: 非HTML Mermaidでは既存数値entityが文字として露出することを実ブラウザで再現したため描画専用projectionを追加。export原文は不変。式preview80文字＋全状態ラベル、全文は移動先・accessible名・exportで確認。辺labelは種類へ短縮するが依存辺/不確定性を変えない。直接Memo Nexus送信、自動/部分再計算、依存編集なし。
- 参照: AGENTS/README/設計/運用/検証と、憲法v2・江戸弁ガイド・辞典v19の関連範囲を実参照。全文読了とは称さない。
- ローカル検証: 修正後602単体/23files成功、lint既存warning1のみ、型検査、通常/Pages build成功。ローカル全GUI harnessはChromium4条件231チェック成功、runtime/network errors=[]、274PNG/4trace（以前のfailure画像/traceは除外）。各条件12回の移動先geometry/hit-test成功、touch390/375は各597activation。WebKit両条件はlibrary不足で未実行、harness全体exit1。実画像で375px/200% darkの選択番号/強調/編集操作の可視性とdiagram専用scrollを確認。実Chromiumで日本語ノードとgeometryを確認。独立adversarial19件成功、長文label枠内・drag抑止/Enter選択・実SVG描画例外fallbackの式/結果/storage不変を実測。128node/127edge鎖の実描画・末端ID選択・目印の可視性・全値/storage不変も成功（初回描画1,625msは当環境1回測定で一般性能保証ではない）。自己/2node循環/その下流/missingを含む6node図も診断共有・全値/storage不変を独立確認。
- 環境: npm既定cache不可は/tmp cacheで解消。Node24.19.0のローカルとNode22.13.0のCIを区別。WebKit起動はOS共有library不足、公式install-depsはsuエラー、escalated実行はsandbox初期化エラーで未実行。Chromiumを先行検証しWebKitはCIで確認予定。未検証を成功と扱わない。
- レビュー/GUIで発見した修正: SVG寸法保持、点線復元、並替え後accessible番号、引用符付きedge entity、長文W幅を修正。7node図によるmodal横溢れを再現しgrid最小幅/専用scrollへ封じ込め。focus成功だけでは移動先の視認を保証しない画像を確認し、選択UIのlayout後rAF scrollと目印の実可視位置検査へ強化。375px/200%ではカード先頭+固定余白で編集目印が画面外へ出るため、番号付き目印そのものを中央へscrollする方式に修正。旧変数fixtureの不正referencesと実線selectorの誤包含はテスト側不備として修正し、計算期待値を弱めず再検証。正式公開SHAの全6条件CI/実PR URL/最終文書commit CIは実確認後追記する。ローカルGUIは未commit作業tree基点3339d97の証拠であり、公開最終SHA成功とは称さない。

## 2026-10-20 (JST): 計算ブロックの変更状態・エラー詳細・Mermaid出力
- 基点: PR #39 merge後main `ebb0bef872f7ef033d3529047aa94366ab2b34a0`をfresh fetch/ff-only pull、新枝`feat/calculation-state-diagnostics`。[PR #40](https://github.com/tetsujisugimori-coder/calculator-memo/pull/40)を作成済み。
- 変更: 既存前後依存解析を再利用する純派生statusモデル、直接変更/影響候補/無関係/不明、構造確認/今回試行/保存済みerrorを分離。i詳細に日本語説明・式・原因/影響・対処・試行範囲・該当カード移動。全体rollback通知を上部へ集約し、旧結果captionと個別原因を区別。
- 判断: 従来の全件staleは一括確定の互換性上維持するが、個別警告には流用しない。編集開始/成功時snapshotで前後比較し、stale保存を開き直したときは過去baselineがないため不明を明示。比較元・詳細試行は非保存、既存JSON変更なし。旧自動変数計算は互換動作を維持し、新しい自動再計算は追加しない。
- Mermaid: 既存生成の通常出力は維持し、任意nodeStatesで変更/影響/原因/下流/不明を表現。安定ID/順序/escapingを保持。readonly文字列とcopy操作、失敗時手動選択案内。Memo Nexus送信はしない。
- 互換性: エンジン・評価順・停止条件・全成功一括確定・rollback・未知field・内部精度・安全制限・非破壊読込・登録式/履歴の処理コード変更なし。
- 独立レビュー: 保存旧errorを修正後式へ誤帰属する表示と、旧自動計算の確定errorを未実行と呼ぶlabelを再現し修正。失敗時式/範囲は不明と明示、保存済みerror優先labelへ。回帰テストを追加。追加で循環＋参照切れが合流する下流の既知原因欠落を再現し、全構造原因の確定到達を統合するよう修正。自分自身の別原因がある場合も上流原因を残す回帰を追加。最終独立25件成功、未解消阻害なし。正式CIは確認後追記する。
- ローカル検証: Node24.19.0、588単体/21files成功（既存551期待値不変、新37）、lint既存aria-description warning1のみ、types成功、通常build成功。最終ソース通常/Pages buildも成功。詳細設計は[calculation-status.md](docs/agent/calculation-status.md)。
- 初回GUI: 旧結果保持は正しいがcaptionから『旧結果』語がなく既存assert失敗。ユーザーの旧結果明示要件に合わせ『旧結果（保持中・未確定）』へ修正し、数値期待値は変えず再検証で解消。初回setupはe2e依存リンク/browserpath不足で未開始、既存隔離依存と既存browserpath指定で開始。
- ローカルGUI: Chromium4条件で215チェック成功（新20）、errors[]、246PNG/4trace。実画像4枚で原因/下流/旧値、狭幅dark/light200%詳細、Mermaidを確認。WebKitはOS共有ライブラリ不足で両条件未実行、全harnessはexit1。最後の撮影位置調整後を含む最終公開SHAはCI全6条件で正式確認し、ローカル作業treeの証跡を最終SHA成功と称さない。
- 正式検証: 公開HEAD `e9f1513adbf5cd5d565ba456aba1b545405fa772` の [CI 39368747494](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/39368747494)で588単体/21files、lint、型、通常/Pages build、Chromium4/WebKit2の324 GUIチェックが成功、errors=[]。artifact 12241505818のZIP digest一致、provenanceのsha/expectedSha/servedIdentity.shaを公開HEADと照合。370 PNG/6 traces、実PNG8枚でWebKit375px dark/390px lightの200%表示、原因/下流/旧値/i詳細/Mermaid等を確認。長い詳細は縦scrollであり画面外全文を視認済みとはしない。
- 検証時間の調整: 上記jobは19分40秒で既存20分上限へ接近したため、追加GUIシナリオ分の余裕としてtimeout-minutesだけ30へ延長。検査項目/期待値/通常の実行量は不変。結果追記と設定調整を含む最終commit自身のCIは [PR #40 Checks](https://github.com/tetsujisugimori-coder/calculator-memo/pull/40/checks)で別途確認し、上記HEAD成功で代用しない。
- 未解決・対象外: 過去baseline復元/永続診断履歴、数値未試行原因の網羅、実iPhone Safari・OSキーボード/VoiceOver・長期保存・全幅は未検証。部分再計算/部分確定/エンジン全面改修なし。PR作成・正式CI後に結果を追記し、最終文書commitのCIも確認して未mergeで停止する。

## 2026-10-20 (JST): PR #39 後日補記（記録のみ）
- 訂正対象: 以下のID実行計画節は公開前の『PR未作成・正式CI確認待ち』が残っていた。公開・検証済みの記録追記が完了処理で漏れていたため、過去本文を保持して事実を補う。PR #39のコード/過去branchは変更しない。
- [PR #39](https://github.com/tetsujisugimori-coder/calculator-memo/pull/39)、最終HEAD `ce22e800e3ba08d54cccfee633c9ccd01adcf274`、[CI 39364179508](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/39364179508)成功。551単体、lint、types、通常/Pages build、Chromium4/WebKit2の294 GUIチェック、独立55検証成功。実画像確認と証跡HEAD照合済み。
- PR #39は人間によるmergeを今回の最新mainで確認。既知制約と意図的な独立IDエラー選択順差分は元設計どおり。今回の追記は2026-10-20の記録訂正であり、新たなPR #39検証実行や再mergeではない。

## 2026-10-20 (JST): ID参照標準導線と共有依存グラフによる実行計画
- 基点: PR #38 merge後のmain `7fd8934ff3a04a3f43cd50ef5cbe77286ff55014`をfetch/ff-only pullして確認。新規作業枝 `feat/id-reference-execution-plan`。PRは未作成、番号未確定。
- 変更: 「＋ 計算」を既存ID参照形式の未評価ブロックへ、「＋ 旧変数計算」を明示互換導線へ分ける。内部ID入力は不要。PR #38の構造解析を共有coreへ分離し、実行計画・依存解析・Mermaidが同じ確定ID辺を使用する。
- 実行: 旧モードは従来の配置順で全件評価し失敗再代入のscopeを保持。旧フェーズ失敗時はID評価へ進まない。IDは依存元優先、ready集合内のcanonical ID順で決定的に評価。変数候補辺と逐次/フェーズ制約を分離し、不確定候補や保存エラーをpreflight失敗へしない。
- 判断変更: 従来のID独立ノードtie順は表示順由来。今回、表示順非依存の実行計画を保証するためID順へ変更。複数独立IDブロックが数値失敗する場合の先頭エラーもID計画順となる。旧変数・構造preflightの優先順位、成功時の数値意味論は維持する。旧変数とID文法の逆向き混合依存は現行文法で成立せず、不正な式を黙って変換しない。
- 異常系: 自己/循環成分/循環下流、参照切れ/参照形式/解析失敗を区別。今回の原因・確定ID下流だけを派生diagnosticsで返し、editorに局所表示。既存attemptErrorは全体rollback通知として維持し、無関係ブロック自身のerrorへ波及させない。編集・再読込では今回診断を引き継がない。
- 互換性: 全成功時のみ一括確定、旧結果rollback、未知metadata、JSON version1、非破壊保護、raw精度、登録式/履歴/メモを維持。保存移行・新依存なし。自動/部分再計算、キャッシュ、Mermaid描画拡張は対象外。
- ローカル検証: Node24.19.0で551単体/20files成功（追加34）。lintは既存aria-description warning1のみ、型、通常/Pages build成功。既存単体の期待値変更なし。既存GUIの旧変数シナリオは新しい明示ボタンへselectorだけ変更し、数値期待値を維持。自己参照の表示検証は区別された診断語へ変更。
- 独立レビュー: 55検証成功。旧mainと同treeの基準で40DAG比較、24表示順の実行順一致、旧scope/rollback、今回診断の局所性を確認し阻害指摘なし。計画のコメント位置を修正。最終CI/GUIは別途確認する。
- GUI: ローカル実アプリChromium4条件で195検証成功（新規16）、218PNG/4trace。新規導線・局所エラー・無関係rollbackの実PNGも確認。全harnessはWebKit起動時のOS共有ライブラリ不足でexit1となり、WebKit2条件は未実施。画面証拠をviewport/該当captionへ絞るハーネス変更後の最終SHAは既存隔離CIで6条件を再検証する。ローカルは未commit作業treeの探索検証であり最終公開SHA成功とは扱わない。iPhone Safari実機・OSキーボード/VoiceOver・長期保存は未検証。
- 詳細: [実行計画・優先順位・図との違い](docs/agent/execution-plan.md)。単独PRで受入条件を追跡し別Issueは作らない。公開後のPR本文に最終SHA/CIを記載する。戻す場合は本PRをrevert、保存移行不要。マージ・本番公開は行わない。

## 2026-10-20 (JST): 読み取り専用依存解析・変更影響・Mermaid文字列
- 基点: PR #37 merge後のmain `83ae24cc4b921b67a785c2e0160e7b8f63a2972c`。新規作業枝 `feat/dependency-analysis-mermaid`。[Draft PR #38](https://github.com/tetsujisugimori-coder/calculator-memo/pull/38)を作成済み。
- 変更: ID参照と旧変数を実際の構文検査経路で解析し、directed graph・診断・変更前後の影響閉包を返す内部API。Mermaid文字列はブロックIDの衝突しない符号化、全ラベルentity化、安定順/重複排除、状態文字を含む。画面描画/コピーUIは追加しない。
- 判断: 数値評価をしないため、`x=2`も成功を特例認定せず、成功しうる先行代入と未定義の可能性を不確定として保持。失敗再代入が残す旧scopeを推測で落とさない。配置変更自体と、配置による変数束縛変更を別報告。未知metadata/未使用slot/表示だけの変更は数値影響にしない。
- 互換性: 新解析は既存preflightと分離。手動全体stale、一括確定、rollback、旧エラー優先、raw精度、version1/未知metadata/非破壊保護は不変。既存parserを共有するため構文専用入口だけ抽出し、計算順・演算を変更しない。保存済みエラーは現在式の評価と区別する。
- レビュー: 独立レビューでmetadataだけの変更の過大包含、保存エラー表示、壊れた参照entries/current状態の例外、無効→有効構造修復の影響漏れを検出し修正。45対象テストを独立再実行して成功、未解決の正当性指摘なし。
- 検証: Node24.19.0で517単体（実Mermaid11.12.2 parserを使う8テスト含む）成功。lintは既存aria-description warning1のみ、型検査・通常/Pages build成功。Mermaid/jsdomはdev依存だけで、既存784依存entryのversion/integrity等は不変。最終commit自身のCIとGUI結果は[PR #38 Checks](https://github.com/tetsujisugimori-coder/calculator-memo/pull/38/checks)で確認待ち。
- GUI実施状況: 初回ローカル実行のChromium desktopシナリオ通過後、並行Pages rebuildがtest-only provenanceを消し次contextでJSON parse失敗。アプリassertion不良ではなく検証実行の干渉と切り分け。残りの5条件と最終SHAはPRの隔離CIで再検証する。ローカルWebKitは今回未到達（過去にOS共有ライブラリ不足）、Safari実機も未検証であり成功扱いしない。
- 詳細/残件: [設計/API/静的解析の限界](docs/agent/dependency-analysis.md)。全ての旧変数候補を残す保守的過大包含は意図的。自動/部分再計算、グラフUI、外部送信、Excelエンジンは対象外。作業枝の公開とDraft PR #38作成は実施済み。mainへのマージ・本番デプロイは行わず、人間レビュー待ち。戻す場合は本PRをrevert、保存移行は不要。

## 2026-10-20 (JST): PR #37 旧評価フェーズ失敗後の参照評価を停止
- 判定: 旧モード内の失敗後継続は、失敗再代入が従前のscopeを残す既存仕様を守る。一方、旧フェーズ終了時に全体失敗が確定した後のID参照評価は確定結果に使われない不要な処理だった。
- 修正: 旧モードを配置順にすべて評価した後、失敗があれば参照フェーズ前で全体rollback。旧フェーズ内の評価順・scope・全成功時のみ一括確定・未知metadata保持は不変。診断は後続の間接参照エラーではなく最初の旧モードエラーを優先する。
- 評価記録: ID参照は数値評価呼出し直前に記録し、throwした試行も含める。旧モードの記録は従来どおりcalculateMemoBlock呼出し単位であり、代入名検査などで内部数値評価に達しない失敗も含む。構造検査/参照元確認だけで停止した参照は記録しない。
- テスト先行: 変更前に不要な参照評価3ケースとthrow記録漏れ1ケースの4失敗を確認。追加9ケースで実calculator呼出し順/回数、正常再代入、失敗再代入後のscope保持、検査段階の失敗、混在参照、旧結果全rollback、修正復帰、丸め前精度、未知metadata、JSON保存再読込、未知形式の非破壊保護を検査。
- 検証: Node24.19.0で481単体、lint（既存warning1）、型検査、通常/Pages build成功。GUI・最終公開SHAのCIは既存PR Checksで確認待ち。今回UI変更なし。独立ソースレビューでもphase境界と記録範囲を再確認。
- 関連: [PR #37](https://github.com/tetsujisugimori-coder/calculator-memo/pull/37)。新規PR・マージ・本番公開なし。リモート12c6c031と同treeのローカル52304108から作業し、公開は既存PRへ同差分を反映する。

## 2026-10-20 (JST): 参照selectのWebKit native描画を修正
- 再確認: `e20216d` のCI 39339028663は6条件270チェック成功でも、375/390px WebKit dark拡大画像では参照selectが白地・淡色文字のままだった。前回のCSS色指定/computed style検証だけではnative描画を検出できなかった。
- 修正: 参照selectに限定してappearanceを外し、既存テーマ色・CSS矢印・右余白を明示。select要素、選択肢、native選択操作、ラベル、44px以上の高さ、focus-visibleは保持。計算・保存処理は変更しない。
- 回帰: 両テーマ200%拡大で、select screenshotの実PNGをCanvasへ読込み、文字/矢印を避けた上部内側の背景色と文字色の出現を検査。computed CSS成功だけを視認性の根拠にしない。
- ローカル検証: Node24.19.0で472単体、lint（既存warning1）、型検査、通常/Pages build成功。Chromium375pxの分離したnative select診断で両テーマの描画画素と選択値変更を確認。実アプリ全GUI再実行とは区別する。
- 未検証: 今回の修正後WebKit画像/6条件GUI/最終SHA CIはPR #37 Checksで確認待ち。ローカルWebKitはgtk4/graphene/woff2/harfbuzz-icu/hyphen/manette/GLESv2の共有ライブラリ不足で起動不可。iPhone Safari実機・OS picker/VoiceOverは未検証。
- 関連: [PR #37](https://github.com/tetsujisugimori-coder/calculator-memo/pull/37)。マージ・本番公開なし。

## 2026-10-20 (JST): 同一メモのID参照・手動一括再計算
- 基点: main `b1a590aa74808e82c7c3dfe3e02fa13984338450`（PR #36 merge）。
- 変更: GUIでslot→block ID参照を挿入する新mode、非再帰依存解析、循環/欠損検出、永続manual方針、旧結果/stale表示、全成功時のみ一括確定。既存engine/丸めを変更せず内部数値を参照。
- 判断: 旧検討の前方ブロックだけという制限は採用せず、任意配置のID参照へ。旧変数の逐次束縛は互換性のため別段階に維持。部分closureより全体atomicを採用し、無関係の空式も確定を止める制約を明示。詳細は [設計記録](docs/agent/block-references.md)。
- 非破壊性: 未知形式の原本保護/保存拒否、既存付随情報保持を継続。登録式取り込みの裏再評価を止め、手動メモは確認済み値のみ取り込み可能。
- ローカル検証: Node24.19.0で472単体、lint（既存warning1）、型検査、通常/Pages build成功。独立レビューの追加5件（2,880 DAG数値比較を含む）成功、現時点阻害指摘なし。GUI6条件と最終SHA CIはPR Checksへ追記する。
- GUI診断: ローカルChromium既存4条件で179チェック成功、各条件のbrowser/runtime/network error 0。WebKitはOS共有ライブラリ不足で起動不可。作業差分のローカル画像はbase SHA overlayのため、公開候補SHAの正式証跡として扱わない。
- 正式検証: [PR #37 Checks](https://github.com/tetsujisugimori-coder/calculator-memo/pull/37/checks)で最終head自身のNode22.13.0、両build、Chromium/WebKit6条件を確認し、SHA・実測結果・artifactをPR本文へ記録する。200%文字拡大は上部だけでなくpicker/結果までスクロールした画像も追加。
- 関連: [PR #37](https://github.com/tetsujisugimori-coder/calculator-memo/pull/37)。CLI push認証不足のため公式GitHub接続で公開、local/remote tree一致を検査。新Issueは作成しない。
- 独立画像レビュー: 初回候補CI 39336687992 は472単体/GUI6条件270チェック成功したが、WebKit375px dark拡大画像で新参照selectの白背景/淡色文字を確認。新参照selectとbuttonのテーマ背景・文字・枠色を明示し、両テーマCSS期待値をGUIへ追加。テスト成功と視認性を分けて判断し、修正後の最終CIを再確認する。
- 未検証: iPhone Safari実機、OS入力/VoiceOver/長期保存。実ユーザーデータ損失を確認したものではない。

## 2026-10-20 (JST): 保護理由キャプションと原本JSONエクスポート
- 基点: PR #34マージ済みmain b81d27ce15709e1f599888b78d884f8a6f6b902f。Issue #35。既存読込/保存保護を再利用し、全データ保護の説明、未対応type/mode・構造異常・重複IDの理由、既存復旧UIの詳細と原本ダウンロードを追加。
- 保存形式/計算規則変更なし。原本文字列をUTF-8へ欠落なく往復できる場合のみファイル化。空文字原本も扱い、取得不能/孤立サロゲートは成功扱いしない。単一キーのため正常兄弟メモもロックする既存制約を画面と文書に明記。
- 予防対策であり実ユーザーデータ損失は未確認。修正前8失敗は診断コード未実装の期待値であり、既存保護のデータ損失再現ではない。
- ローカルNode24.19.0で434単体、lint（既存warning1）、型検査成功。両ビルドとGUI、独立レビューの確定結果は後続記録を参照。
- 江戸弁運用ガイド現行本文と保存済み辞典の冒頭を参照。最新辞典全体は未取得。iPhone Safari実機、OS文字拡大/clipboard/ダウンロードUIは未検証。
- 正式検証: SHA `41e5af14efef64dc50971ae25bc2e9c54aeec5d4` の[Actions 39291019054](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/39291019054)でNode22.13.0、434単体、lint/型/通常・Pages build全成功。GUIは2026-10-20 02:06:23〜02:19:31 JST、Chromium4/WebKit2の既存6条件、234チェック、browser/runtime/network error 0。原本エクスポートは7種の異常についてUTF-8バイト完全一致。
- [成果物256画像・6trace](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/39291019054/artifacts/12206467085)のSHA256 `264066e0d53fb5d1c7ffad6113b0558a8cabab6ff9abfcd67e48afefcbe7574c` をAPI digestと照合し、checkout/配信SHA一致を確認。独立レビューがソースと成果物を別途確認し阻害指摘なし。WebKit375/390、両テーマ、拡大文字で保護理由と操作の折返し/可読性を確認。7日保持。
- ローカルChromium4条件155チェック成功。ローカルWebKitはOS共有ライブラリ不足で起動不可、正式6条件は上記Actionsで検証。公開はCLI認証不足のため公式GitHub接続を使用し、ローカル/公開tree一致を確認。
- この証跡追記は文書のみ。最終コミット自身のCIを[PR #36 Checks](https://github.com/tetsujisugimori-coder/calculator-memo/pull/36/checks)で別途確認し、PR本文へ最終SHAと結果を記録する。マージは利用者判断。


このファイルは開発履歴と重要な設計判断の正本（作業の証跡）です。現在有効な行動規則は [AGENTS.md](AGENTS.md) と関連設定・運用手順を参照してください。新しい記録はこの説明の直後へ追加します。旧記録に含まれる「現在」や追記形式は当時の内容であり、現行規則ではありません。


## 2026-10-19 (JST): PR #34追加レビュー対応・再計算時の付随情報保持
- 対象: [レビュー5570559182](https://github.com/tetsujisugimori-coder/calculator-memo/pull/34#pullrequestreview-5570559182)、基点 `cd020509f26d93e188c7d8837c49a5ced32ff847`。読込境界だけでなくPlainNoteModal保存、MemoBlockEditor追加/編集/削除/上下移動の再計算経路を確認。
- 再現: production修正前に回帰20件を追加し、付随情報保持12件が失敗、計算結果/不正拒否8件が成功。proofRef/sourceId/入れ子metadata等の消失経路を確認。実ユーザーデータの損失確認ではない。
- 修正: 元ブロックをcopyしてから計算エンジンの完全なsnapshotを重ね、付随情報を保持しつつ既知の結果/error/displayを更新。原オブジェクトや入れ子を変更しない。新たな型/保存形式/評価規則は追加しない。
- 契約訂正: 追加キーは意味を解釈しない記述的付随情報。保持は変更後の式への証明/出典の適合性を認定しない。計算意味の変更はversion/type/mode等の明示的互換境界が必要。未知type/mode/不正構造は従来通り保護停止。詳細は[非破壊保存契約](docs/agent/nondestructive-storage.md)。
- ローカル: 420単体・lint（既存warning1）・型・通常/Pages build成功。Chromium375touchの新規GUI診断で無変更編集保存、他ブロック編集/追加削除/上下移動、式error→復帰、JSON再読込と付随情報保持を確認。正式6条件・最終SHA CIは[PR #34 Checks](https://github.com/tetsujisugimori-coder/calculator-memo/pull/34/checks)へ記録する。独立再レビュー結果と正式GUI証跡は下記。
- 正式GUI: SHA `0f257312a97d6a5b55dda92b2386ae1909ef2890` の[CI39247191200](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/39247191200)全工程成功。2026-10-19 20:48:48〜20:57:47 JST、Chromium/WebKit既存6条件、216チェック、browser/runtime/network error0。追加情報は保存JSONで直接比較し、画面だけで保持を推測しない。
- [238画像・6trace](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/39247191200/artifacts/12184980090)を取得、ZIP SHA256 `0109ff32c618baec579a12ce3801e7f83ddbb128fa53e31495a93be07168feb3`とAPI digest一致。checkout/配信SHA一致、WebKit375画像確認。7日保持。最終文書SHAの結果はPR Checksへ記録する。
- 独立再レビュー: 420単体と追加10ライフサイクルを別途実行。完全な既知field更新、入れ子不変、未知mode拒否、編集経路と保存JSON保持を確認し、ソース阻害指摘なし。
- 残存制約: iPhone Safari実機、OS入力/clipboard/支援技術/長期保存未検証。付随情報のdeep cloneは不要と判断し、入れ子は不変参照共有。江戸弁ガイド現行箇所と保存済み辞典v19冒頭を参照。

## 2026-10-19 (JST): メモ・ブロックの非破壊読込・保存保護
- 基点: main `8c861b786b2972468398b05d8732ee00740615d9`（PR #32）。AGENTS/README/関連手順/Actions/既存Issue・設計書を確認。
- 変更内容: notesとblocksの構造・非空/一意ID・対応形式を検証。原JSONを保持して保存全体を停止。保存入口で既存データと候補を再検査し、既存の明示初期化を別経路へ分離。復旧UIを再利用し、保護中の編集と全体キー操作を停止。
- 判断変更: 従来は不正ブロックを落としてMarkdown本文へ縮退、不正メモは除外。成功読込後の自動保存により構造を失う経路があるため、全体fail-closedへ変更。実ユーザーデータ損失は未確認。正常version1/旧本文/空blocksを維持、式評価・丸め変更なし。
- 採用理由: 保存は単一キーの一括更新。ノート単位部分編集は安全なマージ契約を要するため今回採用せず全体保護を選択。将来の部分編集は別設計。詳細は[設計・検証](docs/agent/nondestructive-storage.md)。
- 検証結果: cloud Node24.19.0で全400単体、lint（既存warning1）、型、通常/Pages build成功。独立レビューでlocalStorage getterがtry外になる例外漏れを修正し回帰追加、最終阻害指摘なし。既存失敗期待を無根拠に変更せず、旧縮退方針から新保護方針への変更として回帰を追加。
- GUI証跡: SHA `8c3dde7e5d394f15f4eafd8b3b4ef49abb554ecd` の[Actions 39237123675](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/39237123675)全工程成功。2026-10-19 19:25:09〜19:36:00 JST、既存6条件（Chromium desktop/390 narrow/390・375 touch、WebKit390・375 touch）、198チェック、browser/runtime/network error 0。未知/混在/重複/不正blocks、再読込、取消、原JSONコピー、修復後正常編集、起動後破損の保存拒否、明示resetを追加。
- [232画像・6trace](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/39237123675/artifacts/12180301473)のZIP SHA256 `97e60ff49cf7fc56e235b98565b5d82caf49ed1f10976fdf1d93685a56d1b615`をAPI digestと照合。checkout/配信SHA一致、画像を確認。7日保持。最終文書コミットのCIは[PR #34 Checks](https://github.com/tetsujisugimori-coder/calculator-memo/pull/34/checks)で別途確認する。
- 初回診断: GUI title selectorが「任意」付きlabelに不一致、次に正常fixtureの空日時が既存formatter例外を誘発。selectorとfixtureを修正し期待値を緩和せず全条件再検証。日時意味検証は既存同様対象外の制約として記録。ローカルWebKitはOS共有library不足、正式検証はActionsを使用。コピーは合成clipboard sinkを検査し実OS clipboardは未検証。
- 関連: [Issue #33](https://github.com/tetsujisugimori-coder/calculator-memo/issues/33)。[PR #34](https://github.com/tetsujisugimori-coder/calculator-memo/pull/34) 検証中。
- 未解決/対象外: 多タブ完全な原子的競合解決、未知データの部分編集、iPhone Safari実機/OS入力/長期保存、Issue #19。江戸弁ガイド現行箇所と辞典v19冒頭を参照。初回npm既定cacheは書込不可、workspace cacheを使って成功。


## 2026-10-19 (JST): 登録式の実行・変数入力
- 基点: PR #30マージ済みmain `e5e87046c1c7671636f1a53d00c559cc4a81b4d9`。AGENTS/運用手順/README/LOG/Issueと評価器・変数・ライブラリ・保存方式を確認。
- 変更: 登録式選択→実行画面、構文から変数入力生成、明示選択したノートの有効値を空欄に取込、既存エンジンで確定計算。入力変更で結果を無効化し、定義と実行値・結果を分離。識別表示設定/native入力/i説明を踏襲。
- 保存: version1のoptional formulaExecutionsに未完入力をIDごと保存。再読込時は入力のみ復元、結果は再計算。不正追加データは元raw保持し自動保存停止。定義ID/既存データは不変。
- 判断: 履歴・単独メモはAST内の変数に丸め前数値を束縛した自己完結式と実行時記録を受渡し。通常エンジンでObject.is一致を確認し、展開による既存上限超過は結果を残して受渡だけ停止。表示は各既存formatterを維持するため整数近傍の文字列差はあり得る。代入失敗時の初期値は既存ノートと同じく以前の有効値を使う。詳細は[設計](docs/agent/formula-execution.md)。
- 検証: 全376単体（追加39）、型検査、lint（既存aria-description warning 1）、通常/Pages build成功。追加500式の独立JS比較。独立レビューでも376単体と別の6000式/6000履歴受渡が内部値完全一致、阻害指摘なし。初回CIも同一項目すべて成功。
- GUI: 初回HEAD `b306037bce2e8b7c712be0c0f6b8d41a5214accf`の[run 39200045405](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/39200045405)で既存6条件・156検証成功、実行時/通信エラー0。2026-10-19 13:34:35〜13:42:44 JST。[208画像・6trace](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/39200045405/artifacts/12163372883)を取得しZIP SHA256/API digestとcheckout/配信SHAを照合。7日保持。画像確認後、200%文字で下部操作をスクロール撮影し実tap受渡を確認する検証を追加。最終コミットも[PR #32 Checks](https://github.com/tetsujisugimori-coder/calculator-memo/pull/32/checks)で別途確認する。
- ローカル補足: 全体GUIは既存識別表示の撮影で10秒timeout、新規部分未到達。期待値/timeoutを緩めず記録。先行ビルドの新規限定診断はChromium desktop/375touchの8検証成功。正式な全6条件・SHA証跡は上記Actionsを使用。
- 独立比較の再現条件: i=1..1000、a=(i-501)/16、b=(i%23)/8、c=i%19+1。a+b*c、(a+b)/c、-a^2+b、sqrt(abs(a))+b/c、a*(1+b)、abs(a-b)^2をJS算術/Mathで直接評価し、生値と履歴転送値をObject.is比較。
- 関連: [Issue #31](https://github.com/tetsujisugimori-coder/calculator-memo/issues/31)。登録式間参照・関連レポート・科学記数法・単位換算は対象外、Issue #19維持。
- 未検証: iPhone Safari実機、OSソフトキーボード/IME/支援技術、長期保存。江戸弁運用ガイド現行箇所・辞典v19冒頭を参照。通常git pushは認証なしで失敗。公式connectorで同一tree SHAを照合して作業branchへ公開した。


## 2026-10-19 (JST): 変数・登録式の識別表示基盤
- 基点: PR #28マージ済みmain `040cd3683cafaa5d0aaa89ff3be421470b1184cc`、AGENTS/関連手順/README/LOG/Actions/Issueを確認。
- 変更内容: 3表示モード、720px以下初期色のみ、手動値は保存固定。変数青/登録式紫/式黄/結果緑と上側の小ラベル、i説明本文を独立ファイル化。
- 第一希望/採用判断: 入力文字への直接装飾よりnative入力の安定性を優先し、別表示の代入先/参照一覧を既存AST構文検査で生成。計算評価器・丸め変更なし。登録式はID付き項目だけを識別し、式内の同名変数を登録式参照と扱わない。登録式実行/関連レポートは後続。
- 保存: 既存version1 settingsへoptional identificationMode。欠落/不正値は幅連動初期値、手動noneを含む有効値は固定。旧数値/メモ/ライブラリ不変。
- 検証結果: 337単体（追加20件）・lint・型検査・通常/Pages build成功。独立レビューのヘルプ中の背面キー操作抑制、代入式全体の入力長検査の2指摘を修正し、追加阻害指摘なし。GUI/CIの最終結果と証跡はPR Checksへ記録する。
- GUI追加: 既存6条件を維持し、3モード/自動初期値の幅跨ぎ/手動固定/保存復元/両テーマ/構文エラー時の識別解除/未知変数/改名削除/nativeカーソル/ヘルプ中キー操作とfocus復帰を検証。色のみは視覚ラベルを隠し支援技術向け文字を残す。
- 関連: [Issue #29](https://github.com/tetsujisugimori-coder/calculator-memo/issues/29)、[PR #30](https://github.com/tetsujisugimori-coder/calculator-memo/pull/30)。
- 未検証: 実機iPhone Safari・実OS IME/キーボード・支援技術の実機操作。cloud skillは提供状態変動のため未参照、repo規則を優先。江戸弁ガイドの最新原文参照は本作業では未確認。


## 2026-10-19 (JST): 登録式ライブラリの基礎
- 前提確認: main `693277454e13202a1aa8d9368e40768036b68a36` はPR #26変数機能まで。利用者が登録式/表示設定もマージ済みとの前提を訂正し、登録ライブラリ基礎を明示承認したため再利用実行は含めない。
- 変更内容: 名前/式の登録・一覧・選択（詳細確認）・編集・確認付き削除/直前undo。未束縛変数は構文から抽出し数値結果を作らない。定義と将来の実行入力を混ぜない。
- 判断: 既存parser/AST許可検証を共有するvalidate-only経路を追加。評価器は不変、1/0等の数値成立は検査しない旨をUI/READMEで明示。代入、任意関数、暗黙乗算を禁止し入力/深度/ノード制限を維持。%既存問題#19は別件。
- 保存: top-level version1のoptional formulaLibrary（内側version1）。旧データ欠落は空、未知version/壊れた定義/選択は元raw保持し自動保存停止。対応versionの追加metadataは保持。旧アプリによる新フィールド喪失は制約として明記。
- 第一希望/採用: 既存変数と共通の構文規則・小さい追加領域を採用。仮の変数値で計算検査する案や、実行/表示設定の先回りは不採用。未確定編集はmodal内に保持するがreload後draft復元は次段階。
- 検証: 317単体・lint・型検査・通常/Pages build成功。基点mainとの2029式比較（旧1000式含む）で値/表示/エラー差分0。独立レビューでも317単体・型検査成功、5760評価の値(Object.is含む)/表示/エラー差分0、阻害指摘なし。フォームlabelを明示関連付けに修正し、下部操作/両theme/文字2倍の追加画像を補強した。
- Actions: [run 39184182970](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/39184182970)、初回HEAD `07e8609ff22bbf7f42cac53a1563dac0d660d7b2`で全工程成功。2026-10-19 10:13:00〜10:20:09 JST、Chromium4条件（1365px、非touch390px、touch390/375px）とWebKit touch390/375pxの計6条件126検証、ブラウザエラー0。[124画面・6trace・診断](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/39184182970/artifacts/12157458309)を取得、ZIP SHA256をAPI digestと照合し、checkout/配信SHA・branch/runを確認。7日保持。証拠補強/本記録の最終コミットは[PR Checks](https://github.com/tetsujisugimori-coder/calculator-memo/pull/28/checks)で別途確認する。
- ローカルGUI: Chromium4条件83検証成功、WebKitはOS依存不足で起動不可。初回375pxの既存メモ開始tap後dialog不在、別診断ではscrollY=0期待に15が残る失敗を観測。traceにsmoothscroll中の不安定/ヘッダー遮蔽があり、同一アプリ再確認/上記Actionsでは成功。期待値やアプリ挙動を変更せず記録する。追加したlibrary限定375px診断で両theme/2倍文字/下部操作の表示は成功（OS文字拡大・実機検証ではない）。通常git push認証なしのため公式connectorで同一treeを照合し作業branchへ公開。
- 関連: [Issue #27](https://github.com/tetsujisugimori-coder/calculator-memo/issues/27)。[PR #28](https://github.com/tetsujisugimori-coder/calculator-memo/pull/28)。
- 未検証/制約: 実機iPhone Safari、OSキーボード、長期保存は未検証。ライブラリ200件・タイトル120文字。江戸弁ガイド現行箇所/辞典v19冒頭参照済み。クラウドengineering skill読取は利用不能で未参照、repo運用規則を確認した。


## 2026-10-19 (JST): ノート単位の明示的な変数モード
- 変更内容: 計算ブロックへ変数定義・参照・再代入を追加。既存AST全検証→一回評価を再利用し、ノートごと空のMapで上から評価。編集・移動・削除・追加は全体再計算。本文/KaTeX/通常電卓/単独メモ/URLへscopeを流さない。
- 従来方針 / 変更理由 / 新方針: x/Xを乗算にする旧式と合法変数名ex2が衝突するため、推測的な式判別を不採用。optional evaluationModeを持つ新ブロックと明示切替のみ変数評価し、欠落した旧ブロックは旧解釈のまま。保存version1は維持、未知modeは実行エラー。旧版アプリで新modeの再編集・再計算は非対応。
- 第一希望 / 採用策: ノート単位scopeと旧データ保全を小さい加算変更で実現。共有scope、依存graph、大規模schema移行は採用しない。失敗再代入は以前の有効値を保持し、以降を継続。設計詳細・次表示設定への引継ぎは [note-variables.md](docs/agent/note-variables.md)。
- 表示判断: 変数/式/結果を淡青/黄/緑と文字ラベルで分離。新modeの非zero整数近傍だけ2*EPSILON*abs(value)以内の丸めノイズを表示で整える。total例は表示6,600、内部6600.000000000001を保持。広い有効桁丸めは大整数を変えるため不採用。旧表示は変更しない。
- 検証結果: cloud Node24.19.0で286単体・lint・型検査成功。通常/Pages build成功。main c02861c4a5e30df2095a0bc4180407050bfe173dとの2029式（旧1000式含む）比較で内部値・表示・エラー文差分0。GUIは既存6条件へ変数・旧mode・保存・順序・scope・両theme/拡大/折返しを追加。下記初回Actionsで成功し、最終commitはPR Checksで別途確認する。
- 独立レビュー: 初稿でmathjsの非十進数tokenが通過する指摘を受け、変数modeで明示拒否と回帰追加。独立286単体成功、旧新8,008式差分0、逐次scope500ケース確認、blocking指摘なし。最終追加は未知mode保存回帰と画像撮影位置の補強のみ。
- Actions確認: [run 39175545041](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/39175545041)、対象 `ebacc41324f57299c985d7347bf59ef4bdd542d1`。Node22.13.0で286単体・lint・型・両build・GUI全工程成功。2026-10-19 08:14:12〜08:20:26 JST、Chromium/WebKit既存6条件120検証・エラー0。[106画面・6trace・診断](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/39175545041/artifacts/12154676326)のZIP SHA256をAPI digestと照合、provenanceのexpected/配信SHA・branch/runを確認。7日保持。最終追記では長い変数名/結果が画面内へ入る撮影位置を追加し、最終SHAは[PR Checks](https://github.com/tetsujisugimori-coder/calculator-memo/pull/26/checks)で再確認する。
- local GUI補足: Chromium4条件79検証成功、WebKitはOSライブラリ不足で起動失敗。ActionsをWebKit検証の根拠とする。git CLI認証なしのため公式connectorで同一treeを照合して作業branchを公開した。
- 関連: [Issue #25](https://github.com/tetsujisugimori-coder/calculator-memo/issues/25)、基点mainでPR #24のmergeを確認。[PR #26](https://github.com/tetsujisugimori-coder/calculator-memo/pull/26)。依頼でPR #25と呼んだ機能は実採番ではIssue #25 / PR #26。予定の表示設定は次工程（番号未確定）で今回未実装。
- 未解決事項: Issue #19、変数等と%混在、科学記数法、他アプリへのscope交換は対象外。iPhone Safari実機は未検証。既存chunkサイズ警告は残る。ローカル/tmp容量不足は余裕ある作業領域で依存導入をやり直し解消。江戸弁ガイドは参照済み、辞典の直接参照は256KiB上限で失敗したため2026-10-18更新ローカル写し冒頭を参照（最新同一性は未確認）。


## 2026-10-19 (JST): AST検証と一回評価を分離
- 変更内容: 全ASTの許可検証後、後順の子値Mapを再利用する評価器へ最小変更。数値演算は既存mathjsの固定許可関数を使用し、本番の計測コード・依存追加・UI/保存schema変更はない。
- 従来方針 / 変更理由 / 新方針: 検証済み各ノードのnode.evaluateは子孫も再計算していた。31項加算は991実行、31括弧は528実行を実測。一度評価へ整理し、それぞれ61/32実行へ削減した。構文の全体検証を先に終え、左→右の数値エラー順序を維持する。
- 第一希望 / 採用判断: mathjsの既存数値意味を保った小さい内部整理を第一希望として実現。汎用フレームワーク化、結果キャッシュ、新エンジンは不要と判断し採用しない。制約による暫定仕様は追加しない。
- 検証結果: cloud Node24.19.0で245単体、lint、型検査、通常/Pages build成功。旧1000式を含む2029式比較で内部値(Object.is、-0含む)・表示・エラー文の差分0。長さ2000/深度32/ノード256/指数絶対値10000境界、全構文検証優先、非有限中間値拒否、最終のみ最大安全値を回帰追加。[再現手順と性能実測](docs/agent/ast-evaluation.md)。31項加算の1式中央値0.350→0.148msはこの環境での参考値。
- 独立レビュー: 独立生成11,078式（成功8,559/拒否2,519、seed79037）の旧新差分0、245単体成功、blocking指摘なし。最終SHAのActionsと既存6条件GUIはPR Checksで別途確認予定であり、未実行を成功扱いしない。
- Actions確認: [run 39163728584](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/39163728584)、対象 `26053f792e8b992e84b2d0a0eeea6f9b2a7e4151`。Node22.13.0で245単体・lint・型・両build・GUI全工程成功。2026-10-19 05:33:41〜05:38:37 JST、Chromium/WebKit既存6条件102検証・エラー0。[88画面・6trace・診断](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/39163728584/artifacts/12150350848)のZIP SHA256をAPI digestと照合、provenanceのhead/expected/配信SHA・branch/runを確認。7日保持。この結果追記コミット自身は[PR #24 Checks](https://github.com/tetsujisugimori-coder/calculator-memo/pull/24/checks)で別途最終確認する。
- local GUI補足: 同一treeのlocal commitでChromium4条件67検証成功、WebKitは既知のOSライブラリ不足で起動失敗。上記ActionsをWebKit検証の証拠とする。通常git push認証が利用できず、公式GitHub connectorで同一treeを検証して作業branchへ公開した。
- 関連: [Issue #23](https://github.com/tetsujisugimori-coder/calculator-memo/issues/23)。[PR #24](https://github.com/tetsujisugimori-coder/calculator-memo/pull/24)。基点main `6f835985e7e53d2f58c89d15bac04352b3bbc5bd` でPR #22のマージを確認。
- 未解決事項: Issue #19、新数学構文と%混在、科学記数法は対象外のまま。実機iPhone Safari、OSキーボード、長期保存は未検証。既存buildのchunkサイズ警告は残存。江戸弁ガイド現行箇所と辞典v19冒頭を参照し、割合ノルマは設けない。


## 2026-10-18 (JST): 基本数学関数を安全な共通評価経路へ追加
- 変更内容: mathjs既存parser/evaluationを維持し、累乗・sqrt/abs・pi/eを明示AST許可。通常電卓へ折畳み式入力欄、^の継続/編集を追加。履歴・単独メモ・計算ブロック・保存・URLは共通評価器を使用し保存形式を変更しない。
- 理由・境界: 将来の関数電卓/数学文書の基礎を小規模独立PRで整える。`2^3^2=512`、`-2^2=-4`、`(-2)^2=4`。結果からの^は負値を括弧化する。数値の表示丸めを計算/保存へ流用しない。
- 従来方針 / 変更理由 / 新方針: 数字・四則・括弧・%の文字検証だけから、新しい名前を安全に扱う必要があるため、限定文字列＋mathjs AST全体検証へ進める。代入/任意関数/変数/非数値を拒否し、正規化前長さ2000/深度32/ノード256/指数絶対値10000、各中間有限実数/最終既存最大安全値に制限。数値だけの旧暗黙乗算は維持、新構文は明示*を要求。過大式・非有限中間値の新拒否をREADMEに明記。
- 第一希望 / 制約 / 採用策: 将来は関数結果・累乗と%も一貫して扱いたいが、旧置換は`sqrt(100)%`を誤算させる。Issue #19と評価器全面改修は今回対象外のため、新構文と%の混在を明示拒否し、既存%変換そのものは変更しない。後続の後置%構文対応で見直す。CE/±の末尾数値契約も維持し、閉括弧/定数への限界を説明。
- 検証結果: cloud Node24.19.0で228単体・lint・型検査・通常/Pages build成功。ローカルChromium4条件67検証成功。ローカルWebKitはOSライブラリ不足で起動失敗し、下記Actionsで代替検証した。新単体は仕様/安全性/資源制限/旧%/編集/内部精度/履歴/両メモ/保存/URLを対象。GUI既存6条件へ新数学シナリオを追加する。
- 関連: [Issue #21](https://github.com/tetsujisugimori-coder/calculator-memo/issues/21)。[PR #22](https://github.com/tetsujisugimori-coder/calculator-memo/pull/22)。基点main `6754813bad54a917bd111e0931de4adce016c54d`でPR #20マージを確認。
- Actions確認: [39133495835](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/39133495835)、head `4002c5083085c3773b35e6e7d527772077373e95`、Node22.13.0で228単体・lint・型・両build・GUI全工程成功。2026-10-18 22:54:38〜22:59:31 JST、Playwright1.56.1 / Chromium141.0.7390.37 / WebKit26.0 の既存6条件102検証・エラー0、mobile4条件各228touchを確認。[88画面・6trace・診断](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/39133495835/artifacts/12139191810)を取得しZIP SHA256・provenanceのhead/配信SHA/branch/run一致を照合。成果物は7日保持。この結果追記コミット自身のCIは[PR #22 Checks](https://github.com/tetsujisugimori-coder/calculator-memo/pull/22/checks)で別途確認し、前SHAの成功を流用しない。
- 独立レビュー: 実装と最終help文差分にblocking指摘なし。独立228単体、旧main比1000の四則/括弧/%合成式差分0、極端入力と禁止ASTの拒否を再確認。任意のinput maxLength案は貼付け式の黙った切断を避け不採用、共通評価器で全入力を明示拒否する。GUIで発見した旧「累乗・関数未対応」の説明2か所を現仕様へ訂正した。
- 公開方法: 通常git pushは認証が利用できず失敗。同repoの公式GitHubコネクタでmainを親に同一treeをcommitし作業枝を公開、fetch後にローカルtree一致を確認。認証・権限設定は変更しない。
- 未解決事項: Issue #19、実機iPhone Safari/OSキーボード/長期保存、新関数と%混在、関数パレット・三角/対数/階乗・グラフ等。Memo-Nexus側変更なし。依存警告は別件。
- 参照: AGENTS/関連docs/README/LOG/コード/Actions/既存Issueを確認。江戸弁ガイドの現行方針と辞典v19冒頭を参照（辞典全読ではない）。software-engineering skillは親の取得時package unavailable。利用者PCを使用せずcloud/隔離Actionsで検証する。

## 2026-10-18 19:33 (JST): PR20の元文字列オフセットを追加確認（不具合再現なし）
- 基点: PR #20 head `1b40bfea68c4ccab3d5fa3b7dea7de59cea9ebff`、最新main `f6ae38a972575858db7236ad1a9846a61ec16e88`を再確認。cloud既存checkoutの全tree `4cc32e301254ea2a7560eba5e4aceeff12884b40`とremote headのtreeが一致。AGENTS・README・関連docs・workflow・Issue #19・PR #20を読んだ。
- 変更内容/理由: 指定6式について元文字列の負号位置・抽出start/text・±・CEの期待値を固定した回帰を追加。[期待＝実測の全6式表と位置の根拠](docs/agent/calculator-state-audit.md#pr-20-マージ前追加確認-元文字列の位置2026-10-18-jst)を記録。改行例は実改行を使用。元文字列の位置不整合は未変更実装で再現せず、アプリ修正は行わない。正規化後の添字流用やrefactorなし。
- 検証結果: cloud Node24.19.0で132単体（既存126＋追加6）・lint・型・通常/Pages buildがすべて成功。既存chunk-size/proxy/vinext分類警告は残る。独立エージェントがソースと6式の期待値を照合し阻害指摘なし。人間の独立レビュー完了とは扱わない。
- GUI影響判断: アプリ/レイアウト/状態処理は無変更で、新規GUI操作の追加は不要。既存Chromium/WebKit全6条件・78検証を最終remote SHAのActionsで再実行する。現在は新SHAのCI未実行、結果は[PR #20 Checks](https://github.com/tetsujisugimori-coder/calculator-memo/pull/20/checks)および追記コメントで確認する。過去SHAの成功を流用しない。
- 関連/範囲: [PR #20](https://github.com/tetsujisugimori-coder/calculator-memo/pull/20)、[Issue #18](https://github.com/tetsujisugimori-coder/calculator-memo/issues/18)。評価器/%変換、[Issue #19](https://github.com/tetsujisugimori-coder/calculator-memo/issues/19)、PR20既存の状態遷移・小さい結果の十進展開・保存形式・workflow・依存は変更なし。新規PR・main push・マージ・deployなし。既存作業枝へ追記し独立レビュー待ちで停止する。
- 制約: 既存snapshotはGit remote/認証を持たないため、既存公式GitHubコネクタで基点headを親にcommitし同じ枝へ非強制更新する。権限/認証の変更や制限回避なし。実機Safari/OSキーボード/native文字拡大/長期保存と既存依存警告は引き続き未検証・残存。



## 2026-10-18 17:40 (JST): 計算状態の境界を調査し小さい結果の継続・輸入式の訂正を修正
- 基点: PR #17は17:31:52 JSTにマージ済み。最新main `f6ae38a972575858db7236ad1a9846a61ec16e88` と83blobのGit SHAを照合してcloud作業snapshotを作成。AGENTS・README・関連docs・workflow・LOG・Issue/PRを確認。
- 変更内容: 確定結果の継続用文字列を表示丸めなしの十進表記へ展開。URL式の末尾空白/Unicode負号を末尾数値の検出・±/CEにも反映する。PR13のboolean・元式編集・共通入力遷移・メモ無効化は維持。
- 変更理由: `1/10000000=`の後`*2=`は`1e-7*2`が許可文字違反、演算子BS後の±は`1e--7`になる。`12 * - 34 ` / `12 × − 34 `は評価できるのに編集時の数値/符号を誤認した。修正前の指数回帰14件中10件失敗、修正後成功。
- 設計判断: 数値結果の文字列だけを展開する最小変更を採用。表示値を再利用する丸め、評価器へ指数構文を追加する案、全面状態機械化は不要。有限・最大安全値の制約と保存形式を維持。状態表・境界・理由は[調査記録](docs/agent/calculator-state-audit.md)へ記載。
- 検証結果: cloud Node24.19.0で126単体・lint・型・通常/Pages build成功。独立数値探索10,021有限値で変換同値、許容範囲5,454件でmathjs評価同値。−0・正負極小・正負指数・最大安全値・非有限/範囲外の拒否も確認。GUIに小さい正負結果継続、URL訂正、括弧エラー復帰、単純括弧%、履歴/メモpayloadと再読込を追加。最初のローカルGUIは既存ブラウザcache未指定で起動失敗したため成功扱いせず、既存cacheを明示して再実行中。最終remote SHAのGUI/CIはまだ未確認。
- 関連: [Issue #18](https://github.com/tetsujisugimori-coder/calculator-memo/issues/18)。[PR #20](https://github.com/tetsujisugimori-coder/calculator-memo/pull/20)。独立レビューはblocking指摘なし。追加1,080組のUnicode/空白/演算子組合せで数値位置・CE・符号反転を確認。指摘により−MIN_VALUEの永続回帰と%直前空白の検出を補強した。
- 未解決事項: ネスト括弧の%は既存の評価器変換の問題で、計算ブロック・メモ保存にも影響するため[Issue #19](https://github.com/tetsujisugimori-coder/calculator-memo/issues/19)へ別件化。再現/期待/影響と分離理由を記録し、解決済みとは扱わない。実機Safari・OSキーボード/native text zoom・長期保存、依存警告は残る。レイアウト・保存形式・workflow・依存変更なし。
- CI実測: head `9d39a0cd3b18728cbeb36f30a680c16c5ed417be` の[39112512860](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/39112512860)は126単体/lint/型/通常・Pages build/全GUI成功。17:44:41〜17:48:19 JST、Chromium141.0.7390.37/WebKit26.0の6条件78検証、mobile各187tap、エラー0。[58画面・6trace・ログ](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/39112512860/artifacts/12130169627)のZIP SHA256 `e4eee343626b35c104b6d4262024d0d18e6c59a5d7a684bdc1fcb48a0913da71` と配信SHAを照合（7日保持）。sticky全12測定も28px。ローカルはChromium4条件の暫定snapshot操作を確認したが再buildとの同時進行があり最終SHA証明には使用せず、WebKitはlibgtk等の不足で起動未実施。上記Actionsで全6条件を実証した。
- 証拠の補強: 初回WebKitの追加full-page画像にはスクロール位置によりsticky headerが画像途中へ描画された。UI/CSS変更による退行とは断定せず、追加2場面だけ撮影前に上端へ戻しscrollY0と既存header包含検査を行う。既存sticky stressは変更しない。この記録/撮影補強後の最終SHA全CIは[PR #20 Checks](https://github.com/tetsujisugimori-coder/calculator-memo/pull/20/checks)で再確認する。
- 環境と参照: 工程ガイドは参照済み。江戸弁ガイド/辞典の指定Library参照は可視性エラーで本文未確認、作業継続。既存GitHubコネクタで同repo・基点commitを親にする公開を利用し、認証/権限は変更しない。破壊的操作・main push・マージ・公開deployなし。




## 2026-10-18 16:51 (JST): PR17レビュー判定を訂正し可変ヘッダーとsticky位置を同期
- 訂正する判断: 下の初回記録とPR/Issueで721px・文字200%時の重なりを受入外の残件として扱い、採用を推奨したが、基点比較が不足していた。独立再比較により今回導入した退行と確定し、採用推奨を撤回して修正を継続した。
- 比較根拠: 同じCSS-only stressの721/800px・200%・scrollY250で、基点mainはheader下端76px/電卓上端104px（28px間隔）、初回案はheader下端154px/電卓上端104px（50px被覆）。mainのガイド/ブランド上端欠けは別の既存問題であり、新しい電卓被覆を既存扱いできない。
- 変更内容・判断: headerのborder-box実高をResizeObserverでapp-shellのCSS変数に同期し、電卓sticky topを実高+28pxとする。縮小・幅変更・文字サイズ変更にも追従し、cleanupでobserver解除。mobileのstatic配置、計算/保存stateは変更しない。固定幅条件を増やす案やsticky機能の全面解除より、既存挙動を維持する最小限のUI測定を選んだ。
- 回帰検証: 実アプリの721/800/1365px、文字200%→100%、scrollY250と上端復帰をChromium/WebKitハーネスへ追加。テスト専用workspace高2000pxでsticky親終端を分離し、スクロール後の間隔28px±1を検査して縮小追従も保証する。font/fixture/viewportはfinallyで復帰。721px拡大・復帰画像とstickyGeometryを保存。ネイティブ文字ズーム/実機Safariの検証とは区別する。
- 失敗検出: 新回帰を修正前のPages成果物へ実行すると間隔−64pxで失敗し、退行を実際に検出した。先のCSS-only比較50pxとの差は実アプリの書体/line-height等の条件差であり、期待値を緩めて解消しない。
- 検証結果: 追加修正のcloud91単体・lint・型・通常/Pages build成功。実アプリの独立Chromium確認では721/800px・200%のheader168px/電卓top196px、100%復帰時76px/104px、1365px・200%時108px/136pxと、全て28px間隔を確認。375/390への往復でもmobile static・CSS変数の追従・横overflowなし・JSエラー0。Observerのcleanupと計算state非干渉、回帰の縮小追従検査も独立レビューし阻害指摘なし。追加修正前のCI39108553790成功を今回の成功に流用しない。最終SHAの[PR #17 Checks](https://github.com/tetsujisugimori-coder/calculator-memo/pull/17/checks)を別途確認する。
- 追加修正CI: head `8dbb5c935eecb5d0f0a5fef6bfd2df48bb45bacb` の[39109312309](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/39109312309)は91単体・lint・型・両build・GUI全工程成功。Chromium/WebKitの6条件66検証、46画面・6trace、エラー0。WebKitでも721/800px・200%の184px/212px、100%復帰76px/104pxと28px間隔を確認。[成果物](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/39109312309/artifacts/12130405002)のSHA256 `fd6c85aa15b6bd3eff15ec3df1dcf9e304337baa68536e1994a30efd090d917d` と配信SHAを照合（7日保持）。この結果記録コミット自身の最終CIはPR Checksで別途確認する。
- 関連: [Issue #16](https://github.com/tetsujisugimori-coder/calculator-memo/issues/16)、[PR #17](https://github.com/tetsujisugimori-coder/calculator-memo/pull/17)。計算ロジック/保存形式/本番workflowは変更なし。実機Safari、OSキーボード、native text zoom、長期保存の限界は残る。マージはしない。

## 2026-10-18 (JST): 狭幅ヘッダーの数式ガイド折返し・上端欠けを修正
- 変更内容: 固定高のヘッダーをmin-height＋内容に応じた高さへ変更し、操作グループを必要時に次行へ回す。ガイド・テーマの縮小を防ぎラベルを一行保持、実selectを含め44pxの操作高を確保する。375px専用の条件は追加しない。計算・保存ロジックと公開workflowは変更しない。
- 変更理由・再現: PR #15は2026-10-18 16:24:27 JSTにマージ済み、main `8ca5c1031f384794c6d7dc4f4f596707e833fa43` を確認。固定64pxとflex縮小が原因。mainのChromium375pxではガイドが2行、320pxではボタン高84.5px・上端−10.75px。PR15最終[CI39104790329](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/39104790329)のWebKit375px画像でも縦折返し・上端欠けを再確認した。今回は旧結果を修正後の成功として流用しない。
- 検証結果: cloud Node24.19.0で91単体・lint・型検査・通常/Pagesビルド成功。Chromium375px touchを既存5条件へ追加し、ヘッダーの文字実寸・領域包含・非重複・hit-test、ガイド検索/分類/スクロール/閉じる、テーマtap/切替/再読込を回帰化。既存計算・編集・履歴・両メモ検証を保持。ローカルChromium4条件は成功。WebKitはlibgtk-4等のOS依存不足で起動できずGUI未実施、公式--with-depsを利用するActionsで確認した。ローカルのGUIは作業snapshotに対する検証であり、remote SHAの検証と区別する。
- 独立レビュー: ソースとハーネスを別担当が照合。テーマlabelだけでなく実selectの44px高、ヘッダー兄弟非重複を補強。通常320/375/390/721/1365pxと文字拡大150/200%の独立CSS-only補助probeではmobile375/390の横overflowなし。受入範囲の阻害指摘なし。初回CI成果物の12画像（Chromium/WebKit375/390のヘッダー・ガイド、desktop、履歴、両メモ）と全headerGeometryを独立再確認し、欠け・重なり・回帰の阻害指摘なし。最終文書SHAのCIは別途確認する。
- 関連 Issue・PR: [Issue #16](https://github.com/tetsujisugimori-coder/calculator-memo/issues/16)。[PR #17](https://github.com/tetsujisugimori-coder/calculator-memo/pull/17)。
- Actions・画像: head `2a036527544d2574cffa1819c925f102126bd7bd` の[CI39108159477](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/39108159477)で91単体/lint/型/通常・Pages build/全GUI成功。2026-10-18 16:35:33〜16:37:26 JST、Chromium141.0.7390.37/WebKit26.0、6条件・64検証記録・ブラウザエラー0、mobile4条件各132tapのtouchstart実配信を確認。[42枚の画面・6trace・全ログ](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/39108159477/artifacts/12129093330)をダウンロードしSHA256と配信headを照合。375/390pxはheader高113pxに自然伸長し、ガイド一行・上端欠けなし、desktopは76px/3カラムを維持。証拠は7日保持。この記録とREADME補足後の最終SHAは[PR #17 Checks](https://github.com/tetsujisugimori-coder/calculator-memo/pull/17/checks)で別途再確認し、初回成功と混同しない。
- 未解決事項: 実機iPhone Safari、ソフトキーボード、Safari UI、safe-area、回転、長期保存は未検証。独立CSS stressで721px・文字200%時の既存desktop電卓sticky top104pxと増高headerの重なりを確認（通常375/390pxの今回受入とは別、ブラウザの実文字ズーム試験ではない）。既存指数表記チェーン制約・依存警告も対象外。
- 環境・参照: AGENTS/関連docs/README/LOG/workflow/Issue/PRを確認。新しいcloud作業snapshotを全83blobのGit SHA照合で復元した。通常git fetchは権限審査タイムアウトのため成功扱いせず、既存のGitHubコネクタで同repoの読取・基点commitを親にする公開を利用する。認証・権限を変更しない。江戸弁ガイド/辞典本文は今回未参照、作業継続。大規模変更・破壊的操作なし。マージは利用者が判断する。

## 2026-10-18 (JST): モバイル WebKit・タッチ回帰検証を追加
- 変更内容: 既存GUIハーネスをChromium desktop 1365px / narrow 390px / mobile 390pxとWebKit mobile 390/375pxへ拡張。mobileはisMobile/hasTouchを有効化し、ボタン・タブをtap、touchstart実配信と横はみ出しを検査。各scenarioのエンジン・実行条件・時刻・画面・traceを区別して記録する。
- 変更理由: 従来390px検証はマウスclickのChromiumであり、WebKitとtouchを確認できていなかった。基点main `0fe78372917793ffccc755f4ac998e7ce4d62260` はPR #13の05:56:48 UTCマージをAPIで確認した。
- 従来の方針 / 新しい方針: Chromium両幅の回帰を共通期待値のまま維持し、従来狭幅のマウス条件も保持した上でmobile/touchとWebKitを必須追加。check名は既存の必須チェック参照を壊さないため保持。public Pagesのworkflow、アプリ、保存形式、依存lockは変更しない。
- 第一希望 / 制約と採用策: iPhone Safari実機での確認が最終的な補完目標。今回は実端末操作環境がなく、再現可能なLinux Actions上のWebKit mobile/touchを採用する。これは実機検証の代替完了ではなく追加証拠である。
- 検証結果: cloud Node 24.19.0で91単体テスト・lint・型検査・通常/Pagesビルド成功。GUIの正確なSHAとActions結果は下記に記録する。ローカルWebKitは必要OSライブラリ不足を検出し、正規の--with-depsが利用できるActionsを最終検証環境とする。独立レビューで既存狭幅条件保持・失敗scenario状態・モーダル内部はみ出し検査を補強した。最初のローカルnpm ciは既定cache `/home/agent/.npm` が利用できず失敗し、作業可能な一時cacheへ切替えた。セキュリティ制限の解除はしていない。
- 関連 Issue・PR: [Issue #14](https://github.com/tetsujisugimori-coder/calculator-memo/issues/14)。[PR #15](https://github.com/tetsujisugimori-coder/calculator-memo/pull/15)。
- 初回CIの失敗と訂正: [39104018483](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/39104018483)、head `d48a8b45fb0bc905e480904c963b1401f498fa7b` は単体・lint・型・両build・ブラウザインストール・Chromium3条件が成功。WebKit26のmaxTouchPoints=0（coarsePointer=true）をテストが誤って未対応と扱い、アプリ操作前に失敗した。pinned PlaywrightはhasTouchをWebKit touch emulationへ渡していることを確認。maxTouchPointsの値はそのまま記録し、各tapのtouchstart実配信を必須にする検証へ訂正する。アプリの計算・保存期待値は変更しない。再検証は下記のCIで成功した。
- Actions再検証: [39104300480](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/39104300480)、head `79ea3ade4623effabf2d91722f11c3d688c9d1fe`、Node22.13.0 / Playwright1.56.1で91単体テスト・lint・型検査・通常/Pagesビルド・GUI全工程成功。2026-10-18 15:32:40〜15:34:00 JSTにChromium141.0.7390.37とWebKit26.0の5条件、48検証記録、エラー0を確認。3つのmobile条件で各126回のtapとtouchstart配信を確認し、配信SHAも一致。[25枚の画面・5本のtrace・ログ](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/39104300480/artifacts/12127866708)は7日保持。成果物をダウンロードしSHA256とprovenanceを照合した。この記録追記後の最終SHAは[PR #15 Checks](https://github.com/tetsujisugimori-coder/calculator-memo/pull/15/checks)で別途再検証する。
- 未解決事項: iPhone Safari実機、ソフトキーボード、Safari UI、セーフエリア、画面回転、長期保存/プライベートモード。既存の指数表記チェーン制約と依存警告は対象外。

## 2026-10-18 (JST): 計算確定後の編集・エラー復帰を統一
- 変更内容: BS/CE/±とキーボード編集を共通の入力遷移へ接続し、編集後のafterEquals・エラー・旧結果を無効化する。両メモ入口は再計算まで無効。保存形式・評価エンジン・Memo-Nexus連携は変更しない。
- 変更理由: main `53a36d5beda76ad04395091a93c1e982c69dcdf9`（PR #11反映済み）では編集後にafterEqualsが残り、数字再入力や表示と内部状態、メモ作成可否が食い違う。
- 仕様と判断: 従来の元式編集を維持する。12+3=15→BS/CE→4→=16、±→=9。未編集なら+2=17。数字/小数点/左括弧は新規式、再＝は同式評価。エラー後の数字等は新規開始、BS/CE/±/演算子は失敗式を訂正する。
- 設計比較: 第一希望は既存の操作意味を保つ最小修正。boolと既存errorを維持し、純粋な遷移関数で共通化した。全面的な状態機械化は変更範囲が大きく不要、確定数値自体の編集は元式編集の意味を変えるため採用しない。状態種類が増えたとき再検討する。
- 検証結果: 再開後のcloud Node 24.19.0で91単体テスト、lint、型検査、通常/Pagesビルド成功。初回[CI 39098914729](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/39098914729)はhead `7cec8cd982419074da98712f215d65a1642b141d`で全工程成功。2026-10-18 13:59:29〜13:59:46 JST、Playwright 1.56.1 / Chromium 141.0.7390.37で1365/390pxの18検証記録・エラー0、配信SHA一致を確認。[スクリーンショット・trace・診断](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/39098914729/artifacts/12126250194)は7日保持。この記録追記後の最終SHA CIは[PR #13 Checks](https://github.com/tetsujisugimori-coder/calculator-memo/pull/13/checks)で別途確認する。単体は正常/境界/異常遷移、GUI追加は両幅の編集・履歴不変・再計算メモpayload・再入力・エラー復帰を対象とする。独立レビューでGUIセレクタ2種類を実UIに合わせて訂正し、blocking指摘なし。
- 関連 Issue・PR: [Issue #12](https://github.com/tetsujisugimori-coder/calculator-memo/issues/12)、[PR #13](https://github.com/tetsujisugimori-coder/calculator-memo/pull/13)。[Issue #10](https://github.com/tetsujisugimori-coder/calculator-memo/issues/10)はPR #11マージ後の受入確認コメントを追記、closed維持。
- 未解決事項: iPhone Safari実機は未検証。指数表記結果の既存チェーン制約、既存依存警告、保護設定、負の対照CI実験は対象外。対話的Cloud Browserの接続成功とは扱わない。
- 再開時の事実: 前回未公開のローカル作業場所が残っていなかったため、同じmainから仕様に沿って再構築・再検証した。GitHubに同目的PR/branchがないことを確認。

## 2026-10-18 (JST): 末尾数値の符号反転・CE・入力中表示を修正
- 変更内容: 二項減算と単項符号を識別する共通の末尾数値抽出を導入し、±・CE・入力中 LCD に適用した。小数点末尾、％、括弧内数値、URL の空白付き単項負数も扱う。評価エンジン・保存形式・レイアウトは変更しない。
- 変更理由: main `d453a9d4eb3b6f12897b3d83e6cdd5724dbba67f` の既存51テストは成功したが、追加回帰例のうち8件が失敗した。`12-34` の±が `1234`、CE が `12` となる数値結合を防ぐため。
- 比較と判断: 四則演算・履歴・メモは既存テストを保持。入力後状態の問題や小画面の全面変更より、再現済みで小さな共通処理に限定できる末尾数値編集を優先した。従来の正規表現は減算記号を符号として扱っていたが、新処理は直前文脈で二項演算子を保持する。
- 検証結果: cloud Node 24.19.0 のローカルで69単体テスト、lint、型検査が成功。通常/Pagesビルドも成功。初回 [CI 39094065581](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/39094065581) は `ef8a7047da9dae592fb70783f8f1611f75367fef` で全工程成功。Chromium 141.0.7390.37 / Playwright 1.56.1 の1365/390pxで14検証記録・エラー0、両幅のスクリーンショットとtraceを取得し、配信成果物のSHAも一致した（2026-10-18 12:34:56〜12:35:06 JST）。成果物はCI内で7日保持。この結果追記コミットのCIは [PR #11 Checks](https://github.com/tetsujisugimori-coder/calculator-memo/pull/11/checks) で別途確認する。GUI に編集/再入力/小数点/キーボード/連続計算/URL受信/履歴の検証を追加した。
- 関連 Issue・PR: [Issue #10](https://github.com/tetsujisugimori-coder/calculator-memo/issues/10)。[PR #11](https://github.com/tetsujisugimori-coder/calculator-memo/pull/11)。
- 未解決事項: 計算確定後のBS/CE/±で afterEquals が残る別問題は今回変更しない。iPhone Safari 実機操作は未実施。既存の依存警告や保護設定、負の対照CI実験も対象外。
- 第一希望と検証環境: 修正ブランチの実ブラウザ検証を行う。既存の隔離 Actions + Chromium を採用し、対話的Cloud Browserのlocalhost到達やiPhone実機を検証したとは扱わない。

## 2026-10-18 (JST): エージェント開発運用と LOG.md 管理規則を導入
- 変更内容: root `AGENTS.md` を作成し、各 PR のログ更新、記録項目、判断変更と暫定策の区別、最新順、履歴保持、参照リンク、PR 前の更新要否確認、行動規則との役割分離を定義した。GitHub 開発運用と検証方針を docs/agent に作成し、Issue・PR・コメント・レビュー・CI・承認境界・人間のマージ後の整理を明文化した。README と GUI 検証手順から接続した。既存 `Log.md` は `LOG.md` に統一し、旧本文を末尾にそのまま保持した。
- 変更理由: 開発履歴・重要な設計判断を継続して追跡できるようにするための依頼に基づく。履歴と現在有効な規則の混同、および大小文字違いの二重管理を防ぐ。
- 検証結果: 作成前に main `bfd0665d4cde2dd5228a9e8f5f8bea734ac2f49d` と open PR 0 件、既存の文書を確認した。旧本文 20,645 bytes の完全保持と、新規文書リンクの解決を確認した。独立レビューで 8 要件・関連運用規則の整合性を確認し、blocking 指摘はなかった。[初回 CI](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/39092388598) は対象 SHA `d794f32992207588a0b72faa3fe269fbfd7dd329` で成功（単体テスト・lint・型検査・通常/Pages ビルド・1365/390px Chromium GUI）。この結果追記後の最終 SHA の CI は [PR #9 の Checks](https://github.com/tetsujisugimori-coder/calculator-memo/pull/9/checks) で別途確認・報告する。ローカルでアプリテストを再実行したとは扱わない。
- 関連 Issue・PR: [Issue #8](https://github.com/tetsujisugimori-coder/calculator-memo/issues/8)。今回の [PR #9](https://github.com/tetsujisugimori-coder/calculator-memo/pull/9)。基点は [PR #7](https://github.com/tetsujisugimori-coder/calculator-memo/pull/7) のマージコミットであり、その過去の検証結果を今回の検証結果として流用しない。
- 未解決事項: 結果追記コミットの CI 結果は、追記時点では未確認であり PR の Checks と最終報告で確認する。旧記録の全主張・日時を再検証したわけではなく、過去の記載として保持する。main へのマージは人間が判断する。
- 従来の方針: 既存 `Log.md` に日付・目的・変更内容・検証・関連コミットを追記する説明があった。root `AGENTS.md` は存在しなかった。
- 変更理由と新しい方針: 上記依頼に従い、証跡は `LOG.md`、行動規則は `AGENTS.md` 等に分離し、以後の記録を最新順に管理する。
- 第一希望: 日付と判断根拠を確認できる履歴を最新順に追えること。
- 制約と採用策: 既存本文には日時不明の初期記録や当時の状態説明が混在するため、推測で日付付与・再配列を行わず旧本文を一括保持する。これは移行時の保全策であり、新規記録を末尾追記する方針ではない。過去の日時・根拠が確認できた場合は出典を付けて新たな記録で補足する。

## 移行前の記録（2026-10-18 に Log.md から内容を保持）
以下は基点コミットの `Log.md` 全文です。内容・並び順を保存しており、新たな検証済み事実や現行規則として再認定していません。移行元: [Log.md at bfd0665](https://github.com/tetsujisugimori-coder/calculator-memo/blob/bfd0665d4cde2dd5228a9e8f5f8bea734ac2f49d/Log.md)。

# Calculation Memo 開発ログ

このファイルは、Calculation Memoで実施した実装、修正、検証、運用上の判断を記録するためのログです。
新しい変更を行った際は、日付、目的、変更内容、検証結果、関連コミットを追記します。

## 現在の状態

- 本番ブランチ: `main`
- GitHub Pages: https://tetsujisugimori-coder.github.io/calculator-memo/
- 公開方式: GitHub ActionsによるVite静的ビルドのデプロイ
- 自動デプロイ条件: `main`へのpush
- 手動デプロイ: `workflow_dispatch`で実行可能
- データ保存先: ブラウザの`localStorage`
- アプリ構成: 通常電卓、計算履歴、計算メモの3カラム

## 初期実装

### 主な機能

- リアル路線の卓上電卓UIを実装した。
- 計算履歴、電卓本体、計算メモの3カラムレイアウトを実装した。
- 四則演算、括弧、小数、符号反転、パーセント計算に対応した。
- キーボード入力と電卓キー操作に対応した。
- 計算式と結果を確認しながら計算できる液晶表示を実装した。
- 計算結果を履歴へ保存し、電卓への復元、コピー、削除、メモ作成を可能にした。
- タイトル、単位、タグ、前提、関連メモ名を持つ計算メモを実装した。
- KaTeXによる数式表示と数式ガイドを実装した。
- ライト、ダーク、自動のテーマ切り替えを実装した。
- ブラウザの`localStorage`へ履歴、メモ、テーマを保存するようにした。
- PC、狭いPC、スマートフォン向けのレスポンシブ表示を実装した。

### 関連コミット

- `6f69b64` — `Build Calculation Memo web app`

## 依存関係の保守

- `mathjs`のセキュリティ対応を反映した。
- `package.json`と`package-lock.json`の整合性を維持した。

### 関連コミット

- `890f0e9` — `Update mathjs security fix`

## 2026-07-23: 初回レビューで見つかった不具合を修正

### モーダルのEscキー競合

- 計算メモ編集画面の上に数式ガイドを開いた状態でEscを押すと、複数のモーダルが同時に閉じる問題を修正した。
- 最前面のモーダルだけがキーボード入力を処理するよう整理した。
- 背景側の計算メモ編集内容が失われないようにした。
- モーダルごとに一意のタイトルIDを割り当て、`aria-labelledby`との対応を維持した。
- モーダルを閉じた後のフォーカス復帰を整備した。

### 保存データ破損時の保護

- `localStorage`の読み込み結果を、正常、データなし、読み込み失敗に区別した。
- JSON破損と未対応データバージョンを内部で区別した。
- データなしの場合だけ空の初期状態で開始するようにした。
- 読み込み失敗時は自動保存を停止し、壊れたデータを空データで上書きしないようにした。
- 利用者へ読み込み失敗を通知するリカバリーバナーを追加した。
- 元データをコピーして退避できるようにした。
- 明示的な確認後にだけ初期化できるようにした。

### パーセント計算の仕様確定

`%`は、直前の数値を100で割る単項演算として扱う仕様に統一した。

| 式 | 結果 |
| --- | ---: |
| `200 + 10%` | `200.1` |
| `200 - 10%` | `199.9` |
| `200 * 10%` | `20` |
| `200 / 10%` | `2000` |
| `10%` | `0.1` |

表示、計算結果、履歴、コピー結果で同じ解釈を使用する。
実機電卓の「200に10%を加えて220」のような相対パーセント計算は採用していない。

### UIとアクセシビリティ

- 計算履歴パネルと計算メモパネルだけに、日本語UI向けゴシック体のフォントスタックを適用した。
- 電卓本体、液晶、キー、ヘッダー、KaTeX数式の書体は変更していない。
- モバイルタブへ`role="tab"`、`aria-selected`、`aria-controls`を設定した。
- 対応するパネルへタブパネル用のroleとIDを設定した。
- ライトモードとダークモードの既存デザインを維持した。
- 3カラム構成とリアル路線の電卓デザインを維持した。

### README

- スターターテンプレートの説明を、Calculation Memo固有の内容へ更新した。
- 通常電卓、計算履歴、計算メモ、KaTeX表示を説明した。
- `%`の仕様と計算例を記載した。
- `localStorage`の利用と、ブラウザデータ削除時の注意を記載した。
- 開発、テスト、lint、ビルドの実行方法を記載した。
- 関数電卓やデータの書き出し・復元は、実装済み機能ではなく今後の候補として分離した。

### 関連コミット

- `56e05ac` — `Fix modal stacking and protect saved data`

## 2026-07-23: GitHub Pages向けの静的ビルドを追加

### 原因

GitHub Pagesがブランチ直下を公開する旧方式になっており、アプリではなくREADMEを基にしたページが表示されていた。
既存の`vinext build`はCloudflare Worker向けの出力であり、GitHub Pagesが必要とする静的な`index.html`を生成しない構成だった。

### 実施内容

- GitHub Pages専用のVite設定`vite.pages.config.ts`を追加した。
- GitHub Pagesのリポジトリ配下でアセットを解決するため、`base`を`/calculator-memo/`に設定した。
- `github-pages/index.html`と`github-pages/main.tsx`を静的SPAのエントリとして追加した。
- 既存の`CalculatorApp`、KaTeX CSS、アプリ共通CSSをPages版でも再利用した。
- Pages版でNext.jsのフォント変数が未定義にならないよう、ローカルフォントのフォールバックを追加した。
- Pages用ビルドコマンド`npm run build:pages`を追加した。
- Pages用出力先を`dist-pages`とし、Gitおよびlintの対象外にした。
- GitHub公式のPages Actionsを利用するデプロイワークフローを追加した。
- `npm ci`で依存関係を導入し、`dist-pages`をartifactとしてデプロイする構成にした。
- Pagesのbuildジョブとdeployジョブを分離し、必要最小限の権限を設定した。
- 同時デプロイの競合を防ぐ`concurrency`設定を追加した。

### 関連コミット

- `7992e77` — `feat: deploy calculator app to GitHub Pages`

### 検証

- `npm run build:pages`: 成功
- `dist-pages/index.html`: 生成確認
- HTML、CSS、JavaScript、KaTeXフォントの参照先が`/calculator-memo/`配下になることを確認
- ビルド成果物内の参照アセット62件について、欠落がないことを確認
- 既存の`npm run build`: 成功
- ローカルブラウザでCalculator Memoが表示されることを確認
- `200 + 10% = 200.1`の計算と履歴追加を確認
- 計算メモ編集画面の表示を確認

## 2026-07-23: GitHub Pagesのデプロイ運用を整備

### 実施内容

- GitHub Pagesの自動デプロイ対象を`main`へのpushだけに限定した。
- GitHub Actions画面からの手動実行用に`workflow_dispatch`を維持した。
- 作業ブランチへのpushやPull Requestの作成・更新だけでは、本番サイトが更新されない構成にした。
- 最初のリモート`main`を、既存履歴の`890f0e9`からforce pushなしで作成した。
- GitHub Pages対応をPull Request経由で`main`へマージした。
- ローカル`main`を`origin/main`へfast-forwardで更新した。

### 関連コミット

- `f356eda` — `ci: deploy GitHub Pages from main only`
- `dfc1d26` — Pull Request #2のマージコミット

### 運用確認

- `main`へのpushを契機に`Deploy GitHub Pages`が起動することを確認した。
- GitHub PagesでCalculator Memo本体が表示されることを確認した。
- 公開画面で電卓、計算履歴、計算メモ、テーマ選択が表示されることを確認した。
- 公開画面のブラウザコンソールに警告・エラーがないことを確認した。

## 2026-07-23: GitHub ActionsをNode.js 24対応版へ更新

### 実施内容

- `actions/configure-pages`を`v5`から`v6`へ更新した。
- `actions/upload-pages-artifact`を`v4`から`v5`へ更新した。
- `actions/deploy-pages`を`v4`から`v5`へ更新した。
- GitHub公式の安定版を使用し、JavaScript Actionの実行ランタイムをNode.js 24対応へ移行した。
- 警告を隠すための`FORCE_JAVASCRIPT_ACTIONS_TO_NODE24`は追加していない。
- アプリ本体、ビルド設定、`main`限定のデプロイ条件、Pages環境設定は変更していない。

### マージとローカル更新

- Pull Request #3を`main`へマージした。
- マージコミットは`defaab544f8f48efec0584a92269bd97b442f748`。
- ローカル`main`を`dfc1d26fb8ee28c5b99927a9e93acba79610908c`からマージコミットへfast-forwardで更新した。
- 更新後の`HEAD`、ローカル`main`、`origin/main`が同じマージコミットを指すことを確認した。
- マージされた差分が`.github/workflows/deploy-pages.yml`と`Log.md`だけであり、アプリ本体やビルド設定などに想定外の変更がないことを確認した。

### GitHub Actionsと公開確認

- `main`へのpushを契機に`Deploy GitHub Pages`が実行された。
- 対象コミットが`defaab544f8f48efec0584a92269bd97b442f748`であることを確認した。
- buildジョブ、deployジョブ、ワークフロー全体、Pages deploymentはいずれも成功した。
- 実行ログで`actions/configure-pages@v6`、`actions/upload-pages-artifact@v5`、`actions/deploy-pages@v5`が使用されたことを確認した。
- 以前表示されていたNode.js 20廃止警告が解消されたことを確認した。
- 公開URLでCalculator Memoが正常に読み込まれることを確認した。
- 電卓、計算履歴、計算メモ、テーマ選択、3カラムレイアウトが表示され、明らかな崩れや横方向のオーバーフローがないことを確認した。
- JavaScriptとCSSが`/calculator-memo/assets/`配下から読み込まれ、ブラウザコンソールに警告やエラーがないことを確認した。

### 残存する警告

Node.js 20廃止警告とジョブエラーは解消したが、Actionsログには次の非致命的な警告が残っている。

- `@esbuild-kit/esm-loader`と`@esbuild-kit/core-utils`のdeprecated警告
- Viteが出力するJavaScriptチャンクサイズ警告
- `actions/deploy-pages@v5`の実行時に出力されるNode.jsの`punycode`モジュール非推奨警告

これらは今回のbuild、deploy、公開画面の動作を失敗させていない。依存関係や公式Action側の更新状況を確認しながら、必要に応じて別の保守作業として対応する。

### 関連情報

- `7b502f5` — `ci: update GitHub Pages actions to Node.js 24`
- `defaab5` — Pull Request #3のマージコミット
- Pull Request #3: https://github.com/tetsujisugimori-coder/calculator-memo/pull/3
- Actions実行: https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/29969668264
- 公開URL: https://tetsujisugimori-coder.github.io/calculator-memo/

## テストと検証の記録

現在の自動テストは次の3ファイルで構成されている。

- `tests/calculator.test.ts`
- `tests/format-copy.test.ts`
- `tests/storage.test.ts`

直近の検証結果:

- Vitest: 3ファイル、33テスト成功
- ESLint: 成功
- TypeScript型チェック: 成功
- vinextビルド: 成功
- GitHub Pages用Viteビルド: 成功
- GitHub Pages公開画面: 表示確認済み

## 保留中・今後の候補

### 機能候補

- 関数電卓
- 計算履歴、計算メモのドロワー化を含む将来レイアウト
- JSONなどによるデータの書き出し・復元
- iCloudやOneDriveなどとの同期

これらは現時点では確定機能ではない。

### 技術上の注意

- Pages用JavaScriptには500KBを超えるチャンク警告がある。現在は動作上の問題になっていないため、公開対応と分離して検討する。
- `localStorage`を削除すると、保存した履歴やメモが失われる可能性がある。
- GitHub Pagesの本番デプロイは`main`へのpushでのみ自動実行する。

## 今後の追記形式

```md
## YYYY-MM-DD: 変更の概要

### 目的

- 変更が必要になった理由

### 実施内容

- 変更した内容

### 検証

- 実行したコマンドと結果

### 関連情報

- コミットID、Pull Request、Issue、公開URLなど

### 残件

- 未完了または次回検討する内容
```

## 2026-07-23: プレーン計算メモへ数式・計算ブロックを追加

### 目的

- 通常の文章、表示専用数式、評価可能な計算式を1つの計算メモ内で混在できるようにする。
- 複数の式や途中計算を、順序を保ったまま編集・保存・再表示できるようにする。
- PR #4で追加したMarkdown／KaTeX本文と既存保存データの互換性を維持する。

### 実施内容

- プレーン計算メモへ、文章、数式、計算の3種類の本文ブロックを追加した。
- 文章ブロックはMarkdown入力とプレビューを使用する。
- 数式ブロックは既存KaTeXレンダラーを再利用し、計算結果を生成しない表示専用ブロックとした。
- 計算ブロックは通常電卓と同じ計算エンジンを使用し、入力時に式、表示式、結果、エラーをブロック単位で更新する。
- 不正な計算式を含むブロックも保存可能とし、他の正常な文章・数式・計算ブロックへ影響しない構造にした。
- 各ブロックの追加、編集、削除、上移動、下移動に対応した。
- ブロックの種類、内容、順序、計算結果、エラーを`blocks`配列へ保存するようにした。
- Markdown互換の`content`を引き続き保存し、ブロック導入前のプレーン計算メモは既存本文を1つの文章ブロックとして編集できるようにした。
- 読み込んだ`blocks`が部分的に壊れている場合は採用せず、既存`content`へフォールバックするようにした。
- 数式ガイドへ「数式ブロック」と「計算ブロック」を追加し、入力例、実表示、用途、利用可能な演算、非対応記法を記載した。
- PCとモバイル向けにブロック編集、操作ボタン、ガイド例のレスポンシブ表示を追加した。

### 検証

- `npm test`: 4ファイル、43テスト成功
- `npm run lint`: 成功
- `npx tsc --noEmit`: 成功
- `npm run build`: 成功
- `npm run build:pages`: 成功（既存のJavaScriptチャンクサイズ警告のみ）
- 文章1件、数式2件、計算2件を1つのメモへ追加し、削除と上下移動を確認した。
- `200*(5%+5%) = 20`と不正式`2+`を同時に保存し、正常結果と局所エラーが互いに影響しないことを確認した。
- 保存後の再読み込みで、数式ブロック2件、計算ブロック2件、順序、結果、エラーが復元されることを確認した。
- 旧形式のMarkdown本文を文章ブロックへ変換するテストと、不正な任意ブロック配列から既存本文へフォールバックするテストを追加した。
- 390px幅でモーダルの横あふれがなく、追加ボタン44px、並べ替え・削除ボタン40pxの高さを確認した。
- 数式ガイドの両ブロック例がPCと390px幅で表示されることを確認した。
- ブラウザのエラーオーバーレイとコンソールエラーがないことを確認した。

### 関連情報

- Pull Request #4: https://github.com/tetsujisugimori-coder/calculator-memo/pull/4
- 本変更はPR #4の既存作業ブランチへ追加コミットとして反映する。

### 残件

- ドラッグ＆ドロップによる並べ替えは未実装。現在はキーボード操作可能な上移動・下移動ボタンを使用する。
- Memo Nexusとの直接連携、共通パッケージ化、表・画像・Mermaid対応は別作業とする。

## 2026-07-23: 計算メモ種別の表示名と新規作成動線を整理

### 目的

- 複数ブロック型を正式な「計算メモ」とし、「計算メモ」を選ぶと複数の計算式を追加できる状態にする。
- 従来の単一式型は、1つの電卓結果を保存する機能だと分かる「単独計算メモ」へ表示名を変更する。
- データ移行を行わず、既存のtype値と保存データを維持する。

### 新旧メモ種別の対応

| 保存上のtype | 以前の表示名 | 新しい表示名 | 用途 |
| --- | --- | --- | --- |
| `plain-calculation` | プレーン計算メモ | 計算メモ | 文章・数式・計算ブロックを複数保持 |
| `calculation` | 計算メモ | 単独計算メモ | 電卓の1つの式と結果を保持 |

### 実施内容

- メモ種別の表示名を共通定義へ集約した。
- 新規作成メニューの先頭へ「計算メモ」を配置し、計算結果の有無にかかわらずブロックエディタを開けるようにした。
- 「単独計算メモ」は電卓で結果を確定した場合だけ作成可能とした。
- 電卓内の作成ボタンと計算履歴のメモ作成ボタンを「単独計算メモ」へ変更した。
- 編集モーダル、メモ一覧の種別バッジ、詳細表示の種別バッジ、保存・更新通知を新しい名称へ統一した。
- 空状態で、計算メモは複数ブロック型、単独計算メモは電卓結果用であることを説明した。
- 数式ガイドで、数式ブロックと計算ブロックが「計算メモ」で使用できることを明記した。
- READMEの機能説明と保存typeの対応関係を更新した。

### 互換性

- `type: "plain-calculation"`と`type: "calculation"`は変更していない。
- トップレベルの保存データバージョン`1`、既存フィールド、ブロック構造も変更していない。
- 今回の変更に伴うデータ移行は行わない。

### 検証

- `npm run lint`: 成功
- `npx tsc --noEmit`: 成功
- `npm test`: 5ファイル、45テスト成功
- `npm run build`: 成功（既存のチャンクサイズ警告のみ）
- `npm run build:pages`: 成功（既存のチャンクサイズ警告のみ）
- 新規作成メニューの「計算メモ」からブロックエディタが開くことを確認した。
- 文章1件、数式1件、計算2件を混在させ、`2+3 = 5`と`10*4 = 40`を保存できることを確認した。
- 再読み込み後も両メモ種別、ブロックの種類・順序・内容・計算結果が復元されることを確認した。
- 従来型の`8*7 = 56`を「単独計算メモ」として作成し、編集・保存・再読み込みできることを確認した。
- カード、詳細、編集モーダル、通知、空状態、数式ガイドの表示名が一致することを確認した。
- ブラウザのエラーオーバーレイとコンソールエラーがないことを確認した。

### 関連情報

- Pull Request #4: https://github.com/tetsujisugimori-coder/calculator-memo/pull/4

## 2026-07-25: Memo Nexusからの計算式受け取り

- URLの`expr`クエリパラメータを`URLSearchParams`で読み取り、初回表示時に既存の計算式stateへ設定する一方向連携を追加した。
- 受け取った式は自動計算せず、結果と履歴も作らない。日本語や未対応記号を含む値も文字列として表示し、既存の計算操作時に従来のエラー処理へ渡す。
- 極端に長い値は2,000文字へ制限し、URL読取処理を`lib/url-expression.ts`へ分離した。
- `npm test`は既存回帰を含む全51件、`npm run lint`、`npx tsc --noEmit`、`npm run build:pages`、`git diff --check`が成功した。Pagesビルドには既存のチャンクサイズ警告だけが出た。
- ブラウザで`expr=2 * (5 + 3)`が入力中の式として表示され、起動直後は結果`0`のまま履歴を追加せず、「=」を押すと既存仕様どおり`16`になること、ダークテーマでの表示、コンソールerror 0件を確認した。接続ブラウザの幅変更が反映されず実画面での3幅比較は未実施。
- 実装時の独立レビューで旧変数の消費側/生成元モード不整合を指摘され、両方note-variables必須の判定と負例回帰で解消。分析例外時も既存比較を保持し、不完全Markdownは停止する回帰を追加。未知付随情報は全体警告と件数を区別した。独立再確認71件（モデル39/Markdown6/UI26）とCI契約28件成功、未解消阻害なし。
- 全体単体1043件/45ファイル、lint（既存aria-description警告1、error0）、型検査成功。通常/Pagesビルドは初期実装で成功し、最終修正は正式CIでも確認する。GUIは実行中。実生成例 docs/examples/saved-record-impact.md はID参照A100→120/B150→170/C300→340を入力して生成し、手書きの推定履歴ではない。
- Git CLI push dry-runは認証資格情報がないため未送信。認証済みGitHub connectorで同じ変更treeを公開し、取得し直してtree/SHAを照合する。権限や認証設定を変更しない。
- GUI予備実行: Chromium375pxは96検査/87幅/799タッチ成功。desktopは既存の非同期保存pollが保存前のundefinedへアクセスして即時失敗。期待値・待機時間を変えずoptional-chainで再試行可能にした。最終モデルを再ビルドし全6条件を再実行する。
- 正式CI初回（HEAD76951047fd9dc572172e39c0733902e9b0e39f19、run39749464226）は全工程成功。成果物を読戻し、HEAD/SHA256一致、Chromium/WebKit全6条件576検査・526横幅チェック・モバイル各799タップ、PNG114枚・成功trace0を実測確認した。1043単体/28契約、lint/型/両ビルド成功。最終記録コミットのCIとReady切替時CIはPRで追跡する。
- ローカルWebKit26は標準OSライブラリ不足のため、公式Debian署名/パッケージhashを確認し一時ディレクトリへ展開したライブラリと一時起動アダプタで実行。システム導入/セキュリティ設定/CI設定変更なし。実iPhone Safari/VoiceOverは未検証。参考画面は別途合成データで取得し、正式CIの画像予算とは分離した。

### 2026-10-25 13:07 JST: 根拠点検 CI 初回の失敗を保存

- PR #85 / HEAD `9abf8f6a6a5d357dc0b09e9a387c57a8534647b9` / run `40159030869` は約21分で GUI 失敗。30分上限ではなく、Chromium 4条件と WebKit 375px は成功、WebKit 390px の既存挿入拒否検査が失敗した。
- 失敗 trace の実際の表示は「コード・数式ブロック内へは引用を挿入できません」で、安全側の拒否。期待した差分内の文章位置とは異なる位置の捕捉が疑われる。trace の本文を抽出し、指定 UTF-16 4432..4434 を純粋挿入処理へ渡す独立再現では「比較差分…」拒否になる。現時点で製品 parser の退行とは断定しない。
- GUI に本文反映確認、選択設定直後と引用ダイアログ開始直後の選択読戻しを追加し、位置不一致をその場で診断する。拒否文言の OR 化、検査削減、時間上限延長、成功扱いはしない。再実行結果は最終 HEAD の PR / CI 記録へ追記する。
- 失敗 artifact ZIP SHA-256 `d1c22394f956e6b6faca8de5768f8f2d6c94d6293042b7054695e53a6c4765ed` を取得ファイルで照合済み。PNG 101・失敗 trace 1。成功時 trace 抑制は維持。
