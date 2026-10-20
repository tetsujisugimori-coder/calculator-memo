import { analyzeDependencyImpact, analyzeMemoDependencies, type DependencyDiagnostic, type DependencyGraph, type DependencyImpact } from './dependency-analysis';
import { isManualMemo, staleBlockIds } from './block-references';
import { toMermaid, type MermaidNodeState } from './dependency-mermaid';
import type { CalculationMemoBlock, MemoBlock } from './types';

export type CalculationAttempt = { blocks: readonly MemoBlock[]; diagnostics: DependencyDiagnostic[]; evaluated: string[]; success: boolean };
export type DiagnosticDetail = {
  category: string; title: string; message: string; phase: 'before' | 'attempt' | 'saved';
  sourceIds: string[]; affectedIds: string[]; remedy: string; expression: string;
};
export type CalculationBlockStatus = {
  kind: 'normal' | 'changed' | 'affected' | 'unknown' | 'error' | 'blocked';
  label: string; change: 'none' | 'changed' | 'affected' | 'unknown';
  oldResult: boolean; details: DiagnosticDetail[]; uncertain: boolean;
};
export type CalculationStatusReport = {
  graph: DependencyGraph; states: Map<string, CalculationBlockStatus>; impact?: DependencyImpact;
  coverage: string; globalMessages: string[]; mermaid: string; hasPending: boolean;
};
const compare = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const downstreamCode = (code: string) => code === 'blocked-reference' || code === 'cycle-dependent';
const calcs = (blocks: readonly MemoBlock[]) => blocks.filter((b): b is CalculationMemoBlock => b.type === 'calculation');
function reachable(graph: DependencyGraph, roots: string[], definiteOnly = true): string[] {
  const seen = new Set(roots), queue = [...roots];
  for (let i = 0; i < queue.length; i++) for (const e of graph.edges) {
    if (e.source === queue[i] && (!definiteOnly || e.certainty === 'definite') && !seen.has(e.target)) { seen.add(e.target); queue.push(e.target); }
  }
  return [...seen].filter(id => !roots.includes(id)).sort(compare);
}
function classification(d: DependencyDiagnostic, phase: DiagnosticDetail['phase'], structural: DependencyDiagnostic[]): [string, string, string] {
  if (d.code === 'saved-error') return ['saved', '保存された結果のエラー', '現在の式を確認し、メモ全体を再計算してください。'];
  if (downstreamCode(d.code)) return ['downstream', '参照先の問題', '原因ブロックを先に修正してから、メモ全体を再計算してください。'];
  if (d.code === 'self-reference') return ['self-reference', '自分自身を参照', '参照先を自分以外に変更してください。'];
  if (d.code === 'cycle') return ['cycle', '参照が循環', '互いに参照し合うつながりのいずれかを解除してください。'];
  if (d.code === 'missing-reference') return ['missing-reference', '参照先がない', '削除されたブロックや参照番号を確認し、参照先を選び直してください。'];
  if (d.code === 'invalid-reference') return ['invalid-reference', '参照形式の問題', '参照先を選び直してください。不正な保存データは元データを保護して確認してください。'];
  if (d.code === 'undefined-variable' || (['legacy-evaluation', 'invalid-expression'].includes(d.code) && /未定義|定義されてい|変数.*ありません|使用できない変数名/.test(d.message))) return ['legacy-scope', '旧変数の定義・スコープ', '前にある変数定義、名前、再代入の成功を確認してください。失敗した再代入は以前の値を残します。'];
  if (d.code === 'invalid-expression' || (d.code === 'legacy-evaluation' && structural.some(s => s.blockId === d.blockId && s.code === 'invalid-expression'))) return ['parse', '数式の解析失敗', '括弧・演算子・許可された関数・式の長さを確認してください。'];
  if (phase === 'attempt' && (d.code === 'reference-evaluation' || d.code === 'legacy-evaluation')) return ['numeric', d.code === 'legacy-evaluation' ? '旧変数の計算エラー' : '数値計算エラー', 'ゼロ除算、平方根の範囲、数値の大きさなど、表示された原因を確認して修正してください。'];
  return ['other', '解析・安全制限の確認', '表示された内容と入力条件を確認してください。解析できない部分は正常と判断していません。'];
}
/** Pure presentation model. Never evaluates expressions, changes scope, or writes data.
 * baseline is the editor's opening/last-success snapshot, NOT reconstructed from
 * saved signatures. baselineKnown=false explicitly limits claims after stale reload.
 */
