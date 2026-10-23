// CI control-plane contracts, separate from application test counts.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile, mkdtemp, mkdir, writeFile, rm, cp } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const workflow = await readFile(join(root, '.github/workflows/verify-pr-gui.yml'), 'utf8');
function stepWithId(id) {
  const steps = workflow.split(/\n      - name: /).slice(1);
  const step = steps.find(value => new RegExp(`^        id: ${id}$`, 'm').test(value));
  assert.ok(step, `workflow step ${id} must exist`);
  return step;
}
function runFor(id) {
  const step = stepWithId(id);
  const match = step.match(/^        run: (.*)$/m);
  assert.ok(match, `${id} must use an inspectable run command`);
  if (match[1] !== '|') return match[1];
  const after = step.slice(match.index + match[0].length + 1);
  const lines = [];
  for (const line of after.split('\n')) {
    if (line && !line.startsWith('          ')) break;
    lines.push(line.slice(10));
  }
  return lines.join('\n');
}

async function prepareStageWrapper(cwd) {
  await mkdir(join(cwd, 'e2e'));
  await cp(join(root, 'e2e/run-stage.mjs'), join(cwd, 'e2e/run-stage.mjs'));
}
function executableRun(id) {
  // The real wrapper runs under real Node; only its spawned stage command is
  // replaced by the isolated fault fixture.
  return runFor(id).replace(/^node e2e\/run-stage\.mjs/, JSON.stringify(process.execPath) + ' e2e/run-stage.mjs');
}

for (const [id, binary] of [['unit', 'npm'], ['normal_build', 'npm'], ['pages_build', 'npm'], ['apt_config', 'sudo'], ['os_install', 'sudo'], ['browser_install', 'node']]) {
  test(`${id}: command failure propagates and leaves the diagnostic log`, async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'calculator-ci-fault-'));
    try {
      await mkdir(join(cwd, 'gui-evidence'));
    await prepareStageWrapper(cwd);
      await mkdir(join(cwd, 'bin'));
      // Only this isolated subprocess receives the failing command. No application
      // source or normal dependency is modified, and there is no retry.
      await writeFile(join(cwd, 'bin', binary), '#!/bin/sh\necho "isolated diagnostic failure" >&2\nexit 23\n', { mode: 0o755 });
      const result = spawnSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', '-c', executableRun(id)], {
        cwd, encoding: 'utf8', env: { ...process.env, PATH: join(cwd, 'bin') + ':' + process.env.PATH },
      });
      assert.notEqual(result.status, 0, `${id} cannot turn command failure into success`);
      assert.match(result.stdout + result.stderr, /isolated diagnostic failure/);
      const name = { unit: 'unit', normal_build: 'normal-build', pages_build: 'pages-build', apt_config: 'apt-config', os_install: 'os-install', browser_install: 'browser-install' }[id];
      assert.match(await readFile(join(cwd, 'gui-evidence', name + '.log'), 'utf8'), /isolated diagnostic failure/);
    } finally { await rm(cwd, { recursive: true, force: true }); }
  });
}

test('workflow retains strict failure, exact HEAD, timeout and artifact contracts', () => {
  assert.match(workflow, /name: Checks and Chromium GUI/);
  assert.match(workflow, /timeout-minutes: 30/);
  assert.match(workflow, /ref: \$\{\{ github.event.pull_request.head.sha \}\}/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /permissions:\n  contents: read/);
  assert.doesNotMatch(workflow, /continue-on-error:\s*true/);
  const artifact = stepWithId('artifact');
  assert.match(artifact, /if: always\(\)/);
  assert.match(artifact, /retention-days: 7/);
  assert.match(artifact, /if-no-files-found: error/);
  assert.doesNotMatch(artifact, /continue-on-error/);
  // This is a workflow contract, not a claim that GitHub's artifact service was
  // deliberately failed. The action's own failed outcome remains job-failing.
});

