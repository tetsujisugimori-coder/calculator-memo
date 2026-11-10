// Independent synthetic counterexamples. No browser, storage adapter, or external writes.
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(join(process.cwd(), 'package.json'));
const { build } = require('esbuild');
const dir = await mkdtemp(join(tmpdir(), 'independent-lifecycle-'));
try {
  const out = join(dir, 'fixture.mjs');
  await build({entryPoints:['e2e/fixtures/storage-decision-lifecycle.ts'],bundle:true,platform:'node',format:'esm',outfile:out,logLevel:'silent'});
  // Optional prebuilt module supports identical-input RED/GREEN against a frozen old revision.
  const {createDecisionLifecycle} = await import(pathToFileURL(process.argv[2] || out).href);
  const baseline = () => ({request:{scope:{source:'stage3b5-test-independent',destination:'stage3b4-test-independent'},capture:{source:{kind:'present',value:'{"version":1,"history":[],"notes":[],"settings":{"theme":"light","activePanel":"history"}}'},target:{kind:'absent'},journal:{kind:'absent'}}},revision:'r1',generation:0,authority:{status:'NOT_ESTABLISHED',revision:'a1'},backups:[{id:'b',revision:'b1',raw:'synthetic'}],selection:{ids:[],policy:'all'}});
  for (const scenario of ['observed-aba','read-failure']) {
    let controlled=false;
    const requests=[];
    const lifecycle=createDecisionLifecycle(()=>controlled ? new Promise((resolve,reject)=>requests.push({resolve,reject})) : Promise.resolve(baseline()));
    const initial=await lifecycle.generate(); assert.equal(initial.status,'VALID');controlled=true;
    // Yield only to settle pending promises/hashes, not a timing-based acceptance condition.
    async function until(n){for(let i=0;i<10000&&requests.length<n;i++) await new Promise(resolve=>setImmediate(resolve));assert.equal(requests.length,n,'reader progress');}
    const older=lifecycle.revalidate();await until(1);
    if(scenario==='observed-aba'){const changed=baseline();changed.generation=1;requests[0].resolve(changed);await until(2);}
    let newerDone=false;
    const nextRead=requests.length;
    const newerPromise=lifecycle.useForReview(initial.id).then(value=>{newerDone=true;return value;});
    let served=nextRead;
    for(let i=0;i<10000&&!newerDone;i++) {
      while(served<requests.length)requests[served++].resolve(baseline());
      await new Promise(resolve=>setImmediate(resolve));
    }
    assert.equal(newerDone,true,'concurrent call completion');
    const newer=await newerPromise;
    assert.equal(newer.allowed,false,'concurrent request must not grant reuse');
    // Finish the earlier read only after the competing caller has returned.
    if(scenario==='observed-aba') requests[1].resolve(baseline());
    else requests[0].reject(Error('synthetic failure'));
    await older;
    const expected=scenario==='observed-aba'?'STALE':'UNKNOWN';
    assert.equal(lifecycle.view().status,expected);
    assert.equal(lifecycle.view().reusable,false);controlled=false;
    assert.equal((await lifecycle.useForReview(initial.id)).allowed,false);
    assert.equal(lifecycle.view().HOLD,true);assert.equal(lifecycle.view().executionAllowed,false);assert.equal(lifecycle.view().writeAllowed,false);
    console.log(`PASS independent ${scenario}: ${expected}; subsequent reuse denied`);
  }
} finally {await rm(dir,{recursive:true,force:true});}
