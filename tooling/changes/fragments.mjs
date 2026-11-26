// Per-issue change fragments (`changes/<issue>.md`), shared by the SDK (tooling/sdk/sdk-changelog.mjs) and menus (./menus.mjs).
// This module owns the file rules: a positive-integer filename, a non-empty body, deletion after the release fold. Each caller owns
// its row format and its CHANGELOG. Node built-ins only, so CI runs it before install.
import { existsSync, readFileSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

const ISSUE_FILE = /^[1-9]\d*\.md$/;

export function fragmentFiles(directory, { label = (file) => file, readme = false } = {}) {
  if (!existsSync(directory)) return [];
  const found = [];
  for (const file of readdirSync(directory).sort()) {
    if (readme && file === 'README.md') continue;
    if (!ISSUE_FILE.test(file)) throw new Error(`${label(file)}: expected <issue>.md`);
    const content = readFileSync(join(directory, file), 'utf8').trim();
    if (!content) throw new Error(`${label(file)}: fragment is empty`);
    found.push({ file, issue: Number(file.slice(0, -3)), content });
  }
  return found;
}

export function deleteFragmentFiles(directory, files) {
  for (const file of new Set(files)) unlinkSync(join(directory, file));
}
