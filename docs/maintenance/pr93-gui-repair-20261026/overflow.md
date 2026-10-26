# PR #93: 比較差分の出典確認の横幅診断

確認日: 2026-10-26 JST。対象修正前 HEAD: `5cbaf6f74ae15d7afccb73f50c64c0ce0380756c`。

## 事実と再現

正式失敗 run `40261949353` attempt 1 の Chromium touch390 / DPR3 / CSS文字200% trace から、実際のIDを抽出した。

```
差分ID：f94c198b-b4b1-4a41-a86e-11d63e9013bd　元引用ID：965d1c53-3da3-4ae2-a73c-fd94df1efe4f　登録式ID：quote-formula
```

全文 UTF-8 SHA-256: `b82dcb68be9ee5e768e28a7ed32947b3062c58e64a3b522717a2da60f60922f5`。

- `overflow-minimal-red.json`: 同じ既存CSSと文字列を native Chromium の独立DOMで切り分けた診断。100%は modal 388/388、P 352/352。200%は modal scrollWidth/clientWidth 390/388、P 372/352。
- `overflow-text-node-control.json`: 文字ごとの Range で、超過は `　登録式ID：` の先頭 U+3000 であった。P right=371、空白の x=358.828125, width=32, right=390.828125。本文文字の切捨てではなく行末の全角空白のぶら下がりである。
- computed style は P width=352px/min-width=0/max-width=none/padding=0/border=0、overflow-wrap=anywhere、word-break=normal、white-space=normal、font-size=32px。親は block で flex/grid の最小幅強制ではない。
- 同じ paragraph/text/CSS で隣接text nodeを `normalize()` して1個にする対照では、P scrollWidthが372→352になった。これは診断専用DOM操作であり、製品やGUI操作の代替として使わない。
- `overflow-app-red.json`: 上記HEADから新規Pages build後、実CalculatorAppの引用→差分準備→挿入→出典表示の操作で同じ390/388・372/352を再現した。局所再現だけ、準備時のUUIDを旧traceの2件へ固定した。正式GUIのランダムUUID生成は変更しない。
- 初回局所実アプリ試験はUUID固定列が取消・再準備で消費され、別のIDで成功した。これは修正前の未再現であり、改善の証拠ではない。`gui-evidence/overflow-before` を保持した。確定REDは `gui-evidence/overflow-before-exact` に別保存した。

既存の寸法検査は正しく超過を検出している。原因はこの表示段落のtext node境界とChromiumの全角空白折返しの組合せであり、取得日時やflex/grid幅そのものではない。ブラウザ内部実装の根因まで特定したとは主張しない。

## 採用修正・次善策

第一希望を採用: `FormulaDifferenceSources.tsx` の識別段落だけを1つのtemplate literalへ変更する。表示全文・全角空白・ID・順序は不変、単一text nodeとして描画する。CSS、Modal、比較ロジック、計算、保存原本、snapshot、履歴、イベント/取得処理は変更しない。

次善策の各IDを別block/spanへ分ける案はレイアウト/読み順への変更が大きいため不採用。overflow-wrapの追加は既にanywhere適用済みで原因に対応しない。overflow:hiddenやスクロールによる隠蔽、文字切捨ては行わない。

React best-practices skillを参照。新規state/effect/イベント/依存関係は追加せず、安定した表示文字列の組立てのみを変更した。

## 回帰検証

- `tests/formula-difference-source-layout.test.ts`: exact ID、長いUnicode/全角空白、HTML記号/改行を含む3入力。全文・単一text node・入力snapshot/source不変・暗黙再取得なしを検査。修正前は3/3失敗（6text nodesを検出）。JSDOMはレイアウトを保証しないのでnative検証と区別する。
- `overflow-fixture.ts`: 既存純粋builderを使用して合成固定引用/差分を作る。保存形式/比較エンジンを複製しない。
- `overflow-native.mjs`: 新規合成contextへfixtureをseedし、実アプリのtap/click/keyで開閉する局所回帰。元失敗IDと長いUnicode登録式ID、既存6条件、両テーマ、100/200%、寸法/computed style/全文/44px操作領域/Escape/再開/フォーカス/保存原本不変を検査する。DOMによる入力代替はしない。単独診断であり正式912件/562geometry/114PNGを代替しない。

修正後の実測と最終ビルド対応は検証完了後に追記する。実機Safari/VoiceOver/OS文字拡大は未検証。

### 実行例

```sh
CHROMIUM_EXECUTABLE=/tmp/loading-native/chromium/chrome-linux/headless_shell \
WEBKIT_EXECUTABLE=/tmp/loading-native/webkit/pw_run.sh \
node docs/maintenance/pr93-gui-repair-20261026/overflow-native.mjs
```

