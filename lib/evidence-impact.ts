import type { EvidenceRecord } from './calculation-evidence';
import { compareEvidenceRecords, EVIDENCE_CHANGE_LABELS, type EvidenceComparison } from './evidence-comparison';
import type { DependencyEdge, DependencyGraph } from './dependency-structure';
import { dependencyEdgeKey } from './dependency-mermaid';
import { REFERENCE_MODE } from './reference-syntax';

export const IMPACT_LIMITS = { traversalSteps: 100_000, pathNodes: 10_000 } as const;
export type ImpactPath = { rootId: string; blockIds: string[] };
export type ImpactEdge = DependencyEdge & { inputName: string; value: string; valid: boolean; reasons: string[] };
export type EvidenceImpactSide = { graph: DependencyGraph; edges: ImpactEdge[]; unknown: Record<string, string[]>; complete: boolean };
export type EvidenceImpactRow = {
  blockId: string; directChanges: string[]; resultChanges: string[]; orderChanges: string[]; unknown: string[];
  beforePaths: ImpactPath[]; afterPaths: ImpactPath[]; propagationCandidate: boolean; unchanged: boolean;
};
export type EvidenceImpact = {
  rows: EvidenceImpactRow[]; before: EvidenceImpactSide; after: EvidenceImpactSide;
  edgeChanges: { added: ImpactEdge[]; removed: ImpactEdge[]; unchanged: ImpactEdge[]; changed: { before: ImpactEdge; after: ImpactEdge }[] };
  counts: { direct: number; propagation: number; result: number; order: number; unknown: number; unchanged: number };
  warnings: string[]; complete: boolean;
};
const add = (map: Record<string, string[]>, id: string, reason: string) => {
  const reasons = map[id] ?? (map[id] = []);
  if (!reasons.includes(reason)) reasons.push(reason);
};
/** Builds historical edges only from captured reads, not present-day syntax/candidates. */
function savedGraph(record: EvidenceRecord): EvidenceImpactSide {
  const byId = new Map(record.blocks.map(block => [block.blockId, block]));
  const unknown: Record<string, string[]> = Object.create(null);
  const edges: ImpactEdge[] = [];
  for (const block of record.blocks) {
    for (const input of block.inputs) {
      const reasons: string[] = [];
      if (input.value !== byId.get(input.sourceBlockId)?.result) reasons.push('実使用内部値と同じ記録の参照元内部結果が一致しません（-0を区別）。');
      if ((input.kind === 'id' && block.evaluationMode !== REFERENCE_MODE) || (input.kind === 'variable' && block.evaluationMode !== 'note-variables')) reasons.push('計算モードと記録された入力種類が一致しません。');
      if (input.kind === 'variable' && byId.get(input.sourceBlockId)?.evaluationMode !== 'note-variables') reasons.push('旧変数の実使用元が変数を定義できる計算モードではありません。');
      if (input.kind === 'id') {
        const entry = block.references?.entries.find(ref => input.name === `ReferenceValue${ref.slot}`);
        if (!entry || entry.blockId !== input.sourceBlockId) reasons.push('実使用ID参照名・参照枠・参照元IDの対応を確認できません。');
      }
      reasons.forEach(reason => add(unknown, block.blockId, reason));
      edges.push({ source: input.sourceBlockId, target: block.blockId, kind: input.kind === 'id' ? 'reference' : 'variable',
        variable: input.name, certainty: reasons.length ? 'uncertain' : 'definite', inputName: input.name, value: input.value, valid: !reasons.length, reasons });
    }
  }
  // A downstream result cannot restore evidence missing on its upstream route.
  const outgoing = new Map<string, string[]>();
  for (const edge of edges) { const targets = outgoing.get(edge.source) ?? []; targets.push(edge.target); outgoing.set(edge.source, targets); }
  const queue = Object.keys(unknown), seen = new Set(queue);
  for (let index = 0; index < queue.length; index++) for (const target of outgoing.get(queue[index]) ?? []) {
    add(unknown, target, '上流の実使用記録に不整合があり、その経路による影響は判定不能です。');
    if (!seen.has(target)) { seen.add(target); queue.push(target); }
  }
  const graph: DependencyGraph = {
    nodes: record.blocks.map(block => ({ id: block.blockId, expression: block.expression, pending: false, bindings: [],
      diagnostics: (unknown[block.blockId] ?? []).map(message => ({ code: 'saved-evidence-inconsistent', severity: 'uncertain' as const, message, blockId: block.blockId })) })),
    edges: edges.map(({ source, target, kind, variable, certainty }) => ({ source, target, kind, variable, certainty })),
    diagnostics: [], complete: !Object.keys(unknown).length, unresolvedIds: Object.keys(unknown),
  };
  graph.diagnostics = graph.nodes.flatMap(node => node.diagnostics);
  return { graph, edges, unknown, complete: graph.complete };
}