test('log storage failure cannot be concealed by a successful command', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'calculator-ci-log-fault-'));
  try {
    await mkdir(join(cwd, 'gui-evidence'));
    await prepareStageWrapper(cwd);
    await mkdir(join(cwd, 'gui-evidence', 'unit.log')); // tee cannot write a directory
    await mkdir(join(cwd, 'bin'));
    await writeFile(join(cwd, 'bin', 'npm'), '#!/bin/sh\necho "successful synthetic command"\n', { mode: 0o755 });
    const result = spawnSync('bash', ['--noprofile', '--norc', '-eo', 'pipefail', '-c', executableRun('unit')], {
      cwd, encoding: 'utf8', env: { ...process.env, PATH: join(cwd, 'bin') + ':' + process.env.PATH },
    });
    assert.notEqual(result.status, 0);
    const timing = JSON.parse(await readFile(join(cwd, 'gui-evidence/unit-timing.json'), 'utf8'));
    assert.equal(timing.status, 'failed');
    assert.match(timing.logFailure, /unit\.log/);
    assert.match(result.stdout, /successful synthetic command/);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

const { validateCoverage } = await import('./ci-contract.mjs');
const { scenarios } = await import('./scenario-config.mjs');
const sha = 'a'.repeat(40);
function completedContexts() {
  const counts = [107, 106, 107, 107, 107, 108], checkpointCounts = [95, 93, 93, 93, 93, 95];
  return scenarios.map((scenario, index) => ({
    status: 'passed', sha, expectedSha: sha,
    servedIdentity: { sha, branch: 'synthetic-contract', run: 'local-contract', attempt: '1' },
    scenarios: [{ ...scenario, status: 'passed', ...(scenario.hasTouch ? { touchActivations: 872 } : {}) }],
    errors: [], checks: Array.from({ length: counts[index] }, (_, i) => scenario.id + ': synthetic acceptance ' + i),
    screenshotCheckpoints: Array.from({ length: checkpointCounts[index] }, (_, i) => ({ name: scenario.id + '-synthetic-' + i, horizontalFit: 'passed' })),
  }));
}
test('complete six-context contract preserves 642 checks and 562 geometry checkpoints', () => {
  assert.deepEqual(validateCoverage(completedContexts(), sha), { contexts: 6, checks: 642, horizontalCheckpoints: 562 });
});
const mutations = {
  'one scenario never ran': records => records.pop(),
  'duplicate context replaces omitted context': records => { records[5] = structuredClone(records[4]); },
  'child failed': records => { records[0].status = 'failed'; },
  'scenario still running': records => { records[0].scenarios[0].status = 'running'; },
  'checkout SHA mismatch': records => { records[0].sha = 'b'.repeat(40); },
  'expected SHA mismatch': records => { records[0].expectedSha = 'b'.repeat(40); },
  'served SHA mismatch': records => { records[0].servedIdentity.sha = 'b'.repeat(40); },
  'incorrect mobile environment': records => { records[2].scenarios[0].hasTouch = false; },
  'acceptance check missing': records => { records[0].checks.pop(); },
  'duplicate acceptance check': records => { records[0].checks[1] = records[0].checks[0]; },
  'check from another context': records => { records[0].checks[0] = records[1].checks[0]; },
  'duplicate geometry checkpoint': records => { records[0].screenshotCheckpoints[1] = records[0].screenshotCheckpoints[0]; },
  'geometry checkpoint missing': records => { records[0].screenshotCheckpoints.pop(); },
  'geometry checkpoint failed': records => { records[0].screenshotCheckpoints[0].horizontalFit = 'failed'; },
  'touch activation omitted': records => { records[2].scenarios[0].touchActivations--; },
  'runtime or network error': records => { records[0].errors.push({ type: 'blocked-external-request' }); },
};
for (const [name, mutate] of Object.entries(mutations)) {
  test('coverage rejects ' + name, () => {
    const records = completedContexts(); mutate(records);
    assert.throws(() => validateCoverage(records, sha));
  });
}

test('stage process launch failure remains failed with timing evidence', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'calculator-ci-spawn-fault-'));
  try {
    await prepareStageWrapper(cwd);
    const result = spawnSync(process.execPath, ['e2e/run-stage.mjs', 'browser-install', '/definitely-absent-calculator-test-command'], { cwd, encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    const timing = JSON.parse(await readFile(join(cwd, 'gui-evidence/browser-install-timing.json'), 'utf8'));
    assert.equal(timing.status, 'failed');
    assert.match(timing.error, /ENOENT/);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});

test('missing-context validation is nonzero at the process boundary', () => {
  const records = completedContexts().slice(0, -1);
  const script = `import { validateCoverage } from ${JSON.stringify(new URL('./ci-contract.mjs', import.meta.url).href)}; validateCoverage(${JSON.stringify(records)}, ${JSON.stringify(sha)});`;
  const result = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /All six contexts must report/);
});

