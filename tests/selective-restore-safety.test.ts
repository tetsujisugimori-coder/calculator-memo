import { describe, it, expect, vi } from 'vitest';
import { applySourceEdits, verifyPreservedRanges } from '../lib/json-source-edit';
import { parseStrictJsonSource, parseStrictJson } from '../lib/restore-validation';
import { generateSafetyCandidate, revalidateSafety } from '../lib/selective-restore-safety';
import { setup, base, history, note, noteEvidence, formula, report, wrap } from './helpers/selective-safety-fixture';

describe('UTF-16 source editing, shared strict grammar and non-change proof', () => {
  it.each(['-0','0','9007199254740993','1E+200','1.00000000000000001','0e99999999999'])('preserves unselected numeric lexeme %s without normalization', token => {
    const raw = ` {\r\n "z":${token}, "text":"\\u65e5\\n😀\\ud800", "edit":[ ] } `;
    const root = parseStrictJsonSource(raw).root;
    const array = root.children.find(node => node.key === 'edit')!;
    const result = applySourceEdits(raw, [{ start: array.start + 1, end: array.start + 1, expected: '', replacement: '1', keys: ['test'] }]);
    expect(result.raw).toBe(raw.replace('[ ]','[1 ]'));
    expect(verifyPreservedRanges(raw, result.raw, result.preserved)).toBe(true);
    expect(verifyPreservedRanges(raw, result.raw.replace('"z"','"q"'), result.preserved)).toBe(false);
  });
  it('retains property order, whitespace and exact source slice offsets including astral UTF-16', () => {
    const raw = ' {"😀":"\\u0031","a":[-0,1e2]} ';
    const { root, value } = parseStrictJsonSource(raw);
    expect(value).toEqual(parseStrictJson(raw));
    expect(root.children.map(n => n.key)).toEqual(['😀','a']);
    expect(raw.slice(root.children[0].start,root.children[0].end)).toBe('"\\u0031"');
    expect(root.children[1].children.map(n => raw.slice(n.start,n.end))).toEqual(['-0','1e2']);
  });
  it.each(['{"a":1,"\\u0061":2}', '{"a":}', '[1,]', '"\\q"', '01', '[NaN]', '['.repeat(130)+'0'+']'.repeat(130)])('both strict entry points reject malformed/duplicate/deep JSON %s', raw => {
    expect(() => parseStrictJson(raw)).toThrow(); expect(() => parseStrictJsonSource(raw)).toThrow();
  });
  it.each([
    [{ start: 2, end: 3, expected: 'x', replacement: '1', keys: [] }],
    [{ start: -1, end: 0, expected: '', replacement: '', keys: [] }],
    [{ start: 0, end: 2, expected: '[]', replacement: '{', keys: [] }],
    [{ start: 1, end: 1, expected: '', replacement: '1', keys: [] }, { start: 1, end: 1, expected: '', replacement: '2', keys: [] }],
  ].map(edits => ({ edits })))('rejects invalid edits rather than producing a partial result', ({ edits }) => expect(() => applySourceEdits('[]',edits)).toThrow(/変更区間|JSON/));
});

