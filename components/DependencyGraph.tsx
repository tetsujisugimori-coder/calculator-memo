"use client";

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { MemoBlock } from '../lib/types';
import type { CalculationStatusReport } from '../lib/calculation-status';
import { graphRenderLimit } from '../lib/dependency-svg';
import { renderDependencyGraph } from '../lib/dependency-renderer';
import type { CalculationTrial } from '../lib/calculation-trial';
import { buildDependencyComparison } from '../lib/dependency-comparison';
import { CalculationStatusDetails, DependencyMermaidExport } from './CalculationStatusDetails';


type Props = { blocks: MemoBlock[]; report: CalculationStatusReport; onLocate: (id: string) => void; baselineKnown?: boolean; trial?: CalculationTrial };
export function DependencyGraph({ blocks, report, onLocate, baselineKnown = true, trial }: Props) {
  const [open, setOpen] = useState(false);
  const [compare, setCompare] = useState(false);
  const comparison = open && compare ? buildDependencyComparison(report, baselineKnown, trial) : undefined;
  const shownGraph = comparison?.graph ?? report.graph;
  const shownMermaid = comparison?.mermaid ?? report.mermaid;
  const diagnosticReport = compare && trial ? trial.report : report;
  const [message, setMessage] = useState('');
  const [zoom, setZoom] = useState(1);
  const [selected, setSelected] = useState<string>();
  const host = useRef<HTMLDivElement>(null);
  const latest = useRef({ blocks, onLocate });
  useLayoutEffect(() => {
    latest.current = { blocks, onLocate };
    for (const node of host.current?.querySelectorAll('[data-block-id]') ?? []) {
      const id = node.getAttribute('data-block-id');
      const index = blocks.findIndex(block => block.id === id);
      const block = blocks[index];
      if (block?.type === 'calculation') node.setAttribute('aria-label', `ブロック ${index + 1}: ${block.expression || '式未入力'}（ID: ${id}）へ移動`);
    }
  }, [blocks, onLocate]);
  const nodeIds = JSON.stringify(shownGraph.nodes.map(node => node.id).sort());
  const limit = graphRenderLimit(shownGraph.nodes.length, shownGraph.edges.length, shownMermaid);
  useEffect(() => {
    if (!open || !host.current) return;
    const container = host.current;
    container.replaceChildren();
    if (limit) return;
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) setMessage('図を準備しています…'); });
    let cleanup = () => {};
    renderDependencyGraph(shownMermaid, JSON.parse(nodeIds), () => cancelled).then(svg => {
      if (cancelled || !svg) return;
      const select = (id: string) => {
        if (!latest.current.blocks.some(block => block.type === 'calculation' && block.id === id)) {
          setSelected(id); setMessage('対象ブロックは削除されています。変更前の記録として表示しています。移動・編集はできません。'); return;
        }
        setSelected(id); latest.current.onLocate(id);
      };
      const removers: (() => void)[] = [];
      for (const node of svg.querySelectorAll<SVGGElement>('[data-block-id]')) {
        const id = node.getAttribute('data-block-id')!;
        const block = latest.current.blocks.find(block => block.id === id);
        if (!block || block.type !== 'calculation') { node.setAttribute('aria-label', `削除済みブロック（ID: ${id}）。変更前の記録`); } else node.setAttribute('aria-label', `ブロック ${latest.current.blocks.findIndex(block => block.id === id) + 1}: ${block?.type === 'calculation' ? block.expression || '式未入力' : id}（ID: ${id}）へ移動`);
        let start: { x: number; y: number } | undefined;
        let moved = false;
        const down = (event: PointerEvent) => { start = { x: event.clientX, y: event.clientY }; moved = false; };
        const move = (event: PointerEvent) => { if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 8) moved = true; };
        const cancel = () => { moved = true; start = undefined; };
        const click = () => { if (!moved) select(id); start = undefined; };
        const key = (event: KeyboardEvent) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(id); } };
        node.addEventListener('pointerdown', down); node.addEventListener('pointermove', move);
        node.addEventListener('pointercancel', cancel); node.addEventListener('click', click); node.addEventListener('keydown', key);
        removers.push(() => { node.removeEventListener('pointerdown', down); node.removeEventListener('pointermove', move); node.removeEventListener('pointercancel', cancel); node.removeEventListener('click', click); node.removeEventListener('keydown', key); });
      }
      cleanup = () => removers.forEach(remove => remove());
      container.replaceChildren(svg); setMessage('');
    }).catch(() => { if (!cancelled) setMessage('図を表示できません。一覧からブロックを選ぶか、Mermaidコピーをご利用ください。計算・保存データは変更していません。'); });
    return () => { cancelled = true; cleanup(); container.replaceChildren(); };
  }, [open, shownMermaid, nodeIds, limit]);
  const selectedBlock = blocks.find(block => block.type === 'calculation' && block.id === selected);
  return <details className="dependency-graph-panel" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>依存関係の図を開く</summary>
    {open && <section aria-label="依存関係図パネル">
      <div className="dependency-graph-tools" aria-label="図の表示切替">
        <button type="button" aria-pressed={!compare} onClick={() => setCompare(false)}>現在の依存関係</button>
        <button type="button" aria-pressed={compare} onClick={() => setCompare(true)}>変更前後・試算</button>
      </div>
      {comparison && <div className="dependency-comparison-summary">
        <p>変更前はこの編集画面を開いた時点、または最後の一括確定時点です。保存済みの原本を再現する図ではありません。{!baselineKnown && '読み込み前の変更履歴は不明です。影響なしとは断定しません。'}</p>
        <p>＋追加 {comparison.addedCount}件、−削除 {comparison.removedCount}件。参照先の変更は削除と追加の組で表します。削除された線・ノードは変更前の記録で、現在の計算経路ではありません。</p>
        <p data-comparison-trial={trial ? 'valid' : 'none'}>{trial ? '有効な試算（未反映）を表示中です。依存関係上の影響と実際の数値変化は別の情報です。' : '現在有効な試算はありません。数値変化は未確認です。'}</p>
        <p>「影響なし」は依存関係上の判定です。「数値変化なし」でも影響対象の場合があります。旧結果との比較ができない場合や評価失敗・未試行は「数値比較不可」です。</p>
      </div>}
      <p>矢印は参照先 → その値を使うブロックです。{compare ? '太線は追加、−削除の点線は変更前の参照です。変更不明は解析不足、旧変数候補は未確定の参照です。' : '実線はID参照、点線は旧変数の未確定候補です。'}表示順や実行順の図ではありません。</p>
      <p>ノードを選ぶと対応するブロックへ移動します。図の操作だけでは計算・保存しません。</p>
      {report.hasPending && <p>メモ全体は未確定です。「通常」は個別の変更・問題が確認されていないという意味で、保持中の旧結果が再計算済みになったわけではありません。</p>}
      <div className="dependency-graph-tools"><button type="button" aria-label="図を縮小" disabled={zoom <= .5} onClick={() => setZoom(value => Math.max(.5, value - .25))}>−</button><span>{Math.round(zoom * 100)}%</span><button type="button" aria-label="図を拡大" disabled={zoom >= 2} onClick={() => setZoom(value => Math.min(2, value + .25))}>＋</button></div>
      <p role="status">{limit || message}</p>
      <div className="dependency-graph-scroll" tabIndex={0} aria-label="図のスクロール領域"><div className="dependency-graph-svg" ref={host} style={{ zoom }} /></div>
      <details><summary>ブロック一覧から選ぶ</summary><ul className="dependency-graph-list">{blocks.filter(block => block.type === 'calculation').map(block => <li key={block.id}><button type="button" onClick={() => { setSelected(block.id); onLocate(block.id); }}>ブロック {blocks.indexOf(block) + 1}: {block.expression || '式未入力'} · {report.states.get(block.id)?.label}</button></li>)}</ul></details>
      {comparison && <details open><summary>変更影響・試算の一覧</summary><ul className="dependency-graph-list">{shownGraph.nodes.map(node => {
        const presentation = comparison.nodes.get(node.id);
        const row = presentation?.trialRow;
        return <li key={node.id} data-comparison-block-id={node.id}>
          <p>{node.expression || '式未入力'}（ID: {node.id}） · {presentation?.labels.join('・')}</p>
          {row && <p>保持中の旧結果: {row.previousText || 'なし'} → 試算: {row.state === 'success' ? row.resultText : row.state === 'failed' ? '計算失敗' : '未試行'}{row.difference !== null && `（差: ${row.difference}）`}。試算は未反映です。</p>}
          {presentation?.deleted ? <span>削除済みのため移動・編集できません。</span> : <button type="button" onClick={() => { setSelected(node.id); onLocate(node.id); }}>対応ブロックへ移動</button>}
        </li>;
      })}</ul></details>}
      {comparison && <div aria-label="比較図のMermaid出力"><DependencyMermaidExport text={shownMermaid} comparison /></div>}
      {selectedBlock && <div className="dependency-graph-selection"><p>選択中: ブロック {blocks.indexOf(selectedBlock) + 1}（ID: {selectedBlock.id}）</p><CalculationStatusDetails blockId={selectedBlock.id} blocks={blocks} report={diagnosticReport} context={compare && trial ? 'trial' : undefined} onLocate={onLocate} /></div>}
      {selected && !selectedBlock && <p role="status">選択したブロックは削除されています。</p>}
    </section>}
  </details>;
}
