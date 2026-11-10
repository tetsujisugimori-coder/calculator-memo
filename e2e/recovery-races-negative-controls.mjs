import assert from 'node:assert/strict';
import {build} from 'vite';
import {mkdir,writeFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const out=`gui-evidence/recovery-races-controls-${randomUUID()}`;await mkdir(out,{recursive:true});
const variants=[
 {name:'safe',replace:[]},
 {name:'cached-review',replace:[['storage-decision-lifecycle.ts','const ticket = ++epoch, original = baseline; busy++;','return view(); const ticket = ++epoch, original = baseline; busy++;']]},
 {name:'obsolete-generation',replace:[['storage-decision-lifecycle.ts','if (ticket !== epoch || closed) return view();','if (closed) return view();']]},
];
const results=[];
for(const v of variants){let transforms=0;
 const built=await build({configFile:false,logLevel:'error',plugins:[{name:'isolated-mutant',enforce:'pre',transform(code,id){for(const [file,from,to] of v.replace)if(id.endsWith(file)){assert.ok(code.includes(from));code=code.replaceAll(from,to);transforms++;}return code;}}],build:{write:false,minify:false,lib:{entry:'e2e/fixtures/storage-recovery-races.ts',formats:['es']},rolldownOptions:{output:{codeSplitting:false}}}});
 const chunks=(Array.isArray(built)?built:[built]).flatMap(x=>x.output).filter(x=>x.type==='chunk');assert.equal(chunks.length,1);assert.equal(transforms,v.replace.length);
 const mod=await import('data:text/javascript;base64,'+Buffer.from(chunks[0].code).toString('base64'));
 const cases=[];for(const name of mod.RACE_CASES){try{await mod.runRace(name);cases.push({name,result:'GREEN'});}catch(e){cases.push({name,result:'RED',error:String(e)});}}
 results.push({name:v.name,cases});
}
assert.equal(results[0].cases.filter(x=>x.result==='RED').length,0);for(const v of results.slice(1))assert.ok(v.cases.some(x=>x.result==='RED'),v.name+' survived');
await writeFile(`${out}/results.json`,JSON.stringify({sha:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),results},null,2));console.log(JSON.stringify({out,results}));
