// Snapshot the public declarations represented by the SDK packages' built dist entries.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { SDK_PACKAGES, distTarget } from './sdk-exports.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const snapshotDirectory = join(repoRoot, 'tooling/sdk/api');
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
  // @ap/contracts uses TypeScript to build and validate the same SDK declarations.
  const packageRequire = createRequire(resolve(repoRoot, 'packages/contracts/package.json'));
  return packageRequire('typescript');
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

// The SDK package that owns a built declaration file, or undefined for third-party and lib files.
function ownerPackage(fileName) {
  const match = fileName.replace(/\\/g, '/').match(/\/packages\/([^/]+)\/dist\//);
  return match ? match[1] : undefined;
}

function declarationIsTypeOnly(ts, declaration) {
  if (ts.isExportSpecifier(declaration) || ts.isImportSpecifier(declaration)) {
    return declaration.isTypeOnly || declaration.parent.parent.isTypeOnly === true;
  }
  if (ts.isNamespaceExport(declaration) || ts.isNamespaceImport(declaration)) return declaration.parent.isTypeOnly === true;
  if (ts.isImportClause(declaration) || ts.isImportEqualsDeclaration(declaration)) return declaration.isTypeOnly === true;
  return false;
}

function referenceEntity(ts, node) {
  if (ts.isTypeReferenceNode(node)) return node.typeName;
  if (ts.isExpressionWithTypeArguments(node)) return node.expression;
  if (ts.isTypeQueryNode(node)) return node.exprName;
  if (ts.isImportTypeNode(node) && !node.isTypeOf) return node.qualifier;
  return undefined;
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

// entries: [{ path, id, pkg, root }] — every public type entry of the program. options.ownerOf maps a
// declaration file name to its SDK package (undefined = not SDK-owned, referenced by name only).
function declarationSnapshot(ts, entries, options) {
  const { paths, baseUrl, ownerOf } = options;
  const program = createCompilerProgram(ts, entries.map((entry) => entry.path), baseUrl, paths);
  const checker = program.getTypeChecker();
  const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed, removeComments: true });
  const flags = ts.SymbolFlags;
  const packageRoot = baseUrl;

  for (const sourceFile of program.getSourceFiles()) {
    if (ownerOf(sourceFile.fileName) === undefined) continue;
    for (const statement of sourceFile.statements) {
      if (ts.isExportDeclaration(statement) && statement.isTypeOnly && !statement.exportClause) {
        fail('unsupported "export type *" in ' + basename(sourceFile.fileName) + ': type-only availability cannot be read per symbol');
      }
    }
  }

  const resolveAlias = (symbol) => (symbol.flags & flags.Alias ? checker.getAliasedSymbol(symbol) : symbol);

  function isTypeOnlyExport(symbol) {
    const seen = new Set();
    let current = symbol;
    while (current && current.flags & flags.Alias && !seen.has(current)) {
      seen.add(current);
      if ((current.declarations ?? []).some((declaration) => declarationIsTypeOnly(ts, declaration))) return true;
      current = checker.getImmediateAliasedSymbol(current);
    }
    return false;
  }

  const exportsByEntry = new Map();
  for (const entry of entries) {
    const sourceFile = program.getSourceFile(entry.path);
    if (!sourceFile) fail('TypeScript did not load declaration ' + entry.path);
    const diagnostics = program.getSyntacticDiagnostics(sourceFile).concat(program.getSemanticDiagnostics(sourceFile));
    const errors = diagnostics.filter((diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error);
    if (errors.length > 0) {
      const messages = errors.map((diagnostic) => ts.flattenDiagnosticMessageText(diagnostic.messageText, ' '));
      fail('TypeScript could not read ' + basename(entry.path) + ': ' + messages.join('; '));
    }
    const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
    if (!moduleSymbol) fail('declaration has no module exports: ' + entry.path);
    exportsByEntry.set(
      entry.path,
      checker.getExportsOfModule(moduleSymbol).map((symbol) => ({
        name: symbol.getName(),
        symbol,
        target: resolveAlias(symbol),
        typeOnly: isTypeOnlyExport(symbol),
        sourceFile,
      })),
    );
  }

  const isOwned = (symbol) => {
    const declarations = symbol.declarations ?? [];
    return declarations.length > 0 && declarations.every((declaration) => ownerOf(declaration.getSourceFile().fileName) !== undefined);
  };
  const ownerOfSymbol = (symbol) => ownerOf(symbol.declarations[0].getSourceFile().fileName);

  // Public identity: @ap/<pkg>[/<entry>]#Name. A symbol exported from several entries prefers the entry of its own
  // package, then the root entry, then the smallest id, so the choice does not depend on discovery order.
  const homes = new Map();
  for (const entry of entries) {
    for (const item of exportsByEntry.get(entry.path)) {
      const list = homes.get(item.target) ?? [];
      list.push({ entry, name: item.name });
      homes.set(item.target, list);
    }
  }
  const publicNames = new Map();
  for (const [target, list] of homes) {
    const owner = isOwned(target) ? ownerOfSymbol(target) : undefined;
    const rank = (home) => [home.entry.pkg === owner ? 0 : 1, home.entry.root ? 0 : 1, home.entry.id, home.name];
    list.sort((left, right) => {
      const a = rank(left);
      const b = rank(right);
      return a[0] - b[0] || a[1] - b[1] || compareText(a[2], b[2]) || compareText(a[3], b[3]);
    });
    publicNames.set(target, list[0].entry.id + '#' + list[0].name);
  }

  // A reference to an SDK-owned symbol, or undefined for type parameters, third-party and lib symbols.
  function resolveEntity(node) {
    let right;
    let left;
    if (ts.isIdentifier(node)) {
      right = node;
    } else if (ts.isQualifiedName(node)) {
      right = node.right;
      left = node.left;
    } else if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.name)) {
      right = node.name;
      left = node.expression;
    } else {
      return undefined;
    }
    const symbol = checker.getSymbolAtLocation(right);
    if (!symbol) return undefined;
    const target = resolveAlias(symbol);
    if (target.flags & (flags.EnumMember | flags.Property | flags.Method)) {
      const container = left ? resolveEntity(left) : undefined;
      return container ? { symbol: container.symbol, suffix: container.suffix + '.' + right.text } : undefined;
    }
    if (target.flags & flags.TypeParameter || !isOwned(target)) return undefined;
    return { symbol: target, suffix: '' };
  }

  const directRefsCache = new Map();
  function directRefs(symbol) {
    if (directRefsCache.has(symbol)) return directRefsCache.get(symbol);
    const found = new Set();
    directRefsCache.set(symbol, found);
    if (!isOwned(symbol)) return found;
    const visit = (node) => {
      const entity = referenceEntity(ts, node);
      const reference = entity ? resolveEntity(entity) : undefined;
      if (reference) found.add(reference.symbol);
      ts.forEachChild(node, visit);
    };
    for (const declaration of symbol.declarations) {
      if (!ts.isSourceFile(declaration)) visit(declaration);
    }
    return found;
  }

  // SDK-owned symbols reachable from an entry's exports that no entry exports (walked transitively; third-party
  // symbols and symbols another entry exports stay references).
  function reachablePrivate(items) {
    const seen = new Set();
    const queue = items.flatMap((item) => [...directRefs(item.target)]);
    while (queue.length > 0) {
      const symbol = queue.pop();
      if (seen.has(symbol) || publicNames.has(symbol)) continue;
      seen.add(symbol);
      queue.push(...directRefs(symbol));
    }
    return seen;
  }
  const reachableByEntry = new Map(entries.map((entry) => [entry.path, reachablePrivate(exportsByEntry.get(entry.path))]));

  // Canonical private names: the symbol name; on a collision NAME~pkg, then NAME~pkg~n ordered by definition text.
  const roughText = (symbol) =>
    symbol.declarations
      .map((declaration) => normalizeOneLine(printer.printNode(ts.EmitHint.Unspecified, declaration, declaration.getSourceFile()), packageRoot))
      .join(' ');
  const privateNames = new Map();
  const byName = new Map();
  for (const symbols of reachableByEntry.values()) {
    for (const symbol of symbols) byName.set(symbol, symbol.getName());
  }
  const groups = new Map();
  for (const [symbol, name] of byName) groups.set(name, [...(groups.get(name) ?? []), symbol]);
  for (const [name, symbols] of groups) {
    if (symbols.length === 1) {
      privateNames.set(symbols[0], name);
      continue;
    }
    const labelled = new Map();
    for (const symbol of symbols) {
      const label = name + '~' + (ownerOfSymbol(symbol) ?? 'x');
      labelled.set(label, [...(labelled.get(label) ?? []), symbol]);
    }
    for (const [label, sameLabel] of labelled) {
      if (sameLabel.length === 1) {
        privateNames.set(sameLabel[0], label);
        continue;
      }
      sameLabel
        .map((symbol) => ({ symbol, text: roughText(symbol) }))
        .sort((left, right) => compareText(left.text, right.text))
        .forEach((item, index) => privateNames.set(item.symbol, label + '~' + (index + 1)));
    }
  }

  const nameOfReference = (reference) => {
    const home = publicNames.get(reference.symbol) ?? privateNames.get(reference.symbol);
    if (home === undefined) fail('unnamed SDK reference ' + reference.symbol.getName());
    return home + reference.suffix;
  };

  const printCanonical = (node, sourceFile) =>
    normalizeOneLine(printer.printNode(ts.EmitHint.Unspecified, node, sourceFile), packageRoot);

  // Named members first (by name), then call, construct, index signatures; equal keys keep source order, which
  // matters for overloads.
  function sortMembers(members, sourceFile) {
    const isStatic = (member) => (member.modifiers ?? []).some((modifier) => modifier.kind === ts.SyntaxKind.StaticKeyword);
    const keyed = members.map((member) => {
      let rank = 0;
      if (ts.isCallSignatureDeclaration(member)) rank = 1;
      else if (ts.isConstructSignatureDeclaration(member) || ts.isConstructorDeclaration(member)) rank = 2;
      else if (ts.isIndexSignatureDeclaration(member)) rank = 3;
      else if (ts.isClassStaticBlockDeclaration(member)) rank = 4;
      const name = rank === 0 && member.name ? (isStatic(member) ? '0' : '1') + printCanonical(member.name, sourceFile) : '';
      return { member, rank, name };
    });
    keyed.sort((left, right) => left.rank - right.rank || compareText(left.name, right.name));
    return keyed.map((item) => item.member);
  }

  // Rewrites SDK references to their canonical names and sorts order-insensitive members (object type literal
  // properties, union constituents).
  function canonicalize(node) {
    const sourceFile = node.getSourceFile();
    const result = ts.transform(node, [
      (context) => (root) => {
        const factory = context.factory;
        const visit = (current) => {
          const entity = referenceEntity(ts, current);
          const reference = entity ? resolveEntity(entity) : undefined;
          if (reference) {
            const name = factory.createIdentifier(nameOfReference(reference));
            const typeArguments = ts.visitNodes(current.typeArguments, visit, ts.isTypeNode);
            if (ts.isTypeReferenceNode(current)) return factory.updateTypeReferenceNode(current, name, typeArguments);
            if (ts.isExpressionWithTypeArguments(current)) return factory.updateExpressionWithTypeArguments(current, name, typeArguments);
            if (ts.isTypeQueryNode(current)) return factory.updateTypeQueryNode(current, name, typeArguments);
            return factory.createTypeReferenceNode(name, typeArguments);
          }
          const visited = ts.visitEachChild(current, visit, context);
          if (ts.isTypeLiteralNode(visited)) {
            return factory.updateTypeLiteralNode(visited, factory.createNodeArray(sortMembers(visited.members, sourceFile)));
          }
          if (ts.isUnionTypeNode(visited)) {
            const sorted = visited.types
              .map((type) => ({ type, text: printCanonical(type, sourceFile) }))
              .sort((left, right) => compareText(left.text, right.text))
              .map((item) => item.type);
            return factory.updateUnionTypeNode(visited, factory.createNodeArray(sorted));
          }
          return visited;
        };
        return ts.visitNode(root, visit);
      },
    ]);
    const output = result.transformed[0];
    result.dispose();
    return output;
  }

  const printed = (node) => printCanonical(canonicalize(node), node.getSourceFile());

  function typeParametersText(node) {
    if (!node.typeParameters || node.typeParameters.length === 0) return '';
    return '<' + node.typeParameters.map(printed).join(', ') + '>';
  }

  function heritageText(declaration) {
    return (declaration.heritageClauses ?? []).map(printed).join(' ');
  }

  function memberTexts(declaration) {
    const sourceFile = declaration.getSourceFile();
    return sortMembers(declaration.members.map(canonicalize), sourceFile).map((member) => printCanonical(member, sourceFile));
  }

  function renderInterface(name, declaration) {
    const heritage = heritageText(declaration);
    const header = 'interface ' + name + typeParametersText(declaration) + (heritage ? ' ' + heritage : '');
    return header + ' { ' + memberTexts(declaration).join(' ') + ' }';
  }

  function renderClass(name, declaration) {
    const heritage = heritageText(declaration);
    const isAbstract = (declaration.modifiers ?? []).some((modifier) => modifier.kind === ts.SyntaxKind.AbstractKeyword);
    const header = (isAbstract ? 'abstract ' : '') + 'class ' + name + typeParametersText(declaration) + (heritage ? ' ' + heritage : '');
    return header + ' { ' + memberTexts(declaration).join(' ') + ' }';
  }

  function renderTypeAlias(name, declaration) {
    return 'type ' + name + typeParametersText(declaration) + ' = ' + printed(declaration.type);
  }

  function renderFunction(name, declarations) {
    return declarations
      .filter(ts.isFunctionDeclaration)
      .map((declaration) => {
        const canonical = canonicalize(declaration);
        const bare = ts.factory.updateFunctionDeclaration(
          canonical,
          undefined,
          canonical.asteriskToken,
          ts.factory.createIdentifier(name),
          canonical.typeParameters,
          canonical.parameters,
          canonical.type,
          undefined,
        );
        return printCanonical(bare, declaration.getSourceFile()).replace(/;$/, '');
      })
      .join(' ; ');
  }

  function renderConst(name, symbol, declaration) {
    if (declaration.type) return 'const ' + name + ': ' + printed(declaration.type);
    const type = checker.getTypeOfSymbolAtLocation(symbol, declaration);
    return 'const ' + name + ': ' + normalizeOneLine(checker.typeToString(type, declaration, ts.TypeFormatFlags.NoTruncation), packageRoot);
  }

  function renderEnum(name, declaration) {
    const sourceFile = declaration.getSourceFile();
    const isConst = (declaration.modifiers ?? []).some((modifier) => modifier.kind === ts.SyntaxKind.ConstKeyword);
    const members = declaration.members.map((member) => {
      const memberName = printCanonical(member.name, sourceFile);
      const constantValue = checker.getConstantValue(member);
      if (constantValue !== undefined) {
        return memberName + ' = ' + (typeof constantValue === 'string' ? JSON.stringify(constantValue) : String(constantValue));
      }
      if (member.initializer) return memberName + ' = ' + printed(member.initializer);
      return memberName;
    });
    return (isConst ? 'const ' : '') + 'enum ' + name + ' { ' + members.join(', ') + ' }';
  }

  function renderNamespace(name, declaration) {
    const body = ts.isModuleDeclaration(declaration) ? declaration.body : declaration;
    if (!body || !ts.isModuleBlock(body)) return 'namespace ' + name + ' {}';
    const statements = body.statements.map(printed).sort(compareText);
    return 'namespace ' + name + ' { ' + statements.join(' ') + ' }';
  }

  // One `name | kind | definition` line. kind is prefixed `type-only ` when the symbol also has a runtime
  // value but the export site is type-only (`export type { x }`).
  function renderSymbol(name, target, typeOnly, fallbackSource) {
    const declarations = target.declarations ?? [];
    const kind = symbolKind(ts, declarations);
    if (!kind) fail('unsupported symbol kind: ' + name);
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
    if (kind === 'function') signature = renderFunction(name, declarations);
    else if (kind === 'class') signature = renderClass(name, declaration);
    else if (kind === 'interface') signature = renderInterface(name, declaration);
    else if (kind === 'type') signature = renderTypeAlias(name, declaration);
    else if (kind === 'enum') signature = renderEnum(name, declaration);
    else if (kind === 'namespace') signature = renderNamespace(name, declaration);
    else signature = renderConst(name, target, declaration ?? fallbackSource);

    const marker = typeOnly && target.flags & flags.Value ? 'type-only ' : '';
    return name + ' | ' + marker + kind + ' | ' + normalizeOneLine(signature, packageRoot);
  }

  const snapshots = new Map();
  for (const entry of entries) {
    const exportLines = exportsByEntry
      .get(entry.path)
      .map((item) => renderSymbol(item.name, item.target, item.typeOnly, item.sourceFile))
      .sort(compareText);
    const reachableLines = [...reachableByEntry.get(entry.path)]
      .map((symbol) => renderSymbol(privateNames.get(symbol), symbol, false, symbol.declarations[0].getSourceFile()))
      .sort(compareText);
    snapshots.set(entry.path, [...exportLines, '# reachable types', ...reachableLines]);
  }
  return snapshots;
}

