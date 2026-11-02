// One owned preview and one exclusive evidence directory per execution.
import assert from 'node:assert/strict';
import { execFileSync,spawn } from 'node:child_process';
import { mkdir,writeFile,readFile,readdir } from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import { createHash,randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
const sha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const tree=execFileSync('git',['rev-parse','HEAD^{tree}'],{encoding:'utf8'}).trim();
const dirty=!!execFileSync('git',['status','--porcelain','--untracked-files=no'],{encoding:'utf8'}).trim();
assert.equal(sha,process.env.EXPECTED_SHA||sha);if(process.env.GITHUB_ACTIONS==='true')assert.equal(dirty,false);
const out=join('gui-evidence',`stage3a-${sha.slice(0,12)}-${new Date().toISOString().replace(/[:.]/g,'-')}-${randomUUID()}`);
await mkdir('gui-evidence',{recursive:true});await mkdir(out); // no recursive overwrite/reuse
const hash=createHash('sha256');
async function bundle(dir,prefix='') {for(const e of (await readdir(dir,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))){const p=join(dir,e.name),name=prefix+e.name;if(e.isDirectory())await bundle(p,name+'/');else if(!name.includes('provenance')){hash.update(name);hash.update('\0');hash.update(await readFile(p));}}}
await bundle('dist-pages');
const provenance={sha,tree,dirty,bundleSha256:hash.digest('hex'),run:process.env.GITHUB_RUN_ID||'local',attempt:process.env.GITHUB_RUN_ATTEMPT||'local',node:process.version,startedAt:new Date().toISOString(),out};
await writeFile('dist-pages/__stage3a_provenance.json',JSON.stringify(provenance));await writeFile(join(out,'provenance.json'),JSON.stringify(provenance,null,2)+'\n',{flag:'wx'});
const log=createWriteStream(join(out,'server.log'),{flags:'wx'});
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--config','vite.pages.config.ts','--host','127.0.0.1','--port','4196','--strictPort'],{stdio:['ignore','pipe','pipe']});
server.stdout.pipe(log);server.stderr.pipe(log);const serverExited=once(server,'exit');let child;let stopping=false;
const stop=signal=>{stopping=true;child?.kill(signal);server.kill(signal);};process.on('SIGTERM',()=>stop('SIGTERM'));process.on('SIGINT',()=>stop('SIGINT'));
try{
 let ready=false;for(let i=0;i<60&&!stopping;i++){if(server.exitCode!==null||server.signalCode!==null)throw Error('owned preview exited');try{const r=await fetch('http://127.0.0.1:4196/calculator-memo/__stage3a_provenance.json',{signal:AbortSignal.timeout(500)});if(r.ok){assert.deepEqual(await r.json(),provenance);ready=true;break;}}catch{}await delay(250);}
 assert.ok(ready&&!stopping,'owned preview readiness');
 child=spawn(process.execPath,['e2e/selective-safety-mobile.mjs'],{stdio:'inherit',env:{...process.env,EXPECTED_SHA:sha,STAGE3A_EVIDENCE_DIR:out}});
 const [code,signal]=await once(child,'exit');process.exitCode=code===0&&!signal&&!stopping?0:1;
}finally{if(server.exitCode===null&&server.signalCode===null){server.kill('SIGTERM');const killer=setTimeout(()=>server.kill('SIGKILL'),3000);await serverExited;clearTimeout(killer);}log.end();console.log(`Stage3A evidence: ${out}`);}
