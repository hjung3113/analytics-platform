#!/usr/bin/env node
// Boundary enforcement per apps/platform-api/docs/00-architecture.md and ADR-0016.
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
//      The manifests say the same: no feature manifest (ops, apps/*, packages/*) lists an `@ap/*` package
//      outside these runtime allowances under dependencies, peerDependencies or optionalDependencies.
//      One lint-only exception (#1102): the exact root `eslint.config.js` of a package whose lint runs on ESLint may import
//      exactly `@ap/eslint-config` (a devDependency). Runtime files, nested lookalikes, subpaths and other `@ap/*` stay denied.
//  12. Non-test source in apps/platform-api/src/modules/<A>/** importing modules/<B>/** (A != B) must land on an approved
//      surface (APPROVED_SURFACE_FILES below; docs/02-domain-module-boundaries.md «Approved cross-module surfaces»).
//      Existing off-surface pairs are frozen in check-boundaries.baseline.json (exact `importing file -> target file`
//      pairs). A pair not in the baseline fails; a baseline pair that no longer exists also fails, so the baseline only
//      shrinks. `--shrink-baseline` rewrites the file with the stale pairs removed (never adds); `--init-baseline`
//      writes it once when it does not exist yet. Growth is checked against the merge-base's baseline file (see
//      checkBaselineGrowth): a pair the branch adds, or a baseline file the merge-base has and the tree lacks, fails
//      unless a commit in <merge-base>..HEAD carries `Boundary-Baseline-Growth: #<issue> <reason>`.
//      Documented seams (entity-links/provider-types, */recovery-read, and dashboard/recorder for type-only imports)
//      are approved surfaces, not baseline pairs.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';

import ts from 'typescript';

import { isFeaturePackage } from '../../../tooling/eslint/src/feature-packages.js';

import {
  FEATURE_BACKEND,
  FEATURE_FRONTEND,
  FEATURE_OPS,
  FEATURE_SHARED,
  FEATURE_UI,
  REPO_ROOT,
} from '../paths.mjs';

