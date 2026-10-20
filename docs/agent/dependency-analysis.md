# 読み取り専用の依存解析・変更影響・Mermaid

2026-10-20 (JST)。基点はPR #37をマージしたmain `83ae24cc4b921b67a785c2e0160e7b8f63a2972c`。

## 範囲と安全境界

今回追加したのは内部APIとMermaid文字列生成である。画面への依存グラフ描画、コピーボタン、自動/部分再計算、Excel式エンジン、Memo Nexusへの送信は追加しない。保存形式/version/metadataを変更しない。解析は入力を変更せず、計算結果を書き換えず、数値評価も実行しない。

ID参照標準化の実行計画では、構造部分を `analyzeMemoDependencyStructure` として共有する。`analyzeBlockDependencies` はその互換wrapperになり、確定ID辺と参照構造エラーだけを実行へ使う。保存エラーと不確定変数候補をpreflight失敗へ変換しない。既存の全体stale化、全成功時だけ一括確定、失敗rollback、旧評価フェーズのエラー優先順位、丸め前精度、未知形式の非破壊保護はそのままである。新解析の細かい影響範囲で既存staleを解除してはいけない。

## API

- `analyzeMemoDependencies(blocks)` (`lib/dependency-analysis.ts`): 計算ノード、source→targetの辺、診断、変数束縛候補、解析完全性を返す。
- `analyzeDependencyImpact(beforeBlocks, afterBlocks)`: 両snapshotの解析と、直接変更元 `changedIds`、配置逆転 `reorderedIds`、束縛変更 `bindingChangedIds`、変更元を含む潜在的推移影響 `affectedIds`、不確定伝播 `uncertainIds`、ID別理由 `reasons` を返す。
- `toMermaid(graph, { changedIds?, affectedIds? })` (`lib/dependency-mermaid.ts`): Mermaid `flowchart TD` 文字列を返す。オプションはReadonlySet。出力はこの関数の返値として取得する内部機能であり、新しいUIからは操作しない。

```ts
const impact = analyzeDependencyImpact(before, after);
const mermaid = toMermaid(impact.after, {
  changedIds: new Set(impact.changedIds),
  affectedIds: new Set(impact.affectedIds),
});
```

`npx --no-install vite-node --config vitest.config.ts examples/dependency-analysis.ts > dependency.mmd` で合成データの実例を再現できる。stdoutはMermaid、stderrは変更元/影響/不確定IDのJSON。独立したunrelatedは影響範囲へ入らない。

削除ノードはafterグラフには存在しないが、影響APIには削除元IDが残る。削除前の図が必要ならbeforeを出力する。IDはブロックIDであり、配列位置・式・表示名ではない。メモを越えた参照を扱わない。

## 同じ構文解析と静的な束縛の限界

ID参照は既存のtoken橋渡し+AST検査 `inspectBlockReferenceExpression` を共有する。実際に式で使うslotだけを解析し、未使用対応・登録式名を依存と解釈しない。有効slotと削除先slotの混在では有効な辺を残し、削除先を別に診断する。文章/KaTeXへの参照も削除先相当。拒否された式を正規表現で推測して辺にしない。

旧変数は `inspectIdentification` → `describeCalculationBlock`/`assertVariableName`/`inspectFormulaDefinition` の既存境界で構文検査する。先行する同一メモの代入だけを候補とし、`x=x+1` は書込み前のscopeを読む。構文不正・必ず未定義の参照を含む代入は成功しないので候補へ加えず、従前候補を保つ。関数・定数・文章・表示数式は変数ではない。従来電卓モードの `2x3` と変数モードの文法を区別し、従来モードにも実計算と同じ構文専用検査を使う。

**数値計算をしない以上、構文が正しくても代入成功は確定できない。** `x=1/0`、`x=sqrt(-1)`、指数・有限実数・結果範囲のエラーがありうる。この版では単なる `x=2` も特例で証明しない。保存済みresult/errorは古い可能性があるので成功証明には使わない。すべての構文上成功しうる先行代入を保持し、変数の辺を `uncertain`、束縛を `possiblyUndefined:true` とする。後続代入の失敗時に残る古い候補を落とさないための保守的過大包含であり、実際の有効な代入を特定したという意味ではない。

