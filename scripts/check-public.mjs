import { readdir, readFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url));
const skip = new Set(['node_modules', '.git']);
// Split scanner signatures so the scanner's own source contains no forbidden literal.
const rules = [
  ['nonpublic environment', new RegExp(['sta'+'ging', 'CF-Access-'+'Client'].join('|'), 'i')],
  ['credential', /\b(?:sa_|ak_|sk_live_|rk_live_)[a-zA-Z0-9]{32,}\b/],
  ['private location', new RegExp(['/Us'+'ers/', '\\.secrets'+'\\.values', '\\.private'+'_key', 'BEGIN '+'.*'+'PRIVATE'+' KEY'].join('|'))],
  ['internal infrastructure', new RegExp(['Het'+'zner','Dwel'+'lir','kube'+'config','cluster'+'\\.local'].join('|'),'i')],
];
let checked = 0;
async function scan(dir) {
  for (const entry of await readdir(dir, {withFileTypes:true})) {
    if (skip.has(entry.name) || /\.(tgz|mcpb|zip)$/.test(entry.name)) continue;
    const file = resolve(dir,entry.name);
    if (entry.isSymbolicLink()) throw Error(`Unexpected symlink in public source: ${relative(root,file)}`);
    if (entry.isDirectory()) { await scan(file); continue; }
    const content = await readFile(file,'utf8');
    for (const [label,rule] of rules) if (rule.test(content)) throw Error(`${label} in ${relative(root,file)}`);
    checked++;
  }
}
await scan(root);
console.log(`PASS: ${checked} public files scanned, including tests and scripts`);