function entrySnapshotPath(packageName, subpath) {
  const entryName = subpath === '.' ? 'root' : subpath.slice(2).replace(/\//g, '.');
  return packageName + '.' + entryName + '.api.txt';
}

function packageConfigs() {
  return SDK_PACKAGES.map((name) => {
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
  const typeEntries = [...entriesByPackage.values()]
    .flat()
    .filter((entry) => typeof entry.dist !== 'string')
    .map((entry) => ({
      path: entry.artifactPath,
      id: entry.config.manifest.name + (entry.subpath === '.' ? '' : entry.subpath.slice(1)),
      pkg: entry.config.name,
      root: entry.subpath === '.',
    }));
  const declarations = declarationSnapshot(ts, typeEntries, { paths, baseUrl: repoRoot, ownerOf: ownerPackage });
  for (const entries of entriesByPackage.values()) {
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
      const leaked = lines.find((line) => line.includes('/dist/'));
      if (leaked) fail(entry.snapshotFile + ' contains a private dist path: ' + leaked.slice(0, 200));
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
    process.stdout.write(unifiedDiff(actual, expected, 'tooling/sdk/api/' + name) + '\n');
  }

  for (const name of currentNames.sort(compareText)) {
    if (expectedNames.has(name)) continue;
    mismatches += 1;
    const actual = readFileSync(join(snapshotDirectory, name), 'utf8');
    process.stdout.write('stale snapshot: ' + name + ' (its export entry no longer exists)\n');
    process.stdout.write(unifiedDiff(actual, '', 'tooling/sdk/api/' + name) + '\n');
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

// Snapshot a throwaway module graph; `files` maps names to contents and api.d.ts is the entry.
function fixtureSnapshot(ts, files) {
  const directory = mkdtempSync(join(realpathSync(tmpdir()), 'ap-sdk-api-self-test-'));
  try {
    for (const [name, contents] of Object.entries(files)) writeFileSync(join(directory, name), contents.join('\n') + '\n');
    const entry = { path: join(directory, 'api.d.ts'), id: '@fix', pkg: 'fix', root: true };
    const ownerOf = (fileName) => (fileName.startsWith(directory) ? 'fix' : undefined);
    return declarationSnapshot(ts, [entry], { paths: {}, baseUrl: directory, ownerOf }).get(entry.path);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function runSelfTest(ts) {
  const types = [
    'export interface User {',
    '  name?: string;',
    '  id: string;',
    '}',
    'export type UserId = string | number;',
    'export function greet(user: User): string;',
    'export {};',
  ];
  const before = fixtureSnapshot(ts, { 'types.d.ts': types, 'api.d.ts': ['export { User, UserId, greet } from "./types.js";'] });
  const after = fixtureSnapshot(ts, { 'types.d.ts': types, 'api.d.ts': ['export { User, greet } from "./types.js";'] });
  assert(before.includes('greet | function | function greet(user: @fix#User): string'), 'function export is listed with its public references');
  assert(before.includes('User | interface | interface User { id: string; name?: string; }'), 'interface members are sorted');
  assert(before.includes('UserId | type | type UserId = number | string'), 'sibling type re-export keeps its (sorted) union definition');
  assert(!after.some((line) => line.startsWith('UserId | ')), 'removed export is absent in the after snapshot');
  const removal = unifiedDiff(before.join('\n') + '\n', after.join('\n') + '\n', 'fixture.api.txt');
  assert.match(removal, /-UserId \| type \| type UserId = number \| string/, 'removed export appears in the diff');

  // C1: a change inside a private type reachable from a public signature shows up.
  const reachable = (field) => [
    'interface Inner { a: ' + field + '; }',
    'export interface Outer { inner: Inner; }',
    'export function make(): Inner;',
    'export {};',
  ];
  const reachApi = ['export { Outer, make } from "./types.js";'];
  const innerBefore = fixtureSnapshot(ts, { 'types.d.ts': reachable('string'), 'api.d.ts': reachApi });
  const innerAfter = fixtureSnapshot(ts, { 'types.d.ts': reachable('number'), 'api.d.ts': reachApi });
  assert(innerBefore.includes('make | function | function make(): Inner'), 'private return type is referenced by canonical name');
  assert(innerBefore.includes('Inner | interface | interface Inner { a: string; }'), 'reachable private type is defined');
  assert(innerBefore.indexOf('# reachable types') < innerBefore.indexOf('Inner | interface | interface Inner { a: string; }'), 'private type sits in the reachable section');
  const innerDiff = unifiedDiff(innerBefore.join('\n') + '\n', innerAfter.join('\n') + '\n', 'fixture.api.txt');
  assert.match(innerDiff, /-Inner \| interface \| interface Inner \{ a: string; \}[\s\S]*\+Inner \| interface \| interface Inner \{ a: number; \}/, 'private type change appears in the diff');

  // C2: a value re-export turned type-only changes the line.
  const valueTypes = ['export function greet(): string;', 'export {};'];
  const valueExport = fixtureSnapshot(ts, { 'types.d.ts': valueTypes, 'api.d.ts': ['export { greet } from "./types.js";'] });
  const typeOnlyExport = fixtureSnapshot(ts, { 'types.d.ts': valueTypes, 'api.d.ts': ['export type { greet } from "./types.js";'] });
  assert(valueExport.includes('greet | function | function greet(): string'), 'value export is a plain function');
  assert(typeOnlyExport.includes('greet | type-only function | function greet(): string'), 'type-only export is marked');
  const chained = fixtureSnapshot(ts, {
    'types.d.ts': valueTypes,
    'mid.d.ts': ['export type { greet } from "./types.js";'],
    'api.d.ts': ['export { greet } from "./mid.js";'],
  });
  assert(chained.includes('greet | type-only function | function greet(): string'), 'type-only link in a re-export chain is marked');

  // C3: moving types between declaration files leaves the snapshot unchanged.
  const together = fixtureSnapshot(ts, {
    'types.d.ts': ['interface Inner { a: string; }', 'export interface Pub { x: Inner; y: Pub2; }', 'export interface Pub2 { z: number; }', 'export {};'],
    'api.d.ts': ['export { Pub, Pub2 } from "./types.js";'],
  });
  const split = fixtureSnapshot(ts, {
    'inner.d.ts': ['export interface Inner { a: string; }'],
    'pub2.d.ts': ['export interface Pub2 { z: number; }'],
    'pub.d.ts': ['import type { Inner } from "./inner.js";', 'import type { Pub2 } from "./pub2.js";', 'export interface Pub { x: Inner; y: Pub2; }'],
    'api.d.ts': ['export { Pub } from "./pub.js";', 'export { Pub2 } from "./pub2.js";'],
  });
  assert(together.includes('Pub | interface | interface Pub { x: Inner; y: @fix#Pub2; }'), 'public and private references use canonical names');
  assert.deepEqual(split, together, 'moving types between files changes nothing');
  assert(!together.concat(split).some((line) => line.includes('/dist/') || line.includes('import(')), 'no file paths in the snapshot');

  // C3: same-named private types in different files get stable distinct names.
  const collisionApi = ['export { Holder } from "./pub.js";'];
  const collisionA = fixtureSnapshot(ts, {
    'a.d.ts': ['export interface Item { a: string; }'],
    'b.d.ts': ['export interface Item { b: string; }'],
    'pub.d.ts': ['import type { Item as A } from "./a.js";', 'import type { Item as B } from "./b.js";', 'export interface Holder { a: A; b: B; }'],
    'api.d.ts': collisionApi,
  });
  const collisionB = fixtureSnapshot(ts, {
    'a.d.ts': ['export interface Item { b: string; }'],
    'b.d.ts': ['export interface Item { a: string; }'],
    'pub.d.ts': ['import type { Item as A } from "./b.js";', 'import type { Item as B } from "./a.js";', 'export interface Holder { a: A; b: B; }'],
    'api.d.ts': collisionApi,
  });
  assert(collisionA.some((line) => line.startsWith('Item~fix~1 | ')) && collisionA.some((line) => line.startsWith('Item~fix~2 | ')), 'colliding private names are disambiguated');
  assert.deepEqual(collisionB, collisionA, 'collision names do not depend on the declaring file');

  // C4: reordering members, call signatures and union constituents changes nothing; a real edit does.
  const shape = (members, union, bType) => [
    'export interface Box {',
    ...members.map((member) => member.replace('BTYPE', bType)),
    '}',
    'export type Pair = { q: string; p: number; nested: { z: 1; y: 2 } };',
    'export type Kind = ' + union + ';',
    'export {};',
  ];
  const ordered = ['  a: string;', '  b: BTYPE;', '  (x: number): void;', '  [key: string]: unknown;'];
  const reordered = ['  [key: string]: unknown;', '  b: BTYPE;', '  (x: number): void;', '  a: string;'];
  const boxApi = ['export { Box, Pair, Kind } from "./types.js";'];
  const boxBase = fixtureSnapshot(ts, { 'types.d.ts': shape(ordered, "'a' | 'b' | null", 'number'), 'api.d.ts': boxApi });
  const boxMoved = fixtureSnapshot(ts, { 'types.d.ts': shape(reordered, "null | 'b' | 'a'", 'number'), 'api.d.ts': boxApi });
  const boxEdited = fixtureSnapshot(ts, { 'types.d.ts': shape(ordered, "'a' | 'b' | null", 'string'), 'api.d.ts': boxApi });
  assert(boxBase.includes('Pair | type | type Pair = { nested: { y: 2; z: 1; }; p: number; q: string; }'), 'object type literal members are sorted');
  assert(boxBase.includes("Kind | type | type Kind = 'a' | 'b' | null"), 'union constituents are sorted');
  assert.deepEqual(boxMoved, boxBase, 'member and constituent order changes nothing');
  assert.notDeepEqual(boxEdited, boxBase, 'a changed member type still changes the snapshot');
  const reorderedTypeLiteral = fixtureSnapshot(ts, {
    'types.d.ts': ['export type Pair = { p: number; nested: { y: 2; z: 1 }; q: string };', 'export {};'],
    'api.d.ts': ['export { Pair } from "./types.js";'],
  });
  assert(reorderedTypeLiteral.includes('Pair | type | type Pair = { nested: { y: 2; z: 1; }; p: number; q: string; }'), 'type literal reorder is canonical');

  process.stdout.write('sdk:api self-test passed: function, interface, re-export, removal, reachable private type, type-only export, relocation, name collision, member order\n');
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
