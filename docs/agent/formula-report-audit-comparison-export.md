# 固定点検記録の2時点比較結果の独立Markdown出力

## 着手調査と設計（2026-10-26 JST、Issue #92）
PR #91 は 2026-10-25 23:06:50 UTC にマージ済み。最新 main `2a91599fa8454e097d2eca3a5d552f115da68819` を fetch/API で確認した。既存 comparison worktree は clean のまま保持し、別 worktree / `feat/audit-comparison-markdown-export` で作業する。open Issue/PR と直近 closed の関連履歴に同目的の実装がないことを確認し、実作成された [Issue #92](https://github.com/tetsujisugimori-coder/calculator-memo/issues/92) を使用する。

固定記録の scanner は v1/v2 の厳密な領域・識別情報を検証する。v1 は比較構造化資料がないためUIで選択不可であり、出力を理由に本文を推測解析しない。v2 の comparison は引用時固定 snapshot と点検時取得原本を独立保持する。比較処理は安定ID・種別・出典側で対応付け、取得成功と比較可能性と一致を区別している。出力はこの結果をそのまま受け取る。

## 第一希望・次善策
第一希望の副作用のない Markdown builder を採用する。UIの結果と同じ metadata / result / 世代を捕捉し、既存 reportCode / reportLines / downloadMarkdownReport を再利用する。比較・取得・計算・保存を行う処理は呼ばない。状態ラベルもUIと共用する。

次善策の出力時再比較・再取得は、一見最新化できてもプレビューと異なる世代を持ち込み、利用者の明示操作と保存保護を崩すため不採用。新しい永続領域や保存schema追加も不要。将来の本文挿入は別機能であり、今回の出力から自動挿入しない。

## 表現と保証境界
A→Bの明示方向、生成日時と記録内TZ、出力日時、原本取得/試行日時を別に示す。総合/項目別状態、制約、固定引用/比較差分とstable ID、式/モード/実使用入力/参照元/参照先/内部値/表示値を区別する。引用時snapshot同士と点検時取得原本同士の比較を混同しない。情報不足は不足のまま示し、丸め値や現在の保存状態から復元しない。

日時だけの差は既存仕様どおり計算根拠差へ格上げしない。正常取得でも両側0件は理由付き比較不能。片側0件の追加/削除判定は既存結果を維持する。一致は数学的正しさ、原本の真正性、変更理由、現在の保存原本との一致を証明しない。保存通知による保持本文の一致未確認は過去記録の比較と別の制約として記載する。

任意文字列は動的コードフェンス内で欠落なく保持する。ファイル名のみ安全化し出力日時を付ける。既存出力上限を超える場合は切り捨てず全体を拒否する。出力資料は自動更新されない。コピー成功とダウンロード要求成功は区別し、OS保存完了を保証しない。

## 失効と保存保護
A/B変更・入替・本文/登録式/レポート/取得世代変更・storage通知・再比較で旧プレビューと出力対象を失効する。実行直前にも同一結果と世代を検査する。非同期コピーの古い完了が成功通知や手動コピー欄を再表示しないよう守る。保存通知だけで対象レポートの変更/削除と断定しない。

比較不能という有効な判定は資料として出せるが、未実行・不適格選択・失効した対象は出力しない。本文・過去固定記録・引用snapshot・原本・確認履歴・容量・計算エンジンは変更しない。

## 検証
実装/単体統合/独立レビューは下記のとおり実施。最終HEAD実CIは確認待ち。未実施結果を先取りしない。実機Safari・VoiceOver・OS文字拡大は未検証。PR #85 初回選択位置ずれの全原因未特定は今回解消したと扱わない。

## 独立レビュー・初回検証の記録
独立担当は新規9件を含む58件（builder33/UI16/独立9）成功、確認範囲で新規P0〜P3なし。[独立報告](formula-report-audit-comparison-export-independent-review.md)。実装途中のReact hooks lint3件は結果ごとのkeyed export instanceとlayout更新refへ修正しlint成功。既存App試験の総合状態見出し順序1失敗は出力見出しを状態より後へ配置して、既存期待値を変えず成功した。

