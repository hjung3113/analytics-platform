// Snapshot the public declarations represented by the SDK packages' built dist entries.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const packageNames = ['contracts', 'kernel', 'ui', 'components', 'shell'];
const snapshotDirectory = join(repoRoot, 'tooling/sdk-api');
const apiFilePattern = /\.api\.txt$/;

function fail(message) {
  throw new Error(message);
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    fail('cannot read ' + path + ': ' + error.message);
  }
}

function loadTypeScript() {
  const packageRequire = createRequire(resolve(repoRoot, 'tooling/gen-menu/package.json'));
  return packageRequire('typescript');
}

// Keep this derivation in sync with sdk-pack.mjs: a source JS entry has a .d.ts and .js target.
function distTarget(target, label) {
  if (typeof target !== 'string' || !target.startsWith('./src/')) {
    fail(label + ': export target ' + JSON.stringify(target) + ' must start with ./src/');
  }
  const inDist = './dist/' + target.slice('./src/'.length);
  if (/\.tsx?$/.test(inDist)) {
    const stem = inDist.replace(/\.tsx?$/, '');
    return { types: stem + '.d.ts', import: stem + '.js' };
  }
  return inDist;
}

function normalizeModulePaths(value, packageRoot) {
  return value.replace(/import\((["'])([^"']+)\1\)/g, (whole, quote, specifier) => {
    const normalized = specifier.replace(/\\/g, '/');
    const absolute = normalized.startsWith('/') || /^[A-Za-z]:\//.test(normalized) || normalized.startsWith('//');
    if (!absolute) return whole;

    const packageMatch = normalized.match(/(?:^|\/)packages\/([^/]+)\/(.+)$/);
    if (packageMatch) {
      const currentPackage = basename(packageRoot);
      const prefix = packageMatch[1] === currentPackage ? './' : '../' + packageMatch[1] + '/';
      return 'import(' + quote + prefix + packageMatch[2] + quote + ')';
    }

    const nodeModulesIndex = normalized.lastIndexOf('/node_modules/');
    if (nodeModulesIndex >= 0) {
      const pieces = normalized.slice(nodeModulesIndex + '/node_modules/'.length).split('/');
      const dependencyParts = pieces[0].startsWith('@') ? pieces.slice(0, 2) : pieces.slice(0, 1);
      const dependency = dependencyParts.join('/');
      const subpath = pieces.slice(dependencyParts.length).join('/');
      const portable = dependency + (subpath ? '/' + subpath : '');
      return 'import(' + quote + portable + quote + ')';
    }

    const fileName = basename(normalized);
    return 'import(' + quote + './' + fileName + quote + ')';
  });
}

function normalizeOneLine(value, packageRoot) {
  const pathNormalized = normalizeModulePaths(value, packageRoot);
  const templateQuote = String.fromCharCode(96);
  let output = '';
  let pendingSpace = false;
  let quote = '';
  let escaped = false;

  for (const character of pathNormalized) {
    if (quote) {
      output += character;
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === quote) {
        quote = '';
      }
      continue;
    }

    if (/\s/.test(character)) {
      pendingSpace = output.length > 0;
      continue;
    }
    if (pendingSpace) output += ' ';
    pendingSpace = false;
    output += character;
    if (character === '"' || character === "'" || character === templateQuote) quote = character;
  }

  return output.trim();
}

function createCompilerProgram(ts, declarationPaths, baseUrl, paths) {
  const options = {
    allowImportingTsExtensions: true,
    baseUrl,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    noEmit: true,
    paths: Object.keys(paths).length > 0 ? paths : undefined,
    skipLibCheck: true,
    strict: true,
    target: ts.ScriptTarget.ESNext,
  };
  return ts.createProgram(declarationPaths, options);
}

function printNode(ts, printer, node, sourceFile, packageRoot) {
  return normalizeOneLine(printer.printNode(ts.EmitHint.Unspecified, node, sourceFile), packageRoot);
}

function typeParametersText(ts, printer, node, sourceFile, packageRoot) {
  if (!node.typeParameters || node.typeParameters.length === 0) return '';
  return '<' + node.typeParameters.map((parameter) => printNode(ts, printer, parameter, sourceFile, packageRoot)).join(', ') + '>';
}

function sortedMemberText(ts, printer, members, sourceFile, packageRoot) {
  return members
    .map((member) => printNode(ts, printer, member, sourceFile, packageRoot))
    .sort(compareText);
}

function renderInterface(ts, printer, name, declaration, packageRoot) {
  const sourceFile = declaration.getSourceFile();
  const typeParameters = typeParametersText(ts, printer, declaration, sourceFile, packageRoot);
  const heritage = (declaration.heritageClauses ?? [])
    .map((clause) => printNode(ts, printer, clause, sourceFile, packageRoot))
    .join(' ');
  const members = sortedMemberText(ts, printer, declaration.members, sourceFile, packageRoot);
  const header = 'interface ' + name + typeParameters + (heritage ? ' ' + heritage : '');
  return header + ' { ' + members.join(' ') + ' }';
}

function renderClass(ts, printer, name, declaration, packageRoot) {
  const sourceFile = declaration.getSourceFile();
  const typeParameters = typeParametersText(ts, printer, declaration, sourceFile, packageRoot);
  const heritage = (declaration.heritageClauses ?? [])
    .map((clause) => printNode(ts, printer, clause, sourceFile, packageRoot))
    .join(' ');
  const members = sortedMemberText(ts, printer, declaration.members, sourceFile, packageRoot);
  const isAbstract = (declaration.modifiers ?? []).some((modifier) => modifier.kind === ts.SyntaxKind.AbstractKeyword);
  const header = (isAbstract ? 'abstract ' : '') + 'class ' + name + typeParameters + (heritage ? ' ' + heritage : '');
  return header + ' { ' + members.join(' ') + ' }';
}

function renderTypeAlias(ts, checker, printer, name, declaration, packageRoot) {
  const type = checker.getTypeFromTypeNode(declaration.type);
  const typeText = normalizeOneLine(
    checker.typeToString(type, declaration, ts.TypeFormatFlags.InTypeAlias | ts.TypeFormatFlags.NoTruncation),
    packageRoot,
  );
  const typeParameters = typeParametersText(ts, printer, declaration, declaration.getSourceFile(), packageRoot);
  return 'type ' + name + typeParameters + ' = ' + typeText;
}

function renderFunction(ts, checker, name, symbol, declaration, packageRoot) {
  const location = symbol.valueDeclaration ?? declaration;
  const type = checker.getTypeOfSymbolAtLocation(symbol, location);
  const signatures = checker.getSignaturesOfType(type, ts.SignatureKind.Call);
  if (signatures.length === 0) {
    return 'function ' + name + ': ' + normalizeOneLine(checker.typeToString(type, location, ts.TypeFormatFlags.NoTruncation), packageRoot);
  }
  const rendered = signatures.map((signature) =>
    normalizeOneLine(checker.signatureToString(signature, location, ts.TypeFormatFlags.NoTruncation, ts.SignatureKind.Call), packageRoot),
  );
  return 'function ' + name + rendered.join(' ; ');
}

function renderConst(ts, checker, name, symbol, declaration, packageRoot) {
  const location = symbol.valueDeclaration ?? declaration;
  const type = checker.getTypeOfSymbolAtLocation(symbol, location);
  return 'const ' + name + ': ' + normalizeOneLine(checker.typeToString(type, location, ts.TypeFormatFlags.NoTruncation), packageRoot);
}

function renderEnum(ts, checker, printer, name, declaration, packageRoot) {
  const sourceFile = declaration.getSourceFile();
  const isConst = (declaration.modifiers ?? []).some((modifier) => modifier.kind === ts.SyntaxKind.ConstKeyword);
  const members = declaration.members.map((member) => {
    const memberName = printNode(ts, printer, member.name, sourceFile, packageRoot);
    const constantValue = checker.getConstantValue(member);
    if (constantValue !== undefined) {
      return memberName + ' = ' + (typeof constantValue === 'string' ? JSON.stringify(constantValue) : String(constantValue));
    }
    if (member.initializer) {
      return memberName + ' = ' + printNode(ts, printer, member.initializer, sourceFile, packageRoot);
    }
    return memberName;
  });
  return (isConst ? 'const ' : '') + 'enum ' + name + ' { ' + members.join(', ') + ' }';
}

function renderNamespace(ts, printer, name, declaration, packageRoot) {
  const body = ts.isModuleDeclaration(declaration) ? declaration.body : declaration;
  if (!body || !ts.isModuleBlock(body)) return 'namespace ' + name + ' {}';
  const statements = body.statements
    .map((statement) => printNode(ts, printer, statement, body.getSourceFile(), packageRoot))
    .sort(compareText);
  return 'namespace ' + name + ' { ' + statements.join(' ') + ' }';
}

function symbolKind(ts, declarations) {
  if (declarations.some(ts.isFunctionDeclaration)) return 'function';
  if (declarations.some(ts.isClassDeclaration)) return 'class';
  if (declarations.some(ts.isInterfaceDeclaration)) return 'interface';
  if (declarations.some(ts.isTypeAliasDeclaration)) return 'type';
  if (declarations.some(ts.isEnumDeclaration)) return 'enum';
  if (declarations.some(ts.isModuleDeclaration) || declarations.some(ts.isSourceFile)) return 'namespace';
  if (declarations.some(ts.isVariableDeclaration)) return 'const';
  return undefined;
}

function renderExport(ts, checker, printer, exportedSymbol, sourceFile, packageRoot) {
  let target = exportedSymbol;
  if (exportedSymbol.flags & ts.SymbolFlags.Alias) {
    target = checker.getAliasedSymbol(exportedSymbol);
  }
  const declarations = target.declarations ?? [];
  const kind = symbolKind(ts, declarations);
  if (!kind) fail('unsupported exported symbol kind: ' + exportedSymbol.getName());
  const name = exportedSymbol.getName();
  const declaration = declarations.find((candidate) => {
    if (kind === 'function') return ts.isFunctionDeclaration(candidate);
    if (kind === 'class') return ts.isClassDeclaration(candidate);
    if (kind === 'interface') return ts.isInterfaceDeclaration(candidate);
    if (kind === 'type') return ts.isTypeAliasDeclaration(candidate);
    if (kind === 'enum') return ts.isEnumDeclaration(candidate);
    if (kind === 'namespace') return ts.isModuleDeclaration(candidate) || ts.isSourceFile(candidate);
    return ts.isVariableDeclaration(candidate);
  });

  let signature;
  if (kind === 'function') {
    signature = renderFunction(ts, checker, name, target, declaration ?? sourceFile, packageRoot);
  } else if (kind === 'class') {
    signature = renderClass(ts, printer, name, declaration, packageRoot);
  } else if (kind === 'interface') {
    signature = renderInterface(ts, printer, name, declaration, packageRoot);
  } else if (kind === 'type') {
    signature = renderTypeAlias(ts, checker, printer, name, declaration, packageRoot);
  } else if (kind === 'enum') {
    signature = renderEnum(ts, checker, printer, name, declaration, packageRoot);
  } else if (kind === 'namespace') {
    signature = renderNamespace(ts, printer, name, declaration, packageRoot);
  } else {
    signature = renderConst(ts, checker, name, target, declaration ?? sourceFile, packageRoot);
  }

  return name + ' | ' + kind + ' | ' + normalizeOneLine(signature, packageRoot);
}

function declarationSnapshot(ts, declarationPaths, packageRoot, paths, baseUrl) {
  const program = createCompilerProgram(ts, declarationPaths, baseUrl, paths);
  const checker = program.getTypeChecker();
  const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed, removeComments: true });
  const snapshots = new Map();

  for (const declarationPath of declarationPaths) {
    const sourceFile = program.getSourceFile(declarationPath);
    if (!sourceFile) fail('TypeScript did not load declaration ' + declarationPath);
    const diagnostics = program.getSyntacticDiagnostics(sourceFile).concat(program.getSemanticDiagnostics(sourceFile));
    const errors = diagnostics.filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
    if (errors.length > 0) {
      const messages = errors.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, ' '));
      fail('TypeScript could not read ' + basename(declarationPath) + ': ' + messages.join('; '));
    }

    const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
    if (!moduleSymbol) fail('declaration has no module exports: ' + declarationPath);
    const lines = checker
      .getExportsOfModule(moduleSymbol)
      .map((symbol) => renderExport(ts, checker, printer, symbol, sourceFile, packageRoot))
      .sort(compareText);
    snapshots.set(declarationPath, lines);
  }

  return snapshots;
}

