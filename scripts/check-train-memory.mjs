// Fails if a trained rule points at a file that no longer exists, or a source profile has no document.
// Usage: npm run check:train-memory
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(root, 'lib/trainMemory.ts'), 'utf8');
const reimsRoot = path.resolve(root, '..', 'prive-reims');

const problems = [];
let checked = 0, skipped = 0;

for (const m of src.matchAll(/enforcedBy:\s*\[([^\]]*)\]/g)) {
  for (const p of [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1])) {
    if (p.startsWith('reims:')) {
      if (!fs.existsSync(reimsRoot)) { skipped++; continue; }
      checked++;
      if (!fs.existsSync(path.join(reimsRoot, p.slice(6)))) problems.push(`REIMS file missing: ${p}`);
    } else {
      checked++;
      if (!fs.existsSync(path.join(root, p))) problems.push(`file missing: ${p}`);
    }
  }
}
for (const m of src.matchAll(/doc:\s*'([^']+)'/g)) {
  checked++;
  if (!fs.existsSync(path.join(root, m[1]))) problems.push(`profile document missing: ${m[1]}`);
}
const ruleSrc = src.slice(0, src.indexOf('export const HANDLER_PROFILE'));
const ids = [...ruleSrc.matchAll(/\bid:\s*'([A-Za-z0-9-]+)'/g)].map(x => x[1]);
const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
if (dupes.length) problems.push(`duplicate ids: ${[...new Set(dupes)].join(', ')}`);

console.log(`train memory: ${checked} references checked${skipped ? `, ${skipped} REIMS references skipped (prive-reims not found next to this repo)` : ''}`);
if (problems.length) { console.error(problems.map(p => ' - ' + p).join('\n')); process.exit(1); }
console.log('train memory: OK');
