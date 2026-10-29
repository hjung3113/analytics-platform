#!/usr/bin/env node
// Boundary enforcement per docs/architecture/platform-api/00-architecture.md and ADR-0016.
// Rule text below names the places by their package folder (packages/shared, apps/backend, ...); the places themselves
// are read from the path map, ops/platform-api/paths.mjs.
// Rules:
//   1. packages/shared MUST NOT import from apps/* or packages/ui.
//   2. packages/ui MUST NOT import from apps/* or packages/shared, MUST NOT call fetch/axios.
//   3. apps/frontend MUST NOT import from @radix-ui/* directly (shadcn primitives come from @ap/ui).
//   4. apps/frontend MUST NOT import from apps/backend.
//   5. apps/backend MUST NOT import from apps/frontend or packages/ui.
//   6. apps/backend/src/modules/* MUST NOT import another top-level module's repo*.js.
//   7. Files outside modules/voc MUST NOT import from modules/voc/jobs/.
//   8. Non-VOC frontend features and src/lib MUST NOT import VOC hooks/lib internals.
//   9. Backend modules MUST NOT import another module's __tests__/_seed-helpers.
//  10. Modules outside Core owners/tests MUST NOT use owner tables in raw SQL or import owner symbols;
//      src/test-support also MUST NOT import owner symbols from db/schema/core.
//  11. Source outside tests (apps/*, packages/*) MUST NOT import a platform package `@ap/*` other than
//      `@ap/ui`, own feature identities, and core-server-only `@ap/contract-schemas` (ADR-0097). Tests (__tests__/, tests/, test-support/, *.test.*) may import
//      `@ap/contracts`, `@ap/server-conformance` and `@ap/http-adapter` as devDependencies.
//      The manifests say the same: no FeedbackOps manifest (ops, apps/*, packages/*) lists an `@ap/*` package
//      outside these runtime allowances under dependencies, peerDependencies or optionalDependencies.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';

import ts from 'typescript';

import { isFeaturePackage } from '../../../tooling/eslint/src/feature-packages.js';

import { FO_BACKEND, FO_FRONTEND, FO_OPS, FO_SHARED, FO_UI, REPO_ROOT } from '../paths.mjs';

