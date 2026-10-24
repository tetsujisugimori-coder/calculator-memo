import type { EvidenceRecord } from './calculation-evidence';
import { buildQuoteDifferenceMarkdown } from './formula-report-diff';
import { reportEvidenceLinkKey, resolveReportEvidence } from './formula-report-evidence';
import { validateQuoteSnapshot, type QuoteSnapshot } from './formula-report-quotes';
import { parseMarkdownBlocks } from './markdown-blocks';
import type { Memo } from './types';

const PREFIX = 'calculator-memo-difference';
const START = `${PREFIX}-start-v1`;
const END = `${PREFIX}-v1`;
const HEADING = '引用時の計算記録と保存記録の差分';
const normalize = (text: string) => text.replace(/\r\n?/g, '\n');
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const id = (value: unknown): value is string => typeof value === 'string' && !!value.trim() && value.length <= 120;
const timestamp = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value));
const exact = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).length === keys.length && Object.keys(value).every(key => keys.includes(key));

/** The preparation timestamp is an observed UI event, not a source confirmation time. */
export type DifferenceSnapshot = { version: 1; differenceId: string; preparedAt: string; quote: QuoteSnapshot; after: EvidenceRecord; quoteBodyEdited: boolean };
export type DifferenceSourceAssessment = { status: 'matched' | 'changed' | 'missing' | 'invalid' | 'unavailable' | 'stale'; reason: string; record?: EvidenceRecord };
export type DifferenceAssessment = {
  status: 'tracked' | 'edited' | 'invalid' | 'untracked'; reason: string; start: number; end: number;
  snapshot?: DifferenceSnapshot; before?: DifferenceSourceAssessment; after?: DifferenceSourceAssessment;
};

function syntheticMemo(memoId: string, record: EvidenceRecord): Memo {
  return { id: memoId, type: 'plain-calculation', title: '', content: '', createdAt: '', updatedAt: '', calculationEvidence: { version: 1, records: [record] } } as Memo;
}
export function validateDifferenceSnapshot(value: unknown): asserts value is DifferenceSnapshot {
  if (!object(value) || !exact(value, ['version', 'differenceId', 'preparedAt', 'quote', 'after', 'quoteBodyEdited']) || value.version !== 1
    || !id(value.differenceId) || !timestamp(value.preparedAt) || typeof value.quoteBodyEdited !== 'boolean') throw new Error('未対応または不正な差分追跡情報です。本文は保持しています。');
  validateQuoteSnapshot(value.quote);
  const after = value.after as EvidenceRecord;
  const source = resolveReportEvidence([syntheticMemo(value.quote.memoId, after)], [{ memoId: value.quote.memoId, recordId: object(after) && typeof after.id === 'string' ? after.id : '' }])[0];
  if (source.status !== 'available' || !source.record || !id(source.record.id) || source.record.id === value.quote.record.id) throw new Error('比較先の引用時保存記録を検証できません。本文は保持しています。');
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
  let pending: { index: number; differenceId?: string; valid: boolean } | undefined;
  for (let index = 0; index < blocks.length; index++) {
    const block = blocks[index];
    if (block.kind !== 'code' || !block.language.startsWith(PREFIX)) continue;
    if (block.language.startsWith(`${PREFIX}-start`)) {
      const nested = !!pending;
      if (pending) results.push({ status: 'invalid', reason: '差分の開始情報が重複・入れ子になっています。対応付けできません。', start: blocks[pending.index].start, end: block.start });
      pending = { index, valid: false };
      try {
        const marker: unknown = JSON.parse(block.text);
        if (object(marker) && exact(marker, ['version', 'differenceId']) && marker.version === 1 && id(marker.differenceId)) pending = { index, differenceId: marker.differenceId, valid: block.language === START && !nested };
      } catch { /* Preserve malformed markers. */ }
      continue;
    }
    const result: DifferenceAssessment = { status: 'invalid', reason: '未対応または不正な差分追跡情報です。本文は保持しています。', start: pending ? blocks[pending.index].start : block.start, end: block.end };
    results.push(result);
    const opening = pending;
    pending = undefined;
    try {
      if (block.language !== END) continue;
      const snapshot: unknown = JSON.parse(block.text);
      validateDifferenceSnapshot(snapshot);
      if (snapshot.quote.formulaId !== formulaId) { result.reason = '別の登録式IDの差分です。出典を対応付けできません。'; continue; }
      if (opening && (!opening.valid || opening.differenceId !== snapshot.differenceId)) { result.reason = '差分IDまたは開始形式が一致しません。出典を対応付けできません。'; continue; }
      result.snapshot = snapshot;
      result.before = assessSource(snapshot.quote.memoId, snapshot.quote.record, notes, availability);
      result.after = assessSource(snapshot.quote.memoId, snapshot.after, notes, availability);
      if (!opening) { result.status = 'edited'; result.reason = '差分の開始情報が欠落しています。追跡情報の記録は保持していますが、本文との対応は保証できません。'; continue; }
      const actual = normalize(body.slice(result.start, result.end));
      result.status = actual === normalize(envelope(snapshot)) ? 'tracked' : 'edited';
      result.reason = result.status === 'tracked' ? '引用時の差分本文と追跡情報が一致しています。現在の出典状態とは別の確認です。' : '差分本文または形式が編集されています。比較対象は追跡情報内の記録であり、編集後の文章ではありません。';
    } catch { /* No repairs, inferred records, or current-value replacement. */ }
  }
  if (pending) results.push({ status: pending.valid ? 'untracked' : 'invalid', reason: pending.valid ? '差分追跡情報が欠落しています。開始IDだけでは引用時の出典を検証できません。' : '差分開始情報が未知・不正な形式です。推測せず本文を保持しています。', start: blocks[pending.index].start, end: body.length });
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
