"use client";

import { useMemo, useState } from "react";
import { readDifferenceAssessments, type DifferenceAssessment } from "../lib/formula-report-diff-tracking";
import { compareEvidenceRecords } from "../lib/evidence-comparison";
import type { FormulaReportEvidenceLink } from "../lib/types";
import { QuoteComparisonDetails, type QuoteSource } from "./FormulaQuoteComparison";
import { RecordInfo, BlockInfo } from "./EvidenceRecordDetails";
import { Modal } from "./Modal";

/** Each open view is pinned to one body and acquisition. Changing either discards it. */
export function FormulaDifferenceSources({ body, formulaId, reportId, links, source, onRefresh }: { body: string; formulaId: string; reportId: string; links: FormulaReportEvidenceLink[]; source: QuoteSource; onRefresh: () => void }) {
  const assessments = useMemo(() => readDifferenceAssessments(body, formulaId, source.notes, { error: source.error, stale: source.stale, invalidData: source.invalidData }), [body, formulaId, source.notes, source.error, source.stale, source.invalidData]);
  const [opened, setOpened] = useState<{ index: number; body: string; formulaId: string; reportId: string } | null>(null);
  const valid = opened && opened.body === body && opened.formulaId === formulaId && opened.reportId === reportId;
  if (opened && !valid) setOpened(null);
  if (!assessments.length) return null;
  return <section className="quote-tools" aria-label="比較差分の出典">
    <h4>比較差分の出典（{assessments.length}件）</h4>
    <p>引用時点の両記録と、現在取得した同じIDの保存記録を別々に確認します。追跡情報のない旧差分は推測で復元しません。本文・保存記録・確認履歴は更新しません。</p>
    <ol>{assessments.map((item, index) => <li key={`${item.start}-${index}`}><p role="status">比較差分{index + 1}：{item.reason}</p><button type="button" onClick={() => setOpened({ index, body, formulaId, reportId })}>比較差分{index + 1}の出典を確認</button></li>)}</ol>
    {valid && assessments[opened.index] && <DifferenceSourceDialog key={`${reportId}:${opened.index}`} assessment={assessments[opened.index]} source={source} links={links} onRefresh={onRefresh} onClose={() => setOpened(null)} />}
  </section>;
}

