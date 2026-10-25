import { parseMarkdownBlocks, type MarkdownBlock } from './markdown-blocks';
import { validateDifferenceSnapshot, type DifferenceSnapshot } from './formula-report-snapshots';

const PREFIX = 'calculator-memo-difference';
export const DIFFERENCE_START = `${PREFIX}-start-v1`;
export const DIFFERENCE_END = `${PREFIX}-v1`;
type Envelope = { start: number; end: number; closed: boolean; status: 'complete' | 'orphan' | 'invalid' | 'untracked'; reason: string; snapshot?: DifferenceSnapshot };
const invalid = '差分の開始・終了情報が未知・不正・重複または対応不明です。推測せず本文を保持しています。';

/** The renderer's source ranges exclude the final newline. An EOF code block
 * without its actual closing fence must never count as a complete marker. */
function closedCode(body: string, block: MarkdownBlock): boolean {
  const lines = body.slice(block.start, block.end).replace(/\r\n?/g, '\n').split('\n');
  if (lines.length < 2) return false;
  const opening = lines[0].match(/^ {0,3}(`{3,}|~{3,})/);
  const closing = lines.at(-1)!.match(/^ {0,3}(`+|~+)[ \t]*$/);
  return !!opening && !!closing && opening[1][0] === closing[1][0] && closing[1].length >= opening[1].length;
}

/** One structural contract for insertion and audit. Only exact, closed v1
 * markers with validated payloads and the same ID close an envelope. Once a
 * reserved unknown/corrupt/nested marker makes pairing ambiguous, retain the
 * original start through EOF; a later plausible marker cannot repair it.
 * This does not search raw strings inside ordinary code/math blocks. */
export function scanDifferenceEnvelopes(body: string): Envelope[] {
  const results: Envelope[] = [];
  let pending: { start: number; id?: string; poisoned: boolean } | undefined;
  for (const block of parseMarkdownBlocks(body)) {
    if (block.kind !== 'code' || !block.language.startsWith(PREFIX)) continue;
    if (pending?.poisoned) continue;
    if (block.language === DIFFERENCE_END && closedCode(body, block)) {
      try {
        const snapshot: unknown = JSON.parse(block.text);
        validateDifferenceSnapshot(snapshot);
        if (!pending || pending.id === snapshot.differenceId) {
          results.push({ start: pending?.start ?? block.start, end: block.end, closed: true, status: pending ? 'complete' : 'orphan', reason: '', snapshot });
          pending = undefined;
          continue;
        }
      } catch { /* A malformed end cannot close or repair an envelope. */ }
    }
    if (!pending && block.language === DIFFERENCE_START && closedCode(body, block)) {
      try {
        const value: unknown = JSON.parse(block.text);
        if (value && typeof value === 'object' && !Array.isArray(value)) {
          const marker = value as Record<string, unknown>;
          if (Object.keys(marker).length === 2 && Object.keys(marker).every(key => ['version', 'differenceId'].includes(key))
            && marker.version === 1 && typeof marker.differenceId === 'string' && !!marker.differenceId.trim() && marker.differenceId.length <= 120) {
            pending = { start: block.start, id: marker.differenceId, poisoned: false };
            continue;
          }
        }
      } catch { /* Preserve unknown/malformed payloads without inferred IDs. */ }
    }
    pending = { start: pending?.start ?? block.start, poisoned: true };
  }
  if (pending) results.push({ start: pending.start, end: body.length, closed: false, status: pending.poisoned ? 'invalid' : 'untracked', reason: pending.poisoned ? invalid : '差分追跡情報が欠落しています。開始IDだけでは引用時の出典を検証できません。' });
  return results;
}
