import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir, mkdtemp, cp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';

// Execute the unchanged two readiness contracts against isolated wrapper copies.
// These faults never modify the submitted wrapper or application source.
function assertTimeoutControlLog(log, mode) {
  const blocks = log.split(/(?=^(?:not )?ok \d+ - )/m);
  const conditions = [];
  for (const delay of [0, 200]) {
    const matches = blocks.filter(b => new RegExp(`^(?:not )?ok \\d+ - bounded acquisition timeout.*startup ${delay}ms`).test(b));
    assert.equal(matches.length, 1, `one result for ${mode}/${delay}`);
    const block = matches[0];
    assert.match(block, new RegExp(`^${mode === 'normal' ? 'ok' : 'not ok'} \\d+ - `));
    if (mode !== 'normal') assert.match(block, /failureType: ['"]testCodeFailure['"]/);
    if (mode === 'false-success') {
      assert.match(block, /0 !== 124/);
      assert.match(block, /^\s+actual: 0\s*$/m);
      assert.match(block, /^\s+expected: 124\s*$/m);
    }
    if (mode === 'drop-log') {
      assert.match(block, /did not match the regular expression[\s\S]*synthetic preparation ready/);
      assert.match(block, /^\s+actual: (?:''|"")\s*$/m);
    }
    conditions.push({ startupDelayMs: delay, status: mode === 'normal' ? 'GREEN' : 'semantic-RED' });
  }
  return conditions;
}

const out = 'gui-evidence/node-timeout-controls';
await mkdir(out, { recursive: true });
const original = await readFile('e2e/run-stage.mjs', 'utf8');
const exitLine = "process.exitCode = record.status === 'passed' ? 0 : Number.isInteger(result.exitCode) && result.exitCode > 0 ? result.exitCode : 1;";
const logWrite = 'if (!logFailure) log.write(chunk);';
assert.equal(original.split(exitLine).length, 2);
assert.equal(original.split(logWrite).length, 2);
const report = { sha: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  tree: execFileSync('git', ['rev-parse', 'HEAD^{tree}'], { encoding: 'utf8' }).trim(),
  node: process.version, run: process.env.GITHUB_RUN_ID ?? null, attempt: process.env.GITHUB_RUN_ATTEMPT ?? null,
  wrapperSha256: createHash('sha256').update(original).digest('hex'), results: [], status: 'running',
  limits: ['No claim about all descendants when the outer watchdog fires.', 'Controlled startup delay does not establish the unique cause of historical uninstrumented failures.'] };
try {
  for (const mode of ['normal', 'false-success', 'drop-log']) {
    const scratch = await mkdtemp(join(tmpdir(), 'calculator-node-fault-'));
    const result = { mode, cleanup: false };
    report.results.push(result);
    try {
      await mkdir(join(scratch, 'e2e'));
      await mkdir(join(scratch, '.github/workflows'), { recursive: true });
      await cp('.github/workflows/verify-pr-gui.yml', join(scratch, '.github/workflows/verify-pr-gui.yml'));
      for (const name of ['ci-contract.node-test.mjs', 'ci-contract.mjs', 'scenario-config.mjs', 'configure-ci-apt.mjs'])
        await cp(`e2e/${name}`, join(scratch, 'e2e', name));
      const wrapper = mode === 'false-success' ? original.replace(exitLine, 'process.exitCode = 0;')
        : mode === 'drop-log' ? original.replace(logWrite, '') : original;
      await writeFile(join(scratch, 'e2e/run-stage.mjs'), wrapper);
      await writeFile(`${out}/${mode}-wrapper.mjs.txt`, wrapper);
      const p = spawnSync(process.execPath, ['--test', '--test-reporter=tap', '--test-name-pattern=bounded acquisition timeout',
        'e2e/ci-contract.node-test.mjs'], { cwd: scratch, encoding: 'utf8', timeout: 30000, maxBuffer: 2 * 1024 * 1024 });
      const log = `${p.stdout ?? ''}\n${p.stderr ?? ''}`;
      await writeFile(`${out}/${mode}.log`, log);
      Object.assign(result, { exitCode: p.status, signal: p.signal, error: p.error ? String(p.error) : null,
        logSha256: createHash('sha256').update(log).digest('hex') });
      assert.equal(p.error, undefined, 'control runner must finish within its existing finite bound');
      assert.equal(p.signal, null);
      assert.equal(p.status, mode === 'normal' ? 0 : 1);
      result.conditions = assertTimeoutControlLog(log, mode);
      result.status = mode === 'normal' ? 'GREEN-two-conditions' : 'semantic-RED-two-conditions';
    } finally {
      await rm(scratch, { recursive: true, force: true });
      result.cleanup = true;
    }
  }
  report.status = 'PASS-controls-only';
} catch (error) {
  report.status = 'FAIL'; report.error = error.stack ?? String(error); process.exitCode = 1;
} finally {
  await writeFile(`${out}/result.json`, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
}
