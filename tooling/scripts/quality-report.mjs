#!/usr/bin/env node
// Quality report (#2181): one command lists every site of six code-quality patterns as `path:line` rows, so a
// review-quality round cites the whole list and the model judges each row instead of sampling the codebase.
// Hand runs and main-push only, never PR CI (#2181 "PR CI에 jscpd … 하지 않기로").
//
//   node tooling/scripts/quality-report.mjs [--only a,b] [--json] [--out <file>]
//
// Sections: duplicates (jscpd), unions (string-literal unions declared more than once), catch-defaults (catches that
// return a default value or swallow the error), storage-keys (Web Storage keys and SDK storage helper keys), locale (`toLocale*` calls),
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
  /(?:^|\/)(?:__tests__|__fixtures__|__mocks__|tests?|tests-kit|test-support|testing|fixtures)\//,
  /(?:^|\/)(?:test-setup|test-support|testing(?:-engines)?)\.[^/]+$/,
  /(?:^|\/|-)fixtures?(?:-local)?\.[^/]+$/,
  /(?:^|\/|\.)vitest(?:\.[^/]+)?\.[^/]+$/,
  /^apps\/platform-e2e\//,
  /^tooling\/storybook\//,
];
export const LONG_FILE_LINES = 500;

export const SECTIONS = {
  duplicates: 'Duplicate code (jscpd)',
  unions: 'String-literal unions declared more than once',
  'catch-defaults': 'Catches that return a default value or swallow the error',
  'storage-keys': 'Web Storage keys (direct calls and SDK storage helpers)',
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

const UTILITY_SELECTORS = new Set(['Pick', 'Omit', 'Exclude', 'Extract']);

/** The key or member selector of `Pick`/`Omit`/`Exclude`/`Extract`: a subset of an existing type, not a new union. */
const isUtilitySelector = (node) =>
  ts.isTypeReferenceNode(node.parent) &&
  ts.isIdentifier(node.parent.typeName) &&
  UTILITY_SELECTORS.has(node.parent.typeName.text) &&
  node.parent.typeArguments?.[1] === node;

/** Unions of two or more string literals (null/undefined members ignored), keyed by the sorted member set. */
export function findStringUnions(sf) {
  const found = [];
  const visit = (node) => {
    if (ts.isUnionTypeNode(node) && !ts.isUnionTypeNode(node.parent) && !isUtilitySelector(node)) {
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
  if (!expr) return false; // a bare `return;` ends the handler; it does not stand in for a result
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
  const [only] = body.statements;
  if (!only || (body.statements.length === 1 && ts.isReturnStatement(only) && !only.expression)) return { kind: 'swallows', value: 'empty' };
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
// SDK wrappers whose first argument is a storage key (browserPreferenceKey's is the key kind). Keep in step with
// `@ap/ui` utils/storage.ts, `@ap/kernel` platform/preferences.ts and `@ap/components` preferences/browserPreference.ts.
const STORAGE_HELPERS = new Set([
  'readLocalStorage',
  'writeLocalStorage',
  'readPreference',
  'readStoredPreference',
  'writePreference',
  'readBrowserPreference',
  'browserPreferenceKey',
]);

const unwrap = (expr) => {
  while (ts.isAsExpression(expr) || ts.isSatisfiesExpression(expr) || ts.isParenthesizedExpression(expr)) expr = expr.expression;
  return expr;
};

/** The string a same-file key builder returns: `(id) => \`k:${id}\`` or `function k(id) { return ...; }`. */
function returnedString(fn) {
  const body = fn.body && (ts.isBlock(fn.body) ? fn.body.statements.length === 1 && ts.isReturnStatement(fn.body.statements[0]) && fn.body.statements[0].expression : fn.body);
  if (!body) return undefined;
  const value = unwrap(body);
  const stringLike = ts.isStringLiteralLike(value) || ts.isTemplateExpression(value) || (ts.isBinaryExpression(value) && value.operatorToken.kind === ts.SyntaxKind.PlusToken);
  return stringLike ? value : undefined;
}

/**
 * Text of a key expression. Follows a same-file `const` string, a property of a same-file `const` object, a call of a
 * same-file key builder, `${CONST}` spans of a template and `+` joins; a part it cannot follow stays as `${expr}`.
 */
export function resolveKey(sf, expr, consts, depth = 0) {
  expr = unwrap(expr);
  if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) return { key: expr.text, resolved: true };
  if (ts.isTemplateExpression(expr)) {
    let key = expr.head.text;
    for (const span of expr.templateSpans) {
      const inner = depth < 3 && (ts.isIdentifier(span.expression) || ts.isPropertyAccessExpression(span.expression)) ? resolveKey(sf, span.expression, consts, depth + 1) : undefined;
      key += (inner?.resolved ? inner.key : `\${${span.expression.getText(sf)}}`) + span.literal.text;
    }
    return { key, resolved: true };
  }
  if (ts.isBinaryExpression(expr) && expr.operatorToken.kind === ts.SyntaxKind.PlusToken && depth < 3) {
    const parts = [expr.left, expr.right].map((side) => resolveKey(sf, side, consts, depth + 1));
    if (parts.some((part) => part.resolved)) return { key: parts.map((part) => (part.resolved ? part.key : `\${${part.key}}`)).join(''), resolved: true };
  }
  let named;
  if (ts.isIdentifier(expr) || ts.isPropertyAccessExpression(expr)) named = consts.get(expr.getText(sf));
  else if (ts.isCallExpression(expr) && ts.isIdentifier(expr.expression)) named = consts.get(`${expr.expression.text}()`);
  if (named && depth < 3) return resolveKey(sf, named, consts, depth + 1);
  return { key: expr.getText(sf), resolved: false };
}

function collectConsts(sf) {
  const consts = new Map();
  const visit = (node) => {
    if (ts.isFunctionDeclaration(node) && node.name) {
      const value = returnedString(node);
      if (value) consts.set(`${node.name.text}()`, value);
    } else if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer && ts.getCombinedNodeFlags(node) & ts.NodeFlags.Const) {
      const init = unwrap(node.initializer);
      if (ts.isStringLiteralLike(init) || ts.isTemplateExpression(init)) consts.set(node.name.text, init);
      else if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) {
        const value = returnedString(init);
        if (value) consts.set(`${node.name.text}()`, value);
      } else if (ts.isObjectLiteralExpression(init)) {
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

/** A key that is a parameter of the enclosing function: a wrapper passing its caller's key through, not a key. */
function isPassThrough(expr) {
  if (!ts.isIdentifier(expr)) return false;
  for (let node = expr.parent; node; node = node.parent) {
    if (ts.isFunctionLike(node)) return node.parameters.some((param) => ts.isIdentifier(param.name) && param.name.text === expr.text);
  }
  return false;
}

/** The method or helper name of a storage access, or undefined. */
function storageCall(node) {
  if (!ts.isCallExpression(node) || node.arguments.length === 0) return undefined;
  const callee = node.expression;
  if (ts.isPropertyAccessExpression(callee) && STORAGE_METHODS.has(callee.name.text)) return callee.name.text;
  if (ts.isIdentifier(callee) && STORAGE_HELPERS.has(callee.text)) return callee.text;
  return undefined;
}

/** Keys passed to `getItem`/`setItem`/`removeItem` (Web Storage: the repo's only API with those names) and the SDK storage helpers. */
export function findStorageKeys(sf) {
  const found = [];
  let consts;
  const visit = (node) => {
    const method = storageCall(node);
    if (method && !isPassThrough(unwrap(node.arguments[0]))) {
      consts ??= collectConsts(sf);
      found.push({ line: lineOf(sf, node), method, ...resolveKey(sf, node.arguments[0], consts) });
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
    if (run.status !== 0) throw new Error(`jscpd failed (${run.status ?? run.error?.code}): ${run.stderr || run.stdout || run.error?.message}`);
    const report = JSON.parse(readFileSync(path.join(out, 'jscpd-report.json'), 'utf8'));
    const rel = (name) => path.relative(ROOT, name);
    const clones = report.duplicates
      .map((d) => ({
        lines: d.lines,
        tokens: d.tokens,
        a: { file: rel(d.firstFile.name), start: d.firstFile.startLoc.line, end: d.firstFile.endLoc.line },
        b: { file: rel(d.secondFile.name), start: d.secondFile.startLoc.line, end: d.secondFile.endLoc.line },
      }))
      .sort(
        (x, y) =>
          y.lines - x.lines || x.a.file.localeCompare(y.a.file) || x.a.start - y.a.start || x.b.file.localeCompare(y.b.file) || x.b.start - y.b.start,
      );
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

export function parseArgs(argv) {
  const opts = { only: new Set(Object.keys(SECTIONS)), json: false, out: undefined };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') opts.json = true;
    else if (arg === '--out') {
      const out = argv[++i];
      if (!out || out.startsWith('-')) throw new Error('--out takes a file path');
      opts.out = out;
    }
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
