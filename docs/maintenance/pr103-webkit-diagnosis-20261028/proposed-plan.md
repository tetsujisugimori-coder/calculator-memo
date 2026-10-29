# PR #103 限定診断計画（未実行・未完成）

新規 `workflow_dispatch` workflowはGitHub仕様上、default branchにファイルがなければ起動できない。現時点のmainには診断workflowがない。マージ、公開用workflowの転用、PR triggerへの変更は承認されていない。隣接するworkflowは契約試験のみを準備する未完成の下書きで、GUI計測には必ず失敗終了する。実測結果ではない。

## 固定条件と比較対象

- 診断対象コード `52f4f6914fcd3c72b0829018842f653f06abe5f2`、Ubuntu 24.04、Node 22.13.0、両lockfileとPlaywrightに固定されたWebKit。checkout実SHAと配信アプリの同一性を確認する。診断用コードのSHAは別に記録する。
- 正式run 40671009347 attempt 1/2はともにWK390が `saved-record-comparison` 途中で未完走。共通する遅延が大きい既存の `formula-audit-record-comparison` を最初の限定対象とする。既存fixture・操作・assertionを共有し、375と390で同一にする。375は高さ667・DPR2、390は高さ844・DPR3で、幅だけの比較ではない。正式条件に合わせる比較とし、幅単独の因果とはしない。
- 仮説1：操作要求から完了までの差が増える。支持は同一操作の複数測定で一貫した差、否定方向は差が小さく区間外が支配的な場合。dispatchにはactionabilityとbrowser処理が混在し、それだけでは原因を分離できない。
- 仮説2：長い先行操作によるpage/DOM蓄積が寄与する。fresh contextと同じ操作列を通過した後の比較が必要。ただしprefix構築方法・測定点・操作数がまだ未実装であり、この計画だけで比較は開始しない。
- 仮説3：resource競合が寄与する。visible Linux子孫のCPU tick/RSSと観測時刻・採取時間を記録し、欠落を明示する。host/Node値からbrowser原因を断定しない。独立したプロセスの負荷差は残る。

## 実装・レビュー前の案

実装前に各caseの正確な操作数、assertion、先行prefix、順番、比較可能性と観測あり／なしの対照を別途確定する。仮の上限は1 case 5分、4 case・各1回、job全体25分（準備・開始待ち・実行・後処理を別記録）。回数不足や時間切れによる追加実行はこの案から自動承認されない。assertion失敗、識別不一致、browser error、収集不能、case上限、残りjob時間不足で停止し、不完全として保存する。正常時も正式GUI PASSとはしない。

各操作の要求・dispatch開始・終了・観測完了を単調時刻で記録。DOM要素数、page数、modal数は事前に固定した区間の前後だけ測定し、採取時間を別記録する。観測あり／なしを対照に測定し、その負荷を推定する。ログ・progress・環境・失敗情報を逐次保存し、失敗・取消時も取得可能な範囲でartifactを保存する。job強制終了ではアップロードが実行されない可能性があり、完全保存を保証しない。artifactのID・digestと再取得bytesを別途照合する。

本案では必要な測定器・prefix・観測負荷対照が未完成であり、結果の支持／否定や性能修正根拠には使えない。正式6条件・3workers・30分・1128検査・592 geometry・132 PNG・touch各1337・成功trace非保存は変更しない。実機iPhone Safari・VoiceOver・OS文字拡大も対象外。

## 実行経路の選択肢

1. 承認済みのUbuntu 24.04隔離環境を利用する。runner image、CPU/メモリ、ブラウザ依存、費用、権限を確認し、GitHub hosted runnerとの差を結果に明記する。
2. 人間が別途承認した最小の診断workflowをdefault branchに登録し、その後診断branchをdispatchする。default branchへの変更・マージは今回の権限に含まれない。登録に先立ち測定器・計画とworkflowを完成させ、独立レビューする。

いずれも現時点で実行していない。次の作業は計測器と計画を完成させ、選択された環境で静的・限定動作検証を行うこと。