export function DifferenceSourceDialog({ assessment, source, links, onRefresh, onClose }: { assessment: DifferenceAssessment; source: QuoteSource; links: FormulaReportEvidenceLink[]; onRefresh: () => void; onClose: () => void }) {
  const [view, setView] = useState<{ kind: 'historical' | 'current' | 'before' | 'after'; notes: QuoteSource['notes']; fetchedAt: string; links: FormulaReportEvidenceLink[]; error?: string; stale?: boolean } | null>(null);
  const valid = view && view.notes === source.notes && view.fetchedAt === source.fetchedAt && view.links === links && view.error === source.error && view.stale === source.stale;
  if (view && !valid) setView(null);
  const open = (kind: NonNullable<typeof view>['kind']) => setView({ kind, notes: source.notes, fetchedAt: source.fetchedAt, links, error: source.error, stale: source.stale });
  const snapshot = assessment.snapshot;
  const before = assessment.before?.record, after = assessment.after?.record;
  const canCurrent = !!before && !!after && !source.error && !source.stale;
  const current = valid && view.kind === 'current';
  const comparison = useMemo(() => {
    if (!valid || !snapshot || (view.kind !== 'historical' && view.kind !== 'current')) return null;
    try { return compareEvidenceRecords(current ? before! : snapshot.quote.record, current ? after! : snapshot.after); }
    catch { return null; }
  }, [valid, snapshot, view?.kind, current, before, after]);
  const detail = valid && view.kind === 'before' ? before : valid && view.kind === 'after' ? after : undefined;
  return <Modal title="比較差分の出典確認" onClose={onClose} wide><section className="formula-report quote-tools saved-evidence">
    <p role="status">{assessment.reason}</p>
    <p>保存原本取得日時：{source.fetchedAt}。照合はこの取得時点だけです。数学的証明、真正性、利用者の明示確認ではありません。</p>
    {source.error && <p role="alert">{source.invalidData ? "保存データが未知・不正な形式のため照合できません。原本は保持しています。" : "原本取得失敗。欠落とは断定しません。引用時点の証拠は保持しています。"}</p>}
    {source.stale && <p role="alert">{source.fetchedAt === "未取得（未照合）" ? "根拠未照合：明示取得が必要です。" : "根拠未照合：原本の更新を検知しました。明示再取得が必要です。"}</p>}
    <button type="button" onClick={() => { setView(null); onRefresh(); }}>差分出典の保存原本を再取得</button>
    {snapshot && <>
      <p>差分ID：{snapshot.differenceId}　元引用ID：{snapshot.quote.quoteId}　登録式ID：{snapshot.quote.formulaId}</p>
      <p>元引用日時：{snapshot.quote.citedAt}。差分プレビュー準備日時：{snapshot.preparedAt}（保存完了・確認日時ではありません）。</p>
      <p>比較対象：同じメモID {snapshot.quote.memoId} 内の記録全体。初期選択ブロックID：{snapshot.quote.blockId}。別メモの名前や式から対応を推測しません。</p>
      {assessment.status === 'edited' && <p role="alert">本文が編集されています。以下の引用時点の比較は追跡情報内の両記録であり、編集後の文章そのものとの対応は保証できません。</p>}
      <div className="evidence-pair">{(['before', 'after'] as const).map(side => {
        const record = side === 'before' ? snapshot.quote.record : snapshot.after;
        const state = assessment[side];
        return <section key={side} aria-label={side === 'before' ? '比較元の出典' : '比較先の出典'}><h3>{side === 'before' ? '比較元（引用時点）' : '比較先（引用時点）'}</h3><p>メモID：{snapshot.quote.memoId}</p><RecordInfo record={record} />
          <p>確認日時：計算記録には記録なし。レポートの確認履歴とは別です。</p>
          <p role="status">現在の出典：{state?.reason ?? '確認不能'}</p>
          {!source.error && !source.stale && !links.some(link => link.memoId === snapshot.quote.memoId && link.recordId === record.id) && <p>現在の保存済み根拠リンクにはありません。引用時点の証拠は保持しています。自動再関連付けは行いません。</p>}
          <button type="button" disabled={!state?.record || !!source.error || !!source.stale} onClick={() => open(side)}>{side === 'before' ? '比較元の保存記録を開く' : '比較先の保存記録を開く'}</button>
        </section>;
      })}</div>
      <button type="button" onClick={() => open('historical')}>引用時点の比較を再確認</button>
      <button type="button" disabled={!canCurrent} onClick={() => open('current')}>現在の出典同士を比較</button>
      <p>現在の比較は明示操作だけで表示し、過去の差分・引用本文を置き換えません。変更の原因・説明の正誤は自動判定しません。</p>
    </>}
    {!snapshot && <p>検証できる追跡情報がありません。表示文やIDの見た目から出典を推測せず、本文を保持しています。</p>}
    {valid && snapshot && (view.kind === 'historical' || view.kind === 'current') && <Modal title={current ? '現在の出典の比較' : '引用時点の比較'} onClose={() => setView(null)} wide><section className="formula-report quote-tools saved-evidence" aria-label={current ? '現在の出典の比較差分' : '引用時点の比較差分'}>
      <p>{current ? '現在の取得時点の両出典です。引用時点の比較を上書きしません。' : '追跡情報に固定された両記録です。現在の出典の変更・欠落とは別です。'}</p>
      {assessment.status === 'edited' && <p>本文編集後の文章そのものを比較していません。</p>}
      {comparison ? <><h3>{current ? '現在の比較元' : '引用時点の比較元'}</h3><RecordInfo record={comparison.before} /><QuoteComparisonDetails comparison={comparison} memoId={snapshot.quote.memoId} initialBlockId={snapshot.quote.blockId} beforeLabel={current ? '現在の比較元' : '引用時点の比較元'} afterLabel={current ? '現在の比較先' : '引用時点の比較先'} /></> : <p role="alert">比較不能です。以前の差分で代用しません。</p>}
      <button type="button" onClick={() => setView(null)}>出典の比較を閉じる</button>
    </section></Modal>}
    {valid && (view.kind === 'before' || view.kind === 'after') && <Modal title="出典の保存記録詳細" onClose={() => setView(null)} wide><section className="formula-report quote-tools">
      <p>現在取得した保存原本です。引用時点の記録とは区別してください。取得日時：{source.fetchedAt}</p>
      {detail ? <><RecordInfo record={detail} />{detail.blocks.map((block, index) => <details key={block.blockId} open={block.blockId === snapshot?.quote.blockId}><summary>ブロックID：{block.blockId}</summary><BlockInfo block={block} executionOrder={index + 1} record={detail} /></details>)}</> : <p role="alert">出典を取得できません。別の記録で代用しません。</p>}
      <button type="button" onClick={() => setView(null)}>出典の詳細を閉じる</button>
    </section></Modal>}
    <button type="button" onClick={onClose}>出典確認を閉じる</button>
  </section></Modal>;
}
