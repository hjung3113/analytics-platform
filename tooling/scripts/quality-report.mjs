#!/usr/bin/env node
// Quality report (#2181): one command lists every site of six code-quality patterns as `path:line` rows, so a
// review-quality round cites the whole list and the model judges each row instead of sampling the codebase.
// Hand runs and main-push only, never PR CI (#2181 "PR CI에 jscpd … 하지 않기로").
//
//   node tooling/scripts/quality-report.mjs [--only a,b] [--json] [--out <file>]
//
// Sections: duplicates (jscpd), unions (string-literal unions declared more than once), catch-defaults (catches that
// return a default value or swallow the error), storage-keys (Web Storage keys), locale (`toLocale*` calls),
// long-files (files over 500 lines). Scope: tracked source files under SOURCE_ROOTS, tests, fixtures, stories and
// generated and declaration files excluded.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const SOURCE_ROOTS = ['apps', 'packages', 'menus', 'platform', 'ops', 'tooling'];
const SOURCE_EXT = /\.(?:[cm]?[jt]s|[jt]sx)$/;
const EXCLUDED = [
  /\.(?:test|spec)\.[^/]+$/,
  /\.stories\.[^/]+$/,
  /\.d\.[cm]?ts$/,
  /\.(?:generated|gen)\.[^/]+$/,
  /(?:^|\/)(?:__tests__|__fixtures__|__mocks__|tests?|tests-kit|fixtures)\//,
  /(?:^|\/)test-setup\.[^/]+$/,
  /^apps\/platform-e2e\//,
];
export const LONG_FILE_LINES = 500;

export const SECTIONS = {
  duplicates: 'Duplicate code (jscpd)',
  unions: 'String-literal unions declared more than once',
  'catch-defaults': 'Catches that return a default value or swallow the error',
  'storage-keys': 'Web Storage keys',
  locale: '`toLocale*` calls',
  'long-files': `Files over ${LONG_FILE_LINES} lines`,
};

export function isSourceFile(file) {
  return SOURCE_EXT.test(file) && !EXCLUDED.some((pattern) => pattern.test(file));
}

function listSourceFiles() {
  const out = spawnSync('git', ['ls-files', '-z', '--', ...SOURCE_ROOTS], { cwd: ROOT, encoding: 'utf8' });
  if (out.status !== 0) throw new Error(`git ls-files failed: ${out.stderr}`);
  return out.stdout.split('\0').filter((file) => file && isSourceFile(file));
}

function scriptKind(file) {
  if (file.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (file.endsWith('.jsx')) return ts.ScriptKind.JSX;
  return /\.[cm]?js$/.test(file) ? ts.ScriptKind.JS : ts.ScriptKind.TS;
}

export function parse(file, text) {
  return ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, scriptKind(file));
}

const lineOf = (sf, node) => sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
const isFunctionLike = (node) => ts.isFunctionLike(node) || ts.isClassLike(node);

/** Visit `node`'s subtree without entering nested functions or classes. */
function walkOwnBody(node, visit) {
  ts.forEachChild(node, function step(child) {
    if (isFunctionLike(child)) return;
    visit(child);
    ts.forEachChild(child, step);
  });
}

// --- unions ---------------------------------------------------------------------------------------------------------

