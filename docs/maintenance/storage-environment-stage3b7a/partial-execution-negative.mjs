// Execute the same early-return mutation against fixed old and current sources.
// Only synthetic native contexts; generated modules and raw evidence are retained.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const hash = s => createHash('sha256').update(s).digest('hex');
const root = process.cwd(), out = `gui-evidence/partial-execution-${Date.now()}`;
mkdirSync(out,{recursive:true});
const current = 'docs/maintenance/storage-reconciliation-stage3b6/independent/browser-controls.mjs';
const anchor = "await diagnose('independent native genesis',null,{expect:'CONSISTENT'});";
const results=[];
for (const [label,path,expectedExit] of [['old','docs/maintenance/storage-environment-stage3b7a/runner-before-p2.mjs.txt',0],['new',current,1]]) {
  const original=readFileSync(path,'utf8');
  if(label==='old') assert.equal(hash(original),'cb92b34dbff6410a3fdd4eeae3f70a2c3d246a8520aa148e5427a3a9ac949ed8');
  assert.equal(original.split(anchor).length,2);
  const source=original.replace(anchor,anchor+'\n      return {scope,cases};')
    .replace("from 'vite'",`from ${JSON.stringify(import.meta.resolve('vite'))}`)
    .replace("from '../../../../e2e/node_modules/playwright/index.mjs'",`from ${JSON.stringify(pathToFileURL(resolve(root,'e2e/node_modules/playwright/index.mjs')).href)}`)
    .replace("from './row-contract.mjs'",`from ${JSON.stringify(pathToFileURL(resolve(root,'docs/maintenance/storage-reconciliation-stage3b6/independent/row-contract.mjs')).href)}`);
  const modulePath=`${out}/${label}-early-return.mjs`;
  writeFileSync(modulePath,source);
  const child=spawnSync(process.execPath,[modulePath],{encoding:'utf8',timeout:180000,maxBuffer:16*1024*1024});
  writeFileSync(`${out}/${label}.stdout`,child.stdout??'');writeFileSync(`${out}/${label}.stderr`,child.stderr??'');
  const result={label,sourceSha256:hash(original),mutatedSha256:hash(source),exitCode:child.status,signal:child.signal,error:child.error?.message??null};results.push(result);
  writeFileSync(`${out}/results.json`,JSON.stringify({mutation:anchor+' -> return {scope,cases}',results},null,2));
  assert.ifError(child.error);assert.equal(child.signal,null);assert.equal(child.status,expectedExit);
  const summary=JSON.parse(child.stdout);assert.equal(summary.conditions,8);assert.equal(summary.cases,8);
  result.rawEvidence=summary.out;
}
writeFileSync(`${out}/results.json`,JSON.stringify({mutation:anchor+' -> return {scope,cases}',results},null,2));
console.log(JSON.stringify({status:'passed',oldExit:0,newExit:1,conditions:8,cases:8,out},null,2));
