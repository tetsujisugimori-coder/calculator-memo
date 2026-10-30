import { describe, expect, it } from "vitest";
import { collectBackup, serializeBackup } from "../lib/backup";
import { MAX_RESTORE_FILE_BYTES, parseStrictJson, validateRestoreBackup } from "../lib/restore-validation";
const base = { version: 1, history: [], notes: [], settings: { theme: "light", activePanel: "history" } };
function envelope(raw = JSON.stringify(base)) { const r = collectBackup({ getItem: () => raw }); if (r.status !== "ready") throw Error("fixture"); return serializeBackup(r.backup); }
type MutableEnvelope = { format: string; formatVersion: number; appStorageVersion: number; acquisition: string; createdAt?: string; acquiredAt: string; entries: {key:string;raw:string|null;utf16CodeUnits:number;validation:string;counts:{notes:number}|null}[] };
function edit(fn: (v: MutableEnvelope) => void) { const v = JSON.parse(envelope()); fn(v); return JSON.stringify(v); }
describe("strict JSON restore acceptance", () => {
  it("accepts existing export with optional collections absent", () => { const r = validateRestoreBackup(envelope()); expect(r.ok).toBe(true); if(r.ok) expect(r.counts).toEqual({history:0,notes:0,formulas:0,reports:0,executions:0}); });
  it("keeps exact raw with whitespace, Unicode, escapes, unknown fields and huge numeric lexemes", () => {
    const raw = '{\n "version":1,"history":[],"notes":[],"settings":{"theme":"light","activePanel":"history"},"unknown":{"n":900719925474099312345,"over":1e999,"text":"日本語\\n😀\\uD800"}\n}';
    const r=validateRestoreBackup(envelope(raw)); expect(r.ok).toBe(true); if(r.ok) expect(r.raw).toBe(raw);
  });
  it.each(['{"a":1,"a":2}', '{"a":1,"\\u0061":2}', '{"x":[{"q":1,"q":2}]}', '{"__proto__":1,"__proto__":2}'])("rejects decoded duplicate keys %s", text => expect(()=>parseStrictJson(text)).toThrow());
  it.each(['', '{', '[1,]', '{"a":01}', 'true false', '{"a":NaN}', '{"a":"\n"}', '\ufeff{}'])("rejects invalid JSON %s", text => expect(()=>parseStrictJson(text)).toThrow());
  it("accepts unusual keys without prototype mutation",()=>{ const r=parseStrictJson('{"__proto__":{"x":1},"constructor":2}'); expect(Object.hasOwn(r as object,"__proto__")).toBe(true); expect(({} as {x?:number}).x).toBeUndefined(); });
  it("rejects depth overflow",()=>expect(()=>parseStrictJson('['.repeat(130)+'0'+']'.repeat(130))).toThrow());
  it.each([
    (v:MutableEnvelope)=>{v.format="other";}, (v:MutableEnvelope)=>{v.formatVersion=2;}, (v:MutableEnvelope)=>{v.appStorageVersion=2;}, (v:MutableEnvelope)=>{v.acquisition="failed";},
    (v:MutableEnvelope)=>{v.entries=[];}, (v:MutableEnvelope)=>{v.entries.push(v.entries[0]);}, (v:MutableEnvelope)=>{v.entries[0].key="other";}, (v:MutableEnvelope)=>{v.entries[0].raw=null;},
    (v:MutableEnvelope)=>{v.entries[0].utf16CodeUnits++;}, (v:MutableEnvelope)=>{v.entries[0].validation="invalid-data";}, (v:MutableEnvelope)=>{v.entries[0].counts!.notes=3;},
    (v:MutableEnvelope)=>{v.entries[0].counts=null;}, (v:MutableEnvelope)=>{delete v.createdAt;}, (v:MutableEnvelope)=>{v.acquiredAt="bad";},
  ])("rejects inconsistent envelope", mutate=>expect(validateRestoreBackup(edit(mutate)).ok).toBe(false));
  it("rejects duplicate raw and envelope fields",()=>{
    expect(validateRestoreBackup(envelope('{"version":1,"version":1,"history":[],"notes":[],"settings":{"theme":"light","activePanel":"history"}}')).ok).toBe(false);
    expect(validateRestoreBackup(envelope().replace('"format":', '"format":"calculator-memo-backup","format":')).ok).toBe(false);
  });
  it.each([{...base,version:2},{...base,settings:{}},{...base,settings:{...base.settings,identificationMode:"unknown"}},{...base,history:[{id:"h",expression:"1"}]},{...base,history:[null]},{...base,notes:[{id:"n",type:"plain-calculation",title:"",content:"",createdAt:"",updatedAt:""}]}])("rejects invalid or normalized app data",v=>expect(validateRestoreBackup(envelope(JSON.stringify(v))).ok).toBe(false));
  it("accepts all collections without calculating expressions",()=>{
    const date="2026-10-30T00:00:00Z";
    const raw=JSON.stringify({...base, history:[{id:"h",expression:"1+1",displayExpression:"1 + 1",result:999,resultText:"999",createdAt:date}],notes:[{id:"n",type:"plain-calculation",title:"メモ",content:"本文",createdAt:date,updatedAt:date}],formulaLibrary:{version:1,entries:[{id:"f",title:"式",expression:"x+1",createdAt:date,updatedAt:date}],selectedId:"f"},formulaExecutions:[{formulaId:"f",expression:"x+1",inputs:{x:"2"}}],formulaReports:{version:1,entries:[{id:"r",formulaId:"f",title:"報告",body:"本文",createdAt:date,updatedAt:date,confirmedExpression:null}]}});
    const r=validateRestoreBackup(envelope(raw)); expect(r.ok).toBe(true); if(r.ok){expect(r.raw).toBe(raw);expect(r.counts).toEqual({history:1,notes:1,formulas:1,reports:1,executions:1});}
  });
  it("rejects file limits and byte metadata mismatch",()=>{expect(validateRestoreBackup(envelope(),MAX_RESTORE_FILE_BYTES+1).ok).toBe(false);expect(validateRestoreBackup(envelope(),1).ok).toBe(false);});
});