function entrySnapshotPath(packageName, subpath) {
  const entryName = subpath === '.' ? 'root' : subpath.slice(2).replace(/\//g, '.');
  return packageName + '.' + entryName + '.api.txt';
}

function packageConfigs() {
  return packageNames.map((name) => {
    const packageRoot = join(repoRoot, 'packages', name);
    const manifest = readJson(join(packageRoot, 'package.json'));
    return { name, packageRoot, manifest };
  });
}

function workspaceTypePaths(configs) {
  const paths = {};
  for (const config of configs) {
    for (const [subpath, target] of Object.entries(config.manifest.exports ?? {})) {
      const dist = distTarget(target, config.manifest.name + ' exports[' + JSON.stringify(subpath) + ']');
      if (typeof dist === 'string') continue;
      const key = config.manifest.name + (subpath === '.' ? '' : subpath.slice(1));
      paths[key] = [relative(repoRoot, resolve(config.packageRoot, dist.types)).split(sep).join('/')];
    }
  }
  return paths;
}

function collectSnapshots(ts) {
  const configs = packageConfigs();
  const entriesByPackage = new Map();

  for (const config of configs) {
    const entries = Object.entries(config.manifest.exports ?? {}).map(([subpath, target]) => {
      const dist = distTarget(target, config.manifest.name + ' exports[' + JSON.stringify(subpath) + ']');
      const artifact = typeof dist === 'string' ? dist : dist.types;
      const artifactPath = resolve(config.packageRoot, artifact);
      if (!existsSync(artifactPath)) {
        fail(config.manifest.name + ' is missing ' + artifact + '; run pnpm build first');
      }
      return {
        config,
        subpath,
        dist,
        artifactPath,
        snapshotFile: entrySnapshotPath(config.name, subpath),
      };
    });
    entriesByPackage.set(config.name, entries);
  }

  const paths = workspaceTypePaths(configs);
  const snapshots = new Map();
  for (const entries of entriesByPackage.values()) {
    const typeEntries = entries.filter((entry) => typeof entry.dist !== 'string');
    const declarations = declarationSnapshot(
      ts,
      typeEntries.map((entry) => entry.artifactPath),
      entries[0]?.config.packageRoot ?? repoRoot,
      paths,
      repoRoot,
    );
    for (const entry of entries) {
      let lines;
      if (typeof entry.dist !== 'string') {
        lines = declarations.get(entry.artifactPath);
      } else {
        lines = [entry.subpath];
        if (basename(entry.artifactPath) === 'theme-tokens.json') {
          const tokens = readJson(entry.artifactPath);
          if (!tokens.color || typeof tokens.color !== 'object' || Array.isArray(tokens.color)) {
            fail(entry.config.manifest.name + ' theme-tokens.json has no top-level color object');
          }
          lines.push(...Object.keys(tokens.color).sort(compareText).map((name) => 'color.' + name));
        }
      }
      snapshots.set(entry.snapshotFile, lines.join('\n') + '\n');
    }
  }

  return snapshots;
}

function splitLines(value) {
  if (value === '') return [];
  const lines = value.split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  return lines;
}

function unifiedDiff(before, after, path) {
  const oldLines = splitLines(before);
  const newLines = splitLines(after);
  let prefix = 0;
  while (prefix < oldLines.length && prefix < newLines.length && oldLines[prefix] === newLines[prefix]) prefix += 1;

  let suffix = 0;
  while (
    suffix < oldLines.length - prefix &&
    suffix < newLines.length - prefix &&
    oldLines[oldLines.length - suffix - 1] === newLines[newLines.length - suffix - 1]
  ) {
    suffix += 1;
  }

  const oldMiddle = oldLines.slice(prefix, oldLines.length - suffix);
  const newMiddle = newLines.slice(prefix, newLines.length - suffix);
  if (oldMiddle.length === 0 && newMiddle.length === 0) return '';

  const oldStart = oldMiddle.length === 0 ? prefix : prefix + 1;
  const newStart = newMiddle.length === 0 ? prefix : prefix + 1;
  const lines = [
    '--- a/' + path,
    '+++ b/' + path,
    '@@ -' + oldStart + ',' + oldMiddle.length + ' +' + newStart + ',' + newMiddle.length + ' @@',
    ...oldMiddle.map((line) => '-' + line),
    ...newMiddle.map((line) => '+' + line),
  ];
  return lines.join('\n');
}

function checkSnapshots(snapshots) {
  const currentNames = existsSync(snapshotDirectory)
    ? readdirSync(snapshotDirectory).filter((name) => apiFilePattern.test(name))
    : [];
  const expectedNames = new Set(snapshots.keys());
  let mismatches = 0;

  for (const name of [...snapshots.keys()].sort(compareText)) {
    const expected = snapshots.get(name);
    const path = join(snapshotDirectory, name);
    const actual = existsSync(path) ? readFileSync(path, 'utf8') : '';
    if (actual === expected) continue;
    mismatches += 1;
    process.stdout.write(unifiedDiff(actual, expected, 'tooling/sdk-api/' + name) + '\n');
  }

  for (const name of currentNames.sort(compareText)) {
    if (expectedNames.has(name)) continue;
    mismatches += 1;
    const actual = readFileSync(join(snapshotDirectory, name), 'utf8');
    process.stdout.write('stale snapshot: ' + name + ' (its export entry no longer exists)\n');
    process.stdout.write(unifiedDiff(actual, '', 'tooling/sdk-api/' + name) + '\n');
  }

  if (mismatches > 0) {
    const tick = String.fromCharCode(96);
    process.stdout.write(
      '의도한 공개 API 변경이면 ' +
        tick +
        'pnpm sdk:api --update' +
        tick +
        ' 후, 지우거나 바뀐 줄은 소비 안내의 변경 기록에 적는다\n',
    );
    process.exitCode = 1;
    return;
  }
  process.stdout.write('sdk:api passed: ' + snapshots.size + ' snapshots match\n');
}

function updateSnapshots(snapshots) {
  mkdirSync(snapshotDirectory, { recursive: true });
  for (const [name, contents] of snapshots) {
    writeFileSync(join(snapshotDirectory, name), contents);
  }
  const expectedNames = new Set(snapshots.keys());
  for (const name of readdirSync(snapshotDirectory)) {
    if (apiFilePattern.test(name) && !expectedNames.has(name)) rmSync(join(snapshotDirectory, name));
  }
  process.stdout.write('sdk:api updated: ' + snapshots.size + ' snapshots\n');
}

function runSelfTest(ts) {
  const fixtureDirectory = mkdtempSync(join(tmpdir(), 'ap-sdk-api-self-test-'));
  try {
    writeFileSync(
      join(fixtureDirectory, 'types.d.ts'),
      [
        'export interface User {',
        '  name?: string;',
        '  id: string;',
        '}',
        'export type UserId = string | number;',
        'export function greet(user: User): string;',
        '',
      ].join('\n'),
    );
    const beforePath = join(fixtureDirectory, 'api-before.d.ts');
    const afterPath = join(fixtureDirectory, 'api-after.d.ts');
    writeFileSync(beforePath, 'export { User, UserId, greet } from "./types.js";\n');
    writeFileSync(afterPath, 'export { User, greet } from "./types.js";\n');

    const before = declarationSnapshot(ts, [beforePath], fixtureDirectory, {}, fixtureDirectory).get(beforePath);
    const after = declarationSnapshot(ts, [afterPath], fixtureDirectory, {}, fixtureDirectory).get(afterPath);
    assert(before.some((line) => line.startsWith('greet | function | function greet(')), 'function export is listed');
    assert(
      before.some((line) => line.startsWith('User | interface | interface User { id: string; name?: string; }')),
      'interface members are sorted',
    );
    assert(
      before.some((line) => line.startsWith('UserId | type | type UserId = string | number')),
      'sibling type re-export keeps its union definition',
    );
    assert(!after.some((line) => line.startsWith('UserId | ')), 'removed export is absent in the after snapshot');

    const diff = unifiedDiff(before.join('\n') + '\n', after.join('\n') + '\n', 'fixture.api.txt');
    assert.match(diff, /-UserId \| type \| type UserId = string \| number/, 'removed export appears in the diff');
    process.stdout.write('sdk:api self-test passed: function, interface, sibling re-export, and removed-export diff\n');
  } finally {
    rmSync(fixtureDirectory, { recursive: true, force: true });
  }
}

function parseMode(args) {
  if (args.length === 0) return 'check';
  if (args.length === 1 && args[0] === '--update') return 'update';
  if (args.length === 1 && args[0] === '--self-test') return 'self-test';
  fail('usage: pnpm sdk:api [--update | --self-test]');
}

function main() {
  const mode = parseMode(process.argv.slice(2));
  const ts = loadTypeScript();
  if (mode === 'self-test') {
    runSelfTest(ts);
    return;
  }
  const snapshots = collectSnapshots(ts);
  if (mode === 'update') updateSnapshots(snapshots);
  else checkSnapshots(snapshots);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    process.stderr.write('sdk:api FAILED: ' + (error instanceof Error ? error.message : String(error)) + '\n');
    process.exitCode = 1;
  }
}
