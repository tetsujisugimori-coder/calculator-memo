# 選択復元 Stage 3A（実行禁止）

Issue #116。2026-11-02 JST、実装前受入固定。基準main 9a62ade53f1743d5728051dc52a17bb12bbefe44 / tree36a0080c11caf4c28e5497de86daa9ad7039aa26。

## 受入と方式

- 既存parseStrictJsonの重複decoded key・構文・深さ/容量検査を共有し、UTF-16区間を取得。新規JSON parser依存の導入、別の不完全な構文検証器、全体parse/stringify再生成は採用しない。
- スプライス前後の全非変更区間を厳密比較。文字列escape、キー順、空白、改行、未知field、-0、巨大整数、指数字句、surrogateをそのまま保持する低層編集器を試験。低層保持成功と参照意味の検証成功は別。数値不明や未知field参照の候補はUNKNOWN。
- Stage 2計画を原文から再生成して照合し、参照と型検証を再利用。既存collectionのみ、履歴/メモ/登録式/実行入力/レポートの親全体ADD/REPLACE/UNCHANGED。バックアップ要素の原文sliceを移す。optional collection欠落を推測生成しない。REPLACEは候補だけで承認ではない。
- 子は選択親に含まれる時のみ親操作1回に集約（または厳密に検証されたUNCHANGED）。子単独変更、設定、未知領域、重複選択/ID、欠落/曖昧参照を拒否。BLOCKED/UNKNOWNの両理由を保持。選択順によらず同一候補。変更しない項目を並べ替えない。
- 候補原文を再解析し既存validateRestoreRaw、preview、Stage 2の構造候補と照合。計画改変/規則違い/実体選択違いはSTALE。保存可能性不明はUNKNOWN/BLOCKED。候補はpureで保存APIへ渡さない。
- 独立preflightは明示操作だけ。backupファイル全文・内部raw・識別情報、current全文、選択集合、世代・規則、候補全文、参照/ID、未保存編集、読取り状態を検査。前後二読とepoch照合で検証中変更/通知ABAを拒否。古い成功は選択/ファイル/世代/通知/読取失敗/未保存編集で撤回。
- executionAllowed=falseを常に維持。Stage 2既存表示/試験は不変。Stage 3A PASSから実行許可に昇格させない。
- 合成adapterだけで保全失敗/容量/読取/書込/不一致/競合/ABA/中断/復旧失敗を分類。初回障害を成功で上書きせず、自動rollback/retryなし。製品はadapterをimportしない。
- 保存/current/backup/recovery/other不変、app set/remove/clear各0。全単体/契約/lint/type/両buildと独立GUI8条件を実行。正式6/1128/592/132/3workers/30分は不変、局所GUIで欠測を補完しない。
- GUI証拠は実行ごと新規dirをexclusive作成し、HEAD/tree/dirty/bundle/条件/時刻/結果を付す。失敗成果物を再実行で上書きしない。

## Stage 3Bへ渡す保存・復旧設計

実保存を許可する操作は現時点で **なし**。候補対応操作だけを将来の検討範囲とする。Stage 3Bも独立受入と利用者の明示承認が必要。

既存restore-storage/recovery-managerのv1・8 immutable slots・合計4Mi UTF-16・各2Mi・既存slot上書き禁止を維持する。保全前にcurrent厳密一致、空slot/容量/record識別子を確認し、保全後にrecord全文とraw全文を読戻す。容量以下でもQuotaExceededErrorはあり得る。保全不能なら実行禁止。既存保全copy再利用も直前に再読照合する。Stage 3Aではこれらを呼ばない。

将来はcalculation-memo:dataへ候補全文を一度だけ書く。項目別逐次保存をしない。書込み試行前に不明状態へ移す設計とし、例外は書込み前失敗と区別する。読戻し厳密一致だけが観測時点のverifiedで、ディスク永続化やその後の他writerを保証しない。不一致/読取不能/停止はUNKNOWN。初回障害を保持し、自動再試行・自動rollbackをしない。保全コピーと現在原文を人が確認・個別書出しし、既存の全体復元による明示復旧を別操作で行う。復旧自体の失敗を別記録し原障害を残す。

localStorageには原子的CASがなく、直前確認とsetItemの間のTOCTOU、通知なしABA、非協調writer、読戻し後の変更は未解決。Web Locks/同タブqueueは協調writerだけの制御。ロック取得前後に計画を再検証し、通常保存凍結、世代/通知、保全確認、明示承認、単一書込/読戻し、UNKNOWN時保存停止の受入が必要であり、これだけでも非協調writerの完全防止とは認定しない。この境界を解決または明示的に許容する独立安全判断が得られるまで実保存を許可しない。

Stage 3B開始基準: 原文保持/参照の対応範囲が独立レビューで認定され、上記保全と故障分類、承認失効、排他の限界、停止/人間復旧を受入し、残競合下の実保存を許す条件を別途決定すること。現在のPASS再利用は禁止。

## 継続残件

PR #115はPARTIAL（読み取り専用限定マージ）。正式GUI5/6、1112/1128、585/592 geometry、130/132 PNG、欠測16/7/2とWebKit内部遅延UNKNOWNを維持。過去の初回証拠一部上書き制約も取り消さない。Issue #105/#114を自動閉鎖しない。実機iPhone Safari/VoiceOver/OS文字拡大/ソフトキーボード/物理永続化はNOT_TESTED。
