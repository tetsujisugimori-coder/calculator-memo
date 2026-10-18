import { assertVariableName, calculateExpression, calculateVariableExpression, EXPRESSION_LIMITS } from "./calculator";
import type { CalculationMemoBlock, MemoBlock, PlainCalculationNote } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isMemoBlock(value: unknown): value is MemoBlock {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.type !== "string") return false;
  if (value.type === "text") return typeof value.content === "string";
  if (value.type === "formula") return typeof value.latex === "string";
  if (value.type === "calculation") {
    return (value.evaluationMode === undefined || typeof value.evaluationMode === "string")
      && typeof value.expression === "string"
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

export function describeCalculationBlock(expression: string): { variableName?: string; expression: string } {
  const match = expression.match(/^\s*([A-Za-z][A-Za-z0-9_]*)\s*=([^=]*)$/);
  return match ? { variableName: match[1], expression: match[2].trim() } : { expression };
}

export function calculateMemoBlock(id: string, expression: string, evaluationMode?: string, scope = new Map<string, number>()): CalculationMemoBlock {
  const mode = evaluationMode === undefined ? {} : { evaluationMode };
  try {
    if (expression.length > EXPRESSION_LIMITS.length) throw new Error("式は2000文字以内で入力してください");
    if (evaluationMode !== undefined && evaluationMode !== "note-variables") throw new Error("未対応の計算モードです");
    const statement = evaluationMode === "note-variables" ? describeCalculationBlock(expression) : { expression };
    if (statement.variableName) assertVariableName(statement.variableName);
    const calculated = evaluationMode === "note-variables"
      ? calculateVariableExpression(statement.expression, scope)
      : calculateExpression(expression);
    // Commit only after all syntax, numerical and result limits succeeded.
    if (statement.variableName) scope.set(statement.variableName, calculated.value);
    return {
      ...mode,
      id,
      type: "calculation",
      expression,
      displayExpression: statement.variableName ? expression : calculated.displayExpression,
      result: calculated.value,
      resultText: calculated.resultText,
      error: null,
    };
  } catch (cause) {
    return {
      ...mode,
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
  const scope = new Map<string, number>();
  return blocks.map((block) => block.type === "calculation" ? calculateMemoBlock(block.id, block.expression, block.evaluationMode, scope) : { ...block });
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
