import { noteVariableInputs } from "../lib/formula-execution";
import { describe, expect, it } from 'vitest';
import { analyzeBlockDependencies, isManualMemo, markCalculationsStale, recalculateReferenceMemo, staleBlockIds, MAX_GRAPH_BLOCKS } from '../lib/block-references';
import { blocksToMarkdown, calculateMemoBlock, recalculateMemoBlocks, sanitizeMemoBlocks } from '../lib/memo-blocks';
import { defaultData, loadData, saveData, STORAGE_KEY } from '../lib/storage';
import type { CalculationMemoBlock, MemoBlock, StoredData } from '../lib/types';
const legacy = (id: string, expression: string, mode?: string) => calculateMemoBlock(id, expression, mode);
const ref = (id: string, expression: string, ids: string[] = []): CalculationMemoBlock => ({ id, type: 'calculation', evaluationMode: 'block-references', expression, references: { version: 1, entries: ids.map((blockId, i) => ({ slot: i + 1, blockId })) }, displayExpression: expression, result: null, resultText: '', error: null });
const calc = (blocks: MemoBlock[], id: string) => blocks.find(b => b.id === id) as CalculationMemoBlock;
const data = (blocks: MemoBlock[]): StoredData => ({ ...structuredClone(defaultData), notes: [{ id: 'memo', type: 'plain-calculation', title: 'Synthetic', content: '', blocks, calculationPolicy: { version: 1, mode: 'manual' }, createdAt: '', updatedAt: '' }] });
const storage = (initial: string) => { let raw = initial; return { getItem: () => raw, setItem: (_: string, value: string) => { raw = value; }, raw: () => raw }; };

