# 出典追跡pure helperの検証

実施日時：2026-10-27 13:52〜13:53 JST。実装担当による実行であり独立レビューではない。
基点HEAD：6e3fa736b9ee335ab5c61b96cc5b52c0b8073868、基点tree：2505d2f6a81a44d60484be03fc6725683dc8a91c。新機能helper・試験・診断exportは未commit変更として実行（基点HEADの成功とは扱わない）。

## RED→GREEN
新helperの補強前相当（一時的に2つの補強のみ除去）で、同一期待値の2件を実行。
- M内部から始まりM外部で閉じるrecordとの交差：completeを返すためFAIL。
- 後方の破損record領域に飲み込まれた同一ID start：availableを返すためFAIL。

コマンド：`npm test -- tests/formula-report-audit-comparison-navigation.test.ts -t 'refuses record start inside|refuses same-ID strict starts'`
結果：2 fail／43 filter skip、exit 1。試験ソースへのskip追加はなく、限定実行のフィルタによるもの。
このREDは新規helper実装中の補強前再現であり、PR95既存scannerの新たな不具合を意味しない。

復元した補強：
1. 比較markerを除いた既存record scannerによるclosed交差の拒否専用診断。
2. M外の同一ID start観測数が複数ならsource ambiguousとし、invalid領域に飲み込まれたstartも無視しない。

復元後コマンド：`npm test -- tests/formula-report-audit-comparison-navigation.test.ts`
結果：45 pass／0 fail／0 skip、exit 0、1.03秒。

最初の試行は新テスト自身の括弧typoによって収集失敗。製品REDに数えず、`navigation-pure-setup-failure.txt`へ別途保存。typo修正後に上記REDを再取得。失敗ログは削除していない。

## 証拠SHA-256
- navigation-pure-green.txt: 15959effda66d5fd5c9993cdcbd8a1613bd0dfae345c49478e2b7801b08743c2
- navigation-pure-red.txt: 8d99dd1427e7544371546c9d3646f040a7f2b186f5c7af860156693bc9bef261
- navigation-pure-setup-failure.txt: 10c5d3bfade62d04332de040f351e40b8ace425e3db5de7ca7a0176b4fda821c

## 独立レビューへ引き継ぐ境界
M内だけにある未閉鎖record風文字列は既存PR95 creatorで許可されたinert内容であり、診断scannerがEOFまで伸ばすことだけを理由に正常Mを拒否しない。確定closed交差は拒否する。未知startと後方のもっともらしいendを推測対応させない。外側孤立markerによる一覧不完全表示と、Mの厳密な比較marker境界を区別する。この境界の妥当性を独立担当にも確認してもらう。
