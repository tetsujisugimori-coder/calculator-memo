import { staleBlockIds } from './block-references';
import { inspectBlockReferenceExpression } from './reference-syntax';
import { analyzeMemoDependencies, type DependencyGraph } from './dependency-analysis';
import { toMermaid, type MermaidNodeState } from './dependency-mermaid';
import { isMemoBlock } from './memo-blocks';
import type { CalculationMemoBlock, MemoBlock, PlainCalculationNote } from './types';

export type MarkdownReport = { markdown: string; filename: string; warnings: string[] };
export const REPORT_CHARACTER_LIMIT = 1_000_000;
export const REPORT_OUTPUT_CHARACTER_LIMIT = 4_000_000;
class ReportSizeError extends Error {
  constructor() { super('レポートの出力が上限（400万文字）を超えています。省略せず出力を停止しました。'); }
}
/** Bound aggregation as well as the final string; never return a partial report. */
function reportLines(initial: string[] = []): string[] {
  const lines: string[] = [];
  let length = 0;
  lines.push = (...items: string[]) => {
    length += items.reduce((sum, item) => sum + item.length + 1, 0);
    if (length > REPORT_OUTPUT_CHARACTER_LIMIT) throw new ReportSizeError();
    return Array.prototype.push.apply(lines, items);
  };
  lines.push(...initial);
  return lines;
}
const html = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const literal = (s: string) => html(s).replace(/[\\`*_{}\[\]()#+.!|~$-]/g, '\\$&').replace(/[\r\n\u2028\u2029]+/g, ' ');
/** Dynamic fences cannot be closed by the value they enclose. */
export function reportCode(value: string, language = 'text'): string {
  let longest = 0;
  for (const match of value.matchAll(/`+/g)) longest = Math.max(longest, match[0].length);
  const fence = '`'.repeat(Math.max(3, longest + 1));
  return `${fence}${language}\n${value}\n${fence}`;
}

/** Keep Markdown, but never allow an unfinished source fence to consume later blocks.
 * HTML is made visible rather than trusted. Vendor execution directives are inert.
 */
