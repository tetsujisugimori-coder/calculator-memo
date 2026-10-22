import { calculateMemoBlock, describeCalculationBlock } from './memo-blocks';
import { REFERENCE_MODE } from './reference-syntax';
import { evaluateReferenceMemo, isManualMemo } from './block-references';
import type { CalculationMemoBlock, MemoBlock } from './types';

/** Decimal round-trip encoding preserves IEEE-754 values, including negative zero. */
export type EvidenceNumber = string;
export type EvidenceInput = { kind: 'variable' | 'id'; name: string; sourceBlockId: string; value: EvidenceNumber };
export type EvidenceBlock = {
  blockId: string; position: number; expression: string; evaluationMode?: string;
  references?: { version: 1; entries: { slot: number; blockId: string }[] };
  inputs: EvidenceInput[]; result: EvidenceNumber; resultText: string; status: 'success';
};
export type EvidenceCandidate = { calculatedAt: string; blocks: EvidenceBlock[] };
export type EvidenceRecord = EvidenceCandidate & { id: string; persistedAt: string; evaluator: 'calculator-memo-v1'; status: 'confirmed' };
export type EvidenceHistory = { version: 1; records: EvidenceRecord[] };
export const EVIDENCE_LIMITS = { records: 100, bytes: 500_000 } as const;
export const evidenceNumber = (value: number): EvidenceNumber => Object.is(value, -0) ? '-0' : String(value);
const finiteEncoding = (value: unknown): value is string => typeof value === 'string' && Number.isFinite(Number(value)) && evidenceNumber(Number(value)) === value;
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const timestamp = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value));
const text = (value: unknown): value is string => typeof value === 'string';
const bytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).length;

/** Only get() from the numerical evaluator is observed; has() during validation is not a use. */
export class EvidenceScope extends Map<string, number> {
  readonly origins = new Map<string, string>();
  readonly reads: EvidenceInput[] = [];
  constructor(readonly kind: EvidenceInput['kind']) { super(); }
  override get(name: string): number | undefined {
    const value = super.get(name);
    const sourceBlockId = this.origins.get(name);
    if (value !== undefined && sourceBlockId && !this.reads.some(input => input.name === name)) {
      this.reads.push({ kind: this.kind, name, sourceBlockId, value: evidenceNumber(value) });
    }
    return value;
  }
}
export function evidenceBlock(block: CalculationMemoBlock, position: number, inputs: EvidenceInput[]): EvidenceBlock {
  if (block.result === null || block.error !== null) throw new Error('失敗した計算は根拠記録にできません。');
  return {
    blockId: block.id, position, expression: block.expression,
    ...(block.evaluationMode === undefined ? {} : { evaluationMode: block.evaluationMode }),
    ...(block.references === undefined ? {} : { references: { version: 1, entries: block.references.entries.map(entry => ({ slot: entry.slot, blockId: entry.blockId })) } }),
    inputs: inputs.map(input => ({ ...input })), result: evidenceNumber(block.result), resultText: block.resultText, status: 'success',
  };
}
function validBlocks(value: unknown): value is EvidenceBlock[] {
  if (!Array.isArray(value) || !value.length) return false;
  const ids = new Set<string>(); const positions = new Set<number>();
  for (const block of value) {
    if (!object(block) || !text(block.blockId) || !block.blockId.trim() || ids.has(block.blockId)
      || !Number.isInteger(block.position) || (block.position as number) < 1 || positions.has(block.position as number)
      || !text(block.expression) || block.expression.length > 2000 || ![undefined, 'note-variables', REFERENCE_MODE].includes(block.evaluationMode as string | undefined)
      || !finiteEncoding(block.result) || !text(block.resultText) || block.status !== 'success' || !Array.isArray(block.inputs) || block.inputs.length > 512) return false;
    const names = new Set<string>();
    for (const input of block.inputs) {
      if (!object(input) || !['variable', 'id'].includes(input.kind as string) || !text(input.name) || !input.name || names.has(input.name)
        || !text(input.sourceBlockId) || !ids.has(input.sourceBlockId) || !finiteEncoding(input.value)) return false;
      names.add(input.name);
    }
    if (block.references !== undefined) {
      if (!object(block.references) || block.references.version !== 1 || !Array.isArray(block.references.entries) || block.references.entries.length > 128) return false;
      const slots = new Set<number>();
      for (const entry of block.references.entries) {
        if (!object(entry) || !Number.isInteger(entry.slot) || (entry.slot as number) < 1 || (entry.slot as number) > 128 || slots.has(entry.slot as number) || !text(entry.blockId) || !entry.blockId.trim()) return false;
        slots.add(entry.slot as number);
      }
    }
    if (block.evaluationMode === REFERENCE_MODE && block.references === undefined) return false;
    ids.add(block.blockId); positions.add(block.position as number);
  }
  return true;
}
export function validCalculationEvidence(value: unknown): value is EvidenceHistory {
  if (!object(value) || value.version !== 1 || !Array.isArray(value.records) || value.records.length > EVIDENCE_LIMITS.records) return false;
  try { if (bytes(value) > EVIDENCE_LIMITS.bytes) return false; } catch { return false; }
  const ids = new Set<string>();
  for (const record of value.records) {
    if (!object(record) || !text(record.id) || !record.id.trim() || ids.has(record.id) || record.evaluator !== 'calculator-memo-v1' || record.status !== 'confirmed'
      || !timestamp(record.calculatedAt) || !timestamp(record.persistedAt) || !validBlocks(record.blocks)) return false;
    ids.add(record.id);
  }
  try { return bytes(value) <= EVIDENCE_LIMITS.bytes; } catch { return false; }
}
export function makeEvidenceCandidate(blocks: MemoBlock[], evidence: EvidenceBlock[], calculatedAt = new Date().toISOString()): EvidenceCandidate {
  if (!timestamp(calculatedAt) || !validBlocks(evidence) || evidence.length !== blocks.filter(block => block.type === 'calculation').length
    || evidence.some(entry => { const block = blocks[entry.position - 1]; return block?.type !== 'calculation' || block.id !== entry.blockId || block.expression !== entry.expression || block.evaluationMode !== entry.evaluationMode || JSON.stringify(block.references === undefined ? undefined : { version: block.references.version, entries: block.references.entries.map(({ slot, blockId }) => ({ slot, blockId })) }) !== JSON.stringify(entry.references) || block.resultText !== entry.resultText || block.error !== null || block.result === null || evidenceNumber(block.result) !== entry.result; })) {
    throw new Error('計算時の根拠を確認できません。再計算してください。');
  }
  return { calculatedAt, blocks: structuredClone(evidence) };
}
export function appendCalculationEvidence(history: EvidenceHistory | undefined, candidates: EvidenceCandidate[], persistedAt = new Date().toISOString()): EvidenceHistory {
  if (history !== undefined && !validCalculationEvidence(history)) throw new Error('未対応または不正な根拠記録です。元データを保護してください。');
  if (!timestamp(persistedAt)) throw new Error('保存日時を確認できません。');
  const existing = history?.records ?? [];
  if (existing.length + candidates.length > EVIDENCE_LIMITS.records) throw new Error('根拠履歴の上限100件です。履歴を削除せず保存を停止しました。原本JSONを退避し、別メモで計算してください。');
  const records = candidates.map(candidate => {
    if (!timestamp(candidate.calculatedAt) || !validBlocks(candidate.blocks)) throw new Error('計算時の根拠を確認できません。');
    return { ...structuredClone(candidate), id: crypto.randomUUID(), persistedAt, evaluator: 'calculator-memo-v1' as const, status: 'confirmed' as const };
  });
  const result: EvidenceHistory = { ...(history ?? {}), version: 1, records: [...existing, ...records] };
  if (bytes(result) > EVIDENCE_LIMITS.bytes) throw new Error('根拠履歴の容量上限500,000バイトです。履歴を削除せず保存を停止しました。原本JSONを退避してください。');
  return result;
}

