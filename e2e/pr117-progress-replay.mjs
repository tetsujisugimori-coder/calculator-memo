// Lossless finite replay of the one R2 experiment. No browser/product execution.
import {createProgressCodec,decodeProgress,analyzeProgress,requireArtifacts} from './pr117-diagnostic-core.mjs';
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const out=process.env.PR117_REPLAY_OUT||('progress-replay-'+Date.now());await mkdir(out,{recursive:false});await mkdir(out+'/compact');
const artifact=13147145997,digest='82126a26c8da418d6a537683bd7a71a9c1dc8bd9a91d24cc5cd54e11e7e0b450';
let source=process.env.PR117_REPLAY_SOURCE;
if(!source){
 const headers={Authorization:`Bearer ${process.env.GH_TOKEN}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'};
 const api=async path=>{const response=await fetch('https://api.github.com/repos/tetsujisugimori-coder/calculator-memo/'+path,{headers});if(!response.ok)throw Error('official artifact HTTP '+response.status);return response;};
 const metadata=await(await api('actions/artifacts/'+artifact)).json();assert.equal(metadata.workflow_run.id,41451491431);assert.equal(metadata.workflow_run.head_sha,'380d8456e8d034b43a16ff44de7898f1bcdc6677');
 const archive=Buffer.from(await(await api('actions/artifacts/'+artifact+'/zip')).arrayBuffer());assert.equal(createHash('sha256').update(archive).digest('hex'),digest);await writeFile(out+'/source.zip',archive,{flag:'wx'});execFileSync('unzip',['-t',out+'/source.zip'],{stdio:'ignore'});execFileSync('unzip',['-q',out+'/source.zip','-d',out+'/source']);source=out+'/source/gui-evidence';
}
const paths=['operations.jsonl',...(await readdir(source,{withFileTypes:true})).filter(entry=>entry.isDirectory()).map(entry=>entry.name+'/operations.jsonl')];
requireArtifacts(paths,['chromium-desktop-1365px/operations.jsonl','chromium-narrow-390px/operations.jsonl','chromium-mobile-375px/operations.jsonl','chromium-mobile-390px/operations.jsonl','webkit-mobile-375px/operations.jsonl','webkit-mobile-390px/operations.jsonl']);
const rows=[];
for(const path of paths){
 const original=await readFile(source+'/'+path,'utf8'),decodedOriginal=decodeProgress(original);assert.deepEqual(decodedOriginal.malformed,[]);const records=decodedOriginal.records,first=records[0];
 const context=Object.fromEntries(['condition','sha','run','attempt','browser','viewport'].filter(key=>key in first).map(key=>[key,first[key]])),encode=createProgressCodec(context,first.id.split(':')[0]);
 const compact=records.flatMap(record=>encode(record)).join(''),decoded=decodeProgress(compact);assert.deepEqual(decoded.malformed,[]);assert.deepEqual(decoded.records,records);assert.deepEqual(analyzeProgress(compact),analyzeProgress(original));
 await writeFile(out+'/compact/'+path.replaceAll('/','__'),compact,{flag:'wx'});rows.push({path,records:records.length,originalBytes:Buffer.byteLength(original),compactBytes:Buffer.byteLength(compact),identicalDecodedRecords:true,identicalStopSummary:true});
}
const result={sourceRun:41451491431,sourceJob:125297509917,sourceArtifact:artifact,sourceDigest:digest,format:'dictionary start/end v2',rows,originalBytes:rows.reduce((n,row)=>n+row.originalBytes,0),compactBytes:rows.reduce((n,row)=>n+row.compactBytes,0)};result.ratio=result.compactBytes/result.originalBytes;
assert.equal(rows.length,7);assert.equal(rows.reduce((n,row)=>n+row.records,0),152221);assert.ok(result.ratio<=0.4,'predeclared volume budget');await writeFile(out+'/summary.json',JSON.stringify(result,null,2),{flag:'wx'});console.log('DIAG_REPLAY '+JSON.stringify(result));
