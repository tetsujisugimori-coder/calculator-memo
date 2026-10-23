import { inspectFormulaDefinition } from './calculator';
import { validCalculationEvidence, type EvidenceRecord } from './calculation-evidence';
import type { FormulaReport, FormulaReportEvidence, FormulaReportEvidenceLink, Memo, RegisteredFormula } from './types';

export const REPORT_EVIDENCE_LIMITS = { links: 20, confirmations: 20, remarks: 500 } as const;
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const id = (v: unknown): v is string => typeof v === 'string' && !!v.trim() && v.length <= 120;
const extra = (v: object, keys: string[]) => Object.keys(v).some(key => !keys.includes(key));
export const reportEvidenceLinkKey = (link: FormulaReportEvidenceLink): string => JSON.stringify([link.memoId, link.recordId]);
export function readReportEvidenceLinks(value: unknown): FormulaReportEvidenceLink[] {
  if (!Array.isArray(value) || value.length > REPORT_EVIDENCE_LIMITS.links) throw new Error('根拠参照は20件以内です。参照を削除せず保存を停止しました。');
  const seen = new Set<string>();
  for (const link of value) {
    if (!object(link) || !id(link.memoId) || !id(link.recordId)) throw new Error('根拠参照のIDが不正です。');
    if (extra(link, ['memoId', 'recordId'])) throw new Error('未対応の根拠参照情報です。元データを保護するため保存を停止しました。');
    const key = reportEvidenceLinkKey(link as FormulaReportEvidenceLink);
    if (seen.has(key)) throw new Error('根拠参照のIDが重複しています。');
    seen.add(key);
  }
  return structuredClone(value);
}
export function validateConfirmationRemarks(value: unknown): asserts value is string {
  if (typeof value !== 'string' || value.length > REPORT_EVIDENCE_LIMITS.remarks) throw new Error('確認時の備考は500 UTF-16コード単位以内の文字列です。切り捨てず保存を停止しました。');
}
export function readReportEvidence(value: unknown, formulaId: string): FormulaReportEvidence {
  if (!object(value) || value.version !== 1 || !Array.isArray(value.confirmations) || value.confirmations.length > REPORT_EVIDENCE_LIMITS.confirmations) throw new Error('未対応または不正なレポート根拠情報です。確認履歴は20件以内です。');
  if (extra(value, ['version', 'links', 'confirmations'])) throw new Error('未対応のレポート根拠情報です。元データを保護するため保存を停止しました。');
  readReportEvidenceLinks(value.links);
  const ids = new Set<string>();
  for (const item of value.confirmations) {
    if (!object(item) || !id(item.id) || ids.has(item.id) || item.formulaId !== formulaId || typeof item.confirmedAt !== 'string' || !Number.isFinite(Date.parse(item.confirmedAt))
      || typeof item.evidenceSignature !== 'string' || item.evidenceSignature.length > 1_000_000
      || typeof item.title !== 'string' || !item.title.trim() || item.title.length > 120 || typeof item.body !== 'string' || item.body.length > 100_000
      || !object(item.definition) || item.definition.version !== 1 || typeof item.definition.expression !== 'string' || !item.definition.expression.trim() || item.definition.expression.length > 2000
      || !Array.isArray(item.definition.variables) || item.definition.variables.length > 2000 || !item.definition.variables.every(name => typeof name === 'string' && /^[A-Za-z][A-Za-z0-9_]*$/.test(name))
      || new Set(item.definition.variables).size !== item.definition.variables.length) throw new Error('確認履歴の構造が不正です。');
    if (extra(item, ['id', 'formulaId', 'confirmedAt', 'evidenceSignature', 'definition', 'title', 'body', 'links', 'remarks']) || extra(item.definition, ['version', 'expression', 'variables'])) throw new Error('未対応の確認履歴情報です。元データを保護するため保存を停止しました。');
    if (Object.hasOwn(item, 'remarks')) validateConfirmationRemarks(item.remarks);
    inspectFormulaDefinition(item.definition.expression);
    readReportEvidenceLinks(item.links); ids.add(item.id);
  }
  return structuredClone(value) as FormulaReportEvidence;
}
/** Definition inspection only: never evaluates numerical expressions or execution drafts. */
export function formulaDefinitionSnapshot(formula: { expression: string }) {
  return { version: 1 as const, expression: formula.expression, variables: inspectFormulaDefinition(formula.expression) };
}
/** Names/timestamps are not mathematical definitions. Unknown fields are retained in conflict checks. */
export function formulaDefinitionSignature(formula: RegisteredFormula | undefined): string | null {
  if (!formula) return null;
  return JSON.stringify(Object.fromEntries(Object.entries(formula).filter(([key]) => !['title', 'createdAt', 'updatedAt'].includes(key))));
}
export function hasUnknownFormulaDefinition(formula: object): boolean {
  return extra(formula, ['id', 'title', 'expression', 'createdAt', 'updatedAt']);
}
export type ResolvedReportEvidence = { link: FormulaReportEvidenceLink; status: 'available' | 'missing' | 'invalid'; reason: string; record?: EvidenceRecord; memoTitle?: string };
/** Caller supplies only an explicitly loaded saved snapshot, never live editor state. */
export function resolveReportEvidence(notes: Memo[], links: FormulaReportEvidenceLink[]): ResolvedReportEvidence[] {
  return links.map(link => {
    const found = notes.filter(note => note.id === link.memoId);
    if (extra(link, ['memoId', 'recordId'])) return { link, status: 'invalid', reason: '未対応の参照情報です。' };
    if (found.length !== 1 || found[0].type !== 'plain-calculation') return { link, status: found.length > 1 ? 'invalid' : 'missing', reason: '保存済み計算メモが見つからないか、IDが一意でありません。' };
    const memo = found[0];
    if (memo.calculationEvidence === undefined) return { link, status: 'missing', reason: '保存済み計算記録がありません。', memoTitle: memo.title };
    if (!validCalculationEvidence(memo.calculationEvidence)) return { link, status: 'invalid', reason: '未対応または不正な計算記録です。現在の値で補いません。', memoTitle: memo.title };
    const record = memo.calculationEvidence.records.find(record => record.id === link.recordId);
    if (!record) return { link, status: 'missing', reason: '参照した保存記録が見つかりません。', memoTitle: memo.title };
    if (extra(record, ['id', 'evaluator', 'status', 'calculatedAt', 'persistedAt', 'blocks']) || record.blocks.some(block => extra(block, ['blockId', 'position', 'expression', 'evaluationMode', 'references', 'inputs', 'result', 'resultText', 'status']) || block.inputs.some(input => extra(input, ['kind', 'name', 'sourceBlockId', 'value'])) || (block.references && (extra(block.references, ['version', 'entries']) || block.references.entries.some(entry => extra(entry, ['slot', 'blockId'])))))) return { link, status: 'invalid', reason: '未対応の記録情報を含むため根拠として判定できません。', memoTitle: memo.title };
    return { link: structuredClone(link), status: 'available', reason: '保存済み原本の取得時点の記録です。', memoTitle: memo.title, record: structuredClone(record) };
  });
}
/** Contains the full selected records, so same-ID replacement cannot silently confirm stale values. */
export function reportEvidenceSignature(notes: Memo[], links: FormulaReportEvidenceLink[]): string {
  return JSON.stringify(resolveReportEvidence(notes, links).map(({ link, status, record }) => ({ link, status, ...(record ? { record } : {}) })));
}
export type FormulaReportAssessment = { status: 'confirmed' | 'changed' | 'unconfirmed' | 'unknown' | 'orphan'; reason: string };
export function formulaReportAssessment(report: FormulaReport, formula: RegisteredFormula | undefined, notes?: Memo[]): FormulaReportAssessment {
  if (!formula) return { status: 'orphan', reason: '登録式が見つからないため比較できません。' };
  const evidence = report.evidence;
  if (!evidence) return report.confirmedExpression === null
    ? { status: 'unconfirmed', reason: '明示的な確認履歴がありません。' }
    : { status: 'unknown', reason: '旧形式の確認式は保全していますが、確認日時・変数定義が未記録のため新基準で比較できません。' };
  try { readReportEvidence(evidence, report.formulaId); } catch { return { status: 'unknown', reason: '根拠情報の構造を確認できません。' }; }
  const last = evidence.confirmations.at(-1);
  if (!last) return report.confirmedExpression === null
    ? { status: 'unconfirmed', reason: '明示的な確認履歴がありません。' }
    : { status: 'unknown', reason: '旧形式の確認式は保全していますが、確認日時・変数定義が未記録のため新基準で比較できません。' };
  if (last.title !== report.title || last.body !== report.body || JSON.stringify(last.links) !== JSON.stringify(evidence.links)) return { status: 'unconfirmed', reason: '確認後にレポートまたは根拠参照を編集しています。過去の確認履歴は保全されています。' };
  if (hasUnknownFormulaDefinition(formula) || extra(evidence, ['version', 'links', 'confirmations']) || extra(last, ['id', 'formulaId', 'confirmedAt', 'evidenceSignature', 'definition', 'title', 'body', 'links', 'remarks']) || extra(last.definition, ['version', 'expression', 'variables'])) return { status: 'unknown', reason: '未対応の定義・確認情報があり、意味を推測して一致扱いにしません。' };
  if (evidence.links.length && !notes) return { status: 'unknown', reason: '根拠未照合：保存済み原本をまだ取得していません。根拠不一致とは断定できません。' };
  if (evidence.links.length && notes && resolveReportEvidence(notes, evidence.links).some(item => item.status !== 'available')) return { status: 'unknown', reason: '根拠不足：参照記録を取得できないか、欠落・破損しています。' };
  if (notes && last.evidenceSignature !== reportEvidenceSignature(notes, evidence.links)) return { status: 'unknown', reason: '確認時と根拠記録の内容が一致しません。同じIDでも差し替えられた可能性があり、当時の値とみなしません。' };
  try {
    return JSON.stringify(last.definition) === JSON.stringify(formulaDefinitionSnapshot(formula)) && last.formulaId === formula.id
      ? { status: 'confirmed', reason: '確認時の式と変数定義に一致します。数学的な正しさを保証しません。' }
      : { status: 'changed', reason: '確認後に式または変数定義が変更されています。内容を要確認です。' };
  } catch { return { status: 'unknown', reason: '現在の式定義を安全に比較できません。' }; }
}