it("checks raw separately and distinguishes unsupported/corrupt source from exportability", async () => {
  const {validateRestoreRaw} = await import("../lib/restore-validation");
  expect(validateRestoreRaw(JSON.stringify(base)).ok).toBe(true);
  expect(validateRestoreRaw('{').ok).toBe(false);
  expect(validateRestoreRaw('{"version":99}').ok).toBe(false);
  expect(validateRestoreRaw(' '.repeat(2*1024*1024+1)).ok).toBe(false);
});
it("rejects duplicate history IDs and invalid display dates without changing input", () => {
  const h={id:"h",expression:"1",displayExpression:"1",result:1,resultText:"1",createdAt:"2026-10-30T00:00:00Z"};
  expect(validateRestoreBackup(envelope(JSON.stringify({...base,history:[h,h]}))).ok).toBe(false);
  expect(validateRestoreBackup(envelope(JSON.stringify({...base,history:[{...h,createdAt:"invalid"}]}))).ok).toBe(false);
});
it("retains opaque fields at every supported level", () => {
 const date="2026-10-30T00:00:00Z";
 const raw=JSON.stringify({...base,settings:{...base.settings,extra:{anything:true}},notes:[{id:"n",type:"plain-calculation",title:"n",createdAt:date,updatedAt:date,content:"x",blocks:[{id:"b",type:"text",content:"x",future:[1,2]}],future:{snapshot:"unchanged"}}]});
 const r=validateRestoreBackup(envelope(raw)); expect(r.ok).toBe(true); if(r.ok)expect(r.raw).toBe(raw);
});
it("does not require linked reports to have currently present definitions", () => {
 const date="2026-10-30T00:00:00Z";
 const raw=JSON.stringify({...base,formulaReports:{version:1,entries:[{id:"r",formulaId:"old-removed-definition",title:"historic",body:"retained",createdAt:date,updatedAt:date,confirmedExpression:null}]}});
 expect(validateRestoreBackup(envelope(raw)).ok).toBe(true);
});
it("rejects reverse acquisition/creation dates",()=>expect(validateRestoreBackup(edit(v=>{v.acquiredAt="2099-01-01T00:00:00Z";})).ok).toBe(false));
it("accepts matching measured UTF-8 bytes and rejects noninteger size",()=>{
 const text=envelope();expect(validateRestoreBackup(text,new TextEncoder().encode(text).length).ok).toBe(true);expect(validateRestoreBackup(text,1.1).ok).toBe(false);
});

it.each([
 {theme:['light'],activePanel:'history'},
 {theme:'light',activePanel:['history']},
 {theme:{toString:'light'},activePanel:'history'},
 {theme:'light',activePanel:'history',identificationMode:['labels']},
])("rejects coercible but non-string known settings", settings => {
 expect(validateRestoreBackup(envelope(JSON.stringify({...base,settings}))).ok).toBe(false);
});
it("rejects coercible calculation note displayMode",()=>{
 const date='2026-10-30T00:00:00Z';
 const note={id:'n',schemaVersion:1,type:'calculation',title:'n',createdAt:date,updatedAt:date,expression:'1',displayExpression:'1',result:1,resultText:'1',latexExpression:null,unit:'',note:'',tags:[],relatedMemoName:'',displayMode:['plain']};
 expect(validateRestoreBackup(envelope(JSON.stringify({...base,notes:[note]}))).ok).toBe(false);
});
