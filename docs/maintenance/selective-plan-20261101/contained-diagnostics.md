# 選択親へ含まれる子の診断を伝える局所修正

Issue #114 / Draft PR #115。[独立再レビュー](https://github.com/tetsujisugimori-coder/calculator-memo/pull/115#issuecomment-6564937628) の項目別診断P2に対応する元実装担当の自己検証記録。全体の偽PASS・保存欠陥とは扱わない。修正後の独立再レビューは未実施。

## 実装前の方針・範囲・受入（2026-11-02 JST）

基準HEAD 76f653572624aad45a7df9142b0f66ca0395c8ea / tree d404cd35dd635f9c0a8d8035f825282d88ebb72d。local/remote/PR一致・clean、main/base528a6a0a不変。AGENTS/関連規約/設計を再確認、checkout .agents/skillsは存在しない。

- 原因: 各行は同一identityの参照だけを見ており、選択親に含まれる未明示選択の子の診断が伝わらない。
- 子の診断表示と参照実体を分離する。親のunknowns/blockedReasonsへ種別・scope・IDと名前空間の出所を保持するが、plan.references/行referencesへ子の参照を複製しない。自動選択もしない。
- 関連付けは親/子の種別、親scope、一意IDで行う。名前や配列位置で補完しない。同定不能はUNKNOWNとして保持し、他の親へ結び付けない。
- UNKNOWN行数は明示選択されたPlanItem表示行ごと一度。理由や名前空間の数で増やさず、親子を両方選べば別行として各一度。BLOCKED優先表示でもUNKNOWN理由は残す。参照件数は元の名前空間ごとの実体を数える。
- 受入: 親のみ、無関係BLOCKED併存、親子両選択と逆順、正常子、別親scopeの同じ子ID、複数診断の出所、親BLOCKED+UNKNOWN両根拠、参照数非二重計上。memo/evidenceも同じ限定範囲で点検する。
- R1の通常文/未知fence/壊れた既知fence、R2の禁止有無/選択順/正常ADD/両根拠、保存0とraw不変・STALE/focusを保護する。変更範囲は計画・必要表示・設計/LOG・試験。実復元・保存形式・snapshot・ID・自動選択・Stage3は変更しない。

## probeの取得範囲と出典

独立再レビューはLinux/Node24.22.1/Vitest3.2.4/mathjs15.2.0、製品34ファイルをAPI取得した隔離core工程。報告は原独自8試験6成功/2失敗(exit1)、既存core56成功。コメント全文を取得したが、参照は製品コード/CIのみで原probeのファイル・config・fixture・rawログ・manifestへの取得参照はない。親側も実施task/Library ID/保存先は未取得と確認。広域ローカル探索は行わない。

今回は公開された条件から8試験を**再作成**する。原8probeの同一再実行とは称さない。条件対応はR1の3条件、R2の3条件、親診断漏れの2条件。原本取得に必要なのは8試験source、Vitest config、fixture/helper、baselineログとhash/manifest、取得可能なtask/Library/file参照。後から提供された場合に照合できるよう再作成sourceと結果を固定する。

以前のtask-7原41試験は別のWindows独立工程由来であり、今回の原8probeと混同しない。既存core56は76f6535のコミット済み試験の自己再実行として別集計する。原8probeの6/2とcore56の成功は独立レビュー報告値であり、今回自分が実行した結果は以下へ記録する。

## 実装・自己検証の実測

親行の参照は所有identityだけのまま保持し、診断用の子identity/参照を別Mapで扱う。backup/afterの未知形式、after欠落/曖昧を出所付きで親へ反映。子の選択依存先と明示選択された子自身も逆依存グラフへ追加し、BLOCKED/UNKNOWNを別々に伝える。親子の循環でも判定とUNKNOWN有無の単調遷移で有限。正常ADDは変えない。直接理由は不明/禁止の各20件、同定/検証警告も各namespace20件までにし、超過件数を示して全参照へ誘導する。計画規則version3、保存形式version1不変。

Windows/Node24.20.0/Vitest3.2.4、固定Playwright1.56.1。原Linuxの実行環境とは別。

