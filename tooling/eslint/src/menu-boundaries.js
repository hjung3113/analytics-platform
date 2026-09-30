import path from 'node:path';

import { findOwningPackage } from './relative-escape.js';
import { PACKAGE_PREFIX } from './prefix.js';

function repoRelative(filePath, root) {
  return path.relative(root, filePath).split(path.sep).join('/');
}

function sourceLiteral(node) {
  const source = node?.source;
  return source?.type === 'Literal' && typeof source.value === 'string' ? source : null;
}

function importTypeLiteral(node) {
  const candidate = node.source ?? node.argument;
  if (!candidate) return null;
  const literal = candidate.type === 'TSLiteralType' ? candidate.literal : candidate;
  return literal?.type === 'Literal' && typeof literal.value === 'string' ? literal : null;
}

function isInsideMock(relativeFile) {
  return relativeFile === 'src/mock' || relativeFile.startsWith('src/mock/');
}

function resolvesIntoMock(source, fileDir, packageRoot) {
  if (!source.value.startsWith('.')) return false;
  const resolved = path.resolve(fileDir, source.value);
  const mockRoot = path.join(packageRoot, 'src', 'mock');
  return resolved === mockRoot || resolved.startsWith(`${mockRoot}${path.sep}`);
}

// Mock handlers form a closed dependency graph: their relative imports may resolve only
// into the mock subtree, this menu's endpoints module, or (temporarily — productivity moved
// to src/mock in step 5 but jobs-population still reads cycleData — until the cycle-time
// compute moves in step 9) the pages subtree. Anything else — `../api`, `../index`,
// `../../package.json`, `../styles.css` — would pull menu internals into the handler graph.
const MOCK_RELATIVE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts'];

function mockRelativeAllowed(source, fileDir, packageRoot) {
  const resolved = path.resolve(fileDir, source.value);
  const inside = (root) => resolved === root || resolved.startsWith(`${root}${path.sep}`);
  const endpointsModule = path.join(packageRoot, 'src', 'endpoints');
  return (
    inside(path.join(packageRoot, 'src', 'mock')) ||
    inside(path.join(packageRoot, 'src', 'pages')) ||
    resolved === endpointsModule ||
    MOCK_RELATIVE_EXTENSIONS.some((extension) => resolved === `${endpointsModule}${extension}`)
  );
}

const noMenuMockImport = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Mock handlers are importable only via the menu mock subpath, and their own relative imports stay inside the mock allowlist',
    },
    schema: [],
    messages: {
      outsideMock:
        "Menu pages must not import mock handlers; the app registers them via '{{mockSubpath}}'.",
      mockRelative: `Mock handlers may relatively import only src/mock/**, this menu's src/endpoints, or (temporarily) src/pages/** — not '{{source}}'. Mock handlers import '${PACKAGE_PREFIX}mock-server' and '${PACKAGE_PREFIX}contracts' directly, not menu internals like ../api.`,
    },
  },
  create(context) {
    const owner = findOwningPackage(path.dirname(context.filename));
    if (!owner) return {};

    const relativeFile = repoRelative(context.filename, owner.root);
    const fileDir = path.dirname(context.filename);
    const menuName = owner.name.slice(PACKAGE_PREFIX.length);

    // One visitor set for both directions so static, re-export, export *, dynamic
    // import(), require, typeof import, and import-equals can never drift apart.
    const visitors = (check) => ({
      ImportDeclaration: (node) => check(sourceLiteral(node)),
      ExportNamedDeclaration: (node) => check(sourceLiteral(node)),
      ExportAllDeclaration: (node) => check(sourceLiteral(node)),
      ImportExpression: (node) => check(node.source?.type === 'Literal' ? node.source : null),
      CallExpression(node) {
        if (node.callee?.type !== 'Identifier' || node.callee.name !== 'require') return;
        const source = node.arguments[0];
        check(source?.type === 'Literal' && typeof source.value === 'string' ? source : null);
      },
      TSImportType: (node) => check(importTypeLiteral(node)),
      TSImportEqualsDeclaration(node) {
        const ref = node.moduleReference;
        const source = ref?.type === 'TSExternalModuleReference' ? ref.expression : null;
        check(source?.type === 'Literal' && typeof source.value === 'string' ? source : null);
      },
    });

    // Inside src/mock/**: relative imports must resolve into the mock allowlist.
    if (isInsideMock(relativeFile)) {
      const check = (source) => {
        if (!source || !source.value.startsWith('.')) return;
        if (mockRelativeAllowed(source, fileDir, owner.root)) return;
        context.report({ node: source, messageId: 'mockRelative', data: { source: source.value } });
      };
      return visitors(check);
    }

    // Everywhere else: nothing may reach src/mock/**; the app registers handlers
    // through the menu mock subpath.
    const check = (source) => {
      if (!source || !resolvesIntoMock(source, fileDir, owner.root)) return;
      context.report({
        node: source,
        messageId: 'outsideMock',
        data: { mockSubpath: `${PACKAGE_PREFIX}${menuName}/mock` },
      });
    };
    return visitors(check);
  },
};

function sourcePointsToApi(source, fileDir, packageRoot) {
  if (!source?.value.startsWith('.')) return false;
  const resolved = path.resolve(fileDir, source.value);
  const apiModule = path.join(packageRoot, 'src', 'api');
  return (
    resolved === apiModule ||
    ['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts'].some((extension) => resolved === `${apiModule}${extension}`)
  );
}

