import { describe, expect, it } from 'vitest';
import type { EvidenceRecord } from '../lib/calculation-evidence';
import { compareEvidenceRecords, buildEvidenceComparisonMarkdown } from '../lib/evidence-comparison';
import { analyzeEvidenceImpact } from '../lib/evidence-impact';
import { appendEvidenceImpactMarkdown } from '../lib/evidence-impact-markdown';
import { REPORT_OUTPUT_CHARACTER_LIMIT } from '../lib/markdown-report';
const record = (id: string, value = '100'): EvidenceRecord => ({id, calculatedAt: '2026-10-22T00:00:00.000Z', persistedAt: '2026-10-22T00:01:00.000Z', evaluator:'calculator-memo-v1', status:'confirmed', blocks:[
  {blockId:'A',position:1,expression:'a='+value,evaluationMode:'note-variables',inputs:[],result:value,resultText:value,status:'success'},
  {blockId:'B',position:2,expression:'a+50',evaluationMode:'note-variables',inputs:[{kind:'variable',name:'a',sourceBlockId:'A',value}],result:'150',resultText:'150',status:'success'},
]});
const output = (a=record('before'),b=record('after','120')) => { const comparison=compareEvidenceRecords(a,b);const impact=analyzeEvidenceImpact(comparison);return appendEvidenceImpactMarkdown(buildEvidenceComparisonMarkdown({id:'memo',title:'例'},comparison),comparison,impact); };
describe('impact Markdown',()=>{
  it('includes independent classification, both path provenance and actual edge evidence',()=>{const md=output().markdown;for(const text of ['保存記録の変更影響分析','直接変更（観測差分）','結果差分','波及変更候補','変更前の経路','変更後の経路','A → B','内部使用値 100','内部使用値 120','全経路の列挙ではありません','未記入'])expect(md).toContain(text);});
  it('preserves original comparison and filename, and never mutates records',()=>{const a=record('before'),b=record('after');const raw=JSON.stringify([a,b]);const c=compareEvidenceRecords(a,b),base=buildEvidenceComparisonMarkdown({id:'memo',title:'例'},c);const result=appendEvidenceImpactMarkdown(base,c,analyzeEvidenceImpact(c));expect(result.markdown.startsWith(base.markdown)).toBe(true);expect(result.filename).toBe(base.filename);expect(JSON.stringify([a,b])).toBe(raw);});
  it('escapes hostile IDs and dynamically fences path content',()=>{const a=record('before'),b=record('after','120');for(const r of [a,b]){r.blocks[0].blockId='A\n```\n<img src=x>';r.blocks[1].inputs[0].sourceBlockId=r.blocks[0].blockId;}const md=output(a,b).markdown;expect(md).toContain('&lt;img src=x&gt;');expect(md).toContain('````text');expect(md).not.toContain('### A\n```');});
  it('marks inconsistent captured values unknown without replacing recorded values',()=>{const b=record('after');b.blocks[1].inputs[0].value='999';const md=output(record('before'),b).markdown;expect(md).toContain('判定不能');expect(md).toContain('999');expect(md).toContain('一致しません');});
  it('rejects oversized combined output rather than truncating it',()=>{const c=compareEvidenceRecords(record('before'),record('after'));expect(()=>appendEvidenceImpactMarkdown({markdown:'x'.repeat(REPORT_OUTPUT_CHARACTER_LIMIT-1),filename:'a.md',warnings:[]},c,analyzeEvidenceImpact(c))).toThrow('上限');});
  it('result-only changes do not imply direct or propagation roots',()=>{const b=record('after');b.blocks[1].result='151';const md=output(record('before'),b).markdown;expect(md).toContain('直接変更（観測差分）: 0');expect(md).toContain('波及変更候補: 0');expect(md).toContain('結果差分: 1');});
});