/** Unions of two or more string literals (null/undefined members ignored), keyed by the sorted member set. */
export function findStringUnions(sf) {
  const found = [];
  const visit = (node) => {
    if (ts.isUnionTypeNode(node) && !ts.isUnionTypeNode(node.parent)) {
      const members = [];
      let pure = true;
      for (const type of node.types) {
        if (ts.isLiteralTypeNode(type) && ts.isStringLiteral(type.literal)) members.push(type.literal.text);
        else if (type.kind === ts.SyntaxKind.UndefinedKeyword || (ts.isLiteralTypeNode(type) && type.literal.kind === ts.SyntaxKind.NullKeyword)) continue;
        else pure = false;
      }
      if (pure && members.length >= 2) {
        const name = ts.isTypeAliasDeclaration(node.parent) ? node.parent.name.text : undefined;
        found.push({ key: [...new Set(members)].sort().map((m) => `'${m}'`).join(' | '), line: lineOf(sf, node), name });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

// --- catch-defaults -------------------------------------------------------------------------------------------------

/** A value that stands in for a failed result: a literal, an empty collection, or a name such as `fallback`/`EMPTY`. */
export function isDefaultValue(expr) {
  if (!expr) return true;
  while (ts.isParenthesizedExpression(expr) || ts.isAsExpression(expr) || ts.isSatisfiesExpression(expr)) expr = expr.expression;
  switch (expr.kind) {
    case ts.SyntaxKind.NullKeyword:
    case ts.SyntaxKind.TrueKeyword:
    case ts.SyntaxKind.FalseKeyword:
    case ts.SyntaxKind.NumericLiteral:
    case ts.SyntaxKind.StringLiteral:
    case ts.SyntaxKind.NoSubstitutionTemplateLiteral:
    case ts.SyntaxKind.VoidExpression:
      return true;
    default:
  }
  if (ts.isPrefixUnaryExpression(expr)) return ts.isNumericLiteral(expr.operand);
  if (ts.isArrayLiteralExpression(expr)) return expr.elements.length === 0;
  if (ts.isObjectLiteralExpression(expr)) return expr.properties.length === 0;
  if (ts.isNewExpression(expr)) return ts.isIdentifier(expr.expression) && ['Map', 'Set'].includes(expr.expression.text) && !expr.arguments?.length;
  if (ts.isIdentifier(expr)) return expr.text === 'undefined' || /^(?:fallback|default|empty|initial)/i.test(expr.text) || /^[A-Z][A-Z0-9_]+$/.test(expr.text);
  return false;
}

const describeValue = (sf, expr) => (expr ? expr.getText(sf).replace(/\s+/g, ' ').slice(0, 60) : 'undefined');

/** Analyse one handler body: a `catch` block or a `.catch()` callback body. */
function classifyHandler(sf, body) {
  if (!ts.isBlock(body)) return isDefaultValue(body) ? { kind: 'returns', value: describeValue(sf, body) } : undefined;
  let throws = false;
  const returns = [];
  walkOwnBody(body, (node) => {
    if (ts.isThrowStatement(node)) throws = true;
    else if (ts.isReturnStatement(node)) returns.push(node.expression);
  });
  if (throws) return undefined;
  if (body.statements.length === 0) return { kind: 'swallows', value: 'empty' };
  const defaults = returns.filter((expr) => isDefaultValue(expr));
  if (defaults.length === 0) return undefined;
  return { kind: 'returns', value: defaults.map((expr) => describeValue(sf, expr)).join(', ') };
}

/** `catch` clauses and `.catch(cb)` callbacks that do not rethrow and return a default value or nothing at all. */
export function findCatchDefaults(sf) {
  const found = [];
  const visit = (node) => {
    let hit;
    if (ts.isCatchClause(node)) hit = classifyHandler(sf, node.block);
    else if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === 'catch') {
      const [handler] = node.arguments;
      if (handler && (ts.isArrowFunction(handler) || ts.isFunctionExpression(handler))) hit = classifyHandler(sf, handler.body);
    }
    if (hit) found.push({ line: lineOf(sf, node), form: ts.isCatchClause(node) ? 'catch' : '.catch()', ...hit });
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

// --- storage-keys ---------------------------------------------------------------------------------------------------

const STORAGE_METHODS = new Set(['getItem', 'setItem', 'removeItem']);

/** Text of a key expression, following a same-file `const` string or a property of a same-file `const` object. */
function resolveKey(sf, expr, consts) {
  if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) return { key: expr.text, resolved: true };
  if (ts.isTemplateExpression(expr)) return { key: expr.getText(sf).slice(1, -1), resolved: true };
  const named = ts.isIdentifier(expr) ? consts.get(expr.text) : ts.isPropertyAccessExpression(expr) ? consts.get(expr.getText(sf)) : undefined;
  if (named) return resolveKey(sf, named, new Map());
  return { key: expr.getText(sf), resolved: false };
}

function collectConsts(sf) {
  const consts = new Map();
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && ts.getCombinedNodeFlags(node) & ts.NodeFlags.Const) {
      let init = node.initializer;
      while (ts.isAsExpression(init) || ts.isSatisfiesExpression(init)) init = init.expression;
      if (ts.isStringLiteralLike(init) || ts.isTemplateExpression(init)) consts.set(node.name.text, init);
      else if (ts.isObjectLiteralExpression(init)) {
        for (const prop of init.properties) {
          if (ts.isPropertyAssignment(prop) && (ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name)) && ts.isStringLiteralLike(prop.initializer)) {
            consts.set(`${node.name.text}.${prop.name.text}`, prop.initializer);
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return consts;
}

/** `getItem`/`setItem`/`removeItem` calls on a receiver whose name ends in `storage` (localStorage, this.storage …). */
export function findStorageKeys(sf) {
  const found = [];
  let consts;
  const visit = (node) => {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      STORAGE_METHODS.has(node.expression.name.text) &&
      /storage$/i.test(node.expression.expression.getText(sf)) &&
      node.arguments.length > 0
    ) {
      consts ??= collectConsts(sf);
      found.push({ line: lineOf(sf, node), method: node.expression.name.text, ...resolveKey(sf, node.arguments[0], consts) });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

// --- locale ---------------------------------------------------------------------------------------------------------

export function findLocaleCalls(sf) {
  const found = [];
  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && /^toLocale/.test(node.expression.name.text)) {
      found.push({ line: lineOf(sf, node), method: node.expression.name.text });
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return found;
}

// --- duplicates (jscpd) ---------------------------------------------------------------------------------------------

function runJscpd(files) {
  const out = mkdtempSync(path.join(tmpdir(), 'quality-report-'));
  try {
    const bin = path.join(ROOT, 'node_modules/.bin/jscpd');
    const run = spawnSync(bin, ['-a', '-r', 'json,silent', '-o', out, ...files], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 });
    if (run.status !== 0) throw new Error(`jscpd failed (${run.status}): ${run.stderr || run.stdout}`);
    const report = JSON.parse(readFileSync(path.join(out, 'jscpd-report.json'), 'utf8'));
    const rel = (name) => path.relative(ROOT, name);
    const clones = report.duplicates
      .map((d) => ({
        lines: d.lines,
        tokens: d.tokens,
        a: { file: rel(d.firstFile.name), start: d.firstFile.startLoc.line, end: d.firstFile.endLoc.line },
        b: { file: rel(d.secondFile.name), start: d.secondFile.startLoc.line, end: d.secondFile.endLoc.line },
      }))
      .sort((x, y) => y.lines - x.lines || x.a.file.localeCompare(y.a.file) || x.a.start - y.a.start);
    const total = report.statistics.total;
    return { summary: { clones: total.clones, duplicatedLines: total.duplicatedLines, lines: total.lines, percentage: Number(total.percentage.toFixed(2)) }, clones };
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}

// --- report ---------------------------------------------------------------------------------------------------------

export function analyse(sources, only) {
  const want = (id) => only.has(id);
  const result = {};
  const unions = new Map();
  if (want('catch-defaults')) result['catch-defaults'] = [];
  if (want('storage-keys')) result['storage-keys'] = [];
  if (want('locale')) result.locale = [];
  if (want('long-files')) result['long-files'] = [];
  for (const { file, text } of sources) {
    if (want('long-files')) {
      const lines = text.split('\n').length - (text.endsWith('\n') ? 1 : 0);
      if (lines > LONG_FILE_LINES) result['long-files'].push({ file, lines });
    }
    if (!(want('unions') || want('catch-defaults') || want('storage-keys') || want('locale'))) continue;
    const sf = parse(file, text);
    if (want('unions')) {
      for (const hit of findStringUnions(sf)) {
        if (!unions.has(hit.key)) unions.set(hit.key, []);
        unions.get(hit.key).push({ file, line: hit.line, name: hit.name });
      }
    }
    if (want('catch-defaults')) result['catch-defaults'].push(...findCatchDefaults(sf).map((hit) => ({ file, ...hit })));
    if (want('storage-keys')) result['storage-keys'].push(...findStorageKeys(sf).map((hit) => ({ file, ...hit })));
    if (want('locale')) result.locale.push(...findLocaleCalls(sf).map((hit) => ({ file, ...hit })));
  }
  if (want('unions')) {
    result.unions = [...unions]
      .filter(([, sites]) => sites.length > 1)
      .map(([members, sites]) => ({ members, sites }))
      .sort((x, y) => y.sites.length - x.sites.length || x.members.localeCompare(y.members));
  }
  if (want('long-files')) result['long-files'].sort((x, y) => y.lines - x.lines || x.file.localeCompare(y.file));
  return result;
}

const at = (file, line) => `\`${file}:${line}\``;

export function toMarkdown(result, meta) {
  const out = [`# Quality report`, '', `Commit ${meta.commit}, ${meta.date}. ${meta.files} source files (${SOURCE_ROOTS.join(', ')}; tests, fixtures, stories, generated and .d.ts files excluded).`, ''];
  for (const [id, title] of Object.entries(SECTIONS)) {
    const rows = result[id];
    if (rows === undefined) continue;
    const count = id === 'duplicates' ? rows.clones.length : rows.length;
    out.push(`## ${id} — ${title} (${count})`, '');
    if (id === 'duplicates') {
      const s = rows.summary;
      out.push(`${s.clones} clones, ${s.duplicatedLines} of ${s.lines} lines (${s.percentage}%). Largest first.`, '');
      for (const c of rows.clones) out.push(`- \`${c.a.file}:${c.a.start}-${c.a.end}\` = \`${c.b.file}:${c.b.start}-${c.b.end}\` (${c.lines} lines, ${c.tokens} tokens)`);
    } else if (id === 'unions') {
      for (const u of rows) {
        out.push(`- ${u.members} — ${u.sites.length} sites`);
        for (const s of u.sites) out.push(`  - ${at(s.file, s.line)}${s.name ? ` type ${s.name}` : ''}`);
      }
    } else if (id === 'catch-defaults') {
      for (const r of rows) out.push(`- ${at(r.file, r.line)} ${r.form} ${r.kind === 'swallows' ? 'swallows (empty)' : `returns ${r.value}`}`);
    } else if (id === 'storage-keys') {
      const byKey = new Map();
      for (const r of rows) {
        const key = r.resolved ? `'${r.key}'` : `${r.key} (expression)`;
        if (!byKey.has(key)) byKey.set(key, []);
        byKey.get(key).push(r);
      }
      for (const [key, sites] of [...byKey].sort(([a], [b]) => a.localeCompare(b))) {
        out.push(`- ${key}`);
        for (const s of sites) out.push(`  - ${at(s.file, s.line)} ${s.method}`);
      }
    } else if (id === 'locale') {
      for (const r of rows) out.push(`- ${at(r.file, r.line)} ${r.method}`);
    } else if (id === 'long-files') {
      for (const r of rows) out.push(`- \`${r.file}\` ${r.lines} lines`);
    }
    out.push('');
  }
  return out.join('\n');
}

function parseArgs(argv) {
  const opts = { only: new Set(Object.keys(SECTIONS)), json: false, out: undefined };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') opts.json = true;
    else if (arg === '--out') opts.out = argv[++i];
    else if (arg === '--only') {
      const ids = (argv[++i] ?? '').split(',').filter(Boolean);
      const unknown = ids.filter((id) => !(id in SECTIONS));
      if (unknown.length || !ids.length) throw new Error(`--only takes ${Object.keys(SECTIONS).join(',')}; got ${unknown.join(',') || 'nothing'}`);
      opts.only = new Set(ids);
    } else if (arg === '--help' || arg === '-h') {
      opts.help = true;
    } else throw new Error(`unknown argument ${arg}`);
  }
  return opts;
}

const localDate = (d) => [d.getFullYear(), d.getMonth() + 1, d.getDate()].map((n) => String(n).padStart(2, '0')).join('-');

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    process.stdout.write(`Usage: node tooling/scripts/quality-report.mjs [--only ${Object.keys(SECTIONS).join(',')}] [--json] [--out <file>]\n`);
    return;
  }
  const files = listSourceFiles();
  const sources = files.map((file) => ({ file, text: readFileSync(path.join(ROOT, file), 'utf8') }));
  const result = analyse(sources, opts.only);
  if (opts.only.has('duplicates')) result.duplicates = runJscpd(files);
  const commit = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).stdout.trim();
  const meta = { commit, date: localDate(new Date()), files: files.length };
  const text = opts.json ? `${JSON.stringify({ ...meta, ...result }, null, 2)}\n` : toMarkdown(result, meta);
  if (opts.out) writeFileSync(opts.out, text);
  else process.stdout.write(text);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`quality-report: ${error.message}\n`);
    process.exit(2);
  }
}
