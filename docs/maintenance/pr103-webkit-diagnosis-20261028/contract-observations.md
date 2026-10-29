# 46契約の既存証拠とWindows観測

run 40671009347 attempt 1/2の各artifactに含まれる `ci-contract.log` を再読し、各々46 tests・46 pass・0 failを確認した。これはコード `52f4f6914fcd3c72b0829018842f653f06abe5f2` の過去Ubuntu CIであり、今回の新規実行ではない。Windows・Node 24のGit BashをPATHに加えたホスト実行は38/46成功。以下はその8失敗であり、単一の原因や実契約違反とは断定しない。Gitの原本LFを一時的に使用し、checkout時のCRLF変換によるworkflow文字列照合失敗は別途解消してからの結果。

|試験|期待|Windowsでの実結果|暫定分類|
|---|---|---|---|
|unit failure propagation|isolated diagnostic failure|出力空|未確定。POSIX fixtureの起動経路をWindowsで再現できていない|
|normal_build failure propagation|同上|出力空|未確定、同上|
|pages_build failure propagation|同上|出力空|未確定、同上|
|apt_config failure propagation|同上|Windows sudoが `--preserve-env` を拒否|環境依存の証拠あり|
|os_install failure propagation|同上|Windows sudo無効のメッセージ|環境依存の証拠あり|
|log storage failure cannot be concealed|successful synthetic command|出力空|未確定。fixtureコマンドの到達性未確認|
|missing-context validation at process boundary|不足条件のエラー文字列|stderr undefined|未確定。子プロセス起動結果の詳細未取得|
|bounded acquisition timeout|終了コード124|2304|未確定。Windowsのプロセス／timeout挙動とLinuxの相違が候補|

これらはWindowsの検査結果であり、検査器欠陥や実契約違反を確定する証拠ではない。新規Ubuntu 24.04・Node 22.13.0で46件を再実行し、同一試験名と出力で対応付ける。信頼性に関わる失敗時はGUIを開始しない。期待値や試験を弱めない。
