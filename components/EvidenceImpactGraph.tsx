"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { EvidenceImpact } from '../lib/evidence-impact';
import { buildEvidenceImpactGraph, impactLabels } from '../lib/evidence-impact-graph';
import { renderDependencyGraph } from '../lib/dependency-renderer';

/** Historical presentation only. The parent remounts on pair/acquisition changes. */
export function EvidenceImpactGraph({ impact, renderDetails }: { impact: EvidenceImpact; renderDetails: (id: string) => ReactNode }) {
  const [open, setOpen] = useState(false);
  const [side, setSide] = useState<'before' | 'after'>('after');
  const [selectedId, setSelectedId] = useState('');
  const [rootId, setRootId] = useState('');
  const [mode, setMode] = useState<'all' | 'path'>('all');
  const [zoom, setZoom] = useState(1);
  const [renderState, setRenderState] = useState<{ model: unknown; message: string; ok: boolean }>({ model: null, message: '', ok: false });
  const host = useRef<HTMLDivElement>(null);
  const select = useCallback((id: string) => { setSelectedId(id); setRootId(''); }, []);
  const row = impact.rows.find(item => item.blockId === selectedId);
  const roots = [...new Set([...(row?.beforePaths ?? []), ...(row?.afterPaths ?? [])].map(path => path.rootId))];
  const view = useMemo(() => {
    if (!open) return null;
    try { return { model: buildEvidenceImpactGraph(impact, side, selectedId, rootId, mode), error: '' }; }
    catch { return { model: null, error: '図の表示準備に失敗しました。影響分析の一覧・詳細と生成済みMarkdownは引き続き利用できます。' }; }
  }, [open, impact, side, selectedId, rootId, mode]);
  const model = view?.model;
  const nodeIds = JSON.stringify(model?.nodeIds ?? []);
  useEffect(() => {
    if (!open || !host.current) return;
    const container = host.current;
    const focusedId = container.contains(document.activeElement) ? document.activeElement?.getAttribute('data-block-id') : null;
    container.replaceChildren();
    if (!model || model.limit || !model.nodeIds.length) return;
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) setRenderState({ model, message: '図を準備しています…', ok: false }); });
    const removers: (() => void)[] = [];
    renderDependencyGraph(model.mermaid, JSON.parse(nodeIds), () => cancelled, true).then(svg => {
      if (cancelled || !svg) return;
      svg.setAttribute('aria-label', side === 'before' ? '変更前の保存記録の図' : '変更後の保存記録の図');
      for (const node of svg.querySelectorAll<SVGGElement>('[data-block-id]')) {
        const id = node.getAttribute('data-block-id')!;
        const historical = impact[side].graph.nodes.find(item => item.id === id)!;
        node.setAttribute('aria-label', `保存記録のブロック ${id}: ${historical.expression}。${(model.labels.get(id) ?? []).join('・')}`);
        node.setAttribute('aria-pressed', String(id === selectedId));
        node.classList.toggle('historical-selected', id === selectedId);
        node.classList.toggle('historical-path', !!model.path?.blockIds.includes(id));
        let start: { x: number; y: number } | undefined, moved = false;
        const down = (event: PointerEvent) => { start = { x: event.clientX, y: event.clientY }; moved = false; };
        const move = (event: PointerEvent) => { if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) > 8) moved = true; };
        const cancel = () => { moved = true; start = undefined; };
        const click = () => { if (!moved) select(id); start = undefined; };
        const key = (event: KeyboardEvent) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(id); } };
        node.addEventListener('pointerdown', down); node.addEventListener('pointermove', move); node.addEventListener('pointercancel', cancel); node.addEventListener('click', click); node.addEventListener('keydown', key);
        removers.push(() => { node.removeEventListener('pointerdown', down); node.removeEventListener('pointermove', move); node.removeEventListener('pointercancel', cancel); node.removeEventListener('click', click); node.removeEventListener('keydown', key); });
      }
      container.replaceChildren(svg);
      if (focusedId && (document.activeElement === document.body || document.activeElement === container)) for (const node of svg.querySelectorAll<SVGGElement>('[data-block-id]')) if (node.getAttribute('data-block-id') === focusedId) node.focus();
      setRenderState({ model, message: '図を表示しました。', ok: true });
    }).catch(() => { if (!cancelled) { container.replaceChildren(); setRenderState({ model, message: '図の描画に失敗しました。影響分析の一覧・詳細と生成済みMarkdownは引き続き利用できます。', ok: false }); } });
    return () => { cancelled = true; removers.forEach(remove => remove()); };
  }, [open, model, nodeIds, side, selectedId, impact, select]);

  const drawn = renderState.model === model && renderState.ok && !model?.limit;
  const renderStatus = !model?.nodeIds.length ? 'この表示条件で描画する経路はありません。理由は以下を確認してください。' : renderState.model === model ? renderState.message : '図を準備しています…';
  return <details className="evidence-impact-graph" onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>変更影響を図でたどる</summary>
    {open && <section aria-label="保存記録の影響経路図">
      <p>保存済みの過去2記録の図です。矢印は実使用の参照元 → 利用側。太線は選択した代表経路、点線は判定不能の参照です。</p>
      <details><summary>i 図と代表経路の読み方</summary><p>分類と起点別の代表経路は変更影響分析と同じ結果です。代表経路は全経路ではなく、数値変化の原因や数学的証明ではありません。複数入力を結ぶ線は特定の入力だけが原因だと示しません。入力名・実使用値は詳細で確認してください。現在のメモ、未保存編集、試算は含みません。選択だけでは再計算・保存・編集画面への移動を行いません。</p></details>
      <div className="dependency-graph-tools"><button type="button" aria-pressed={side === 'before'} onClick={() => setSide('before')}>変更前の図</button><button type="button" aria-pressed={side === 'after'} onClick={() => setSide('after')}>変更後の図</button></div>
      <div className="evidence-pair"><label>対象ブロック<select aria-label="図で選択するブロック" value={selectedId} onChange={event => select(event.target.value)}><option value="">ブロックを選択</option>{impact.rows.map((item, index) => <option key={item.blockId} value={item.blockId}>ブロック {index + 1}</option>)}</select></label>
      <label>代表経路の起点<select aria-label="代表経路の起点" value={rootId} onChange={event => setRootId(event.target.value)}><option value="">起点を選択</option>{roots.map(id => <option value={id} key={id}>起点 ブロック {impact.rows.findIndex(item => item.blockId === id) + 1}</option>)}</select></label></div>
      <p>選択肢の番号は比較一覧の順です。完全なIDは選択欄の下と一覧で確認できます。</p>
      <div className="dependency-graph-tools"><button type="button" aria-pressed={mode === 'all'} onClick={() => setMode('all')}>全体表示</button><button type="button" aria-pressed={mode === 'path'} onClick={() => setMode('path')}>選択経路だけ表示</button><button type="button" aria-label="保存記録の図を縮小" disabled={zoom <= .5} onClick={() => setZoom(value => Math.max(.5, value - .25))}>−</button><span>{Math.round(zoom * 100)}%</span><button type="button" aria-label="保存記録の図を拡大" disabled={zoom >= 2} onClick={() => setZoom(value => Math.min(2, value + .25))}>＋</button></div>
      <div className="historical-graph-workspace"><div className="historical-graph-canvas">
        <p role="status">{view?.error || model?.limit || renderStatus}</p>
        {model && <><p>{model.message}</p><p>図の表示 {drawn ? model.nodeCount : 0} / {model.totalNodeCount} ブロック、実使用入力 {drawn ? model.edgeCount : 0} / {model.totalEdgeCount} 件。図では同じ2ブロック間の入力を1本にまとめる場合があります。</p>{!impact[side].complete && <p>分析は不完全です。不整合または分析上限の理由は判定不能欄を確認してください。未表示の経路を「影響なし」とは扱いません。</p>}</>}
        <div className="dependency-graph-scroll" tabIndex={0} aria-label="保存記録の図のスクロール領域"><div className="dependency-graph-svg historical-graph-svg" ref={host} style={{ zoom }} /></div>
      </div><section className="historical-graph-inspector" aria-label="図で選択した保存ブロックの詳細">
        <p role="status">{selectedId ? `選択中のブロックID：${selectedId}` : '図または選択肢からブロックを選んでください。'}</p>
        {rootId && <p>選択した起点ID：{rootId}</p>}
        {selectedId && !impact[side].graph.nodes.some(node => node.id === selectedId) && <p>選択したブロックは{side === 'before' ? '変更前' : '変更後'}の記録に存在しません。別ブロックで代用しません。</p>}
        {row && <><p>{impactLabels(row).join(' / ')}</p>{row.unknown.map((reason, index) => <p key={index}>判定不能：{reason}</p>)}{model?.path && <p data-evidence-path>選択した代表経路：{model.path.blockIds.join(' → ')}</p>}{renderDetails(row.blockId)}</>}
      </section></div>
      <details><summary>ブロックIDと分類の一覧</summary><ul className="dependency-graph-list">{impact.rows.map((item, index) => <li key={item.blockId}><button type="button" aria-pressed={selectedId === item.blockId} onClick={() => select(item.blockId)}>ブロック {index + 1} / ID：{item.blockId} / {impactLabels(item).join('・')}</button></li>)}</ul></details>
    </section>}
  </details>;
}
