// Generate an observational copy; original expectations, timeout and fail-fast remain intact.
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const hash=value=>createHash('sha256').update(value).digest('hex');
const source=await readFile('e2e/selection-preview-mobile.mjs','utf8');
assert.equal(hash(source),'88a107ed929fc7d15f57d54e6eb7ca9af8ca61903a89cceffd77ff3382092fcd');
if(process.env.DIAG_OBSERVE!=='1'){console.log('DIAG_JSON '+JSON.stringify({kind:'source',mode:'control',sha256:hash(source),originalUnchanged:true}));process.exit(0);}
function once(text,from,to){assert.equal(text.split(from).length,2,'unique source anchor: '+from);return text.replace(from,to);}
const variant=process.env.DIAG_FAULT==='original-timeout'?'timeout':'observed';
let copy="import {createR1Probe} from './pr117-r1-probe.mjs';\nlet diagnosticFailures=0;\n"+source;
copy=once(copy,'let page;','let page,probe,originalFailure;');
copy=once(copy,'page=await context.newPage();',`page=await context.newPage();probe=createR1Probe(page,{sha:process.env.EXPECTED_SHA,engine:engineName,width,theme,run:process.env.GITHUB_RUN_ID,attempt:process.env.GITHUB_RUN_ATTEMPT},'gui-evidence/r1-'+engineName+'-'+width+'-'+theme+'.jsonl');`);
copy=once(copy,"const article=dialog.locator('[data-preview-key]').filter({hasText:note.id});",`const article=dialog.locator('[data-preview-key]').filter({hasText:note.id});probe.setOriginalStorage(original);await probe.install(article);`);
copy=once(copy,"await article.getByRole('button',{name:'復元候補に選択',exact:true}).focus();await page.keyboard.press('Space');","await probe.snapshot('before-focus');await article.getByRole('button',{name:'復元候補に選択',exact:true}).focus();await probe.beforeSpace(1,'true');await page.keyboard.press('Space');await probe.afterSpace(1);");
copy=once(copy,"await page.keyboard.press('Space');current.keyboardEvents=","await probe.beforeSpace(2,'false');await page.keyboard.press('Space');await probe.afterSpace(2);"+(variant==='timeout'?"await article.evaluate(row=>row.remove());":"")+"current.keyboardEvents=");
copy=once(copy,'}catch(error){if(page)current.keyboardEvents=','}catch(error){originalFailure=error;if(probe)await probe.snapshot("test-failure");if(page)current.keyboardEvents=');
copy=once(copy,'}finally{await context.close();}','}finally{if(probe)diagnosticFailures+=await probe.finalize(originalFailure);await context.close();}');
copy=once(copy,"record.status='passed';","assert.equal(diagnosticFailures,0,'diagnostic collection failed');record.status='passed';");
await writeFile('e2e/pr117-'+variant+'.generated.mjs',copy,{flag:'wx'});
let runner=await readFile('e2e/run-selection-preview-gui.mjs','utf8');
runner=once(runner,"['e2e/selection-preview-mobile.mjs']","['e2e/pr117-"+variant+".generated.mjs']");
await writeFile('e2e/pr117-'+variant+'-runner.generated.mjs',runner,{flag:'wx'});
console.log('DIAG_JSON '+JSON.stringify({kind:'source',mode:'observed',originalSha256:hash(source),derivedSha256:hash(copy),changes:'bounded passive observers and read-only snapshots; original fail-fast, guards, timeout and inputs retained; timing overhead possible'}));