function bodyMarkdown(source: string, warnings: string[]): string {
  let fence: { character: string; length: number } | undefined;
  let math: string[] | undefined;
  const lines: string[] = [];
  const appendMath = () => {
    const latex = math!.join('\n');
    if (/[<>]/.test(latex) || /^ {0,3}(?:`{3,}|~{3,})/m.test(latex)) {
      lines.push(reportCode(latex, 'latex'));
      warnings.push('HTML記号またはコードフェンスを含む本文数式は元のLaTeXをコードとして保持しました。');
    } else lines.push('$$', latex, '$$');
    math = undefined;
  };
  for (const line of source.replace(/\r\n?/g, '\n').split('\n')) {
    if (fence) {
      if (new RegExp(`^ {0,3}${fence.character}{${fence.length},}\\s*$`).test(line)) fence = undefined;
      lines.push(line); continue;
    }
    if (math) {
      if (line.trim() === '$$') appendMath(); else math.push(line);
      continue;
    }
    const opening = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
    if (opening && !(opening[1][0] === '`' && opening[2].includes('`'))) {
      fence = { character: opening[1][0], length: opening[1].length }; lines.push(line); continue;
    }
    if (line.trim() === '$$') { math = []; continue; }
    // Preserve inline LaTeX instead of entity-transforming its mathematical meaning.
    // Unsafe HTML-bearing math is shown verbatim as code, never rendered as HTML.
    const pieces = line.split(/(\$[^$\n]+\$)/g);
    if (pieces.some((part, index) => index % 2 && /[<>]/.test(part))) {
      lines.push(reportCode(line, 'markdown'));
      warnings.push('HTML記号を含むインライン数式の行は原文コードとして保持しました。');
    } else lines.push(pieces.map((part, index) => index % 2 ? part : html(part)).join('').replace(/^(\s*):::/, '$1\\:\\:\\:'));
  }
  if (fence) { lines.push(fence.character.repeat(fence.length)); warnings.push('本文の未閉鎖コードフェンスを出力内だけで閉じました。原本は変更していません。'); }
  if (math) { appendMath(); warnings.push('本文の未閉鎖数式区切りを出力内だけで閉じました。原本は変更していません。'); }
  if (/[<>]/.test(source)) warnings.push('本文のHTML記号は文字として表示するためエスケープまたはコード表示にしました。');
  if (/^\s*:::/m.test(source)) warnings.push('独自ディレクティブは実行させず文字として出力しました。');
  return lines.join('\n');
}

export function reportFilename(title: string): string {
  const safe = title.normalize('NFKC').replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, '_').replace(/[. ]+$/g, '').trim();
  let name = Array.from(safe).slice(0, 80).join('').replace(/[. ]+$/g, '') || 'calculation-memo';
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name)) name = `memo-${name}`;
  // Most filesystems bound a path component in bytes, not Unicode code points.
  while (new TextEncoder().encode(`${name}.md`).length > 200) name = Array.from(name).slice(0, -1).join('');
  return `${name}.md`;
}

function checkedBlocks(note: PlainCalculationNote): MemoBlock[] {
  if (!note || note.type !== 'plain-calculation' || !['id', 'title', 'content', 'createdAt', 'updatedAt'].every(key => typeof (note as unknown as Record<string, unknown>)[key] === 'string') || !note.id.trim()) throw new Error('保存済み計算メモの形式を確認できません。');
  const record = note as unknown as Record<string, unknown>;
  if ((record.schemaVersion !== undefined && record.schemaVersion !== 1) || (note.calculationPolicy !== undefined && (note.calculationPolicy.version !== 1 || note.calculationPolicy.mode !== 'manual'))) throw new Error('未対応のメモ形式です。原本JSONを保護して確認してください。');
  const blocks = note.blocks === undefined ? (note.content ? [{ id: `legacy-text-${note.id}`, type: 'text' as const, content: note.content }] : []) : note.blocks;
  if (!Array.isArray(blocks) || !blocks.every(isMemoBlock) || new Set(blocks.map(b => b.id)).size !== blocks.length || blocks.some(b => b.type === 'calculation' && b.evaluationMode !== undefined && !['note-variables', 'block-references'].includes(b.evaluationMode))) throw new Error('未対応または不正なブロックがあります。省略せず出力を停止しました。原本JSONを確認してください。');
  const raw = JSON.stringify(note);
  if (raw.length > REPORT_CHARACTER_LIMIT) throw new Error('レポートの入力が上限（100万文字）を超えています。省略せず出力を停止しました。');
  return blocks;
}

function resultState(block: CalculationMemoBlock, stale: Set<string> | undefined, structuralError: boolean): string {
  if (block.error) return '計算エラー（保存された記録。現在の式は再評価していません）';
  if (block.result === null) return '未計算または結果なし';
  if (block.evaluationState?.attemptError) return '古い可能性がある結果（一括確定失敗の記録あり）';
  if (structuralError) return '古い可能性がある結果（式・参照の診断あり）';
  if (stale?.has(block.id)) return '古い可能性がある結果（再計算待ち、または保存署名不一致）';
  if (stale && block.evaluationState?.status === 'current' && block.evaluationState.signature) return '確定済みの結果（保存署名と依存状態を照合。再計算は未実行）';
  return '状態不明（現在の入力式に対応する結果か確認できません）';
}

/** Current saved snapshot only. Signatures are never decoded as historical input records. */
function referenceEvidence(block: CalculationMemoBlock, blocks: MemoBlock[], graph: DependencyGraph | undefined, stateById: Map<string, string>, expandedSourceIds: Set<string>): string[] {
  const lines = reportLines(['直接参照と根拠情報:', '', '計算時の使用値は確認不能（使用値の履歴は保存されていません。以下の現在の保存値で代用しません）。', '']);
  const node = graph?.nodes.find(n => n.id === block.id);
  const sourceDetails = (id: string) => {
    const index = blocks.findIndex(b => b.id === id);
    const source = blocks[index];
    if (!source || source.type !== 'calculation') {
      lines.push(`参照元ID: ${literal(id)}（計算ブロックを確認できません。参照元の値は確認不能）`, '');
      return;
    }
    lines.push(`参照元: ブロック ${index + 1} / ID: ${literal(source.id)}`, '',
      `参照元の現在の保存内部数値: ${source.result === null ? 'なし' : Object.is(source.result, -0) ? '-0' : String(source.result)}`, '',
      `参照元の結果状態 = ${stateById.get(source.id) ?? '状態不明'}`, '');
    if (expandedSourceIds.has(source.id)) {
      lines.push(`参照元の保存式・表示値の全文は本文のブロック ${index + 1} を参照してください（重複掲載を省略）。`, '');
    } else {
      expandedSourceIds.add(source.id);
      lines.push('参照元の現在の保存式:', '', reportCode(source.expression), '',
        '参照元の現在の保存表示値（丸め・整形済み）:', '', reportCode(source.resultText || 'なし'), '');
    }
  };
  const uninspectable = !node || node.diagnostics.some(d => ['invalid-expression', 'invalid-reference', 'analysis-failure', 'unsupported-mode'].includes(d.code));
  if (uninspectable) {
    lines.push('直接参照は確認不能（解析失敗または解析範囲外）。参照なしとは断定していません。', '');
    for (const entry of block.references?.entries ?? []) lines.push(`- 未確認の保存参照対応 @{${entry.slot}} → ${literal(entry.blockId)}（式での使用は未確認）`);
  } else if (block.evaluationMode === 'block-references') {
    try {
      const { slots } = inspectBlockReferenceExpression(block);
      if (!slots.length) lines.push('直接ID参照: なし（現在の保存式の解析結果）', '');
      for (const slot of slots) {
        const entry = block.references?.entries.find(e => e.slot === slot);
        if (!entry) { lines.push(`- ID参照 @{${slot}} → 対応する保存参照先IDなし（参照切れ）`, ''); continue; }
        lines.push(`- ID参照 @{${slot}} → ${literal(entry.blockId)}（${blocks.some(b => b.type === 'calculation' && b.id === entry.blockId) ? '参照先あり' : '参照先なし'}）`, '');
        sourceDetails(entry.blockId);
      }
      for (const entry of block.references?.entries ?? []) if (!slots.includes(entry.slot))
        lines.push(`- 式で未使用の保存参照対応 @{${entry.slot}} → ${literal(entry.blockId)}（直接依存ではありません）`);
    } catch (error) {
      if (error instanceof ReportSizeError) throw error;
      lines.push('直接参照は確認不能（参照式の解析に失敗）。参照なしとは断定していません。', '');
    }
  } else if (block.evaluationMode === 'note-variables') {
    if (!node.bindings.length) lines.push('直接旧変数参照: なし（現在の保存式の解析結果）', '');
    for (const binding of node.bindings) {
      lines.push(`- 旧変数 ${literal(binding.variable)} の候補: ${binding.candidates.map(literal).join(', ') || 'なし'}（不確定。代入の計算成功は未確認）`, '',
        '候補は実際に使用された参照元を特定しません。再代入の成否や未定義の可能性があり、候補の値を変数の確定値として扱いません。', '');
      for (const id of binding.candidates) sourceDetails(id);
    }
  } else lines.push('直接ブロック参照・旧変数参照: なし（通常式の解析結果）', '');
  return lines;
}

/** Presentation only: no evaluator, editor baseline, trial, or persistence calls. */
export function buildMarkdownReport(note: PlainCalculationNote): MarkdownReport {
  const blocks = checkedBlocks(note);
  const warnings: string[] = [];
  let graph: DependencyGraph | undefined, stale: Set<string> | undefined;
  let graphFailure = '';
  try {
    graph = analyzeMemoDependencies(blocks); stale = staleBlockIds(blocks);
    // A failed atomic transaction cannot certify any consumer, even if an imported
    // snapshot contradictorily retains current signatures beside attemptError.
    if (blocks.some(b => b.type === 'calculation' && b.evaluationState?.attemptError))
      blocks.forEach(b => { if (b.type === 'calculation') stale!.add(b.id); });
  }
  catch { graphFailure = '依存関係の解析処理に失敗しました。計算内容は保存記録のまま出力しています。'; warnings.push(graphFailure); }
  const expandedSourceIds = new Set<string>();
  const states = new Map<string, MermaidNodeState>();
  const stateById = new Map<string, string>();
  for (const block of blocks) if (block.type === 'calculation') {
    const structuralError = graph?.diagnostics.some(d => (d.blockId === block.id || !d.blockId) && d.severity === 'error' && d.code !== 'saved-error') ?? false;
    stateById.set(block.id, resultState(block, stale, structuralError));
  }
  const lines = reportLines([`# ${literal(note.title.trim() || '計算メモ')}`, '', '## 基本情報', '',
    `- メモID: ${literal(note.id)}`, `- 作成日時（保存記録）: ${literal(note.createdAt)}`, `- 更新日時（保存記録）: ${literal(note.updatedAt)}`, '',
    '保存済み原本の読み取り専用レポートです。再計算はしていません。未保存の編集・未反映の試算は含みません。表示値と内部数値を区別し、数値の存在だけで正しさを保証しません。', '', '## 本文・計算過程', '']);
  if (!blocks.length) lines.push('本文ブロックはありません。', '');
  blocks.forEach((block, index) => {
    lines.push(`### ブロック ${index + 1}（${block.type === 'text' ? '文章' : block.type === 'formula' ? '表示専用数式' : '計算'}）`, '', `ブロックID: ${literal(block.id)}`, '');
    if (block.type === 'text') lines.push(bodyMarkdown(block.content, warnings), '');
    else if (block.type === 'formula') {
      if (/\$\$|[<>]/.test(block.latex) || /^ {0,3}(?:`{3,}|~{3,})/m.test(block.latex)) { lines.push('数式区切りまたはHTML記号を含むため、元のLaTeXをコードとして保持しています。', '', reportCode(block.latex, 'latex'), ''); warnings.push('一部の表示専用数式は構造保護のためLaTeXコードとして出力しました。'); }
      else lines.push('$$', block.latex, '$$', '');
    } else {
      const diagnostics = graph?.diagnostics.filter(d => d.blockId === block.id || !d.blockId) ?? [];
      const structuralError = diagnostics.some(d => d.severity === 'error' && d.code !== 'saved-error');
      const state = stateById.get(block.id)!;
      states.set(block.id, { labels: [state], classes: [block.error || structuralError ? 'error' : state.startsWith('確定') ? 'normal' : 'unknown'] });
      lines.push('入力式:', '', reportCode(block.expression), '', `状態: ${state}`, '', '保存表示値（丸め・整形済み）:', '', reportCode(block.resultText || 'なし'), '',
        `保存内部数値: ${block.result === null ? 'なし' : Object.is(block.result, -0) ? '-0' : String(block.result)}`, '', `評価方式: ${literal(block.evaluationMode ?? 'legacy（旧方式）')}`, '');
      if (block.error) lines.push('保存エラー:', '', reportCode(block.error), '');
      if (block.evaluationState?.attemptError) lines.push('保存された一括確定失敗:', '', reportCode(block.evaluationState.attemptError), '');
      lines.push(...referenceEvidence(block, blocks, graph, stateById, expandedSourceIds));
      lines.push('');
    }
  });
  lines.push('## 依存関係図', '', '保存済み状態の図です。実線はID参照の確定依存、破線は旧変数の不確定候補です。辺は数値変化や計算成功を保証しません。依存関係図は計算履歴の証明ではありません。Mermaid非対応の環境ではコードとして表示されます。', '');
  if (graph && graph.nodes.length) {
    try { lines.push(reportCode(toMermaid(graph, { nodeStates: states }), 'mermaid'), ''); }
    catch (error) { if (error instanceof ReportSizeError) throw error; graphFailure = 'Mermaid文字列の生成に失敗しました。以下の診断と各ブロックの参照記録を確認してください。'; warnings.push(graphFailure); }
  } else if (graph?.complete) lines.push('計算ブロックがないため、依存関係図はありません。', '');
  else if (!graphFailure) { graphFailure = '依存関係図を出力できませんでした。解析制限・診断を確認してください。'; warnings.push(graphFailure); }
  if (graphFailure) lines.push(graphFailure, '');
  lines.push('## 計算状態と注意事項', '', 'これは保存時の記録と静的な構造確認です。計算の成立と数学的な証明の成立は別です。旧方式など署名のない結果は状態不明としています。Markdownは原本JSONの代替バックアップではなく、未知の付随フィールドは解釈・掲載していません。', '');
  if (graph && !graph.complete) lines.push('依存関係の解析は不完全です。正常な全体図とみなさないでください。', '');
  for (const d of graph?.diagnostics ?? []) lines.push(`- ${literal(d.code)} / ${literal(d.blockId ?? '全体')}: ${literal(d.message)}${d.relatedIds?.length ? `（関連ID: ${d.relatedIds.map(literal).join(', ')}）` : ''}`);
  for (const warning of new Set(warnings)) lines.push(`- ${warning}`);
  lines.push('', '## 解説・根拠の追記欄', '', '未記入: 数式の証明・導出過程、使用条件と前提、由緒・歴史、参考文献・出典を必要に応じて追記してください。このレポートはそれらを自動生成・検証していません。', '');
  const markdown = lines.join('\n');
  if (markdown.length > REPORT_OUTPUT_CHARACTER_LIMIT) throw new ReportSizeError();
  return { markdown, filename: reportFilename(note.title), warnings: [...new Set(warnings)] };
}

/** This requests a browser download; it does not establish OS save completion. */
export function downloadMarkdownReport(report: MarkdownReport): void {
  const bytes = new TextEncoder().encode(report.markdown);
  if (new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes) !== report.markdown) throw new Error('文字情報を欠落なく出力できません。原本は変更していません。');
  const url = URL.createObjectURL(new Blob([bytes], { type: 'text/markdown;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url; link.download = report.filename;
  try { document.body.append(link); link.click(); }
  finally { link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 60_000); }
}
