# Issue #98 往復ナビゲーション検証記録

記録日時：2026-10-27 23:07 JST。基点 `035436c3c0dc3a971d1a3c4bb77fb8d1c3a11066`、専用 `feat/audit-roundtrip-navigation`。本記録は提出前作業版の実測で、最後の文書commitを含む正式CI成否はPR Checksと提出コメントで確定する。

## 対象と受入
固定A/B資料、出典A/B、固定点検記録、本文順の引用／差分から本文へ移動し、元一覧へ復帰する。既存scannerからの正規候補だけを使う。対象前後加筆で一意な同対象を再解決、対象改変・削除・重複・未知・不完全は拒否。通常往復は原本再取得・保存・再比較・再計算を行わない。出現の特定と根拠の現在妥当性は別。

## 実行環境・手順
- クラウド作業領域、Node 24.22.1／npm 11.9.0／Vitest 3.2.4。正式CIは既存のNode 22.13.0で別途実行する。Windows・実ユーザー保存データは操作しない。
- `npm ci --ignore-scripts --cache <作業領域内cache>`。初回offlineはzod-validation-error未cache、既定cacheはホーム領域不在で失敗し、許可済み作業領域cacheで正規install成功。lockfile／版変更なし。
- `npm test`、`node --test e2e/ci-contract.node-test.mjs`、`npm run lint`、`npx --no-install tsc --noEmit`、`npm run build`、`npm run build:pages`。
- ネイティブ局所試験はPages buildをローカルpreviewし、公式Playwright 1.56.1 Chromium 141.0.7390.37、390×844／DPR3／touch context。新規合成storageのみ。正式6条件全体の代替ではない。

## 実測と失敗履歴
- 最終製品コードの一括再実行は単体／契約／lint／型／通常build／Pages build全exit0（2026-10-27 23:09 JST）。旧CIの成功を流用しない。
- 独立担当自身の別fixture／別scriptでもChromium375×812 touch DPR2、Enter／Space往復・終了focus・dark CSS200%・本文／storage不変・pageerror0を確認。実装者結果の追認とは区別する。
- 現行単体 **2247/2247、98 files**。既存2205を全保持、新helper25＋実App15＋独立probe2。skip追加なし。
- 契約 **41/41**。正式GUI契約は旧1014 GUI／580 geometry／126 PNGを保持し、各6条件に7群／2geometry／1PNG追加して **1056／592／132**。touch各1270操作。3worker・30分・成功trace0は維持。
- 初回全単体 **2227 pass／3 fail（2230件）**：source callbackに第3引数を追加し旧2引数契約を破った。別optional callbackへ分離して既存assertionを一切変更せず修正。
- 実App担当が本文ABA（加筆後元bytesへ復元）→復帰時のdetail消失を同期待値RED→GREEN確認。context文字列の同一性を取得世代不変と混同せず、明示再解決とresume要求、context revisionを分離。
- 独立担当自身がfocus復帰と同値storage通知失効の2 P2をRED→GREEN確認。詳細は[独立レビュー](independent-review.md)。初期opener保持、navigationの全該当通知失効を修正。
- 局所ネイティブ新helper **7群／54実tap／2geometry／4 keyboard keypress、pageerror0**。Enter往復とEscape閉鎖、両theme root CSS200%、filter／scroll／focus、前後加筆、削除・重複、第二pageから保存更新・削除、本文・保存bytes不変を実操作。
- 初回native runnerはabout:blankでstorage読取SecurityError（正式scenarioではorigin上）。runner初期gotoを修正。次回は新合成EvidenceRecord日時がvalidatorのUTC Z規則に合わずquoteがinvalidとなったfixture不備。等価UTC ISOへ訂正し既存期待値を維持。attempt3/4成功。失敗時cleanup後PNGは失敗画面の証拠ではないため採用しない。
- 初回lint成功後、browser install先をrepo内workへ置いたことでChromium同梱JSが既存lint対象となり1error／182warnings。製品のlint問題ではない。browsercache/局所runnerをrepo外へ移し、lint設定・検査対象を緩めず再実行。

