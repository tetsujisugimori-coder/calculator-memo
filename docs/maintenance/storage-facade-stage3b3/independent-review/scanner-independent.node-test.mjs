import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scanWriterSources } from '../../../../e2e/storage-writer-boundary.mjs';
const controls={
  exportedAlias:{'lib/source.ts':'const store=localStorage; export { store };','lib/writer.ts':'import { store } from "./source"; store["unexpected-key"]="unexpected-value";'},
  parameterEscape:{'lib/writer.ts':'function write(s:any){s["unexpected-key"]="unexpected-value";} write(localStorage);'},
  importedType:{'lib/types.ts':'export type Store=Storage;','lib/writer.ts':'import type {Store} from "./types"; export function write(s:Store){s["unexpected-key"]="unexpected-value";}'},
  pathAliasExcluded:{'lib/writer.ts':'import {unapproved} from "@/tests/leak"; unapproved();','tests/leak.ts':'export const unapproved=()=>localStorage.setItem("x","y");'},
};
for(const [name,sources] of Object.entries(controls))test(`independent negative control rejects ${name}`,()=>{
  const failures=scanWriterSources(sources);
  assert.ok(failures.length>0,`direct writer was incorrectly accepted: ${JSON.stringify(sources)}`);
});
