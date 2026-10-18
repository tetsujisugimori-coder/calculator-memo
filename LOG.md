# Calculator Memo 開発履歴・設計判断

このファイルは開発履歴と重要な設計判断の正本（作業の証跡）です。現在有効な行動規則は [AGENTS.md](AGENTS.md) と関連設定・運用手順を参照してください。新しい記録はこの説明の直後へ追加します。旧記録に含まれる「現在」や追記形式は当時の内容であり、現行規則ではありません。


## 2026-10-18 (JST): 計算確定後の編集・エラー復帰を統一
- 変更内容: BS/CE/±とキーボード編集を共通の入力遷移へ接続し、編集後のafterEquals・エラー・旧結果を無効化する。両メモ入口は再計算まで無効。保存形式・評価エンジン・Memo-Nexus連携は変更しない。
- 変更理由: main `53a36d5beda76ad04395091a93c1e982c69dcdf9`（PR #11反映済み）では編集後にafterEqualsが残り、数字再入力や表示と内部状態、メモ作成可否が食い違う。
- 仕様と判断: 従来の元式編集を維持する。12+3=15→BS/CE→4→=16、±→=9。未編集なら+2=17。数字/小数点/左括弧は新規式、再＝は同式評価。エラー後の数字等は新規開始、BS/CE/±/演算子は失敗式を訂正する。
- 設計比較: 第一希望は既存の操作意味を保つ最小修正。boolと既存errorを維持し、純粋な遷移関数で共通化した。全面的な状態機械化は変更範囲が大きく不要、確定数値自体の編集は元式編集の意味を変えるため採用しない。状態種類が増えたとき再検討する。
- 検証結果: 再開後のcloud Node 24.19.0で91単体テスト、lint、型検査、通常/Pagesビルド成功。最終GUI/CIは確認待ち。単体は正常/境界/異常遷移、GUI追加は両幅の編集・履歴不変・再計算メモpayload・再入力・エラー復帰を対象とする。独立レビューでGUIセレクタ2種類を実UIに合わせて訂正し、blocking指摘なし。
- 関連 Issue・PR: [Issue #12](https://github.com/tetsujisugimori-coder/calculator-memo/issues/12)、PR未作成。[Issue #10](https://github.com/tetsujisugimori-coder/calculator-memo/issues/10)はPR #11マージ後の受入確認コメントを追記、closed維持。
- 未解決事項: iPhone Safari実機は未検証。指数表記結果の既存チェーン制約、既存依存警告、保護設定、負の対照CI実験は対象外。対話的Cloud Browserの接続成功とは扱わない。
- 再開時の事実: 前回未公開のローカル作業場所が残っていなかったため、同じmainから仕様に沿って再構築・再検証した。GitHubに同目的PR/branchがないことを確認。

## 2026-10-18 (JST): 末尾数値の符号反転・CE・入力中表示を修正
- 変更内容: 二項減算と単項符号を識別する共通の末尾数値抽出を導入し、±・CE・入力中 LCD に適用した。小数点末尾、％、括弧内数値、URL の空白付き単項負数も扱う。評価エンジン・保存形式・レイアウトは変更しない。
- 変更理由: main `d453a9d4eb3b6f12897b3d83e6cdd5724dbba67f` の既存51テストは成功したが、追加回帰例のうち8件が失敗した。`12-34` の±が `1234`、CE が `12` となる数値結合を防ぐため。
- 比較と判断: 四則演算・履歴・メモは既存テストを保持。入力後状態の問題や小画面の全面変更より、再現済みで小さな共通処理に限定できる末尾数値編集を優先した。従来の正規表現は減算記号を符号として扱っていたが、新処理は直前文脈で二項演算子を保持する。
- 検証結果: cloud Node 24.19.0 のローカルで69単体テスト、lint、型検査が成功。通常/Pagesビルドも成功。初回 [CI 39094065581](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/39094065581) は `ef8a7047da9dae592fb70783f8f1611f75367fef` で全工程成功。Chromium 141.0.7390.37 / Playwright 1.56.1 の1365/390pxで14検証記録・エラー0、両幅のスクリーンショットとtraceを取得し、配信成果物のSHAも一致した（2026-10-18 12:34:56〜12:35:06 JST）。成果物はCI内で7日保持。この結果追記コミットのCIは [PR #11 Checks](https://github.com/tetsujisugimori-coder/calculator-memo/pull/11/checks) で別途確認する。GUI に編集/再入力/小数点/キーボード/連続計算/URL受信/履歴の検証を追加した。
- 関連 Issue・PR: [Issue #10](https://github.com/tetsujisugimori-coder/calculator-memo/issues/10)。[PR #11](https://github.com/tetsujisugimori-coder/calculator-memo/pull/11)。
- 未解決事項: 計算確定後のBS/CE/±で afterEquals が残る別問題は今回変更しない。iPhone Safari 実機操作は未実施。既存の依存警告や保護設定、負の対照CI実験も対象外。
- 第一希望と検証環境: 修正ブランチの実ブラウザ検証を行う。既存の隔離 Actions + Chromium を採用し、対話的Cloud Browserのlocalhost到達やiPhone実機を検証したとは扱わない。

## 2026-10-18 (JST): エージェント開発運用と LOG.md 管理規則を導入
- 変更内容: root `AGENTS.md` を作成し、各 PR のログ更新、記録項目、判断変更と暫定策の区別、最新順、履歴保持、参照リンク、PR 前の更新要否確認、行動規則との役割分離を定義した。GitHub 開発運用と検証方針を docs/agent に作成し、Issue・PR・コメント・レビュー・CI・承認境界・人間のマージ後の整理を明文化した。README と GUI 検証手順から接続した。既存 `Log.md` は `LOG.md` に統一し、旧本文を末尾にそのまま保持した。
- 変更理由: 開発履歴・重要な設計判断を継続して追跡できるようにするための依頼に基づく。履歴と現在有効な規則の混同、および大小文字違いの二重管理を防ぐ。
- 検証結果: 作成前に main `bfd0665d4cde2dd5228a9e8f5f8bea734ac2f49d` と open PR 0 件、既存の文書を確認した。旧本文 20,645 bytes の完全保持と、新規文書リンクの解決を確認した。独立レビューで 8 要件・関連運用規則の整合性を確認し、blocking 指摘はなかった。[初回 CI](https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/39092388598) は対象 SHA `d794f32992207588a0b72faa3fe269fbfd7dd329` で成功（単体テスト・lint・型検査・通常/Pages ビルド・1365/390px Chromium GUI）。この結果追記後の最終 SHA の CI は [PR #9 の Checks](https://github.com/tetsujisugimori-coder/calculator-memo/pull/9/checks) で別途確認・報告する。ローカルでアプリテストを再実行したとは扱わない。
- 関連 Issue・PR: [Issue #8](https://github.com/tetsujisugimori-coder/calculator-memo/issues/8)。今回の [PR #9](https://github.com/tetsujisugimori-coder/calculator-memo/pull/9)。基点は [PR #7](https://github.com/tetsujisugimori-coder/calculator-memo/pull/7) のマージコミットであり、その過去の検証結果を今回の検証結果として流用しない。
- 未解決事項: 結果追記コミットの CI 結果は、追記時点では未確認であり PR の Checks と最終報告で確認する。旧記録の全主張・日時を再検証したわけではなく、過去の記載として保持する。main へのマージは人間が判断する。
- 従来の方針: 既存 `Log.md` に日付・目的・変更内容・検証・関連コミットを追記する説明があった。root `AGENTS.md` は存在しなかった。
- 変更理由と新しい方針: 上記依頼に従い、証跡は `LOG.md`、行動規則は `AGENTS.md` 等に分離し、以後の記録を最新順に管理する。
- 第一希望: 日付と判断根拠を確認できる履歴を最新順に追えること。
- 制約と採用策: 既存本文には日時不明の初期記録や当時の状態説明が混在するため、推測で日付付与・再配列を行わず旧本文を一括保持する。これは移行時の保全策であり、新規記録を末尾追記する方針ではない。過去の日時・根拠が確認できた場合は出典を付けて新たな記録で補足する。

## 移行前の記録（2026-10-18 に Log.md から内容を保持）
以下は基点コミットの `Log.md` 全文です。内容・並び順を保存しており、新たな検証済み事実や現行規則として再認定していません。移行元: [Log.md at bfd0665](https://github.com/tetsujisugimori-coder/calculator-memo/blob/bfd0665d4cde2dd5228a9e8f5f8bea734ac2f49d/Log.md)。

# Calculation Memo 開発ログ

このファイルは、Calculation Memoで実施した実装、修正、検証、運用上の判断を記録するためのログです。
新しい変更を行った際は、日付、目的、変更内容、検証結果、関連コミットを追記します。

## 現在の状態

- 本番ブランチ: `main`
- GitHub Pages: https://tetsujisugimori-coder.github.io/calculator-memo/
- 公開方式: GitHub ActionsによるVite静的ビルドのデプロイ
- 自動デプロイ条件: `main`へのpush
- 手動デプロイ: `workflow_dispatch`で実行可能
- データ保存先: ブラウザの`localStorage`
- アプリ構成: 通常電卓、計算履歴、計算メモの3カラム

## 初期実装

### 主な機能

- リアル路線の卓上電卓UIを実装した。
- 計算履歴、電卓本体、計算メモの3カラムレイアウトを実装した。
- 四則演算、括弧、小数、符号反転、パーセント計算に対応した。
- キーボード入力と電卓キー操作に対応した。
- 計算式と結果を確認しながら計算できる液晶表示を実装した。
- 計算結果を履歴へ保存し、電卓への復元、コピー、削除、メモ作成を可能にした。
- タイトル、単位、タグ、前提、関連メモ名を持つ計算メモを実装した。
- KaTeXによる数式表示と数式ガイドを実装した。
- ライト、ダーク、自動のテーマ切り替えを実装した。
- ブラウザの`localStorage`へ履歴、メモ、テーマを保存するようにした。
- PC、狭いPC、スマートフォン向けのレスポンシブ表示を実装した。

### 関連コミット

- `6f69b64` — `Build Calculation Memo web app`

## 依存関係の保守

- `mathjs`のセキュリティ対応を反映した。
- `package.json`と`package-lock.json`の整合性を維持した。

### 関連コミット

- `890f0e9` — `Update mathjs security fix`

## 2026-07-23: 初回レビューで見つかった不具合を修正

### モーダルのEscキー競合

- 計算メモ編集画面の上に数式ガイドを開いた状態でEscを押すと、複数のモーダルが同時に閉じる問題を修正した。
- 最前面のモーダルだけがキーボード入力を処理するよう整理した。
- 背景側の計算メモ編集内容が失われないようにした。
- モーダルごとに一意のタイトルIDを割り当て、`aria-labelledby`との対応を維持した。
- モーダルを閉じた後のフォーカス復帰を整備した。

### 保存データ破損時の保護

- `localStorage`の読み込み結果を、正常、データなし、読み込み失敗に区別した。
- JSON破損と未対応データバージョンを内部で区別した。
- データなしの場合だけ空の初期状態で開始するようにした。
- 読み込み失敗時は自動保存を停止し、壊れたデータを空データで上書きしないようにした。
- 利用者へ読み込み失敗を通知するリカバリーバナーを追加した。
- 元データをコピーして退避できるようにした。
- 明示的な確認後にだけ初期化できるようにした。

### パーセント計算の仕様確定

`%`は、直前の数値を100で割る単項演算として扱う仕様に統一した。

| 式 | 結果 |
| --- | ---: |
| `200 + 10%` | `200.1` |
| `200 - 10%` | `199.9` |
| `200 * 10%` | `20` |
| `200 / 10%` | `2000` |
| `10%` | `0.1` |

表示、計算結果、履歴、コピー結果で同じ解釈を使用する。
実機電卓の「200に10%を加えて220」のような相対パーセント計算は採用していない。

### UIとアクセシビリティ

- 計算履歴パネルと計算メモパネルだけに、日本語UI向けゴシック体のフォントスタックを適用した。
- 電卓本体、液晶、キー、ヘッダー、KaTeX数式の書体は変更していない。
- モバイルタブへ`role="tab"`、`aria-selected`、`aria-controls`を設定した。
- 対応するパネルへタブパネル用のroleとIDを設定した。
- ライトモードとダークモードの既存デザインを維持した。
- 3カラム構成とリアル路線の電卓デザインを維持した。

### README

- スターターテンプレートの説明を、Calculation Memo固有の内容へ更新した。
- 通常電卓、計算履歴、計算メモ、KaTeX表示を説明した。
- `%`の仕様と計算例を記載した。
- `localStorage`の利用と、ブラウザデータ削除時の注意を記載した。
- 開発、テスト、lint、ビルドの実行方法を記載した。
- 関数電卓やデータの書き出し・復元は、実装済み機能ではなく今後の候補として分離した。

### 関連コミット

- `56e05ac` — `Fix modal stacking and protect saved data`

## 2026-07-23: GitHub Pages向けの静的ビルドを追加

### 原因

GitHub Pagesがブランチ直下を公開する旧方式になっており、アプリではなくREADMEを基にしたページが表示されていた。
既存の`vinext build`はCloudflare Worker向けの出力であり、GitHub Pagesが必要とする静的な`index.html`を生成しない構成だった。

### 実施内容

- GitHub Pages専用のVite設定`vite.pages.config.ts`を追加した。
- GitHub Pagesのリポジトリ配下でアセットを解決するため、`base`を`/calculator-memo/`に設定した。
- `github-pages/index.html`と`github-pages/main.tsx`を静的SPAのエントリとして追加した。
- 既存の`CalculatorApp`、KaTeX CSS、アプリ共通CSSをPages版でも再利用した。
- Pages版でNext.jsのフォント変数が未定義にならないよう、ローカルフォントのフォールバックを追加した。
- Pages用ビルドコマンド`npm run build:pages`を追加した。
- Pages用出力先を`dist-pages`とし、Gitおよびlintの対象外にした。
- GitHub公式のPages Actionsを利用するデプロイワークフローを追加した。
- `npm ci`で依存関係を導入し、`dist-pages`をartifactとしてデプロイする構成にした。
- Pagesのbuildジョブとdeployジョブを分離し、必要最小限の権限を設定した。
- 同時デプロイの競合を防ぐ`concurrency`設定を追加した。

### 関連コミット

- `7992e77` — `feat: deploy calculator app to GitHub Pages`

### 検証

- `npm run build:pages`: 成功
- `dist-pages/index.html`: 生成確認
- HTML、CSS、JavaScript、KaTeXフォントの参照先が`/calculator-memo/`配下になることを確認
- ビルド成果物内の参照アセット62件について、欠落がないことを確認
- 既存の`npm run build`: 成功
- ローカルブラウザでCalculator Memoが表示されることを確認
- `200 + 10% = 200.1`の計算と履歴追加を確認
- 計算メモ編集画面の表示を確認

## 2026-07-23: GitHub Pagesのデプロイ運用を整備

### 実施内容

- GitHub Pagesの自動デプロイ対象を`main`へのpushだけに限定した。
- GitHub Actions画面からの手動実行用に`workflow_dispatch`を維持した。
- 作業ブランチへのpushやPull Requestの作成・更新だけでは、本番サイトが更新されない構成にした。
- 最初のリモート`main`を、既存履歴の`890f0e9`からforce pushなしで作成した。
- GitHub Pages対応をPull Request経由で`main`へマージした。
- ローカル`main`を`origin/main`へfast-forwardで更新した。

### 関連コミット

- `f356eda` — `ci: deploy GitHub Pages from main only`
- `dfc1d26` — Pull Request #2のマージコミット

### 運用確認

- `main`へのpushを契機に`Deploy GitHub Pages`が起動することを確認した。
- GitHub PagesでCalculator Memo本体が表示されることを確認した。
- 公開画面で電卓、計算履歴、計算メモ、テーマ選択が表示されることを確認した。
- 公開画面のブラウザコンソールに警告・エラーがないことを確認した。

## 2026-07-23: GitHub ActionsをNode.js 24対応版へ更新

### 実施内容

- `actions/configure-pages`を`v5`から`v6`へ更新した。
- `actions/upload-pages-artifact`を`v4`から`v5`へ更新した。
- `actions/deploy-pages`を`v4`から`v5`へ更新した。
- GitHub公式の安定版を使用し、JavaScript Actionの実行ランタイムをNode.js 24対応へ移行した。
- 警告を隠すための`FORCE_JAVASCRIPT_ACTIONS_TO_NODE24`は追加していない。
- アプリ本体、ビルド設定、`main`限定のデプロイ条件、Pages環境設定は変更していない。

### マージとローカル更新

- Pull Request #3を`main`へマージした。
- マージコミットは`defaab544f8f48efec0584a92269bd97b442f748`。
- ローカル`main`を`dfc1d26fb8ee28c5b99927a9e93acba79610908c`からマージコミットへfast-forwardで更新した。
- 更新後の`HEAD`、ローカル`main`、`origin/main`が同じマージコミットを指すことを確認した。
- マージされた差分が`.github/workflows/deploy-pages.yml`と`Log.md`だけであり、アプリ本体やビルド設定などに想定外の変更がないことを確認した。

### GitHub Actionsと公開確認

- `main`へのpushを契機に`Deploy GitHub Pages`が実行された。
- 対象コミットが`defaab544f8f48efec0584a92269bd97b442f748`であることを確認した。
- buildジョブ、deployジョブ、ワークフロー全体、Pages deploymentはいずれも成功した。
- 実行ログで`actions/configure-pages@v6`、`actions/upload-pages-artifact@v5`、`actions/deploy-pages@v5`が使用されたことを確認した。
- 以前表示されていたNode.js 20廃止警告が解消されたことを確認した。
- 公開URLでCalculator Memoが正常に読み込まれることを確認した。
- 電卓、計算履歴、計算メモ、テーマ選択、3カラムレイアウトが表示され、明らかな崩れや横方向のオーバーフローがないことを確認した。
- JavaScriptとCSSが`/calculator-memo/assets/`配下から読み込まれ、ブラウザコンソールに警告やエラーがないことを確認した。

### 残存する警告

Node.js 20廃止警告とジョブエラーは解消したが、Actionsログには次の非致命的な警告が残っている。

- `@esbuild-kit/esm-loader`と`@esbuild-kit/core-utils`のdeprecated警告
- Viteが出力するJavaScriptチャンクサイズ警告
- `actions/deploy-pages@v5`の実行時に出力されるNode.jsの`punycode`モジュール非推奨警告

これらは今回のbuild、deploy、公開画面の動作を失敗させていない。依存関係や公式Action側の更新状況を確認しながら、必要に応じて別の保守作業として対応する。

### 関連情報

- `7b502f5` — `ci: update GitHub Pages actions to Node.js 24`
- `defaab5` — Pull Request #3のマージコミット
- Pull Request #3: https://github.com/tetsujisugimori-coder/calculator-memo/pull/3
- Actions実行: https://github.com/tetsujisugimori-coder/calculator-memo/actions/runs/29969668264
- 公開URL: https://tetsujisugimori-coder.github.io/calculator-memo/

## テストと検証の記録

現在の自動テストは次の3ファイルで構成されている。

- `tests/calculator.test.ts`
- `tests/format-copy.test.ts`
- `tests/storage.test.ts`

直近の検証結果:

- Vitest: 3ファイル、33テスト成功
- ESLint: 成功
- TypeScript型チェック: 成功
- vinextビルド: 成功
- GitHub Pages用Viteビルド: 成功
- GitHub Pages公開画面: 表示確認済み

## 保留中・今後の候補

### 機能候補

- 関数電卓
- 計算履歴、計算メモのドロワー化を含む将来レイアウト
- JSONなどによるデータの書き出し・復元
- iCloudやOneDriveなどとの同期

これらは現時点では確定機能ではない。

### 技術上の注意

- Pages用JavaScriptには500KBを超えるチャンク警告がある。現在は動作上の問題になっていないため、公開対応と分離して検討する。
- `localStorage`を削除すると、保存した履歴やメモが失われる可能性がある。
- GitHub Pagesの本番デプロイは`main`へのpushでのみ自動実行する。

## 今後の追記形式

```md
## YYYY-MM-DD: 変更の概要

### 目的

- 変更が必要になった理由

### 実施内容

- 変更した内容

### 検証

- 実行したコマンドと結果

### 関連情報

- コミットID、Pull Request、Issue、公開URLなど

### 残件

- 未完了または次回検討する内容
```

## 2026-07-23: プレーン計算メモへ数式・計算ブロックを追加

### 目的

- 通常の文章、表示専用数式、評価可能な計算式を1つの計算メモ内で混在できるようにする。
- 複数の式や途中計算を、順序を保ったまま編集・保存・再表示できるようにする。
- PR #4で追加したMarkdown／KaTeX本文と既存保存データの互換性を維持する。

### 実施内容

- プレーン計算メモへ、文章、数式、計算の3種類の本文ブロックを追加した。
- 文章ブロックはMarkdown入力とプレビューを使用する。
- 数式ブロックは既存KaTeXレンダラーを再利用し、計算結果を生成しない表示専用ブロックとした。
- 計算ブロックは通常電卓と同じ計算エンジンを使用し、入力時に式、表示式、結果、エラーをブロック単位で更新する。
- 不正な計算式を含むブロックも保存可能とし、他の正常な文章・数式・計算ブロックへ影響しない構造にした。
- 各ブロックの追加、編集、削除、上移動、下移動に対応した。
- ブロックの種類、内容、順序、計算結果、エラーを`blocks`配列へ保存するようにした。
- Markdown互換の`content`を引き続き保存し、ブロック導入前のプレーン計算メモは既存本文を1つの文章ブロックとして編集できるようにした。
- 読み込んだ`blocks`が部分的に壊れている場合は採用せず、既存`content`へフォールバックするようにした。
- 数式ガイドへ「数式ブロック」と「計算ブロック」を追加し、入力例、実表示、用途、利用可能な演算、非対応記法を記載した。
- PCとモバイル向けにブロック編集、操作ボタン、ガイド例のレスポンシブ表示を追加した。

### 検証

- `npm test`: 4ファイル、43テスト成功
- `npm run lint`: 成功
- `npx tsc --noEmit`: 成功
- `npm run build`: 成功
- `npm run build:pages`: 成功（既存のJavaScriptチャンクサイズ警告のみ）
- 文章1件、数式2件、計算2件を1つのメモへ追加し、削除と上下移動を確認した。
- `200*(5%+5%) = 20`と不正式`2+`を同時に保存し、正常結果と局所エラーが互いに影響しないことを確認した。
- 保存後の再読み込みで、数式ブロック2件、計算ブロック2件、順序、結果、エラーが復元されることを確認した。
- 旧形式のMarkdown本文を文章ブロックへ変換するテストと、不正な任意ブロック配列から既存本文へフォールバックするテストを追加した。
- 390px幅でモーダルの横あふれがなく、追加ボタン44px、並べ替え・削除ボタン40pxの高さを確認した。
- 数式ガイドの両ブロック例がPCと390px幅で表示されることを確認した。
- ブラウザのエラーオーバーレイとコンソールエラーがないことを確認した。

### 関連情報

- Pull Request #4: https://github.com/tetsujisugimori-coder/calculator-memo/pull/4
- 本変更はPR #4の既存作業ブランチへ追加コミットとして反映する。

### 残件

- ドラッグ＆ドロップによる並べ替えは未実装。現在はキーボード操作可能な上移動・下移動ボタンを使用する。
- Memo Nexusとの直接連携、共通パッケージ化、表・画像・Mermaid対応は別作業とする。

## 2026-07-23: 計算メモ種別の表示名と新規作成動線を整理

### 目的

- 複数ブロック型を正式な「計算メモ」とし、「計算メモ」を選ぶと複数の計算式を追加できる状態にする。
- 従来の単一式型は、1つの電卓結果を保存する機能だと分かる「単独計算メモ」へ表示名を変更する。
- データ移行を行わず、既存のtype値と保存データを維持する。

### 新旧メモ種別の対応

| 保存上のtype | 以前の表示名 | 新しい表示名 | 用途 |
| --- | --- | --- | --- |
| `plain-calculation` | プレーン計算メモ | 計算メモ | 文章・数式・計算ブロックを複数保持 |
| `calculation` | 計算メモ | 単独計算メモ | 電卓の1つの式と結果を保持 |

### 実施内容

- メモ種別の表示名を共通定義へ集約した。
- 新規作成メニューの先頭へ「計算メモ」を配置し、計算結果の有無にかかわらずブロックエディタを開けるようにした。
- 「単独計算メモ」は電卓で結果を確定した場合だけ作成可能とした。
- 電卓内の作成ボタンと計算履歴のメモ作成ボタンを「単独計算メモ」へ変更した。
- 編集モーダル、メモ一覧の種別バッジ、詳細表示の種別バッジ、保存・更新通知を新しい名称へ統一した。
- 空状態で、計算メモは複数ブロック型、単独計算メモは電卓結果用であることを説明した。
- 数式ガイドで、数式ブロックと計算ブロックが「計算メモ」で使用できることを明記した。
- READMEの機能説明と保存typeの対応関係を更新した。

### 互換性

- `type: "plain-calculation"`と`type: "calculation"`は変更していない。
- トップレベルの保存データバージョン`1`、既存フィールド、ブロック構造も変更していない。
- 今回の変更に伴うデータ移行は行わない。

### 検証

- `npm run lint`: 成功
- `npx tsc --noEmit`: 成功
- `npm test`: 5ファイル、45テスト成功
- `npm run build`: 成功（既存のチャンクサイズ警告のみ）
- `npm run build:pages`: 成功（既存のチャンクサイズ警告のみ）
- 新規作成メニューの「計算メモ」からブロックエディタが開くことを確認した。
- 文章1件、数式1件、計算2件を混在させ、`2+3 = 5`と`10*4 = 40`を保存できることを確認した。
- 再読み込み後も両メモ種別、ブロックの種類・順序・内容・計算結果が復元されることを確認した。
- 従来型の`8*7 = 56`を「単独計算メモ」として作成し、編集・保存・再読み込みできることを確認した。
- カード、詳細、編集モーダル、通知、空状態、数式ガイドの表示名が一致することを確認した。
- ブラウザのエラーオーバーレイとコンソールエラーがないことを確認した。

### 関連情報

- Pull Request #4: https://github.com/tetsujisugimori-coder/calculator-memo/pull/4

## 2026-07-25: Memo Nexusからの計算式受け取り

- URLの`expr`クエリパラメータを`URLSearchParams`で読み取り、初回表示時に既存の計算式stateへ設定する一方向連携を追加した。
- 受け取った式は自動計算せず、結果と履歴も作らない。日本語や未対応記号を含む値も文字列として表示し、既存の計算操作時に従来のエラー処理へ渡す。
- 極端に長い値は2,000文字へ制限し、URL読取処理を`lib/url-expression.ts`へ分離した。
- `npm test`は既存回帰を含む全51件、`npm run lint`、`npx tsc --noEmit`、`npm run build:pages`、`git diff --check`が成功した。Pagesビルドには既存のチャンクサイズ警告だけが出た。
- ブラウザで`expr=2 * (5 + 3)`が入力中の式として表示され、起動直後は結果`0`のまま履歴を追加せず、「=」を押すと既存仕様どおり`16`になること、ダークテーマでの表示、コンソールerror 0件を確認した。接続ブラウザの幅変更が反映されず実画面での3幅比較は未実施。