describe('Stage 3A bounded candidates, execution remains forbidden', () => {
  it('single ADD retains every complement interval and source escapes', () => {
    const raw = ' \n'+JSON.stringify({ ...base, history: [history('old')] }, null, 2)+'\t';
    const data = { ...base, history: [history('new')] };
    const f = setup(data, raw, ['history:0'], JSON.stringify(data).replace('new', '\\u006eew'));
    const c = f.candidate();
    expect(c.status).toBe('PASS'); expect(c.executionAllowed).toBe(false); expect(f.plan.executionAllowed).toBe(false);
    expect(c.raw).toContain('\\u006eew'); expect(c.raw).toContain(JSON.stringify(history('old'),null,2).split('\n')[0]);
    expect(verifyPreservedRanges(raw,c.raw!,c.preserved)).toBe(true); expect(c.edits).toHaveLength(1);
  });
  it('multiple ADDs are deterministic across selection order', () => {
    const data = { ...base, history: [history('a'),history('b')] };
    const a = setup(data,JSON.stringify(base),['history:0','history:1']).candidate();
    const b = setup(data,JSON.stringify(base),['history:1','history:0']).candidate();
    expect(a.status).toBe('PASS'); expect(b.status).toBe('PASS'); expect(a.raw).toBe(b.raw); expect(a.edits).toHaveLength(1);
    expect(JSON.parse(a.raw!).history).toHaveLength(2);
  });
  it('REPLACE changes only the explicitly selected item, preserves sibling and settings', () => {
    const current = JSON.stringify({ ...base, history: [history('a'),history('other')] },null,2);
    const c = setup({ ...base, history: [history('a',3)] },current).candidate();
    expect(c.status).toBe('PASS'); expect(JSON.parse(c.raw!).history.map((h: {result:number}) => h.result)).toEqual([3,2]);
    expect(verifyPreservedRanges(current,c.raw!,c.preserved)).toBe(true);
  });
  it('UNCHANGED returns the entire original string with no edits', () => {
    const data = { ...base, history: [history('a')] }; const raw = '\r\n'+JSON.stringify(data,null,3)+' ';
    const c = setup(data,raw).candidate(); expect(c.status).toBe('PASS'); expect(c.raw).toBe(raw); expect(c.edits).toEqual([]);
  });
  it.each(['notes','formulas','executions','reports'])('supports existing %s collection parent ADD only when references resolve', category => {
    const common = { ...base, formulaLibrary: { version: 1, entries: [formula()], selectedId: null }, formulaExecutions: [], formulaReports: { version: 1, entries: [] } };
    const data = category === 'notes' ? { ...common, notes: [note()] } : category === 'formulas' ? { ...common, formulaLibrary: { ...common.formulaLibrary, entries: [formula(),formula('f2')] } } : category === 'executions' ? { ...common, formulaExecutions: [{ formulaId: 'f', expression:'x+1', inputs:{ x:'2' } }] } : { ...common, formulaReports: { version:1, entries:[report()] } };
    const c = setup(data,JSON.stringify(common),[`${category}:${category === 'formulas' ? 1 : 0}`]).candidate();
    expect(c.status).toBe('PASS'); expect(c.executionAllowed).toBe(false);
  });
  it.each([['notes:0','notes:0:evidence:0'],['notes:0:evidence:0','notes:0']])('parent-child operations apply once in either order %j', (...keys) => {
    const c = setup({ ...base,notes:[noteEvidence()] },JSON.stringify(base),keys).candidate();
    expect(c.status).toBe('PASS'); expect(c.edits).toHaveLength(1); expect(JSON.parse(c.raw!).notes[0].calculationEvidence.records).toHaveLength(1);
  });
  it('same child ID under different parent scopes remains separate', () => {
    const c = setup({ ...base, notes: [noteEvidence('a'),noteEvidence('b')] },JSON.stringify(base),['notes:1','notes:0','notes:1:evidence:0','notes:0:evidence:0']).candidate();
    expect(c.status).toBe('PASS'); expect(JSON.parse(c.raw!).notes.map((n:{id:string})=>n.id)).toEqual(['a','b']);
  });
  it.each([
    ['duplicate selection', { ...base,history:[history('a')] }, ['history:0','history:0']],
    ['duplicate IDs', { ...base,history:[history('a'),history('a')] }, ['history:0']],
    ['child alone', { ...base,notes:[noteEvidence()] }, ['notes:0:evidence:0']],
    ['settings', base, ['settings']],
    ['missing reference', { ...base,formulaReports:{version:1,entries:[report()]} }, ['reports:0']],
    ['unknown field', { ...base,notes:[{...note(),futureRef:'unknown'}] }, ['notes:0']],
    ['blocked plus unknown', { ...base,notes:[noteEvidence(),{...note('future'),futureRef:'unknown'}] }, ['notes:0:evidence:0','notes:1']],
  ])('refuses %s with no successful payload', (_name,data,keys) => {
    const c=setup(data,JSON.stringify(base),keys).candidate(); expect(c.status).not.toBe('PASS'); expect(c.raw).toBeNull(); expect(c.executionAllowed).toBe(false);
    if (_name === 'blocked plus unknown') {expect(c.reasons.length).toBeGreaterThan(0);expect(c.unknowns.length).toBeGreaterThan(0);}
  });
  it('missing optional collection is BLOCKED rather than generated',()=>{
    const c=setup({...base,formulaLibrary:{version:1,entries:[formula()],selectedId:null}},JSON.stringify(base),['formulas:0']).candidate();expect(c.status).toBe('BLOCKED');expect(c.raw).toBeNull();
  });
  it.each(['9007199254740993','1.00000000000000001'])('unknown numeric %s is retained but cannot certify a candidate', token=>{
    const raw=JSON.stringify({...base,history:[history('new')]}).replace('"result":2',`"result":${token}`);
    const f=setup(undefined,JSON.stringify(base),['history:0'],raw);expect(f.candidate().status).not.toBe('PASS');expect(f.context.backupText).toBe(wrap(raw));
  });
  it('does not treat -0 as unchanged 0 and preserves source -0 spelling',()=>{
    const data={...base,history:[history('a',0)]};const raw=JSON.stringify(data).replace('"result":0','"result":-0');
    const c=setup(data,JSON.stringify(data),['history:0'],raw).candidate();expect(c.status).toBe('PASS');expect(c.raw).toContain('"result":-0');
  });
  it('modified supplied plan cannot bypass revalidation',()=>{
    const f=setup();f.plan.items[0].after={};expect(f.candidate().status).toBe('STALE');
  });
  it('generation is pure and leaves backup/current/recovery and all storage methods untouched',()=>{
    const get=vi.fn(()=>{throw Error('no IO')});const set=vi.fn();const remove=vi.fn();const clear=vi.fn();
    vi.stubGlobal('localStorage',{getItem:get,setItem:set,removeItem:remove,clear});
    const f=setup();const before=JSON.stringify(f.context);f.candidate();expect(JSON.stringify(f.context)).toBe(before);for(const fn of [get,set,remove,clear])expect(fn).not.toHaveBeenCalled();vi.unstubAllGlobals();
  });
});

