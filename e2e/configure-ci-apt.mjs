// Only the disposable GitHub Ubuntu runner is configured. No package list is forked.
import assert from 'node:assert/strict';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const azure = /^https?:\/\/azure\.archive\.ubuntu\.com\/ubuntu\/?$/;
const containsAzure = /azure\.archive\.ubuntu\.com/;
export const aptSettings = {
  'Acquire::http::Timeout': '20',
  'Acquire::https::Timeout': '20',
  'Acquire::Retries': '1',
  'APT::Update::Error-Mode': 'any',
};
export function rewriteUbuntuSources(text, format) {
  let changed = 0;
  const endpoint = suites => {
    const names = suites.trim().split(/\s+/);
    assert.ok(names.length && names.every(s => /^noble(?:-updates|-backports|-security)?$/.test(s)), 'Unknown Ubuntu suite; refusing source rewrite');
    const security = names.includes('noble-security');
    assert.ok(!security || names.length === 1, 'Mixed security and archive suites; review source layout');
    return security ? 'https://security.ubuntu.com/ubuntu' : 'https://archive.ubuntu.com/ubuntu';
  };
  const replaceUris = (uris, suites) => uris.split(/(\s+)/).map(uri => {
    if (!containsAzure.test(uri)) return uri;
    assert.ok(azure.test(uri), 'Unrecognized Azure archive URI; refusing source rewrite');
    changed++;
    return endpoint(suites);
  }).join('');
  let result;
  if (format === 'sources') {
    result = text.split(/(\n\s*\n)/).map(stanza => {
      const active = stanza.split('\n').filter(line => !/^\s*#/.test(line)).join('\n');
      if (!containsAzure.test(active)) return stanza;
      let field;
      for (const line of active.split('\n')) {
        const header = line.match(/^([^\s:]+):/);
        if (header) field = header[1];
        else if (/^[ \t]+\S/.test(line) && ['URIs', 'Suites'].includes(field)) {
          assert.fail('Wrapped URIs/Suites require explicit runner-layout review');
        }
      }
      const uris = [...active.matchAll(/^URIs:[ \t]*(.+)$/gm)];
      const suites = [...active.matchAll(/^Suites:[ \t]*(.+)$/gm)];
      assert.equal(uris.length, 1, 'Expected one URIs field');
      assert.equal(suites.length, 1, 'Expected one Suites field');
      const updated = stanza.replace(/^(URIs:[ \t]*)(.+)$/m, (_, prefix, value) => prefix + replaceUris(value, suites[0][1]));
      assert.ok(!containsAzure.test(updated.split('\n').filter(line => !/^\s*#/.test(line)).join('\n')), 'Unsupported wrapped source field');
      return updated;
    }).join('');
  } else {
    assert.equal(format, 'list');
    result = text.split('\n').map(line => {
      if (/^\s*#/.test(line) || !containsAzure.test(line)) return line;
      const match = line.match(/^(\s*deb(?:-src)?\s+(?:\[[^\]]+\]\s+)?)(\S+)(\s+)(\S+)(.*)$/);
      assert.ok(match, 'Unsupported legacy source line');
      return match[1] + replaceUris(match[2], match[4]) + match[3] + match[4] + match[5];
    }).join('\n');
  }
  return { text: result, changed };
}

export function assertRunner(osRelease, env, uid) {
  assert.equal(env.GITHUB_ACTIONS, 'true', 'Only run on the disposable GitHub Actions runner');
  assert.equal(uid, 0, 'Runner configuration requires sudo');
  assert.match(osRelease, /^ID=ubuntu$/m);
  assert.match(osRelease, /^VERSION_ID="24\.04"$/m);
}
async function configure() {
  assertRunner(await readFile('/etc/os-release', 'utf8'), process.env, process.getuid());
  const paths = ['/etc/apt/sources.list', ...(await readdir('/etc/apt/sources.list.d')).filter(n => /\.(sources|list)$/.test(n)).map(n => '/etc/apt/sources.list.d/' + n)];
  const changes = [];
  // Validate every candidate before any write; comments and non-Azure sources remain intact.
  for (const path of paths) {
    let original;
    try { original = await readFile(path, 'utf8'); } catch (e) { if (e.code === 'ENOENT' && path === '/etc/apt/sources.list') continue; throw e; }
    const rewritten = rewriteUbuntuSources(original, path.endsWith('.sources') ? 'sources' : 'list');
    if (rewritten.changed) changes.push({ path, ...rewritten });
  }
  assert.ok(changes.length, 'Expected Azure Ubuntu archive source not found; inspect runner image before proceeding');
  for (const item of changes) {
    await writeFile(item.path, item.text);
    assert.equal(await readFile(item.path, 'utf8'), item.text);
    console.log(`Replaced ${item.changed} exact Ubuntu archive URI(s) in ${item.path}; suites/components/signing options retained.`);
  }
  const config = Object.entries(aptSettings).map(([key, value]) => `${key} "${value}";`).join('\n') + '\n';
  await writeFile('/etc/apt/apt.conf.d/99zz-calculator-ci', config);
  const effective = execFileSync('apt-config', ['dump'], { encoding: 'utf8' });
  for (const [key, value] of Object.entries(aptSettings)) {
    assert.ok(effective.split('\n').includes(`${key} "${value}";`), `APT setting not effective: ${key}`);
    console.log(`${key}=${value}`);
  }
  console.log('APT destinations: https://archive.ubuntu.com/ubuntu and (where applicable) https://security.ubuntu.com/ubuntu. TLS and package-signature verification unchanged.');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await configure();
