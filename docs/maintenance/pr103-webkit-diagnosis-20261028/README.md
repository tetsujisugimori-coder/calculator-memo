# PR #103 診断の分離

基点main `7cdda5ce627fb431aec1a70ddd909e7fa01fdd3c`。診断コード・workflow・計画の出発点は #103 の `b1adc0e8368b0da638e66c8dfa34b1d439da2247`。そこから必要ファイルだけを移し、65 tapの確認、手動workflow内のmock／Linux cleanup・46契約の前置、登録後手順を追加した。#103の製品変更をcherry-pickしていない。

mainとの差分は次に限定する。

- `.github/workflows/pr103-diagnostic-draft.yml`：手動診断の入口。公式GUIやPages公開workflowは変更しない。
- `e2e/diagnostic-pr103.mjs`、`diagnostic-supervisor.mjs`、`diagnostic-aggregate.mjs`：対象helperの実行、時間・資源の採取、失敗／timeout・cleanup、欠測を伴う集計。
- `e2e/diagnostic-supervisor.node-test.mjs`：mock集計・欠測・停止・途中ログとLinux cleanupの独立検証。
- 本ディレクトリの計画、契約観測、登録後手順：固定条件・出所・保留事項・証拠の受渡し。
- `LOG.md`：分離の経緯と検証結果。

対象アプリと `e2e/audit-record-comparison.mjs`、`runtime-resources.mjs`、46契約、両lockfile、WebKit依存の正本は固定アプリSHA `52f4f6914fcd3c72b0829018842f653f06abe5f2` にある。workflowは診断コードとは別ディレクトリにcheckoutし、各SHAと配信identityを確認する。65 tapは同SHAの正式run 40671009347 attempt 1／2の375／390各区間から確認した。GUI実測は未実施。

[実行計画](proposed-plan.md)・[登録後手順](after-registration.md)・[Windows契約観測](contract-observations.md)。mainへの登録・限定実行はこのPR提出では行わない。診断結果は #102 / #103 の製品・正式GUI合否と別に扱う。