## 保全・表示・限界
移動先表示は本文の一時選択＋枠／下線／文字説明であり、保存本文にマーカーを書き込まない。編集時は旧強調失効。session終了／report切替／全storage通知／旧RAFを拒否。通常休止中の子状態を保持し、context変更時は旧取得／比較状態を明示失効する。保存中は従来同様移動／復帰を利用不可とする。

WebKit本体の公式downloadは取得済みだが、ローカルには7共有libraryが不足。`apt-get download` は `/etc/apt/apt.conf.d/80-applied-apt-retries` の読取Permission deniedおよびpackage索引未発見で停止。設定変更・別経路の制限迂回は行わない。ローカルWebKit操作は未実行で、正式CIの既存WebKit条件を必須とする。

実機iPhone Safari／VoiceOver／OS文字拡大、WebKit時間変動の根本原因、ローカル100msfixture環境差、過去の選択位置ずれ全原因は未解決のまま。CSS root200%はOS/native zoomではない。画像2枚は合成移動先UIの代表で、全本文／全幅／全機能目視を主張しない。正式CI成果物の対象HEAD／run／attempt／served identity／digest照合は提出時に別記する。

ログには合成試験と必要最小限の実行結果だけを収録。秘密情報・token・実ユーザーデータ・host process一覧は収録しない。SHA-256一覧は `SHA256SUMS.json`。新規PRは提出時作成予定、Draft・未マージ・auto-mergeなしを維持する。

生ログは末尾空白・ANSI・初回失敗を削らず gzip（mtime=0）で保存し、`logs/raw-log-manifest.json` に展開後SHA-256とbytesを記録する。

## 初回正式CIで発見した後退と修正（2026-10-27 23:38 JST）

初回提出 `abc468c48cf90a81c2cd17b83f9ae361b1dd972f` のrun `40520394267` attempt1は、単体2247・契約41・lint・型・両build成功、GUI全6条件が既存scenario.mjs:895で失敗した。点検をまだ開いていない期間のタイトル／本文／storage変更を、stable key化後に「結果失効・未照合」と持ち越した製品ライフサイクル後退である。traceのコピー本文は全6で同じ状態、2出現／2見直し／3出典未照合を示し、一致への誤昇格や保存書込みではない。新GUI試験以前の失敗であり、当該runは成功扱いしない。

修正はclosed時のcontext変更のみ旧key再mount相当の未取得状態へ初期化する。open／本文移動による一時休止中は取得失効と世代保護を維持する。親のsavedContextChanged警告は維持し、保存原本を再取得しない。既存GUI期待は変更せず、実Appで初回title／body／storage後titleの3件RED→同期待GREEN、取得後一時休止・本文編集の失効維持1件を追加した。単体は2251件へ増加、削除・skipなし。全量2251／契約41／lint／型／通常・Pages buildを再実行し全exit0。

独立担当は修正差分を確認し、実App／storage／独立probeの29件を自身で再実行成功。実装担当の19件と既存export16件（35件）成功は別実行である。正式CIの再成功はPR提出コメントで確定する。

初回失敗のZIPは28,565,855 bytes、SHA-256 `7c4c9c928eac4c703dea6b7d25f900ae0478326c157d2dbbb5ac2d03658e7e29` を取得bytesから再計算しAPI digestと一致。artifact12741858174、trace6は失敗証拠であり成功trace0と混同しない。必要な6workerログ／trace抽出／provenance／outcomesを `ci-first-failure/` に保存した。完全ZIPはGitHub run成果物（7日保持）で、恒久Gitには必要最小限の診断だけを収録する。

局所正式scenarioの先行実行では、最初は専用e2e依存未installで停止し、lockに従う `npm ci --prefix e2e --ignore-scripts` 後に再実行した。次の実行は176操作群を完走しpageerror0だったが、呼出側のEXPECTED_SHA未指定で最終coverage guardが失敗した。製品成功とは数えず、正しい環境変数で同一scenarioを再実行する。局所では未commit修正を含むためHEAD表記だけで正式対象版一致とは扱わない。正式CIは常に必須SHA指定である。

2026-10-27 23:47 JST：正しい環境変数を指定した再実行はChromium desktop1365px正式scenario全176群・100 geometry・22 PNG、pageerror0・成功trace0・exit0。修正作業treeの局所証拠であり、最終HEADの全6条件正式CIは別途必須。
