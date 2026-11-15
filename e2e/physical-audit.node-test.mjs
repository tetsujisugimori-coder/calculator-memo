import {test} from 'node:test';
import assert from 'node:assert/strict';
import {auditRow,auditSuite} from './physical/audit.mjs';
import {readFileSync} from 'node:fs';
test('manual page cannot authorize product or physical acceptance',()=>{const html=readFileSync('e2e/physical/manual.html','utf8');assert.match(html,/physicalAcceptance:'NOT_TESTED'/);assert.match(html,/replay-prohibited/);assert.doesNotMatch(html,/localStorage|\.clear\(|deleteDatabase/);});
test('missing matrix is rejected',()=>assert.throws(()=>auditSuite({rows:[]}),/complete-matrix/));
test('foreign identity rejected before status',()=>assert.throws(()=>auditRow({sha:'b'}, {sha:'a'}),/identity:sha/));

// CI run-stage creates sibling log/timing files before negative controls run.
import {mkdtemp,mkdir,writeFile,symlink} from 'node:fs/promises';
import {findOriginalSuite} from './physical/files.mjs';
test('suite discovery ignores stage files but rejects absent/ambiguous suites and links',async()=>{
 await mkdir('work/stage3b12-discovery-tests',{recursive:true});
 const root=await mkdtemp('work/stage3b12-discovery-tests/case-');
 await writeFile(`${root}/physical-browser.log`,'native log');
 await writeFile(`${root}/physical-browser-timing.json`,'{}');
 await assert.rejects(findOriginalSuite(root),/one-original-suite/);
 await mkdir(`${root}/physical-fixed`);
 assert.equal(await findOriginalSuite(root),`${root}/physical-fixed`);
 await mkdir(`${root}/physical-second`);
 await assert.rejects(findOriginalSuite(root),/one-original-suite/);
 const links=await mkdtemp('work/stage3b12-discovery-tests/links-');
 await symlink(`${process.cwd()}/${root}/physical-fixed`,`${links}/physical-link`,'dir');
 await assert.rejects(findOriginalSuite(links),/one-original-suite/);
});