// Paths come from ops/platform-api/paths.mjs (the feature path map); the rules below name the same places by the
// map's constants, and messages print repository-relative paths.
const ROOT = REPO_ROOT;
const BACKEND_MODULES = `${FEATURE_BACKEND}/src/modules`;
// An app reaches its sibling app as `../../<folder>/…` (both live under apps/), so the pattern names the sibling by its
// folder in the path map.
const siblingImport = (dir) => new RegExp(`from\\s+['"]\\.\\./\\.\\./${basename(dir)}/`);
const RULES = [
  {
    scope: FEATURE_SHARED,
    forbid: [/from\s+['"]@ap\/feature-ui/, /from\s+['"]\.\.\/\.\.\/apps\//],
    msg: 'packages/shared must not import apps/* or @ap/feature-ui',
  },
  {
    scope: FEATURE_UI,
    forbid: [
      /from\s+['"]@ap\/feature-shared/,
      /from\s+['"]\.\.\/\.\.\/apps\//,
      /\bfetch\s*\(/,
      /from\s+['"]axios['"]/,
    ],
    msg: 'packages/ui must not call APIs or import apps/* or @ap/feature-shared',
  },
  {
    scope: FEATURE_FRONTEND,
    forbid: [/from\s+['"]@radix-ui\//, siblingImport(FEATURE_BACKEND)],
    msg: 'apps/frontend must import primitives via @ap/ui, not @radix-ui/*; must not import apps/platform-api',
  },
  {
    scope: FEATURE_BACKEND,
    forbid: [/from\s+['"]@ap\/feature-ui/, siblingImport(FEATURE_FRONTEND)],
    msg: 'apps/backend must not import @ap/feature-ui or apps/feature-screens',
  },
  {
    scope: BACKEND_MODULES,
    kind: 'cross-module-repo-import',
    targetBasename: /^repo[^/]*\.js$/,
    msg: 'backend modules must import another module through its approved public seam, not repo*.js or repositories/',
  },
  {
    scope: FEATURE_BACKEND,
    kind: 'outside-voc-imports-voc-jobs',
    msg: 'files outside the VOC module must import job behavior through the VOC public seam',
  },
  {
    scope: `${FEATURE_FRONTEND}/src`,
    kind: 'feature-imports-voc-internals',
    msg: 'non-VOC frontend features and src/lib must not import VOC hooks or lib internals',
  },
  {
    scope: BACKEND_MODULES,
    kind: 'foreign-test-seed-helpers',
    msg: "backend modules must not import another module's __tests__/_seed-helpers; shared helpers live in src/test-support",
  },
  {
    scope: `${FEATURE_BACKEND}/src`,
    kind: 'foreign-core-owner-table-access',
    msg: 'backend code must access Managed Systems and Analytics Areas through their owner surfaces',
  },
  ...[FEATURE_BACKEND, FEATURE_FRONTEND, FEATURE_SHARED, FEATURE_UI, FEATURE_OPS].map((scope) => ({
    scope,
    kind: 'platform-package-imports',
    msg: 'Feature source may import only @ap/ui from the platform; core-server also permits @ap/contract-schemas; other SDK packages remain test-only (ADR-0097)',
  })),
];

// Lint-only exception to rule 11: these exact files (never nested lookalikes) may import exactly `@ap/eslint-config`.
const LINT_CONFIG_PACKAGE = '@ap/eslint-config';
const LINT_CONFIG_FILES = new Set(
  [FEATURE_BACKEND, FEATURE_FRONTEND, FEATURE_SHARED, FEATURE_UI].map((dir) =>
    join(ROOT, dir, 'eslint.config.js'),
  ),
);

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

function isInRepositoriesDir(file) {
  const rel = relative(join(ROOT, BACKEND_MODULES), file);
  return rel.split(sep)[1] === 'repositories';
}

function isWithinPath(directory, file) {
  const rel = relative(directory, file);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`));
}

// `import type`, `export type`, or a named list whose every element is marked `type`. A default or namespace binding
// beside inline types, and an empty list, load the module at runtime.
function isTypeOnlyDeclaration(node) {
  if (ts.isImportDeclaration(node)) {
    const clause = node.importClause;
    if (!clause) return false;
    if (clause.isTypeOnly) return true;
    const named = clause.namedBindings;
    return (
      !clause.name &&
      named !== undefined &&
      ts.isNamedImports(named) &&
      named.elements.length > 0 &&
      named.elements.every((element) => element.isTypeOnly)
    );
  }
  if (ts.isExportDeclaration(node)) {
    if (node.isTypeOnly) return true;
    const named = node.exportClause;
    return (
      named !== undefined &&
      ts.isNamedExports(named) &&
      named.elements.length > 0 &&
      named.elements.every((element) => element.isTypeOnly)
    );
  }
  return false;
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
        typeOnly: isTypeOnlyDeclaration(node),
      });
    } else if (
      ts.isImportEqualsDeclaration(node) &&
      ts.isExternalModuleReference(node.moduleReference) &&
      ts.isStringLiteral(node.moduleReference.expression)
    ) {
      out.push({
        specifier: node.moduleReference.expression.text,
        line:
          source.getLineAndCharacterOfPosition(node.moduleReference.expression.getStart(source))
            .line + 1,
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
        typeOnly: true,
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
          (rule.targetBasename.test(basename(target)) || isInRepositoriesDir(target))
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
      const frontendSrc = join(ROOT, FEATURE_FRONTEND, 'src');
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
      const isLintConfig = LINT_CONFIG_FILES.has(file);
      for (const { specifier, line } of collectImportSpecifiers(file, content)) {
        if (isLintConfig && specifier === LINT_CONFIG_PACKAGE) continue;
        if (
          /^@ap\//.test(specifier) &&
          !isFeaturePackage(specifier) &&
          !/^@ap\/ui(?:\/|$)/.test(specifier) &&
          !(rule.scope === FEATURE_BACKEND && /^@ap\/contract-schemas(?:\/|$)/.test(specifier))
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
      const testSupportRoot = join(ROOT, FEATURE_BACKEND, 'src/test-support');
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

// Rule 12: approved cross-module surfaces, as docs/02-domain-module-boundaries.md «Approved cross-module surfaces» and
// docs/00-architecture.md «Dependency Direction» name them. Module-root file names (extension-less):
const APPROVED_SURFACE_NAMES = new Set([
  'recovery-read', // leaf recovery read seam of findings, permissions, surveys, tasks, voc, voc-clusters
  'index',
  'commands',
  'read-projections',
  'read-service',
  'authorization',
  'read-contract',
]);
// Named by module and file. The permission check API and the wiring every menu route and session-aware handler needs:
// without these, routine new code could only pass by hand-editing the baseline.
const APPROVED_SURFACE_PATHS = new Set([
  'core/responsibility-read-projections',
  'permissions/check-service',
  'permissions/scope-service',
  'auth/session-service',
  'menu-dispatch/types',
  'platform-port/permissions',
  'entity-links/provider-types', // documented provider seam
]);
// Approved for type-only imports: the seam the boundary doc describes is an injected type interface, and the same file
// also exports the runtime recorder factory and recovery lock.
const TYPE_ONLY_SURFACE_PATHS = new Set(['dashboard/recorder']);
// `domain modules -> core interfaces/types`: anything under core (rule 6 still bars its repositories).
const APPROVED_SURFACE_MODULES = new Set(['core']);
const BASELINE_FILE = join(ROOT, FEATURE_OPS, 'scripts', 'check-boundaries.baseline.json');

function surfaceKey(target) {
  const rel = relative(join(ROOT, BACKEND_MODULES), target).split(sep).join('/');
  // `.js` names its `.ts` source, so both are one file. `.mjs`/`.mts` and `.cjs`/`.cts` stay distinct targets.
  return rel
    .replace(/\.[jt]sx?$/, '')
    .replace(/\.mts$/, '.mjs')
    .replace(/\.cts$/, '.cjs');
}

function isApprovedSurface(key) {
  const parts = key.split('/');
  if (parts.length === 1) return true; // the module directory itself resolves to its barrel
  if (APPROVED_SURFACE_MODULES.has(parts[0]) || APPROVED_SURFACE_PATHS.has(key)) return true;
  return parts.length === 2 && APPROVED_SURFACE_NAMES.has(parts[1]);
}

// Every off-surface pair `importing file -> target file` (repository-relative, extension kept as written in the
// import with .js normalised to the resolved path), with the first line it appears on.
function collectOffSurfacePairs() {
  const pairs = new Map();
  const modulesRoot = join(ROOT, BACKEND_MODULES);
  try {
    statSync(modulesRoot);
  } catch {
    return pairs;
  }
  for (const file of walk(modulesRoot)) {
    if (isTestPath(file)) continue;
    const srcSegment = moduleSegment(file);
    for (const { specifier, line, typeOnly } of collectImportSpecifiers(
      file,
      readFileSync(file, 'utf8'),
    )) {
      if (!specifier.startsWith('.')) continue;
      const target = resolve(dirname(file), specifier);
      const targetSegment = moduleSegment(target);
      if (!srcSegment || !targetSegment || srcSegment === targetSegment) continue;
      if (isApprovedSurface(surfaceKey(target))) continue;
      if (typeOnly && TYPE_ONLY_SURFACE_PATHS.has(surfaceKey(target))) continue;
      const pair = `${relative(ROOT, file).split(sep).join('/')} -> ${surfaceKey(target)}`;
      if (!pairs.has(pair)) pairs.set(pair, line);
    }
  }
  return pairs;
}

function loadBaseline() {
  // A fixture tree (FEATURE_PATHS_REPO_ROOT) carries its own baseline at the same repository-relative place, or none.
  const path = BASELINE_FILE;
  if (!existsSync(path)) return { path, pairs: null };
  const { total, pairs } = JSON.parse(readFileSync(path, 'utf8'));
  return { path, total, pairs: new Set(pairs) };
}

function writeBaseline(path, pairs) {
  const sorted = [...pairs].sort();
  writeFileSync(path, `${JSON.stringify({ total: sorted.length, pairs: sorted }, null, 2)}\n`);
}

// Baseline growth against the merge-base (#1675). Skipped on a main push and a manual release run: PRs are the gate, and
// a squash commit has lost the PR commits' trailers. Base: FEATURE_LINT_BASE, as lint-root.mjs.
const GROWTH_TRAILER_KEY = 'Boundary-Baseline-Growth';
const GROWTH_TRAILER_VALUE = /^#\d+[ \t]+\S/;
// Events that run after the PR gate. Any other event compares, so a future trigger is not exempt by default.
const GROWTH_SKIPPED_EVENTS = new Set(['push', 'workflow_dispatch']);

function checkBaselineGrowth(headPairs) {
  if (GROWTH_SKIPPED_EVENTS.has(process.env.GITHUB_EVENT_NAME)) return 0;
  const base = process.env.FEATURE_LINT_BASE || 'origin/main';
  const git = (...args) =>
    execFileSync('git', args, {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  let mergeBase;
  try {
    mergeBase = git('merge-base', base, 'HEAD').trim();
  } catch {
    if (process.env.CI) {
      console.error(
        `[boundary] cannot compare the baseline: no merge-base between ${base} and HEAD (fetch the base ref with full history)`,
      );
      return 1;
    }
    console.log(`boundaries: baseline growth check skipped (no merge-base with ${base})`);
    return 0;
  }
  const rel = relative(ROOT, BASELINE_FILE).split(sep).join('/');
  let baseText;
  try {
    baseText = git('show', `${mergeBase}:${rel}`);
  } catch {
    return 0; // the merge-base has no baseline file: nothing to compare with
  }
  if (headPairs === null) {
    console.error(
      `[boundary] ${rel} exists at the merge-base but is missing here; deleting it would re-freeze every off-surface pair`,
    );
    return 1;
  }
  const basePairs = new Set(JSON.parse(baseText).pairs);
  const added = [...headPairs].filter((pair) => !basePairs.has(pair));
  if (added.length === 0) return 0;
  // git parses the trailer block, so a matching line in the message body does not count.
  const trailers = git(
    'log',
    `--format=%(trailers:key=${GROWTH_TRAILER_KEY},valueonly,unfold)`,
    `${mergeBase}..HEAD`,
  );
  if (trailers.split('\n').some((value) => GROWTH_TRAILER_VALUE.test(value.trim()))) {
    console.log(
      `boundaries: ${added.length} baseline pair(s) added, approved by a Boundary-Baseline-Growth trailer`,
    );
    return 0;
  }
  for (const pair of added) {
    console.error(
      `[boundary] ${rel}: pair added since the merge-base (${pair}); the baseline may only shrink. Import an approved surface instead, or add a commit trailer \`Boundary-Baseline-Growth: #<issue> <reason>\`.`,
    );
  }
  return added.length;
}

function checkOffSurfaceBaseline() {
  const found = collectOffSurfacePairs();
  const { path, total, pairs: baseline } = loadBaseline();
  const flags = new Set(process.argv.slice(2));
  if (flags.has('--init-baseline')) {
    if (baseline !== null) {
      console.error(
        '[boundary] --init-baseline only writes a baseline file that does not exist yet',
      );
      return 1;
    }
    writeBaseline(BASELINE_FILE, found.keys());
    console.log(`boundaries: wrote ${found.size} pairs to ${relative(ROOT, BASELINE_FILE)}`);
    return 0;
  }
  const known = baseline ?? new Set();
  let count = checkBaselineGrowth(baseline);
  if (baseline !== null && total !== baseline.size) {
    count++;
    console.error(
      `[boundary] ${relative(ROOT, path)}: total is ${total} but the baseline lists ${baseline.size} pairs; set total to the number of pairs`,
    );
  }
  for (const [pair, line] of found) {
    if (known.has(pair)) continue;
    count++;
    console.error(
      [
        `[boundary] ${pair.split(' -> ')[0]}:${line}: cross-module import is not an approved surface (${pair});`,
        'import an approved surface of the target module',
        '(docs/02-domain-module-boundaries.md «Approved cross-module surfaces»).',
        'The baseline may only shrink: a pair added relative to the merge-base fails unless a commit carries',
        'a `Boundary-Baseline-Growth: #<issue> <reason>` trailer.',
      ].join(' '),
    );
  }
  const stale = [...known].filter((pair) => !found.has(pair));
  if (flags.has('--shrink-baseline') && stale.length > 0) {
    writeBaseline(
      path,
      [...known].filter((pair) => found.has(pair)),
    );
    console.log(`boundaries: removed ${stale.length} stale pair(s) from ${relative(ROOT, path)}`);
    return count;
  }
  for (const pair of stale) {
    count++;
    console.error(
      [
        `[boundary] ${relative(ROOT, path)}: baseline pair no longer exists (${pair}); delete the line`,
        '(run `pnpm --filter @ap/platform-api-ops check:boundaries -- --shrink-baseline`) so the baseline only shrinks',
      ].join(' '),
    );
  }
  return count;
}
violations += checkOffSurfaceBaseline();

// Rule 11, manifest half: own feature identities and @ap/ui are runtime dependencies; only the core server also permits contract-schemas (ADR-0097). Every manifest that can reach the
// product's runtime graph is read: the feature tool package (ops/platform-api) and each feature app and package
// from the path map (never the platform's own apps/* and packages/*); peer and optional dependencies count as runtime.
const RUNTIME_DEP_FIELDS = ['dependencies', 'peerDependencies', 'optionalDependencies'];
const manifests = [
  join(ROOT, FEATURE_OPS, 'package.json'),
  ...[FEATURE_BACKEND, FEATURE_FRONTEND, FEATURE_SHARED, FEATURE_UI, FEATURE_OPS].map((dir) =>
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
        !(
          manifest === join(ROOT, FEATURE_BACKEND, 'package.json') && dep === '@ap/contract-schemas'
        )
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
