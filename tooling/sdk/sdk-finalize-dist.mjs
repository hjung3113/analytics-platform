// Second half of a package `build` (ADR-0056, #519). Run from the package directory after `tsc -p tsconfig.build.json`:
// 1. copies the non-TS assets of src (CSS, JSON) into dist, keeping relative paths, so the `@source "./"` / `@source "../"`
//    lines in the CSS still point at the emitted JS;
// 2. gives every relative import in dist/*.js and dist/*.d.ts an explicit `.js` (or `/index.js`) ending. The sources import
//    extensionless, which a bundler resolves but Node ESM does not, and Vitest runs files under node_modules in Node.
import { cpSync, existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

const ASSET = /\.(css|json)$/;
const SKIP_DIR = new Set(['__tests__', '__fixtures__', 'node_modules']);
// `from './x'`, `import './x'`, `import('./x')`, `export * from '../x'`; the quote and the specifier are captured.
const RELATIVE_SPECIFIER = /(\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)(['"])(\.{1,2}\/[^'"\n]*|\.{1,2})\2/g;

function* walk(dir, accept, skip = () => false) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (!skip(name)) yield* walk(path, accept, skip);
    } else if (accept(name)) {
      yield path;
    }
  }
}

function explicit(specifier, file) {
  if (/\.(js|css|json)$/.test(specifier)) return specifier;
  const target = join(dirname(file), specifier);
  if (existsSync(`${target}.js`)) return `${specifier}.js`;
  if (existsSync(join(target, 'index.js'))) return `${specifier.replace(/\/$/, '')}/index.js`;
  throw new Error(`${relative(process.cwd(), file)}: cannot resolve relative import '${specifier}' to a file in dist`);
}

const src = join(process.cwd(), 'src');
const dist = join(process.cwd(), 'dist');
for (const file of walk(src, (name) => ASSET.test(name), (name) => SKIP_DIR.has(name))) {
  cpSync(file, join(dist, relative(src, file)), { recursive: true });
}
for (const file of walk(dist, (name) => name.endsWith('.js') || name.endsWith('.d.ts'))) {
  const before = readFileSync(file, 'utf8');
  const after = before.replace(RELATIVE_SPECIFIER, (_match, lead, quote, specifier) => `${lead}${quote}${explicit(specifier, file)}${quote}`);
  if (after !== before) writeFileSync(file, after);
}
