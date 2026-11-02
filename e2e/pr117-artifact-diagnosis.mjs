// Read-only analysis of original run 41386901845. No product import or execution.
import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const repo='tetsujisugimori-coder/calculator-memo';
const root=process.env.DIAGNOSTIC_OUT; if(!root)throw Error('unique DIAGNOSTIC_OUT required');
await mkdir(root,{recursive:false});
const emit=(kind,value)=>console.log('DIAG_JSON '+JSON.stringify({kind,...value}));
const headers={Authorization:`Bearer ${process.env.GH_TOKEN}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'};
async function api(path){const r=await fetch('https://api.github.com/repos/'+repo+'/'+path,{headers});if(!r.ok)throw Error(`${path}: HTTP ${r.status}`);return r;}
const run=await (await api('actions/runs/41386901845')).json();
emit('original-run',{id:run.id,attempt:run.run_attempt,sha:run.head_sha,created_at:run.created_at,updated_at:run.updated_at,status:run.status,conclusion:run.conclusion});
const jobs=await (await api('actions/runs/41386901845/jobs')).json();
for(const job of jobs.jobs.filter(j=>[125089719205,125089719072].includes(j.id))){
 emit('original-job',{id:job.id,started_at:job.started_at,completed_at:job.completed_at,conclusion:job.conclusion,runner:job.runner_name,steps:job.steps});
 if(job.check_run_url){const r=await fetch(job.check_run_url+'/annotations',{headers});emit('annotations',{job:job.id,http:r.status,annotations:r.ok?await r.json():null});}
}
for(const [id,digest] of [[13115926677,'31385ddcd600c532db45c6b76f25c7140e888fecc3f46315a0272c5075580f75'],[13117290020,'431e07d728022d377fe82ae86e0e93a5d255a1cf73cd8ebe89cb09353934311d']]){
 const metadata=await (await api('actions/artifacts/'+id)).json();
 const archive=Buffer.from(await (await api('actions/artifacts/'+id+'/zip')).arrayBuffer());
 const sha256=createHash('sha256').update(archive).digest('hex');if(sha256!==digest)throw Error('ZIP digest mismatch');
 const zip=`${root}/${id}.zip`,dir=`${root}/${id}`;await writeFile(zip,archive,{flag:'wx'});execFileSync('unzip',['-t',zip]);execFileSync('unzip',['-q',zip,'-d',dir]);
 emit('archive',{id,run:41386901845,attempt:1,sha:run.head_sha,sha256,bytes:archive.length,metadata});
 async function walk(path){for(const e of await readdir(path,{withFileTypes:true})){const file=path+'/'+e.name;if(e.isDirectory()){await walk(file);continue;}const bytes=await readFile(file);emit('file',{artifact:id,path:file.slice(dir.length+1),bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});
 if(e.name.endsWith('.json')){try{const p=JSON.parse(bytes);if(e.name.includes('selection-preview-results'))emit('selection-record',{artifact:id,record:p});
 else if(e.name==='provenance.json'){
  emit('provenance',{artifact:id,path:file.slice(dir.length+1),status:p.status,sha:p.sha,expectedSha:p.expectedSha,startedAt:p.startedAt,finishedAt:p.finishedAt,stage:p.stage,checks:p.checks?.length,lastChecks:p.checks?.slice(-5),geometry:p.screenshotCheckpoints?.length,png:p.screenshotCheckpoints?.filter(x=>x.retained).length,errors:p.errors,failure:p.failure,workers:p.workers,scenarios:p.scenarios,resourcesAtStart:p.resourcesAtStart,resourcesAtEnd:p.resourcesAtEnd,lastStageResource:p.resourcesByStage?.slice(-1),stages:p.timings?.stages,input:p.timings?.input,lastActivations:p.timings?.activations?.slice(-5),slowActivations:p.timings?.activations?.toSorted((a,b)=>b.durationMs-a.durationMs).slice(0,8)});
 }else if(/timing|resource|outcomes|summary/.test(e.name))emit('record',{artifact:id,path:file.slice(dir.length+1),record:p});
 }catch(error){emit('json-error',{file,error:String(error)});process.exitCode=1;}}
 else if(e.name.endsWith('.log')){const lines=bytes.toString().split('\n');emit('log-tail',{artifact:id,path:file.slice(dir.length+1),tail:lines.slice(-16)});}
 }}await walk(dir);
}
