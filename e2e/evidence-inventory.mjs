import { readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
const root = 'gui-evidence';
const files = [];
async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const name = path.join(directory, entry.name);
    if (entry.isDirectory()) await walk(name);
    else if (entry.isFile() && entry.name !== 'inventory.json') {
      const bytes = (await stat(name)).size;
      const kind = name.endsWith('.png') ? 'png' : name.endsWith('.zip') ? 'trace' : name.endsWith('.log') ? 'log' : name.endsWith('.json') ? 'json' : 'other';
      files.push({ path: path.relative(root, name), bytes, kind });
    }
  }
}
await walk(root);
files.sort((a,b) => b.bytes-a.bytes || a.path.localeCompare(b.path));
const totals = {};
for (const file of files) { totals[file.kind] ||= { count: 0, bytes: 0 }; totals[file.kind].count++; totals[file.kind].bytes += file.bytes; }
await writeFile(path.join(root, 'inventory.json'), JSON.stringify({ recordedAt: new Date().toISOString(), totals, totalBytes: files.reduce((sum,file)=>sum+file.bytes,0), files }, null, 2)+'\n');
console.log(JSON.stringify(totals));
