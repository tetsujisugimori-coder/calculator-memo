# Stage 3B-6 検証台帳

基点 main ce87b7caccbdf5b36589de75bd91e7feaa65763a、tree 1b87321153960da451efc87bcb8c0bc5075cedc3。
Issue #132。実装と自己検証・独立レビューは分離する。

## 初回自己検証

2026-11-07 JST、Linux、Node24.22.1（CI固定22.13.0とは異なる）。新規単体29件、証拠検査器Node26件、型検査成功。最終HEAD結果ではなくdirty初期実装の局所確認。保存原文不変、捕捉gap非再構成、receipt欠落、ABA、巻戻り、branch hash改変を確認。原ログは実行環境の /tmp/stage3b6-* に一時保存。後続の永続証拠と最終CIを別記する。

## 未実施（初期記録）

最終HEAD全回帰、nativeブラウザ、正式GUI6条件、原artifact照合、独立反例/レビューは確認前。過去Stage3B-5成功を今回件数に加算しない。Draft維持、マージ推奨NO。

Stage 3B HOLD / executionAllowed=false。実データ移行・本番切替NO。実機Safari・媒体永続化・実quotaは未保証。

初回lintは新runnerの変数名moduleにNext.js規則違反1件。fixtureModuleへ局所改名して再検証する。既存warning3件は不変更。ブラウザ初回installはHOME cache作成不可（ENOENT）だったため許可領域/tmpへ保存先を明示して再試行。依存lockは不変更。

## 初回回帰と自己反例

同一tree929a9049で全129files/2982tests、型、通常/Pages build成功。Chromium375/390/765/1280の64診断ケース成功。WebKitは公式binary取得済みだがhost依存不足で起動せず、成功に含めない。Node契約の一斉実行は310/311で、既存100ms故障注入テストの子processが出力前にtimeoutした。条件を変更せずfile直列実行で311/311成功、初回ログを保持する。

追加自己反例2件は原HEAD f7082543でRED（元29件は成功）。過去source Bから現在Aへの復帰がCONSISTENTとなる問題を、過去観測との差分CONFLICTで拒否。破損headと明示HOLDが共存するとHOLD所見が消える問題は、構造判定とHOLD記録の独立化で修正。同反例で31/31 GREEN。独立レビューとは呼ばない。

ローカルWebKitはDebian公式snapshot由来の既設展開済み依存ライブラリを/tmp browser bundle sys/libへ補完して実行予定。固定binaryの明示executablePathを記録し、CIではこのoverrideを拒否する。ldconfigのシステムcacheへ変更せず、repo依存/lockとブラウザbinaryは変更しない。CIの標準launcher結果と別扱いにする。

## 別枠native診断の実測

公開HEAD `163bcdab984796e59804d926093e7c2b52acfb97` / tree `b44b3ebe8b3200926d9c59e45eb9baa95543f7ba`で、Chromium141.0.7390.37 / WebKit26.0、375/390/765/1280pxの8条件×16ケース=128ケース成功。実IDBへ隔離故障を投入し、診断前後原票一致・mutator呼出0・UNKNOWN再読込保持・close後旧要求の失効を確認。代表PNG8枚、全文JSONとbundleを別実行dirに保存。iPhone Safari実機ではない。製品の正式GUI6条件とは別結果。

同HEADの全129files/2984tests成功。初回31局所試験には自己反例2件を含む。証拠検査器を追加強化し、理由コード欠落・原票不一致・候補hash不一致・再読込原票欠落を拒否する30件の正負対照を確認。固定JSONは一つの実行contextを使った構造テスト用fixtureで、複製した条件を新規ブラウザ実行とは数えない。

最終の独立レビュー・正式GUI原artifact・全CIはPR #133最終Checksと後続記録を正本とし、この中間成功だけで限定マージYESにしない。
