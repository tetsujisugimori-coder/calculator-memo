import { calculateExpression } from "./calculator";
import type { CalculationMemoBlock, MemoBlock, PlainCalculationNote } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isMemoBlock(value: unknown): value is MemoBlock {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.type !== "string") return false;
  if (value.type === "text") return typeof value.content === "string";
  if (value.type === "formula") return typeof value.latex === "string";
  if (value.type === "calculation") {
    return typeof value.expression === "string"
      && typeof value.displayExpression === "string"
      && (value.result === null || typeof value.result === "number")
      && typeof value.resultText === "string"
      && (value.error === null || typeof value.error === "string");
  }
  return false;
}

export function sanitizeMemoBlocks(value: unknown): MemoBlock[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || !value.every(isMemoBlock)) return undefined;
  return value.map((block) => ({ ...block }));
}

export function calculateMemoBlock(id: string, expression: string): CalculationMemoBlock {
  try {
    const calculated = calculateExpression(expression);
    return {
      id,
      type: "calculation",
      expression,
      displayExpression: calculated.displayExpression,
      result: calculated.value,
      resultText: calculated.resultText,
      error: null,
    };
  } catch (cause) {
    return {
      id,
      type: "calculation",
      expression,
      displayExpression: expression,
      result: null,
      resultText: "",
      error: cause instanceof Error ? cause.message : "計算式を確認してください",
    };
  }
}

export function recalculateMemoBlocks(blocks: MemoBlock[]): MemoBlock[] {
  return blocks.map((block) => block.type === "calculation" ? calculateMemoBlock(block.id, block.expression) : { ...block });
}

export function resolveMemoBlocks(note: Pick<PlainCalculationNote, "id" | "content" | "blocks">): MemoBlock[] {
  if (note.blocks !== undefined) return note.blocks.map((block) => ({ ...block }));
  if (!note.content) return [];
  return [{ id: `legacy-text-${note.id}`, type: "text", content: note.content }];
}

export function blocksToMarkdown(blocks: MemoBlock[]): string {
  return blocks.map((block) => {
    if (block.type === "text") return block.content.trim();
    if (block.type === "formula") return `$$\n${block.latex}\n$$`;
    if (block.error) return `**計算**: \`${block.expression}\`\n\n> エラー: ${block.error}`;
    return `**計算**: \`${block.expression}\` = **${block.resultText}**`;
  }).filter(Boolean).join("\n\n");
}
