# 選択復元プレビュー検証記録

## 対象と実施範囲

2026-10-31 JST。開始main `2549c8c15d9a5e4cea052eabc0020ad03104b49a`、作業branch `feat/selective-restore-preview`、[Issue #112](https://github.com/tetsujisugimori-coder/calculator-memo/issues/112)。PR #107/#109/#111 のmergedをGitHubで確認。依頼全文はIssueへ掲載・読戻し一致確認。

Linux Debian 13 / Node 24.22.1で独立checkout。CI予定のUbuntu24.04 / Node22.13.0と異なる。実データは使用せず、fresh browser context + 合成JSONだけを使用。既存worktreeや保存データへの操作なし。

## 初期実測（最終HEADの結果ではない）

- 固定依存: 初回既定npm cache書込不可で失敗。`npm ci --ignore-scripts --cache /tmp/calculator-preview-npm-cache` は723 packages取得成功。依存・lockfile変更なし。
- formal契約: `node --test e2e/ci-contract.node-test.mjs` 46/46 PASS、skip0。
- 固有workflow契約: missing job/runnerのRED→追加後GREEN。既存formal jobと3独立jobの条件は変更しない。
- 初期Ch375/390 × light/dark × CSS200%: 4/4成功、各13 tap/touchstart。詳細・比較same/different/absent・参照欠落・選択・2tab/sametab失効・不正ファイル・読取失敗・書込0を確認。初期画面画像を閲覧したが、後続修正版の証拠と混同しない。
- ローカルWebKit: system libraries（GTK4/graphene/woff2dec/harfbuzz-icu/hyphen/manette/GLES）欠落でlaunch不能。runnerは8条件未完了としてexit1。4/8を全体PASSにしない。CIの正式なbrowser setupで検証する。

## 独立レビュー指摘の追跡

|重要度|指摘|対応と受入|
|---|---|---|
|P2|未知collectionをその他へ示しても元分類の件数0と表示する|count null/UNKNOWNへ局所修正。未知形式fixtureで0扱いしないことを再確認|
|P2|JSON.parseで小数丸めが消え、1.00000000000000001と1を内容sameと判定|4ケースRED→十進字句のround-trip検査追加後GREEN。underflow/unsafe整数・-0/指数も試験。独立probeでUNKNOWN再確認|
|P2|参照一覧の大量DOM懸念|参照も20件ページ化。独立probe 15,000 links→30,001 refsの解析を確認、全件DOM化しない|
|P2（試験）|読取失敗が一般UNKNOWN表示でも通る|専用comparison-stateと旧success消去のassertへ強化|

## 最終検証・未検証

最終対象SHA、全単体・lint・型・両build、固有8条件、既存3独立回帰、正式GUI、CI artifact実測はPRへ追記する。未完了時点のPASSを先取りしない。

実機iPhone Safari、VoiceOver、OS文字拡大、ソフトキーボード、長期保存は未検証。CSS200%およびPlaywright touchは実機操作と区別する。PR #111の正式GUI未完走・Issue #105 の原因UNKNOWNは過去記録として保持し、固有試験成功で解消しない。

## 実装完了後のローカル検証（提出前tree）

- 全単体 `npm test`: **115 files / 2480 tests PASS**、skipなし（2026-10-31 19:07 JST、27.52秒）。新規core35 + UI13 =48件を含む。
- core RED: 新API未存在によるmodulemissing exit1→13 GREEN。その後の小数精度P2は4 assertion RED→修正後26 GREEN、実schema snapshot/引用/確認・budget/未知countを追加して35 GREEN。
- UI RED: 検証不能/読取失敗の区別は1 assertion FAIL→別status導入後GREEN。queued autosave epochと同一ターン旧ファイル選択失効を加え13 GREEN。既存recovery UI15もPASS。
- 独立レビューは実装担当以外が静的点検・合成probe・focused suiteを実行。初期97 PASS/1 FAILは上記UI REDを含む途中版として保持。修正後の数値/未知count/参照ページングを再確認し、新規未解決P1/P2なし。最終SHAのCI/ブラウザ結果は別途照合する。

提出前treeと最終commitの同一性を確認し、最終HEAD CIをPR本文・コメントで追跡する。文書中にこれから作るcommit自身のCI成功を先取りしない。

- 提出前treeの `npm run lint`、`npx --no-install tsc --noEmit`、`npm run build`、`npm run build:pages` はすべてexit0。既存formal46 + 独立backup/restore/recovery/preview11 = **57契約PASS**（skip0）。通常buildの既存vinext API分類注意・proxy警告は成功と別に保持。
