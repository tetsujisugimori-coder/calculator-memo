import { describe, expect, it } from "vitest";
import { MEMO_LABELS, memoTypeLabel } from "../lib/memo-labels";

describe("memo display names", () => {
  it("treats the block type as the formal calculation memo", () => {
    expect(memoTypeLabel("plain-calculation")).toBe("計算メモ");
    expect(MEMO_LABELS.blocks).toBe("計算メモ");
  });

  it("keeps the legacy single-expression type under a clear display name", () => {
    expect(memoTypeLabel("calculation")).toBe("単独計算メモ");
    expect(MEMO_LABELS.single).toBe("単独計算メモ");
  });
});
