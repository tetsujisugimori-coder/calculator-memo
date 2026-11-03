import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateSpaceTransition } from './selection-space-contract.mjs';
const sample = () => ({ pressed: 'true', name: '候補から解除', same: true, focus: true, events: [
 ...['keydown','keyup','click'].map(type => ({ phase: 'capture', type, key: type === 'click' ? undefined : ' ', trusted: type !== 'click', same: true, connected: true, focus: true })),
 ...['keydown','keyup'].map(type => ({ phase: 'bubble', type, prevented: true })),
] });
test('accepts a complete owned Space activation only', () => validateSpaceTransition(sample(), true));
for (const [name, corrupt] of [
 ['missing click', r => r.events.splice(2,1)], ['duplicate click', r => r.events.push(r.events[2])],
 ['missing update', r => { r.pressed='false'; }], ['wrong label', r => { r.name='復元候補に選択'; }],
 ['replaced DOM', r => { r.same=false; }], ['focus escaped', r => { r.focus=false; }],
 ['untrusted key', r => { r.events[0].trusted=false; }], ['detached target', r => { r.events[1].connected=false; }],
 ['native default left active', r => { r.events[4].prevented=false; }],
]) test(`rejects ${name}`, () => { const r=sample();corrupt(r);assert.throws(()=>validateSpaceTransition(r,true)); });
