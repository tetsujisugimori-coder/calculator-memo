# PR #87 保持本文の一致未確認：再現・修正・再検証

## 対象と原因

2026-10-25 JST、修正前 HEAD `ad15bfffe5104779cda707c36fa2ae75926c6233`、main `9c1cbd2c77131e9d717b6206ac54c7a6c389d235`。PR #87 は既存 Draft のまま更新する。

CalculatorApp は別タブの storage 通知後、旧 data と confirmedSerialized を保持して上書きを停止する。旧試験は report props を直接差し替えたため、実経路で Modal の conflict が変わらず Markdown が「現在表示中の保存済み本文」と誤表示する問題を検出できなかった。前回の「外部変更・削除後も対応済み」という記録は、この実経路を含む保証ではなかったと訂正する。

## 再現と採用方法

- 修正前：実 CalculatorApp ツリーを使った storage 変更・削除2件が失敗（jsdom）。
- 修正前実ブラウザ：旧 HEAD を別ディレクトリへ展開して Pages build、Chromium 141 / 375px、同 browser context の別ページから合成保存データを変更・削除。両方で旧本文を現在の保存済み本文と表記する誤りを再現。
- 第一希望を採用：既存親保存保護を明示 prop で伝播し、既存 storage 通知で本文一致未確認を保持。出典再照合では解除しない。描画前の通知と非同期コピーは同期ref/epochで保護。
- 次善策：追加取得して現在の保存本文と比較する方式は、出力時の暗黙取得禁止と編集基準の複雑化を避け不採用。
- 保存領域更新だけでは対象レポートの変更・削除は断定しない。画面に保持した本文、編集基準との差分、現在の保存本文との一致未確認、出典照合を別々に記載する。

## ローカル検証

- Node 24.22.1。全単体 **1766件 / 73ファイル成功、失敗0、skip0**。今回追加10件（実アプリ統合8、親保護変更時の遅延コピー2）。既存1756件を維持。
- 関連試験57件成功。本文変更・削除／無関係更新、未編集／編集中、明示再照合、点検とレポートの閉鎖・再表示、描画前通知→コピー、遅延成功／失敗、copyとdownload同等性を検証。
- snapshot・保存原本・確認履歴付き合成fixtureで非変更を確認。出力時の storage read/write 0。
- lint、型検査、通常build、Pages build成功。既存の大きなbundle警告は維持。
- CI契約は37件。6条件の各6チェック追加だけを反映し合計810チェックへ更新。既存 geometry562、mobile touch991、PNG114枚、成功時trace0、30分上限は変更しない。

## 実ブラウザ（ローカル）

- Chromium 141 / touch 375px・390px：今回追加6チェックずつ完走、pageerror0。変更・削除・編集中・無関係変更、copy/download内容一致、原本非変更、明示再照合・再表示、遅延失敗の旧全文欄抑止、両テーマCSS文字200%、横はみ出し・キーボードEscape・フォーカス復帰を確認。
- WebKit 26.5 / 375px・390px：新規6assertionは通過したが、後処理の別ページcloseが停止。Playwright 1.56.1の固定WebKit 26.0とは異なる組合せであり、原因は未確定。**ローカルWebKit完走成功とは扱わない**。正式CIの固定版を別に検証する。
- ローカルfocused実行は全6条件の完走ではない。最終HEADの実CIで既存全条件と追加条件を確認し、SHA/run/attempt/artifact digestをPR本文へ追記する。ここでは未実行の最終CIを成功としない。

## 独立再レビューと残余

実装担当とは別agentがソースとjsdomを独立点検し、関連57件、独自3件を実行して成功。独自試験は描画前storage通知、Library未mount時の更新→元bytes復帰、storage通知なし親保護変化の遅延完了。P0〜P3新規指摘なし。初回のResizeObserver未定義は独立試験fixture不足として補完し、製品不具合と区別した。

保存schema/version/容量・計算engine・確認条件・挿入/取消・上書き停止を変更しない。外部本文を手元へ自動反映せず、保存・再計算・明示確認も追加しない。

実機iPhone Safari、VoiceOver、OS文字拡大、ブラウザズーム、OSソフトキーボードは未検証。CSS文字200%・WebKitエミュレーションと区別する。PR #85初回CIの選択位置ずれは原因未特定のままで今回の成功では解決と扱わない。開始済みOS clipboard書込みの取消・OSファイル保存完了・任意外部writerとの原子的整合性は保証しない。

## 最終CI中の既存選択位置ずれ再発と追加切分け

