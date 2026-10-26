import assert from 'node:assert/strict';

/** Generated identifiers are not current calculation values. Exclude exactly the
 * dedicated identity paragraph, never arbitrary nodes or arbitrary numeric text. */
export function assertHistoricalSourceText(text, identityParagraph, formulaId, timestampParagraphs = []) {
  const uuid = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
  const pattern = new RegExp(`^差分ID：${uuid}　元引用ID：${uuid}　登録式ID：`);
  const prefix = identityParagraph.match(pattern)?.[0];
  assert.ok(prefix && identityParagraph === prefix + formulaId, 'Only the exact generated-ID paragraph may be excluded');
  assert.equal(text.split(identityParagraph).length, 2, 'Identity paragraph must occur exactly once');
  let content = text.replace(identityParagraph, '');
  const stamp = '\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z';
  const formats = [new RegExp(`^保存原本取得日時：${stamp}。照合はこの取得時点だけです。数学的証明、真正性、利用者の明示確認ではありません。$`), new RegExp(`^元引用日時：${stamp}。差分プレビュー準備日時：${stamp}（保存完了・確認日時ではありません）。$`)];
  for (const paragraph of timestampParagraphs) {
    assert.ok(formats.some(format => format.test(paragraph)), 'Only exact timestamp metadata paragraphs may be excluded');
    assert.equal(content.split(paragraph).length, 2, 'Timestamp paragraph must occur exactly once');
    content = content.replace(paragraph, '');
  }
  assert.ok(!content.includes('999'), 'Current calculation sentinel must not enter historical source content');
}

/** Expected fields come from the synthetic saved snapshot, not rendered values. */
export function expectedHistoricalBlocks(record) {
  return record.blocks.map((block, index) => ({
    position: String(block.position), execution: String(index + 1), mode: block.evaluationMode ?? 'legacy（旧方式）',
    expression: block.expression, display: block.resultText, internal: block.result,
    inputs: block.inputs.map(input => ({ source: input.sourceBlockId, value: input.value,
      position: String(record.blocks.find(candidate => candidate.blockId === input.sourceBlockId)?.position ?? '確認不能') })),
  }));
}