export function buildCalculationStatus(blocks: readonly MemoBlock[], options: {
  baseline?: readonly MemoBlock[]; baselineKnown?: boolean; attempt?: CalculationAttempt;
} = {}): CalculationStatusReport {
  const graph = analyzeMemoDependencies(blocks);
  const manual = isManualMemo([...blocks]);
  const stale = staleBlockIds([...blocks]);
  const known = options.baselineKnown ?? (stale.size === 0);
  const impact = options.baseline ? analyzeDependencyImpact(options.baseline, blocks) : undefined;
  const attempt = options.attempt && JSON.stringify(options.attempt.blocks) === JSON.stringify(blocks) ? options.attempt : undefined;
  const currentDiagnostics = graph.diagnostics.filter(d => d.code !== 'saved-error' && d.code !== 'cycle-dependent' && d.severity === 'error');
  // Static invalid sources also prevent their definite ID consumers from being
  // calculated. This is a structural dependency finding, never a numeric attempt.
  const structuralRoots = currentDiagnostics.filter(d => d.blockId && !downstreamCode(d.code));
  for (const block of calcs(blocks)) {
    const sources = structuralRoots.filter(d => reachable(graph, [d.blockId!]).includes(block.id)).map(d => d.blockId!);
    if (sources.length) currentDiagnostics.push({ blockId: block.id, code: 'blocked-reference', severity: 'error', message: '参照先の式・参照に問題があります（数値計算は未実行）', relatedIds: [...new Set(sources)].sort(compare) });
  }
  const details = new Map<string, DiagnosticDetail[]>();
  const add = (d: DependencyDiagnostic, phase: DiagnosticDetail['phase']) => {
    if (!d.blockId) return;
    const [category, title, remedy] = classification(d, phase, currentDiagnostics);
    let roots = d.relatedIds ?? [];
    if (d.code === 'cycle-dependent') roots = currentDiagnostics.filter(s => s.blockId && ['cycle', 'self-reference'].includes(s.code) && reachable(graph, [s.blockId]).includes(d.blockId!)).map(s => s.blockId!);
    // Resolve all known roots through definite edges, not only the first failed
    // immediate parent from an evaluator's short-circuit traversal.
    if (d.code === 'blocked-reference' && attempt && phase === 'attempt') roots = attempt.diagnostics.filter(s => s.blockId && !downstreamCode(s.code) && reachable(graph, [s.blockId]).includes(d.blockId!)).map(s => s.blockId!);
    const sourceIds = [...new Set(downstreamCode(d.code) ? roots : [d.blockId, ...roots])].sort(compare);
    const detail: DiagnosticDetail = { category, title, message: d.message + (phase === 'saved' ? '。失敗時の式・影響範囲はこの記録だけでは確定できません。' : ''), phase, sourceIds,
      affectedIds: phase === 'saved' ? [] : reachable(graph, [d.blockId]), remedy,
      expression: phase === 'saved' ? '' : calcs(blocks).find(b => b.id === d.blockId)?.expression ?? '' };
    const list = details.get(d.blockId) ?? [];
    if (!list.some(x => x.phase === phase && x.message === detail.message && x.category === category)) list.push(detail);
    details.set(d.blockId, list);
  };
  // A fresh attempt establishes only what it actually inspected. Structural
  // findings remain clearly labelled as pre-execution checks, not numeric runs.
  currentDiagnostics.forEach(d => add(d, 'before'));
  attempt?.diagnostics.filter(d => d.code !== 'cycle-dependent' && !(d.code === 'blocked-reference' && attempt.evaluated.length === 0)).forEach(d => add(d, (['legacy-evaluation', 'reference-evaluation'].includes(d.code) || (d.code === 'blocked-reference' && attempt.evaluated.length > 0)) ? 'attempt' : 'before'));
  graph.diagnostics.filter(d => d.code === 'saved-error').forEach(d => add(d, 'saved'));
  const states = new Map<string, CalculationBlockStatus>();
  for (const block of calcs(blocks)) {
    const direct = impact?.changedIds.includes(block.id) ?? false;
    const affected = impact?.affectedIds.includes(block.id) ?? false;
    const change = direct ? 'changed' : affected ? 'affected' : !known && stale.has(block.id) ? 'unknown' : 'none';
    const list = details.get(block.id) ?? [];
    const active = list.filter(d => d.phase !== 'saved');
    const root = active.some(d => d.category !== 'downstream');
    const blocked = active.some(d => d.category === 'downstream');
    const savedErrorCurrent = block.error && !stale.has(block.id) && change === 'none';
    const kind: CalculationBlockStatus['kind'] = root || savedErrorCurrent ? 'error' : blocked ? 'blocked' : change === 'none' ? 'normal' : change;
    const attemptedError = active.some(d => d.phase === 'attempt' && d.category !== 'downstream');
    const label = savedErrorCurrent ? '保存済みエラー' : root ? (attemptedError ? '計算エラー・未確定' : '式・参照の問題（未実行）') : blocked ? '参照先エラー' : change === 'changed' ? '変更あり・未再計算' : change === 'affected' ? '変更の影響あり・未再計算' : change === 'unknown' ? '再計算状態不明' : '通常';
    states.set(block.id, { kind, label, change, oldResult: manual && stale.has(block.id), details: list, uncertain: impact?.uncertainIds.includes(block.id) ?? false });
  }
  const globalMessages = graph.diagnostics.filter(d => !d.blockId).map(d => d.message);
  const attemptError = calcs(blocks).find(b => b.evaluationState?.attemptError)?.evaluationState?.attemptError;
  if (attemptError) globalMessages.push(`一括確定を停止: ${attemptError}`);
  if (!known && stale.size) globalMessages.push('保存時の変更前データがないため、以前の変更元・影響範囲は復元できません。この編集画面で確認できた変更だけを区別しています。');
  const coverage = attempt ? attempt.success ? '今回の再計算は全件成功し、一括確定しました。' : `今回試行した計算は${attempt.evaluated.length}件です。構造検査・旧変数フェーズ・最初のID計算失敗で停止するため、未試行の数値エラーは未確認です。` : !manual ? 'この診断表示では再計算しません。保存・保持している結果と構造確認を分けて表示しています。' : '数式・参照の構造だけを確認しています。再計算前の数値エラーは未確認です。';
  const nodeStates = new Map<string, MermaidNodeState>();
  for (const [id, state] of states) {
    const labels = [state.label];
    if (state.change === 'changed' && state.kind !== 'changed') labels.push('変更あり・未再計算');
    if (state.change === 'affected' && state.kind !== 'affected') labels.push('変更の影響あり・未再計算');
    if (state.uncertain) labels.push('影響は候補');
    nodeStates.set(id, { labels, classes: [state.kind] });
  }
  return { graph, states, impact, coverage, globalMessages, mermaid: toMermaid(graph, { nodeStates }), hasPending: stale.size > 0 };
}
