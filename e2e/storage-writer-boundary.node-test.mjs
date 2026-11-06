import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { scanWriterSources, repositoryWriterBoundary, ADAPTER, FACADE } from './storage-writer-boundary.mjs';

test('all repository product writers respect the boundary', () => {
  assert.deepEqual(repositoryWriterBoundary().failures, []);
});
const bad = {
  directSet: 'localStorage.setItem("x", "y")',
  injectedSet: 'function write(storage: Pick<Storage,"setItem">) { storage.setItem("x","y") }',
  remove: 'window.localStorage.removeItem("x")',
  clear: 'sessionStorage.clear()',
  alias: 'const a = window.localStorage; const b = a; b.setItem("x","y")',
  methodAlias: 'const write = localStorage.setItem.bind(localStorage); write("x","y")',
  destructured: 'const { setItem: write } = localStorage; write("x","y")',
  computed: 'localStorage["set" + "Item"]("x","y")',
  constantName: 'const op="removeItem"; localStorage[op]("x")',
  unknownName: 'localStorage[method]("x","y")',
  propertyAssignment: 'localStorage.key = "y"',
  indexAssignment: 'window.localStorage["x"] = "y"',
  aliasedIndex: 'const s=localStorage; s[key]="y"',
  reassignedAlias: 'let s; s=localStorage; s[key]="y"',
  destructuredStorage: 'const {localStorage: s}=window; s[key]="y"',
  typedAlias: 'type Store=Pick<Storage,"getItem">; function f(s:Store) { (s as any)[key]="y" }',
  deleteProperty: 'delete localStorage["x"]',
  increment: 'localStorage["x"]++',
  reflect: 'Reflect.set(localStorage,"x","y")',
  assign: 'Object.assign(localStorage,{x:"y"})',
  define: 'Object.defineProperty(localStorage,"x",{value:"y"})',
  reflectGet: 'Reflect.get(localStorage,"setItem").call(localStorage,"x","y")',
  reflectStorage: 'const s=Reflect.get(window,"localStorage"); s.x="y"',
  descriptor: 'Object.getOwnPropertyDescriptor(Storage.prototype,"setItem").value.call(localStorage,"x","y")',
  objectEscape: 'const wrapper={store:localStorage}; wrapper.store.x="y"',
  objectShorthandEscape: 'const wrapper={localStorage}; wrapper.localStorage.x="y"',
  returnEscape: 'function get(){return localStorage}; get().x="y"',
  arrowEscape: 'const get=()=>localStorage; get().x="y"',
  arrayEscape: 'const [s]=[localStorage]; s.x="y"',
  exportEscape: 'export const store=localStorage;',
  cookie: 'document.cookie="a=b"',
  cookieStore: 'cookieStore.set("a","b")',
  indexedDB: 'indexedDB.open("db")',
  indexViaWindow: 'window["indexedDB"].open("db")',
  cache: 'caches.open("db")',
  opfs: 'navigator.storage.getDirectory()',
  filesystem: 'handle.createWritable()',
  serverDatabase: 'db.insert(table).values({x:1})',
  fsImport: 'import fs from "node:fs";',
  adapterBypass: 'import { adapter } from "./localstorage-adapter";',
  adapterReexport: 'export * from "./localstorage-adapter";',
  excludedImport: 'import { poc } from "../tests/storage-architecture/poc.mjs";',
  excludedDynamicImport: 'import("../examples/d1/app/api/notes/route")',
  unknownDynamicImport: 'import(path)',
  eval: 'eval(source)',
  newFunction: 'new Function(source)',
};
for (const [name, source] of Object.entries(bad)) test(`RED control rejects ${name}`, () => {
  assert.ok(scanWriterSources({ 'lib/unapproved-writer.ts': source }).length, source);
});
test('unclassified executable root requires explicit review', () => {
  assert.ok(scanWriterSources({ 'new-entry.ts': 'localStorage.setItem("x","y")' }).length);
});
test('reads, in-memory mutations and explicit external download are allowed', () => {
  assert.deepEqual(scanWriterSources({ 'lib/readers.ts': `
    const s=window.localStorage; const raw=s.getItem("x"); const n=s.length;
    const values=new Map(); values.set("x", 1); values.delete("x");
    const a=document.createElement("a"); a.href=URL.createObjectURL(new Blob([raw])); a.download="backup.json"; a.click();
    navigator.clipboard.writeText(raw);
  ` }), []);
});
test('only adapter native mutation and facade adapter import allowed', () => {
  assert.deepEqual(scanWriterSources({ [ADAPTER]: 'function set(storage:Storage) {storage.setItem("x","y"); storage.removeItem("x");}', [FACADE]: 'import {adapter} from "./localstorage-adapter"' }), []);
});
test('test fake storage and unconnected examples excluded, product imports denied', () => {
  assert.deepEqual(scanWriterSources({ 'tests/fake.ts': bad.directSet, 'e2e/fault.mjs': bad.directSet, 'examples/d1/app/api/notes/route.ts': bad.serverDatabase }), []);
});
test('real isolated repository GREEN -> injected direct writer RED -> removed GREEN', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'storage-writer-negative-'));
  try {
    execFileSync('git', ['init', '-q'], { cwd: root });
    mkdirSync(path.join(root, 'lib'));
    writeFileSync(path.join(root, 'lib/read.ts'), 'localStorage.getItem("x");');
    const script = fileURLToPath(new URL('./storage-writer-boundary.mjs', import.meta.url));
    const run = () => spawnSync(process.execPath, [script], { cwd: root, encoding: 'utf8' });
    const green = run(); assert.equal(green.status, 0, green.stdout + green.stderr);
    writeFileSync(path.join(root, 'lib/leak.ts'), 'const s=localStorage; s.setItem("x","unapproved");');
    const red = run(); assert.equal(red.status, 1); assert.match(red.stdout, /native-storage-mutator/);
    rmSync(path.join(root, 'lib/leak.ts'));
    assert.equal(run().status, 0);
  } finally { rmSync(root, { recursive: true, force: true }); }
});