test('isolated preview ports are distinct and allowed by Fetch before any transport', async () => {
  const { scenarioPort } = await import('./scenario-config.mjs');
  const ports = scenarios.map((_, index) => scenarioPort(index));
  assert.equal(new Set(ports).size, scenarios.length);
  for (const port of ports) {
    await assert.rejects(fetch(`http://127.0.0.1:${port}/`, {
      dispatcher: { dispatch() { throw new Error('isolated-transport-probe'); } },
    }), error => error.cause?.message === 'isolated-transport-probe');
  }
});


test('successful memo save waits for persistence without delaying read-only storage observations', async () => {
  const scenario = await readFile(join(root, 'e2e/scenario.mjs'), 'utf8');
  const section = scenario.split('await stage(prefix + ": basic-math-single-memo-edit");')[1]?.split('await stage(prefix + ": basic-math-block-save-and-recalculate");')[0];
  assert.ok(section, 'Ordinary memo persistence regression section must exist');
  const poll = section.indexOf('await expect.poll(async () => (await storage()).notes.find((note) => note.title === "Synthetic math single"))');
  const exact = section.indexOf('near((await storage()).notes.find((note) => note.title === "Synthetic math single").result, Math.sqrt(2), "saved sqrt memo")');
  assert.ok(poll >= 0 && exact > poll, 'Await the saved memo before reading its full-precision result');
  assert.ok(section.slice(poll, exact).includes('.toMatchObject({ expression: "sqrt(2)", resultText: "1.414213562373" })'), 'Wait for this exact submitted memo, not a visual card or arbitrary delay');
  assert.ok(scenario.includes('async function storage() { return page.evaluate(() => JSON.parse(localStorage.getItem("calculation-memo:data"))); }'), 'Read-only and pending-write checks retain immediate storage reads');
  assert.ok(scenario.includes('await expect.poll(async () => (await readNote())?.blocks.filter((block) => block.type === "calculation").map((block) => block.result)).toEqual([1200, 5, 6000, 0.1, 6000 * (1 + 0.1), 10, 20, 20, 1200])'), 'Variable-save poll safely retries absent pending note while retaining every exact result');
});


test('modal overflow diagnostics are failure-only bounded and retain the strict geometry assertion', async () => {
  const scenario = await readFile(join(root, 'e2e/scenario.mjs'), 'utf8');
  const fit = scenario.split('async function assertHorizontalFit(')[1]?.split('async function exerciseFormulaLibrary(')[0];
  assert.ok(fit);
  assert.ok(fit.includes('if (size.scroll > size.client + 1) {'));
  assert.ok(fit.includes('descendants.slice(0, 5000)') && fit.includes('.slice(0, 12)'));
  assert.ok(fit.includes('assert.ok(size.scroll <= size.client + 1,'));
  assert.ok(!/innerHTML|textContent|\.value|\.style\s*=/.test(fit), 'Diagnostics record box metadata, not content, and do not modify layout');
});

