// Conservative source contract, not a JavaScript sandbox or proof against obfuscation.
import ts from 'typescript';
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

export const ADAPTER = 'lib/localstorage-adapter.ts';
export const FACADE = 'lib/storage-facade.ts';
export const PRODUCT_ROOTS = ['app/', 'components/', 'lib/', 'db/', 'worker/', 'github-pages/'];
export const EXCLUDED_ROOTS = ['tests/', 'e2e/', 'examples/', 'docs/maintenance/', 'scripts/', 'build/'];
const CONFIG = new Set(['drizzle.config.ts', 'eslint.config.mjs', 'next.config.ts', 'postcss.config.mjs', 'vite.config.ts', 'vite.pages.config.ts', 'vitest.config.ts', 'next-env.d.ts']);
const NATIVE_MUTATORS = new Set(['setItem', 'removeItem', 'clear']);
const ALTERNATE_APIS = new Set(['indexedDB', 'caches', 'cookieStore', 'openDatabase', 'IDBDatabase', 'IDBObjectStore', 'IDBTransaction', 'FileSystemFileHandle', 'FileSystemDirectoryHandle']);
const ALTERNATE_MEMBERS = new Set(['createWritable', 'getDirectory', 'getFileHandle', 'getDirectoryHandle', 'createSyncAccessHandle', 'writeFile', 'appendFile', 'unlink']);
const STORAGE_READ_MEMBERS = new Set(['getItem', 'key', 'length']);

export function classifySource(file) {
  if (PRODUCT_ROOTS.some(root => file.startsWith(root))) return 'product';
  if (EXCLUDED_ROOTS.some(root => file.startsWith(root)) || CONFIG.has(file)) return 'excluded';
  return 'unclassified';
}

