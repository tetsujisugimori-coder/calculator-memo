# 独立レビュー（作業中）

対象：Issue #100、基点 `cd8d69039578965c963ffc0f1b1d31eb7174f61f` からの前後ナビゲーション差分。実装担当とは別担当がソースを読み、独自fixture/テスト/実ブラウザ操作で確認した。最終HEAD/CIはまだ未確定で、本記録は最終版PASSを先取りしない。

## 設計・コード確認
既存 parseReportAudit/assessReportAudit の一覧とoccurrence keyを再利用。indexは導出のみ、保存状態・parser・独自判定の追加なし。共通Modalを維持して項目内容だけkeyで破棄するため異種項目でも前後ボタンDOMとfocusを維持する。DifferenceSourceDialogのembeddedは点検だけで使用し、既存単独利用のModalを残す。

実装前/途中に指摘した注意点：休止中の親/詳細Modalのfocus順、contextRevision相違やstale後の旧選択復活禁止、同値storage通知、aria-disabledのhandler拒否、filter除外時の消失openerからのfocus退避。位置表示の独立span、目視選択outlineも確認した。これらは現時点の差分と下記試験で確認できた範囲に限る。

## 独自単体 4 件
`tests/audit-item-navigation-independent.test.ts` を独立担当が作成・実行。2026-10-28 16:37:55 JST、Vitest 3.2.4、4 pass / 0 fail。
- quote → difference → quote で同じnext DOM/focus、端操作は非循環。
- savingガード中は両方向停止、解除後に継続。
- 同値storage通知後は位置/詳細消失、通常rerenderでも復活せず、明示再照合でも旧選択を復元しない。
- filter除外後は残るaudit内のconnected controlへfocus。
- 前後移動中はStorage getItem/setItemとも追加0、本文移動callback呼出0。

これは新機能確認であり、既存不具合のRED→GREEN再現とは称さない。

## 独立実GUI
2026-10-28 16:39 JST、別合成fixture、独立scriptで実CalculatorAppを操作。Chromium 141.0.7390.37、375×667 CSS px / DPR2 / mobile+touch。マウス代用ではなくtap、Enter/Spaceを使用。
- 異種3出現の前後、next DOM同一、端Enter非循環、focus保持。
- Spaceによる本文移動後に「点検へ戻る」で3件目と本文移動ボタンfocusへ復帰。
- light/dark、root CSS font-size 200%の横幅確認。PNG2枚を目視し、文字折返し、項目位置、前後操作と戻り先statusを確認。
- 保存JSON bytes同一、pageerror 0。独立script内8チェック成功。

最初の試行は他shell終了で共有dev serverが停止し、page.goto connection refused。別port4392でserver起動→script→停止を同shell内管理して完了した。これは製品不具合の修正ではなく実行環境の修正。

## 限界・残る確認
現時点は作業ツリーの局所レビュー。最終HEADの正式6条件・CI成果物は別途照合が必要。ローカルChromiumの成功をWebKitや実機Safariへ転用しない。実機iPhone Safari、VoiceOver、OS文字拡大、既存WebKit時間変動の根本原因は未検証/未解決。

2026-10-28 16:40 JST

局所レビュー時点の阻害指摘：0件。最終CI未確認という受入未完了事項は残る。確認した製品ファイルSHA-256：
- `components/FormulaReportAudit.tsx`: `b22a7034a13bffe8bf6eb5e79818fab6a4eed3bd7ca02b8513f0de2ed40e3d0e`
- `components/FormulaDifferenceSources.tsx`: `8af001006506cc98bb231b0c7a3716c0403fa67861029600748815357e8ea66b`
- 独立単体: `a9fef163319a26110da4be4a00e77e379a8ce5bd1fe2466afcfcd87bbeb76db3`

2026-10-28 16:41 JST

`independent/browser-probe.mjs.txt` と `fixture.json` は上記実行で使用した独自script/合成入力の証跡。scriptのabsolute path/loopback portは当時のローカル環境を記録しており、正式CIのportable testを置換しない。再現時はPlaywright/browser/fixtureパスと専用serverの起動を実環境に合わせる。

2026-10-28 16:42 JST

公開記録では受入検証に不要な私有絶対パスを伏せています。元の実行結果・期待値・成否は変更していません。

2026-10-28 16:47 JST

## 初回正式CI失敗を受けた訂正と回帰修正

旧判断：局所20試験/独立GUI範囲では阻害0としたが、既存固定比較資料の保存通知後の明示再選択を局所試験では網羅していなかった。最終候補 `e8e096b67bddf2469e85ec374715ec81ed35fefb` の正式CI `40653849236` は既存 `audit-comparison-navigation.mjs:88` で6条件とも失敗。旧判断を全受入PASSに拡大しない。

独立診断：新規根拠項目用の `stale || staleRef.current` ガードを共通 `suspendNavigation` に置いたため、固定A/B比較資料の「保存通知後に現在保持本文の資料を明示的に選び直し、厳密な一意範囲へ移動する」既存契約まで拒否した。Modalのfocus問題ではない。

独立回帰2件（変更/削除通知）を追加し、修正前にcallback期待 `[8,341]` が呼出0回で失敗（元4件は成功）を実証。17:17:37 JST、`independent/regression-red.log`。共通入口は保存中ガードを保ち、失効ガードを新規根拠項目専用wrapperに限定する修正をコード確認。固定資料側の既存context/epoch/明示再選択、fresh完全範囲・report/formula照合、共通captureは不変更。

同じ期待値で修正後独立6件＋追加integration13件＋実App3件、計22件成功（17:18:21 JST、`independent/regression-green.log`）。新規根拠項目の同値通知/ABA失効停止を維持し、固定資料の明示再選択だけを従来契約へ戻す。新機能REDとは別の、今回導入した回帰に対するRED→GREENである。修正版最終HEADの正式CI/成果物はなお確認待ち。

2026-10-28 17:18 JST
