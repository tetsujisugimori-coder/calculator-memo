import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
// node counterexamples.mjs <d679076 repository> <original summary.json> <new output directory>
const [repo,input,output]=process.argv.slice(2);
assert.ok(repo&&input&&output,'three arguments required');
const {auditSuite}=await import(pathToFileURL(resolve(repo,'e2e/physical/audit.mjs')));
const bytes=readFileSync(input),original=JSON.parse(bytes);
assert.equal(original.sha,'d6790765a17e1f75a7597ffe8712f95c0f06975b');
auditSuite(original);
mkdirSync(output,{recursive:false});
const mutations={
 'foreign-operation-id':r=>{for(const e of r.events)if(e.txId===r.result.txId)e.operationId='foreign-operation';},
 'foreign-page-session':r=>{for(const e of r.events)if(e.txId===r.result.txId){e.pageId='foreign-page';e.session='foreign-session';}},
 'abort-partial-current':r=>{r.after.current='PARTIAL-WRITE';},
 'abort-receipts-lost':r=>{r.after.receipts={};r.after.copies={'1':{raw:'CORRUPT'}};},
 'quota-partial-current':r=>{r.after.current='PARTIAL-WRITE';},
 'reload-missing-receipts':r=>{r.reopened.receipts={};r.reopened.head.generation=999;},
};
const results=[];
for(const engine of ['chromium','webkit'])for(const [name,mutate]of Object.entries(mutations)){
 const copy=structuredClone(original);
 const caseName=name.startsWith('abort')?'abort':name.startsWith('quota')?'quota-injected':name.startsWith('reload')?'reload':'normal';
 const row=copy.rows.find(r=>r.engine===engine&&r.case===caseName);mutate(row);
 let error;try{auditSuite(copy);}catch(e){error=String(e);}
 results.push({engine,name,caseName,expected:'REJECTED',actual:error?'REJECTED':'FALSE_ACCEPT',error});
 writeFileSync(resolve(output,engine+'-'+name+'.json'),JSON.stringify(copy));
}
const report={head:original.sha,sourceSummarySHA256:createHash('sha256').update(bytes).digest('hex'),normal:'ACCEPTED',results,limit:'Evidence mutations only; no product or browser execution. These do not show the original native observations were corrupt.'};
writeFileSync(resolve(output,'results.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
// Fails on the reviewed version; a repair should reject all the same mutations.
if(results.some(r=>r.actual==='FALSE_ACCEPT'))process.exitCode=1;
