export type DisplayMode = "plain" | "katex";

export type HistoryEntry = {
  formulaExecution?: { formulaId: string; title: string; expression: string; inputs: Record<string, string> };
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
  /** Missing means legacy; unknown string values must fail closed. */
  evaluationMode?: string;
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

export type RegisteredFormula = {
  id: string;
  title: string;
  expression: string;
  createdAt: string;
  updatedAt: string;
};
export type FormulaLibrary = { version: 1; entries: RegisteredFormula[]; selectedId: string | null };

export type StoredData = {
  formulaExecutions?: import("./formula-execution").ExecutionDraft[];
  formulaLibrary?: FormulaLibrary;
  version: 1;
  history: HistoryEntry[];
  notes: Memo[];
  settings: { theme: Theme; activePanel: Panel; identificationMode?: import("./identification").IdentificationMode };
};

export type NoteDraft = Omit<CalculationNote, "id" | "schemaVersion" | "type" | "createdAt" | "updatedAt">;
export type PlainNoteDraft = Pick<PlainCalculationNote, "title" | "content" | "blocks">;
