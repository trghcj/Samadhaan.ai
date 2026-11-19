// Lists UI strings used in the code that a language file does not translate.
// Usage: npm run check:i18n        (exit code 1 when anything is missing)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');

// Keys built at runtime (t(variable) / t(`${x} Dept.`)), which a text scan cannot see.
const DEPARTMENTS = ['Water', 'Electricity', 'Roads', 'Sanitation', 'Drainage', 'Street Lights'];
export const DYNAMIC_KEYS = [
  ...DEPARTMENTS,
  ...DEPARTMENTS.map((d) => `${d} Dept.`),
  'Unclear', 'Other', 'Water Supply', 'Under officer review', 'Reported Issue', 'Out of scope',
  // routing labels (utils/grievance.js routingInfo)
  'Auto-routed', 'Citizen chose', 'Needs officer', 'Awaiting citizen',
  // operator register tabs and routing filter
  'Open', 'In progress', 'Flagged', 'Resolved', 'All routing',
  // SLA texts (utils/grievance.js slaInfo)
  'Overdue', '{{count}}h left', '{{count}}d left',
  // stored confidence values, shown in the operator ticket panel
  'High', 'Medium', 'Low', 'Confirmed by citizen',
  // processing steps: set in CitizenPortal and sent by the backend (ai_pipeline.py), shown via t(statusStep)
  'Uploading photo...', 'Saving your answer...', 'Analyzing transcript with AI...', 'Classifying with MuRIL...',
  'Downloading and loading audio model (first run only, takes ~30s)...', 'Saving grievance to database...', 'Transcribing audio...',
];

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === 'locales' ? [] : walk(p);
    return /\.(jsx?|mjs)$/.test(e.name) && e.name !== 'i18n.js' ? [p] : [];
  });
}

// First argument of t(...) when it is a plain string literal.
const CALL = /\bt\(\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1/g;

export function usedKeys() {
  const keys = new Set(DYNAMIC_KEYS);
  for (const file of walk(SRC)) {
    const text = fs.readFileSync(file, 'utf8');
    for (const m of text.matchAll(CALL)) {
      if (m[1] === '`' && m[2].includes('${')) continue; // dynamic, listed above
      // Unescape the way JS does, so the key matches what t() receives at runtime.
      keys.add(m[2].replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\(['"`\\])/g, '$1'));
    }
  }
  return keys;
}

async function main() {
  const keys = [...usedKeys()].sort();
  let missingTotal = 0;
  for (const file of fs.readdirSync(path.join(SRC, 'locales')).sort()) {
    const lang = path.basename(file, '.js');
    if (lang === 'en') continue; // English falls back to the key itself
    const dict = (await import(pathToFileURL(path.join(SRC, 'locales', file)).href)).default;
    const missing = keys.filter((k) => !(k in dict));
    missingTotal += missing.length;
    console.log(`${lang}: ${keys.length - missing.length}/${keys.length} translated${missing.length ? `, missing ${missing.length}` : ''}`);
    if (process.argv.includes('--list')) missing.forEach((k) => console.log(`   ${JSON.stringify(k)}`));
  }
  if (missingTotal) { console.log(`\n${missingTotal} missing translations (run with --list to see them)`); process.exit(1); }
  console.log('\nAll languages complete.');
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();
