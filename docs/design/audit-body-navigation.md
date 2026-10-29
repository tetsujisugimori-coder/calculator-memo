# 本文確認中の根拠点検前後ナビ（Issue #102）

2026-10-28 18:42 JST。基点 main/PR #101 merge `7cdda5ce627fb431aec1a70ddd909e7fa01fdd3c`。

既存 FormulaReportAudit の filtered list・出現key・capture/resolve と FormulaReportModal の世代付き遅延選択を再利用する。本文側の前後対象は現在keyから毎回導出し、indexを保存しない。固定A/B資料の移動経路には点検項目専用の制限を追加しない。

本文側の移動は要求と成功を分ける。完全範囲確認後、本文選択完了callbackでだけ現在key・戻り先・強調を同時更新する。待機中は同期refで連打を止める。失敗callbackでは理由だけ表示し現項目を保つ。閉鎖/戻る/編集/同値保存通知/世代変更は要求tokenを失効し、遅いcallbackを捨てる。失効中の旧件数/位置を有効に表示しない。

通常復帰は現在項目詳細・filterを保持し、移動した場合のみ一覧の現項目を必要時に可視化する。復帰focusは詳細本文移動ボタン、同一項目往復は従来focusを保持。本文側前後操作は成功時も操作ボタンへfocusを保ち、端はaria-disabledとhandler guardで非循環。

本文/保存bytes/snapshot/確認履歴を変更せず、原本取得・再比較・計算・保存を呼ばない。再照合時の選択クリア、保存中制限、専用取消、schema/Markdown/容量/engineは不変更。

単体/実App/正式6GUI条件で0/1/多件、拒否隣接、複数出現、異種、filter、連打/遅延、ABA/保存通知/切替、非破壊、両theme・文字200%・focusを確認。3workers/30分/成功trace0を維持。実機Safari/VoiceOver/OS文字拡大は未検証。設計時点でPASSは先取りしない。

## 再比較ゼロと完全範囲の両立

初期実装は既存capture/resolve内部の再解析により、固定差分のMarkdown再構成がcompareEvidenceRecordsを呼び、2移動で4回となった。同じ0回期待を維持し、現在inventoryのparser入力（body/formula）をWeakMapで記録し、同一本文/formula/reportの一時navigation contextへ既存候補をコピーして再利用する。候補配列は非公開WeakMap、contextは凍結し保存しない。capture/resolveの構造・ID一意性・完全範囲・対象全文比較は省略しない。不一致・偽context・未認証inventoryは従来parserへ戻り、部分範囲や近似位置を採用しない。本文変更後に旧contextを有効と扱わない。

初回本文移動の拒否通知は点検項目経路に限定し、固定A/B資料の既存3引数callback契約を維持する。同期refはイベントの競合防止、表示はstateの失効・context revisionに基づき分離する。

更新：2026-10-28 18:51 JST。

## 初回往復と本文側順送りの境界

初回に一覧の本文移動ボタンを使っただけの場合は、既存の選択（未選択を含む）・一覧位置・発火元focusを保持する。本文側の現在名/位置の確定と、一覧の選択確定は同じ操作ではない。本文側の前後移動が成功した場合に限り、新しい項目を復帰先詳細として確定する。初回から詳細を暗黙表示する変更は既存の連続一覧往復を遮るため行わない。

更新：2026-10-28 19:15 JST。