最初の全単体は1986中1984成功、既存Mermaid parserと1500-block UIの2件が5秒timeout。lint/typeとの同時実行下であり、製品原因と断定せず静穏再実行・正式CIで照合する。5秒上限・期待値は変更しない。既存CI契約の100ms Node起動fixtureも最初の合成ログ前にtimeoutとなるローカル既知制約が再現した。これを成功と扱わず正式CIの同37件を別確認する。

静穏の既定並列再実行は1995件中1994成功、既存 `evidence-pending-component.test.ts` の100件保留容量操作が5.236秒でtimeout。初回のMermaid/1500-block失敗は同再実行では成功した。実行時間104.09秒、ローカルNode24.22.1・9CPU認識。原因を断定せず、全試験と5秒期待値を維持してworker2の同一試験を追加確認する。リポジトリの並列設定、CI、timeoutを変更していない。

worker2で同一の全1995件/85files（既存1937＋今回58）成功、失敗/skip0、184.84秒。5秒timeoutは不変更。既定並列のローカル2回の失敗を消さず、worker制限成功と正式CI既定成功を分ける。lint・TypeScript・通常build・Pagesbuild成功（71/40/76/6秒、初回lint修正後）。既存chunk-size警告は閾値変更せず保持する。

実画面の初回観測で、新preview操作と全文ラベルの行が連結し、新規ボタンが小さかったため、既存button-secondaryの44px minimumと段落分離だけを適用した（CSS/判定/保存変更なし）。独立9＋UI16を再実行25成功、最終lint/型/通常build/Pagesbuildも成功（45/13/31/10秒）。3ボタンの44px実測を同じGUI群に加えた。

初回局所GUIは旧レイアウトのChromium4条件で各11群成功。WebKit390は5群のcheckpoint後に記録更新が長く見えなかったため担当が中断（exit130）。assertion失敗やpageerrorは確認しておらず、ハング/製品不具合とは断定しない。操作単位ログ付き最終版ではtapに数秒かかるため、checkpoint間の多数操作が実行中だった可能性も残る。旧実行を完走PASSとせず、最終版の完走証拠を別に扱う。

操作ログ付き最終版のWebKit26.0/390pxは11群・65実tap・pageerror0・exit0で完走（2026-10-26 09:04:29〜09:07:39 JST、約190秒）。各操作に数秒かかり、storage3種を含む長い群ではcheckpoint JSONが途中更新されないことを確認した。前回のcheckpoint不変を停止の証拠とする判断は撤回し、担当の早い中断として扱う。最終版の新規3操作は44px以上、プレビューとコピー/実download bytes一致、失敗時回復、通知中の遅延完了拒否、0件比較不能、両theme/CSS200/focusを確認した。これはWebKit実エンジンの模擬条件であり実機Safariではない。

最終UI版の全1995件/85filesは同じworker2・5秒上限で再実行し、223.42秒、失敗/skip0。出力builder SHA-256 `24a9ff7f5933b8593e4e3a18031d4ff6318524d9dec887a76f795a4ef0048ab1`、UI `8acf1589617abbd3a26815b0084d510267e1b15a2a23d9257dca4ce3f0e1f081`、Pages JS `index-DqF1ujqC.js` / `f0fa87e45a098b8c14f71292a5d01b6946b9142bf0c3b9d1cfb3f7f98e852afb` を最終局所GUI対象として固定した。

