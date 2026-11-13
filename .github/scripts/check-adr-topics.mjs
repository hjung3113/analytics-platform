#!/usr/bin/env node
// check-adr-topics.mjs — every platform ADR file must be linked from docs/adr/by-topic.md.
// Run by `pnpm docs:links` after check-doc-links.mjs (that checker is generic: it validates link
// targets, not that a given index is complete, so this assertion is a separate small script).
// history/ ADRs are out of scope. Exit status: 0 = all listed, 1 = missing entries.

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const adrDir = path.join(root, 'docs', 'adr');
const indexPath = path.join(adrDir, 'by-topic.md');

if (!existsSync(indexPath)) {
  console.error('docs/adr/by-topic.md does not exist');
  process.exit(1);
}

const index = readFileSync(indexPath, 'utf8');
const adrFiles = readdirSync(adrDir).filter((name) => /^\d{4}-.+\.md$/.test(name));
const missing = adrFiles.filter((name) => !index.includes(`](${name})`));

if (missing.length > 0) {
  console.error(`docs/adr/by-topic.md is missing ${missing.length} platform ADR file(s):`);
  for (const name of missing) console.error(`  - ${name}`);
  process.exit(1);
}
console.log(`by-topic.md lists all ${adrFiles.length} platform ADR files`);