/** Explicit, read-only reproducibility check. Not called by loading or report generation.
 * A matching record is not an authenticity guarantee: editable JSON is not signed. */
export function verifyCalculationEvidence(record: EvidenceRecord): { success: boolean; message: string } {
  if (!validCalculationEvidence({ version: 1, records: [record] })) return { success: false, message: '未対応または不正な根拠記録です。' };
  try {
    // Only calculations affect legacy scope/order. Omitted text/formula blocks
    // are not evaluated; their original positions remain part of the record.
    const ordered = [...record.blocks].sort((a, b) => a.position - b.position);
    const blocks: CalculationMemoBlock[] = ordered.map(block => ({
      id: block.blockId, type: 'calculation', expression: block.expression,
      displayExpression: block.expression, result: null, resultText: '', error: null,
      ...(block.evaluationMode === undefined ? {} : { evaluationMode: block.evaluationMode }),
      ...(block.references === undefined ? {} : { references: structuredClone(block.references) }),
    }));
    const replay = blocks.some(block => block.evaluationMode === REFERENCE_MODE) ? evaluateReferenceMemo(blocks) : evaluateLegacyMemoWithEvidence(blocks);
    if (replay.evidence?.length !== record.blocks.length) throw new Error('現在の評価器では記録を再現できません。');
    for (let index = 0; index < record.blocks.length; index++) {
      const actual = replay.evidence[index]; const expected = record.blocks[index];
      if (actual.blockId !== expected.blockId || actual.result !== expected.result || actual.resultText !== expected.resultText
        || JSON.stringify(actual.inputs) !== JSON.stringify(expected.inputs)) throw new Error('記録された実使用元・使用値・評価順序・結果を再現できません。');
    }
    return { success: true, message: '保存された入力・参照元・評価順序・結果の一致を確認しました。真正性や数学的証明の保証ではありません。' };
  } catch (error) { return { success: false, message: error instanceof Error ? error.message : '現在の評価器では記録を再現できません。' }; }
}

/** Legacy auto-save pass: same evaluation order, scope, partial-result behavior as
 * recalculateMemoBlocks. Only a wholly successful pass can supply evidence. */
export function evaluateLegacyMemoWithEvidence(blocks: MemoBlock[]): { blocks: MemoBlock[]; evidence?: EvidenceBlock[] } {
  if (isManualMemo(blocks)) return { blocks: blocks.map(block => ({ ...block })) };
  const scope = new EvidenceScope('variable'); const evidence: EvidenceBlock[] = [];
  let success = true;
  const next = blocks.map((block, index) => {
    if (block.type !== 'calculation') return { ...block };
    scope.reads.length = 0;
    const result = { ...block, ...calculateMemoBlock(block.id, block.expression, block.evaluationMode, scope) };
    if (result.error !== null || result.result === null) success = false;
    else {
      evidence.push(evidenceBlock(result, index + 1, scope.reads));
      const variableName = block.evaluationMode === 'note-variables' ? describeCalculationBlock(block.expression).variableName : undefined;
      if (variableName) scope.origins.set(variableName, block.id);
    }
    return result;
  });
  return { blocks: next, ...(success && evidence.length ? { evidence } : {}) };
}
