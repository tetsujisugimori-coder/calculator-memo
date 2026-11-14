import {test} from 'node:test';
import assert from 'node:assert/strict';
import {auditRow,auditSuite} from './physical/audit.mjs';
import {readFileSync} from 'node:fs';
test('manual page cannot authorize product or physical acceptance',()=>{const html=readFileSync('e2e/physical/manual.html','utf8');assert.match(html,/physicalAcceptance:'NOT_TESTED'/);assert.match(html,/replay-prohibited/);assert.doesNotMatch(html,/localStorage|\.clear\(|deleteDatabase/);});
test('missing matrix is rejected',()=>assert.throws(()=>auditSuite({rows:[]}),/complete-matrix/));
test('foreign identity rejected before status',()=>assert.throws(()=>auditRow({sha:'b'}, {sha:'a'}),/identity:sha/));
