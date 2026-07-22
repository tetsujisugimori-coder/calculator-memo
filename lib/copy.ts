import type { CalculationNote, HistoryEntry } from "./types";

export function historyText(item: HistoryEntry): string {
  return `${item.displayExpression} = ${item.resultText}`;
}

export function noteToPlainText(note: CalculationNote): string {
  const title = note.title || note.displayExpression;
  const lines = [title, `${note.displayExpression} = ${note.resultText}${note.unit}`];
  if (note.note) lines.push(`前提：${note.note}`);
  if (note.tags.length) lines.push(`タグ：${note.tags.join("、")}`);
  return lines.join("\n");
}

export function noteToMarkdown(note: CalculationNote): string {
  const title = note.title || note.displayExpression;
  const formula = note.displayMode === "katex" && note.latexExpression
    ? `$$\n${note.latexExpression}\n$$\n\n結果：**${note.resultText}${note.unit}**`
    : `${note.displayExpression} = **${note.resultText}${note.unit}**`;
  const noteText = note.note ? `\n\n> 前提：${note.note}` : "";
  return `### ${title}\n\n${formula}${noteText}`;
}

export function noteToJson(note: CalculationNote): string {
  return JSON.stringify(note, null, 2);
}
