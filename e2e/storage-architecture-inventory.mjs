// Evidence index, not a proof of call-graph completeness. See manually traced table.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
const base = '120a265f539c0e6762f9eae6eedb52d8b922fbf6';
const paths = execFileSync('git', ['ls-tree', '-r', '--name-only', base], { encoding: 'utf8' }).trim().split('\n');
const expression = /setItem|removeItem|\.clear\(|localStorage|sessionStorage|indexedDB|caches\.|document\.cookie|createWritable|navigator\.storage|\.insert\(|\.update\(|\.delete\(|getDb\(|saveData|resetStoredData|restoreRaw|preserveRestoreSource|deleteRecoveryCopy|withStorageWriteLock|setData\(/;
const files = [];
for (const path of paths.filter(p => /\.(?:ts|tsx|js|mjs|json|yml|yaml)$/.test(p) && !p.endsWith('lock.json'))) {
  const bytes = readFileSync(path), source = bytes.toString('utf8');
  const hits = source.split(/\r?\n/).flatMap((line, i) => expression.test(line) ? [{ line: i + 1, source: line.trim() }] : []);
  if (hits.length) files.push({ path, classification: /^(tests|e2e)\//.test(path) ? 'TEST_ONLY'
    : /^examples\//.test(path) ? 'OPT_IN_EXAMPLE' : /^(app|components|lib|db|worker)\//.test(path) ? 'PRODUCT_CANDIDATE' : 'TOOLING',
    sha256: createHash('sha256').update(execFileSync('git', ['show', `${base}:${path}`])).digest('hex'), hits });
}
const target = 'docs/maintenance/storage-architecture-20261105';
mkdirSync(target, { recursive: true });
writeFileSync(`${target}/source-inventory.json`, JSON.stringify({ base, hashDomain: 'canonical git blob bytes at base (not platform checkout line endings)', trackedBaseFiles: paths.length,
  scope: 'all tracked source/config candidates; textual index supplemented by manual imports/callback/effect tracing', files }, null, 2) + '\n');
console.log(JSON.stringify({ base, trackedBaseFiles: paths.length, matchedFiles: files.length, productCandidates: files.filter(f => f.classification === 'PRODUCT_CANDIDATE').map(f => f.path) }));
