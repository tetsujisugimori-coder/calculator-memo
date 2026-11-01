// Additional fixed-fixture regression; never replaces the six formal scenarios.
import {spawn} from 'node:child_process';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const output='gui-evidence/quote-overflow';await mkdir(output,{recursive:true});
const results=[];
for(const engine of ['chromium','webkit'])for(const width of [375,390])for(const theme of ['light','dark']){
  const id=`${engine}-${width}-${theme}`,directory=`${output}/${id}`;
  const child=spawn(process.execPath,['e2e/quote-overflow.mjs','.',id,`--engine=${engine}`,`--width=${width}`,`--theme=${theme}`,'--touch','--expect-fit'],{env:{...process.env,GUI_EVIDENCE_DIR:directory},stdio:'inherit'});
  const outcome=await new Promise(resolve=>{child.once('error',e=>resolve({error:String(e)}));child.once('close',(code,signal)=>resolve({code,signal}));});
  let record;try{record=JSON.parse(await readFile(`${directory}/result.json`,'utf8'));}catch(error){outcome.error=String(error);}
  results.push({id,...outcome,status:record?.status,sha:record?.sha,tree:record?.tree,dirty:record?.dirty,rawUnchanged:record?.rawUnchanged,appStorageCalls:record?.appStorageCalls});await writeFile(`${output}/results.json`,JSON.stringify({results},null,2)+'\n');
}
assert.equal(results.length,8);assert.ok(results.every(r=>r.code===0&&!r.signal&&!r.error&&r.status==='completed'&&r.rawUnchanged),'All eight fixed-fixture quote conditions must pass');
