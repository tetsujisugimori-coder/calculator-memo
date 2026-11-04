# Stage 3B-1 保存安全性検証基盤

2026-11-05 JST。Refs [#122](https://github.com/tetsujisugimori-coder/calculator-memo/issues/122), [残件 #121](https://github.com/tetsujisugimori-coder/calculator-memo/issues/121)。開始時remote cloneのmain `a37eb9b231f724440c727f130a9fd4913833ecb0` / tree `26c09e8e1cfe1896aedbfc9d0c9e146f5c93f408`を確認。旧ローカルcheckout（4f3713b）は変更せず別directoryへcloneした。既存worktree/未追跡物/過去証拠は保全。

## 決定と境界

**試験専用の共通保存コーディネーターを採用。実保存安全性はUNKNOWN、製品選択復元はHOLD。** `tests/storage-safety/`に限定し、app/components/libからimportしない。現行通常保存・全体復元・保全管理を変更しない。結果にも`executionAllowed=false`を残す。新しい製品ボタン・実データ・保存形式変更・自動retry/rollbackはない。

仕様上[localStorageはagent cluster間のlockingを仮定できない](https://html.spec.whatwg.org/multipage/webstorage.html#the-localstorage-attribute)。[Web Locks](https://www.w3.org/TR/web-locks/)は同じresourceを協調して使うcontext間の排他であり、setItem自体を封鎖しない。以下の判断はAPI境界からの推論。仕様参照2026-11-05 JST、配布ブラウザのdisk保証とは別。

| 方式 | 安全性・通常保存整合 | 互換性・規模 | 復旧 | 判断 |
| --- | --- | --- | --- | --- |
| 既存全体復元拡張 | 保全/承認/write共有は有効。通常writerの統括は別途必要 | 小〜中、製品経路へ影響 | 既存3結果だけでは再起動intent/全履歴の表現不足 | 製品は変更せず保全関数を共有 |
| 選択専用transaction | 状態を明示できるが通常writerが別lockなら競合 | 中、v1原文互換 | 通常保存がUNKNOWNを無視し得る | 単独方式は不採用 |
| 共通coordinator | 同タブgate、同名Web Lock、全writer共通HOLD。非協調は範囲外 | 中、試験ordinaryも同じ状態機械 | intent/初回障害/保全ID/別復旧record | **試験基盤として採用** |
| IndexedDB等への構造変更 | 比較/保全/更新/intentを同一transactionにする将来案。旧localStorage writerの排除は別 | 大、migration/旧タブ/互換審査が必要 | abortとcommit結果不明、外部書出しが必要 | 今回製品へ導入しない |

## 状態と成功条件

`NEW → CHECKING → PRESERVING → PRESERVED → PREPARING → WRITING → READING → OBSERVED_MATCH`。

- CHECKING: caller-owned candidateをdeep copyし、lock後にStage3Aの再生成・二読検証。current/backup全文・file識別・選択集合・規則/generation/epoch・未保存/blocked・候補/保持区間を照合。
- PRESERVING: 既存`preserveRestoreSource`を共有。v1 record、8slot、各2Mi UTF-16、合計4Mi record長、current厳密一致、occupied slot非上書き、copy再利用を維持。破損/容量/quota/set/read例外/不一致は拒否。失敗後に新copyが残っても自動削除しない。
- PRESERVED: record全文/raw読戻し済、primary writeなし。copyのidentityはslot key＋serialized全文＋raw全文＋createdAt。時刻だけで同定せずoperation IDと結ぶ。同一rawのcopy共有は可能。
- PREPARING: Stage3A/current/copyを再照合。試験ordinaryも同じgate/lockへ入る。
- WRITING: 不確定intentをledgerへset/getしてから、再検証・copy/current最終読取り・単一primary setItem。最終確認とset間にawaitはないが他agentを防ぐ証明にはしない。`attempted=true`は**試行intentの保守的marker**。実setItem回数とは別（traceで数える）。intent後失敗はwrite0でもUNKNOWN。
- READING: 実currentと候補全文の一致を確認し、backup/selection/rules等も再照合する。その再生成時だけcurrentを元plan原文へ置き換えるが、その前に実current==candidateを独立確認する。copy全文も再確認。
- OBSERVED_MATCH: primary読戻し一致とresult ledger保存/読戻し完了の**観測事実**。SUCCESSとしない。assurance=COOPERATIVE_OBSERVATION_ONLY、executionAllowed=false。disk flush/電源断/将来writer/非協調競合なしを保証しない。
- REFUSED: intent前拒否。保全済未writeはhistoryで区別。保全副作用なしとは限らない。
- UNKNOWN: intent以後の例外・中断・不一致/読戻し不能・result保存不能。初回failureのphase/reasonを保持、再実行と通常writerを停止。UNKNOWN→成功の遷移はない。

terminal IDは再利用不可。不正遷移、保全なしwrite、readbackなし結果、attempt後REFUSEDをモデルで拒否。読戻し時にも全historyを検証。ledgerはtest namespaceの別キーで製品形式変更ではない。全履歴serializeによるquota/IO/timing負荷がある。容量不足なら自動清掃せず停止。非協調ledger改竄や物理永続性は保証しない。

## 中断と記録失敗

各checkpoint前にledgerをset/get厳密照合。intent未確認ならprimaryへ進まない。同processのledger不確実性はpoison/HOLD。再起動時の非terminal recordはUNKNOWNと提示し、current==candidateでも成功と推定しない。新選択/ordinaryは未解決recordを見て拒否。過去OBSERVED_MATCHは起動時の現在状態ではない。

合成例外中断と、実ブラウザでintent後にproducer pageをcloseしfinallyが走らない中断を分離する。ブラウザ全体kill/OS終了/電源断/physical flushはNOT_TESTED。ledger/保全/primaryは別キーで一体commitではない。同時喪失や永続化順序は証明できず、marker自体が失われたら検知不能になり得る。製品writeを許可しない。

ロック要求のrejectを観測したらprocessをHOLDとし、遅れて再開するcallbackもcheckpoint後とpersist前のactive guardで停止する。所有権喪失後はledgerにも書かない。そのため喪失理由の詳細は結果メモリだけに残る場合があり、再起動時は最後に確認済みのnonterminal intentからUNKNOWNとする。すでに保存済みOBSERVED_MATCH後のlock解放例外では、過去の読戻し事実は保存されても解放成功の証明はない。喪失通知自体が届く前の非協調競合まで防げるとはしない。

## 競合の保証境界

| 経路 | 今回の対処 | 限界 |
| --- | --- | --- |
| 同タブ試験writer | busy gate、lock後再検証 | 製品saveDataは未接続。直接setItemは範囲外 |
| 協調別タブ | 同名Web Lock/同bucket、ifAvailableで拒否 | 全writer参加が必要。未対応/取得例外は拒否 |
| storage通知 | epoch反映readerなら変更/通知ABA拒否 | 非同期で到着保証なし。同タブ通知なし。通知なしABA検出不能 |
| final read前の変更 | 原文/epoch不一致で拒否 | 通知なしA→B→Aは不明 |
| final read/set間の非協調 | **上書きされ得る反例を保持** | CASなし。awaitなし/同スレッド/Web Locksで解決としない |
| write後の変更 | readback不一致はUNKNOWN | 読戻し後の変更は過去一致を未来保証にしない |
| 保全slot race | 空き/current/record再照合＋協調lock | 非協調slot確保とのCASなし。最終確認後のoccupied化は防げない |
| 終了 | nonterminal intentはUNKNOWN | intent永続化/終了通知自体は保証不能 |

## UNKNOWN時の人手復旧

1. 自動保存・再実行・rollbackを停止。他タブの新しい内容を古いcopyで上書きしない。未保存編集も別退避する。
2. currentを新たに読取り、存在/欠落/不能と取得時点、完全UTF-16原文を保管。読取不能を空文字にしない。
3. operation ID/history/初回failure、copyのslot＋serialized/raw/createdAt、候補全文を照合。current==candidate/current==copy/その他/UNKNOWNを分ける。件数・時刻だけで正常としない。
4. current/copy/candidateを個別に既存backup形式へ封入してJSON書出し。保全管理の個別書出しを共有可能。要求は端末保存完了ではない。copy欠損/破損/不能なら推測修復しない。
5. 人が比較して別承認。既存全体復元は、その時点のcurrent保全・検証・承認と既存競合限界を伴う別操作であり、UNKNOWN自動解決ではない。
6. 試験recoverはoriginal UNKNOWN、expectedCurrent厳密一致、copy直前照合、別ID、承認trueを要求。現在内容を再保全してからwrite/readback。original recordは変更しない。成功してもoriginal UNKNOWN/HOLDは残る。承認なし/copy変更は独立拒否結果、復旧試行後不明は別UNKNOWN record。製品復旧UIを追加したとは称さない。

## 次工程と許可条件

基盤完成、main試験限定統合、実保存許可は独立。Stage3B-2は全writer/旧タブ棚卸しと共通gate、製品UNKNOWN停止、非協調writerの許容不能条件と移行比較、承認失効、marker喪失を先に審査。IndexedDB移行もv1原文互換/migration/旧タブ排除/復旧を別Issueで扱う。

実保存許可は**NO**。実保存P1: 非協調TOCTOU/ABA、保全slot race、三者非原子的永続化、製品writer未統合。P2: marker喪失検知、製品手動復旧/外部書出しUX、再起動HOLD。P3: 実機Safari/VoiceOver/OS拡大/soft keyboard/長期保存、Windows/Linux差。基盤自身のreview指摘と区別する。R1/R2過去根因UNKNOWNは#121で維持。

[実行・初回失敗・検証台帳](../maintenance/storage-safety-20261105/verification.md)。