function trace(side: EvidenceImpactSide, roots: Set<string>): { paths: Map<string, ImpactPath[]>; limited: boolean } {
  const paths = new Map<string, ImpactPath[]>();
  const outgoing = new Map<string, string[]>();
  for (const edge of side.edges) {
    if (!edge.valid || side.unknown[edge.source] || side.unknown[edge.target]) continue;
    const targets = outgoing.get(edge.source) ?? [];
    if (!targets.includes(edge.target)) targets.push(edge.target);
    outgoing.set(edge.source, targets);
  }
  const ids = new Set(side.graph.nodes.map(node => node.id));
  let steps = 0, pathNodes = 0;
  for (const rootId of roots) {
    if (!ids.has(rootId) || side.unknown[rootId]) continue;
    const parent = new Map<string, string | null>([[rootId, null]]), queue = [rootId];
    for (let index = 0; index < queue.length; index++) {
      if (++steps > IMPACT_LIMITS.traversalSteps) return { paths, limited: true };
      for (const target of outgoing.get(queue[index]) ?? []) {
        if (++steps > IMPACT_LIMITS.traversalSteps) return { paths, limited: true };
        if (parent.has(target)) continue;
        parent.set(target, queue[index]); queue.push(target);
        const blockIds = [target]; let current = queue[index];
        while (true) {
          if (++pathNodes > IMPACT_LIMITS.pathNodes) return { paths, limited: true };
          blockIds.push(current); const previous = parent.get(current); if (previous === null || previous === undefined) break; current = previous;
        }
        if (++pathNodes > IMPACT_LIMITS.pathNodes) return { paths, limited: true };
        blockIds.reverse(); const rows = paths.get(target) ?? []; rows.push({ rootId, blockIds }); paths.set(target, rows);
      }
    }
  }
  return { paths, limited: false };
}
// Validity is a separate judgment, not a dependency being added or removed.
const relationKey = (edge: ImpactEdge) => dependencyEdgeKey({ ...edge, certainty: 'definite' });
const bindingKey = (edge: ImpactEdge) => JSON.stringify([edge.target, edge.kind, edge.inputName]);
const referencesKey = (entries: EvidenceRecord['blocks'][number]['references']) => JSON.stringify(entries?.entries.map(({ slot, blockId }) => [slot, blockId]).sort((a, b) => Number(a[0]) - Number(b[0])) ?? null);

