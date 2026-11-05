# Stage 3B-2 独立再レビュー（1df6f24）

2026-11-05 JST。初回[REVIEW](REVIEW.md)と原FAILは保持。本記録は修正後の別判定。

- 固定HEAD `1df6f24a1641dca7bff189f68099a4501c79fe60`、tree `b6a0ee9242eb17ebde41c914db97d23cd437b07d`。
- Windows / 既存Node `v24.20.0`、install/製品writer/実データ変更なし。実装担当とは別担当。
- 対象差分: 各caseの観測oracle、strict provenance、負対照fixture/tests、writer W16訂正、inventoryをbase git bytesへ固定、LOG/検証記録。

## 同一反例のRED→GREEN

作者から渡された**実際の初回CI artifact**を全case読んだ。入力summaryのSHA256は
`ac2f9ab646b23e588c6ad65b427d85581967ae829ec91b8f9861cd97026dbbd7`。
provenanceはHEAD `525c383efbb0251fe097431ca68c6674f1c70224` / tree `d66ebb3aa3c7a25df8e360b81dbe7807399f46ca` / run `41999033337` / attempt1 / dirty=false / Linux Node22.13.0。
Ch141.0.7390.37、WK26.0、各15case、pageerrors0。旧SHAのnative結果を修正HEADのnative実測と称しない。

独自[recheck-oracles.mjs](recheck-oracles.mjs)を実summaryに実行し、正常入力は現validatorでerrors=[]。
同じ正常入力のCh `same-generation-two-tabs` のoutcomesだけを二重COMMITTED_OBSERVEDに変更。
旧525c383 validatorはerrors=[]で誤受理し、修正validatorは`chromium oracle same-generation-two-tabs`で拒否。
他caseが空だったことや新provenance要件の不備で拒否されたという比較ではない。
[同入力](same-input-oracle-negative.json)、[独立結果JSON](oracle-recheck-result.json)、[ログ](oracle-recheck-1df6f24.log)を保存。

さらに各15case×両engineのobservation空/欠落/全leafのnull化、provenance欠落/dirty、summary矛盾/engine重複/書込許可/HOLD解除の**独自192変種を全て拒否**。
ソースを読んだうえで、fixtureを作者の正例moduleから作らず、実CI原summaryを健康正例に使った。

**R2-1/P2 解消。** runner内部assertだけでなく、artifact validatorも実際の観測値の矛盾を拒否する。
W16は現行`notifyRecoveryChanged`呼出0/定義・購読のみへ訂正され、実ソースと一致。**R2-2/P2 解消。**

## 独自core限界の追加確認

[core-boundaries.node-test.mjs](core-boundaries.node-test.mjs)で次の3条件を実行。

1. 手動transaction adapterでabort→UNKNOWN後、同root/同token・別IDを直接commitするとCOMMITTED_OBSERVED。
   PoCはtransaction coreであり、`HOLD=true`定数はruntime gateではない。UNKNOWN後の保存停止controllerは未実装。
2. post-complete originalFailureは外側結果にあり、root/receiptに永続化されない。永続UNKNOWN/failure台帳はこのPoCにはない。
3. 任意の非空writer labelもPREPARED。protocol capability gateはまだない。

これらは無条件自動retryを実装したことを意味しない（自動retry codeなし）。
一方、PoCが次段階の全writer facade/HOLD/failure controllerまで完成したとの主張はできない。設計状態図のUNKNOWN→HOLDは次段階の採用条件として区別する必要がある。
writer/protocol gateの未実装は既に設計表に記載がある。HOLD/failureの境界も同じ明確さで本設計へ追記することを実装担当へ返した。

再実行は作者45＋既存独自12＋追加独自3の**60/60成功、fail0/skip0/cancel0**。[raw log](recheck-1df6f24.log)。
元の独自12testのoracle行が現在成功する事実だけは解消根拠にしない（上の実summaryを用いた厳密同入力比較が根拠）。

## 保証限界・判断

native初回成果は全caseの入力/操作/期待oracleと一致。lock bypass/通知subscriber不在ABA/final-check gap/旧LS分岐/専用Worker複数性は「反例を観測」のPASSで、安全性解決のPASSではない。
native tx.abortは試験注入、post-complete例外も注入。実page closeはbrowser全kill/電源断の証明ではない。実機Safari/SharedWorker運用/長期sleep/媒体保存はNOT_TESTED。

R2-1/R2-2再受入PASS、新規製品安全性の保証なし。
**限定マージ推奨: scope説明の追記を確認し、最終HEAD CIが成功した場合にYES（設計/試験専用差分のみ）。**
修正HEADのnative結果はこの記録時点で未読、最終CIの認定は親担当/後続記録で別照合する。実選択復元の保存許可NO、executionAllowed=false/Stage3B HOLD維持。
