# 独立レビュー R1 / R2 の局所修正

Issue #114 / Draft PR #115、[独立レビュー原本](https://github.com/tetsujisugimori-coder/calculator-memo/pull/115#issuecomment-6559360058)。修正担当は元実装担当であり、ここでの再実行は自己検証。修正後の独立再レビューではない。

## 変更前の原因見立て・範囲・判定優先（2026-11-02 JST）

- 基準 d58d1a4bf210216e24d47ab261268d2bc7c2aeca / tree 14a4286819291457bd3512919baf85587b8a22ef。local/remote/PR一致、clean、base/main 528a6a0a不変。AGENTS・GitHub運用・検証規約を再確認。
- R1: 共有参照解析のbody分岐がreportsだけで、confirmationsの固定本文の未知fenceを正常0件へ落とす。既存の本文parserを確認履歴にも適用し、previewとplanで同じ参照事実を使う。原文・snapshotは変更しない。
- R2: 禁止行により全選択候補の構築を止める方針は正しいが、行の直接UNKNOWNをafter参照だけから得るため、backup内の確認済み非対応が消える。候補の成否から独立した局所参照診断を保持してから依存伝播する。禁止行を除外した部分候補を全体PASSにしない。
- 優先順位はSTALE、既知BLOCKED、UNKNOWN、候補操作。BLOCKED行でもunknownsを捨てない。既知UNKNOWNと未確認の復元後参照を区別し、無関係な正常ADDを一律UNKNOWNへ変更しない。
- 変更範囲は参照解析・計画・必要表示・回帰試験と記録。実復元、保存形式、backup、全体復元、保全コピー、計算機能、既存正式GUI契約は変更しない。

## 原probeと再実行

原本は読取可能な `C:/Users/tetsu/Documents/Codex/2026-11-01/task-7/evidence/` から読取り、変更せず `outputs/review-r1-r2/original-*` へ複写した。
独立41試験原本SHA256 `b4995b36ceef6ad306dbfcbfb107c64005e8a4c0b6f6e4628e0d785a74b9c517`、元config `3c36f960fd96e6a4892cf2536fc2155c408362bb25e823a75923c3ac93c062f2`。再実行用の複写ではimport先・include先・観測出力先だけをこのcheckoutへ付替える。入力・期待値・既定timeout・maxWorkers1を変更しない。原本manifest/review/GUI/logもhash付き複写で保全。製品lint/typeの探索対象へ混入しないよう、実行用test/configと元コード複写は `task-6/revision-probe/` に隔離した。

修正前RED、修正後GREEN、GUI、全単体と固定HEAD CIの結果は実測後に記録する。旧独立全単体2539/2542（既存5秒timeout2件とfixture CRLF1件）、限定単worker111成功は独立レビュー原本の事実として保持し、今回の結果へ流用しない。旧正式run41307579092は30分上限cancelled、4/6・1071/1128・568/592・128/132、未確認57/24/4、内部根因UNKNOWN。

## 修正とローカル自己検証

- R1は確認履歴bodyを共有参照parserへ追加し、通常文・未知fence・壊れた既知fenceの正負対照でpreview/after件数各0/1/1を確認。原文/snapshotは変更しない。親から確認本文を二重走査しない。
- R2は全候補の構築成功と独立してバックアップ項目の未知形式を行へ保持。MISSINGだけで復元後欠落とは断定しない。候補なしは復元後未検証理由とnull件数を保持。両根拠を有限グラフで伝播し、BLOCKED表示でもunknownsを捨てない。独立した正常ADDは維持。計画規則version2、保存形式version1不変。
- 原41試験: 修正前 **38 PASS / 3 FAIL、exit1**（R1 1件、R2順序2件）、修正後 **41 PASS、exit0**。旧38件も成功、input/expectation/timeoutは変更なし。原本を取得した自己再実行であり、独立再レビューとは称しない。ログ `baseline-41.log` / `final-41.log`。
- 関連core56/preview35/UI27の **118 PASS、exit0**。初回117/118の1件は、試験が別時刻にbackupを再生成して日時も比較した誤り。アップロードした同じ原文の不変確認へ直し、製品欠陥と区別して `focused.log` を保持。
- 既定全単体は **116 files / 2550中2541 PASS / 9 FAIL、exit1**。全9件が既存5秒timeout。7該当ファイルをmaxWorkers1で診断し **107 PASS、exit0**。既定全体の失敗を全PASSに書き換えず、CIのUbuntu既定条件を別確認する。旧独立レビューの2timeout+CRLF1とは別の今回結果。fixtureはGit正本LFと一致、今回CRLF失敗なし。
- Windowsの既存+新規契約は **59中50 PASS / 9 FAIL、exit1**。Linux bash/timeout/signal経路差の同じ9件、Ubuntu CIで別確認。契約やtimeoutを変更しない。
- lint初回はprobe移動と探索が競合してENOENT、再実行はexit0。probe configの追加warningは製品外へ隔離し、最終lint/type/両buildは最後の差分で確認する。
- GUI初回はR1のUNKNOWN/件数確認後、読み終わったinput.filesを読む試験コードで停止。製品は既存どおりinputをclearするため、合成backupの実ファイルbytesを読戻す方法へ補正。force/timeout/期待値の緩和なし。初回JSON/PNG/traceは `outputs/review-r1-r2/gui-first/` に保全。