例: `a:x=2`、`r:x=1/0`、`c:x+1` ではa→cとr→cを不確定候補として出す。実際の再計算ではrは失敗してaの値が残るが、この解析はそれを評価して確定しない。候補が一つもない場合は `undefined-variable`、候補があるが成功不明なら `uncertain-binding` と区別する。変数scopeに無関係な独立ブロックBは影響範囲へ入れない。

IDの `definite` は参照先の同一性が確定という意味であり、参照元の計算成功を保証しない。保存済み `error` は `saved-error` として過去の計算状態だと明示する。pendingは既存のsignature/stale判定から取得し、解除・変更しない。

## 診断と変更影響

自己参照、真の循環成分、循環に依存するだけのノードを分ける。非再帰の到達可能性で判定し、128計算ブロック上限を守る。欠落/重複/空IDや上限超過は解析不完全として返し、曖昧なIDのグラフを作らない。未知モード・不正参照構造も明示して解析不能を隠さない。

変更影響は旧・新両方の辺の和で閉包を取る。これにより削除、参照先変更、変数名変更、先行代入追加による未定義解消、並替えによる束縛候補/優先順変更を見落とさない。式・mode・丸め前result・保存error・実際に使用するslot対応を直接変更として扱う。未知の説明metadata、未使用slot、slot配列順、resultTextだけの変更は数値影響ではない。

表示配置の変更は `reorderedIds` に別報告する。IDだけの参照や独立計算を移動しただけなら数値影響にしない。旧変数の束縛候補/順序が変わる消費側は `bindingChangedIds` として影響の起点になる。追加に伴う配列indexの単純なずれを移動とはしない。

未知mode等の解析不能ノードがある場合、変更/並替えがあればそのノードを `analysis-incomplete` 理由付きの不確定影響に加える。全体ID不正/上限超過では計算IDすべてがその対象になる。これは精密な閉包を保証できない場合だけの明示的fallbackであり、正常で無関係なノードを一律追加しない。

## Mermaid出力

ブロックIDのUTF-16コード単位を固定4桁hexへ符号化する（hashではない）。表示名・式の変更や並替えでノードIDが変わらず、任意の文字列ID同士が衝突しない。ラベルは全コードポイントをMermaid十進entityにする。日本語、引用符、改行、HTML風文字、構文注入風の入力を生の構文へ混ぜない。

ノード/辺をlocale非依存順に整列し、同一source/target/certaintyの辺は集約、複数変数名を残す。確定IDは実線、不確定変数は点線。通常、変更元、影響候補、再計算待ち、保存済みエラー、解析エラー、依存不確定を文字ラベルでも区別し、重なる状態を省略しない。文字列生成だけであり、利用先での描画ポリシー/テーマ適合/ユーザー権限まで保証しない。全体エラーはコメントにも含める。

Mermaid 11.12.2とjsdom 26.1.0はテスト専用devDependencies。アプリにはMermaidランタイムやHTMLレンダラーを組み込まない。実parserで図のノード数・辺数も照合し、単に文字列をsnapshot比較しただけの構文検証ではない。

## 検証と残件

`tests/dependency-analysis.test.ts`: 単方向/前後、複数入力、多段、fork/join、再代入/失敗候補、混在、未定義/不正、循環/自己/子孫、変更/追加/削除/並替え、無関係ノード除外、metadata除外、JSON往復、raw精度、旧エラー優先/全rollback、凍結入力と評価spyによる無変更を検査。

`tests/dependency-mermaid.test.ts`: 実Mermaid parser、エスケープ/注入風入力、日本語、ID安定/衝突、重複辺、状態併記、自己/循環、純粋性を検査。既存全単体・lint・型・両build・GUI回帰の実行結果はLOG/PRを参照。UIは変更しないが既存計算/保存動作のGUI回帰は継続する。Safari実機と外部サービスへのMermaid取込は今回未検証。

実行順序の制約、ID順tie-break、今回診断と保存状態の区別は[実行計画設計](execution-plan.md)を参照。
