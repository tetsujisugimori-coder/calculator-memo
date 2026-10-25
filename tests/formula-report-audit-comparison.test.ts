import { describe, expect, it } from 'vitest';
import { captureAuditComparison, compareAuditRecords, validateAuditComparisonSnapshot, type AuditComparableRecord, type AuditComparisonSnapshot } from '../lib/formula-report-audit-comparison';
import { compareEvidenceRecords } from '../lib/evidence-comparison';
import { parseReportAudit, assessReportAudit } from '../lib/formula-report-audit';
import { createQuoteMarkdown } from '../lib/formula-report-quotes';
import type { EvidenceRecord } from '../lib/calculation-evidence';
const at = '2026-10-25T00:00:00.000Z';
const record = (): EvidenceRecord => ({ id:'r', evaluator:'calculator-memo-v1',status:'confirmed',calculatedAt:at,persistedAt:at,blocks:[
  {blockId:'a',position:1,expression:'1',inputs:[],result:'1',resultText:'1',status:'success'},
  {blockId:'b',position:2,expression:'a+1',inputs:[{kind:'variable',name:'a',sourceBlockId:'a',value:'1'}],result:'2',resultText:'2',status:'success'},
] });
const snapshot = (): AuditComparisonSnapshot => ({version:1,state:'checked',acquisitionStatus:'ok',complete:true,reason:'known',fetchedAt:at,items:[{id:'q',kind:'quote',bodyStatus:'intact',reason:'known',sources:[{side:'quote',memoId:'m',blockId:'b',status:'matched',reason:'known',linked:true,frozen:record(),observed:record()}]}]});
const pair = (): [AuditComparableRecord, AuditComparableRecord] => [{recordId:'A',formulaId:'f',reportId:'p',snapshot:snapshot()},{recordId:'B',formulaId:'f',reportId:'p',snapshot:snapshot()}];
const mutateRecords = (b: AuditComparableRecord, action:(value:EvidenceRecord)=>void) => { const s=b.snapshot!.items[0].sources[0]; action(s.frozen); action(s.observed!); };

