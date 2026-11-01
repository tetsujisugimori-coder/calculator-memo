# 選択復元計画の正負対照

Issue #114 / Draft PR #115。実装者の自己検証であり、独立レビューではない。いずれも合成データ・Windows/Node24.20.0で実行。REDは未実装import失敗ではなく、下記の実際の誤判定/表示を検出した。保存書込は行わない。

## 参照・依存の7対照

[fixtureと全assertion](../../../tests/selective-restore-plan.test.ts)。全て現行候補のcore50と全単体2542に含む。

|ID|fixture / test名の識別句|RED対象の製品code|RED実測|GREEN期待|
|---|---|---|---|---|
|R1|opaque nested / settings.futureReference|47eb804|全体PASS|UNKNOWN / after UNSUPPORTED|
|R2|opaque nested / history-execution.futureReference|47eb804|全体PASS|UNKNOWN / after UNSUPPORTED|
|R3|opaque nested / note-policy.futureReference|47eb804|全体PASS|UNKNOWN / after UNSUPPORTED|
|R4|UNCHANGED source still requires reference equivalence|76484bb|全体PASS（同じreport、異なるformula内容）|予定UNCHANGEDでも全体/参照UNKNOWN|
|R5|propagates a selected dependency / report→formula順|bed22a63|関連report行ADD・参照FOUND|関連行/参照UNKNOWN|
|R6|同上 / formula→report順|bed22a63|関連report行ADD・参照FOUND|同じ診断を順序非依存でUNKNOWN|
|R7|propagates parent UNKNOWN / 子→親順|bed22a63|子行ADD・親UNKNOWN|子もUNKNOWN、依存理由を表示|

R1–R3: `outputs/nested-red.log`（3 failed）。R4: `outputs/unchanged-reference-red.log`（1 failed）。R5–R7: `outputs/dependency-red.log`（3 failed）。R5–R7は元々全体BLOCKEDであり、全体PASSの欠陥とは称さない。各REDでは新しい試験だけを未修正製品codeへ追加した。

正の対照も保持する。通常UNCHANGEDは「事前検証PASS」かつexecutionAllowed=false、同じ参照先が現在に残る場合/同時選択の場合はafter FOUND、親に含まれる既知の子は二重変更せず包含、無関係なADD行は他行の禁止で隠さない。これらも同じcore50に含まれ、全件UNKNOWNへ倒して負対照だけ通す方式ではない。

## 予定操作の未知数値（別枠4対照）

既存 `never certifies unknown numeric token` の4例 `9007199254740993` / `1.00000000000000001` / `1e-999` / `1e9999999` を、予定操作・差分文まで検査した。f5250c7では実効operationはUNKNOWNでもproposedOperation=REPLACEを残した。強化assertionは4 failed（`outputs/numeric-proposal-red.log`）。入力/対象の厳密検証がvalidの時だけ予定操作を認定する1条件の補正後、予定操作null・差分は判定不能を保持してGREEN。これらを参照の偽PASS7件へ混算しない。

## focusの製品RED（別枠）

提出前dirty版で `returns focus to the preview launcher even when touch did not focus it` がRED（`outputs/focus-red.log`）。WebKit touch起点では既存Modalが入口を取得できず、閉室後bodyへ戻った。CalculatorAppのプレビュー入口だけ明示復帰先を保持する局所修正後、同じ単体とCh/WK8条件でGREEN。共有Modalは不変更。

## ローカル原本ログの固定

以下はexecutor内のraw出力ファイルのhashであり、GitHub CIの圧縮jobログbyte同一性とは別。実在パスの親は `C:/Users/tetsu/Documents/Codex/2026-11-01/task-6/repo/outputs/`。CI成功/成果物/最終HEADはPRの最終報告で別確認する。

|file|bytes|SHA-256|
|---|---:|---|
|nested-red.log|6756|`236465639b5ecb413e956c43167345c505ef601760d10366c072e4a801671729`|
|unchanged-reference-red.log|6454|`7a2cf4ec1a4ac0ea7ac9b46b23c8b490ec10865ff9d590578ea7a38858003367`|
|dependency-red.log|7687|`d03b146c5ef6e075389889697135f8dacc203a61df0e4c1ec2a5b7a7c64d4f13`|
|numeric-proposal-red.log|7368|`bb56bf0a1742fda705bd520807c4669757dd061ca7882e5d54f0b9418d78d89a`|
|focus-red.log|20667|`8d0949cb0dc0ab1a5de61d54fb02764fb491cba469e7f3ad5078f57a4217bcec`|