describe('fresh preflight exact identity, no stale PASS or IO authorization',()=>{
  it('recomputes a valid candidate on two fresh reads and ignores selection order',()=>{
    const f=setup({...base,history:[history('a'),history('b')]},JSON.stringify(base),['history:1','history:0']);
    const read=vi.fn(()=>({...f.context,selectedKeys:['history:0','history:1']}));const r=revalidateSafety(f.candidate(),read);
    expect(r.status).toBe('PASS');expect(r.executionAllowed).toBe(false);expect(read).toHaveBeenCalledTimes(2);
  });
  it.each(['currentRaw','backupText','backupIdentity','selectedKeys','generation','epoch','planRuleVersion','safetyRuleVersion','unsaved'] as const)('invalidates changed %s even with old PASS',field=>{
    const f=setup();const c=f.candidate();const changed={...f.context,[field]:field==='selectedKeys'?[]:field==='unsaved'?true:typeof f.context[field]==='number'?999:String(f.context[field])+' '};
    expect(revalidateSafety(c,()=>changed).status).toBe('STALE');
  });
  it('rejects change during validation including observed ABA via epoch',()=>{
    const f=setup();let n=0;expect(revalidateSafety(f.candidate(),()=>({...f.context,epoch:n++?5:4})).status).toBe('STALE');
  });
  it('reading failure is UNKNOWN rather than success',()=>{
    const f=setup();expect(revalidateSafety(f.candidate(),()=>{throw Error('denied');}).status).toBe('UNKNOWN');
  });
  it.each(['raw','edits','preserved'] as const)('detects forged candidate %s',field=>{
    const f=setup();const c=f.candidate();if(field==='raw')c.raw+=' ';else c[field]=[];
    expect(revalidateSafety(c,()=>f.context).status).toBe('BLOCKED');
  });
  it('unsaved editing is independently BLOCKED at preparation',()=>{
    const f=setup();expect(generateSafetyCandidate({...f.context,unsaved:true},f.plan).status).toBe('BLOCKED');
  });
});