describe('fixed audit two-record comparison', () => {
  it('compares complete identical known data with no mutation and preserves same source record identity', () => {
    const [a,b]=pair(); const original=JSON.stringify([a,b]); const result=compareAuditRecords(a,b);
    expect(result.states).toEqual(['matched']); expect(result.rows[0].sources[0].frozen?.before.id).toBe('r'); expect(JSON.stringify([a,b])).toBe(original);
  });
  it.each([
    ['expression',(r:EvidenceRecord)=>{r.blocks[1].expression='1+1';},'expression'],
    ['input value',(r:EvidenceRecord)=>{r.blocks[1].inputs[0].value='2';},'values'],
    ['internal result',(r:EvidenceRecord)=>{r.blocks[1].result='2.0000000000000004';},'internalResult'],
    ['display result',(r:EvidenceRecord)=>{r.blocks[1].resultText='2.0';},'displayResult'],
    ['body order',(r:EvidenceRecord)=>{r.blocks[0].position=2;r.blocks[1].position=1;},'bodyOrder'],
  ] as const)('detects %s without requiring different final results', (_name,action,change) => {
    const [a,b]=pair(); mutateRecords(b,action); const result=compareAuditRecords(a,b);
    expect(result.states).toContain('changed'); expect(result.rows[0].sources[0].frozen?.rows.flatMap(row=>row.changes)).toContain(change);
    if(change==='displayResult') expect(result.rows[0].sources[0].frozen?.rows.flatMap(row=>row.changes)).not.toContain('internalResult');
  });
  it('detects actual source ID change independently of equal used value',()=>{
    const [a,b]=pair(); for(const item of [a,b]) mutateRecords(item,r=>{r.blocks.splice(1,0,{...r.blocks[0],blockId:'c',position:3});});
    mutateRecords(b,r=>{r.blocks[2].inputs[0].sourceBlockId='c';});
    expect(compareAuditRecords(a,b).rows[0].sources[0].frozen?.rows.flatMap(row=>row.changes)).toContain('sources');
  });
  it('detects reference target definitions without claiming internal result changed',()=>{
    const [a,b]=pair();mutateRecords(a,r=>{r.blocks[1].references={version:1,entries:[{slot:1,blockId:'a'}]};});mutateRecords(b,r=>{r.blocks[1].references={version:1,entries:[{slot:1,blockId:'elsewhere'}]};});
    const source=compareAuditRecords(a,b).rows[0].sources[0];expect(source.changes).toContain('固定snapshotの参照先ID定義'); expect(source.frozen?.rows.flatMap(r=>r.changes)).not.toContain('internalResult');
  });
  it('compares observed source changes separately from unchanged historical snapshots',()=>{
    const [a,b]=pair();const source=b.snapshot!.items[0].sources[0];source.observed!.blocks[1].expression='2';source.status='changed';
    const compared=compareAuditRecords(a,b).rows[0].sources[0];expect(compared.frozen?.counts.changed).toBe(0);expect(compared.observed?.counts.changed).toBe(1);
  });
  it.each(['missing','unavailable','invalid'] as const)('retains %s alongside a status change',status=>{
    const [a,b]=pair();const source=b.snapshot!.items[0].sources[0];source.status=status;delete source.observed;
    const result=compareAuditRecords(a,b); expect(result.states).toContain(status==='invalid'?'unknown':status);expect(result.states).toContain('changed');expect(result.states).toContain('incomparable');
  });
  it('does not replace missing observed record with a fixed snapshot',()=>{
    const [a,b]=pair();const source=b.snapshot!.items[0].sources[0];source.status='unverified';delete source.observed;
    const result=compareAuditRecords(a,b);expect(result.rows[0].sources[0].observed).toBeUndefined();expect(result.states).toContain('incomparable');
  });
  it('retains source-side separation for before/after differences',()=>{
    const [a,b]=pair();for(const item of [a,b]){const old=item.snapshot!.items[0];old.kind='difference';old.sources=[{...old.sources[0],side:'before'},{...structuredClone(old.sources[0]),side:'after'}];old.sources.forEach(source=>delete source.blockId);}
    const sources=b.snapshot!.items[0].sources;sources[0].status='missing';delete sources[0].observed;sources[1].status='unavailable';delete sources[1].observed;
    const compared=compareAuditRecords(a,b).rows[0].sources;expect(compared[0].states).toContain('missing');expect(compared[1].states).toContain('unavailable');
  });
  it('matches by stable ID rather than array order',()=>{
    const [a,b]=pair();for(const item of [a,b]) item.snapshot!.items.push({...structuredClone(item.snapshot!.items[0]),id:'q2'});b.snapshot!.items.reverse();
    expect(compareAuditRecords(a,b).states).toEqual(['matched']);
  });
  it.each(['added','removed'] as const)('detects %s only for complete inventory',kind=>{
    const [a,b]=pair();(kind==='added'?b:a).snapshot!.items.push({...structuredClone(a.snapshot!.items[0]),id:'q2'});
    expect(compareAuditRecords(a,b).states).toContain(kind);a.snapshot!.complete=false;
    const partial=compareAuditRecords(a,b);expect(partial.states).toContain('incomparable');expect(partial.states).not.toContain(kind);
  });
  it.each(['duplicate','missing'] as const)('does not guess %s occurrence identity',mode=>{
    const [a,b]=pair();if(mode==='duplicate') b.snapshot!.items.push(structuredClone(b.snapshot!.items[0]));else { delete b.snapshot!.items[0].id;b.snapshot!.items[0].bodyStatus='untracked';b.snapshot!.items[0].sources=[]; }
    expect(compareAuditRecords(a,b).states).toContain('incomparable');expect(compareAuditRecords(a,b).states).not.toContain('removed');expect(compareAuditRecords(a,b).states).not.toContain('added');
  });
  it('retains related unlink change',()=>{const[a,b]=pair();b.snapshot!.items[0].sources[0].linked=false;expect(compareAuditRecords(a,b).rows[0].sources[0].changes).toContain('関連付け状態');});
  it('does not map blocks across different memo identities',()=>{const[a,b]=pair();b.snapshot!.items[0].sources[0].memoId='other';const source=compareAuditRecords(a,b).rows[0].sources[0];expect(source.states).toContain('incomparable');expect(source.frozen).toBeUndefined();});
  it('does not compare the same fixed record',()=>{const[a]=pair();expect(compareAuditRecords(a,a).states).toEqual(['incomparable']);});
  it.each(['formulaId','reportId'] as const)('rejects foreign %s at engine boundary',field=>{const[a,b]=pair();b[field]='foreign';expect(compareAuditRecords(a,b).states).toEqual(['incomparable']);});
  it('does not recover legacy missing structured data from prose or current values',()=>{const[a,b]=pair();delete a.snapshot;expect(compareAuditRecords(a,b).states).toEqual(['incomparable']);});
  it('unknown future formats are not certified',()=>{const[a,b]=pair();(b.snapshot as unknown as {version:number}).version=2;expect(compareAuditRecords(a,b).states).toContain('unknown');});
  it.each(['duplicate-side','invalid-block','missing-record','false-match','unknown-field','stale-observed'] as const)('rejects malformed %s data',kind=>{
    const s=snapshot();const source=s.items[0].sources[0];
    if(kind==='duplicate-side')s.items[0].sources.push(structuredClone(source));
    if(kind==='invalid-block')source.frozen.blocks.push(structuredClone(source.frozen.blocks[0]));
    if(kind==='missing-record')delete (source as Partial<typeof source>).frozen;
    if(kind==='false-match')source.observed!.blocks[1].expression='changed';
    if(kind==='unknown-field')Object.assign(s,{unknown:true});
    if(kind==='stale-observed')s.state='stale';
    expect(validateAuditComparisonSnapshot(s)).toBe(false);
  });
  it('keeps default engine same-record rejection, explicit policy preserves actual IDs',()=>{
    const a=record(),b=record();expect(()=>compareEvidenceRecords(a,b)).toThrow();expect(compareEvidenceRecords(a,b,{allowSameRecordId:true}).before.id).toBe('r');
  });
  it.each(['\n','\r\n'])('captures shared analysis without parsing prose %j',newline=>{
    const body=createQuoteMarkdown({version:1,quoteId:'q',formulaId:'f',memoId:'m',blockId:'b',citedAt:at,record:record()}).replace(/\n/g,newline);
    const inventory=parseReportAudit(body,'f');const payload=captureAuditComparison(inventory,inventory.items,'unverified');
    expect(payload.items[0].id).toBe('q');expect(payload.items[0].sources[0].frozen.blocks[1].expression).toBe('a+1');expect(payload.items[0].sources[0].observed).toBeUndefined();expect(payload.fetchedAt).toBeUndefined();
  });
  it('captures acquisition failure as unavailable rather than missing',()=>{
    const body=createQuoteMarkdown({version:1,quoteId:'q',formulaId:'f',memoId:'m',blockId:'b',citedAt:at,record:record()});const inventory=parseReportAudit(body,'f');
    const items=assessReportAudit(inventory,{notes:[],links:[],error:'synthetic'});const payload=captureAuditComparison(inventory,items,'checked',at,'unavailable');
    expect(payload.items[0].sources[0].status).toBe('unavailable');expect(payload.fetchedAt).toBe(at);
  });
  it('stale capture strips prior observed success and acquisition date',()=>{
    const body=createQuoteMarkdown({version:1,quoteId:'q',formulaId:'f',memoId:'m',blockId:'b',citedAt:at,record:record()});const inventory=parseReportAudit(body,'f');
    inventory.items[0].sources[0]={side:'quote',status:'matched',reason:'old',record:record(),linked:true};const payload=captureAuditComparison(inventory,inventory.items,'stale',at);
    expect(payload.fetchedAt).toBeUndefined();expect(payload.items[0].sources[0]).toMatchObject({status:'unverified'});expect(payload.items[0].sources[0].observed).toBeUndefined();
  });
  it('unknown evidence fields cannot receive a whole-record match',()=>{const[a,b]=pair();mutateRecords(b,r=>Object.assign(r,{futureMeaning:true}));const result=compareAuditRecords(a,b);expect(result.states).toContain('unknown');expect(result.states).toContain('incomparable');});
  it('rejects filtered or mixed-generation capture',()=>{const body=createQuoteMarkdown({version:1,quoteId:'q',formulaId:'f',memoId:'m',blockId:'b',citedAt:at,record:record()});const inventory=parseReportAudit(body,'f');expect(()=>captureAuditComparison(inventory,[],'unverified')).toThrow('全出現');const items=structuredClone(inventory.items);items[0].start+=1;expect(()=>captureAuditComparison(inventory,items,'unverified')).toThrow('全出現');});
  it('rejects intact difference missing a source side',()=>{const s=snapshot();s.items[0].kind='difference';s.items[0].sources[0].side='before';delete s.items[0].sources[0].blockId;expect(validateAuditComparisonSnapshot(s)).toBe(false);});
  it.each(['unavailable','invalid'] as const)('retains empty inventory acquisition %s',status=>{const[a,b]=pair();a.snapshot!.items=[];b.snapshot!.items=[];b.snapshot!.acquisitionStatus=status;const result=compareAuditRecords(a,b);expect(result.states).toContain(status==='invalid'?'unknown':status);expect(result.states).toContain('incomparable');expect(result.states).toContain('changed');});
  it('never infers successful empty acquisition from missing status',()=>{const[a,b]=pair();a.snapshot!.items=[];b.snapshot!.items=[];delete b.snapshot!.acquisitionStatus;const result=compareAuditRecords(a,b);expect(result.states).toContain('unknown');expect(result.states).not.toEqual(['matched']);});
  it('rejects stale acquisition status',()=>{const s=snapshot();s.state='stale';s.items=[];delete s.fetchedAt;expect(validateAuditComparisonSnapshot(s)).toBe(false);});
  it('rejects acquisition failure paired with matched source',()=>{const s=snapshot();s.acquisitionStatus='unavailable';expect(validateAuditComparisonSnapshot(s)).toBe(false);});
  it('drops acquisition status on stale capture',()=>{const inventory={items:[],complete:true,reason:'empty'};const s=captureAuditComparison(inventory,[],'stale',at,'ok');expect(s.acquisitionStatus).toBeUndefined();});
  it('keeps held body uncertainty independent from successful source checking',()=>{const[a,b]=pair();a.snapshot!.bodyContext={editing:false,unsavedChanges:false,savedContextChanged:false};b.snapshot!.bodyContext={editing:true,unsavedChanges:true,savedContextChanged:true};const result=compareAuditRecords(a,b);expect(result.changes).toContain('保存本文との一致確認制約');expect(result.changes).toContain('対象本文の編集状態');expect(result.limitations.some(value=>value.includes('保持した本文'))).toBe(true);});
  it('rejects partial body context without inferring false',()=>{const s=snapshot();Object.assign(s,{bodyContext:{editing:false}});expect(validateAuditComparisonSnapshot(s)).toBe(false);});
  it('legacy difference without original quote identity is not matched',()=>{const[a,b]=pair();for(const item of[a,b]){const row=item.snapshot!.items[0];row.kind='difference';row.sources=[{...row.sources[0],side:'before'},{...structuredClone(row.sources[0]),side:'after'}];row.sources.forEach(source=>delete source.blockId);}const result=compareAuditRecords(a,b);expect(result.states).toContain('incomparable');expect(result.states).not.toContain('changed');});
  it('rejects original quote target absent from its frozen record',()=>{const s=snapshot();const row=s.items[0];row.kind='difference';row.originQuoteId='q';row.originBlockId='absent';row.sources=[{...row.sources[0],side:'before'},{...structuredClone(row.sources[0]),side:'after'}];row.sources.forEach(source=>delete source.blockId);expect(validateAuditComparisonSnapshot(s)).toBe(false);});
  it('retains malformed occurrence with unknown identity instead of dropping it',()=>{
    const inventory={items:[{key:'x',kind:'quote' as const,start:0,end:1,order:1,bodyStatus:'invalid' as const,reason:'broken',canNavigate:false,sources:[],needsReview:true}],complete:false,reason:'broken'};
    const payload=captureAuditComparison(inventory,inventory.items,'unverified');expect(payload.items).toHaveLength(1);expect(payload.items[0].id).toBeUndefined();
  });
});
