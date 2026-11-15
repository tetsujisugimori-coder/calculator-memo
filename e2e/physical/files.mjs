import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {auditSuite} from './audit.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
export async function findOriginalSuite(root='gui-evidence'){
 const candidates=(await readdir(root,{withFileTypes:true})).filter(e=>e.name.startsWith('physical-')&&e.isDirectory());
 assert.equal(candidates.length,1,'one-original-suite');
 return `${root}/${candidates[0].name}`;
}
export async function auditFiles(dir){
 const s=JSON.parse(await readFile(`${dir}/summary.json`));assert.equal(s.audit,'PASS','terminal-suite');assert.equal(s.error,undefined,'terminal-error');auditSuite(s);
 assert.equal(execFileSync('git',['rev-parse',`${s.sha}^{tree}`],{encoding:'utf8'}).trim(),s.tree,'git-tree');
 const required=['e2e/physical/run.mjs','e2e/physical/audit.mjs','e2e/physical/server.mjs','e2e/physical/manual.html','e2e/physical/negative.mjs','e2e/physical/files.mjs','e2e/fixtures/storage-atomic.ts','e2e/fixtures/storage-idb.ts','docs/maintenance/storage-physical-stage3b12/PLAN.md'];assert.deepEqual(Object.keys(s.sources).sort(),required.sort(),'required-source-set');
 const inventory=JSON.parse(await readFile(`${dir}/manifest.json`));const names=(await readdir(dir)).filter(n=>n!=='manifest.json'&&!n.startsWith('mutant-')&&n!=='negative-results.json').sort();assert.deepEqual(Object.keys(inventory).sort(),names,'file-set');
 for(const name of names){const bytes=await readFile(`${dir}/${name}`);assert.equal(bytes.length,inventory[name].size,'file-size');assert.equal(hash(bytes),inventory[name].sha256,'file-hash');}
 assert.equal(hash(await readFile(`${dir}/served-fixture.mjs`)),s.bundleSHA256,'bundle-hash');
 for(const [path,info]of Object.entries(s.sources)){const bytes=await readFile(`${dir}/${path.replaceAll('/','__')}.txt`);assert.equal(hash(bytes),info.sha256);assert.equal(bytes.length,info.size);assert.deepEqual(bytes,execFileSync('git',['show',`${s.sha}:${path}`]),'independent-git-source');assert.equal(execFileSync('git',['rev-parse',`${s.sha}:${path}`],{encoding:'utf8'}).trim(),info.blob);}
 for(const r of s.rows){const stem=`${r.engine}-${r.case}`;assert.ok(inventory[`${stem}.zip`]?.size>0,'trace-required');execFileSync('python3',['-c',"import sys,zipfile,json; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; raw=z.read('trace.trace').decode(); rows=[json.loads(x) for x in raw.splitlines()]; opts=[r for r in rows if r.get('type')=='context-options']; assert len(opts)==1 and opts[0]['browserName']==sys.argv[2]; assert sys.argv[3] in raw",`${dir}/${stem}.zip`,r.engine,r.namespace]);const har=JSON.parse(await readFile(`${dir}/${stem}.har`));const entries=har.log.entries.filter(e=>new URL(e.request.url).pathname==='/fixture.mjs');assert.ok(entries.length,'HAR-module');for(const e of entries){assert.equal(e.response.status,200);const c=e.response.content;assert.equal(typeof c.text,'string','HAR-bytes');assert.equal(hash(Buffer.from(c.text,c.encoding==='base64'?'base64':'utf8')),s.bundleSHA256,'HAR-delivered-bytes');}}
 return true;
}
