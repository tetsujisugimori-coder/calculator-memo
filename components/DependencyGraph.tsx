"use client";

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { MemoBlock } from '../lib/types';
import type { CalculationStatusReport } from '../lib/calculation-status';
import { applyDependencyLabels, graphRenderLimit, prepareDependencyLayout, sanitizeDependencySvg } from '../lib/dependency-svg';
import { CalculationStatusDetails } from './CalculationStatusDetails';

let renderSequence = 0;
let rendering: Promise<unknown> = Promise.resolve();
// Mermaid has global configuration. Serialize this app's renders and never use
// bindFunctions or Mermaid click callbacks. Only our validated IDs are interactive.
function renderGraph(text: string, ids: string[], cancelled: () => boolean) {
  const task = rendering.catch(() => undefined).then(async () => {
    if (cancelled()) return null;
    const { default: mermaid } = await import('mermaid');
    if (cancelled()) return null;
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', htmlLabels: false,
      flowchart: { htmlLabels: false, useMaxWidth: false, wrappingWidth: 600 },
      maxTextSize: 250_000, maxEdges: 256, suppressErrorRendering: true });
    const staging = document.createElement('div');
    staging.style.cssText = 'position:fixed;left:-100000px;top:0;visibility:hidden;pointer-events:none';
    staging.setAttribute('aria-hidden', 'true');
    document.body.append(staging);
    try {
      const layout = prepareDependencyLayout(text);
      const { svg } = await mermaid.render(`dependencyGraph${++renderSequence}`, layout.text, staging);
      if (cancelled()) return null;
      const clean = sanitizeDependencySvg(svg, ids, document);
      applyDependencyLabels(clean, layout.labels, document);
      return clean;
    } finally { staging.remove(); }
  });
  rendering = task;
  return task;
}

type Props = { blocks: MemoBlock[]; report: CalculationStatusReport; onLocate: (id: string) => void };
export function DependencyGraph({ blocks, report, onLocate }: Props) {
  const [open, setOpen] = useState(false);
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
  const nodeIds = JSON.stringify(report.graph.nodes.map(node => node.id).sort());
  const limit = graphRenderLimit(report.graph.nodes.length, report.graph.edges.length, report.mermaid);
  useEffect(() => {
    if (!open || !host.current) return;
    const container = host.current;
    container.replaceChildren();
    if (limit) return;
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) setMessage('図を準備しています…'); });
    let cleanup = () => {};
    renderGraph(report.mermaid, JSON.parse(nodeIds), () => cancelled).then(svg => {
      if (cancelled || !svg) return;
      const select = (id: string) => {
        if (!latest.current.blocks.some(block => block.type === 'calculation' && block.id === id)) {
          setMessage('対象ブロックは削除されています。最新の一覧を確認してください。'); return;
        }
        setSelected(id); latest.current.onLocate(id);
      };
      const removers: (() => void)[] = [];
      for (const node of svg.querySelectorAll<SVGGElement>('[data-block-id]')) {
        const id = node.getAttribute('data-block-id')!;
        const block = latest.current.blocks.find(block => block.id === id);
        node.setAttribute('aria-label', `ブロック ${latest.current.blocks.findIndex(block => block.id === id) + 1}: ${block?.type === 'calculation' ? block.expression || '式未入力' : id}（ID: ${id}）へ移動`);
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
  }, [open, report.mermaid, nodeIds, limit]);
  const selectedBlock = blocks.find(block => block.type === 'calculation' && block.id === selected);
  return <details className="dependency-graph-panel" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>依存関係の図を開く</summary>
    {open && <section aria-label="依存関係図パネル">
      <p>矢印は参照先 → その値を使うブロックです。実線はID参照、点線は旧変数の未確定候補です。表示順や実行順の図ではありません。</p>
      <p>ノードを選ぶと対応するブロックへ移動します。図の操作だけでは計算・保存しません。</p>
      {report.hasPending && <p>メモ全体は未確定です。「通常」は個別の変更・問題が確認されていないという意味で、保持中の旧結果が再計算済みになったわけではありません。</p>}
      <div className="dependency-graph-tools"><button type="button" aria-label="図を縮小" disabled={zoom <= .5} onClick={() => setZoom(value => Math.max(.5, value - .25))}>−</button><span>{Math.round(zoom * 100)}%</span><button type="button" aria-label="図を拡大" disabled={zoom >= 2} onClick={() => setZoom(value => Math.min(2, value + .25))}>＋</button></div>
      <p role="status">{limit || message}</p>
      <div className="dependency-graph-scroll" tabIndex={0} aria-label="図のスクロール領域"><div className="dependency-graph-svg" ref={host} style={{ zoom }} /></div>
      <details><summary>ブロック一覧から選ぶ</summary><ul className="dependency-graph-list">{blocks.filter(block => block.type === 'calculation').map(block => <li key={block.id}><button type="button" onClick={() => { setSelected(block.id); onLocate(block.id); }}>ブロック {blocks.indexOf(block) + 1}: {block.expression || '式未入力'} · {report.states.get(block.id)?.label}</button></li>)}</ul></details>
      {selectedBlock && <div className="dependency-graph-selection"><p>選択中: ブロック {blocks.indexOf(selectedBlock) + 1}（ID: {selectedBlock.id}）</p><CalculationStatusDetails blockId={selectedBlock.id} blocks={blocks} report={report} onLocate={onLocate} /></div>}
      {selected && !selectedBlock && <p role="status">選択したブロックは削除されています。</p>}
    </section>}
  </details>;
}