// Paths come from ops/platform-api/paths.mjs (the FeedbackOps path map); the rules below name the same places by the
// map's constants, and messages print repository-relative paths.
const ROOT = REPO_ROOT;
const BACKEND_MODULES = `${FO_BACKEND}/src/modules`;
// An app reaches its sibling app as `../../<folder>/…` (both live under apps/), so the pattern names the sibling by its
// folder in the path map.
const siblingImport = (dir) => new RegExp(`from\\s+['"]\\.\\./\\.\\./${basename(dir)}/`);
const RULES = [
  {
    scope: FO_SHARED,
    forbid: [/from\s+['"]@ap\/feature-ui/, /from\s+['"]\.\.\/\.\.\/apps\//],
    msg: 'packages/shared must not import apps/* or @ap/feature-ui',
  },
  {
    scope: FO_UI,
    forbid: [
      /from\s+['"]@ap\/feature-shared/,
      /from\s+['"]\.\.\/\.\.\/apps\//,
      /\bfetch\s*\(/,
      /from\s+['"]axios['"]/,
    ],
    msg: 'packages/ui must not call APIs or import apps/* or @ap/feature-shared',
  },
  {
    scope: FO_FRONTEND,
    forbid: [/from\s+['"]@radix-ui\//, siblingImport(FO_BACKEND)],
    msg: 'apps/frontend must import primitives via @ap/ui, not @radix-ui/*; must not import apps/platform-api',
  },
  {
    scope: FO_BACKEND,
    forbid: [/from\s+['"]@ap\/feature-ui/, siblingImport(FO_FRONTEND)],
    msg: 'apps/backend must not import @ap/feature-ui or apps/feature-screens',
  },
  {
    scope: BACKEND_MODULES,
    kind: 'cross-module-repo-import',
    targetBasename: /^repo[^/]*\.js$/,
    msg: 'backend modules must import another module through its approved public seam, not repo*.js',
  },
  {
    scope: FO_BACKEND,
    kind: 'outside-voc-imports-voc-jobs',
    msg: 'files outside the VOC module must import job behavior through the VOC public seam',
  },
  {
    scope: `${FO_FRONTEND}/src`,
    kind: 'feature-imports-voc-internals',
    msg: 'non-VOC frontend features and src/lib must not import VOC hooks or lib internals',
  },
  {
    scope: BACKEND_MODULES,
    kind: 'foreign-test-seed-helpers',
    msg: "backend modules must not import another module's __tests__/_seed-helpers; shared helpers live in src/test-support",
  },
  {
    scope: `${FO_BACKEND}/src`,
    kind: 'foreign-core-owner-table-access',
    msg: 'backend code must access Managed Systems and Analytics Areas through their owner surfaces',
  },
  ...[FO_BACKEND, FO_FRONTEND, FO_SHARED, FO_UI, FO_OPS].map((scope) => ({
    scope,
    kind: 'platform-package-imports',
    msg: 'FeedbackOps source may import only @ap/ui from the platform; core-server also permits @ap/contract-schemas; other SDK packages remain test-only (ADR-0097)',
  })),
];

const EXT = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx']);

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist' || name === '.turbo' || name === 'build')
      continue;
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) out.push(...walk(p));
    else if ([...EXT].some((e) => p.endsWith(e))) out.push(p);
  }
  return out;
}

function moduleSegment(file) {
  const rel = relative(join(ROOT, BACKEND_MODULES), file);
  if (rel.startsWith('..')) return null;
  return rel.split(sep)[0];
}

function isWithinPath(directory, file) {
  const rel = relative(directory, file);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`));
}

function collectImportSpecifiers(file, content) {
  const source = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);
  const out = [];
  const visit = (node) => {
    if (
      (ts.isImportDeclaration(node) ||
        ts.isExportDeclaration(node) ||
        ts.isImportEqualsDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      out.push({
        specifier: node.moduleSpecifier.text,
        line: source.getLineAndCharacterOfPosition(node.moduleSpecifier.getStart(source)).line + 1,
      });
    } else if (
      ts.isCallExpression(node) &&
      (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'require')) &&
      node.arguments.length >= 1 &&
      (ts.isStringLiteral(node.arguments[0]) ||
        ts.isNoSubstitutionTemplateLiteral(node.arguments[0]))
    ) {
      out.push({
        specifier: node.arguments[0].text,
        line: source.getLineAndCharacterOfPosition(node.arguments[0].getStart(source)).line + 1,
      });
    } else if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument) &&
      ts.isStringLiteral(node.argument.literal)
    ) {
      out.push({
        specifier: node.argument.literal.text,
        line: source.getLineAndCharacterOfPosition(node.argument.literal.getStart(source)).line + 1,
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return out;
}

function isTestPath(file) {
  const parts = relative(ROOT, file).split(sep);
  return (
    parts.some((part) => part === '__tests__' || part === 'tests' || part === 'test-support') ||
    /\.(test|spec)\.[^.]+$/.test(basename(file))
  );
}

function collectCoreOwnerTableImports(file, content) {
  const source = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);
  const out = [];
  const coreSchemaPath = /(?:^|\/)db\/schema\/core(?:\.js)?$/;
  const ownerTables = new Set(['managedSystems', 'analyticsAreas']);
  const visit = (node) => {
    if (
      ts.isImportDeclaration(node) &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      coreSchemaPath.test(node.moduleSpecifier.text.replaceAll('\\', '/'))
    ) {
      const namedBindings = node.importClause?.namedBindings;
      if (namedBindings && ts.isNamedImports(namedBindings)) {
        for (const element of namedBindings.elements) {
          const importedName = (element.propertyName ?? element.name).text;
          if (ownerTables.has(importedName)) {
            out.push({
              name: importedName,
              line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
            });
          }
        }
      }
    } else if (
      ts.isExportDeclaration(node) &&
      node.moduleSpecifier !== undefined &&
      ts.isStringLiteral(node.moduleSpecifier) &&
      coreSchemaPath.test(node.moduleSpecifier.text.replaceAll('\\', '/')) &&
      node.exportClause &&
      ts.isNamedExports(node.exportClause)
    ) {
      for (const element of node.exportClause.elements) {
        const importedName = (element.propertyName ?? element.name).text;
        if (ownerTables.has(importedName)) {
          out.push({
            name: importedName,
            line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
          });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return out;
}

let violations = 0;
for (const rule of RULES) {
  const base = join(ROOT, rule.scope);
  try {
    statSync(base);
  } catch {
    continue;
  }
  for (const file of walk(base)) {
    const content = readFileSync(file, 'utf8');
    if (rule.kind === 'cross-module-repo-import') {
      const srcSegment = moduleSegment(file);
      for (const { specifier, line } of collectImportSpecifiers(file, content)) {
        if (!specifier.startsWith('.')) continue;
        const target = resolve(dirname(file), specifier);
        const targetSegment = moduleSegment(target);
        if (
          srcSegment &&
          targetSegment &&
          srcSegment !== targetSegment &&
          rule.targetBasename.test(basename(target))
        ) {
          violations++;
          console.error(
            `[boundary] ${relative(ROOT, file)}:${line}: ${rule.msg} (imports ${relative(ROOT, target)})`,
          );
        }
      }
      continue;
    }
    if (rule.kind === 'outside-voc-imports-voc-jobs') {
      const vocModuleDir = join(ROOT, BACKEND_MODULES, 'voc');
      const vocJobsDir = join(vocModuleDir, 'jobs');
      if (isWithinPath(vocModuleDir, file)) continue;
      for (const { specifier, line } of collectImportSpecifiers(file, content)) {
        const normalizedSpecifier = specifier.replaceAll('\\', '/');
        const pathNamesVocJobs = /(^|\/)voc\/jobs(?:\/|$)/.test(normalizedSpecifier);
        const resolvedTarget = specifier.startsWith('.') ? resolve(dirname(file), specifier) : null;
        const targetsVocJobs =
          (resolvedTarget !== null && isWithinPath(vocJobsDir, resolvedTarget)) || pathNamesVocJobs;
        if (targetsVocJobs) {
          violations++;
          console.error(
            `[boundary] ${relative(ROOT, file)}:${line}: ${rule.msg} (imports ${specifier})`,
          );
        }
      }
      continue;
    }
    if (rule.kind === 'feature-imports-voc-internals') {
      const frontendSrc = join(ROOT, FO_FRONTEND, 'src');
      const featureRoot = join(frontendSrc, 'features');
      const libRoot = join(frontendSrc, 'lib');
      const vocHooksDir = join(featureRoot, 'voc/hooks');
      const vocLibDir = join(featureRoot, 'voc/lib');
      const frontendParts = relative(frontendSrc, file).split(sep);
      const featureParts = relative(featureRoot, file).split(sep);
      const isNonVocFeature =
        isWithinPath(featureRoot, file) && featureParts.length > 1 && featureParts[0] !== 'voc';
      const isLibFile = isWithinPath(libRoot, file);
      const isTestFile = frontendParts.includes('__tests__') || /\.test\./.test(basename(file));
      if ((!isNonVocFeature && !isLibFile) || isTestFile) continue;

      for (const { specifier, line } of collectImportSpecifiers(file, content)) {
        const normalizedSpecifier = specifier.replaceAll('\\', '/');
        const isVocAlias = /^@\/features\/voc\/(?:hooks|lib)(?:\/|$)/.test(normalizedSpecifier);
        const resolvedTarget = normalizedSpecifier.startsWith('.')
          ? resolve(dirname(file), normalizedSpecifier)
          : null;
        const targetsVocInternals =
          isVocAlias ||
          (resolvedTarget !== null &&
            (isWithinPath(vocHooksDir, resolvedTarget) || isWithinPath(vocLibDir, resolvedTarget)));
        if (targetsVocInternals) {
          violations++;
          console.error(
            `[boundary] ${relative(ROOT, file)}:${line}: ${rule.msg} (imports ${specifier})`,
          );
        }
      }
      continue;
    }
    if (rule.kind === 'foreign-test-seed-helpers') {
      const moduleRoot = join(ROOT, BACKEND_MODULES);
      const srcSegment = moduleSegment(file);
      for (const { specifier, line } of collectImportSpecifiers(file, content)) {
        const normalizedSpecifier = specifier.replaceAll('\\', '/');
        let targetModule = null;
        let resolvedTarget = null;
        if (normalizedSpecifier.startsWith('.')) {
          resolvedTarget = resolve(dirname(file), normalizedSpecifier);
          const targetRel = relative(moduleRoot, resolvedTarget);
          if (targetRel !== '..' && !targetRel.startsWith(`..${sep}`)) {
            const targetParts = targetRel.split(sep);
            if (
              targetParts[1] === '__tests__' &&
              /^_seed-helpers(?:$|[./])/.test(targetParts[2] ?? '')
            ) {
              targetModule = targetParts[0];
            }
          }
        } else {
          const match = normalizedSpecifier.match(
            /(?:^|\/)modules\/([^/]+)\/__tests__\/_seed-helpers(?:\/|\.|$)/,
          );
          targetModule = match?.[1] ?? null;
        }
        if (srcSegment && targetModule && srcSegment !== targetModule) {
          violations++;
          const displayTarget = resolvedTarget ? relative(ROOT, resolvedTarget) : specifier;
          console.error(
            `[boundary] ${relative(ROOT, file)}:${line}: ${rule.msg} (imports ${displayTarget})`,
          );
        }
      }
      continue;
    }
    if (rule.kind === 'platform-package-imports') {
      if (isTestPath(file)) continue;
      for (const { specifier, line } of collectImportSpecifiers(file, content)) {
        if (
          /^@ap\//.test(specifier) &&
          !isFeaturePackage(specifier) &&
          !/^@ap\/ui(?:\/|$)/.test(specifier) &&
          !(rule.scope === FO_BACKEND && /^@ap\/contract-schemas(?:\/|$)/.test(specifier))
        ) {
          violations++;
          console.error(
            `[boundary] ${relative(ROOT, file)}:${line}: ${rule.msg} (imports ${specifier})`,
          );
        }
      }
      continue;
    }
    if (rule.kind === 'foreign-core-owner-table-access') {
      const srcSegment = moduleSegment(file);
      const modulesRoot = join(ROOT, BACKEND_MODULES);
      const testSupportRoot = join(ROOT, FO_BACKEND, 'src/test-support');
      const isModuleFile = isWithinPath(modulesRoot, file);
      const isTestSupportFile = isWithinPath(testSupportRoot, file);
      const relativeParts = relative(isModuleFile ? modulesRoot : testSupportRoot, file).split(sep);
      if (
        (!isModuleFile && !isTestSupportFile) ||
        (isModuleFile && (srcSegment === 'managed-systems' || srcSegment === 'analytics-areas')) ||
        relativeParts.includes('__tests__') ||
        /\.test\./.test(basename(file))
      ) {
        continue;
      }
      for (const { name, line } of collectCoreOwnerTableImports(file, content)) {
        violations++;
        console.error(`[boundary] ${relative(ROOT, file)}:${line}: ${rule.msg} (imports ${name})`);
      }
      if (isModuleFile) {
        const tableReference = new RegExp(
          String.raw`\b(?:(?:from|join|update|into|using|delete\s+from|` +
            String.raw`truncate(?:\s+table)?|references|alter\s+table|create\s+table|drop\s+table)\s+|,\s*)` +
            String.raw`["']?core["']?\s*\.\s*["']?(managed_systems|analytics_areas)\b["']?`,
          'gi',
        );
        for (const match of content.matchAll(tableReference)) {
          const line = content.slice(0, match.index).split('\n').length;
          violations++;
          console.error(
            `[boundary] ${relative(ROOT, file)}:${line}: ${rule.msg} (references core.${match[1]})`,
          );
        }
      }
      continue;
    }
    for (const pat of rule.forbid) {
      if (pat.test(content)) {
        violations++;
        console.error(`[boundary] ${relative(ROOT, file)}: ${rule.msg} (matched ${pat})`);
      }
    }
  }
}

// Rule 11, manifest half: own feature identities and @ap/ui are runtime dependencies; only the core server also permits contract-schemas (ADR-0097). Every manifest that can reach the
// product's runtime graph is read: the FeedbackOps tool package (ops/platform-api) and each FeedbackOps app and package
// from the path map (never the platform's own apps/* and packages/*); peer and optional dependencies count as runtime.
const RUNTIME_DEP_FIELDS = ['dependencies', 'peerDependencies', 'optionalDependencies'];
const manifests = [
  join(ROOT, FO_OPS, 'package.json'),
  ...[FO_BACKEND, FO_FRONTEND, FO_SHARED, FO_UI, FO_OPS].map((dir) =>
    join(ROOT, dir, 'package.json'),
  ),
];
for (const manifest of manifests) {
  let pkg;
  try {
    pkg = JSON.parse(readFileSync(manifest, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT' || err.code === 'ENOTDIR') continue;
    throw err;
  }
  for (const field of RUNTIME_DEP_FIELDS) {
    for (const dep of Object.keys(pkg[field] ?? {})) {
      if (
        /^@ap\//.test(dep) &&
        !isFeaturePackage(dep) &&
        dep !== '@ap/ui' &&
        !(manifest === join(ROOT, FO_BACKEND, 'package.json') && dep === '@ap/contract-schemas')
      ) {
        violations++;
        console.error(
          `[boundary] ${relative(ROOT, manifest)}: ${field} may list only @ap/ui from the platform; ${dep} belongs in devDependencies (ADR-0073)`,
        );
      }
    }
  }
}

if (violations > 0) {
  console.error(`\n${violations} boundary violation(s)`);
  process.exit(1);
}
console.log('boundaries: OK');
