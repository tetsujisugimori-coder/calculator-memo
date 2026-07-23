import type { Memo } from "./types";

export const MEMO_LABELS = {
  blocks: "計算メモ",
  single: "単独計算メモ",
} as const;

export function memoTypeLabel(type: Memo["type"]): typeof MEMO_LABELS[keyof typeof MEMO_LABELS] {
  return type === "plain-calculation" ? MEMO_LABELS.blocks : MEMO_LABELS.single;
}
