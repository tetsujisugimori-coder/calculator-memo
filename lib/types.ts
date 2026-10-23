import type { EvidenceHistory } from './calculation-evidence';
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
  references?: { version: 1; entries: { slot: number; blockId: string }[] };
  evaluationState?: { version: 1; status: "stale" | "current"; signature?: string; attemptError?: string };
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
  calculationEvidence?: EvidenceHistory;
  calculationPolicy?: { version: 1; mode: "manual" };
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

export type FormulaReportEvidenceLink = { memoId: string; recordId: string };
export type FormulaReportConfirmation = {
  id: string;
  formulaId: string;
  confirmedAt: string;
  evidenceSignature: string;
  definition: { version: 1; expression: string; variables: string[] };
  title: string;
  body: string;
  links: FormulaReportEvidenceLink[];
};
export type FormulaReportEvidence = { version: 1; links: FormulaReportEvidenceLink[]; confirmations: FormulaReportConfirmation[] };

/** User-authored explanation, never numeric evidence or an automatically verified proof. */
export type FormulaReport = {
  id: string;
  formulaId: string;
  title: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  confirmedExpression: string | null;
  evidence?: FormulaReportEvidence;
};
export type FormulaReports = { version: 1; entries: FormulaReport[] };

export type StoredData = {
  formulaReports?: FormulaReports;
  formulaExecutions?: import("./formula-execution").ExecutionDraft[];
  formulaLibrary?: FormulaLibrary;
  version: 1;
  history: HistoryEntry[];
  notes: Memo[];
  settings: { theme: Theme; activePanel: Panel; identificationMode?: import("./identification").IdentificationMode };
};

export type NoteDraft = Omit<CalculationNote, "id" | "schemaVersion" | "type" | "createdAt" | "updatedAt">;
export type PlainNoteDraft = Pick<PlainCalculationNote, "title" | "content" | "blocks" | "calculationPolicy">;
