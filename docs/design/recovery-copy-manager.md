# 復旧用保全コピー管理（Issue #110）

## 実装前の受入条件と境界

基準 main: `4f3713beea68566ed716280c487b885c5ca5dd5b`（PR #107 / #109 merged を2026-10-31 JSTに現物確認）。依頼全文: https://github.com/tetsujisugimori-coder/calculator-memo/issues/110 。保存v1、backup v1、既存8 recovery slot、4 * 1024 * 1024 UTF-16コード単位を維持する。容量は各record JSON文字列の長さの合計でありファイルbytesではない。

- 一覧0/1/複数、正常詳細、破損・未知version・キー欠落・読取不能を区別。既知8キーのみ取得し、不正recordも隠さない。全件を安定取得できなければ容量/空きはUNKNOWN。作成日時が不明なら補わず固定キー順へ。
- 内側rawが不正でも正常outer recordなら既存backup形式で証拠を書き出せる。outer同定不能はexport/delete不可。未知fieldと数値字句は原文のまま保持。端末保存完了は保証しない。
- 削除確認、独立承認チェック、最終ボタンの3段階。Enter、取消、二重操作、同値通知・clear通知・同一タブ世代変更で承認失効。単発一覧クリックで削除しない。
- 削除は現在データと8 slotの取得原文を直前照合、既知対象1キーだけremoveItem、直後に対象不存在と現在データ/非対象slotの完全一致を確認。例外・不一致はUNKNOWN、再試行/補正/自動rollbackなし。
- 復元画面の生存中は別のshared recovery-session Web Lockを保持し、削除はexclusive ifAvailableで拒否。同じ既存storage write lockも利用する。Web Locks未対応では破壊的な削除を禁止。復元自体の従来fallbackは維持する。旧クライアントや直接書込み、通知前ABA、readback後変更、ディスク永続化は保証外。
- 管理画面は通常保存を凍結し、未保存編集・競合状態は保持して削除不可。詳細・一覧・exportは通常保存キー、非対象copy、履歴/メモ/式/レポート/snapshot/確認履歴を書かない。

## 検証計画

依頼の25条件を単体・アプリ統合・独立8 GUI（Chromium/WebKit ×375/390 ×light/dark、CSS200%、ブラウザのtouch入力模擬）に割り当てる。REDは未実装module/失敗系から確認。既存正式6条件1128検査・592 geometry・132PNG・touch各1337・3workers・30分、backup/restore独立GUIを弱めない。最終HEADの全単体・契約・lint・型・通常/Pages buildとCI/artifactを確認する。実機Safari/VoiceOver/OS文字拡大/OS保存は実測なしなら未検証。

## 採用理由と対象外

第一希望は現在の保存方式と共通部品を再利用し、全体transactionのないlocalStorageで実現できる限定的な原文照合と協調lockを組み合わせること。session lockは復元前保全から承認までのcopy利用期間を削除から保護するためであり、保存形式にlease情報を追加しない。破損outerを推測修復して削除可能にする方式は採らない。一括・自動削除/上書き・同期・部分復元・移行・暗黙再生成は対象外。機能revert時も既存copyは消去しない。

## 受入条件の実装対応

|依頼項目|主な検証先・観測|
|---|---|
|1–3: 0/1/複数、使用量|`tests/recovery-manager.test.ts` と管理UI。record文字列長で計算、空き8から再計算|
|4–7: 詳細、破損、未知、取得失敗|同単体/UIと独立GUI。外側同定不能は操作禁止、内側の不正は復元可能としない|
|8–9: export原文・閲覧非干渉|単体/UI/GUI。既存backup envelopeに原文字句を完全保持し、data/他slot不変|
|10–12: 承認なし・取消・個別成功|UI/GUIの独立チェックと最終操作、Enter抑止、1件だけremove|
|13–14: 他コピー・現在data保持|backendの事前・事後全文比較、GUIで独立再取得|
|15–17: 連打・別タブ・同一タブ|同期refの二重実行禁止、storage/custom通知、世代失効試験|
|18–19: 復元競合・直前不一致|shared session lease＋exclusive削除、既存write lock、直前全slot/current照合|
|20–21: 削除失敗・読戻し不一致|remove前後throw、no-op、read失敗、非対象変化・承認失効をUNKNOWNとして停止|
|22–23: 再計算・容量上限|削除後snapshot再取得、8slot/上限超過、部分取得は数値UNKNOWN|
|24: backup/restore回帰|既存単体群と独立backup/restore CI。正式GUIとは別結果|
|25: mobile|独立recovery CI 8条件。実機・OS保存とは区別|

## 実測と既知の境界（2026-10-31 JST）

- 実装開始時REDは未実装moduleのimport失敗であり、25件の振舞いが個別にREDだったとは主張しない。
- ローカル全単体: 113ファイル/2432試験PASS。独立安全レビュー: backend25、管理UI15、既存restore storage16/UI11の67試験PASS。別のstateful lock fakeでもlease中拒否、解放後成功、両lock解放と原文不変を確認。
- 既存契約を含む53試験の初回は52成功/1失敗。既存の0.1秒合成timeoutでNode起動時の期待ログが出る前にTERMされた。対象contract/run-stageはbaseと同一。対象だけの同条件再確認は1/1成功。初回失敗を取り消さず、最終CIで別途観測する。timeoutや期待値は変更しない。
- 実Chromiumの初回GUIではcloseアイコン40pxを検出。管理モーダルだけ44pxへ局所修正。続いて390px確認欄の日本語閉じ括弧によるDD横幅超過を観測し、管理欄の改行制御だけでは解消せず、最小DOM/文字Rangeで閉じ括弧の突出を再現。末尾0.5em余白で全字を領域内へ収める局所修正（クリップなし）。証拠はCI artifactとPR実測記録に分離する。
- ローカルWebKitは必要host libraries欠落でページ作成前にBLOCKED。OS環境を変更せず、正式な独立CIのbrowser setupで8条件を検証する。ローカルChromiumの成功をWebKit成功とは扱わない。
- 読取・書出し・削除の検証は架空データのみ。実利用者の保存データや保全copyは操作していない。
- 最新HEAD・CI URL・各ジョブ成否・artifact・実機未検証はPRへ記録。旧HEADやモック成功で最終実ブラウザ成功を代用しない。

- 修正後ローカル実Chromiumは375/390 ×light/dark ×CSS200%の4/4条件、各12検証群/22模擬touch（48群/88操作）PASS。削除後UNKNOWN時removeItem呼出1回・全storage不変も確認。2026-10-31 12:14 JST、base 4f3713b のdirty作業版。WebKit起動不能によりrunner全体exit1、8/8成功ではない。最終commitのCIへ引き継ぐ。
