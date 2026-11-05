// Synthetic data only. Oracles are fixed independently from product serialization.
export const key = 'calculation-memo:data', recoveryPrefix = 'calculation-memo:restore-recovery:v1:';
export const at = '2026-11-05T00:00:00.000Z';
const fixture = { version: 1, history: [], notes: [], settings: { theme: 'light', activePanel: 'history' } };
export const source = JSON.stringify(fixture);
export const protectedRaw = JSON.stringify({ ...fixture, version: 999, opaque: 'Synthetic protected original 😀' });
export const target = ' \n' + JSON.stringify({ ...fixture,
  history: [{ id: 'restored-history', expression: '3+4', displayExpression: '3 + 4', result: 7, resultText: '7', createdAt: at }],
  notes: [{ id: 'restored-note', type: 'plain-calculation', title: 'Facade restored memo', content: 'Exact original 😀', createdAt: at, updatedAt: at }],
}, null, 2).replace(/\n}$/, ',\n "futureNumber":900719925474099312345\n}') + '\t';
export const recoveryRecord = JSON.stringify({ format: 'calculator-memo-recovery', version: 1, createdAt: at, sourceKey: key, raw: source, utf16CodeUnits: source.length });
export function backup(raw) {
  const value = JSON.parse(raw);
  return JSON.stringify({ format: 'calculator-memo-backup', formatVersion: 1, appStorageVersion: 1, acquisition: 'captured', createdAt: at, acquiredAt: at,
    entries: [{ key, raw, utf16CodeUnits: raw.length, validation: 'ok', counts: { history: value.history.length, notes: value.notes.length, formulas: value.formulaLibrary?.entries.length ?? 0, reports: value.formulaReports?.entries.length ?? 0, executions: value.formulaExecutions?.length ?? 0 } }] });
}
