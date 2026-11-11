# Stage 3B-11 設計研究: 照合と利用の結合

2026-11-11 JST。関連 [Issue #142](https://github.com/tetsujisugimori-coder/calculator-memo/issues/142)、Stage 3B-10。設計と将来の検証条件のみ。Stage 3B-11 の製品実装は別 Issue・別 Draft PR と明示的な依頼で扱う。

**Stage 3B HOLD、executionAllowed=false、writeAllowed=false、authority=NOT_ESTABLISHED。製品データへの実書込み許可 NO。**

## 1. 現行実装から確認した事実

- Stage 3B-8 `createDecisionLifecycle` は判断資料の生成・通知失効・利用直前の二重読取りを扱い、`useForReview` の allowed は読取り専用の資料利用に限定される。製品の書込み許可ではない。
- Stage 3B-9 の session は非同期要求の epoch、旧応答の破棄、要求 ID と現在資料の分離を扱う。最終 PR #141 HEAD は `0a1dc37d400627d99ba226cb7bb2bbdb78d29092`、main への merge は `6b7d46d2dd98058968860802c56eb2edd043dcf7`。
- Stage 3B-2/4 に隔離 IDB の token 条件付き更新・保存記録・UNKNOWN の研究がある。新しい競合保存形式を作るのではなく、これらの contract と既存 facade の統合条件を次段階で検討する。
- 二重読取りの最後の読取りから利用開始までの競合は残る。通知や Web Lock だけでは、非参加 writer を強制停止できない。localStorage の read と set を IDB transaction 内へ書いても、localStorage と IDB の跨媒体原子性は得られない。

以下は設計上の比較と提案であり、製品で実証した保証ではない。Stage 3B-10 の実測結果は Issue/PR の最終 SHA 付き報告と区別する。

## 2. 候補比較

| 候補 | 安全性と限界 | 互換性・既存設計 | 実装負担 |
| --- | --- | --- | --- |
| 世代による条件付き操作 | incarnation・generation・operation ID・対象 digest が一致する場合のみ利用。ただし比較と書込みが別なら再び TOCTOU。非協調 writer が世代を更新しない ABA は検出不能 | Stage 3B-2/4 の token と整合。localStorage 単体には CAS がない | 中。token 検証・上限・対象束縛・拒否理由が必要 |
| 同一 IDB readwrite transaction 内の比較と更新 | 対象 scope 内の再読取、条件確認、原文保全、current/receipt 更新を一括化。abort は変更を確定しない。complete を媒体への永続保証と同一視しない | 既存隔離 IDB adapter を拡張する第一候補。必要 store 全部を scope に含める。旧 localStorage writer には効かない | 高。全 writer 統合、形式検証、intent/UNKNOWN、容量、復旧が必要 |
| Web Locks + IDB transaction | 協調クライアントの調停、重複要求削減、UX に有用。正当性の最終境界は transaction 内比較。別 lock 名や lock 無視 writer は排除不能 | 現行同名 Web Lock 利用と対応するが、API 不在時の同タブ queue を同等保証と扱わない | 中〜高。取得失敗・abort・終了・再取得時の再検証が必要 |
| 判断資料と実行対象の束縛 | 資料 ID、session/boot ID、明示操作 ID、全入力 fingerprint と永続 token を結合。古い UI 資料を新しい対象に流用しない | Stage 3B-8/9 の ID/epoch と整合。hash は真正性・権限証明ではない | 中。選択・backup・authority 等の全依存を定義する必要 |
| 通知欠落を前提に利用境界で再検証 | BroadcastChannel/storage は失効を早めるヒントのみ。欠落・遅延・重複・順序逆転でも永続状態から再照合。単なる直前再読取だけなら最後の gap は残る | 現行 lifecycle を読取り専用層として保持し、将来の原子的利用 API と分離 | 中。freshness と execution authority を別に表示する必要 |

## 3. 条件付き推奨

1. UI の照合結果を実行トークンとして直接消費しない。将来の API は `expectedToken + explicitOperationId + completeTargetBinding` を受け取り、永続状態から必要情報を再取得する。
2. 同じ IDB transaction 内で token と対象を比較し、current・保全・receipt を一括更新する方式を基本候補とする。Web Locks は協調と待機表示の補助とする。
3. raw hash 一致だけでは受理しない。同じ内容へ戻っても incarnation/generation/operation が変われば旧資料を拒否する。世代を更新しない非協調 ABA は UNKNOWN と明記する。
4. transaction 途中に任意の network、timer、ユーザー操作待ちを挟まない。非同期 hash 等が必要なら事前計算した値を transaction 内の再取得値と結び付ける方式を別途検証する。読取 request の success と transaction complete を混同しない。
5. abort・通信不達・応答消失・lock 失敗・状態欠落は元要求を UNKNOWN/HOLD に固定する。新しい一致した読取りを元操作の成功や自動 retry 許可へ格上げしない。
6. 旧保存先と新 authority の排他的切替・全 writer 参加・非協調旧タブ対策が未確立なら、製品実書込みへ進まない。

## 4. Stage 3B-11 で必要な検証

- 同じ token の同時 2 要求は、一方のみ条件成立。受理/拒否と receipt/保存原文を独立照合する。
- check 成功後、transaction 開始前の別 writer 変更は拒否する。transaction 内に競合 writer が待機する場合、順序・complete・最終状態を原票で証明する。
- transaction の scope から依存 store を一つ外す変異、比較を transaction 外へ移す変異、token の一要素を無視する変異を RED にする。
- content ABA と generation/incarnation reset を区別する。世代欠落・巻戻り・overflow・異なる namespace は UNKNOWN/拒否とする。
- 遅延した旧 session 応答、reload、BFCache/長時間 sleep、タブ終了、lock 取得待ち終了、transaction 中終了、complete 後 ack 喪失を別のケースとして記録する。
- 通知を止めても安全な拒否が成立する。これは「実通信 PASS」の代わりにはしない。通信の健全性と操作の安全性を独立集計する。
- 非協調 writer の観測可能変更は検出し、未観測 ABA を検出できたと主張しない。実際の既存旧タブは別の read-only/隔離検証計画が必要。
- IDB と localStorage の一部だけ更新された状態を正常扱いしない。跨媒体の自動 rollback、統合、移行や消去を行わない。
- 原票欠測、部分完了、タイムアウト、例外、cleanup 失敗、異なる SHA/attempt の混入は PASS にしない。
- Chromium/WebKit の結果と実機 Safari、private mode、実 quota、OS kill、物理媒体の結果を分離する。

## 5. 開始条件と残余リスク

Stage 3B-11 の「設計を開始できる」は「本番書込みできる」を意味しない。専用 Issue に authority 移行、全 writer の参加、対象束縛、intent/receipt と UNKNOWN 保持、保存原文の保全、認可・利用者確認・取り消し条件を列挙し、独立レビューを受ける。別 Draft PR が必要。

未確認: 実機 Safari、実 private browsing、長期 sleep/BFCache の機種別挙動、実 quota/eviction、物理 durability、OS 強制終了、既存非協調タブの完全な列挙/停止、悪意ある同 origin 改変。これらは UNKNOWN/NOT_TESTED を維持する。

仕様参照（今回のブラウザ実測と同一視しない）: [IndexedDB transactions](https://www.w3.org/TR/IndexedDB-3/#transactions)、[Web Locks](https://www.w3.org/TR/web-locks/)、[Broadcasting to other browsing contexts](https://html.spec.whatwg.org/multipage/web-messaging.html#broadcasting-to-other-browsing-contexts)。
