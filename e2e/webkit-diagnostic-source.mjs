import ts from 'typescript';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

// Only named Node-side functions are instrumented. Nested browser callbacks,
// assertions, source fixture values, action order and timeout values stay intact.
export function diagnosticSource(original, observerUrl, focused, options = {}) {
  let source = original;
  const replaceOnce = (before, after) => {
    assert.equal(source.split(before).length, 2, 'Unambiguous diagnostic insertion: ' + before.slice(0, 100));
    source = source.replace(before, after);
  };
  replaceOnce('let activeScenarioRecord;', `let activeScenarioRecord;
const diag = diagnosticObserver(output, process.env.WK_FIXTURE ? JSON.parse(await readFile(process.env.WK_FIXTURE, 'utf8')) : null);
metadata.diagnosticOnly = true; metadata.diagnosticMode = ${JSON.stringify(focused ? 'focused-comparison' : 'full-prefix')};
diag.bind(() => ({ stage: metadata.stage, checks: metadata.checks.length, checkpoint: metadata.checks.at(-1), browserConnected: browser?.isConnected(), pageClosed: page?.isClosed(), url: page && !page.isClosed() ? page.url() : null }));`);
  replaceOnce('async function exerciseSavedRecordComparison(prefix) {\n  await stage(prefix + ": saved-record-comparison");\n  const original = await storage();',
    'async function exerciseSavedRecordComparison(prefix) {\n  await stage(prefix + ": saved-record-comparison");\n  const original = diag.fixture ?? await storage();\n  diag.captureFixture(original);\n  await diag.captureScreen(page);');
  replaceOnce('await context.tracing.stop(); // Keep pre-failure history while running; do not compress/export successful traces.',
    'await context.tracing.stop({ path: output + "/diagnostic-trace.zip" }); // Separate diagnostic retains successful trace.');
  if (focused) replaceOnce('  await exerciseHeader(prefix);', `
  await exerciseSavedRecordComparison(prefix);
  assert.deepEqual(browserErrors, [], 'Focused diagnostic browser errors');
  await context.tracing.stop({ path: output + '/diagnostic-trace.zip' });
  record.status = 'passed'; record.finishedAt = new Date().toISOString();
  await context.close(); context = null; page = null;
  return;
  await exerciseHeader(prefix);`);
  if (options.executablePath) replaceOnce('browser = await playwright[scenario.engine].launch();',
    `browser = await playwright[scenario.engine].launch({ executablePath: ${JSON.stringify(options.executablePath)} });`);
  if (options.tapFrames) replaceOnce('await locator.tap();',
    'await diag.beginTapFrames(locator);\n      try { await locator.tap(); } finally { await diag.endTapFrames(page); }');
  const tree = ts.createSourceFile('scenario.mjs', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const names = new Set(['exercise', 'exerciseSavedRecordComparison', 'activate', 'screenshot', 'assertHorizontalFit', 'stage', 'passed', 'storage']);
  const locations = [];
  const transformed = ts.transform(tree, [context => {
    const visitAwait = node => {
      if (ts.isFunctionLike(node)) return node; // Includes page.evaluate and expect.poll callbacks.
      if (ts.isAwaitExpression(node)) {
        const point = tree.getLineAndCharacterOfPosition(node.getStart(tree));
        const location = { line: point.line + 1, expression: node.expression.getText(tree).slice(0, 700) };
        locations.push(location);
        const expression = ts.visitEachChild(node.expression, visitAwait, context);
        return ts.factory.createAwaitExpression(ts.factory.createCallExpression(
          ts.factory.createPropertyAccessExpression(ts.factory.createIdentifier('diag'), 'awaited'), undefined,
          [ts.factory.createArrowFunction([ts.factory.createModifier(ts.SyntaxKind.AsyncKeyword)], undefined, [], undefined, ts.factory.createToken(ts.SyntaxKind.EqualsGreaterThanToken), expression),
            ts.factory.createStringLiteral(JSON.stringify(location))]));
      }
      return ts.visitEachChild(node, visitAwait, context);
    };
    return root => ts.visitEachChild(root, node => {
      if (ts.isFunctionDeclaration(node) && names.has(node.name?.text)) {
        return ts.factory.updateFunctionDeclaration(node, node.modifiers, node.asteriskToken, node.name, node.typeParameters,
          node.parameters, node.type, ts.visitEachChild(node.body, visitAwait, context));
      }
      return node;
    }, context);
  }]);
  const code = `import { observer as diagnosticObserver } from ${JSON.stringify(observerUrl)};\n` + ts.createPrinter().printFile(transformed.transformed[0]);
  transformed.dispose();
  return { code, locations, originalSha256: createHash('sha256').update(original).digest('hex'), derivedSha256: createHash('sha256').update(code).digest('hex') };
}
