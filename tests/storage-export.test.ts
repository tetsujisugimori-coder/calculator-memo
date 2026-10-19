import { describe, expect, it } from "vitest";
import { originalJsonBlob } from "../lib/storage-export";

describe("original JSON export", () => {
  it.each(["", "  {broken\r\n", '\uFEFF{ "未知": [1, null], "metadata": { "a": "日本語😀" } }\r\n'])("preserves captured raw UTF-8 bytes %j", async (raw) => {
    const blob = originalJsonBlob(raw);
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(new TextEncoder().encode(raw));
    expect(blob.type).toBe("application/json;charset=utf-8");
  });
  it("does not pretend a missing source is an empty file", () => {
    expect(() => originalJsonBlob(null)).toThrow("取得できていない");
  });
  it("refuses silent Unicode replacement", () => {
    expect(() => originalJsonBlob('{"raw":"\uD800"}')).toThrow("欠落なく");
  });
});