Playwright標準ブラウザが利用できる環境では上記 executable 環境変数は不要。テスト対象のPages buildと `__gui_provenance.json` は既存GUI方式で事前準備する。working-tree source hashとserved asset hashを別々に記録し、名前だけで同一buildとみなさない。

## 修正後確認（2026-10-26 16:02 JST）

`overflow-native-summary.json` に前後の測定・source/served asset SHA-256・raw evidence hashを記録した。

- 同じcompact実アプリfixture/同じscriptで旧buildは100%成功、200%で **390/388、372/352** のRED。旧失敗を消さず `/tmp/pr93-overflow-native-red` に保持。
- 同一期待値の正式追加unitは **修正前0成功/3失敗 → 修正後3成功/0失敗**。修正後14.26秒、Pages build6.12秒成功（Python monotonic計測）。計測開始時の `/usr/bin/time` 不在によるshell exit127はテスト未実行として保持し、試験失敗や製品問題に混ぜない。
- 修正後nativeは **48/48 layout cases**、6条件×2fixture×両theme×100/200%。12回の実アプリfixtureについて開閉・Escape/Enter・フォーカス・44px操作領域・保存bytes不変を確認。全pageerror0、process exit0。2026-10-26 15:55:40〜16:02:10 JST（約390秒）。
- Chromium touch390/200%は同じ全文で **modal388/388、P352/352**。前後でP text nodeは6→1。Unicode/全角空白/長いIDも切捨てず保持。ブラウザは Chromium141.0.7390.37 / Playwright WebKit26.0（実機Safariではない）。
- 視認した代表PNGを `evidence/overflow-before-chromium390-200.png` と `evidence/overflow-after-chromium390-200.png` に保持（約267KB/266KB）。前SHA `e862df82bf5209cd297961ff690a9c41f2c82521f595fdbd59b393226b80ff28`、後SHA `942b60cafd93e493fbd76b5242bc57ac2e05263843c49dedfdafcc6778b769c4`。他の局所48PNGはrawディレクトリに保持し、正式CIの114PNG件数へ算入しない。
- 修正前製品source SHA-256 `fcada2b90accef0afec1ce0993b122f42b116bb4180ad897450e27c2e804792d`、修正後 `612211c4c5f55adff8b7d4edb24dd7aa60110c2e3f586423054e42dbf21e7b80`。この実行は基準HEAD＋未commit候補のPages buildであり、最終commitの正式CI成功を意味しない。

独立sourceレビューのP3提案により、診断scriptへ未知scenarioの0件成功拒否、CSSviewport同一、document/body幅、dialog外枠の検査も追加した。既存formalと同じ1px許容を使い弱体化していない。上記48件はその補強後scriptの結果。正式全量GUI/最終HEAD CI/遅延原因は別証拠で判定する。

## 重層backdrop修正を含む最終候補の再検証（2026-10-26 16:44 JST）

前節のtext-node修正単独結果は消さず保持する。遅延担当の因果調査後に採用された「単一モーダルのblur(3px)は保持し、重層モーダルのbackdrop-filterをnoneにする」候補について、同じ局所実アプリ回帰へCSS契約検査を加えた。変更対象は診断scriptだけであり、計算/保存/比較処理へ試験用変更を入れていない。

- 旧buildを `/tmp/pr93-baseline-dist-5cbaf6f` から `OVERFLOW_DIST` (`vite preview --outDir`) で読み取り実行。100%のlibrary単独ではblur(3px)が確認でき、reportを開くと2枚ともblur(3px)のため期待noneで **RED・exit1**。旧text-node横超過へ進む前にCSS契約の負の対照が失敗した。raw `/tmp/pr93-overflow-css-red`。
- 最終候補buildは **48/48 layout cases＋60/60 backdrop checks成功**、process exit0。6条件×2fixtureの各経路で、library単独3px→report2枚none→source3枚none→source閉後report2枚none→report閉後library3px復帰を確認。実tap/click/keyboard、全文、44px、フォーカス復帰、保存bytes不変を維持した。
- 実行は2026-10-26 **16:40:34〜16:44:42 JST**、約248秒。検査を追加した異なるrunなので、前回390秒との差だけから製品性能の改善率を算出しない。遅延の因果比較は別資料を参照する。
- `overflow-final-native-summary.json` に旧CSS RED、48寸法、60stack検査、source/CSS/served JS/CSSのhash、raw記録のSHA-256を保存。served候補JSは `index-DVc8aHr-.js`。最終commitの正式CIとは区別する。
- 最終代表PNG `evidence/overflow-final-chromium390-200.png`、SHA-256 `8c49fdf434c4eddfe5b2d0e8c40268c1e2de1ed658f6502752be018bb4ca11ca`。前節の修正前/単独修正後PNGも保持する。

実機Safari、VoiceOver、実OS文字拡大、将来の未知文字列すべては未保証。ローカル48/60成功で正式GUI 918件・562geometry・114PNGの完走を代替しない。
