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

## 2026-07-23: GitHub ActionsをNode.js 24対応版へ更新

### 実施内容

- `actions/configure-pages`を`v5`から`v6`へ更新した。
- `actions/upload-pages-artifact`を`v4`から`v5`へ更新した。
- `actions/deploy-pages`を`v4`から`v5`へ更新した。
- GitHub公式の安定版を使用し、JavaScript Actionの実行ランタイムをNode.js 24対応へ移行した。
- 警告を隠すための`FORCE_JAVASCRIPT_ACTIONS_TO_NODE24`は追加していない。
- アプリ本体、ビルド設定、`main`限定のデプロイ条件、Pages環境設定は変更していない。

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

## 依存関係の保守

- `mathjs`のセキュリティ対応を反映した。
- `package.json`と`package-lock.json`の整合性を維持した。

### 関連コミット

- `890f0e9` — `Update mathjs security fix`

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
