# Stage 3B-7A：未検証環境の安全確認

関連：[Issue #134](https://github.com/tetsujisugimori-coder/calculator-memo/issues/134)、[Stage 3B-6](storage-reconciliation-stage3b6.md)、別工程 [Issue #135](https://github.com/tetsujisugimori-coder/calculator-memo/issues/135)。

## 原則
環境安全性の検証は、ユーザーデータに対する復旧許可ではない。Stage 3B HOLD、executionAllowed=false、writeAllowed=false、authority=NOT_ESTABLISHEDを維持。既存の製品保存先・保存形式を変更しない。検査可能性と保証は別々に記録し、未実施はNOT_TESTEDとする。

| トラック | 試験対象 | 許される操作 | 初期判定 |
| --- | --- | --- | --- |
| A1 | 物理iPhone/iPadのSafari | 権限確認後の読取り専用観測。OS/Safari版・端末状態・再開/終了の記録 | NOT_TESTED |
| A2 | プライベートブラウズ | 使い捨てprofile/origin上でのみ隔離合成データを使用 | NOT_TESTED |
| A3 | 実quota / IDB例外 | 使い捨てprofile/originで隔離して容量制限を検証 | NOT_TESTED |
| A4 | databases()列挙→open競合 | Playwrightの新規合成contextのみ。version0残存・read-only open等を観測 | NOT_TESTED |
| A5 | 強制終了・OS再起動・媒体耐久性 | 使い捨て装置・隔離環境が証明できた場合のみ | NOT_TESTED |
| A6 | 独立診断runnerの失敗原票 | 合成診断プロセスの初期失敗に行単位の失敗理由/段階を記録 | 実装済・未実行 |

初期判定は**このPR着手時点**のもの。Stage 3B-6のWebKit/Chromium実績をA1〜A5へ流用しない。

## 試験承認・中止の条件
実機/隔離環境の所有または使用権、既存データ非接触の証明、試験origin、プロフィール、データ消去範囲を事前に記録する。条件が不足する場合は破壊的な検査を開始しない。容量圧迫、deleteDatabase、强制killは本番originや個人保存領域では実施しない。予期しない本番originへのアクセス、既存データ検出、権限不明、記録漏れでは直ちに中止しUNKNOWNを記録する。

## A6 診断runnerの変更
Stage 3B-6独立runnerの各engine/width行をcontext作成前に確保する。load/初回wait/evaluateで例外が出ても、rowのstageとerror、既に捕捉したpageerrors、実行済みケースを原summaryに残す。専用のSTAGE3B7A_STARTUP_PROBE=1は独立CIの負対照専用。使い捨てChromium 1条件で初期ロード直前に合成例外を発生させ、exit1・失敗原票・失敗段階・未生成PNGを検査する。通常実行ではこのフラグを指定せず、8条件の完走を要求。行が8未満、行status不合格、pageerrors、RED、source内容変化はexit 1とする。空のrowsや欠落行を「全部成功」とみなさない。失敗に伴う未生成PNGは存在を捏造しない。stderrにも例外/ログを残す。

## 証拠の最低項目
HEAD、tree、run/attempt、OS/ブラウザversion、実機/エミュレーション、origin隔離条件、実データ未使用、日時とタイムゾーン、条件、失敗段階、原票、期待/実観測、mutatorの有無、終了コード、証拠hash、NOT_TESTEDと理由を区別。機密の原文と機器識別情報は公開しない。

## 判定
個別トラックは PASS（実測した条件の範囲のみ）/FAIL/PARTIAL/UNKNOWN/NOT_TESTED。判定の通算・推測昇格は禁止。強制kill/OS再起動の成功もハードウェアflushを保証しない。初期ロード誤成功の改善は実機Safari安全性の証明ではない。

## 復旧実行は別設計
Stage 3B-7Bは判定資料だけを扱い、実復旧・authority切替・選択復元実書込み、消去、自動merge、UNKNOWN自動retryは別承認なしに実装しない。
