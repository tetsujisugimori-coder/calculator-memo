import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runChild, runPlan } from './diagnostic-supervisor.mjs';

const sha = 'a'.repeat(40);
async function temp(fn) { const dir = await mkdtemp(join(tmpdir(), 'pr103-diag-')); try { await fn(dir); } finally { await rm(dir, { recursive: true, force: true }); } }
test('four mock cases aggregate only complete matching evidence', () => temp(async dir => {
  const driver = join(dir, 'mock.cjs');
  await writeFile(driver, "const fs=require('fs'); fs.writeFileSync(process.env.DIAG_OUTPUT+'/progress.json',JSON.stringify({status:'passed',identity:{diagnosticSha:process.env.DIAG_CODE_SHA},cases:[{status:'passed',checks:Array(11).fill('ok'),actions:[{}],errors:[]}]}));");
  const r = await runPlan({ output: join(dir, 'out'), app: dir, driver, sha, timeoutMs: 5000, totalMs: 30000 });
  assert.equal(r.status, 'passed'); assert.equal(r.cases.length, 4); assert.ok(r.cases.every(x => x.checkCount === 11 && x.actionCount === 1));
}));
test('missing progress stops subsequent cases and persists failure', () => temp(async dir => {
  const driver = join(dir, 'mock.cjs'); await writeFile(driver, "console.log('partial');");
  const r = await runPlan({ output: join(dir, 'out'), app: dir, driver, sha, timeoutMs: 5000, totalMs: 30000 });
  assert.equal(r.status, 'failed'); assert.equal(r.cases.length, 1); assert.ok(r.cases[0].evidenceError);
  assert.match(await readFile(join(dir, 'out/case-0/worker.log'), 'utf8'), /partial/);
}));
test('failed child exit is not passed', () => temp(async dir => {
  const r = await runChild({ command: process.execPath, args: ['-e', "console.log('before failure'); process.exit(7)"], env: process.env, log: join(dir, 'log'), timeoutMs: 5000 });
  assert.equal(r.code, 7); assert.equal(r.ok, false); assert.match(await readFile(join(dir, 'log'), 'utf8'), /before failure/);
}));
test('time limit terminates child and preserves prior output', () => temp(async dir => {
  const r = await runChild({ command: process.execPath, args: ['-e', "console.log('before timeout'); setInterval(()=>{},1000)"], env: process.env, log: join(dir, 'log'), timeoutMs: 1200, graceMs: 200 });
  assert.equal(r.timedOut, true); assert.equal(r.ok, false); assert.match(await readFile(join(dir, 'log'), 'utf8'), /before timeout/);
}));
test('Linux timeout reaches descendant and allows cleanup', { skip: process.platform !== 'linux' }, () => temp(async dir => {
  const script = join(dir, 'parent.cjs'), child = join(dir, 'child.cjs'), marker = join(dir, 'cleanup');
  await writeFile(child, "const fs=require('fs'); process.on('SIGTERM',()=>{fs.writeFileSync(process.argv[2],'closed'); process.exit(0)}); console.log('ready'); setInterval(()=>{},1000)");
  await writeFile(script, "const {spawn}=require('child_process'); const c=spawn(process.execPath,[process.argv[2],process.argv[3]],{stdio:'inherit'}); process.on('SIGTERM',()=>{}); c.on('exit',()=>process.exit(0));");
  const r = await runChild({ command: process.execPath, args: [script, child, marker], env: process.env, log: join(dir, 'log'), timeoutMs: 2000, graceMs: 2000 });
  assert.equal(r.timedOut, true); assert.equal(r.ok, false); assert.equal(await readFile(marker, 'utf8'), 'closed');
}));
