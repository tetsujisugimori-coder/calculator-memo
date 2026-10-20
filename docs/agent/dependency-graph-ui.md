# 読み取り専用の依存関係図とブロック移動

2026-10-20 (JST)。基点 main `3339d978acd9518976a8954e77be4f8bcf50d6b4`（PR #40 merge）。

## 既存機能と追加範囲

PR #38の依存解析・安定ID・Mermaid生成と、PR #40の `buildCalculationStatus` / `CalculationStatusDetails` を再利用する。追加するのは折り畳み図、図上の選択、既存カードへのscroll/focus/強調、明示的な計算式フォーカスである。数値評価、scope、丸め、全成功時の一括確定、rollback、保存形式は変更しない。図は現在の編集snapshotの派生表示で、保存値や未確定状態を更新しない。

矢印は参照先→利用側。確定ID辺は実線、旧変数の未確定候補は点線。表示順・実行フェーズ制約ではない。旧変数の候補を確定束縛や計算失敗とみなさない。各ノードは既存状態ラベルと固定線種・色を併用し、複数状態を残す。全体未確定と個別の変更/原因/下流の区別はPR #40のまま。

## 描画と安全境界

Mermaidを同じ固定versionのruntime依存へ移し、開いたときだけdynamic importする。描画を直列化し、閉じる/編集/削除/unmountで旧描画を無効化する。Mermaidはstrict、htmlLabels=false、click callback/bindFunctions不使用。rendererのSVGはそのままHTML挿入せず、DOMParser後にSVG要素・geometry属性の許可リストで再構築する。HTML/foreignObject/script/style/event/href/外部URLは破棄。固定CSSだけを適用する。

既存のexport文字列の数値entityはMermaid 11.12.2の非HTMLテキスト描画でentity自身が表示されるため、そのまま描画には使わない。描画専用入力は同一ノード/辺のまま安全な固定placeholderラベルへ置換する。sanitize後に元の表示文字をSVG textContentで復元し、式をMermaid/Markdown/HTMLとして解釈しない。表示式は80文字preview、状態suffixは維持。完全な式はnodeのアクセシブル名・移動先・コピー原文で確認する。辺ラベルはID参照/旧変数候補に短縮し、具体的変数名はコピー原文に維持する。依存辺・certainty・状態はexportと同じで、export出力自体は変更しない。

SVG生成node IDの完全一致を `mermaidBlockId` の既知ID mapと照合する。label/位置/部分一致/selectorへのrawID埋込みを使わない。重複・欠落・未知node mappingは図を表示せず一覧へfallbackする。選択時にも最新blocksの存在確認を行う。表示番号や同名式が変わってもID対応は不変。

## 操作と上限

図の外枠はスクロール可能で50〜200%の拡縮を提供する。SVG実寸を維持し、root文字拡大では座標系全体をrem寸法で拡大してラベルと枠の比率を保つ。長い図を小さな画面へ全体縮小してタップ不能にしない。ノードはEnter/Spaceとtapに対応。pointerの8px超移動またはcancel後のclickは選択せず、native pan/pinchを妨げない。カード移動は選択詳細挿入後のrAFで行い、移動先の番号付き目印・編集操作をscroll領域の中央へ置く。削除/unmount後の対象へのscrollは行わない。計算式を勝手に編集開始せず、明示ボタンで既存inputへfocusする。診断は同じiコンポーネントを再利用し、UIで原因を再判定しない。

表示上限は128node、256edge、入力25万文字、SVG4MB、各viewBox寸法5万。超過や描画例外は理由/一覧/既存Mermaidコピーを残し、計算・保存データは変更しない。大図を無限に描画する約束はしない。実iPhone Safari、OSキーボード、VoiceOver、Memo Nexus取込は未検証。自動再計算・部分確定・依存編集・直接送信は対象外。

## 参照と検証

AGENTS、README、依存解析/実行計画/状態設計、GitHub運用・検証規約、GUI READMEを参照。八兵衛の憲法v2関連範囲、江戸弁運用ガイド関連検索結果、辞典v19冒頭関連範囲を参照した。全文読了とは扱わない。参照失敗なし。

単体/GUIの実測結果、独立レビュー、実PR番号・最終SHAのCIはLOGとPRに追記する。初期実装時点で未確認の成功を先取りしない。
