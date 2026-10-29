# PR #103 WebKit 390px 診断記録（再構成要約）

## 結論と証拠の範囲

**PARTIAL / マージ推奨 NO。時間上限の根本原因は未確定。製品修正は採用しない。**

診断実施日は2026-10-28 JST、本文書の再構成日は2026-10-29 JST。環境再起動後、未commitの診断文書・スクリプト・ローカルJSON・trace・試験ログは関連workspaceに見つからなかった。本書は担当者間の保存済み会話引継ぎから再構成した要約であり、生データの復元・今回の再実測ではない。失われたJSON、スクリプト、候補patchを推測生成しない。

現環境で再確認したもの：remote/PRコードHEAD `52f4f6914fcd3c72b0829018842f653f06abe5f2`、main `7cdda5ce627fb431aec1a70ddd909e7fa01fdd3c`、Draft/open、既存artifact APIのID・サイズ・digest・期限。以下の実測内訳・独立照合・ローカル成功は再起動前の観測報告であり、今回再実行したものではない。

## 既存正式CI（変更前コード52f4）

[run 40671009347](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/40671009347) のattempt 1 / 2は別々に保持する。両方30分job上限でcancelled、Chromium4条件とWebKit375pxは完走、WebKit390pxは未完走。既存一覧往復と今回本文側6群は全6条件で通過したとの既存観測だが、正式全体PASSではない。

|項目|attempt 1|attempt 2|
|---|---:|---:|
|job ID|122757462369|122772042550|
|検査（要求1128）|1115|1112|
|geometry（要求592）|585|585|
|PNG（要求132）|130|130|
|trace|0|0|
|WK390検査（要求188）|175|172|
|WK390 geometry（要求98）|91|91|
|WK390記録済touch|1276|1262|
|job開始→GUI工程開始|226秒|212秒|
|GUI工程開始→取消|1588秒|1602秒（26分42秒）|
|取消→job終了|4秒|4秒|

30分はGUI単独ではなくjob全体の制限。実job時刻差は取消後処理を含め30分18秒。outcome/inventory/upload/link/checkout後処理成功、任意cache後処理skipとの既存報告。WK390のerrors 0は未完了を成功にしない。

artifact 12809842419: 40,309,061 bytes、SHA256 `04d4e74ef080623cbb6858e5021ce5666748b99485feb56f6c0ab2af0f5b6534`。
artifact 12811567671: 40,321,548 bytes、SHA256 `dacd9afc1f80fc1bce7e431f5448bd20187ca7867cf50e332ea9c700819edc71`。
再起動前にZIP再取得・API/hash・全12条件のSHA/run/attempt/servedIdentityを独立照合したとの報告あり。今回はAPIメタデータのみ再確認し、ZIP再取得・再計算とは区別する。API期限はそれぞれ2026-11-04 10:48:17Z / 11:20:57Z。

## 共通区間比較（再起動前の独立集計）

同じ完了51区間・1232操作を比較し、未完了区間を混ぜない。

|秒、WK375→WK390|attempt 1|attempt 2|
|---|---|---|
|区間総時間|893.604→1517.250|932.630→1565.635|
|tap wrapper|533.328→1065.903|550.759→1090.396|
|dispatch|485.346→1017.678|496.623→1040.717|

attempt 2の差633.004秒のうちdispatch差544.095秒（約86%）。新機能より前の既存区間から遅延し、両workerは同時に開始しているため開始待ちだけでは説明できない。resource観測合計は0.9秒未満、撮影28.01対33.78秒との報告。他worker終了前後の速度変化は一貫せず、操作構成も異なる。DOM蓄積、環境、製品のどれかを根因と断定する証拠には不足する。

## 限定診断と採用しなかった候補

事前に目的・範囲・上限・停止条件を親担当/独立担当と確認した診断のみ。正式6条件再実行とは別。Playwright 1.56.1 / WebKit 26 build 2215、ローカルDebian13とCI Ubuntu24の環境差あり。公式依存を一時領域に補完し、製品依存やsystem設定は変更していない。

- 最初の390試行はnewPage setupが成立せず600秒外側上限で停止、操作0/検査0。性能対照やCI原因に転用しない。補完後の測定は別試行。
- fresh context引用区間375→390：各76操作/13検査/errors 0、区間42.383→45.984秒、actionability 7.529→15.966秒。CI全体の総時間差は再現していない。DOM（hidden含む）245–1030。trace/観測負荷を独立に控除できず、fresh contextは長prefixや並列負荷と同条件ではない。
- nested dialog背面topbar blurを診断用に無効化するABBA/BAAB：各52操作・12往復・errors 0、外側上限各300秒。baseline→無効化のwall中央値は700.134→631.553ms、733.187→624.776ms、actionabilityは233.15→206.37ms、252.14→180.78ms。局所的寄与の仮説であり全未完走の原因確定ではない。
- 実製品CSS候補での同系統2測定はwall中央値601.211msと748.126ms、actionability166.07msと193.58ms。後者総時間はbaselineより悪く、都合の良い指標だけで採用しない。既存意図の「漏れ」と断定せず、新たな背面filter抑制拡張の候補として扱った。
- 初期setup停止待ちprocessが前半測定と併存した可能性があり、後半候補測定とは負荷条件が一致しない。この制約も採用を支持しない。
- 候補の同期待値selector試験11 RED→11 GREEN、native header期待RED→候補6条件×2資料×両theme×100/200%=48layout、60modal phase、36hidden fixture成功との報告。保存bytes/focus/可読性の安全試験成功だけでは性能採用根拠にならない。

**判断変更：候補試作 → 総時間改善の支持不足 → CSS・試験helper・候補unitを撤回。** 固定sleep/force click/期待値緩和/上限増で成功扱いにしない。追加診断や正式GUI再試行は実施しない。

## 検証版と提出版を区別

候補撤回後のコード52f4相当作業版で、再起動前に2299単体/105files、46契約、lint、型、通常build、Pages build成功との担当報告がある。候補時2310単体と混同しない。原ログは現環境にないため再読検証不可。これを本書を追加した最終文書HEADのCI結果とは扱わない。

今回はREADME/LOG/本文書だけを変更し、製品・試験・workflow・依存ファイルは52f4から不変であることをgit差分で確認する。本人の2026-10-29 03:18 JST承認により文書commitにCI skip指定を付ける。workflow条件を変更せず、最終文書HEADのCIは未実行として提出する。正式1128検査/592geometry/132PNG/mobile各1337、6条件、3workers、job30分、成功trace0は維持。

READMEは初回一覧往復の元選択（未選択を含む）/一覧位置/発火元focusと、本文側step成功後の移動先詳細復帰を区別する。閲覧は確認済み・妥当性・点検完了を意味しない。実機iPhone Safari/VoiceOver/OS文字拡大は未検証。

残件：既存WebKit390時間変動の独立切分けと正式6条件完走。測定条件差・長prefix/worker負荷を整理した根拠が必要であり、worker数/上限変更や無根拠rerunを許可するものではない。

Refs [Issue #102](https://github.com/tetsujisugimori-coder/calculator-memo/issues/102)、[Draft PR #103](https://github.com/tetsujisugimori-coder/calculator-memo/pull/103)。

2026-10-29 03:22 JST
