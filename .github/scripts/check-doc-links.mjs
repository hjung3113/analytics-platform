#!/usr/bin/env node
// check-doc-links.mjs — dependency-free relative link / anchor checker for git-tracked Markdown.
// Root script: `pnpm docs:links`. CI runs it in the platform-workspace job.
//
// Usage (from anywhere inside the repo):
//   node check-doc-links.mjs                       # check every tracked *.md, default exclusions
//   node check-doc-links.mjs --root /path/to/repo  # explicit repo root (default: git toplevel of cwd)
//   node check-doc-links.mjs --exclude docs/old/   # extra exclusion (path prefix; repeatable)
//   node check-doc-links.mjs --no-default-excludes # check everything git tracks
//   node check-doc-links.mjs --skip-submodules     # do not verify link targets that point inside a submodule
//                                            # (use when CI checks out with submodules: false)
//   node check-doc-links.mjs --json                # machine-readable output
//   node check-doc-links.mjs --list-anchors FILE   # debug: print the anchors computed for one file
//
// What is checked
//   - inline links/images  [text](target) / ![alt](target), reference definitions  [id]: target,
//     and HTML  href="…" / src="…"  attributes.
//   - relative file targets (resolved against the source file's directory; "/x" = repo root).
//     A target must be a git-TRACKED file or directory (so a gitignored file that happens to exist
//     locally still counts as broken — it is broken on GitHub). Paths inside a submodule are accepted
//     if present on disk.
//   - "#anchor" and "path.md#anchor": GitHub heading slugs (lowercase, spaces -> "-", punctuation
//     stripped except "-" and "_", Hangul/other letters kept, -1/-2 suffix for duplicates) plus
//     explicit  <a id="…">, <a name="…">  and any  id="…"  attribute. "#L10"/"#L10-L20" on non-Markdown
//     (any text file) are accepted if the line exists; other anchors on non-Markdown files are not verified.
//   - ignored: external schemes (http:, https:, mailto:, …), links inside fenced code blocks and
//     inline code spans, symlinked *.md files (they duplicate their target).
//
// Exit status: 0 = no broken links, 1 = at least one broken link/anchor, 2 = usage / git error.

import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const DEFAULT_EXCLUDES = [
  'products/', // external submodule
  '.agents/skills/', // vendored external skills
  '.agents/references/', // vendored external references
  '.review/', // local scratch
];

// ---------------------------------------------------------------- args
function parseArgs(argv) {
  const opts = { root: null, excludes: [], defaultExcludes: true, json: false, listAnchors: null, skipSubmodules: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--root') opts.root = argv[++i];
    else if (a === '--exclude') opts.excludes.push(argv[++i]);
    else if (a === '--no-default-excludes') opts.defaultExcludes = false;
    else if (a === '--json') opts.json = true;
    else if (a === '--skip-submodules') opts.skipSubmodules = true;
    else if (a === '--list-anchors') opts.listAnchors = argv[++i];
    else if (a === '-h' || a === '--help') {
      const header = readFileSync(new URL(import.meta.url), 'utf8').split('\n').slice(1);
      console.log(header.slice(0, header.findIndex((l) => !l.startsWith('//'))).map((l) => l.replace(/^\/\/ ?/, '')).join('\n'));
      process.exit(0);
    } else {
      console.error(`unknown argument: ${a}`);
      process.exit(2);
    }
  }
  return opts;
}

function git(root, args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
}

