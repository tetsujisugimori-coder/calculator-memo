// Generate separate diagnostic modules; tracked formal test contracts stay byte-identical.
import ts from 'typescript';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
const sha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
if(process.env.EXPECTED_SHA)assert.equal(sha,process.env.EXPECTED_SHA);
const hash=s=>createHash('sha256').update(s).digest('hex');
const generated=new Set(),manifest=[];
const browserCallbacks=new Set(['evaluate','evaluateAll','waitForFunction','addInitScript','route']);
export function instrument(source,file){
  const ast=ts.createSourceFile(file,source,ts.ScriptTarget.ESNext,true,ts.ScriptKind.JS),edits=[];
  assert.equal(ast.parseDiagnostics.length,0,'original module parses: '+file);
  function visit(node,inBrowser=false){
    if(ts.isCallExpression(node)&&ts.isPropertyAccessExpression(node.expression)&&browserCallbacks.has(node.expression.name.text)){
      ts.forEachChild(node,child=>visit(child,inBrowser||(ts.isArrowFunction(child)||ts.isFunctionExpression(child))));return;
    }
    if(ts.isAwaitExpression(node)&&!inBrowser){
      const operand=node.expression,loc=ast.getLineAndCharacterOfPosition(node.getStart(ast)),text=operand.getText(ast);
      const kind=/screenshot|boundingBox|assertHorizontalFit/.test(text)?'evidence-collection':/\.close\(|tracing\.stop/.test(text)?'teardown':/writeFile|persist\(|readFile/.test(text)?'artifact-processing':/expect|assert|waitFor/.test(text)?'check-or-wait':'browser-or-harness-operation';
      const meta={source:file,line:loc.line+1,test:file,kind,operation:text.replace(/\s+/g,' ').slice(0,220),locatorSummary:text.replace(/\s+/g,' ').slice(0,160),waitingFor:text.replace(/\s+/g,' ').slice(0,220)};
      edits.push({at:operand.getStart(ast),text:'__pr117Progress.run('+JSON.stringify(meta)+',async()=>('});
      edits.push({at:operand.end,text:'))'});
    }
    ts.forEachChild(node,child=>visit(child,inBrowser));
  }
  visit(ast);
  // Descending insertion preserves source spans; nesting uses original expression semantics.
  edits.sort((a,b)=>b.at-a.at);for(const edit of edits)source=source.slice(0,edit.at)+edit.text+source.slice(edit.at);
  return "import {progress as __pr117Progress} from './pr117-r2-runtime.mjs';\n"+source;
}
async function generate(file){
  if(generated.has(file))return;generated.add(file);
  let source=await readFile('e2e/'+file,'utf8'),copy=source;
  // Only executable harness helpers; leaf coverage/resource/fixture contracts remain original.
  const imports=[...source.matchAll(/from ["']\.\/(audit-[^"']+\.mjs)["']/g)];
  for(const match of imports){await generate(match[1]);copy=copy.replaceAll('./'+match[1],'./pr117-r2-'+match[1].replace(/\.mjs$/,'.generated.mjs'));}
  copy=instrument(copy,file);
  if(file==='scenario.mjs')copy=copy.replace('async function stage(name) {','async function stage(name) { __pr117Progress.setStage(name);');
  const target='e2e/pr117-r2-'+file.replace(/\.mjs$/,'.generated.mjs');await writeFile(target,copy,{flag:'wx'});
  manifest.push({source:file,target,originalSha256:hash(source),generatedSha256:hash(copy)});
}
if(process.argv[1]?.endsWith('pr117-r2-diagnosis.mjs')){
  await generate('scenario.mjs');
  const source=await readFile('e2e/smoke.mjs','utf8');assert.equal(source.split("['e2e/scenario.mjs']").length,2);
  let copy=source.replace("['e2e/scenario.mjs']","['e2e/pr117-r2-scenario.generated.mjs']");
  // Preserve ordinary worker logs and mirror diagnostic lines live into Actions logs.
  copy=copy.replace("child.stdout.pipe(log, { end: false });",`child.stdout.pipe(log, { end: false });
    let progressBuffer='';child.stdout.on('data',chunk=>{progressBuffer+=chunk.toString();let newline;while((newline=progressBuffer.indexOf('\\n'))>=0){const line=progressBuffer.slice(0,newline);progressBuffer=progressBuffer.slice(newline+1);if(line.startsWith('DIAG_PROGRESS '))console.log(line);}});`);
  copy=instrument(copy,'smoke.mjs');
  await writeFile('e2e/pr117-r2-smoke.generated.mjs',copy,{flag:'wx'});
  manifest.push({source:'smoke.mjs',originalSha256:hash(source),generatedSha256:hash(copy)});
  await writeFile('pr117-r2-manifest.json',JSON.stringify({sha,run:process.env.GITHUB_RUN_ID,attempt:process.env.GITHUB_RUN_ATTEMPT,node:process.version,manifest},null,2),{flag:'wx'});
  console.log('DIAG_JSON '+JSON.stringify({kind:'r2-generated',sha,manifest}));
}
