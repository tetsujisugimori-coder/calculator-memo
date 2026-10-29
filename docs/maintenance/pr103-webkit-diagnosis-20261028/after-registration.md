# 登録後の限定実行手順（今回は未実施）

対象は [計画](proposed-plan.md)の4 caseのみ。診断workflowの人間によるレビュー・main登録は別判断で、このPRはマージしない。新規workflowはdefault branchに存在するまで手動起動できない。登録や診断成功は #103 の正式GUI成功・マージ許可ではない。

1. 人間が登録したcommitとworkflowを確認し、mainの実SHAを取得して、レビュー済み診断コードと一致することを確認する。固定アプリ `52f4f6914fcd3c72b0829018842f653f06abe5f2` が同repositoryから取得できることも確認。診断コードSHAとアプリSHAは別々に記録する。異なる場合は停止し、既存commitを書き換えない。
2. Actions利用権限、Ubuntu 24.04 x64、Node 22.13.0、固定lockfileとWebKit取得、30分枠、artifact保存・取得、利用枠と費用を確認する。不明はUNKNOWNとして停止する。新規有料契約・権限変更は自動で行わない。
3. 実行前に[Windowsの8件の対応表](contract-observations.md)を確認する。workflowは実行時に先に追加mock試験とLinux子孫cleanup、次にアプリSHAの既存46契約と該当8試験名の出力を検査する。いずれかの失敗、skip、欠測、fixtureの不整合があればGUIに進まない。追加試験は既存46と別集計し、OS差だけを理由に46件をskip・期待値緩和しない。実行後、8件の期待・実結果を照合し、環境依存／検査器／実契約／未確定を根拠別に分類する。Git原本LFとcheckout変換を区別し、Git設定を変更しない。
4. 上記の事前確認を満たした場合だけ、登録後に `gh workflow run pr103-diagnostic-draft.yml --ref main` を一度起動する。起動前にmain SHAがレビュー対象のままであることを再確認。workflow内の前提検査が成功すると4 caseが続けて実行される。別環境なら計画の固定CLI入口を使い、実行IDと環境差を記録する。無記録の追加case・自動retryは禁止。途中失敗、欠測、タイムアウト、残時間不足では停止する。300秒はcase停止要求、cleanup猶予は別計上、1200秒は新規case開始判断の予算、30分はjob全体であり、超過を成功・無断延長としない。
5. run URL、attempt、診断コードSHA、app SHA、OS／arch／Node／browser、開始・終了・準備・待ち・GUI・cleanup、exit、4 case各々の11群／65 tap・時間・観測負荷・欠測・process帰属の限界を保存する。全case終了と根因確定を分ける。必須の進捗JSON・ログ・artifactが欠落した場合はUNKNOWN／未完了とする。今回の診断はtraceを採取しないため、trace不存在を欠落としない。
6. artifact一覧のID・size・digestをAPIから取得し、そのIDのZIPを別途ダウンロードして `sha256sum` とbytesをAPIと比較する。run・attempt・各caseのprovenanceも照合する。例：`gh api repos/tetsujisugimori-coder/calculator-memo/actions/artifacts/ARTIFACT_ID/zip > artifact.zip`。具体的なIDはAPIから得る。保持期限・取得不能も記録し、job強制終了時のuploadを保証しない。

正常時もこの限定診断は正式6条件全体ではない。比較は幅のみとDOM追加観測の有無を分け、長い先行操作や他workerの競合は再現していない。実iPhone Safari、VoiceOver、OS文字拡大も未検証。
