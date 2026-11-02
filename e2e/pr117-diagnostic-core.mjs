// Diagnostic only; no product imports or browser-storage writes.
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { performance } from 'node:perf_hooks';
export function classifySpace(before, after, events, expected) {
  if (!before || !after || before.incomplete || after.incomplete || !before.target?.identity) return {category:'E',cause:'UNKNOWN',reason:'incomplete observations'};
  const delivered = type => events.some(e=>e.type===type && e.target?.identity===before.target.identity && (type!=='keydown'||e.code==='Space'));
  if (after.target?.pressed===expected) {
    if (after.original?.isConnected===false && after.target.identity!==before.target.identity) return {category:'D',cause:'UNKNOWN',reason:'desired state on replacement; stale reference suspected, not proven test defect'};
    return {category:'SUCCESS',cause:null,reason:'desired state observed'};
  }
  if(!after.target?.identity)return {category:'E',cause:'UNKNOWN',reason:'target disappeared; multiple explanations remain'};
  if (!delivered('keydown')) return {category:'A',cause:'UNKNOWN',reason:'target keydown not observed; listener coverage limits apply'};
  if (!delivered('click')) return {category:'B',cause:'UNKNOWN',reason:'keydown observed, target click unobserved; does not identify browser fault'};
  return {category:'C',cause:'UNKNOWN',reason:'target click observed, desired state unobserved'};
}
// Repeated source/locator/context text is a dictionary entry, not per-operation IO.
// Both sinks receive the header and dictionaries before any referencing packet.
export function createProgressCodec(context={},contextId=String(process.pid)) {
  const sites=new Map(),stages=new Map();let initialized=false;
  return record=>{const packets=[];
    if(!initialized){packets.push({p:'context',v:2,c:contextId,context});initialized=true;}
    const stageKey=JSON.stringify(record.stage);let stageId=stages.get(stageKey);
    if(record.id&&!stageId){stageId=stages.size+1;stages.set(stageKey,stageId);packets.push({p:'stage',c:contextId,g:stageId,stage:record.stage});}
    if(record.status==='started'&&record.id){
      const {id,status,startedAt,startMs,stage,...site}=record;void status;
      const key=JSON.stringify(site);let siteId=sites.get(key);
      if(!siteId){siteId=sites.size+1;sites.set(key,siteId);packets.push({p:'site',c:contextId,s:siteId,site});}
      void stage;packets.push({p:'s',c:contextId,s:siteId,i:id,g:stageId,t:startedAt,m:startMs});
    }else if(record.id&&['succeeded','failed'].includes(record.status)){
      const {id,status,stage,completedAt,endMs,durationMs,error}=record;
      void stage;packets.push({p:'e',c:contextId,i:id,o:status,g:stageId,t:completedAt,m:endMs,d:durationMs,...(error?{e:error}:{})});
    }else packets.push({...context,...record});
    return packets.map(packet=>JSON.stringify(packet)+'\n');
  };
}
export function decodeProgress(text){
  const records=[],malformed=[],contexts=new Map(),sites=new Map(),stages=new Map(),starts=new Map();
  for(const [index,line]of text.split('\n').entries()){if(!line.trim())continue;
    try{const r=JSON.parse(line.replace(/^DIAG_PROGRESS /,''));
      if(r.p==='context'){if(r.v!==2)throw Error('unknown progress format');contexts.set(r.c,r.context);continue;}
      if(r.p==='site'){sites.set(r.c+':'+r.s,r.site);continue;}
      if(r.p==='stage'){stages.set(r.c+':'+r.g,r.stage);continue;}
      if(r.p==='s'){
        const context=contexts.get(r.c),site=sites.get(r.c+':'+r.s);if(!context||!site||!stages.has(r.c+':'+r.g))throw Error('missing compact progress metadata');
        const record={...context,...site,id:r.i,stage:stages.get(r.c+':'+r.g),status:'started',startedAt:r.t,startMs:r.m};starts.set(r.c+':'+r.i,record);records.push(record);
      }else if(r.p==='e'){
        const key=r.c+':'+r.i,start=starts.get(key);if(!start||!stages.has(r.c+':'+r.g))throw Error('compact completion without start/stage');
        records.push({...start,status:r.o,stage:stages.get(r.c+':'+r.g),completedAt:r.t,endMs:r.m,durationMs:r.d,...(r.e?{error:r.e}:{})});starts.delete(key);
      }else records.push(r);
    }catch{malformed.push(index+1);}
  }
  return {records,malformed};
}
export function createJournal(file, context={}, options={}) {
  let sequence=0,bytes=0,stage='startup',lastStarted=null,lastCompleted=null;
  const errors=[],pending=new Map(),write=options.write||(line=>appendFileSync(file,line)),mirror=options.mirror||(line=>process.stdout.write('DIAG_PROGRESS '+line));
  try {mkdirSync(dirname(file),{recursive:true});} catch(error){errors.push(String(error));}
  const encode=options.compact?createProgressCodec(context):record=>[JSON.stringify({...context,...record})+'\n'];
  function emit(record){let lines;try{lines=encode({stage,...record});}catch(error){errors.push(String(error));return;}
    for(const line of lines){try{if(bytes+Buffer.byteLength(line)>(options.limit??32*1024*1024))throw Error('diagnostic journal capacity exceeded');write(line);bytes+=Buffer.byteLength(line);}catch(error){if(errors.length<16)errors.push(String(error));}
      try{mirror(line);}catch(error){if(errors.length<16)errors.push(String(error));}}
  }
  function start(meta){const op={id:`${process.pid}:${++sequence}`,...meta,status:'started',startedAt:new Date().toISOString(),startMs:performance.now()};pending.set(op.id,op);lastStarted=op;emit(op);return op;}
  function finish(op,status,error){const endMs=performance.now(),record={...op,status,completedAt:new Date().toISOString(),endMs,durationMs:endMs-op.startMs,...(error?{error:String(error).slice(0,800)}:{})};pending.delete(op.id);lastCompleted=record;emit(record);return record;}
  return {start,finish,emit,errors,setStage(value){stage=String(value).slice(0,160);},
    async run(meta,action){const op=start(meta);try{const result=await action();finish(op,'succeeded');return result;}catch(error){finish(op,'failed',error);throw error;}},
    summary(){return {lastStarted,lastCompleted,incomplete:[...pending.values()],diagnosticErrors:[...errors],bytes};},
    assertHealthy(){if(errors.length)throw Error('diagnostic recording failed: '+errors.join('; '));}
  };
}
export function analyzeProgress(text){const {records,malformed}=decodeProgress(text);
  const pending=new Map(),completed=[];for(const r of records){if(r.status==='started')pending.set(r.id,r);else if(['succeeded','failed'].includes(r.status)){pending.delete(r.id);completed.push(r);}}
  const incomplete=[...pending.values()];return {lastStarted:records.filter(r=>r.status==='started').at(-1)||null,lastCompleted:completed.at(-1)||null,incomplete,malformed,stopClass:incomplete.at(-1)?.kind||(records.length?'between-recorded-operations':'UNKNOWN'),rootCause:'UNKNOWN'};
}
export function requireArtifacts(actual,required){const missing=required.filter(name=>!actual.includes(name));if(missing.length)throw Error('missing diagnostic evidence: '+missing.join(', '));}
