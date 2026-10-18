// Run from repo root: node scripts/benchmark-ast.mjs [baseline Git ref]
// Comparison/measurement only: no app data, network or production mutation.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import ts from 'typescript';
import { ConstantNode, OperatorNode, ParenthesisNode, FunctionNode, SymbolNode } from 'mathjs';

const baseline = process.argv[2] ?? '6f835985e7e53d2f58c89d15bac04352b3bbc5bd';
const baselineSha = execFileSync('git', ['rev-parse', '--verify', `${baseline}^{commit}`], { encoding: 'utf8' }).trim();
const beforeSource = execFileSync('git', ['show', `${baselineSha}:lib/calculator.ts`], { encoding: 'utf8' });
const afterSource = readFileSync('lib/calculator.ts', 'utf8');
const directory = mkdtempSync(resolve('.ast-measure-'));
const transpile = (source) => ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText.replaceAll('"./format"', '"./format.mjs"');
let executions = 0;
const restored = [];
try {
  for (const [name, source] of [['before', beforeSource], ['after', afterSource], ['format', readFileSync('lib/format.ts', 'utf8')]]) {
    writeFileSync(join(directory, `${name}.mjs`), transpile(source));
  }
  const before = (await import(pathToFileURL(join(directory, 'before.mjs')))).calculateExpression;
  const after = (await import(pathToFileURL(join(directory, 'after.mjs')))).calculateExpression;
  const outcome = (calculate, expression) => {
    try { return { result: calculate(expression) }; }
    catch (error) { return { error: error.message }; }
  };
  const expressions = [];
  // Fixed 1000 legacy expressions, including simple percent and implicit products.
  for (let i = 0; i < 1000; i++) {
    const a = i % 97 + 1, b = i % 23 + 1, c = i % 11 + 1;
    expressions.push([`${a}+${b}*${c}`, `(${a}-${b})/${c}`, `${a}*(${b}%+${c}%)`, `${a}(${b}+${c})`, `-(${a}/${b})+${c}.5`][i % 5]);
  }
  const legacyCount = expressions.length;
  for (let i = 0; i < 1000; i++) {
    const a = i % 21 - 10, b = i % 7 + 1;
    expressions.push([`abs(${a})+sqrt(${b})`, `(${a})^${b}`, `${a}*pi+e^2`, `sqrt(abs(${a}^3))+${b}`, `2^(-${b})+${a}`][i % 5]);
  }
  expressions.push('-0', 'sqrt(-0)', '(-0)^3', 'abs(-0)', '0^0', '1^10000', '1^10001', '1^(-10000)', '1^(-10001)', '2^-1074', '2^1024', 'sqrt(-1)', '(-1)^0.5', '0^-1', '1/0+sqrt()', 'sqrt(-1)+pi(2)', '1/0+2pi', '1/0+1^10001', '1^10001+1/0', 'sqrt(-1)+1/0', '1/0+sqrt(-1)', '9007199254740992-9007199254740992', '9007199254740992', '((1+2))%', '.5%', 'sqrt(100)%', '1e-7', '2pi', 'sqrt(1,2)');
  for (const expression of expressions) {
    const old = outcome(before, expression), current = outcome(after, expression);
    if (old.error !== current.error || Boolean(old.result) !== Boolean(current.result) || (old.result && (!Object.is(old.result.value, current.result.value) || old.result.resultText !== current.result.resultText || old.result.displayExpression !== current.result.displayExpression))) {
      throw new Error(`Compatibility difference: ${JSON.stringify({ expression, old, current })}`);
    }
  }
  const samples = [
    { name: 'simple', expression: '1+2*3' },
    { name: '31-term sum', expression: Array(31).fill('1').join('+') },
    { name: '31 parentheses', expression: '('.repeat(31)+'1'+')'.repeat(31) },
    { name: '15 square roots', expression: 'sqrt('.repeat(15)+'4'+')'.repeat(15) },
    { name: 'mixed mathematics', expression: 'sqrt(3^2+4^2)+abs(-2)+2*pi' },
  ];
  const median = values => values.sort((a,b) => a-b)[Math.floor(values.length/2)];
  const timings = samples.map(sample => {
    for (let i=0; i<100; i++) { before(sample.expression); after(sample.expression); }
    const old = [], current = [];
    const measure = calculate => { const start = performance.now(); for (let i=0; i<200; i++) calculate(sample.expression); return (performance.now()-start)/200; };
    for (let i=0; i<7; i++) {
      // Alternate order to reduce warmup/order bias. Not a CI timing threshold.
      if (i%2) { current.push(measure(after)); old.push(measure(before)); }
      else { old.push(measure(before)); current.push(measure(after)); }
    }
    return { ...sample, beforeMedianMs: median(old), afterMedianMs: median(current) };
  });
  // Count actual legacy compiled-node function executions, rather than infer
  // them from tree shape. Restore prototypes before leaving this process.
  for (const Type of [ConstantNode, OperatorNode, ParenthesisNode, FunctionNode, SymbolNode]) {
    const original = Type.prototype._compile;
    restored.push(() => { Type.prototype._compile = original; });
    Type.prototype._compile = function (...args) {
      const evaluate = original.apply(this, args);
      return (...values) => { executions++; return evaluate(...values); };
    };
  }
  // Temporary instrumentation at the single completed-node boundary; fail
  // closed if future source changes move/remove that exact boundary.
  const boundary = 'values.set(node, raw);';
  if (afterSource.split(boundary).length !== 2) throw new Error('Update measurement for changed node boundary');
  const key = '__calculator_ast_measure_count';
  writeFileSync(join(directory, 'counted.mjs'), transpile(afterSource.replace(boundary, `${boundary}\nglobalThis.${key}++;`)));
  const counted = (await import(pathToFileURL(join(directory, 'counted.mjs')))).calculateExpression;
  const counts = samples.map(sample => {
    executions = 0; before(sample.expression); const beforeNodeExecutions = executions;
    executions = 0; globalThis[key] = 0; counted(sample.expression);
    if (executions !== 0) throw new Error('New evaluator compiled/re-evaluated a subtree');
    return { name: sample.name, beforeNodeExecutions, afterNodeExecutions: globalThis[key] };
  });
  delete globalThis[key];
  console.log(JSON.stringify({ baselineSha, currentHead: execFileSync('git', ['rev-parse','HEAD'], {encoding:'utf8'}).trim(), workingTreeDiff: execFileSync('git', ['diff','--stat'], {encoding:'utf8'}).trim(), node: process.version, platform: process.platform, checkedAt: new Date().toISOString(), legacyExpressions: legacyCount, totalExpressions: expressions.length, differences: 0, comparison: 'Object.is numeric values (including signed zero), exact formatted/display strings and error messages', timings, counts, method: 'End-to-end parse+validate+evaluate+format, 100 warmups, 7 alternating samples of 200 iterations; no performance guarantee or threshold; instrumentation only in separate count pass' }, null, 2));
} finally {
  for (const restore of restored) restore();
  rmSync(directory, { recursive: true, force: true });
}