function nodeName(node) {
  if (!node) return null;
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'Literal' && typeof node.value === 'string') return node.value;
  return null;
}

const noNewServe = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Prevent new menu pages from importing serve during the menu-query migration',
    },
    schema: [
      {
        type: 'object',
        properties: {
          legacyPaths: { type: 'array', items: { type: 'string' } },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      noNewServe:
        "Do not add a serve import from this menu's api module during migration; register handlers through '{{mockSubpath}}'.",
      noApiNamespace:
        "Do not namespace- or dynamically import this menu's api module during migration; use named imports (serve is being removed). Register handlers through '{{mockSubpath}}'.",
    },
  },
  create(context) {
    const owner = findOwningPackage(path.dirname(context.filename));
    if (!owner) return {};

    const relativeFile = repoRelative(context.filename, owner.root);
    if (relativeFile === 'src/api.ts') return {};
    const legacyPaths = new Set(context.options[0]?.legacyPaths ?? []);
    // Legacy keys are package-qualified (`menu-home/src/pages/x.tsx`) so two menus can
    // reuse a filename without one inheriting the other's exemption.
    const legacy = legacyPaths.has(`${owner.name.slice(PACKAGE_PREFIX.length)}/${relativeFile}`);

    const fileDir = path.dirname(context.filename);
    const menuName = owner.name.slice(PACKAGE_PREFIX.length);
    const mockSubpath = `${PACKAGE_PREFIX}${menuName}/mock`;
    const isApiSource = (node) => sourcePointsToApi(sourceLiteral(node), fileDir, owner.root);
    // Local bindings aliasing this menu's api `serve`, tracked in every file (legacy
    // included): re-exporting or default-exporting the alias relays serve exactly like
    // `export { serve }`, so the export ban follows the binding, not the identifier text.
    // Traversal visits imports before the later statements that export them.
    const serveBindings = new Set();
    const reportServe = (node) => {
      context.report({ node, messageId: 'noNewServe', data: { mockSubpath } });
    };
    const reportApiNamespace = (node) => {
      context.report({ node, messageId: 'noApiNamespace', data: { mockSubpath } });
    };
    // `require('...')` carries its module in arguments[0], not in a `source` property.
    const argumentLiteral = (node) => {
      const arg = node?.arguments?.[0];
      return arg?.type === 'Literal' && typeof arg.value === 'string' ? arg : null;
    };
    // Re-exporting `serve` — from the api module, or a local binding after an import —
    // would relay it to new pages, so export checks apply in legacy files too.
    const serveSpecifier = (node) =>
      (node.specifiers ?? []).find(
        (item) =>
          item.type === 'ExportSpecifier' &&
          (nodeName(item.local) === 'serve' || nodeName(item.exported) === 'serve'),
      );

    return {
      ImportDeclaration(node) {
        if (isApiSource(node)) {
          for (const item of node.specifiers) {
            if (item.type === 'ImportSpecifier' && nodeName(item.imported) === 'serve') {
              serveBindings.add(nodeName(item.local));
            }
          }
        }
        // Legacy files keep their own serve imports; only re-exports stay banned (P2-1).
        if (legacy || !isApiSource(node)) return;
        // Outside the legacy list the api module is named-imports-only; a namespace
        // binding reaches `serve` through `api.serve`, destructuring, or plain passing.
        const namespace = node.specifiers.find((item) => item.type === 'ImportNamespaceSpecifier');
        if (namespace) {
          reportApiNamespace(namespace);
          return;
        }
        const specifier = node.specifiers.find(
          (item) => item.type === 'ImportSpecifier' && nodeName(item.imported) === 'serve',
        );
        if (specifier) reportServe(specifier.imported);
      },
      ExportNamedDeclaration(node) {
        if (!isApiSource(node)) {
          // Local re-export (`export { serve }` / `export { serve as x }` after an
          // import), including any alias of serve.
          const specifier = (node.specifiers ?? []).find(
            (item) =>
              item.type === 'ExportSpecifier' &&
              (nodeName(item.local) === 'serve' || serveBindings.has(nodeName(item.local))),
          );
          if (specifier) reportServe(specifier.local);
          return;
        }
        const specifier = serveSpecifier(node);
        if (specifier) reportServe(specifier.local);
      },
      ExportDefaultDeclaration(node) {
        // `export default <serve alias>` relays serve like a named re-export.
        if (node.declaration?.type !== 'Identifier') return;
        if (serveBindings.has(node.declaration.name)) reportServe(node.declaration);
      },
      // Re-exporting the whole API (`export * from`, `export * as ns from`) would expose
      // its legacy `serve` export too. typescript-estree parses both as ExportAllDeclaration.
      ExportAllDeclaration(node) {
        if (isApiSource(node)) reportServe(node.source);
      },
      ImportExpression(node) {
        if (!legacy && isApiSource(node)) reportApiNamespace(node.source);
      },
      CallExpression(node) {
        if (legacy) return;
        if (node.callee?.type !== 'Identifier' || node.callee.name !== 'require') return;
        const literal = argumentLiteral(node);
        if (sourcePointsToApi(literal, fileDir, owner.root)) reportApiNamespace(literal);
      },
    };
  },
};

export { noMenuMockImport, noNewServe };