最終Pages buildの局所実GUIはChromium141のdesktop1365/non-touch390/touch390/touch375、WebKit26.0のtouch390/touch375の既存6条件で各11群、計66成功、各mobile65実tap、pageerror0、全process exit0。プレビュー/copy/native .md bytes同一、両theme/CSS200/focus/44px操作/別page storage/非破壊性を確認。clipboard成功・失敗は注入sinkでありOS許諾未検証。正式全GUIは24群追加の912検査、geometry562、PNG114、成功trace0、30分上限を維持し最終HEADで別照合する。 局所最終runはWebKit390が09:04:29〜09:07:39 JST、残り5条件が09:12:17〜09:16:11 JST。同じ最終製品hashを使用し、初回中断履歴と区別する。

## 2026-10-26 JST: 全GUI再検証で確認した試験誤判定と長尾対策

製品変更なしのHEAD `ebe343753f2d1bcacc79499f95a2584ba4cb5f7b` / run40251667766 attempt1も30分job上限でcancelled。artifact12620839604のZIP SHA-256 `d3ff7d267b55c1235eaaba0c310e4867d5671cf841b97fbb0c07b4f1e0e3e3b1` はAPIと一致、HEAD/run/attemptも一致。4条件完走、Chromium non-touch390は既存検査失敗、WebKit390は既存dependency-graph-limit-fallbackまで100検査で未完。成功とは扱わない。

独立診断でChromium失敗は `not.toContainText("999")` が計算値ではなく生成UUID `cf886864-22dd-4ace-999d-858cfab8e426` に一致したことを確認。根拠値混入ではない。第一希望は検査対象の意味を正確にすること：厳密な識別・日時paragraphのみを全文sentinel検査から除外し、開いた両側保存記録detailの式/モード/順序/実入力参照元/内部値/表示値をfixture snapshotと完全一致で検査する。UUIDや日時に999があっても通り、計算値999や除外paragraphへの余分な999は失敗するnegative controlを追加。UUID生成のmock固定という次善策は実製品経路を変えるため不採用。製品・比較判定・保存形式に変更なし。

WebKit390の既存quotesは2runで583秒/558秒、375は318秒/298秒。math-reports等も広く遅く、PNG/geometryの差だけでは説明できない。DPR3/2や資源負荷の寄与は未確定。2worker・全6条件・DPR・操作・assertion・geometry562・PNG114・成功trace0・30分job上限を維持し、長時間のWebKit2条件を先行する実行queueのみ変更した。元indexによるID/port割当と集約順を維持し、全6条件exactly onceを単体契約で検査。時間内完走を順序変更だけで保証しない。tap/clickの既存actionability/実touch確認を変えず、stage別入力wall時間/count/maxを追加測定する。

## 本人承認後の3worker検証（2026-10-26 11:49 JST）
同じ30分jobで3workerとする次善策を本人が了承した。先行run40255569307ではWebKit3901480.8秒/375930.2秒で完走した一方、後続Chromium touch2条件が未完となり、順序変更だけでは足りなかった。全条件/DPR/期待値/PNG/geometry/trace/単一job上限は維持し、資源並列数だけ3へ変更する。元index port/集約順と全6一度ずつの契約を保ち、CPU数/利用可能CPU/host memory/load/cgroup制約/Node usageを開始終了に記録する。Node usageはbrowser子processの使用量を含まず、host観測からCPU不足を断定しない。3workerでの完走も従来遅延の根本原因解消を意味しない。前runの失敗はPR本文とLOGに保持する。

## PR #93 GUI阻害の追加修復

既存出典確認の文字200%横超過とWebKitの多重Modal遅延を別に再現・計測し、同一全文のtext node統合と多重時の装飾filter省略へ局所化した。出力builder・比較結果・保存/失効意味論は変更しない。単独Modalの装飾を保持する第一希望を採用し、常時filter削除・無効な子層だけの変更・worker増加・検査削減は不採用。低層WebKit/環境の全原因を解明したとは扱わず、正式6条件の完走と調査で示した寄与を区別する。[設計比較・RED/GREEN・全失敗履歴と最終検証](../maintenance/pr93-gui-repair-20261026/README.md)。
