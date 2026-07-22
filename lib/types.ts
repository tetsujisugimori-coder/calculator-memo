export type DisplayMode = "plain" | "katex";

export type HistoryEntry = {
  id: string;
  expression: string;
  displayExpression: string;
  result: number;
  resultText: string;
  createdAt: string;
};

export type CalculationNote = {
  id: string;
  schemaVersion: 1;
  type: "calculation";
  title: string;
  expression: string;
  displayExpression: string;
  latexExpression: string | null;
  result: number;
  resultText: string;
  unit: string;
  note: string;
  tags: string[];
  relatedMemoName: string;
  displayMode: DisplayMode;
  createdAt: string;
  updatedAt: string;
};

export type Theme = "light" | "dark" | "system";
export type Panel = "history" | "notes";

export type StoredData = {
  version: 1;
  history: HistoryEntry[];
  notes: CalculationNote[];
  settings: { theme: Theme; activePanel: Panel };
};

export type NoteDraft = Omit<CalculationNote, "id" | "schemaVersion" | "type" | "createdAt" | "updatedAt">;
