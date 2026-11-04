import { generateRestorePlan, PLAN_RULE_VERSION } from '../../lib/selective-restore-plan';
import { parseSelectionBackup, parseSelectionCurrent } from '../../lib/selection-preview';
import { SAFETY_RULE_VERSION, generateSafetyCandidate, type SafetyContext } from '../../lib/selective-restore-safety';
export const at = '2026-11-02T00:00:00.000Z';
export const base = { version: 1, history: [], notes: [], settings: { theme: 'light', activePanel: 'history' } };
export const history = (id: string, result = 2) => ({ id, expression: '1+1', displayExpression: '1+1', result, resultText: String(result), createdAt: at });
export const note = (id = 'n') => ({ id, type: 'plain-calculation', title: 'memo', content: 'unexecuted \\frac{a}{b}', createdAt: at, updatedAt: at });
export const formula = (id = 'f') => ({ id, title: 'formula', expression: 'x+1', createdAt: at, updatedAt: at });
export const report = (id = 'r', formulaId = 'f') => ({ id, formulaId, title: 'report', body: 'preserved', createdAt: at, updatedAt: at, confirmedExpression: null });
export const evidence = { id: 'e', evaluator: 'calculator-memo-v1', status: 'confirmed', calculatedAt: at, persistedAt: at, blocks: [{ blockId: 'b', position: 1, expression: '2', inputs: [], result: '2', resultText: '2', status: 'success' }] };
export const noteEvidence = (id = 'n') => ({ ...note(id), calculationEvidence: { version: 1, records: [evidence] } });
export function wrap(raw: string): string {
  const d = JSON.parse(raw);
  return JSON.stringify({ format: 'calculator-memo-backup', formatVersion: 1, appStorageVersion: 1, acquisition: 'captured', createdAt: at, acquiredAt: at, entries: [{ key: 'calculation-memo:data', raw, utf16CodeUnits: raw.length, validation: 'ok', counts: { history: d.history.length, notes: d.notes.length, formulas: d.formulaLibrary?.entries.length ?? 0, reports: d.formulaReports?.entries.length ?? 0, executions: d.formulaExecutions?.length ?? 0 } }] });
}
export function setup(data: unknown = { ...base, history: [history('new')] }, currentRaw = JSON.stringify(base), selectedKeys = ['history:0'], backupRaw = JSON.stringify(data)) {
  const context: SafetyContext = { backupText: wrap(backupRaw), backupIdentity: 'file-request-1', currentRaw, selectedKeys, generation: 2, epoch: 4, planRuleVersion: PLAN_RULE_VERSION, safetyRuleVersion: SAFETY_RULE_VERSION, unsaved: false };
  const b = parseSelectionBackup(context.backupText), c = parseSelectionCurrent(currentRaw);
  if (!b.ok || !c.ok) throw Error('fixture parse failed');
  const plan = generateRestorePlan({ backup: b.preview, current: c.preview, selectedKeys });
  return { context, plan, candidate: () => generateSafetyCandidate(context, plan) };
}
