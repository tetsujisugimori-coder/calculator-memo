import { calculateExpression } from "./calculator";
import type { HistoryEntry } from "./types";

export function createHistoryEntry(expression: string, id: string, createdAt: string): HistoryEntry {
  const calculated = calculateExpression(expression);
  return {
    id,
    expression,
    displayExpression: calculated.displayExpression,
    result: calculated.value,
    resultText: calculated.resultText,
    createdAt,
  };
}
