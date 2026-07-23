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

export type TextMemoBlock = {
  id: string;
  type: "text";
  content: string;
};

export type FormulaMemoBlock = {
  id: string;
  type: "formula";
  latex: string;
};

export type CalculationMemoBlock = {
  id: string;
  type: "calculation";
  expression: string;
  displayExpression: string;
  result: number | null;
  resultText: string;
  error: string | null;
};

export type MemoBlock = TextMemoBlock | FormulaMemoBlock | CalculationMemoBlock;

export type PlainCalculationNote = {
  id: string;
  type: "plain-calculation";
  title: string;
  content: string;
  blocks?: MemoBlock[];
  createdAt: string;
  updatedAt: string;
};

export type Memo = CalculationNote | PlainCalculationNote;

export type Theme = "light" | "dark" | "system";
export type Panel = "history" | "notes";

export type StoredData = {
  version: 1;
  history: HistoryEntry[];
  notes: Memo[];
  settings: { theme: Theme; activePanel: Panel };
};

export type NoteDraft = Omit<CalculationNote, "id" | "schemaVersion" | "type" | "createdAt" | "updatedAt">;
export type PlainNoteDraft = Pick<PlainCalculationNote, "title" | "content" | "blocks">;
