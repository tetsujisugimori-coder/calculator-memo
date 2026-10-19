import { assertVariableName, inspectFormulaDefinition, EXPRESSION_LIMITS } from "./calculator";
import { describeCalculationBlock } from "./memo-blocks";
export type IdentificationMode = "labels" | "color" | "none";
export function identificationMode(value: unknown): IdentificationMode | undefined {
  return value === "labels" || value === "color" || value === "none" ? value : undefined;
}
/** Presentation-only inspection: never binds values or evaluates an expression. */
export function inspectIdentification(expression: string, assignment = false): { variables: string[]; target?: string; error?: string } {
  try {
    if (expression.length > EXPRESSION_LIMITS.length) throw new Error("式は2000文字以内で入力してください");
    const statement = assignment ? describeCalculationBlock(expression) : { expression };
    if (statement.variableName) assertVariableName(statement.variableName);
    const variables = inspectFormulaDefinition(statement.expression);
    return { variables, ...(statement.variableName ? { target: statement.variableName } : {}) };
  } catch (cause) { return { variables: [], error: cause instanceof Error ? cause.message : "識別できません" }; }
}
