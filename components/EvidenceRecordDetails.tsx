import type { EvidenceRecord, EvidenceBlock } from "../lib/calculation-evidence";
import { evidenceInputLabel } from "../lib/evidence-comparison";

export function RecordInfo({ record }: { record: EvidenceRecord }) {
  return <dl className="evidence-fields"><div><dt>記録ID</dt><dd>{record.id}</dd></div><div><dt>計算日時</dt><dd>{record.calculatedAt}</dd></div><div><dt>保存要求時刻</dt><dd>{record.persistedAt}</dd></div><div><dt>計算ブロック数</dt><dd>{record.blocks.length}</dd></div></dl>;
}
export function BlockInfo({ block, executionOrder, record }: { block: EvidenceBlock; executionOrder: number; record: EvidenceRecord }) {
  return <div className="evidence-block-values">
    <dl className="evidence-fields">
      <div><dt>本文順</dt><dd>{block.position}</dd></div><div><dt>実行順</dt><dd>{executionOrder}</dd></div>
      <div><dt>計算モード</dt><dd>{block.evaluationMode ?? "legacy（旧方式）"}</dd></div>
      <div><dt>当時の入力式</dt><dd><pre>{block.expression}</pre></dd></div>
      <div><dt>当時の表示結果</dt><dd><pre>{block.resultText}</pre></dd></div>
      <div><dt>当時の内部結果</dt><dd>{block.result}</dd></div>
      <div><dt>記録内の状態</dt><dd>成功・確定記録（真正性や数学的証明の保証ではありません）</dd></div>
    </dl>
    <p>実際に使用した参照元と内部値</p>
    {!block.inputs.length ? <p>実使用の参照入力なし（記録内の情報）</p> : <ul>{block.inputs.map((input, index) => {
      const source = record.blocks.find(item => item.blockId === input.sourceBlockId);
      return <li key={index}><span>{evidenceInputLabel(input, block)}</span><dl className="evidence-fields"><div><dt>実使用元ID</dt><dd>{input.sourceBlockId}</dd></div><div><dt>実使用内部値</dt><dd>{input.value}</dd></div><div><dt>参照元の当時の本文順</dt><dd>{source?.position ?? "確認不能"}</dd></div></dl></li>;
    })}</ul>}
  </div>;
}
