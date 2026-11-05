# Stage 3B-3 Storage Facade

Issue [#126](https://github.com/tetsujisugimori-coder/calculator-memo/issues/126)。開始 main `41c2c0db0ec2`（PR #125 merge）。
[前段writer台帳](storage-writers-stage3b2.md)・[アーキテクチャ境界](storage-architecture-stage3b2.md)・[検証台帳](../maintenance/storage-facade-stage3b3/verification.md)と併読する。

**今回の統合は既存 localStorage writer の共通化。選択復元は executionAllowed=false / Stage 3B HOLD / 実書込みNOを維持する。保存アーキテクチャ全体の完成ではない。**

## 責務と順序

- `storage-format.ts`: 既存 v1 reader/validator/default。正規化は読取りの互換挙動であり、起動時の自動書戻しではない。
- `recovery-records.ts` / `recovery-reader.ts`: 既存8スロット・原文・容量・個別一覧の読取り専用処理。
- `storage-lock.ts`: 既存同タブqueue、`${STORAGE_KEY}:write` Web Lock、復元 shared session / 削除 exclusive session。
- `storage-facade.ts`: 操作要求受理、入力・承認・expectedRaw・失効の検証、操作別処理、読戻し、結果/UNKNOWN診断。
- `localstorage-adapter.ts`: 唯一の Storage `setItem` / `removeItem`。reader/write/remove と能力・runtime identity を公開し、判断・retryを持たない。
- 既存 `storage.ts` / `restore-storage.ts` / `recovery-manager.ts`: 互換wrapper。React/UIは結果変換を介して従来の保存待機・競合保護を維持する。

通常UIの同期wrapperは従来通り caller の共通lock内で実行。新規の非同期呼出は `runStorageOperation` を使う。同期critical sectionにはawaitがなく、待機後の承認/状態を再検証する。削除は exclusive recovery session が必要で、公開同期窓口からの直接削除は拒否する。ロック要求が失敗した時に無ロック再実行しない。

操作種別は `ordinary-save` / `reset` / `preserve` / `full-restore` / `recovery-delete`。`selective-restore` は常にBLOCKED。kindを共有しただけで選択プレビューへ保存権限を付与しない。

requestのwriter/operationId/validは診断と失効確認用。operationIdはruntime内の識別子であり保存されず、receipt・generation・incarnation・protocol認証とは扱わない。既存JSONにmetadataを追加しない。

## 結果契約

| 結果 | 意味 |
| --- | --- |
| VERIFIED | 必要な保存後読戻しと操作条件の一致を観測。長期永続化・disk flushではない |
| CONFLICT | mutation前のexpectedRaw/対象一覧不一致。no-op確認中の不一致も含む |
| INVALID | 候補、保存先、保全recordの構造を受理できない。自動修復しない |
| UNAVAILABLE | mutation未開始で保存API/読取り/排他等を利用できない |
| UNKNOWN | mutation試行開始後の例外、読戻し不一致/失敗、失効、lock異常など。結果を確定しない |
| BLOCKED | 承認/失効/容量/操作権限/HOLD等で拒否 |

attemptはadapter mutation呼出の**前**に記録する。setが変更してからthrowする場合もUNKNOWNであり、unavailable/安全な未保存へ縮退しない。QuotaExceededErrorを含むmutation呼出中の例外はadapterから未実行の証明を得られないため保守的UNKNOWNとする。

UNKNOWN後は同じStorage identityにruntime HOLDを記録し、後続の保存をBLOCKEDにする。互換APIはHOLDをuncertainへ変換し、UIが再試行可能な通常失敗に戻さない。自動retry・rollback・保全削除・自動修復はない。既存reset booleanは互換用のみで、falseは未書込み証明ではない。製品UIはchecked reset結果を使う。

このruntime HOLDはそのページのStorage objectに結び付く。再起動・別タブ・旧bundle・新しく偽造したadapter identityを拘束する永続controllerではない。Stage 3B-4以降でauthority reader/永続receipt/protocol gateを審査する。

## 全writerの到達経路

末端はすべて `Storage Facade -> localStorage adapter`。Pはprimary、Rは8保全slot。通常操作はP全体の期待原文を比較し、項目別transactionではない。

| 台帳 | 呼出元と統合経路 | 操作 |
| --- | --- | --- |
| W1 | calculate -> setData -> autosave effect -> saveDataChecked | ordinary-save / P |
| W2 | requestDelete(history) / onClearAll -> setData -> 同effect | ordinary-save / P |
| W3 | saveNote / NoteModal -> setData -> 同effect | ordinary-save / P |
| W4 | savePlainNote -> 共通lock -> saveDataChecked、確認後React反映 | ordinary-save / P |
| W5 | requestDelete(note) -> setData -> 同effect | ordinary-save / P |
| W6 | FormulaLibraryModal submit -> onChange -> setData -> 同effect | ordinary-save / P |
| W7 | removeFormula / undo -> 同onChange -> 同effect | ordinary-save / P |
| W8 | FormulaExecutionModal updateInputs / 変数取込 -> onDraftChange -> 同effect | ordinary-save / P |
| W9 | transfer(history) -> onHistory -> setData -> 同effect | ordinary-save / P |
| W10 | persistFormulaReport -> 共通lock -> saveDataChecked、確認後React反映 | ordinary-save / P |
| W11 | theme/panel/IdentificationSettings -> setData -> 同effect | ordinary-save / P |
| W12 | 初回empty load -> setData/ready -> 同effect、既存clean rawは書戻さない | ordinary-save / P |
| W13 | 破損banner確認 -> 共通lock -> resetStoredDataChecked | reset / P |
| W14 | RestoreModal preserve -> 共通lock -> preserveRestoreSource | preserve / R |
| W15 | RestoreModal execute -> 共通lock -> restoreRaw | full-restore / P、保全必須 |
| W16 | RecoveryManagerModal execute -> deleteRecoveryCopy -> async Facade、exclusive session + 共通lock | recovery-delete / R一件 |
| S1公開helper | saveData -> expectedRaw取得 -> 同期Facade、読戻し必須 | ordinary-save / P |

S1は製品UIから未使用。同期互換のため自分では非同期Web Lockを取得できず、期待原文は編集開始時でなく呼出時に取得する。これを安全な新規UI入口として採用しない。新規callerは取得済expectedRawと `runStorageOperation` を用いる。既存同期helpersの利用条件を無くしたものではない。

## 静的契約と除外

`node e2e/storage-writer-boundary.mjs` は tracked + 非ignored untracked のJS/TSを列挙。app/components/lib/db/worker/github-pagesを製品として解析し、未分類の実行ソースは拒否。唯一のadapter以外のset/remove/clear参照、Storage直接代入/delete/増減/既知alias/動的member/Reflect、cookie、IndexedDB/Cache/OPFS/FS/DB候補、adapter直接import・re-export、製品から試験領域へのimportを検出する。

除外は tests/、e2e/（合成fake・故障注入・runner）、examples/（未接続D1等）、docs/maintenance/（保存した検証script）、scripts/・build/と列挙されたビルド設定ファイル。除外領域を製品からimportすることは許可しない。raw JSONのdownload、clipboard、DOM、メモリMap/Set、読取り専用getItemはブラウザ保存writerではない。

これはソース規約であり、敵対的な任意JS・ブラウザ拡張・外部注入・旧bundleを封鎖するsandboxでも完全な全言語データフロー証明でもない。eval/Function/解決不能dynamic import/anyによる型消去を拒否し、Storageのexport・object/array/returnへの持出し・propertyへの参照代入も拒否する。Storageを関数へ渡す場合は相対/@/named/default/re-exportを解決し、型付きStorage引数を必須にする。型aliasは製品graph間で保守的に伝播するため、同名alias等にfalse positiveが出た場合は明示レビューが必要。追加API/新entrypointは規約と台帳のレビューを要する。許可adapter自身の内容は独立コードレビューの対象。

## 接続点と未実装

adapterのread/write/remove能力とrequest/result契約を分離したが、同期StorageAdapterへPromiseをcastしてIDBを接続してはいけない。Stage 3B-4はtransaction-aware非同期実装を同じ操作契約の下へ追加し、current/copy/receiptを同一transactionへ移す。新backendへの本番切替・明示移行は別審査。

未解決: 永続世代/receipt/incarnation、protocol gate、再起動後UNKNOWN判定、旧LS分岐救出、容量/履歴圧縮。localStorageの非協調writer、ABA、最後のread/set間TOCTOU、読戻し後の変更、全保管領域消失、媒体保証も未解決。Web Locks未対応時は既存通常/全体復元の同タブqueue fallbackを維持し、保全削除は拒否する。JSON v1、未知付加field/原文、保全8スロットに自動移行はない。
