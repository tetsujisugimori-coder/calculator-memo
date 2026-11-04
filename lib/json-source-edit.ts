import { parseStrictJsonSource, type JsonSourceNode } from './restore-validation';

export type SourceEdit = { start: number; end: number; expected: string; replacement: string; keys: string[] };
export type PreservedRange = { beforeStart: number; afterStart: number; length: number };
export function sourceProperty(node: JsonSourceNode, key: string): JsonSourceNode | undefined {
  return node.kind === 'object' ? node.children.find(child => child.key === key) : undefined;
}
/** UTF-16 slices only. Every complement interval is checked independently against
 * the output. Strict syntax is checked before and after; this is not a serializer. */
export function applySourceEdits(raw: string, edits: readonly SourceEdit[]): { raw: string; preserved: PreservedRange[] } {
  parseStrictJsonSource(raw);
  const sorted = [...edits].sort((a, b) => a.start - b.start || a.end - b.end);
  let cursor = 0, output = '';
  const preserved: PreservedRange[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const edit = sorted[i];
    if (!Number.isSafeInteger(edit.start) || !Number.isSafeInteger(edit.end) || edit.start < cursor || edit.start < 0 || edit.end < edit.start || edit.end > raw.length || i > 0 && edit.start === sorted[i - 1].start || raw.slice(edit.start, edit.end) !== edit.expected) throw Error('変更区間の重複・範囲・元原文が不整合です。');
    preserved.push({ beforeStart: cursor, afterStart: output.length, length: edit.start - cursor });
    output += raw.slice(cursor, edit.start) + edit.replacement;
    cursor = edit.end;
  }
  preserved.push({ beforeStart: cursor, afterStart: output.length, length: raw.length - cursor });
  output += raw.slice(cursor);
  if (!verifyPreservedRanges(raw, output, preserved)) throw Error('非変更区間の原文保持を証明できません。');
  parseStrictJsonSource(output);
  return { raw: output, preserved };
}
export function verifyPreservedRanges(before: string, after: string, ranges: readonly PreservedRange[]): boolean {
  return ranges.every(range => range.length >= 0 && range.beforeStart >= 0 && range.afterStart >= 0 && range.beforeStart + range.length <= before.length && range.afterStart + range.length <= after.length && before.slice(range.beforeStart, range.beforeStart + range.length) === after.slice(range.afterStart, range.afterStart + range.length));
}
