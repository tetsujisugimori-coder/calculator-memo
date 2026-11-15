import {mkdirSync,writeFileSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {resolve,relative} from 'node:path';
export function captureLoad(filename,source,kind){
 if(!process.env.SOURCE_PROOF_DIR||source==null)return;
 const root=process.env.SOURCE_PROOF_DIR,b=Buffer.from(source),sha256=createHash('sha256').update(b).digest('hex');
 mkdirSync(`${root}/bytes`,{recursive:true});mkdirSync(`${root}/loads`,{recursive:true});
 writeFileSync(`${root}/bytes/${sha256}.txt`,b);
 const path=relative(process.cwd(),resolve(filename)).replaceAll('\\','/');
 const id=randomUUID();
 writeFileSync(`${root}/loads/${process.pid}-${id}.json`,JSON.stringify({id,path,kind,size:b.length,sha256,pid:process.pid,run:process.env.GITHUB_RUN_ID||'local',attempt:process.env.GITHUB_RUN_ATTEMPT||'local',capturedAt:new Date().toISOString()}));
}