describe('manual block reference foundation', () => {
  it.each([false, true])('forward/backward ID reference (reverse=%s)', reverse => {
    const input = [legacy('source', 'sqrt(2)'), ref('target', '@{1} * @{1}', ['source'])];
    if (reverse) input.reverse();
    const result = recalculateReferenceMemo(input);
    expect(result.success).toBe(true);
    expect(calc(result.blocks, 'target').result).toBe(Math.sqrt(2) * Math.sqrt(2));
    expect(calc(result.blocks, 'target').resultText).toBe('2');
    expect(calc(result.blocks, 'source').result).toBe(Math.sqrt(2));
    expect(staleBlockIds(result.blocks).size).toBe(0);
    expect(new Set(result.evaluated).size).toBe(result.evaluated.length);
  });
  it('multiple sources, diamonds and indirect references evaluate each block once', () => {
    const input = [ref('d', '@{1}+@{2}', ['b','c']), ref('c','@{1}*3',['a']), legacy('a','4'), ref('b','@{1}*2',['a'])];
    const result = recalculateReferenceMemo(input);
    expect(result.success).toBe(true); expect(calc(result.blocks,'d').result).toBe(20);
    expect(result.evaluated.sort()).toEqual(['a','b','c','d']);
    expect(analyzeBlockDependencies(input).dependencies.get('d')).toEqual(['b','c']);
  });
  it('manual editing and save-time compatibility helper never evaluates', () => {
    const initial = recalculateReferenceMemo([legacy('a','2'),ref('b','@{1}+1',['a'])]).blocks;
    const edited = initial.map(b => b.id === 'a' ? { ...b, expression:'7' } : b);
    const pending = markCalculationsStale(edited);
    expect(calc(recalculateMemoBlocks(pending),'b').result).toBe(3);
    expect(staleBlockIds(pending)).toEqual(new Set(['a','b']));
    expect(blocksToMarkdown(pending)).toContain('再計算待ち');
    expect(calc(recalculateReferenceMemo(pending).blocks,'b').result).toBe(8);
    expect(calc(initial,'a').expression).toBe('2');
  });
  it('detects edited JSON even when current status was retained', () => {
    const initial = recalculateReferenceMemo([legacy('a','2'),ref('b','@{1}+1',['a'])]).blocks;
    const edited = initial.map(b => b.id === 'a' ? { ...b, expression:'7' } : b);
    expect(staleBlockIds(edited)).toEqual(new Set(['a','b']));
    const changedResult = initial.map(b => b.id === 'a' ? { ...b, result:7 } : b);
    expect(staleBlockIds(changedResult)).toEqual(new Set(['a','b']));
  });
  it.each(['self','two','missing','non-calculation'])('rejects %s dependency before committing any values', kind => {
    const input: MemoBlock[] = kind === 'self' ? [ref('a','@{1}',['a'])] : kind === 'two' ? [ref('a','@{1}',['b']),ref('b','@{1}',['a'])] : kind === 'missing' ? [ref('a','@{1}',['gone'])] : [{id:'text',type:'text',content:'5'},ref('a','@{1}',['text'])];
    const result = recalculateReferenceMemo(input);
    expect(result.success).toBe(false); expect(result.evaluated).toEqual([]);
    expect(calc(result.blocks,'a').result).toBeNull();
    expect(calc(result.blocks,'a').evaluationState?.status).toBe('stale');
  });
  it('failure keeps all previous results, including successful earlier candidates', () => {
    const initial = recalculateReferenceMemo([legacy('a','2'),ref('b','@{1}+1',['a'])]).blocks;
    const input = initial.map(b => b.id === 'a' ? {...b,expression:'10'} : {...b,expression:'1/0'});
    const result = recalculateReferenceMemo(input);
    expect(result.success).toBe(false); expect(calc(result.blocks,'a').result).toBe(2); expect(calc(result.blocks,'b').result).toBe(3);
    expect(calc(result.blocks,'a').evaluationState?.attemptError).toBeTruthy();
    expect(calc(recalculateReferenceMemo(result.blocks.map(b => b.id === 'b' ? {...b,expression:'@{1}+1'} : b)).blocks,'b').result).toBe(11);
  });
  it('source errors propagate and unrelated empty blocks prevent partial commits', () => {
    for (const expression of ['1/0', 'sqrt(-1)', '2^10001', '']) {
      const result = recalculateReferenceMemo([legacy('a',expression),ref('b','@{1}',['a'])]);
      expect(result.success).toBe(false); expect(calc(result.blocks,'b').evaluationState?.attemptError).toBeTruthy();
    }
    expect(recalculateReferenceMemo([legacy('empty',''),ref('ok','2+2')]).success).toBe(false);
  });
  it('legacy variable ordering retained; moving ID reference does not affect values', () => {
    const input = [legacy('a','x=2','note-variables'),legacy('b','x*3','note-variables'), ref('c','@{1}+1',['b'])];
    const first = recalculateReferenceMemo(input); expect(calc(first.blocks,'c').result).toBe(7);
    const moved = [first.blocks[2],first.blocks[0],first.blocks[1]];
    expect(staleBlockIds(moved).size).toBe(0);
    expect(calc(recalculateReferenceMemo(moved).blocks,'c').result).toBe(7);
    const reordered = [first.blocks[1],first.blocks[0],first.blocks[2]];
    expect(staleBlockIds(reordered).has('c')).toBe(true);
    expect(recalculateReferenceMemo(reordered).success).toBe(false);
    const edited = first.blocks.map(b => b.id === 'a' ? {...b,expression:'x=4'} : b);
    expect(staleBlockIds(edited).has('c')).toBe(true);
    expect(calc(recalculateReferenceMemo(edited).blocks,'c').result).toBe(13);
  });
  it('deleted source remains broken, not rebound to block in its position', () => {
    const result = recalculateReferenceMemo([legacy('a','2'),ref('b','@{1}',['a'])]);
    const edited = [...result.blocks.filter(b => b.id !== 'a'),legacy('replacement','99')];
    expect(recalculateReferenceMemo(edited).success).toBe(false);
    expect(calc(edited,'b').references?.entries[0].blockId).toBe('a');
  });
  it.each(['price+1','libraryName(2)','ReferenceValue1','@{0}','@{999}','@{1}.value','@{1}=2','@{1};2','@{1}[0]','2@{1}','@{1}^10001','sqrt(-@{1})'])('rejects unsafe or ambiguous syntax %s', expression => {
    expect(recalculateReferenceMemo([legacy('a','2'),ref('b',expression,['a'])]).success).toBe(false);
  });
  it('graph limit and long expression safety are bounded', () => {
    expect(recalculateReferenceMemo(Array.from({length:MAX_GRAPH_BLOCKS+1},(_,i)=>ref(String(i),'1'))).success).toBe(false);
    expect(recalculateReferenceMemo([ref('a','1+'.repeat(1001)+'1')]).success).toBe(false);
    const input = Array.from({length:MAX_GRAPH_BLOCKS},(_,i)=>ref(String(i),i?'@{1}+1':'1',i?[String(i-1)]:[])).reverse();
    const result = recalculateReferenceMemo(input); expect(result.success).toBe(true); expect(calc(result.blocks,String(MAX_GRAPH_BLOCKS-1)).result).toBe(MAX_GRAPH_BLOCKS);
  });
  it('special ID strings do not mutate prototypes or collide with variable names', () => {
    const input = [legacy('__proto__','3'),ref('constructor','@{1}*2',['__proto__'])];
    expect(calc(recalculateReferenceMemo(input).blocks,'constructor').result).toBe(6);
  });
  it('JSON roundtrip and storage keep exact numbers and unknown descriptive metadata', () => {
    const original = {...ref('b','@{1}*2',['a']),proofRef:'proof',metadata:{nested:[1,'x']},sourceId:'source'};
    const input = [legacy('a','sqrt(2)'),original];
    const result = recalculateReferenceMemo(input);
    const memory = storage(JSON.stringify(data(result.blocks)));
    const loaded = loadData(memory); expect(loaded.status).toBe('ok');
    if(loaded.status !== 'ok') throw new Error('load failed');
    expect(saveData(loaded.data,memory)).toBe(true);
    const roundtrip = loadData(memory); expect(roundtrip.status).toBe('ok');
    const restored = JSON.parse(memory.raw()).notes[0].blocks;
    expect(calc(restored,'b').result).toBe(Math.sqrt(2)*2);
    expect(calc(restored,'b')).toMatchObject({proofRef:'proof',metadata:{nested:[1,'x']},sourceId:'source'});
    expect(staleBlockIds(restored).size).toBe(0); expect(original.result).toBeNull();
  });
  it.each([{version:2,entries:[]},{version:1,entries:[{slot:1,blockId:'a'},{slot:1,blockId:'b'}]},{version:1,entries:[{slot:1,blockId:4}]},null])('unknown/malformed references fail closed without raw changes', references => {
    const block = {...ref('a','1'),references};
    const raw = JSON.stringify(data([block as CalculationMemoBlock])); const memory = storage(raw);
    const loaded = loadData(memory); expect(loaded.status).toBe('error'); expect('raw' in loaded && loaded.raw).toBe(raw);
    expect(saveData(data([block as CalculationMemoBlock]),memory)).toBe(false); expect(memory.raw()).toBe(raw);
  });
  it('formula-library import uses confirmed manual values and rejects stale values', () => {
    const blocks = recalculateReferenceMemo([legacy('a','x=2','note-variables'),ref('b','@{1}',['a'])]).blocks;
    const note = data(blocks).notes[0];
    if (note.type !== 'plain-calculation') throw new Error('wrong note');
    expect(noteVariableInputs(note)).toEqual({x:'2'});
    note.blocks = blocks.map(b => b.id === 'a' ? {...b,expression:'x=7'} : b);
    expect(() => noteVariableInputs(note)).toThrow('再計算待ち');
  });
  it.each([['current'], {toString:'current'}, 1, null])('invalid status type remains protected: %j', status => {
    const b = {...ref('a','1'),evaluationState:{version:1,status}};
    const raw = JSON.stringify(data([b as unknown as CalculationMemoBlock])); const memory=storage(raw);
    expect(loadData(memory).status).toBe('error'); expect(saveData(data([b as unknown as CalculationMemoBlock]),memory)).toBe(false); expect(memory.raw()).toBe(raw);
  });
  it('old data and unknown mode/block protection remain intact', () => {
    expect(isManualMemo([legacy('a','2')])).toBe(false);
    expect(recalculateMemoBlocks([legacy('a','2')])[0]).toEqual(legacy('a','2'));
    expect(sanitizeMemoBlocks([{...ref('a','1'),evaluationState:{version:2,status:'current'}}])).toBeUndefined();
    for(const block of [{...ref('a','1'),evaluationMode:'future'}, {id:'a',type:'future'}]) expect(loadData(storage(JSON.stringify(data([block as CalculationMemoBlock])))).status).toBe('error');
    expect(STORAGE_KEY).toBe('calculation-memo:data');
  });
});