/** Read-only observed differences and reachability. Does not evaluate or prove causation. */
export function analyzeEvidenceImpact(input: EvidenceComparison): EvidenceImpact {
  // Reuse authoritative validation/comparison, including when caller supplied a forged model.
  const comparison = compareEvidenceRecords(input.before, input.after);
  const before = savedGraph(comparison.before), after = savedGraph(comparison.after);
  const rows: EvidenceImpactRow[] = comparison.rows.map(row => {
    const directChanges = row.changes.filter(key => ['expression', 'mode', 'sources', 'values'].includes(key)).map(key => EVIDENCE_CHANGE_LABELS[key] as string);
    if (row.kind === 'added') directChanges.push('比較対象の記録間で追加');
    if (row.kind === 'removed') directChanges.push('比較対象の記録間で削除');
    if (row.before && row.after && referencesKey(row.before.block.references) !== referencesKey(row.after.block.references)) directChanges.push('保存された参照枠設定（未使用枠を含む）');
    const unknown = [...(before.unknown[row.blockId] ?? []).map(reason => `変更前: ${reason}`), ...(after.unknown[row.blockId] ?? []).map(reason => `変更後: ${reason}`)];
    return { blockId: row.blockId, directChanges,
      resultChanges: row.changes.filter(key => ['displayResult', 'internalResult'].includes(key)).map(key => EVIDENCE_CHANGE_LABELS[key]),
      orderChanges: row.changes.filter(key => ['bodyOrder', 'executionOrder'].includes(key)).map(key => EVIDENCE_CHANGE_LABELS[key]),
      unknown, beforePaths: [], afterPaths: [], propagationCandidate: false, unchanged: false };
  });
  const roots = new Set(rows.filter(row => row.directChanges.length).map(row => row.blockId));
  const oldTrace = trace(before, roots), newTrace = trace(after, roots);
  const warnings = [...comparison.warnings,
    '直接変更は保存項目の観測差です。実使用値の変化を含み、利用者が最初に編集した箇所や単独の原因を特定しません。',
    '波及変更候補は記録された実使用参照の到達関係です。結果差分とは独立で、実際の数値影響・因果関係・数学的証明・真正性を保証しません。',
    '各起点・対象・変更前後ごとに代表経路を1本表示します。全経路の列挙ではありません。未使用の参照枠は実使用経路に含めません。',
    'v1確定記録は成功状態だけを扱います。エラー・結果なし・循環・欠損参照・重複ID・未対応形式は既存の保護に従い比較不可です。構文や数値の再検証は実行していません。'];
  for (const [name, side, result] of [['変更前', before, oldTrace], ['変更後', after, newTrace]] as const) {
    if (!result.limited) continue;
    side.complete = false; side.graph.complete = false;
    const reason = `${name}: 経路分析の処理上限（探索${IMPACT_LIMITS.traversalSteps}ステップ・代表経路${IMPACT_LIMITS.pathNodes}ノード）に達しました。未表示の起点・経路の有無は判定不能です。`;
    warnings.push(reason);
    for (const node of side.graph.nodes) {
      add(side.unknown, node.id, reason);
      const diagnostic = { code: 'saved-impact-limit', severity: 'uncertain' as const, message: reason, blockId: node.id };
      node.diagnostics.push(diagnostic); side.graph.diagnostics.push(diagnostic);
    }
    side.graph.unresolvedIds = Object.keys(side.unknown);
    for (const row of rows) row.unknown.push(reason);
  }
  for (const row of rows) {
    row.beforePaths = oldTrace.paths.get(row.blockId) ?? []; row.afterPaths = newTrace.paths.get(row.blockId) ?? [];
    row.propagationCandidate = !!(row.beforePaths.length || row.afterPaths.length);
    row.unchanged = !row.directChanges.length && !row.resultChanges.length && !row.orderChanges.length && !row.unknown.length && !row.propagationCandidate;
  }
  const oldEdges = new Map(before.edges.map(edge => [relationKey(edge), edge]));
  const newEdges = new Map(after.edges.map(edge => [relationKey(edge), edge]));
  const newBindings = new Map(after.edges.map(edge => [bindingKey(edge), edge]));
  const edgeChanges = {
    added: after.edges.filter(edge => !oldEdges.has(relationKey(edge))),
    removed: before.edges.filter(edge => !newEdges.has(relationKey(edge))),
    unchanged: after.edges.filter(edge => oldEdges.has(relationKey(edge))),
    changed: before.edges.flatMap(edge => { const next = newBindings.get(bindingKey(edge)); return next && edge.source !== next.source ? [{ before: edge, after: next }] : []; }),
  };
  return { rows, before, after, edgeChanges, counts: {
    direct: rows.filter(row => row.directChanges.length).length, propagation: rows.filter(row => row.propagationCandidate).length,
    result: rows.filter(row => row.resultChanges.length).length, order: rows.filter(row => row.orderChanges.length).length,
    unknown: rows.filter(row => row.unknown.length).length, unchanged: rows.filter(row => row.unchanged).length,
  }, warnings, complete: before.complete && after.complete };
}