/** Scan source strings so negative controls need not introduce bad files into a PR. */
export function scanWriterSources(sources) {
  const failures = [];
  const parsed = new Map(Object.entries(sources).map(([file, source]) => [file, ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, file.endsWith('tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS)]));
  const resolveSpec = (file, spec) => spec.startsWith('.') ? path.posix.normalize(path.posix.join(path.posix.dirname(file), spec)) : spec.startsWith('@/') ? path.posix.normalize(spec.slice(2)) : spec.startsWith('/') ? path.posix.normalize(spec).replace(/^\/+/, '') : spec;
  const resolveModule = (file, spec) => {
    const base = resolveSpec(file, spec);
    return [base, base + '.ts', base + '.tsx', base + '.js', base + '.mjs', base + '/index.ts'].find(candidate => parsed.has(candidate));
  };
  const resolveParameters = (file, name, seen = new Set()) => {
    const marker = file + ':' + name; if (seen.has(marker)) return undefined; seen.add(marker);
    const sf = parsed.get(file); if (!sf) return undefined;
    for (const node of sf.statements) {
      if (ts.isFunctionDeclaration(node) && (node.name?.text === name || name === 'default' && node.modifiers?.some(mod => mod.kind === ts.SyntaxKind.DefaultKeyword))) return node.parameters;
      if (ts.isVariableStatement(node)) for (const decl of node.declarationList.declarations) {
        if (ts.isIdentifier(decl.name) && decl.name.text === name && decl.initializer && (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer))) return decl.initializer.parameters;
      }
      if (ts.isImportDeclaration(node) && ts.isStringLiteralLike(node.moduleSpecifier)) {
        const target = resolveModule(file, node.moduleSpecifier.text);
        if (node.importClause?.name?.text === name) return target && resolveParameters(target, 'default', seen);
        const bindings = node.importClause?.namedBindings;
        if (bindings && ts.isNamedImports(bindings)) for (const element of bindings.elements) if (element.name.text === name) return target && resolveParameters(target, element.propertyName?.text || name, seen);
      }
      if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) {
        const target = resolveModule(file, node.moduleSpecifier.text);
        if (target && !node.exportClause) { const found = resolveParameters(target, name, seen); if (found) return found; }
        if (target && node.exportClause && ts.isNamedExports(node.exportClause)) for (const element of node.exportClause.elements) if (element.name.text === name) return resolveParameters(target, element.propertyName?.text || name, seen);
      }
    }
    return undefined;
  };
  // Conservatively share storage type aliases across the product graph. This
  // intentionally over-approximates same-name aliases instead of trusting an
  // unresolved imported type as a safe arbitrary object.
  const storageTypes = new Set(['Storage']);
  const storageType = node => {
    let found = false;
    const visit = n => {
      if (ts.isTypeReferenceNode(n) && storageTypes.has(ts.isIdentifier(n.typeName) ? n.typeName.text : n.typeName.right.text)) found = true;
      ts.forEachChild(n, visit);
    };
    if (node) visit(node);
    return found;
  };
  for (let pass = 0; pass <= parsed.size; pass++) {
    const before = storageTypes.size;
    for (const [file, sf] of parsed) if (classifySource(file) === 'product') {
      const visit = node => {
        if (ts.isTypeAliasDeclaration(node) && storageType(node.type)) storageTypes.add(node.name.text);
        if (ts.isImportSpecifier(node) && storageTypes.has(node.propertyName?.text || node.name.text)) storageTypes.add(node.name.text);
        if (ts.isExportSpecifier(node) && storageTypes.has(node.propertyName?.text || node.name.text)) storageTypes.add(node.name.text);
        ts.forEachChild(node, visit);
      };
      visit(sf);
    }
    if (before === storageTypes.size) break;
  }
  for (const file of Object.keys(sources)) {
    const classification = classifySource(file);
    if (classification === 'excluded') continue;
    if (classification === 'unclassified') { failures.push({ file, line: 1, rule: 'unclassified-source' }); continue; }
    const sf = parsed.get(file);
    const aliases = new Set(['localStorage', 'sessionStorage']);
    const constants = new Map();
    const localFunctions = new Map();
    const findFunctions = node => {
      if (ts.isFunctionDeclaration(node) && node.name) localFunctions.set(node.name.text, node.parameters);
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && (ts.isArrowFunction(node.initializer) || ts.isFunctionExpression(node.initializer))) localFunctions.set(node.name.text, node.initializer.parameters);
      ts.forEachChild(node, findFunctions);
    };
    findFunctions(sf);
    const report = (node, rule) => failures.push({ file, line: sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1, rule });
    const unwrap = node => {
      while (node && (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isTypeAssertionExpression(node) || ts.isNonNullExpression(node))) node = node.expression;
      return node;
    };
    const literal = node => {
      node = unwrap(node);
      if (!node) return undefined;
      if (ts.isStringLiteralLike(node)) return node.text;
      if (ts.isIdentifier(node)) return constants.get(node.text);
      if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
        const a = literal(node.left), b = literal(node.right);
        return a === undefined || b === undefined ? undefined : a + b;
      }
      return undefined;
    };
    const member = node => ts.isPropertyAccessExpression(node) ? node.name.text : ts.isElementAccessExpression(node) ? literal(node.argumentExpression) : undefined;
    const isStorage = node => {
      node = unwrap(node);
      if (!node) return false;
      if (ts.isIdentifier(node)) return aliases.has(node.text);
      if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) return ['localStorage', 'sessionStorage'].includes(member(node)) || isStorage(node.expression);
      if (ts.isConditionalExpression(node)) return isStorage(node.whenTrue) || isStorage(node.whenFalse);
      if (ts.isBinaryExpression(node) && [ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.BarBarToken].includes(node.operatorToken.kind)) return isStorage(node.left) || isStorage(node.right);
      if (ts.isCallExpression(node) && member(node.expression) === 'get' && ['localStorage', 'sessionStorage'].includes(literal(node.arguments[1]))) return true;
      return false;
    };
    // Resolve local aliases and computed string names to a fixed point, independent of order.
    for (let pass = 0; pass < 12; pass++) {
      const before = aliases.size + storageTypes.size + constants.size;
      const collect = node => {
        if (ts.isTypeAliasDeclaration(node) && storageType(node.type)) storageTypes.add(node.name.text);
        if ((ts.isVariableDeclaration(node) || ts.isParameter(node)) && ts.isIdentifier(node.name)) {
          if (storageType(node.type) || isStorage(node.initializer)) aliases.add(node.name.text);
          const value = literal(node.initializer); if (value !== undefined) constants.set(node.name.text, value);
        }
        if (ts.isVariableDeclaration(node) && ts.isObjectBindingPattern(node.name)) for (const element of node.name.elements) {
          const name = element.propertyName?.getText(sf) || element.name.getText(sf);
          if (['localStorage', 'sessionStorage'].includes(name) && ts.isIdentifier(element.name)) aliases.add(element.name.text);
        }
        if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isIdentifier(node.left) && isStorage(node.right)) aliases.add(node.left.text);
        if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
          const parameters = localFunctions.get(node.expression.text);
          if (parameters) node.arguments.forEach((argument, index) => {
            const parameter = parameters[index];
            if (isStorage(argument) && parameter && ts.isIdentifier(parameter.name)) aliases.add(parameter.name.text);
          });
        }
        ts.forEachChild(node, collect);
      };
      collect(sf);
      if (before === aliases.size + storageTypes.size + constants.size) break;
    }
    const checkImport = (node, spec) => {
      if (!spec) { report(node, 'dynamic-import-unresolved'); return; }
      const resolved = resolveSpec(file, spec);
      if (spec.startsWith('/@fs/')) report(node, 'product-imports-absolute-filesystem');
      if (/localstorage-adapter(?:\.[cm]?[jt]s)?$/.test(resolved) && file !== FACADE) report(node, 'adapter-import-outside-facade');
      if (EXCLUDED_ROOTS.some(root => resolved.startsWith(root))) report(node, 'product-imports-excluded-source');
      if (/^(?:node:)?(?:fs|fs\/promises)$/.test(spec) || /(?:sqlite|drizzle-orm|better-sqlite)/.test(spec) && file !== 'db/index.ts' && file !== 'db/schema.ts') report(node, 'alternate-persistence-import');
    };
    const walk = node => {
      if (node.kind === ts.SyntaxKind.AnyKeyword) report(node, 'unreviewed-type-erasure');
      if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
        if (node.moduleSpecifier) checkImport(node, literal(node.moduleSpecifier));
      }
      if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || ts.isIdentifier(node.expression) && node.expression.text === 'require')) checkImport(node, literal(node.arguments[0]));
      if (ts.isIdentifier(node) && ALTERNATE_APIS.has(node.text)) report(node, 'alternate-persistence-api');
      if (ts.isIdentifier(node) && node.text === 'getDb' && file !== 'db/index.ts') report(node, 'unconnected-database-import-or-call');
      if (ts.isPropertyAccessExpression(node) || ts.isElementAccessExpression(node)) {
        const key = member(node);
        if (NATIVE_MUTATORS.has(key) && file !== ADAPTER) report(node, 'native-storage-mutator');
        if (ALTERNATE_APIS.has(key) || ALTERNATE_MEMBERS.has(key)) report(node, 'alternate-persistence-member');
        if (['insert', 'update', 'execute', 'batch', 'prepare', 'delete'].includes(key) && /^(?:db|database|env\.DB)$/.test(node.expression.getText(sf))) report(node, 'database-mutation');
        if (isStorage(node.expression) && !STORAGE_READ_MEMBERS.has(key) && !(file === ADAPTER && NATIVE_MUTATORS.has(key))) report(node, 'storage-dynamic-or-unapproved-member');
      }
      if (ts.isBindingElement(node)) {
        const key = node.propertyName ? literal(node.propertyName) || node.propertyName.getText(sf) : node.name.getText(sf);
        if (NATIVE_MUTATORS.has(key) && file !== ADAPTER) report(node, 'destructured-storage-mutator');
      }
      if (ts.isBinaryExpression(node) && node.operatorToken.kind >= ts.SyntaxKind.FirstAssignment && node.operatorToken.kind <= ts.SyntaxKind.LastAssignment) {
        const lhs = unwrap(node.left);
        if ((ts.isPropertyAccessExpression(lhs) || ts.isElementAccessExpression(lhs)) && (isStorage(lhs.expression) || member(lhs) === 'cookie')) report(node, 'persistent-property-assignment');
        if ((ts.isPropertyAccessExpression(lhs) || ts.isElementAccessExpression(lhs)) && isStorage(node.right)) report(node, 'storage-reference-assignment');
      }
      if ((ts.isDeleteExpression(node) || (ts.isPostfixUnaryExpression(node) || ts.isPrefixUnaryExpression(node)) && [ts.SyntaxKind.PlusPlusToken, ts.SyntaxKind.MinusMinusToken].includes(node.operator)) && isStorage(node.expression || node.operand)) report(node, 'persistent-property-mutation');
      if (ts.isCallExpression(node)) {
        const name = member(node.expression);
        if (['glob', 'globEager'].includes(name) && ts.isPropertyAccessExpression(node.expression) && ts.isMetaProperty(node.expression.expression) && node.expression.expression.keywordToken === ts.SyntaxKind.ImportKeyword) report(node, 'dynamic-import-unresolved');
        if (['assign', 'set', 'defineProperty', 'defineProperties', 'deleteProperty'].includes(name) && node.arguments.some(isStorage)) report(node, 'reflective-storage-mutation');
        if (['get', 'getOwnPropertyDescriptor', 'getOwnPropertyDescriptors'].includes(name) && (node.arguments.some(isStorage) || node.arguments.some(argument => NATIVE_MUTATORS.has(literal(argument)) || ['localStorage', 'sessionStorage'].includes(literal(argument))))) report(node, 'reflective-storage-access');
        if (ts.isIdentifier(node.expression) && ['eval', 'Function'].includes(node.expression.text)) report(node, 'dynamic-code');
        if (node.arguments.some(isStorage) && file !== ADAPTER) {
          const parameters = ts.isIdentifier(node.expression) ? (localFunctions.get(node.expression.text) || resolveParameters(file, node.expression.text)) : undefined;
          node.arguments.forEach((argument, index) => {
            if (isStorage(argument) && !storageType(parameters?.[index]?.type)) report(node, 'untyped-or-unresolved-storage-argument');
          });
        }
      }
      if (file !== ADAPTER && file !== FACADE) {
        if (ts.isPropertyAssignment(node) && isStorage(node.initializer) || ts.isShorthandPropertyAssignment(node) && isStorage(node.name)) report(node, 'storage-object-escape');
        if (ts.isArrayLiteralExpression(node) && node.elements.some(isStorage)) report(node, 'storage-array-escape');
        if (ts.isReturnStatement(node) && isStorage(node.expression) || ts.isArrowFunction(node) && isStorage(node.body)) report(node, 'storage-return-escape');
        if (ts.isVariableStatement(node) && node.modifiers?.some(mod => mod.kind === ts.SyntaxKind.ExportKeyword) && node.declarationList.declarations.some(decl => isStorage(decl.initializer))) report(node, 'storage-export-escape');
        if (ts.isExportSpecifier(node) && isStorage(node.propertyName || node.name)) report(node, 'storage-export-escape');
        if (ts.isExportAssignment(node) && isStorage(node.expression)) report(node, 'storage-export-escape');
      }
      if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'Function') report(node, 'dynamic-code');
      ts.forEachChild(node, walk);
    };
    walk(sf);
  }
  return failures;
}

export function repositoryWriterBoundary(root = '.') {
  const files = execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: root, encoding: 'utf8' }).trim().split('\n').filter(file => /\.(?:[cm]?[jt]sx?)$/.test(file));
  const sources = Object.fromEntries(files.map(file => [file, readFileSync(path.join(root, file), 'utf8')]));
  return { files: files.length, productFiles: files.filter(file => classifySource(file) === 'product').length, failures: scanWriterSources(sources) };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = repositoryWriterBoundary(); console.log(JSON.stringify(result, null, 2));
  if (result.failures.length) process.exitCode = 1;
}
