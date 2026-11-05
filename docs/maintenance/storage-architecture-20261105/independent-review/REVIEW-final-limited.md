# Stage 3B-2 独立限定受入

2026-11-05 JST。実装担当とは別担当。初回[FAIL](REVIEW.md)と[固定HEAD再レビュー](REVIEW-1df6f24.md)を保持。

## 対象と結論

実装固定HEAD `1df6f24a1641dca7bff189f68099a4501c79fe60` / tree `b6a0ee9242eb17ebde41c914db97d23cd437b07d`。
その後の**文書だけの追記差分**を読み、PoC実装範囲と推奨facadeの保証を分離したことを確認した。
追記済みworking blob（git hash-object）:

- 設計: `1df93897f3de51141e39397480ba94a22413fe36`
- verification: `4a0c297f3ba08dca16f187d84d5a91803366c564`
- LOG: `eb11f9508bbae243b21e4d1511ac276aa25b11d2`

scope説明は、HOLD定数がruntime gateではない、abort後の別commitが可能、UNKNOWN intent/外側failureがこのcoreでは永続化されない、writer labelがprotocol gateではないことを明示している。
状態図は完成済みPoCの説明から推奨製品facadeの要求へ区分され、次工程P1-3にcontroller/別診断/protocol検証の受入条件が加わった。独自3反例と一致する。製品コード変更で隠したものではない。

**設計・棚卸し・試験専用差分の独立受入PASS。マージ推奨YES（この範囲のみ、最終commit CIの成功確認を別途必要条件とする）。**
製品保存機能全体の完成判定はPARTIAL、実選択復元の保存許可NO。executionAllowed=false、Stage3B HOLDを維持。

## 修正HEAD native成果の独立照合

提供された修正HEADの原artifact summaryを全case読み、[独自script](verify-corrected-native.mjs)で次を照合した。[結果JSON](corrected-native-verification.json)。

- [CI run 41999757708](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/41999757708)、attempt1、HEAD/tree一致、dirty=false。
- summary SHA256 `54784517007f5d4bfc511311a53016dfdcb516dc69c79aebf39ed8aebfef16af`。
- PoC source SHA256 `2af26f08a44b58abdaec992df89593b82300eb35b60cb81fdc37da12b889f231` を固定HEADのgit blobから独自再計算し一致。
- Ch141.0.7390.37 / WK26.0、各15case、pageerrors0、全観測oracleに一致。
- connected GitHubの固定HEAD workflow検索でも当該run completed/successを独自確認。Stage3B-1/3Aもsuccess、正式GUI/Stage2は確認時in_progressだったため、この記録では全CI成功と称しない。

ブラウザ実行はCIが行い、本担当は原artifactを独立照合した。ローカルnative実行をしたとは称さない。
旧native成果を修正HEADの代用品にせず、新artifactのprovenanceを照合した。

## 独立反例・残件

R2-1（空/矛盾観測受理）とR2-2（W16通知誤記）は解消。旧validatorが受理する厳密同入力を新validatorは拒否し、実CI原summaryを基準とする独自192欠落/矛盾変種も全拒否。
作者45＋既存独自12＋追加独自3=60/60、skip0/cancel0。初回11/12 FAILは原ログのまま保持した。

次工程P1の製品全writer統合/UNKNOWN停止controller/永続診断/protocol gate/旧側分岐救出、P2容量・履歴・保全削除/互換adapter/復旧UX、P3実機・長期保存は未実装/未検証。
旧タブ排除不能、同origin任意変更、LS跨ぎ非原子、全消失・整合巻戻し、receiptとUI ack、媒体永続化の限界は受入後も変わらない。

最終証拠commitは本記録の後に作られるため、そのSHAのCIをこの記録で先取り認定しない。親担当が差分同一性と全CI終端を照合し、PR本文に最終結果を記録する。
