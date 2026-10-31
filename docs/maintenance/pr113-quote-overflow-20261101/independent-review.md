# PR #113 固定引用横はみ出し・独立レビュー

2026-11-01 JST。実装担当とは別の `independent_review` 担当が、提出前の製品差分・独立回帰・保存済み証拠を点検した。対象は元HEAD `730d55e83920da50f7249e1f9adfab674b1e9a57` / tree `0b932472f88153a87864550e803aa9a07aec1d66` に対する作業差分であり、未commitのローカルGREENを最終HEADの成功とは扱わない。

**提出前コードレビュー判定：未解決の阻害P1/P2指摘なし。最終HEAD・正式CI・artifactの独立照合は未実施で、受入完了やマージ推奨YESの判定ではない。**

- 元artifact ZIPのSHA256 `36a196553c1db89f51ef8ca1fbf39ebc199112a160c4a314a8a0e10aaa8e4e91` と全CRCを独立に再確認。証拠manifest記載の全ファイルについてhashとsizeが一致し、回帰fixtureは元traceから抽出したJSONと完全一致した。
- main `2549c8c15d9a5e4cea052eabc0020ad03104b49a` とPRの同一fixture・UUID2件・日時・1844文字の引用本文・操作を照合。両者とも再挿入後のCSS200%でlight/darkの391/388を記録し、保存原文保持・ブラウザエラー0。新preview専用CSSによる新規回帰という根拠はない。
- 段落352pxに対してscroll373px、親padding18pxを超える3pxの因果は、閉じdetails除外で不変、引用ID/日時段落だけ除外またはline-break変更で388/388、元へ戻すと391/388という介入で確認されている。補強後の全TextノードRangeはU+3000全角空白の右391.671875pxを示す。閉じdetails内の巨大幅を原因と取り違えていない。
- 製品変更は `FormulaReportQuotes.tsx` の引用ID/日時段落へのclass追加と、`globals.css` の `.quote-identity { line-break: anywhere; }` だけ。テキスト・日本語・ID・日時・全角空白は保持し、overflow隠蔽、幅期待値緩和、保存処理・形式・UUID生成・日時生成・共通モーダルCSS変更はない。最小修正として妥当。
- 新回帰の同じ `--expect-fit` 述語で変更前exit1・391/388、変更後exit0・388/388を照合した。変更後の旧line-break復元による負の対照も391/388を検出。mainに対する新回帰REDも確認した。配信identityのHEAD/tree/dirtyとassets digestはブラウザ読戻しにより検査され、CIは期待SHAとcleanを必須にする。
- Chromium/WebKit×375/390×light/darkのローカル8件は全件完了、観測viewport/DPRは要求値、raw一致、アプリset/remove/clear各0、ブラウザエラー0。これは提出前dirty版の証拠である。レビューで求めたviewport/DPRとCSS200%の32px rootの明示assertは最終コードへ追加されており、強化版は最終CIで判定する。
- 正式 `scenario.mjs` / `scenario-config.mjs` / `smoke.mjs` / `ci-contract.mjs`、既存契約試験・依存lockに変更なし。workflow差分は独立quote jobの追加であり、従来6条件/1128検査/592 geometry/132PNG/3workers/30分を置換・削減しない。新jobの未完了・失敗は非0となり、成果物を保存する。
- 製品2行の変更は保存機能に触れておらず、previewの読み取り専用境界・比較失効・明示再取得・非永続選択を変更しない。preview/backup/restore/recovery各8条件と他モーダルへの回帰確認は最終HEAD CIで引き続き必要。
- ローカル単体ログは初回2479成功/1失敗を保持し、Git正本LFによる再確認で115 files/2480成功。Windows契約は57総数・48成功/9失敗・skip0であり、57成功としない。Ubuntu最終CIの正式46＋独立11契約を別に確認する。lint・型・通常build・Pages buildログに阻害指摘なし。

このレビューではGUIや単体を再実行せず、ソースと保存済み実測・ログ・digestを独立に読んで照合した。初期指摘の文字RangeがfirstChildだけという不足、配信identity、明示横幅oracle、viewport/DPR/200%assertの補強を確認した。コード・試験・GitHub投稿は変更していない。

最終commit後のHEAD/tree、local/remote/PR一致、全jobのterminal状態、正式6条件の完走と件数、各独立8条件、artifact digest/保持期限/中身と最終HEADの一致を後続レビューするまで、最終受入は未判定。Space短間隔の旧2失敗はUNKNOWN、実機Safari・VoiceOver・OS文字拡大・ソフトキーボードは未検証を維持する。

## 追加診断jobの起動失敗に対するレビュー追補

2026-11-01 JST。[run 41217286703 attempt 1](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/41217286703)、HEAD `43251958ca6bc39feed6db850d539e9dcc4425b4` の独立quote job `124584368165` は起動時readiness判定で失敗した。artifact `13048114500` の完全ZIP 112,619 bytes、SHA256 `1fe0a3388574d1abbea381a127e0086e2b96f1913e1e12a083be161d922af52a` と全CRCを独立に再確認。build・browser setup・syntaxは成功、GUIは30秒のreadiness待機で失敗し、`observations=[]`。引用GUI未実行を製品の再FAILやPASSとは判定しない。

`quote-overflow/narrow/server.log` の起動URLは `http://127.0.0.1:` と `4196` の間にANSI制御文字 `ESC[1m` が入っていた。URL全体は色装飾されており、raw文字列へ連続URLの`includes`を適用する従来判定ではreadyにならない。提案修正は `node:util` の `stripVTControlCharacters` importと、そのreadiness比較前の制御文字除去だけ。既存正式 `scenario.mjs` と同じ方式であり、30秒待機・HTTP200期待値・横幅oracle・正式GUI・製品2行の変更範囲を変えていない。根拠付きの診断起動補正として妥当で、未解決の阻害P1/P2指摘なし。

補正後の `gui-evidence/quote-color-readiness/result.json` とログも独立照合した。FORCE_COLOR=1を指定したローカル実GUIはcompleted、全checkpoint388/388、旧auto負対照391/388、raw一致、set/remove/clear各0、ブラウザエラー0。ただしこのローカルserver.log自体のURLはplain文字列であり、実際のANSI付き出力通過をこの実GUIログ単独で証明するものではない。元CIのANSI付きログとの文字列照合は別に扱う。

新しい最終HEADのCI・artifact独立照合は未完了。旧runの他jobが実行中または後続pushのconcurrencyにより取消となっても、旧run全体を成功に置換しない。起動失敗履歴を保持して、新しいHEADの全job・正式6条件・各独立8条件・artifactを改めて照合する必要がある。
