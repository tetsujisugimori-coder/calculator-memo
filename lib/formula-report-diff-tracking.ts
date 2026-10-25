import type { EvidenceRecord } from './calculation-evidence';
import { buildQuoteDifferenceMarkdown } from './formula-report-diff';
import { reportEvidenceLinkKey, resolveReportEvidence } from './formula-report-evidence';
import { validateDifferenceSnapshot, type DifferenceSnapshot, type QuoteSnapshot } from './formula-report-snapshots';
import { scanDifferenceEnvelopes, DIFFERENCE_START as START, DIFFERENCE_END as END } from './formula-report-diff-envelope';
export { validateDifferenceSnapshot, type DifferenceSnapshot } from './formula-report-snapshots';
import { parseMarkdownBlocks } from './markdown-blocks';
import type { Memo } from './types';

const HEADING = '引用時の計算記録と保存記録の差分';
const normalize = (text: string) => text.replace(/\r\n?/g, '\n');

/** The preparation timestamp is an observed UI event, not a source confirmation time. */
export type DifferenceSourceAssessment = { status: 'matched' | 'changed' | 'missing' | 'invalid' | 'unavailable' | 'stale'; reason: string; record?: EvidenceRecord };
export type DifferenceAssessment = {
  status: 'tracked' | 'edited' | 'invalid' | 'untracked'; reason: string; start: number; end: number;
  snapshot?: DifferenceSnapshot; before?: DifferenceSourceAssessment; after?: DifferenceSourceAssessment;
};

