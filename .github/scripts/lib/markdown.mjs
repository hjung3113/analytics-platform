// Shared by check-doc-links.mjs and check-doc-code-paths.mjs (#2284): one Markdown line scanner and one rule for vendored folders.
import { existsSync } from 'node:fs';
import path from 'node:path';

/** Yields {line, text, inFence} for each line. A fence closes only on a run of its own character at least as long as the opener (CommonMark). */
export function* scanLines(content) {
  const lines = content.split(/\r?\n/);
  let fence = null; // {ch, len}
  for (let i = 0; i < lines.length; i++) {
    const text = lines[i];
    const m = /^ {0,3}(`{3,}|~{3,})/.exec(text);
    if (fence) {
      if (m && m[1][0] === fence.ch && m[1].length >= fence.len && /^ {0,3}[`~]+\s*$/.test(text)) fence = null;
      yield { line: i + 1, text, inFence: true };
      continue;
    }
    if (m) {
      fence = { ch: m[1][0], len: m[1].length };
      yield { line: i + 1, text, inFence: true };
      continue;
    }
    yield { line: i + 1, text, inFence: false };
  }
}

// External skills and references are copied in unchanged and keep their own links and paths. A vendored folder carries the vendoring
// record `SOURCE.md` (.agents/README.md); first-party skills in the same roots are living documents and are checked.
const VENDOR_ROOTS = ['.agents/skills/', '.agents/references/'];
export const LOCAL_SCRATCH = '.review/';

/** True when `file` (repo-relative) sits in a vendored folder. `hasRecord(folder)` defaults to a SOURCE.md on disk under `root`. */
export function isVendored(file, root, hasRecord = (folder) => existsSync(path.join(root, folder, 'SOURCE.md'))) {
  const vendorRoot = VENDOR_ROOTS.find((prefix) => file.startsWith(prefix));
  if (!vendorRoot) return false;
  const folder = file.slice(vendorRoot.length).split('/')[0];
  return file.includes('/', vendorRoot.length) && hasRecord(`${vendorRoot}${folder}`);
}
