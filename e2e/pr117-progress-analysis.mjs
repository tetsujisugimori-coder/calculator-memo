import {readdir,readFile,writeFile} from 'node:fs/promises';
import {analyzeProgress,requireArtifacts} from './pr117-diagnostic-core.mjs';
const root=process.env.PR117_PROGRESS_ROOT||'gui-evidence',records=[];
async function walk(path){for(const entry of await readdir(path,{withFileTypes:true})){const file=path+'/'+entry.name;if(entry.isDirectory())await walk(file);else if(entry.name==='operations.jsonl'){
  const text=await readFile(file,'utf8'),analysis=analyzeProgress(text);records.push({file,...analysis});console.log('DIAG_STOP '+JSON.stringify({file,...analysis}));
}}}
try{await walk(root);requireArtifacts(records.map(r=>r.file.split('/').slice(-2,-1)[0]),['chromium-desktop-1365px','chromium-narrow-390px','chromium-mobile-390px','chromium-mobile-375px','webkit-mobile-390px','webkit-mobile-375px']);}
catch(error){process.exitCode=1;records.push({analysisError:String(error)});console.error(error);}
await writeFile(root+'/pr117-operation-analysis.json',JSON.stringify({rootCause:'UNKNOWN',records},null,2));
