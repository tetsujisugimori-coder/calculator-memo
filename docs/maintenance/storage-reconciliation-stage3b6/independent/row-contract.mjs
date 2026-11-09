// Exact normal-run contract. Startup probes deliberately fail this contract.
export const REQUIRED_CASES = Object.freeze([
  'independent native genesis',
  'R1 synchronous open failure',
  'R2 malformed retained checkpoint',
  'R3 missing receipt plus persistent UNKNOWN',
  'R3 corrupt journal plus valid capture gap',
  'observed change remains UNKNOWN',
  'close invalidates pending callback',
  'absent read creates no database',
]);
export const REQUIRED_CONDITIONS = Object.freeze(['chromium', 'webkit'].flatMap(engine => [375,390,765,1280].map(width => `${engine}:${width}`)));
function exactSet(actual, expected) {
  return Array.isArray(actual) && actual.length === expected.length &&
    new Set(actual).size === expected.length && actual.every(value => expected.includes(value));
}
export function validateCases(cases) {
  return Array.isArray(cases) && exactSet(cases.map(c => c?.name), REQUIRED_CASES) &&
    cases.every(c => c.status === 'GREEN');
}
export function validateRows(rows) {
  const issues = [];
  if (!Array.isArray(rows)) return ['rows must be an array'];
  if (!exactSet(rows.map(r => `${r?.engine}:${r?.width}`), REQUIRED_CONDITIONS)) issues.push('required engine/width set mismatch');
  for (const [index, row] of rows.entries()) {
    if (!row || !['chromium','webkit'].includes(row.engine) || ![375,390,765,1280].includes(row.width)) issues.push(`row ${index}: invalid condition`);
    if (!validateCases(row?.cases)) issues.push(`row ${index}: required GREEN case set mismatch`);
    if (row?.status !== 'passed' || row?.stage !== 'complete' || row?.error || row?.closeError || !Array.isArray(row?.errors) || row.errors.length) issues.push(`row ${index}: incomplete or failed execution`);
  }
  return issues;
}
