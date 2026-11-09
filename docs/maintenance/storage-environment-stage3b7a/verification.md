# Stage 3B-7A 検証台帳

## 現段階
- 作業範囲：独立runner初期失敗の原証拠保持、環境検証の手順と判定境界。
- 実機Safari/プライベートブラウズ/実quota/列挙競合/OS強制終了・媒体耐久性：NOT_TESTED。このPRで実測したと主張しない。
- A6の改修：読込み失敗行を残すfail-closedのコード変更。独立CI内で使い捨てChromiumを起動し、初期ロード直前に合成例外を1回注入する負対照を追加。子プロセスexit1、失敗行のstage/error/条件1件、PNG未生成を親が検査し、原stdout/stderr/summaryを保存する。**新最終HEADのCI実測は未確認**。
- Stage 3B HOLD、実データ書込み・移行・削除・復旧なし。
- CIの最終HEAD/run/attempt/原artifact照合：未実行。PR後のChecksと原物の確認を必要とする。

## 次の証拠採取
1. 独立runnerの初期ロード失敗・正常ロードの両経路を合成profileで比較。失敗行のstage/errors/statusとexit codeを確認し、旧版の原証拠と区別する。
2. 各トラックに実施可能性・権限/隔離要件の台帳を埋める。安全な環境がなければNOT_TESTEDのまま。
3. 最終HEADの関連unit/契約、型/lint/両build、Stage 3A/3B-1〜6、正式6 GUIと原成果物照合。実行しなかった項目は成功として加算しない。
4. 別担当の独立レビュー、誤成功の負対照、P1/P2再検証の後に限定受入を判断。

## 戻し方
独立runnerの局所差分と本設計/台帳をrevertする。本番データ形式も保存先も不変更で、データ逆移行は発生しない。
