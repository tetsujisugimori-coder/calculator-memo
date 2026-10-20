import { evaluateReferenceMemo } from './block-references';
import { buildCalculationStatus, type CalculationStatusReport } from './calculation-status';
import type { MemoBlock } from './types';

/** Exact in-memory evidence. Tagged values distinguish undefined/null/-0 and
 * unknown fields; this is not a hash, persistence format, or calculation cache. */
export function trialSnapshot(blocks: readonly MemoBlock[]): string {
  const visit = (value: unknown): unknown => {
    if (value === undefined) return ['undefined'];
    if (value === null) return ['null'];
    if (typeof value === 'number') return ['number', Object.is(value, -0) ? '-0' : String(value)];
    if (typeof value === 'string' || typeof value === 'boolean') return [typeof value, value];
    if (Array.isArray(value)) return ['array', value.map(visit)];
    if (typeof value === 'object') return ['object', Object.entries(value).map(([key, item]) => [key, visit(item)])];
    throw new Error('試算対象のデータを確認できません。');
  };
  return JSON.stringify(visit(blocks));
}
export type TrialContext = { memoKey: string; revision: number; snapshot: string };
export type CalculationTrial = {
  context: TrialContext;
  evaluation: ReturnType<typeof evaluateReferenceMemo>;
  report: CalculationStatusReport;
  rows: Array<{
    blockId: string; number: number; expression: string; previous: number | null; previousText: string;
    previousEvidence: 'saved-error' | 'old' | 'current' | 'missing';
    state: 'success' | 'failed' | 'unattempted'; result: number | null; resultText: string;
    difference: number | null; differenceState: 'same' | 'changed' | 'unavailable'; error: string | null;
  }>;
};
/** The same evaluator as normal recalculation, with no draft/storage callbacks. */
export function createCalculationTrial(blocks: MemoBlock[], context: TrialContext, options: { baseline?: MemoBlock[]; baselineKnown?: boolean } = {}): CalculationTrial {
  if (context.snapshot !== trialSnapshot(blocks)) throw new Error('入力が変わりました。再試算してください。');
  const evaluation = evaluateReferenceMemo(blocks);
  const report = buildCalculationStatus(blocks, { ...options, attempt: { ...evaluation, blocks } });
  report.coverage = `試算は未反映です。数値評価を試行した計算は${evaluation.evaluated.length}件です。${evaluation.success ? '全件成功しましたが、まだ結果は確定していません。' : '全件一括確定はできません。未試行の数値エラーは未確認です。'}`;
  const rows = blocks.flatMap((block, index) => {
    if (block.type !== 'calculation') return [];
    const observed = evaluation.observations.find(value => value.blockId === block.id);
    const previous = !block.error && block.result !== null && Number.isFinite(block.result) ? block.result : null;
    const result = observed && !observed.error ? observed.result : null;
    const difference = previous !== null && result !== null ? result - previous : null;
    return [{ blockId: block.id, number: index + 1, expression: block.expression, previous, previousText: block.resultText,
      previousEvidence: block.error ? 'saved-error' as const : previous === null ? 'missing' as const : report.states.get(block.id)?.oldResult ? 'old' as const : 'current' as const,
      state: !observed ? 'unattempted' as const : observed.error ? 'failed' as const : 'success' as const,
      result, resultText: observed?.resultText ?? '', error: observed?.error ?? null,
      difference: difference !== null && Number.isFinite(difference) ? difference : null,
      differenceState: difference === null || !Number.isFinite(difference) ? 'unavailable' as const : previous === result ? 'same' as const : 'changed' as const }];
  });
  return { context: { ...context }, evaluation, report, rows };
}
export function trialMatches(trial: CalculationTrial, blocks: MemoBlock[], memoKey: string, revision: number): boolean {
  return trial.context.memoKey === memoKey && trial.context.revision === revision && trial.context.snapshot === trialSnapshot(blocks);
}
/** Revalidate and reevaluate the current data; never trust/copy preview payloads.
 * Current unknown metadata flows through the existing engine's atomic merge. */
export function applyCalculationTrial(trial: CalculationTrial, blocks: MemoBlock[], memoKey: string, revision: number) {
  if (!trialMatches(trial, blocks, memoKey, revision)) return { success: false as const, message: '入力または対象メモが変わりました。再試算してください。' };
  if (!trial.evaluation.success) return { success: false as const, message: '試算に失敗または未試行の計算があるため反映できません。' };
  const current = evaluateReferenceMemo(blocks);
  if (!current.success || trialSnapshot(current.blocks) !== trialSnapshot(trial.evaluation.blocks)) return { success: false as const, message: '試算と再確認の結果が一致しません。再試算してください。' };
  return { success: true as const, evaluation: current };
}