const { rewriteUbuntuSources, assertRunner, aptSettings } = await import('./configure-ci-apt.mjs');
test('deb822 source rewrite preserves signing, suites, components and unrelated sources', () => {
  const before = '# http://azure.archive.ubuntu.com/ubuntu example\nTypes: deb\nURIs:   http://azure.archive.ubuntu.com/ubuntu/\nSuites: noble noble-updates noble-backports\nComponents: main restricted universe multiverse\nSigned-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg\n\nTypes: deb\nURIs: https://security.ubuntu.com/ubuntu\nSuites: noble-security\nComponents: main\n';
  const expected = before.replace('URIs:   http://azure.archive.ubuntu.com/ubuntu/', 'URIs:   https://archive.ubuntu.com/ubuntu');
  assert.deepEqual(rewriteUbuntuSources(before, 'sources'), { text: expected, changed: 1 });
  assert.deepEqual(rewriteUbuntuSources(expected, 'sources'), { text: expected, changed: 0 });
});
test('legacy sources preserve options and other hosts; Azure security gets official security endpoint', () => {
  const source = 'deb [arch=amd64 signed-by=/keys/ubuntu.gpg] https://azure.archive.ubuntu.com/ubuntu noble-security main\ndeb https://packages.microsoft.com/ubuntu/24.04/prod noble main\n';
  assert.deepEqual(rewriteUbuntuSources(source, 'list'), { text: source.replace('https://azure.archive.ubuntu.com/ubuntu', 'https://security.ubuntu.com/ubuntu'), changed: 1 });
});
test('unknown URI, suite and wrapped or ambiguous fields fail closed', () => {
  for (const text of [
    'deb http://azure.archive.ubuntu.com.evil/ubuntu noble main',
    'deb http://azure.archive.ubuntu.com/ubuntu-extra noble main',
    'deb http://azure.archive.ubuntu.com/ubuntu future main',
  ]) assert.throws(() => rewriteUbuntuSources(text, 'list'));
  for (const text of [
    'Types: deb\nURIs:\n http://azure.archive.ubuntu.com/ubuntu\nSuites: noble',
    'URIs: http://azure.archive.ubuntu.com/ubuntu\nSuites: noble noble-security',
    'URIs: http://azure.archive.ubuntu.com/ubuntu\nSuites: noble\n noble-security',
    'URIs: http://azure.archive.ubuntu.com/ubuntu\nSuites: noble\n future',
    'URIs: http://azure.archive.ubuntu.com/ubuntu\nSuites: noble\nSuites: noble-updates',
  ]) assert.throws(() => rewriteUbuntuSources(text, 'sources'));
});
test('APT configuration is restricted to root GitHub Ubuntu 24.04 and transport settings', () => {
  const os = 'ID=ubuntu\nVERSION_ID="24.04"\n';
  assert.doesNotThrow(() => assertRunner(os, { GITHUB_ACTIONS: 'true' }, 0));
  assert.throws(() => assertRunner(os, {}, 0));
  assert.throws(() => assertRunner(os, { GITHUB_ACTIONS: 'true' }, 1000));
  assert.throws(() => assertRunner(os.replace('ubuntu', 'debian'), { GITHUB_ACTIONS: 'true' }, 0));
  assert.deepEqual(aptSettings, { 'Acquire::http::Timeout': '20', 'Acquire::https::Timeout': '20', 'Acquire::Retries': '1', 'APT::Update::Error-Mode': 'any' });
});
test('OS and browser acquisition have separate bounded budgets without dependency omissions', () => {
  assert.match(runFor('os_install'), /os-install sudo timeout --verbose --signal=TERM --kill-after=10s 300s/);
  assert.match(runFor('os_install'), /install-deps chromium webkit$/);
  assert.match(runFor('browser_install'), /browser-install timeout --verbose --signal=TERM --kill-after=10s 180s/);
  assert.match(runFor('browser_install'), /install chromium webkit$/);
  assert.doesNotMatch(runFor('os_install') + runFor('browser_install'), /only-shell|no-shell|\|\|/);
  assert.ok(workflow.indexOf('id: apt_config') < workflow.indexOf('id: os_install'));
  assert.ok(workflow.indexOf('id: os_install') < workflow.indexOf('id: browser_install'));
  for (const id of ['apt_config', 'os_install', 'browser_install', 'gui']) assert.doesNotMatch(stepWithId(id), /if: always|continue-on-error/);
});
test('bounded acquisition timeout fails and preserves its stage log and timing', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'calculator-ci-timeout-'));
  try {
    await prepareStageWrapper(cwd);
    const result = spawnSync(process.execPath, ['e2e/run-stage.mjs', 'os-install', 'timeout', '--verbose', '--kill-after=0.2s', '0.1s', process.execPath, '-e', 'console.log("synthetic stalled acquisition"); require("node:child_process").spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "inherit" }); setInterval(() => {}, 1000)'], { cwd, encoding: 'utf8', timeout: 5000 });
    assert.equal(result.status, 124);
    const timing = JSON.parse(await readFile(join(cwd, 'gui-evidence/os-install-timing.json'), 'utf8'));
    assert.equal(timing.status, 'failed'); assert.equal(timing.exitCode, 124);
    assert.match(await readFile(join(cwd, 'gui-evidence/os-install.log'), 'utf8'), /synthetic stalled acquisition/);
  } finally { await rm(cwd, { recursive: true, force: true }); }
});


test('official hosted-runner mirror+file indirection preserves signed source semantics', () => {
  const source = 'Types: deb\nURIs: mirror+file:/etc/apt/apt-mirrors.txt\nSuites: noble noble-updates noble-backports\nComponents: main universe\nSigned-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg\n';
  assert.deepEqual(rewriteUbuntuSources(source, 'sources'), { text: source.replace('mirror+file:/etc/apt/apt-mirrors.txt', 'https://archive.ubuntu.com/ubuntu'), changed: 1 });
  const security = source.replace('noble noble-updates noble-backports', 'noble-security');
  assert.equal(rewriteUbuntuSources(security, 'sources').text, security.replace('mirror+file:/etc/apt/apt-mirrors.txt', 'https://security.ubuntu.com/ubuntu'));
  assert.throws(() => rewriteUbuntuSources(source.replace('apt-mirrors.txt', 'unknown-mirrors.txt'), 'sources'));
});