新8条件GUIと固定HEAD正式CIの結果は以下またはPR最終本文/Checksに追記する。正式未完走を局所成功で補完しない。実機iPhone Safari/VoiceOver/OS文字拡大/ソフトキーボードは未検証。

### 提出前の収束結果（2026-11-01 20:28 UTC / 11-02 JST）

- lint exit0/error0/既存warning2、型exit0、通常build/Pages build各exit0。probe configのwarningは製品外へ隔離後に解消。既存+新規契約のWindows50/59は前述どおり保持し、拡張した新規契約2件はexit0/skip0。
- 拡張GUI **8/8条件すべて成功、既存88touch＋R1/R2 160touch、PNG40枚**。Ch/WK ×375/390 ×light/dark、CSS200%。R1 UNKNOWN・参照未知1件・確認行UNKNOWN、preview/詳細も同じ件数。R2は禁止子込み全体BLOCKED・式/レポートUNKNOWN2件・候補UNKNOWN/復元後件数null、解除後もUNKNOWN2件。再選択・raw変更でSTALEになり旧詳細を撤回、明示再検証で同じ診断へ戻る。backup実ファイル/現在原文/保全slot/他key不変、app set/remove/clear各0、Space・focus復帰・横幅・pageerrorなし。160touchはnative touchstart実数とも一致。
- GUIはd58を基点とするdirty修正版であり、d58の成功でも最終commitの成功でもない。bundle SHA256 `89251ab798b7f80266a75ae86d4ee587f16f8d1d8ebafb4f2c5fa602e817d17f`、`gui-evidence/` と `outputs/review-r1-r2/local-gui-manifest.json` に固定。代表のR1 light375・R2 dark390 PNGも目視確認。元レビュー/manifest/probe/config/GUI/logの6原本hash不変を再確認した。
- 同じWindowsで別タスクが実行中との親連絡あり。CPU競合の寄与は未測定で、9timeoutの根因とは断定しない。GUIは既存専用4195の所有確認後に起動し、他プロセスを停止していない。以降のローカル重負荷は並行しない。
- [最終PR](https://github.com/tetsujisugimori-coder/calculator-memo/pull/115)の固定HEAD Checksと終端報告で正式6条件・Ubuntu全単体/59契約・全成果物を別確認する。この記録を含むcommit自身のCI成功は先取りしない。修正後の独立再レビューは未実施。

主なローカルrawログ（`outputs/review-r1-r2/`）:

|file|bytes|SHA256|
|---|---:|---|
|baseline-41.log|6188|`c991ffcfc147e391dc265096d9bea4834cdb3d96f1caa4103bd608d5ffb661f3`|
|final-41.log|4753|`d971bf3c5d538c188280a3fe2d874121e6be94924c0543ced00cb46c5c90ee03`|
|focused-green.log|18129|`43edd46cccab9561d552519e44a3d9cb0d78e2366849ce89dc9c9ef5c29aca00`|
|full-unit.log|53978|`e5a8db326ab795d6ced1c0a125a6121da5657d7c439e30d3f14c61a0adc49b58`|
|timeout-diagnosis-single-worker.log|15726|`18df02f8f70feab72c0e9595f7d77336d924206071a47665f7298141ed789993`|

全ログの正確なbytes/SHA256は `verification-log-manifest.json`、GUI全fileは `local-gui-manifest.json` に保全。これはローカル証拠でありGitHub公開attachmentではない。CIのraw原本・artifact digestはPRの最終表から追跡する。
