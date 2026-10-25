# 固定点検記録2時点比較・独立レビュー

2026-10-25 JST。実装担当とは別の reviewer agent によるソース、独自再現試験、関連試験のレビュー。対象は main `9c42e3750d2ebf8fd0f01c1d459d4269f2c4827f` からの `feat/audit-record-comparison` 作業差分。最終公開commit/実CIとは別のローカル検証であり、その結果はPRで照合する。

## 結論
確認したソース/jsdom/単体範囲で、下記P2×2・P3×1は修正後の同じ期待値で再現しなくなった。残存P0/P1/P2の指摘なし。全ブラウザ/OS/将来形式/数学的正しさの保証ではない。

## P2-01: 0件点検の取得失敗を成功と同一扱い
- 再現: 認識項目0件の本文を共有parse/assessmentで処理し、Aは正常原本取得、Bは取得不能または未知不正。両方checkedとしてcaptureした2記録を比較。
- 期待: 取得成否の変化、取得不能または記録形式不明を保持。0件だから取得成功としない。
- 修正前: acquisitionError/invalidDataをsnapshotへ保持せず、双方 `matched`。独立2件失敗。
- 原因: 項目単位のsourcesだけに取得失敗が現れ、0件では状態が失われる。
- 修正確認: snapshotのacquisitionStatusを記録し、件数に依存しない総合状態/変化を付与。成否未記録は推測成功にしない。UIは原本取得日時と取得試行日時を区別。同じ2件成功。

## P2-02: 比較差分の原引用ID・対象ブロック変更の見逃し
- 再現: 実差分builderで同じdifferenceId・同じbefore/after記録を使い、原引用のblockIdのみ、またはquoteIdのみを変更。共有parse/assess正常取得/capture後に比較。
- 期待: 原引用の識別変更を検出。内部計算値の変化とは別に示す。
- 修正前: captureが原引用ID/対象blockIdを省略し、両ケース `matched`。独立2件失敗。
- 修正確認: originQuoteId/originBlockIdを新規captureへ保持、処理側で検証/比較。旧資料欠落は比較不能、対象blockが元snapshotにない場合は不正として拒否。両ケース成功。UI詳細も原引用識別を表示。

## P3-01: StrictModeで明示選択を保持できない
- 再現: 新比較UIをReact StrictModeでmountしAを選択。
- 期待: 選択値を保持する。
- 修正前: effect replayのcleanupだけがref epochを進めrender revisionが追従せず、選択値が直ちに空へ戻る。独立1件失敗。productionで同現象を確認したという意味ではない。
- 修正確認: 不要なcleanup epoch更新を除き、storage通知時の同期epoch＋revision失効を保持。独立1件成功。

## 実施した確認
- 独立 `tests/formula-audit-comparison-independent.test.ts` 5件成功。
- 関連4ファイル合計82件成功（独立5、core51、実CalculatorApp15、envelope11）。全体型検査成功、独立試験ファイルeslint成功。
- 実CalculatorApp試験は旧data保持のstorage更新/削除/無関係更新、描画前の古いcallback、再取得失敗、未保存編集、選択/入替、保存bytes/確認履歴不変を含む。これはjsdomであり実ブラウザと区別する。
- v1旧記録を構造化データありと偽装せず、v2厳密領域・未知/不完全/重複境界、安定ID対応、frozen/observedの分離、unknown evidence fieldによる比較制約、同一計算記録ID比較の限定オプションを点検。
- 既存2試験のselector変更は「最初のselect」から既存filterの明示labelへ限定したもの。期待値/検査内容は削減していない。
- E2Eは既存scenarioへ新helper6検査/条件を追加。846→882 checks、geometry562、PNG114、成功trace0、30分上限を維持する差分を確認。native別page変更/削除/無関係更新、旧/未知形式、未保存本文、同結果でも式/入力差、キーボードA/B選択→Tab→Enter比較の処理を静的点検。touch数は最終実測を契約へ照合する。

## 限界と再確認条件
独立担当は実Chromium/WebKit操作・最終HEAD CI・artifactの再実行を実施していない。それらは実装/検証担当の別証拠と突合すること。実機Safari/VoiceOver/OS文字拡大も未検証。新形式は本文の容量上限に従い、過去記録の真正性・外部保存の原子的整合・数学的正しさは保証しない。PR85初回CI選択位置問題の全原因未特定を今回解消済みとは扱わない。
