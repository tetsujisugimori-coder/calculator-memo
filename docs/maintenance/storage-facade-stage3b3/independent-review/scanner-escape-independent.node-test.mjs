import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scanWriterSources } from '../../../../e2e/storage-writer-boundary.mjs';
const controls={
  propertyEscape:{'lib/writer.js':'const box={}; box.store=localStorage; box.store["x"]="y";'},
  importedUntypedFunction:{'lib/escape.js':'export default function(s){s["x"]="y"}','lib/writer.js':'import f from "./escape"; f(localStorage);'},
};
for(const [name,sources] of Object.entries(controls))test(`independent escape control rejects ${name}`,()=>{
  assert.ok(scanWriterSources(sources).length>0,`direct writer was incorrectly accepted: ${JSON.stringify(sources)}`);
});