function syntheticMemo(memoId: string, record: EvidenceRecord): Memo {
  return { id: memoId, type: 'plain-calculation', title: '', content: '', createdAt: '', updatedAt: '', calculationEvidence: { version: 1, records: [record] } } as Memo;
}
/** The same formatter/comparison is used on creation and readback, never current values. */
export function rebuildDifferenceMarkdown(snapshot: DifferenceSnapshot): string {
  validateDifferenceSnapshot(snapshot);
  const link = { memoId: snapshot.quote.memoId, recordId: snapshot.after.id };
  return buildQuoteDifferenceMarkdown({ status: snapshot.quoteBodyEdited ? 'edited' : 'matched', reason: '', snapshot: snapshot.quote, start: 0, end: 0 }, snapshot.quote.formulaId,
    [syntheticMemo(snapshot.quote.memoId, snapshot.after)], [link], reportEvidenceLinkKey(link));
}
function fence(value: unknown, language: string): string {
  const json = JSON.stringify(value);
  const length = Math.max(3, ...Array.from(json.matchAll(/`+/g), match => match[0].length + 1));
  const marker = '`'.repeat(length);
  return `${marker}${language}\n${json}\n${marker}`;
}
function envelope(snapshot: DifferenceSnapshot): string {
  return `${fence({ version: 1, differenceId: snapshot.differenceId }, START)}\n\n${rebuildDifferenceMarkdown(snapshot)}\n\n${fence(snapshot, END)}`;
}
/** Receives observed identifiers/time from the caller. No clock, persistence or evaluator. */
export function createTrackedDifferenceMarkdown(markdown: string, quote: QuoteSnapshot, after: EvidenceRecord, differenceId: string, preparedAt: string): string {
  const snapshot: DifferenceSnapshot = structuredClone({ version: 1, differenceId, preparedAt, quote, after, quoteBodyEdited: false });
  if (normalize(markdown) !== normalize(rebuildDifferenceMarkdown(snapshot))) {
    snapshot.quoteBodyEdited = true;
    if (normalize(markdown) !== normalize(rebuildDifferenceMarkdown(snapshot))) throw new Error('差分本文と引用時の記録が一致しません。推測して追跡情報を付与しません。');
  }
  const result = envelope(snapshot);
  if (result.length > 100_000) throw new Error('差分追跡情報を含む本文が100,000文字を超えます。切り捨てず挿入を停止しました。');
  return result;
}

function assessSource(memoId: string, frozen: EvidenceRecord, notes: Memo[], availability: { error?: string; stale?: boolean; invalidData?: boolean }): DifferenceSourceAssessment {
  if (availability.invalidData) return { status: 'invalid', reason: '保存データが未知・不正な形式のため照合できません。原本は保持しています。' };
  if (availability.error) return { status: 'unavailable', reason: '原本取得失敗：出典を照合できません。欠落とは断定しません。' };
  if (availability.stale) return { status: 'stale', reason: '根拠未照合：原本の更新を検知しました。明示再取得が必要です。' };
  const current = resolveReportEvidence(notes, [{ memoId, recordId: frozen.id }])[0];
  if (current.status === 'missing') return { status: 'missing', reason: '出典の保存記録が欠落しています。引用時の証拠は保持しています。' };
  if (current.status !== 'available' || !current.record) return { status: 'invalid', reason: '出典が未知・不正な形式のため照合できません。' };
  return JSON.stringify(current.record) === JSON.stringify(frozen)
    ? { status: 'matched', reason: '取得時点の同一ID保存記録全体と一致。数学的証明・明示確認ではありません。', record: current.record }
    : { status: 'changed', reason: '出典の同一ID保存記録が変更されています。引用時の証拠と本文は更新しません。', record: current.record };
}

/** Structural fences bind each visible section to two validated snapshots. Text alone
 * is only an untracked warning, never a guessed source association or authentication.
 */
export function readDifferenceAssessments(body: string, formulaId: string, notes: Memo[], availability: { error?: string; stale?: boolean; invalidData?: boolean } = {}): DifferenceAssessment[] {
  if (body.length > 100_000) return [{ status: 'invalid', reason: '本文上限超過のため差分の照合を停止しています。本文は保持しています。', start: 0, end: body.length }];
  const blocks = parseMarkdownBlocks(body);
  const results: DifferenceAssessment[] = [];
  for (const range of scanDifferenceEnvelopes(body)) {
    const result: DifferenceAssessment = { status: range.status === 'untracked' ? 'untracked' : 'invalid', reason: range.reason, start: range.start, end: range.end };
    results.push(result);
    const snapshot = range.snapshot;
    if (!snapshot) continue;
    if (snapshot.quote.formulaId !== formulaId) { result.reason = '別の登録式IDの差分です。出典を対応付けできません。'; continue; }
    let expected: string | undefined;
    try { if (range.status !== 'orphan') expected = envelope(snapshot); }
    catch { result.reason = '引用時の比較を安全に再構成できません。追跡情報と本文は保持しています。'; continue; }
    result.snapshot = snapshot;
    result.before = assessSource(snapshot.quote.memoId, snapshot.quote.record, notes, availability);
    result.after = assessSource(snapshot.quote.memoId, snapshot.after, notes, availability);
    if (range.status === 'orphan') { result.status = 'edited'; result.reason = '差分の開始情報が欠落しています。追跡情報の記録は保持していますが、本文との対応は保証できません。'; continue; }
    const actual = normalize(body.slice(result.start, result.end));
    result.status = actual === normalize(expected!) ? 'tracked' : 'edited';
    result.reason = result.status === 'tracked' ? '引用時の差分本文と追跡情報が一致しています。現在の出典状態とは別の確認です。' : '差分本文または形式が編集されています。比較対象は追跡情報内の記録であり、編集後の文章ではありません。';
  }
  for (const block of blocks) {
    if (block.kind === 'heading' && block.level === 2 && block.text === HEADING && !results.some(result => block.start >= result.start && block.start < result.end)) {
      results.push({ status: 'untracked', reason: '追跡情報なし：旧形式または情報が削除された差分です。本文だけから出典を推測しません。', start: block.start, end: block.end });
    }
  }
  const counts = new Map<string, number>();
  for (const result of results) if (result.snapshot) counts.set(result.snapshot.differenceId, (counts.get(result.snapshot.differenceId) ?? 0) + 1);
  for (const result of results) if (result.snapshot && counts.get(result.snapshot.differenceId)! > 1) {
    result.status = 'invalid'; result.reason = '差分IDが重複しています。一意に対応付けできません。'; delete result.before; delete result.after; delete result.snapshot;
  }
  return results.sort((a, b) => a.start - b.start);
}