HEAD `9d3a16c133bbbc871f04d320c62f8c5619dab37d`、run `40182162352` attempt1は全体30分付近で取消。新storage検査は全6条件で通過し、4Chromium＋WebKit375は完了、WebKit390は後続既存比較UIで未完了。ZIP12594714848 SHA-256 `08f67eea3727b8bd1cb4fd869cf27ed32d202323eeb0e0eaaafaeae6b18d6335` 一致。同一SHA・設定不変更のattempt2は5条件完了、WebKit390の既存引用picker選択保護で失敗。期待 `[4432,4434]` に対し `[6525,6525]`。ZIP12596012303 SHA-256 `3e9c2a49ab7d4603a6c7fd0a867513cd05ddff34421e99e256c5c014cd8d889f` 一致。両結果を成功で上書きしない。

既存traceでは選択設定直後の確認は成功、次のtap後に変化。本文のUTF-16長は8425で、6525は末尾ではなく直前の差分挿入caretと完全一致した。新storage helper実行前の既存経路であり、保存本文一致P2と分離する。

追加の局所ブラウザ観測（製品コード不変更）では、RAF schedule/fire、setSelectionRangeスタック、選択・focus・pointer/touch/clickの順序を記録。Chromium141/390とWebKit26.5/390の自然tap各10回は選択保持。ただしWebKitでは差分挿入後RAFが後続本文編集済み（長8378）にも旧caret6525を設定する事実を観測した。

同じ旧buildで当該callbackだけを保留し、保護選択後に解放すると、時刻29926msに `[4432,4434]`→`[6525,6525]`、pointerdown29948ms、click29954ms、picker focus29959msの順となり、CIと同値の失敗を因果再現した。この局所再現ではModal focus／native tapより前に旧RAFが上書きしている。固定CI26.0と局所26.5は区別し、歴史的な#85初回CIの全原因を断定しない。

第一希望／追加採用は挿入後の遅延caret処理だけを取消可能にし、世代と本文同一性を確認する最小修正。入力・選択・次操作・storage更新・unmountで古い要求を失効させる。引用／差分の挿入内容、保護範囲、確認条件、安全取消契約は変更しない。次善策の待ち時間追加、選択期待値緩和、試験削減、上限延長は不採用。cancel済みcallbackを強制実行しても新しい意図を上書きしない6件を修正前赤で確認し、正規挿入caretの正対照2件を保持する。

追加caret修正の独立再レビューはP0〜P3新規指摘なし。関連81件と独立3件（cancelAnimationFrameをno-op化してstorage通知／input単独／unmount後にcallbackを強制実行）が成功、保存不変・古いfocus/selection復活なし。全単体1774件/73files、lint・型・通常/Pages build成功。並列browser probe中のCI契約では既存100ms合成timeoutが子プロセスの予定出力より先にTERMとなる1件失敗を観測。期待値・上限を変更せず、負荷終了後に同じ契約を再検証する。

修正後の同じ局所WebKit26.5/390 heldRAF実験は10/10選択保持・errors0。旧callback強制解放の直前37157msと直後37158msはいずれも4432..4434でsetter実行なし、tap後も同値。旧build赤→修正build緑を同じ選択期待で確認した。Chromium対照の全quote局所フローは、選択試験に到達する前の既存両テーマ200% geometry検査（scroll401/client388）で失敗し、選択修正成功とは扱わない。この独立観測も隠さず保持し、正式CIで全条件を再検証する。

独立再レビューでP3を追加再現：挿入RAF保留中に親ヘッダー×から破棄確認を開くと、旧callbackが本文へfocusを奪い戻した。共通close入口の取消で最小修正し、同じ独立試験で赤→緑。保存/破棄の判断は不変更。独立4件、引用/差分UI58件が全成功、P0〜P3残件なし（ソース/jsdom範囲）。追加caret回帰は計9件になった。

最小Chromium141/390対照（無関係なsource-audit geometryフローを除いた別診断script、正式受入試験は変更なし）も10/10選択保持・errors0。held callback前5687.10ms→後5687.20msで4432..4434不変、tap後も同値。新WebKit/Chromiumの局所GUIはclose入口追加前のbuildであり、close差分自体は独立jsdom再現で確認した。ブラウザprobe停止後に同一CI契約37件を再実行して全成功。先の負荷時1件失敗は履歴に保持する。

最終全単体の一度目は1775件中、既存「変更後原本の999を混ぜない」試験が1件失敗。実際の保存snapshotは旧値のままだが生成されたランダムUUIDに `999c` が含まれ、全文の禁止sentinel検査へ衝突していた。該当合成fixtureのみUUID/出力時刻を固定し、元の `not.toContain('999')` 期待値は維持する。製品ID生成や判定は変更しない。失敗ログは保持し、独立レビュー後に全単体を再実行する。

最終ローカル再実行は全単体1775件/73files成功（今回storage10＋caret9の計19件追加、既存1756件保持）、失敗0・skip0。lint・型・通常build・Pages build成功。fixture決定化は独立レビューで期待値緩和なしと確認済み。最終commitの実CIはこの文書に結果を先取りせず、PR本文で正確なSHA/run/attemptと成果物を照合する。
