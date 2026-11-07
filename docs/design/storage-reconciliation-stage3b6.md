# Stage 3B-6 保存履歴の読取り専用照合

## 境界

[Issue #132](https://github.com/tetsujisugimori-coder/calculator-memo/issues/132)。PR #131統合main `ce87b7caccbdf5b36589de75bd91e7feaa65763a`を基準とする。新規コードはe2e隔離fixtureに置き、製品からimportしない。Stage 3B HOLD、executionAllowed=false、writeAllowed=false、authority=NOT_ESTABLISHEDを全結果で保持する。CONSISTENTは供給された観測範囲の整合性のみ。復旧候補は人間の比較対象であって実行許可ではない。復旧API・unlock・自動retryは追加しない。

## 構造の再利用

Stage 3B-4のrecords（head/current/control/receipt/copy/intent/diagnostic）、Stage 3B-5のcompanion evidence（attempt/receipt/rescue-attempt/rescue/diagnostic）をそのまま読む。既存validateRestoreRaw、inspectSnapshot、inspectJournalRecords、details、UTF-16LE SHA-256を再利用する。保存形式や本番保存先は変更しない。

診断入力のCaptureは保存形式ではなく読取結果の報告構造。present/absent/unavailableを区別する。source/target/journalを2巡して一致を観察するが跨ストアのatomic snapshotと主張しない。変化時はUNKNOWN。無通知ABAや両巡の間で消えた変更は検出不能と明記する。過去のCaptureを別保管した場合は巻戻り、incarnation変化、append-only journalの消失/変更と照合できる。過去観測がなければ未観測の巻戻りを検出できたとしない。

IndexedDBはreadonly transactionのみ。未存在DBはopenのupgradeをabortし、store/recordを作成しない。sourceは指定getterのみ。診断表示は所有loopbackの合成ページに限定し、本番UIにボタンを足さない。close時のepochで遅延読取結果を失効させる。

## 判定

- CORRUPTED: 原文schema、hash、snapshot/journal構造の破損。
- CONFLICT: retained checkpoint巻戻り/同世代矛盾、source分岐、journalとtarget receipt不一致。
- INCOMPLETE: 欠落DB/receipt/branch原文、append-only記録消失。
- UNKNOWN: 読取不能/途中変化、履歴attempt/intent、保存済UNKNOWN、外側coordinator完了を証明しない状態。
- BLOCKED: persistent HOLD、または復旧等の操作要求。
- CONSISTENT: 上記所見なしで取得した全範囲が整合。ただしauthorityと媒体永続性は証明しない。

複数所見は全保持し、概要優先順位は上記順。BLOCKEDがUNKNOWN/不足証拠を覆い隠さない。日時は判定に使用しない。hash一致とtoken/receiptの正当性を分離する。候補はsource、current、記録済branchを出典別に列挙し、同じ原文でも統合・勝者選択しない。破損原文は証拠として保持しschemaValid=false、実行候補としては扱わない。

## 捕捉gap

rescue-attemptがありrescue recordがない場合は `rescue-capture-gap-no-durable-raw` とし、未捕捉source値の不足を明示する。現在Cしかなく、Bはcommit前に置換されたならBを再構成しない。記録済pairがあっても後の失敗/UNKNOWNを解消しない。過去READBACK_MATCHやVERIFIED receiptを新しいcoordinatorの完了/authorityへ昇格しない。

## 人間の確認順序

1. 影響store外へ現存する全branch・原文・receiptを保全する（本機能は保全実行もしない）。
2. 対象namespaceとincarnation、genesis前提、receipt鎖、原文/長さ/hash/ID inventoryを照合。
3. 不足記録、未知の因果関係、capture gapを明示し、別の証拠を探す。
4. 複数候補は保持したまま、別途承認された将来の復旧設計へ判断を引き継ぐ。

## 検証と限界

単体の構造反例とnative IndexedDBの破損/消失/巻戻り注入を分離する。診断前後snapshot一致とStorage/IDB mutator呼出0を検証する。receipt前障害、応答喪失、quota例外は合成注入であり実ディスク障害ではない。Chromium/WebKit4幅の別枠診断と既存正式GUI6条件1128/592/132は別々に評価。実機Safari、OS/private browsing保持、実quota、媒体flush、捕捉前source値はNOT_TESTED/UNKNOWNを保持する。

戻し方はこのPRのe2e fixture/tests/workflow/docsをrevertすること。製品保存形式変更がないため実データ移行や逆移行は不要。
