import {createJournal} from './pr117-diagnostic-core.mjs';
export const progress=createJournal((process.env.GUI_EVIDENCE_DIR||'gui-evidence')+'/operations.jsonl',{
  condition:process.env.E2E_SCENARIO||'coordinator',sha:process.env.EXPECTED_SHA,
  run:process.env.GITHUB_RUN_ID||'local',attempt:process.env.GITHUB_RUN_ATTEMPT||'local',
  browser:process.env.E2E_SCENARIO?.split('-')[0]||null,
  viewport:process.env.E2E_SCENARIO?.match(/(\d+)px/)?.[1]||null,
},{compact:true});
process.on('exit',()=>{progress.emit({kind:'process-exit',summary:progress.summary()});if(progress.errors.length&&!process.exitCode)process.exitCode=1;});