|出典・実行|今回の自己実測|
|---|---|
|基準76f6535の既存core56|56 PASS / exit0。source SHA256 `f28a5029f60716ea38776bf562664119de99a7f1fd75c02d69c1e11a681336b7`|
|再作成8試験・修正前|6 PASS / 2 FAIL / exit1。R1/R2 6条件成功、新P2親のみ・禁止併存2条件で親UNCHANGEDの振舞いRED|
|同じ再作成8試験・最終修正版|8 PASS / exit0。source/期待値/fixture/config/既定timeout/maxWorkers1は変更なし|
|旧Windows原41の回帰|41 PASS / exit0。原Linux8probeの再実行ではない|
|拡張core/UI|core68 + UI29 = 97 PASS / exit0。これにpreview35（前段で成功）を合わせ対象132件。親子両順、正常子、別scope、両根拠、複数出所、参照非二重計上、memo/evidence、子経由依存、表示上限を含む|
|全単体の初回|116 files / 2563中2559 PASS / 4 FAIL / exit1。すべて既存5秒timeout。最後に追加した表示上限対照1件は対象97で成功、最終全体2564件は固定HEAD CIで別確認|
|該当4fileの単worker診断|49 PASS / exit0。初回全体の失敗を置換しない|
|lint / 型 / 通常build / Pages build|各exit0。既存lint warning2のみ|
|Windows契約|59中50 PASS / 9 FAIL、exit1/skip0。既存Linux bash/timeout/signal経路差。新HEAD Ubuntu CIで別確認|

再作成8source SHA256 `81069797599b89a450d146cee7f93fdadc216223de7fa8c56eef24aa53ec69da`（6408bytes）、config `81163ab1a0251da2fed6218653e9218da2d7b534639b2162912a1d7b87b91684`（144bytes）。`task-6/revision-probe/contained-eight.test.ts` / `contained-eight.config.mjs` に製品外隔離。RED/GREENログ・観測JSONは `outputs/contained-diagnostics/`。原本が未取得のため「原8試験の同一再実行」は未検証という境界を維持する。

初回追加上限対照は25確認履歴を使い、既存の保存形式上限20を超えたため候補未構築/nullになった試験fixture誤り。形式内15件で30個のbackup/after診断を作り、親表示20件+超過10件と参照実体15件の保持を確認した。元失敗 `focused-final.log` を保存し製品REDとは区別。lint初回は証拠dir移動と探索が競合してENOENT、配置固定後に再実行exit0。timeout/skip/force/期待値の緩和はしていない。

初回全体のtimeoutはaudit-body-item-navigation-app、audit-item-navigation-app、evidence-pending-component、saved-evidence-uiの各1件。旧76の9timeoutや旧独立2539/2542（2timeout+CRLF1）と混同しない。原/再作成probe・ログのhashは `probe-manifest.json` / `log-manifest.json` に固定。これらはローカル保全でありGitHub公開attachmentではない。

拡張8GUIと最終固定HEADの正式6/1128/592/132/3workers/30分の終端・成果物は実測後PR本文/Checksへ記録する。前段/局所成功で正式欠測を補完しない。旧76の5/6・未確認24/11/2と根因UNKNOWNを別証拠として保持。修正後独立再レビューと実機Safari/VoiceOver/OS文字拡大/ソフトキーボード等は未実施。

## 提出前GUIの確定結果（2026-11-02 JST）

Ch/WK ×375/390 ×light/dark、CSS200%の **8/8成功・88+224 native touch・64PNG、exit0**。追加224touchは観測touchstart実数とも一致。親のみはUNKNOWN1行、親子両選択は2行、無関係BLOCKED併存でも親のUNKNOWNと出所を保持。全参照は候補あり10件/候補なし7件のままで親子選択による複製なし。選択変更のSTALEで旧詳細を撤回、明示生成で更新。R2のraw変更/再取得/再生成、focus、横幅、pageerrorなしも保持。

backup実ファイル/current原文/保全slot/他key不変、アプリsetItem/removeItem/clear各0。合成writerを区別し実ユーザーデータは触らない。初回GUIで完走し、retry/force/timeout延長なし。PNGの親出所表示も目視確認。

ローカルGUIは76f6535基点のdirty修正版であり、旧76や最終commitの成功とは混同しない。bundle SHA256 `85d175540d2128518b3c62189ab06e810cad3b78f666d615ed755bd39bf87949`、provenance開始2026-11-01T22:58:28.106Z/終了23:01:32.425Z、`gui-evidence/` と `outputs/contained-diagnostics/local-gui-manifest.json` に保全。最終固定HEADのCIはこの記録を含むcommitのChecksとPR最終本文で別確認する。

|raw log|bytes|SHA256|
|---|---:|---|
|baseline-core56.log|9251|`cffed6f9a76cf55c7a7128222cc09a3018ee62fcaa1b69e192b12464b810c48d`|
|recreated-eight-red.log|2480|`0a33c46c7f425f5c0a401b5124760ca298817022a1149917f2b0caab4b27cbb1`|
|recreated-eight-final.log|1271|`f7c1957d3b996957d89abe9244c781c946454c1df12109b70cd751dae30f820d`|
|original-41-regression.log|4753|`a97d6e33881d3c9838a2c951b17d23dfb5225f437eb1b2de8576b9c6eee6acf1`|

再作成8source/configと基準core56コピーのhash不変を最後に照合。全ログと64PNG等は各manifestから追跡できる。最終固定HEADの正式GUIが未完ならPARTIALで引き渡し、原Linux8probeの取得不能と独立再レビュー未実施も明記する。
