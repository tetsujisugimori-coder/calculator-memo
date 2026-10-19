# Calculator Memo 開発履歴・設計判断

このファイルは開発履歴と重要な設計判断の正本（作業の証跡）です。現在有効な行動規則は [AGENTS.md](AGENTS.md) と関連設定・運用手順を参照してください。新しい記録はこの説明の直後へ追加します。旧記録に含まれる「現在」や追記形式は当時の内容であり、現行規則ではありません。


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
