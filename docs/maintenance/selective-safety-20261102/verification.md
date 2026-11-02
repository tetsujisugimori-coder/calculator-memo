# Stage 3A 自己検証（独立レビュー前）

基準main `9a62ade53f1743d5728051dc52a17bb12bbefe44`、tree`36a0080c11caf4c28e5497de86daa9ad7039aa26`。Linux / Node24.19.0（CIはUbuntu24.04/Node22.13.0）。[本人依頼全文 #116](https://github.com/tetsujisugimori-coder/calculator-memo/issues/116)はcreate後fetchし全文厳密一致。AGENTS/README/LOG、運用/検証規則、指定設計と実装、関連PR107/109/111/113/115、Issue105/114、現在Actionsを確認。別checkoutや以前の証拠は未変更。

## 固定した受入と結果

[実装前設計](../../design/selective-restore-execution-safety.md)。Stage 2判定/保存経路/形式は変更せずStage 3Aを独立追加。**executionAllowed=false、実保存なし**。型別対応は既存collectionに限定。親子同時選択は親操作1回。独立式置換は検証可能だが、参照している未選択項目があると内容同一性の証明不能でUNKNOWNになり得る。

|ローカル自己検証|結果|証拠|
|---|---|---|
|固有core/障害モデル/UI|66+15+9 = 90 PASS、exit0|safety-expanded-final.log|
|最終差分の全単体|119 files / 2654 PASS、exit0|prepush-unit.log|
|全node契約（既存診断契約を含む）|82 PASS / fail0 / skip0、exit0|prepush-contracts.log|
|lint・型・通常/Pages build|各exit0。lint既存warning2|prepush-results.jsonと各log|
|Stage 2/backup/全体復元/保全等保護blob|14ファイル一致|protected-blobs.json|
|実保存・保全・他key不変|合成UI統合でraw比較、app setItem/removeItem/clear各0|selective-safety-ui.test.ts、固有GUIで再確認予定|

低層source編集は未知field、キー順、CRLF/空白、escape、UTF-16 surrogate、-0、巨大整数、指数を厳密保持する。一方、上位候補で未知fieldの参照意味や数値精度が未検証ならUNKNOWN/BLOCKEDであり、低層保持だけで保存候補PASSにしない。上位候補生成は元backup/currentを変えない。

## 負の対照と初回失敗

新機能なのでmain上の未実装エラーを既存製品のREDとは数えない。`/workspace/stage3a-negative-control`だけで二度目の読取りを省く故障を注入。同じ66試験SHA256 `e4bf0ef6e005db187e0f150d09a71438a8f97ed0266a3b1cf0303f676c38b262` に対して63 PASS / 3 FAIL / exit1、元の実装は66 PASS / exit0。検証中変更、可変reader、二読回数が故障を検出。`negative-control.json`、`negative-preflight-red.log`とGREEN logを保全。故障コードを製品へ混入していない。

初回UIは旧成功撤回後の要素なし（undefined）へ`.not.toContain`した7件で試験自体が失敗。要素が存在しないことの直接assertへ修正。最初の型検査でit.each配列の引数展開誤りも検出したため、named rowへ変換し、負ケースは想定JSON/区間例外メッセージまでassertする。型エラーを製品障害と数えない。追加formula置換の初回1失敗は参照先内容のUNKNOWNが正しく、依存先なしのPASSと依存先ありのUNKNOWNを別試験にした。初回のログは保持し、同一期待値の既存不具合修正とは称しない。

初回全node契約は79中78 PASS/1 FAIL/exit1。並列のunit/build実行中、既存0.1秒timeoutプロセスの開始メッセージが出る前にTERMとなった。既存契約/上限/期待は変更せず、独立診断49/49と最終逐次工程の全82/82を区別する（無根拠な再試行や失敗の削除なし）。

## GUIと証拠保全

ローカルブラウザ取得は既定cache path作成不能、作業用pathでは配布hostに403 Domain forbidden。制限回避なし。ローカルrunnerはブラウザ起動前失敗、0/8条件・exit1、`gui-local-first.log`。これは製品のGUI失敗とも成功とも認定しない。独立Actionsの8条件を最終HEADで検証する。新workflow groupは既存planと分離し、既存CIを取消しない。

新runnerはUTC/UUIDを含むexclusive新規dir、HEAD/tree/dirty/bundle/run/attemptのprovenance、進捗と終了結果、条件ごとPNG3枚、失敗traceを残す。CSS200%とcomputed text2倍の検査は別記録。実OS文字拡大ではない。成果物7日保持のため長期保全の保証ではない。初回GUI失敗証拠も上書きしない。

正式6/1128/592/132/3workers/30分は不変。PR115の正式5/6、1112/1128、585/592 geometry、130/132 PNGと欠測16/7/2、WebKit内部遅延UNKNOWN、過去の初回証拠一部上書き制約を継続。旧headに新しい実行が存在することは開始時Actionsで確認したが、その成功をこの差分へ継承しない。

最終HEADのCI・固有GUI・正式GUIは新Draft PRの本文/Checksへ実測後に追記する。未作成・未実行を成功としない。文書にCI結果を埋めるためだけの終盤pushを繰り返さない。実機iPhone Safari/VoiceOver/OS文字拡大/softkeyboard/物理ディスク永続化はNOT_TESTED。CAS/非協調writer/通知なしABA/確認後競合は未解決、Stage 3B実行許可なし。

原ログの末尾空白/改行は改変せず、該当4ファイルをgzipで保全。manifestに圧縮前後のhashと長さを記録する。保護blob確認の初回は存在しないcoverage-contract.mjsを参照しexit128、正しいci-contract.mjsで14ファイルを実測照合した。製品・試験結果には影響しない。


## 初回Actions固有GUIの停止と限定補正

提出2e157e1のStage3A run41386034547/job125086973412は最初のCh375/lightでexit1。ADD候補PASS、Space/focus、CSS200%（32px）と実測2倍（64px）のfit、別タブ更新のSTALE撤回までは成功。原文を別writerで元に戻し再取得した後にPASSを期待したが、CalculatorAppの既存storageConflictは再読み込みまで保持するため正しくBLOCKEDだった。既存保護を弱めず、同じ操作ではBLOCKEDを明示assertし、原文/アプリwrite0確認・明示reload後にファイル/選択/計画を新規作成する別操作を追加した。期待値を単に緩めたものではなく、永続する保護を試験する前提訂正。全体アプリ統合の追加1件でも保護継続を確認する（初回helperがexpression inputを選ぶ誤りはfile inputへ限定）。固有合計は92件へ。

保護理由を未保存編集という一律文に置き換えず、上流の理由文をそのまま保持・失効比較する局所表示改善も追加した。unsavedフラグはUIでは編集/保存保護が存在する時の保守的な拒否フラグであり、原因はblockedReasonの原文で表示する。実行禁止/保存API/Stage2は不変。

初回artifact13115590609は574421bytes/SHA256 256477beb09f97d00a6041882ed7e79d95c46e21f9db90681db035f2a2afd468、PNG3枚・trace1件を別dirで保持。コネクタで再利用file参照を取得したが、ローカルへの取得は403で停止、ZIP実体/PNG/traceをローカル検証したとは称しない。APIメタデータとjob decoded logを保全。再実行時も旧dir/成果物は上書きしない。無根拠なrerunではなく、試験側前提の修正commitを提出して新HEADを検証する。旧HEADの正式GUIが後続pushで取消された場合は、その実行を成功とはせず新HEADと分離する。

補正版の最終差分は全単体119files/2656・固有92・全node契約82、lint/型/両buildがexit0（revision-results.json）。最終67試験の同じsourceを使った二読省略対照は64 PASS/3 FAIL exit1、元実装67 PASS exit0。source SHA256 1fb77d8878593bb7e7d77a10d3c9630d6c7c1edab1393a65f74947fa17ee961a。旧66対照は旧証拠として保持し加算しない。