it('snapshots reader values so a mutable second-read object cannot hide a selection change',()=>{
 const f=setup();const shared={...f.context,selectedKeys:[...f.context.selectedKeys]};let reads=0;
 expect(revalidateSafety(f.candidate(),()=>{if(reads++)shared.selectedKeys.length=0;return shared;}).status).toBe('STALE');
});
it('refuses stale rule version and changed backup text even if parsed data is identical',()=>{
 const f=setup();expect(generateSafetyCandidate({...f.context,planRuleVersion:0},f.plan).status).toBe('STALE');
 const c=f.candidate();expect(revalidateSafety(c,()=>({...f.context,backupText:f.context.backupText+' '})).status).toBe('STALE');
});
it('handles REPLACE of the final array item and ADD adjacent to the same endpoint without overlap',()=>{
 const f=setup({...base,history:[history('old',3),history('new')]},JSON.stringify({...base,history:[history('old')]}),['history:1','history:0']);
 const c=f.candidate();expect(c.status).toBe('PASS');expect(c.edits).toHaveLength(2);expect(JSON.parse(c.raw!).history.map((h:{result:number})=>h.result)).toEqual([3,2]);
});
it.each(['notes','formulas','executions','reports'])('parent %s REPLACE retains reference IDs and unselected collections',category=>{
 const common={...base,notes:[note()],formulaLibrary:{version:1,entries:[formula()],selectedId:'f'},formulaExecutions:[{formulaId:'f',expression:'x+1',inputs:{x:'2'}}],formulaReports:{version:1,entries:[report()]}};
 if(category==='formulas'){common.formulaExecutions=[];common.formulaReports.entries=[];}
 const data=structuredClone(common);
 if(category==='notes')data.notes[0].content='replacement';if(category==='formulas')data.formulaLibrary.entries[0].title='replacement';if(category==='executions')data.formulaExecutions[0].inputs.x='3';if(category==='reports')data.formulaReports.entries[0].body='replacement';
 const f=setup(data,JSON.stringify(common,null,2),[`${category}:0`]);const c=f.candidate();expect(c.status).toBe('PASS');expect(c.edits).toHaveLength(1);expect(verifyPreservedRanges(f.context.currentRaw!,c.raw!,c.preserved)).toBe(true);
});

it('formula replacement with unselected dependents is UNKNOWN rather than bypassing same-ID reference content checks',()=>{
 const common={...base,formulaLibrary:{version:1,entries:[formula()],selectedId:null},formulaExecutions:[{formulaId:'f',expression:'x+1',inputs:{x:'2'}}]};
 const data={...common,formulaLibrary:{...common.formulaLibrary,entries:[{...formula(),title:'changed'}]}};
 const c=setup(data,JSON.stringify(common),['formulas:0']).candidate();expect(c.status).toBe('UNKNOWN');expect(c.raw).toBeNull();
});
it('retains the actual application protection reason and invalidates any changed condition',()=>{
 const f=setup();const blocked=generateSafetyCandidate({...f.context,blockedReason:'現在の保存状態が未確認または保存保護中'},f.plan);
 expect(blocked.status).toBe('BLOCKED');expect(blocked.reasons).toContain('現在の保存状態が未確認または保存保護中');expect(revalidateSafety(f.candidate(),()=>({...f.context,blockedReason:'保護'})).status).toBe('STALE');
});
