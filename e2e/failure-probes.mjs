// Explicit, isolated negative controls. Never modifies the checkout or app source.
// Build Pages and install Chromium first, then:
// node e2e/failure-probes.mjs /tmp/calculator-ci-failure-evidence
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, cp, symlink, readdir, rm } from 'node:fs/promises';
import { spawn, execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const destination = resolve(process.argv[2] || '/tmp/calculator-ci-failure-evidence');
await mkdir(destination, { recursive: true });
const source = await readFile(join(root, 'e2e/scenario.mjs'), 'utf8');
const outcomes = [];
for (const mode of ['gui-operation', 'screenshot', 'sha-mismatch']) {
  const cwd = await mkdtemp(join(tmpdir(), 'calculator-isolated-probe-'));
  let output = '';
  try {
    await mkdir(join(cwd, 'e2e'));
    await mkdir(join(cwd, 'github-pages')); 
    for (const name of await readdir(join(root, 'e2e'))) {
      if (name.endsWith('.mjs')) await cp(join(root, 'e2e', name), join(cwd, 'e2e', name));
    }
    await cp(join(root, 'dist-pages'), join(cwd, 'dist-pages'), { recursive: true });
    await cp(join(root, 'vite.pages.config.ts'), join(cwd, 'vite.pages.config.ts'));
    await cp(join(root, 'package.json'), join(cwd, 'package.json'));
    await symlink(join(root, 'node_modules'), join(cwd, 'node_modules'), 'dir');
    await symlink(join(root, 'e2e/node_modules'), join(cwd, 'e2e/node_modules'), 'dir');
    execFileSync('git', ['init', '-q'], { cwd });
    execFileSync('git', ['-c', 'user.name=CI failure probe', '-c', 'user.email=probe@example.invalid', 'commit', '--allow-empty', '-qm', 'isolated synthetic negative control'], { cwd });
    const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd, encoding: 'utf8' }).trim();
    await writeFile(join(cwd, 'dist-pages/__gui_provenance.json'), JSON.stringify({ sha, branch: 'isolated-negative-control', run: 'local-negative-control', attempt: '1' }) + '\n');
    let altered = source;
    if (mode === 'gui-operation') {
      const point = 'await exerciseHeader(prefix);';
      assert.equal(source.split(point).length, 2, 'GUI injection point must be unique');
      altered = source.replace(point, point + '\n  throw new Error("ISOLATED_GUI_OPERATION_FAILURE");');
    } else if (mode === 'screenshot') {
      // One-shot injection at capture, while catch/finally still use the real
      // browser's screenshot and trace APIs for failure diagnosis.
      const point = 'await page.screenshot(';
      assert.ok(source.includes(point), 'real screenshot capture must exist');
      altered = source.replace(point, 'await (async () => { throw new Error("ISOLATED_SCREENSHOT_FAILURE"); })(); await page.screenshot(');
    }
    await writeFile(join(cwd, 'e2e/scenario.mjs'), altered);
    const evidence = join(cwd, 'evidence');
    const exit = await new Promise((resolveExit, reject) => {
      const child = spawn(process.execPath, ['e2e/scenario.mjs'], {
        cwd, env: { ...process.env, CI: 'true', EXPECTED_SHA: mode === 'sha-mismatch' ? '0'.repeat(40) : sha,
          E2E_SCENARIO: 'chromium-desktop-1365px', GUI_PORT: '4289', GUI_EVIDENCE_DIR: evidence,
          PR_BRANCH: 'isolated-negative-control', GITHUB_RUN_ID: 'local-negative-control', GITHUB_RUN_ATTEMPT: '1' },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      child.stdout.on('data', data => { output += data; });
      child.stderr.on('data', data => { output += data; });
      child.on('error', reject);
      child.on('exit', (code, signal) => resolveExit({ code, signal }));
    });
    assert.equal(exit.code, 1, `${mode}: failure must propagate as exit 1; ${output.slice(-2000)}`);
    const report = JSON.parse(await readFile(join(evidence, 'provenance.json'), 'utf8'));
    assert.equal(report.status, 'failed');
    assert.equal(report.sha, sha);
    assert.match(report.failure.message, mode === 'sha-mismatch' ? /Checkout must equal PR head/ : new RegExp(mode === 'gui-operation' ? 'ISOLATED_GUI_OPERATION_FAILURE' : 'ISOLATED_SCREENSHOT_FAILURE'));
    const files = await readdir(evidence);
    if (mode !== 'sha-mismatch') {
      assert.ok(files.some(name => /failure.*\.png$/.test(name)), 'real failure screenshot must be retained');
      const traces = files.filter(name => /failure.*trace.*\.zip$/.test(name));
      assert.ok(traces.length, 'trace started before failure must be retained');
      // Parse the ZIP with Python's standard library: require browser operations
      // before the injected failure, not merely an empty diagnostic archive.
      const traceFacts = JSON.parse(execFileSync('python3', ['-c', `import json,sys,zipfile
with zipfile.ZipFile(sys.argv[1]) as z:
 events=[]
 for n in z.namelist():
  if n.endswith('.trace'):
   for line in z.read(n).decode().splitlines():
    try: events.append(json.loads(line))
    except ValueError: pass
 print(json.dumps({'events':len(events),'beforeActions':sum(e.get('type')=='before' for e in events),'snapshots':sum(e.get('type')=='frame-snapshot' for e in events)}))`, join(evidence, traces[0])], { encoding: 'utf8' }));
      assert.ok(traceFacts.beforeActions > 0, 'failure trace needs prior browser operations');
      assert.ok(traceFacts.snapshots > 0, 'failure trace needs prior DOM snapshots');
      report.probeTraceFacts = traceFacts;
    }
    const target = join(destination, mode);
    await mkdir(target, { recursive: true });
    await cp(evidence, target, { recursive: true });
    await writeFile(join(target, 'probe.log'), output);
    outcomes.push({ mode, exit, status: 'expected-failure-observed', sha, failure: report.failure, trace: report.probeTraceFacts || null });
  } catch (error) {
    const target = join(destination, mode);
    await mkdir(target, { recursive: true });
    await cp(join(cwd, 'evidence'), target, { recursive: true }).catch(() => {});
    await writeFile(join(target, 'probe.log'), output);
    await writeFile(join(target, 'probe-error.json'), JSON.stringify({ message: String(error), stack: error.stack }, null, 2) + '\n');
    throw error;
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
}
await writeFile(join(destination, 'negative-controls.json'), JSON.stringify({
  generatedAt: new Date().toISOString(), outcomes,
  limits: 'Local isolated real-Chromium controls. Does not intentionally fail the remote GitHub artifact service or certify GitHub runner orchestration.'
}, null, 2) + '\n');
console.log(`Verified ${outcomes.length} isolated negative controls; evidence: ${destination}`);
