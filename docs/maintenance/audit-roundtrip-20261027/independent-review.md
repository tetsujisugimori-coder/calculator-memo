# 独立レビュー（作業版）

確認：2026-10-27 23:02 JST。担当は実装担当と別のサブエージェント。対象は基点 `035436c3c0dc3a971d1a3c4bb77fb8d1c3a11066` に対する今回作業差分であり、最終commit／CIの確認ではない。

## 独立して行った確認
- `Modal` のactive休止／再開とfocus、`FormulaReportAudit` のsession／context失効、`FormulaReportModal` のRAFガード、source詳細resume、純粋target helperを静的レビューした。
- schema、計算engine、固定資料builder、既存scanner本体は今回差分に含まれないことを確認。保存処理の実装変更はない。
- 既存実CalculatorApp出典ナビ11件を自ら再実行して成功。
- 独自実App probe 2件を作成し、下記2境界を同じ期待値でRED→GREEN確認。製品修正は実装担当が行った。
- 新helper25＋既存App11＋独自2＝38件、自身再実行で成功。
- 既存の固定挿入独立試験、固定比較record、旧review、storage App、audit UI、source UIの計98件を自ら再実行して成功。合計136件の独立再実行。mock取得失敗時のstderrはその失敗試験の期待される診断であり、成功への読み替えではない。
- 使用環境：Node 24.22.1、Vitest 3.2.4、jsdom（正式CIのNode 22.13.0とは区別）。実ブラウザ操作・実機・正式CIの独立確認はこの時点では未実施。

## 指摘と同一期待値再検証
1. **P2：往復後の点検終了focus**。根拠点検を起動→Mへ移動→点検へ戻る→根拠点検を閉じると、起動buttonへfocusが戻らなかった。Modal active再開時に元openerを上書きしていた。connectedな元openerを休止を跨いで保持する修正後、明示focusを伴う独自試験で成功。元の失敗は `/tmp/independent-roundtrip-focus-real-focus.log`。
2. **P2：同値storage通知で追跡が生存**。保存記録と照合→Mへ移動→取得rawと同値のstorage通知→caretを0へ移動→再移動で339へ移動した。原本差分条件内だけでnavigationEpochを失効していた。navigation失効を対象keyの全通知へ分離する修正後、同じ期待値（selection0保持）で成功。元の失敗は `/tmp/independent-roundtrip-two-probes.log`。

修正後ログ：`/tmp/independent-roundtrip-rerun.log`、既存保護98件：`/tmp/independent-roundtrip-protection.log`。独自試験 `tests/independent-roundtrip-review.test.ts` SHA-256 `deea60198cabb7e27754d342b16bf158c03752b47a80492f6073f1cab5a043d0`。

## 暫定結論と境界
この作業差分に対し、独立検出した2件のP2は同一期待値で解消確認。追加の未解消P0〜P2は現時点で確認していない。ただし正式6条件GUI、最終HEAD CI、成果物identity、全体回帰の結果が未確定のため、これだけで総合PASSやマージ推奨を確定しない。
実機iPhone Safari、VoiceOver、OS文字拡大、過去の位置ずれ全原因、WebKit処理時間変動、local100msfixture環境差は解消扱いしない。

## 独立担当自身の実ブラウザ操作（2026-10-27 23:06 JST）

実装側helperとは別の `/tmp/roundtrip-independent-native/check.mjs` と別合成fixture・新規contextで、Pagesローカル配布物をChromium **141.0.7390.37 /375×812/touch/DPR2** にて操作した。
- キーボードEnterでB出典へ移動し、選択文字列がB全文と完全一致。
- dark／root CSS200%（説明文の実computed32px）で一時対象枠 left19/right356/viewport375、scrollWidth333/clientWidth333。対象全文とmark内容一致、スクリーンショットを自身で目視し、戻る／再移動／終了ラベルが折り返して表示されることを確認。
- Spaceで点検へ戻り、元の詳細とB移動buttonへのfocus復元を確認。点検終了後はopenerへ復帰。
- タッチ操作で再往復と明示終了、本文・保存JSON全bytes不変、pageerror0。

結果 `PASS` はこの局所実操作範囲に限定。実装側の正式helperや6条件を自ら実行したとの意味ではない。WebKitはこの独立実操作では未実施。初回scriptは依存の所在を誤りimport失敗（製品実行前）、確認した既存Playwright位置に修正して再実行した。実機・OS文字拡大ではない。

再現script／PNG／結果／SHA manifest：`/tmp/roundtrip-independent-native/`。実装側の保存索引へ必要な範囲を移して保全する。

## 初回CI失敗後の独立再確認（2026-10-27 23:37 JST）

レビュー担当は初回CIの既存scenario895と製品差分を独立読取し、未開始の点検stateを失効として保持した原因を確認。closed context変更だけを初期化しopen/休止を保護する境界を妥当と評価した。担当自身の再実行29/29（integration＋independent probe＋storage-App）成功、同raw通知移動拒否・取得後休止編集・閉鎖前通知→新context初回未照合を確認。追加の未解消P0〜P2なし。正式CI再実行成否はこのローカル結果とは別に確認する。

## 任意cache後処理の独立再確認（2026-10-28 01:00 JST）

担当自身がattempt2 ZIPを再計算しAPI digest一致、全6のHEAD/run/attempt/served同一、1056群・592geometry・PNG132・trace0・全検証stage成功を確認した。ただしpostcache含むjob cancelledを総合PASSにしない判断を支持。cache-only workflow差分を独立確認し、Nodepin／locked両npmci／全stage／3worker／30分／trace0不変更を確認。自身で契約42/42（skip0、exit0）を再実行成功。製品・lock・Pages公開workflow不変更。新HEADの全job成功はまだ未確認であり、cache停止だけでWebKit時間変動の原因解明とはしない。
