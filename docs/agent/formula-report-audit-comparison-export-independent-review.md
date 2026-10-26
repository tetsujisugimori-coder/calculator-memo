# 比較結果Markdown出力・独立レビュー

## 対象と独立性
2026-10-26 JST、Issue #92。main `2a91599fa8454e097d2eca3a5d552f115da68819` からの未コミット差分を、builder/UIの実装担当とは別のレビュー担当がソース・独立試験で確認した。commit後の最終HEAD/正式CI/実GUIの証拠は実行担当の記録と照合し、このレビューの実施範囲と混同しない。

確認時 SHA-256:
- `lib/formula-report-audit-comparison-export.ts`: `24a9ff7f5933b8593e4e3a18031d4ff6318524d9dec887a76f795a4ef0048ab1`
- `components/FormulaAuditRecordComparison.tsx`: `5b57cb6a955c36ce0813c3803c5598815c6e226f7982587ce6f9fae6c53fe6be`

## 判定
確認した範囲で新規 P0/P1/P2/P3 指摘なし。これは全環境・全経路での無欠陥保証やマージ承認ではない。

- UIは既存の `compareAuditRecords` の同一resultを保持し、出力時には再比較しない。共有状態ラベルを使用。両側正常0件の比較不能と理由、片側0件の追加/削除を出力で改変しない。
- metadataは同じscanner結果と選択から取得。builder単体は任意の別resultとの対応を暗号学的に検証するAPIではなく、UIの同一世代captureを信頼境界とする。現在の呼出経路は対象/context・action token・storage epoch・selection identityを実行直前にも確認する。
- A/B再選択・swap・再比較でkeyed export instanceを交換。storage通知は同期epochで守り、非同期copyの遅い成功/失敗はversionとmount有効性で拒否。StrictMode cleanupは比較選択のstorage epochを進めず、独立した出力instanceの生存期間だけを失効する。
- 任意文字列は最大backtick連長より長いtextフェンスを使用し、Markdown構造と固定記録領域への混入を防ぐ。文字列・CRLF・Unicodeはbuilderでそのまま保持し、既存出力上限時は全体拒否する。全文欄は読取専用。コピーはclipboard要求成功、ファイルはdownload要求成功とOS保存を区別する。
- snapshotと当時取得原本は独立表示。不足原本をsnapshotで代用せず、丸め表示から内部値を復元しない。日時のみの差を根拠差へ格上げしない。旧v1や取得未記録も不足を維持する。
- 変更範囲に保存writer/schema/engine/容量/確認履歴/固定scanner/比較エンジン改修なし。実CalculatorAppのstorage通知経路を含むUI試験で読取専用契約を確認する。
- GUI追加は既存6条件を通る共通経路へ追加。合成clipboard sink/失敗注入とnative download bytes/別ページstorage通知を区別しており、実機OSのclipboard権限を検証したとは扱わない。既存全検査・geometry・PNG・trace方針は削減していない。契約件数/touch数の最終確定は実測結果を待つ。

## 独立試験
`tests/formula-audit-comparison-export-independent.test.ts` に9件追加。正常両側0、片側0×2、内部-0/表示0、取得原本欠落、悪意風フェンス/CRLF/Unicode、取得不能と未記録の併存、日時のみ差、旧v1不足を検証し、各入力の非変更も確認した。

実行: `npx --no-install vitest run tests/formula-audit-comparison-export-independent.test.ts tests/formula-report-audit-comparison-export.test.ts tests/formula-report-audit-comparison-export-ui.test.ts`。
結果: 3 files / 58 tests（独立9 + builder33 + 実アプリUI16）成功、失敗0、skip0、15.76秒。`git diff --check` 成功。実装担当の既存App回帰・全単体・lint/型/build・正式CIとは別の結果。

## 限界・残余
この担当は実ブラウザ・GitHub Actions・実機Safari・VoiceOver・OS文字拡大を実行していない。GUIと最終HEAD CIが未完了なら総合PASSとしない。PR #85初回選択位置ずれの原因未確定、任意外部writerとの原子的整合、数学的正しさ・真正性・変更意図の証明は本修正の保証対象外。

## UI最小調整後の再確認（2026-10-26 09:00 JST）
実ブラウザを操作した担当から、新しいpreviewボタンと全文ラベルが連続して見え、裸のボタンが小さいという観測があり、既存 `button-secondary` を新規3ボタンへ適用し、preview操作行と全文欄を別divへ分離した。旧判定を削除せず、この観測と修正を追記する。

独立担当が差分を再確認したところ、比較/失効/保存契約の変更はなく、親の `.formula-report .modal-actions` のwrapと既存button min-height44pxを再利用する最小修正だった。独立9件＋実アプリUI16件＝25件、2 files成功、失敗/skip0、13.92秒。diff-check成功。新規P0〜P3残件なし。寸法や実画面の最終PASSは担当の実ブラウザ再検証結果に限定し、本jsdom実行だけで保証しない。

更新後UI SHA-256: `8acf1589617abbd3a26815b0084d510267e1b15a2a23d9257dca4ce3f0e1f081`。builder SHA-256は上記から不変。