// ---------------------------------------------------------------- GitHub slugs
function stripInlineMarkup(text) {
  return text
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1') // [text](url) -> text
    .replace(/!?\[([^\]]*)\]\[[^\]]*\]/g, '$1') // [text][ref] -> text
    .replace(/<[^>]+>/g, '') // html tags
    .replace(/`+([^`]*)`+/g, '$1') // code spans keep their text
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/(^|[\s(])_(.+?)_(?=[\s).,:;!?]|$)/g, '$1$2')
    .replace(/~~(.+?)~~/g, '$1');
}

export function slugify(heading) {
  return stripInlineMarkup(heading)
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, '') // keep letters, marks, numbers, "_" (Pc), space, "-"
    .replace(/ /g, '-');
}

// ---------------------------------------------------------------- markdown scanning
/** Yields {line, text, inFence} for each line. */
function* scanLines(content) {
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

function blankCodeSpans(text) {
  return text.replace(/(`+)(?!`)(.+?)(?<!`)\1(?!`)/g, (s) => ' '.repeat(s.length));
}

const anchorCache = new Map();
function anchorsOf(absPath) {
  if (anchorCache.has(absPath)) return anchorCache.get(absPath);
  const set = new Set();
  const seen = new Map();
  const add = (base) => {
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    set.add(n === 0 ? base : `${base}-${n}`);
  };
  const lines = [...scanLines(readFileSync(absPath, 'utf8'))];
  for (let i = 0; i < lines.length; i++) {
    const { text, inFence } = lines[i];
    if (inFence) continue;
    let m = /^ {0,3}#{1,6}[ \t]+(.*?)(?:[ \t]+#+)?[ \t]*$/.exec(text);
    if (m) add(slugify(m[1]));
    else if (i + 1 < lines.length && !lines[i + 1].inFence && /^ {0,3}(=+|-+)\s*$/.test(lines[i + 1].text) && text.trim() && !/^\s*([-*+]|\d+\.)\s/.test(text) && !/^\s*>/.test(text) && !/^\|/.test(text)) {
      add(slugify(text)); // setext heading
    }
    for (const idm of text.matchAll(/\b(?:id|name)\s*=\s*["']([^"']+)["']/g)) set.add(idm[1].toLowerCase());
  }
  anchorCache.set(absPath, set);
  return set;
}

/** Extract link targets from one (non-fenced) line. Returns [{target}] */
function extractTargets(text) {
  const out = [];
  const t = blankCodeSpans(text);

  // inline links / images: find "](" and parse the destination with balanced parens
  for (let idx = t.indexOf(']('); idx !== -1; idx = t.indexOf('](', idx + 2)) {
    let j = idx + 2;
    while (t[j] === ' ' || t[j] === '\t') j++;
    let dest = '';
    if (t[j] === '<') {
      const end = t.indexOf('>', j + 1);
      if (end === -1) continue;
      dest = t.slice(j + 1, end);
    } else {
      let depth = 0;
      let k = j;
      for (; k < t.length; k++) {
        const c = t[k];
        if (c === '\\') { k++; continue; }
        if (c === '(') depth++;
        else if (c === ')') { if (depth === 0) break; depth--; }
        else if (/\s/.test(c) && depth === 0) break; // title follows
      }
      dest = t.slice(j, k);
    }
    out.push({ target: dest });
  }

  // reference definitions: [id]: target
  const def = /^ {0,3}\[[^\]]+\]:\s*<?([^\s>]+)>?/.exec(t);
  if (def) out.push({ target: def[1] });

  // raw HTML attributes
  for (const m of t.matchAll(/\b(?:href|src)\s*=\s*"([^"]*)"|\b(?:href|src)\s*=\s*'([^']*)'/g)) out.push({ target: m[1] ?? m[2] });
  return out;
}

const EXTERNAL = /^(?:[a-zA-Z][a-zA-Z0-9+.-]*:|\/\/)/; // http:, mailto:, //host, ...

function safeDecode(s) {
  try { return decodeURIComponent(s); } catch { return s; }
}

// ---------------------------------------------------------------- main
function main() {
  const opts = parseArgs(process.argv.slice(2));
  const root = opts.root ? path.resolve(opts.root) : git(process.cwd(), ['rev-parse', '--show-toplevel']).trim();

  if (opts.listAnchors) {
    for (const a of anchorsOf(path.resolve(opts.listAnchors))) console.log(a);
    return;
  }

  const excludes = [...(opts.defaultExcludes ? DEFAULT_EXCLUDES : []), ...opts.excludes];
  const isExcluded = (p) => p.split('/').includes('node_modules') || excludes.some((e) => p === e.replace(/\/$/, '') || p.startsWith(e.endsWith('/') ? e : `${e}/`));

  // tracked files + directories (+ submodule gitlinks)
  const staged = git(root, ['ls-files', '-s', '-z']).split('\0').filter(Boolean);
  const tracked = new Set();
  const trackedDirs = new Set(['']);
  const submodules = [];
  for (const rec of staged) {
    const m = /^(\d+) \S+ \d+\t(.*)$/s.exec(rec);
    if (!m) continue;
    const [, mode, p] = m;
    if (mode === '160000') { submodules.push(p); continue; }
    tracked.add(p);
    for (let d = path.posix.dirname(p); d !== '.' && !trackedDirs.has(d); d = path.posix.dirname(d)) trackedDirs.add(d);
  }
  const inSubmodule = (p) => submodules.some((s) => p === s || p.startsWith(`${s}/`));

  const mdFiles = [...tracked].filter((p) => /\.md$/i.test(p) && !isExcluded(p)).filter((p) => {
    const st = lstatSync(path.join(root, p), { throwIfNoEntry: false });
    return st && !st.isSymbolicLink(); // symlinks (CLAUDE.md -> AGENTS.md) duplicate their target
  });

  const broken = [];
  let linksChecked = 0;
  let anchorsChecked = 0;

  for (const file of mdFiles) {
    const abs = path.join(root, file);
    for (const { line, text, inFence } of scanLines(readFileSync(abs, 'utf8'))) {
      if (inFence) continue;
      for (const { target: raw } of extractTargets(text)) {
        const target = raw.trim();
        if (!target || EXTERNAL.test(target)) continue;
        linksChecked++;

        const hashAt = target.indexOf('#');
        const pathPart = safeDecode((hashAt === -1 ? target : target.slice(0, hashAt)).replace(/\?.*$/, ''));
        const anchor = hashAt === -1 ? null : safeDecode(target.slice(hashAt + 1));

        let resolved; // repo-relative posix path
        if (pathPart === '') resolved = file;
        else if (pathPart.startsWith('/')) resolved = path.posix.normalize(pathPart.slice(1));
        else resolved = path.posix.normalize(path.posix.join(path.posix.dirname(file), pathPart));
        resolved = resolved.replace(/\/$/, '');

        if (resolved.startsWith('..')) { broken.push({ file, line, target: raw, reason: 'escapes repository root' }); continue; }

        const isFile = tracked.has(resolved);
        const isDir = resolved === '' || trackedDirs.has(resolved);
        if (!isFile && !isDir) {
          if (inSubmodule(resolved)) {
            if (!opts.skipSubmodules && !existsSync(path.join(root, resolved))) broken.push({ file, line, target: raw, reason: 'missing in submodule checkout' });
          } else {
            const onDisk = existsSync(path.join(root, resolved));
            broken.push({ file, line, target: raw, reason: onDisk ? 'target exists locally but is not tracked by git' : 'file not found' });
          }
          continue;
        }

        if (isFile && !existsSync(path.join(root, resolved))) {
          broken.push({ file, line, target: raw, reason: 'tracked but missing from the working tree' });
          continue;
        }

        if (anchor && anchor !== '' && isFile) {
          const lineRange = /^L(\d+)(?:C\d+)?(?:-L(\d+)(?:C\d+)?)?$/.exec(anchor);
          if (lineRange) {
            // GitHub line anchors (#L10, #L10-L20) are valid on any text file; check the range exists.
            const last = Number(lineRange[2] ?? lineRange[1]);
            const total = readFileSync(path.join(root, resolved), 'utf8').replace(/\n$/, '').split('\n').length;
            if (last > total) broken.push({ file, line, target: raw, reason: `line ${last} beyond end of ${resolved} (${total} lines)` });
          } else if (/\.md$/i.test(resolved)) {
            anchorsChecked++;
            if (!anchorsOf(path.join(root, resolved)).has(anchor.toLowerCase())) {
              broken.push({ file, line, target: raw, reason: `anchor not found in ${resolved}` });
            }
          } // other non-Markdown targets with a non-line anchor cannot be verified: accepted
        }
      }
    }
  }

  if (opts.json) {
    console.log(JSON.stringify({ filesChecked: mdFiles.length, linksChecked, anchorsChecked, broken }, null, 2));
  } else {
    for (const b of broken) console.log(`${b.file}:${b.line} → ${b.target}  [${b.reason}]`);
    console.log(`\nchecked ${linksChecked} relative links (${anchorsChecked} heading anchors) in ${mdFiles.length} markdown files: ${broken.length} broken`);
  }
  process.exit(broken.length ? 1 : 0);
}

main();
